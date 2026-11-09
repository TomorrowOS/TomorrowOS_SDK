import { readFileSync, renameSync } from "fs";
import { readFile, rename } from "fs/promises";
import path from "path";
import type { ScreenTagState, TomorrowOSStore } from "./types.js";

export const LEGACY_SCREEN_TAGS_FILE = "screen-tags.json";
export const LEGACY_SCREEN_REFERENCES_FILE = "screen-references.json";

const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const REFERENCE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_REFERENCE_KEYS = 32;
const MAX_REFERENCE_VALUE_LENGTH = 500;

export interface LegacyScreenFileSink {
  readScreenTagState(): Promise<ScreenTagState>;
  writeScreenTagState(state: ScreenTagState): Promise<void>;
  readScreenReferences(): Promise<Record<string, Record<string, string>>>;
  writeScreenReferences(devices: Record<string, Record<string, string>>): Promise<void>;
}

const importsByStore = new WeakMap<TomorrowOSStore, Promise<void>>();

function normalizeTagList(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const tag = String(part ?? "").trim().toLowerCase();
    if (!TAG_PATTERN.test(tag) || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function parseReferenceObject(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_REFERENCE_KEYS) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    const name = key.trim();
    if (!REFERENCE_KEY_PATTERN.test(name) || typeof value !== "string") return {};
    const text = value.trim();
    if (!text || text.length > MAX_REFERENCE_VALUE_LENGTH) return {};
    out[name] = text;
  }
  return out;
}

function parseTagFile(raw: string): ScreenTagState {
  const parsed = JSON.parse(raw) as { devices?: unknown; catalog?: unknown };
  const devices: Record<string, string[]> = {};
  if (parsed.devices && typeof parsed.devices === "object" && !Array.isArray(parsed.devices)) {
    for (const [deviceId, tags] of Object.entries(parsed.devices)) {
      const list = normalizeTagList(tags);
      if (list.length > 0) devices[deviceId] = list;
    }
  }
  const catalog = normalizeTagList(parsed.catalog);
  for (const tags of Object.values(devices)) {
    for (const tag of tags) {
      if (!catalog.includes(tag)) catalog.push(tag);
    }
  }
  catalog.sort();
  return { catalog, devices };
}

function parseReferenceFile(raw: string): Record<string, Record<string, string>> {
  const parsed = JSON.parse(raw) as { devices?: unknown };
  const devices: Record<string, Record<string, string>> = {};
  if (!parsed.devices || typeof parsed.devices !== "object" || Array.isArray(parsed.devices)) {
    return devices;
  }
  for (const [deviceId, references] of Object.entries(parsed.devices)) {
    const parsedReferences = parseReferenceObject(references);
    if (Object.keys(parsedReferences).length > 0) devices[deviceId] = parsedReferences;
  }
  return devices;
}

function tagStateIsEmpty(state: ScreenTagState): boolean {
  return state.catalog.length === 0 && Object.keys(state.devices).length === 0;
}

function readTextSync(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export function archiveLegacyFileSync(filePath: string): void {
  const archived = `${filePath}.imported`;
  try {
    renameSync(filePath, archived);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    if (code === "EEXIST") {
      renameSync(filePath, `${filePath}.imported.${Date.now()}`);
      return;
    }
    throw err;
  }
}

export async function archiveLegacyFile(filePath: string): Promise<void> {
  const archived = `${filePath}.imported`;
  try {
    await rename(filePath, archived);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    if (code === "EEXIST") {
      await rename(filePath, `${filePath}.imported.${Date.now()}`);
      return;
    }
    throw err;
  }
}

export function readLegacyScreenTagsSync(directory: string): ScreenTagState | null {
  const raw = readTextSync(path.join(directory, LEGACY_SCREEN_TAGS_FILE));
  return raw === null ? null : parseTagFile(raw);
}

export function readLegacyScreenReferencesSync(
  directory: string
): Record<string, Record<string, string>> | null {
  const raw = readTextSync(path.join(directory, LEGACY_SCREEN_REFERENCES_FILE));
  return raw === null ? null : parseReferenceFile(raw);
}

async function readLegacyScreenTags(directory: string): Promise<ScreenTagState | null> {
  const raw = await readText(path.join(directory, LEGACY_SCREEN_TAGS_FILE));
  return raw === null ? null : parseTagFile(raw);
}

async function readLegacyScreenReferences(
  directory: string
): Promise<Record<string, Record<string, string>> | null> {
  const raw = await readText(path.join(directory, LEGACY_SCREEN_REFERENCES_FILE));
  return raw === null ? null : parseReferenceFile(raw);
}

export async function importLegacyScreenFiles(
  store: TomorrowOSStore,
  directory: string,
  sink: LegacyScreenFileSink
): Promise<void> {
  const existing = importsByStore.get(store);
  if (existing) return existing;

  const job = (async () => {
    const tags = await readLegacyScreenTags(directory);
    if (tags && tagStateIsEmpty(await sink.readScreenTagState())) {
      await sink.writeScreenTagState(tags);
      await archiveLegacyFile(path.join(directory, LEGACY_SCREEN_TAGS_FILE));
    }

    const references = await readLegacyScreenReferences(directory);
    if (references && Object.keys(await sink.readScreenReferences()).length === 0) {
      await sink.writeScreenReferences(references);
      await archiveLegacyFile(path.join(directory, LEGACY_SCREEN_REFERENCES_FILE));
    }
  })();

  importsByStore.set(store, job);
  return job;
}

export async function ensureStoreLegacyScreenData(
  store: TomorrowOSStore,
  directory: string
): Promise<void> {
  const owner = store as TomorrowOSStore & {
    loadLegacyScreenFiles?: () => Promise<void>;
  };
  if (typeof owner.loadLegacyScreenFiles === "function") {
    await owner.loadLegacyScreenFiles();
    return;
  }
  await importLegacyScreenFiles(store, directory, {
    readScreenTagState: () => store.getScreenTagState(),
    writeScreenTagState: (state) => store.replaceScreenTagState(state),
    readScreenReferences: () => store.listScreenReferences(),
    writeScreenReferences: (devices) => store.replaceScreenReferences(devices)
  });
}
