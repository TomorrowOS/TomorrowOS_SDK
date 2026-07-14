import fs from "fs/promises";
import path from "path";

import {
  pingCloudinary,
  resolveCloudinaryConfig
} from "./cloudinary-storage.js";
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

function isReplitHost(env: NodeJS.ProcessEnv): boolean {
  return !!(
    env.REPL_ID ||
    env.REPLIT_DEV_DOMAIN ||
    env.REPLIT_DEPLOYMENT ||
    env.REPL_SLUG
  );
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

function resolveDatabaseProvider(env: NodeJS.ProcessEnv): {
  provider: string;
  label: string;
  configured: boolean;
} {
  const driver = String(env.TOMORROWOS_STORE || "").trim().toLowerCase();
  const hasUrl = !!(env.SUPABASE_URL || env.DATABASE_URL);

  if (driver === "supabase" || (!driver && env.SUPABASE_URL)) {
    return {
      provider: "supabase",
      label: "Database",
      configured: !!env.SUPABASE_URL || !!env.DATABASE_URL
    };
  }
  if (driver === "postgres" || (!driver && hasUrl && !env.SUPABASE_URL)) {
    return {
      provider: "postgres",
      label: "Database",
      configured: hasUrl
    };
  }
  if (driver === "memory") {
    return { provider: "memory", label: "Database", configured: true };
  }
  if (driver === "sqlite" || !driver) {
    return { provider: "sqlite", label: "Database", configured: true };
  }
  return {
    provider: driver || "unknown",
    label: "Database",
    configured: hasUrl || driver === "sqlite" || driver === "memory"
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
    meta.provider === "supabase" || meta.provider === "postgres";

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
    if (meta.provider === "memory") {
      return {
        id: "database",
        label: meta.label,
        provider: meta.provider,
        state: "warn",
        detail: "In-memory only — data is lost on restart."
      };
    }
    if (meta.provider === "sqlite" && isReplitHost(env)) {
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
      detail: `${meta.label} reachable`
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
        provider: "cloudinary",
        state: "ok",
        detail: `Cloudinary (${cloudinary.cloudName}) reachable`
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        id: "media",
        label: "Media Server",
        provider: "cloudinary",
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
      provider: "cloudinary",
      state: "error",
      detail:
        "Cloudinary config incomplete — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    };
  }

  const provider = isReplitHost(env) ? "replit-object-storage" : "local";
  const providerLabel =
    provider === "replit-object-storage"
      ? "Replit Object Storage / local uploads"
      : "Local uploads";

  if (!staticRoot) {
    return {
      id: "media",
      label: "Media Server",
      provider,
      state: "missing",
      detail: "No Cloudinary and staticRoot is unset — media uploads are unavailable."
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
      detail: `${providerLabel} writable. Uploads may not survive rebuilds — Cloudinary recommended.`
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
            : "Check SUPABASE_URL / network / SSL (DATABASE_SSL=true). After Publish, confirm the live URL can reach Supabase."
      });
    }

    if (c.id === "media" && c.state === "error") {
      blockers.push({
        connectorId: c.id,
        title: "Media storage not ready",
        message: c.detail,
        fixHint:
          c.provider === "cloudinary"
            ? "Fix Cloudinary Secrets (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) and restart."
            : "Enable Object Storage for public/uploads, or configure Cloudinary for durable media URLs."
      });
    }

    if (c.id === "media" && c.state === "missing") {
      blockers.push({
        connectorId: c.id,
        title: "Media storage not configured",
        message: c.detail,
        fixHint:
          "Set Cloudinary Secrets, or ensure the CMS listens with staticRoot pointing at public/ (uploads folder)."
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
    provider: "tomorrowos",
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
