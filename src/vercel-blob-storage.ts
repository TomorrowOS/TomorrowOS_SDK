/**
 * Vercel Blob media storage via `@vercel/blob`.
 * Auto-detects `BLOB_READ_WRITE_TOKEN`; `TOMORROWOS_MEDIA=vercel-blob|blob` makes it required.
 */

export type VercelBlobMode = "off" | "preferred" | "required";

export interface VercelBlobUploadResult {
  url: string;
  pathname: string;
  contentType?: string;
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = String(value || "").trim();
  return trimmed || undefined;
}

export function isVercelHost(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL);
}

/**
 * - `TOMORROWOS_MEDIA=vercel-blob|blob` → required
 * - `BLOB_READ_WRITE_TOKEN` present (and media not forced elsewhere) → preferred
 * - else → off
 */
export function resolveVercelBlobMode(
  env: NodeJS.ProcessEnv = process.env
): VercelBlobMode {
  const media = cleanOptional(env.TOMORROWOS_MEDIA)?.toLowerCase();
  if (
    media === "local" ||
    media === "disk" ||
    media === "filesystem" ||
    media === "cloudinary" ||
    media === "replit" ||
    media === "replit-object-storage" ||
    media === "object-storage" ||
    media === "app-storage"
  ) {
    return "off";
  }
  if (media === "vercel-blob" || media === "blob") {
    return "required";
  }
  if (cleanOptional(env.BLOB_READ_WRITE_TOKEN)) {
    return "preferred";
  }
  return "off";
}

export function resolveVercelBlobToken(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return cleanOptional(env.BLOB_READ_WRITE_TOKEN) || null;
}

export function isVercelBlobConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const mode = resolveVercelBlobMode(env);
  if (mode === "off") return false;
  return !!resolveVercelBlobToken(env);
}

type BlobPut = typeof import("@vercel/blob").put;
type BlobList = typeof import("@vercel/blob").list;

async function loadBlobApi(): Promise<{ put: BlobPut; list: BlobList }> {
  const mod = await import("@vercel/blob");
  return { put: mod.put, list: mod.list };
}

export async function uploadBufferToVercelBlob(
  body: Buffer,
  options: {
    pathname: string;
    token: string;
    contentType?: string;
    addRandomSuffix?: boolean;
  }
): Promise<VercelBlobUploadResult> {
  const { put } = await loadBlobApi();
  const pathname = String(options.pathname || "upload").replace(/^\/+/, "");
  const result = await put(pathname, body, {
    access: "public",
    token: options.token,
    contentType: options.contentType,
    addRandomSuffix: options.addRandomSuffix ?? false,
    multipart: body.length > 4 * 1024 * 1024
  });
  return {
    url: result.url,
    pathname: result.pathname,
    contentType: result.contentType
  };
}

/** Lightweight token / reachability check for CMS status UI. */
export async function pingVercelBlob(token: string): Promise<void> {
  const { list } = await loadBlobApi();
  await list({ limit: 1, token });
}
