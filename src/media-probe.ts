/**
 * Video duration from file bytes (no ffprobe).
 * MP4/MOV: ISO BMFF box walk (moov/mvhd only — never scans inside mdat).
 * WebM: Duration element in the file header region only.
 */

function isVideoFilename(name: string): boolean {
  const lower = String(name || "").toLowerCase();
  return /\.(mp4|m4v|mov|webm|mkv|avi)$/.test(lower);
}

function clampDurationMs(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(3600 * 1000, Math.max(1000, Math.round(ms)));
}

type BoxBounds = {
  type: string;
  contentStart: number;
  end: number;
};

function readBoxBounds(buf: Buffer, offset: number): BoxBounds | null {
  if (offset + 8 > buf.length) return null;

  let size = buf.readUInt32BE(offset);
  const type = buf.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;

  if (size === 1) {
    if (offset + 16 > buf.length) return null;
    const sizeBig = buf.readBigUInt64BE(offset + 8);
    if (sizeBig < BigInt(headerSize)) return null;
    if (sizeBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      // Box larger than JS can index; still validate against buffer length.
      const endBig = BigInt(offset) + sizeBig;
      if (endBig > BigInt(buf.length)) return null;
      size = buf.length - offset;
    } else {
      size = Number(sizeBig);
    }
    headerSize = 16;
  } else if (size === 0) {
    size = buf.length - offset;
  }

  if (size < headerSize) return null;
  const end = offset + size;
  if (end > buf.length) return null;

  return { type, contentStart: offset + headerSize, end };
}

function parseMvhdDurationMs(buf: Buffer, contentStart: number, boxEnd: number): number | null {
  if (contentStart + 4 > boxEnd) return null;
  const version = buf[contentStart];
  if (version === 0) {
    if (contentStart + 28 > boxEnd) return null;
    const timescale = buf.readUInt32BE(contentStart + 20);
    const duration = buf.readUInt32BE(contentStart + 24);
    if (timescale <= 0 || duration <= 0) return null;
    return (duration / timescale) * 1000;
  }
  if (version === 1) {
    if (contentStart + 40 > boxEnd) return null;
    const timescale = buf.readUInt32BE(contentStart + 28);
    const durationHi = buf.readUInt32BE(contentStart + 32);
    const durationLo = buf.readUInt32BE(contentStart + 36);
    const duration = durationHi * 2 ** 32 + durationLo;
    if (timescale <= 0 || duration <= 0) return null;
    return (duration / timescale) * 1000;
  }
  return null;
}

function findMvhdDurationInContainer(buf: Buffer, start: number, end: number): number | null {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBoxBounds(buf, offset);
    if (!box || box.end > end) break;

    if (box.type === "mvhd") {
      const ms = parseMvhdDurationMs(buf, box.contentStart, box.end);
      if (ms != null) return ms;
    }

    // moov/trak/mdia/minf/stbl can nest further boxes; only recurse into containers.
    if (
      box.type === "moov" ||
      box.type === "trak" ||
      box.type === "mdia" ||
      box.type === "minf" ||
      box.type === "stbl"
    ) {
      const nested = findMvhdDurationInContainer(buf, box.contentStart, box.end);
      if (nested != null) return nested;
    }

    offset = box.end;
  }
  return null;
}

/** Walk top-level ISO boxes; skip mdat without scanning its payload. */
function probeMp4DurationMs(buf: Buffer): number | null {
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const box = readBoxBounds(buf, offset);
    if (!box) break;

    if (box.type === "moov") {
      const ms = findMvhdDurationInContainer(buf, box.contentStart, box.end);
      if (ms != null) return clampDurationMs(ms);
    }

    offset = box.end;
  }
  return null;
}

const WEBM_HEADER_PROBE_BYTES = 512 * 1024;

function probeWebmDurationMs(buf: Buffer): number | null {
  const header = buf.subarray(0, Math.min(buf.length, WEBM_HEADER_PROBE_BYTES));
  const marker = Buffer.from([0x44, 0x89]);
  let searchFrom = 0;
  while (searchFrom < header.length - 12) {
    const idx = header.indexOf(marker, searchFrom);
    if (idx < 0) break;
    const sizePos = idx + 2;
    if (sizePos + 9 > header.length) break;
    const size = header[sizePos];
    if (size === 0x84 && sizePos + 9 <= header.length) {
      const duration = header.readFloatBE(sizePos + 1);
      if (Number.isFinite(duration) && duration > 0) {
        return clampDurationMs(duration);
      }
    }
    searchFrom = idx + 2;
  }
  return null;
}

export function probeVideoDurationMs(
  body: Buffer,
  filename: string
): number | null {
  if (!body?.length || !isVideoFilename(filename)) return null;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webm")) {
    return probeWebmDurationMs(body) ?? probeMp4DurationMs(body);
  }
  return probeMp4DurationMs(body) ?? probeWebmDurationMs(body);
}
