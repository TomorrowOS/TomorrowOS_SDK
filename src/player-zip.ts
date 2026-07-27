import type http from "http";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const DEFAULT_BRIGHTSIGN_ZIP_URL =
  "https://tmr.sh/app/brightsign/TomorrowOS_BrightSign.zip";
const MOTHER_ZIP_CACHE_TTL_MS = 60 * 60 * 1000;

let motherZipCache: {
  source: string;
  bytes: Uint8Array;
  fetchedAt: number;
} | null = null;

/** Public CMS origin from the download request (e.g. https://testcms2.replit.app/). */
export function resolveRequestCmsOrigin(req: http.IncomingMessage): string {
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || String(req.headers.host || "").trim();
  if (!host) {
    throw new Error("Cannot resolve CMS host from request");
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  let proto = forwardedProto === "https" || forwardedProto === "http"
    ? forwardedProto
    : "http";

  const hostname = host.split(":")[0];
  if (!forwardedProto && /\.replit\.app$/i.test(hostname)) {
    proto = "https";
  }

  return `${proto}://${host}`.replace(/\/+$/, "") + "/";
}

function brightSignMotherZipUrl(): string {
  const fromEnv = String(process.env.TOMORROWOS_BRIGHTSIGN_ZIP_URL || "").trim();
  return fromEnv || DEFAULT_BRIGHTSIGN_ZIP_URL;
}

async function loadBrightSignMotherZip(): Promise<Uint8Array> {
  const source = brightSignMotherZipUrl();
  const now = Date.now();
  if (
    motherZipCache &&
    motherZipCache.source === source &&
    now - motherZipCache.fetchedAt < MOTHER_ZIP_CACHE_TTL_MS
  ) {
    return motherZipCache.bytes;
  }

  const res = await fetch(source, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to fetch BrightSign zip (${res.status}): ${source}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  motherZipCache = { source, bytes, fetchedAt: now };
  return bytes;
}

function findConfigJsKey(entries: Record<string, Uint8Array>): string | null {
  const keys = Object.keys(entries);
  const exact = keys.find((k) => k === "config.js" || k.endsWith("/config.js"));
  if (exact) return exact;
  return (
    keys.find((k) => /(^|\/)config\.js$/i.test(k) && !k.includes("__MACOSX")) ||
    null
  );
}

function extractOrientation(configText: string): string {
  const match = configText.match(/orientation:\s*["']([^"']+)["']/);
  const value = String(match?.[1] || "landscape").trim();
  return value || "landscape";
}

function escapeJsString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

export function buildBrightSignConfigJs(
  cmsEndpoint: string,
  orientation = "landscape"
): string {
  const endpoint = escapeJsString(cmsEndpoint);
  const orient = escapeJsString(orientation);
  return `/**
 * BrightSign player boot configuration.
 * Edit cmsEndpoint and orientation before deploying to the player.
 */
window.TOMORROWOS_CONFIG = {
  /** HTTP or HTTPS CMS URL (converted to ws:// / wss:// at runtime). */
  cmsEndpoint: "${endpoint}",
  /** landscape | portrait-right | portrait-left */
  orientation: "${orient}"
};
`;
}

/** Fetch mother zip, inject cmsEndpoint into config.js, return zip bytes. */
export async function buildBrightSignZipWithCmsEndpoint(
  cmsEndpoint: string
): Promise<Uint8Array> {
  const mother = await loadBrightSignMotherZip();
  const entries = unzipSync(mother);
  const configKey = findConfigJsKey(entries);
  if (!configKey) {
    throw new Error("BrightSign zip is missing config.js");
  }

  const previous = strFromU8(entries[configKey]);
  const orientation = extractOrientation(previous);
  entries[configKey] = strToU8(buildBrightSignConfigJs(cmsEndpoint, orientation));

  return zipSync(entries, { level: 6 });
}
