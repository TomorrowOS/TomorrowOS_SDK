import type { PublishedPlaylistSnapshot } from "./types.js";

/** Drop legacy playlist `version` fields from stored assignment snapshots. */
export function normalizePublishedPlaylistSnapshot(
  value: PublishedPlaylistSnapshot & { version?: unknown }
): PublishedPlaylistSnapshot {
  const { version: _legacyVersion, ...rest } = value;
  return rest;
}
