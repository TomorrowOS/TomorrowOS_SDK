import fs from "fs/promises";
import path from "path";

import {
  getReplitObjectStorageClient,
  isReplitHost,
  resolveReplitObjectStorageMode
} from "./replit-object-storage.js";
import {
  pingCloudinary,
  resolveCloudinaryConfig
} from "./cloudinary-storage.js";
import {
  isVercelBlobConfigured,
  pingVercelBlob,
  resolveVercelBlobMode,
  resolveVercelBlobToken
} from "./vercel-blob-storage.js";
import { getSdkPackageVersion } from "./sdk-version.js";
import type { TomorrowOSStore } from "./store/types.js";

export type ConnectorState = "ok" | "warn" | "error" | "missing";

export interface ConnectorStatus {
  id: string;
  label: string;
  provider?: string;
  state: ConnectorState;
  detail: string;
}

export interface StatusBlocker {
  connectorId: string;
  title: string;
  message: string;
  fixHint: string;
}

export interface ServerStatusReport {
  status: "success";
  overall: "ok" | "degraded" | "blocked";
  checkedAt: string;
  /** Installed `@tomorrowos/sdk` version. */
  sdkVersion: string;
  connectors: ConnectorStatus[];
  blockers: StatusBlocker[];
}

export interface BuildServerStatusOptions {
  store: TomorrowOSStore;
  staticRoot?: string | null;
  env?: NodeJS.ProcessEnv;
  probeTimeoutMs?: number;
}

/** Replit Preview/dev often cannot resolve Supabase hosts — not a config error. */
function isReplitPreviewDnsFailure(message: string): boolean {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("enotfound") ||
    m.includes("getaddrinfo") ||
    m.includes("eai_again") ||
    m.includes("can't be resolved") ||
    m.includes("cannot resolve") ||
    m.includes("name or service not known")
  );
}

function isNeonDatabaseUrl(url: string): boolean {
  const u = String(url || "").toLowerCase();
  return (
    u.includes("neon.tech") ||
    u.includes("neon.db") ||
    /\.neon\./.test(u)
  );
}

/**
 * Display name shown next to "Database" in the Control Panel status card.
 * Prefer specific products (Neon / Supabase / Replit Postgres) over generic PostgreSQL.
 */
