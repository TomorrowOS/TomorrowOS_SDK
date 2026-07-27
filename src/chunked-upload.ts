import { createHash, randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

/** Keep each proxy request well under typical host/body limits (Replit 413). */
export const MEDIA_UPLOAD_CHUNK_BYTES = 1 * 1024 * 1024;

const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ChunkedUploadMeta {
  uploadId: string;
  filename: string;
  mimeType?: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  createdAt: string;
  received: number[];
}

export function isValidUploadId(uploadId: string): boolean {
  return UPLOAD_ID_RE.test(String(uploadId || "").trim());
}

/**
 * Chunk parts live in OS temp — not under staticRoot/public.
 * Replit Object Storage mounts often reject or "Not found" writes to
 * ad-hoc dirs like public/.upload-tmp while still allowing public/uploads.
 */
export function chunkedUploadRoot(_staticRoot?: string): string {
  return path.join(os.tmpdir(), "tomorrowos-upload-tmp");
}

export function chunkedUploadDir(staticRoot: string, uploadId: string): string {
  if (!isValidUploadId(uploadId)) {
    throw new Error("Invalid uploadId");
  }
  return path.join(chunkedUploadRoot(staticRoot), uploadId);
}

export async function initChunkedUpload(
  staticRoot: string,
  options: { filename: string; size: number; mimeType?: string }
): Promise<ChunkedUploadMeta> {
  const size = Number(options.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("size must be a positive number");
  }
  if (size > 20 * 1024 * 1024 * 1024) {
    throw new Error("File too large (max 20GB)");
  }

  const uploadId = randomUUID();
  const chunkSize = MEDIA_UPLOAD_CHUNK_BYTES;
  const totalChunks = Math.ceil(size / chunkSize);
  const meta: ChunkedUploadMeta = {
    uploadId,
    filename: options.filename,
    mimeType: options.mimeType,
    size,
    chunkSize,
    totalChunks,
    createdAt: new Date().toISOString(),
    received: []
  };

  const dir = chunkedUploadDir(staticRoot, uploadId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta), "utf8");
  return meta;
}

export async function readChunkedUploadMeta(
  staticRoot: string,
  uploadId: string
): Promise<ChunkedUploadMeta> {
  const dir = chunkedUploadDir(staticRoot, uploadId);
  const raw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
  return JSON.parse(raw) as ChunkedUploadMeta;
}

async function writeChunkedUploadMeta(
  staticRoot: string,
  meta: ChunkedUploadMeta
): Promise<void> {
  const dir = chunkedUploadDir(staticRoot, meta.uploadId);
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta), "utf8");
}

export async function storeChunkedUploadPart(
  staticRoot: string,
  uploadId: string,
  index: number,
  body: Buffer
): Promise<ChunkedUploadMeta> {
  const meta = await readChunkedUploadMeta(staticRoot, uploadId);
  if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) {
    throw new Error(`Invalid chunk index ${index}`);
  }

  const expected =
    index === meta.totalChunks - 1
      ? meta.size - meta.chunkSize * (meta.totalChunks - 1)
      : meta.chunkSize;
  if (body.length !== expected) {
    throw new Error(
      `Chunk ${index} size mismatch (got ${body.length}, expected ${expected})`
    );
  }

  const dir = chunkedUploadDir(staticRoot, uploadId);
  const partPath = path.join(dir, `part-${String(index).padStart(6, "0")}`);
  await fs.writeFile(partPath, body);

  if (!meta.received.includes(index)) {
    meta.received.push(index);
    meta.received.sort((a, b) => a - b);
    await writeChunkedUploadMeta(staticRoot, meta);
  }
  return meta;
}

export async function assembleChunkedUpload(
  staticRoot: string,
  uploadId: string
): Promise<{ filePath: string; sha256: string; bytes: number; meta: ChunkedUploadMeta }> {
  const meta = await readChunkedUploadMeta(staticRoot, uploadId);
  if (meta.received.length !== meta.totalChunks) {
    throw new Error(
      `Upload incomplete (${meta.received.length}/${meta.totalChunks} chunks)`
    );
  }

  const dir = chunkedUploadDir(staticRoot, uploadId);
  const assembledPath = path.join(dir, "assembled.bin");
  const hash = createHash("sha256");
  await fs.writeFile(assembledPath, Buffer.alloc(0));

  for (let i = 0; i < meta.totalChunks; i += 1) {
    const partPath = path.join(dir, `part-${String(i).padStart(6, "0")}`);
    const data = await fs.readFile(partPath);
    hash.update(data);
    await fs.appendFile(assembledPath, data);
  }

  const stat = await fs.stat(assembledPath);
  if (stat.size !== meta.size) {
    throw new Error(
      `Assembled size mismatch (got ${stat.size}, expected ${meta.size})`
    );
  }

  return {
    filePath: assembledPath,
    sha256: hash.digest("hex"),
    bytes: stat.size,
    meta
  };
}

export async function cleanupChunkedUpload(
  staticRoot: string,
  uploadId: string
): Promise<void> {
  if (!isValidUploadId(uploadId)) return;
  const dir = chunkedUploadDir(staticRoot, uploadId);
  await fs.rm(dir, { recursive: true, force: true });
}

/** Best-effort: drop unfinished uploads older than maxAgeMs. */
export async function cleanupStaleChunkedUploads(
  staticRoot: string,
  maxAgeMs = 6 * 60 * 60 * 1000
): Promise<void> {
  const root = chunkedUploadRoot(staticRoot);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of entries) {
    if (!isValidUploadId(name)) continue;
    const metaPath = path.join(root, name, "meta.json");
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const meta = JSON.parse(raw) as ChunkedUploadMeta;
      const created = Date.parse(meta.createdAt);
      if (!Number.isFinite(created) || now - created > maxAgeMs) {
        await fs.rm(path.join(root, name), { recursive: true, force: true });
      }
    } catch {
      await fs.rm(path.join(root, name), { recursive: true, force: true });
    }
  }
}
