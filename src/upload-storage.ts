import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";

/** Stable on-disk name: first 16 chars of SHA-256 + original safe filename. */
export function buildContentAddressedName(body: Buffer, safeName: string): string {
  const hash = createHash("sha256").update(body).digest("hex");
  return buildContentAddressedNameFromHash(hash, safeName);
}

export function buildContentAddressedNameFromHash(
  sha256Hex: string,
  safeName: string
): string {
  return `${String(sha256Hex).slice(0, 16)}-${safeName}`;
}

export function contentHashHex(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Write upload once per unique file bytes; reuse existing file when present.
 */
export async function storeUploadIfNeeded(
  uploadsDir: string,
  body: Buffer,
  safeName: string
): Promise<{ storedName: string; deduplicated: boolean; contentHash: string }> {
  const contentHash = contentHashHex(body);
  const storedName = buildContentAddressedName(body, safeName);
  const filePath = path.join(uploadsDir, storedName);

  try {
    const stat = await fs.stat(filePath);
    if (stat.size === body.length) {
      return { storedName, deduplicated: true, contentHash };
    }
  } catch {
    // missing — write below
  }

  await fs.writeFile(filePath, body);
  return { storedName, deduplicated: false, contentHash };
}