function resolveDatabaseProvider(env: NodeJS.ProcessEnv): {
  provider: string;
  label: string;
  configured: boolean;
  kind: "supabase" | "postgres" | "sqlite" | "memory" | "unknown";
} {
  const driver = String(env.TOMORROWOS_STORE || "").trim().toLowerCase();
  const supabaseUrl = String(env.SUPABASE_URL || "").trim();
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  const hasUrl = !!(supabaseUrl || databaseUrl);
  const probeUrl = supabaseUrl || databaseUrl;

  if (driver === "supabase" || (!driver && supabaseUrl)) {
    return {
      provider: "Supabase",
      label: "Database",
      configured: hasUrl,
      kind: "supabase"
    };
  }
  if (driver === "postgres" || (!driver && hasUrl && !supabaseUrl)) {
    if (isNeonDatabaseUrl(probeUrl)) {
      return {
        provider: "Neon",
        label: "Database",
        configured: hasUrl,
        kind: "postgres"
      };
    }
    if (isReplitHost(env)) {
      return {
        provider: "Replit Postgres",
        label: "Database",
        configured: hasUrl,
        kind: "postgres"
      };
    }
    return {
      provider: "PostgreSQL",
      label: "Database",
      configured: hasUrl,
      kind: "postgres"
    };
  }
  if (driver === "memory") {
    return {
      provider: "Memory",
      label: "Database",
      configured: true,
      kind: "memory"
    };
  }
  if (driver === "sqlite" || !driver) {
    return {
      provider: "SQLite",
      label: "Database",
      configured: true,
      kind: "sqlite"
    };
  }
  const pretty =
    driver.charAt(0).toUpperCase() + driver.slice(1).toLowerCase();
  return {
    provider: pretty || "Unknown",
    label: "Database",
    configured: hasUrl || driver === "sqlite" || driver === "memory",
    kind: "unknown"
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} probe timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeDatabase(
  store: TomorrowOSStore,
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<ConnectorStatus> {
  const meta = resolveDatabaseProvider(env);
  const wantsRemote =
    meta.kind === "supabase" || meta.kind === "postgres";

  if (wantsRemote && !meta.configured) {
    return {
      id: "database",
      label: meta.label,
      provider: meta.provider,
      state: "missing",
      detail:
        "Connection string not set. Add SUPABASE_URL (preferred) or DATABASE_URL."
    };
  }

  try {
    await withTimeout(store.listPairedDevices(), timeoutMs, meta.label);
    if (meta.kind === "memory") {
      return {
        id: "database",
        label: meta.label,
        provider: meta.provider,
        state: "warn",
        detail: "In-memory only — data is lost on restart."
      };
    }
    if (meta.kind === "sqlite" && isReplitHost(env)) {
      return {
        id: "database",
        label: meta.label,
        provider: meta.provider,
        state: "warn",
        detail:
          "SQLite works for demos; pairings may reset on rebuild. Prefer Supabase for production."
      };
    }
    return {
      id: "database",
      label: meta.label,
      provider: meta.provider,
      state: "ok",
      detail: `${meta.provider} reachable`
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      isReplitHost(env) &&
      wantsRemote &&
      isReplitPreviewDnsFailure(message)
    ) {
      return {
        id: "database",
        label: meta.label,
        provider: meta.provider,
        state: "warn",
        detail:
          "Replit Preview cannot verify this connection (DNS ENOTFOUND to Supabase is common in preview). Secrets are configured — confirm on the published live URL after Publish, not in Preview."
      };
    }
    return {
      id: "database",
      label: meta.label,
      provider: meta.provider,
      state: "error",
      detail: message
    };
  }
}

async function probeMedia(
  staticRoot: string | null | undefined,
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<ConnectorStatus> {
  const cloudinary = resolveCloudinaryConfig(env);
  if (cloudinary) {
    try {
      await withTimeout(pingCloudinary(cloudinary), timeoutMs, "Cloudinary");
      return {
        id: "media",
        label: "Media Server",
        provider: "Cloudinary",
        state: "ok",
        detail: `Cloudinary (${cloudinary.cloudName}) reachable`
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        id: "media",
        label: "Media Server",
        provider: "Cloudinary",
        state: "error",
        detail: message
      };
    }
  }

  const hasPartialCloudinary = !!(
    env.CLOUDINARY_CLOUD_NAME ||
    env.CLOUDINARY_API_KEY ||
    env.CLOUDINARY_API_SECRET
  );
  if (hasPartialCloudinary) {
    return {
      id: "media",
      label: "Media Server",
      provider: "Cloudinary",
      state: "error",
      detail:
        "Cloudinary config incomplete — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    };
  }

  const blobMode = resolveVercelBlobMode(env);
  if (blobMode !== "off") {
    const token = resolveVercelBlobToken(env);
    if (!token) {
      return {
        id: "media",
        label: "Media Server",
        provider: "Blob",
        state: "error",
        detail:
          "Vercel Blob required but BLOB_READ_WRITE_TOKEN is not set. Link a Blob store to this Vercel project."
      };
    }
    try {
      await withTimeout(pingVercelBlob(token), timeoutMs, "Blob");
      return {
        id: "media",
        label: "Media Server",
        provider: "Blob",
        state: "ok",
        detail: "Blob reachable"
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (blobMode === "required" || isVercelBlobConfigured(env)) {
        return {
          id: "media",
          label: "Media Server",
          provider: "Blob",
          state: "error",
          detail: message
        };
      }
      // preferred but ping failed: fall through
    }
  }

  const rosMode = resolveReplitObjectStorageMode(env);
  if (rosMode !== "off") {
    try {
      const ros = await getReplitObjectStorageClient(env);
      if (ros) {
        await ros.ping();
        return {
          id: "media",
          label: "Media Server",
          provider: "Replit Object Storage",
          state: "ok",
          detail: "Replit Object Storage reachable"
        };
      }
      if (rosMode === "required") {
        return {
          id: "media",
          label: "Media Server",
          provider: "Replit Object Storage",
          state: "error",
          detail:
            "TOMORROWOS_MEDIA requires Replit Object Storage but no client is available. Link an App Storage bucket and install @replit/object-storage."
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (rosMode === "required") {
        return {
          id: "media",
          label: "Media Server",
          provider: "Replit Object Storage",
          state: "error",
          detail: message
        };
      }
      // preferred: fall through to local disk probe
    }
  }

  const onReplit = isReplitHost(env);
  const provider = onReplit ? "Replit Object Storage" : "Local";
  const providerLabel = onReplit
    ? "Local uploads (Object Storage not active)"
    : "Local uploads";

  if (!staticRoot) {
    return {
      id: "media",
      label: "Media Server",
      provider,
      state: "missing",
      detail: "No durable media backend and staticRoot is unset — uploads unavailable."
    };
  }

  const uploadsDir = path.join(path.resolve(staticRoot), "uploads");
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.access(uploadsDir);
    return {
      id: "media",
      label: "Media Server",
      provider,
      state: "warn",
      detail: `${providerLabel} at ${uploadsDir}. Prefer Cloudinary, Blob, or Replit Object Storage for production.`
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: "media",
      label: "Media Server",
      provider,
      state: "error",
      detail: `Uploads directory not writable (${uploadsDir}): ${message}`
    };
  }
}

function buildBlockers(connectors: ConnectorStatus[]): StatusBlocker[] {
  const blockers: StatusBlocker[] = [];

  for (const c of connectors) {
    if (c.id === "database" && (c.state === "missing" || c.state === "error")) {
      blockers.push({
        connectorId: c.id,
        title: `${c.label} not connected`,
        message: c.detail,
        fixHint:
          c.state === "missing"
            ? "Paste your Supabase Postgres connection string as Secret SUPABASE_URL, set TOMORROWOS_STORE=supabase, then restart the CMS."
            : "Check SUPABASE_URL / DATABASE_URL / network / SSL (DATABASE_SSL=true). After Publish, confirm the live URL can reach the database."
      });
    }

    if (c.id === "media" && c.state === "error") {
      const provider = String(c.provider || "");
      blockers.push({
        connectorId: c.id,
        title: "Media storage not ready",
        message: c.detail,
        fixHint:
          provider === "Cloudinary"
            ? "Fix Cloudinary Secrets (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) and restart."
            : provider === "Blob"
              ? "Link a Vercel Blob store, set BLOB_READ_WRITE_TOKEN (and TOMORROWOS_MEDIA=vercel-blob), then redeploy."
              : provider === "Replit Object Storage"
                ? "Link a Replit App Storage bucket, set TOMORROWOS_MEDIA=replit-object-storage, ensure @replit/object-storage is installed, then restart."
                : "Configure Cloudinary, Vercel Blob, or Replit Object Storage for durable media URLs."
      });
    }

    if (c.id === "media" && c.state === "missing") {
      blockers.push({
        connectorId: c.id,
        title: "Media storage not configured",
        message: c.detail,
        fixHint:
          "Set Cloudinary, Vercel Blob (BLOB_READ_WRITE_TOKEN), or ensure the CMS listens with staticRoot pointing at public/ / cms-panel/."
      });
    }
  }

  return blockers;
}

function overallFrom(
  connectors: ConnectorStatus[]
): ServerStatusReport["overall"] {
  const hardFail = connectors.some(
    (c) =>
      (c.id === "database" || c.id === "media") &&
      (c.state === "error" || c.state === "missing")
  );
  if (hardFail) return "blocked";
  if (connectors.some((c) => c.state === "warn")) return "degraded";
  return "ok";
}

export async function buildServerStatus(
  options: BuildServerStatusOptions
): Promise<ServerStatusReport> {
  const env = options.env ?? process.env;
  const timeoutMs = options.probeTimeoutMs ?? 5000;

  const server: ConnectorStatus = {
    id: "server",
    label: "Server",
    provider: "TomorrowOS",
    state: "ok",
    detail: "CMS process is running"
  };

  const [database, media] = await Promise.all([
    probeDatabase(options.store, env, timeoutMs),
    probeMedia(options.staticRoot, env, timeoutMs)
  ]);

  const connectors = [server, database, media];
  const blockers = buildBlockers(connectors);
  const overall = overallFrom(connectors);

  return {
    status: "success",
    overall,
    checkedAt: new Date().toISOString(),
    sdkVersion: getSdkPackageVersion(),
    connectors,
    blockers
  };
}
