/**
 * Screen tags and per-item schedules.
 *
 * Screens store tags. Each playlist item may store a tagRule and a schedule.
 * When a policy is pushed, items that do not match that screen right now are
 * removed. Items with no rule play on every screen. Items with no schedule
 * play all the time. tagRule and schedule are stripped before the player sees
 * the policy.
 *
 * Screen tags live in screen-tags.json beside the SQLite database (or
 * data/screen-tags.json). Playlist item rules ride along in items JSON.
 */

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import type { IncomingMessage, ServerResponse } from "http";
import { dirname } from "path";
import type {
  DevicePlaylistAssignment,
  StoredPlaylist,
  TomorrowOSStore
} from "./store/types.js";

export interface ScreenTagHost {
  listDevices(): Promise<
    Array<{ deviceId: string; deviceName?: string | null; connected: boolean }>
  >;
  pushLatestPolicyToDevice(deviceId: string): Promise<{ pushed: boolean }>;
  playlists: {
    buildPolicyForDevice(
      deviceId: string,
      options: { useLatest?: boolean }
    ): Promise<{ policy: unknown }>;
  };
}

export type TagRuleOp = "any" | "all" | "notAny" | "notAll";

export interface TagRule {
  op: TagRuleOp;
  tags: string[];
}

const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const OP_ALIASES: Record<string, TagRuleOp> = {
  any: "any",
  all: "all",
  notany: "notAny",
  "not any": "notAny",
  notall: "notAll",
  "not all": "notAll",
  notAny: "notAny",
  notAll: "notAll"
};

export function normalizeTag(raw: unknown): string | null {
  const tag = String(raw ?? "").trim().toLowerCase();
  if (!TAG_PATTERN.test(tag)) return null;
  return tag;
}

export function normalizeTagList(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const tag = normalizeTag(part);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

/**
 * Monday = 0 … Sunday = 6.
 * [true, true, true, true, true, false, false] is Mon–Fri and does not play Sat or Sun.
 * [false, false, false, false, false, true, true] is Sat and Sun.
 */
export function weekdayIndexMondayFirst(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export interface ItemSchedule {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  days?: boolean[];
}

function localYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function toMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function normalizeClock(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const minutes = toMinutes(raw);
  if (minutes === null) return undefined;
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

/** Missing or empty schedule means the item plays all the time. */
export function parseItemSchedule(raw: unknown): ItemSchedule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const schedule: ItemSchedule = {};
  const startDate = typeof record.startDate === "string" ? record.startDate.trim() : "";
  const endDate = typeof record.endDate === "string" ? record.endDate.trim() : "";
  if (startDate && isYmd(startDate)) schedule.startDate = startDate;
  if (endDate && isYmd(endDate)) schedule.endDate = endDate;
  const startTime = normalizeClock(record.startTime);
  const endTime = normalizeClock(record.endTime);
  if (startTime) schedule.startTime = startTime;
  if (endTime) schedule.endTime = endTime;
  if (
    Array.isArray(record.days) &&
    record.days.length === 7 &&
    record.days.every((day) => typeof day === "boolean")
  ) {
    schedule.days = record.days.slice() as boolean[];
  }
  if (
    !schedule.startDate &&
    !schedule.endDate &&
    !schedule.startTime &&
    !schedule.endTime &&
    !schedule.days
  ) {
    return null;
  }
  return schedule;
}

function dateAllowed(schedule: ItemSchedule, ymd: string): boolean {
  if (schedule.startDate && ymd < schedule.startDate) return false;
  if (schedule.endDate && ymd > schedule.endDate) return false;
  return true;
}

function dayAllowed(schedule: ItemSchedule, date: Date): boolean {
  if (!schedule.days) return true;
  return schedule.days[weekdayIndexMondayFirst(date)] === true;
}

/**
 * `now` is interpreted in its local timezone. End times are exclusive.
 * A window whose end is earlier than its start continues past midnight,
 * and that tail still belongs to the day the window started.
 */
export function itemScheduleActive(raw: unknown, now: Date = new Date()): boolean {
  const schedule = parseItemSchedule(raw);
  if (!schedule) return true;
  const today = localYmd(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = schedule.startTime ? toMinutes(schedule.startTime) : null;
  const endMinutes = schedule.endTime ? toMinutes(schedule.endTime) : null;
  if (startMinutes === null && endMinutes === null) {
    return dateAllowed(schedule, today) && dayAllowed(schedule, now);
  }

  const windowStart = startMinutes ?? 0;
  const windowEnd = endMinutes ?? 24 * 60;
  if (windowEnd > windowStart) {
    if (!dateAllowed(schedule, today) || !dayAllowed(schedule, now)) return false;
    return minutes >= windowStart && minutes < windowEnd;
  }
  if (windowEnd === windowStart) return false;

  if (minutes >= windowStart) {
    return dateAllowed(schedule, today) && dayAllowed(schedule, now);
  }
  if (minutes < windowEnd) {
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    );
    return dateAllowed(schedule, localYmd(yesterday)) && dayAllowed(schedule, yesterday);
  }
  return false;
}

/** Missing, empty, or invalid rules mean the item plays on every screen. */
export function parseTagRule(raw: unknown): TagRule | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { match?: unknown; op?: unknown; tags?: unknown };
  const opKey = String(record.match ?? record.op ?? "").trim();
  const op = OP_ALIASES[opKey] ?? OP_ALIASES[opKey.toLowerCase()];
  if (!op) return null;
  const tags = normalizeTagList(record.tags);
  if (tags.length === 0) return null;
  return { op, tags };
}

export function itemMatchesScreen(
  screenTags: readonly string[],
  item: unknown,
  now: Date = new Date()
): boolean {
  if (!item || typeof item !== "object") return true;
  const rule = parseTagRule((item as { tagRule?: unknown }).tagRule);
  if (rule) {
    const have = new Set(screenTags.map((tag) => tag.trim().toLowerCase()));
    const has = (tag: string) => have.has(tag);
    const tagsMatch = (() => {
      switch (rule.op) {
        case "any":
          return rule.tags.some(has);
        case "all":
          return rule.tags.every(has);
        case "notAny":
          return rule.tags.every((tag) => !has(tag));
        case "notAll":
          return rule.tags.some((tag) => !has(tag));
        default:
          return true;
      }
    })();
    if (!tagsMatch) return false;
  }
  return itemScheduleActive((item as { schedule?: unknown }).schedule, now);
}

function stripPlaybackFields(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const copy = { ...(item as Record<string, unknown>) };
  delete copy.tagRule;
  delete copy.schedule;
  return copy;
}

/** Returns a new policy. Does not mutate the SDK snapshot objects. */
export function filterPolicyForScreen(
  policy: unknown,
  screenTags: readonly string[],
  now: Date = new Date()
): unknown {
  if (!policy || typeof policy !== "object") return policy;
  const source = policy as { playlists?: unknown };
  if (!Array.isArray(source.playlists)) return policy;
  return {
    ...(policy as Record<string, unknown>),
    playlists: source.playlists.map((playlist) => {
      if (!playlist || typeof playlist !== "object") return playlist;
      const record = playlist as { items?: unknown };
      const items = Array.isArray(record.items) ? record.items : [];
      return {
        ...(playlist as Record<string, unknown>),
        items: items
          .filter((item) => itemMatchesScreen(screenTags, item, now))
          .map((item) => stripPlaybackFields(item))
      };
    })
  };
}

function policyItemSignature(policy: unknown): string {
  if (!policy || typeof policy !== "object") return "";
  const playlists = (policy as { playlists?: unknown }).playlists;
  if (!Array.isArray(playlists)) return "";
  return playlists
    .map((playlist) => {
      if (!playlist || typeof playlist !== "object") return "";
      const record = playlist as { id?: unknown; items?: unknown };
      const items = Array.isArray(record.items) ? record.items : [];
      const urls = items.map((item) =>
        item && typeof item === "object" ? String((item as { url?: unknown }).url || "") : ""
      );
      return `${String(record.id || "")}:${urls.join("|")}`;
    })
    .join("\n");
}

function policyContainsItemSchedule(policy: unknown): boolean {
  if (!policy || typeof policy !== "object") return false;
  const playlists = (policy as { playlists?: unknown }).playlists;
  if (!Array.isArray(playlists)) return false;
  for (const playlist of playlists) {
    if (!playlist || typeof playlist !== "object") continue;
    const items = (playlist as { items?: unknown }).items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      if (parseItemSchedule((item as { schedule?: unknown }).schedule)) return true;
    }
  }
  return false;
}

/**
 * Re-push a screen when a schedule window opens or closes.
 * Current players ignore item schedules, so the CMS removes inactive items
 * before the policy is sent. The check uses this computer's local clock.
 */
export function startItemScheduleRefresher(deps: ScreenTagHttpDeps): void {
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lastSignature = new Map<string, string>();

  const arm = () => {
    if (timer) clearTimeout(timer);
    const delay = 60_000 - (Date.now() % 60_000) + 250;
    timer = setTimeout(() => {
      void refresh(true);
    }, delay);
  };

  const refresh = async (push: boolean) => {
    if (running) {
      arm();
      return;
    }
    running = true;
    try {
      const devices = await deps.host.listDevices();
      const now = new Date();
      for (const device of devices) {
        if (!device.connected) continue;
        let built: { policy: unknown };
        try {
          built = await deps.host.playlists.buildPolicyForDevice(device.deviceId, {
            useLatest: true
          });
        } catch {
          continue;
        }
        if (!policyContainsItemSchedule(built.policy)) {
          lastSignature.delete(device.deviceId);
          continue;
        }
        const tags = await deps.tags.get(device.deviceId);
        const signature = policyItemSignature(filterPolicyForScreen(built.policy, tags, now));
        const previous = lastSignature.get(device.deviceId);
        lastSignature.set(device.deviceId, signature);
        if (!push || previous === signature) continue;
        try {
          await deps.host.pushLatestPolicyToDevice(device.deviceId);
        } catch (err) {
          console.error(
            `[TomorrowOS] item schedule refresh failed for ${device.deviceId}:`,
            err
          );
        }
      }
    } catch (err) {
      console.error("[TomorrowOS] item schedule refresh failed:", err);
    } finally {
      running = false;
      arm();
    }
  };

  void refresh(true);
}

interface TagFile {
  catalog: string[];
  devices: Record<string, string[]>;
}

export class ScreenTagStore {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async get(deviceId: string): Promise<string[]> {
    const all = await this.read();
    return all.devices[deviceId]?.slice() ?? [];
  }

  async all(): Promise<Record<string, string[]>> {
    const file = await this.read();
    const out: Record<string, string[]> = {};
    for (const [deviceId, tags] of Object.entries(file.devices)) {
      out[deviceId] = tags.slice();
    }
    return out;
  }

  async catalog(): Promise<string[]> {
    const file = await this.read();
    return file.catalog.slice();
  }

  async remember(tag: string): Promise<string[]> {
    return this.enqueue(async () => {
      const file = await this.read();
      this.rememberOn(file, tag);
      await this.write(file);
      return file.catalog.slice();
    });
  }

  async rename(from: string, to: string): Promise<string[]> {
    return this.enqueue(async () => {
      const file = await this.read();
      const touched: string[] = [];
      this.rememberOn(file, from);
      file.catalog = file.catalog
        .map((tag) => (tag === from ? to : tag))
        .filter((tag, index, all) => all.indexOf(tag) === index)
        .sort();
      for (const [deviceId, tags] of Object.entries(file.devices)) {
        if (!tags.includes(from)) continue;
        file.devices[deviceId] = tags
          .map((tag) => (tag === from ? to : tag))
          .filter((tag, index, all) => all.indexOf(tag) === index);
        touched.push(deviceId);
      }
      await this.write(file);
      return touched;
    });
  }

  async forget(tag: string): Promise<void> {
    await this.enqueue(async () => {
      const file = await this.read();
      file.catalog = file.catalog.filter((item) => item !== tag);
      await this.write(file);
    });
  }

  async add(deviceId: string, tag: string): Promise<string[]> {
    return this.enqueue(async () => {
      const file = await this.read();
      this.rememberOn(file, tag);
      const current = file.devices[deviceId] ?? [];
      if (!current.includes(tag)) current.push(tag);
      file.devices[deviceId] = current;
      await this.write(file);
      return current.slice();
    });
  }

  async remove(deviceId: string, tag: string): Promise<string[]> {
    return this.enqueue(async () => {
      const file = await this.read();
      const current = (file.devices[deviceId] ?? []).filter((item) => item !== tag);
      if (current.length === 0) delete file.devices[deviceId];
      else file.devices[deviceId] = current;
      await this.write(file);
      return current.slice();
    });
  }

  async deleteDevice(deviceId: string): Promise<void> {
    await this.enqueue(async () => {
      const file = await this.read();
      if (!file.devices[deviceId]) return;
      delete file.devices[deviceId];
      await this.write(file);
    });
  }

  private rememberOn(file: TagFile, tag: string): void {
    if (!file.catalog.includes(tag)) {
      file.catalog.push(tag);
      file.catalog.sort();
    }
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async read(): Promise<TagFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { devices?: unknown; catalog?: unknown };
      const devices: Record<string, string[]> = {};
      if (parsed.devices && typeof parsed.devices === "object") {
        for (const [deviceId, tags] of Object.entries(parsed.devices)) {
          devices[deviceId] = normalizeTagList(tags);
        }
      }
      const catalog = normalizeTagList(parsed.catalog);
      for (const tags of Object.values(devices)) {
        for (const tag of tags) {
          if (!catalog.includes(tag)) catalog.push(tag);
        }
      }
      catalog.sort();
      return { devices, catalog };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { devices: {}, catalog: [] };
      throw err;
    }
  }

  private async write(file: TagFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
    await rename(tmp, this.filePath);
  }
}

export interface ScreenTagHttpDeps {
  host: ScreenTagHost;
  store: TomorrowOSStore;
  tags: ScreenTagStore;
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function pathnameOf(req: IncomingMessage): string {
  const url = new URL(req.url || "/", "http://localhost");
  let pathname = url.pathname || "/";
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  return pathname;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > 1_000_000) throw new Error("Body too large");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON object required");
  }
  return parsed as Record<string, unknown>;
}

async function requirePaired(
  deps: ScreenTagHttpDeps,
  deviceId: string,
  res: ServerResponse
): Promise<boolean> {
  const paired = await deps.store.getPairedDevice(deviceId);
  if (paired) return true;
  sendJson(res, 404, { status: "failed", error: "Device not paired" });
  return false;
}

function replaceTagOnItems(
  items: unknown[],
  from: string,
  to: string
): { items: unknown[]; changed: boolean } {
  let changed = false;
  const next = items.map((item) => {
    if (!item || typeof item !== "object") return item;
    const copy = { ...(item as Record<string, unknown>) };
    const rule = copy.tagRule;
    if (!rule || typeof rule !== "object") return copy;
    const tags = normalizeTagList((rule as { tags?: unknown }).tags);
    if (!tags.includes(from)) return copy;
    changed = true;
    const replaced = tags
      .map((tag) => (tag === from ? to : tag))
      .filter((tag, index, all) => all.indexOf(tag) === index);
    const ruleCopy = { ...(rule as Record<string, unknown>) };
    if (replaced.length === 0) delete copy.tagRule;
    else {
      ruleCopy.tags = replaced;
      copy.tagRule = ruleCopy;
    }
    return copy;
  });
  return { items: next, changed };
}

async function listKnownTags(deps: ScreenTagHttpDeps): Promise<string[]> {
  const known = new Set(await deps.tags.catalog());
  const playlists = await deps.store.listPlaylists();
  for (const playlist of playlists) {
    for (const item of playlist.items ?? []) {
      for (const tag of normalizeTagList((item as { tagRule?: { tags?: unknown } }).tagRule?.tags)) {
        known.add(tag);
      }
    }
  }
  return [...known].sort();
}

async function findTagUsage(
  deps: ScreenTagHttpDeps,
  tag: string
): Promise<{
  screens: Array<{ deviceId: string; deviceName: string | null }>;
  assets: Array<{ playlistName: string; label: string }>;
}> {
  const devices = await deps.host.listDevices();
  const byDevice = await deps.tags.all();
  const screens = devices
    .filter((device) => (byDevice[device.deviceId] ?? []).includes(tag))
    .map((device) => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName ?? null
    }));
  const playlists = await deps.store.listPlaylists();
  const assets: Array<{ playlistName: string; label: string }> = [];
  for (const playlist of playlists) {
    if (playlist.retired) continue;
    for (const item of playlist.items ?? []) {
      const tags = normalizeTagList((item as { tagRule?: { tags?: unknown } }).tagRule?.tags);
      if (!tags.includes(tag)) continue;
      const url = typeof (item as { url?: unknown }).url === "string" ? (item as { url: string }).url : "";
      assets.push({
        playlistName: playlist.name,
        label: url.split("/").pop() || "asset"
      });
    }
  }
  return { screens, assets };
}

function tagInUseMessage(
  tag: string,
  usage: {
    screens: Array<{ deviceId: string; deviceName: string | null }>;
    assets: Array<{ playlistName: string; label: string }>;
  }
): string {
  const parts: string[] = [];
  if (usage.screens.length > 0) {
    parts.push(
      `screens: ${usage.screens.map((screen) => screen.deviceName || screen.deviceId).join(", ")}`
    );
  }
  if (usage.assets.length > 0) {
    parts.push(
      `assets: ${usage.assets.map((asset) => `${asset.label} (${asset.playlistName})`).join(", ")}`
    );
  }
  return `Remove “${tag}” from ${parts.join(" and ")} before deleting it.`;
}

async function renameTagEverywhere(
  deps: ScreenTagHttpDeps,
  from: string,
  to: string
): Promise<void> {
  const playlists = await deps.store.listPlaylists();
  for (const playlist of playlists) {
    const replaced = replaceTagOnItems(playlist.items ?? [], from, to);
    if (!replaced.changed) continue;
    const next: StoredPlaylist = {
      ...playlist,
      items: replaced.items as StoredPlaylist["items"]
    };
    await deps.store.setPlaylist(next);
  }

  const paired = await deps.store.listPairedDevices();
  const pushIds = new Set(await deps.tags.rename(from, to));
  for (const { deviceId } of paired) {
    const assignments = await deps.store.getDeviceAssignments(deviceId);
    let changed = false;
    const next = assignments.map((assignment) => {
      const replaced = replaceTagOnItems(assignment.snapshot.items ?? [], from, to);
      if (!replaced.changed) return assignment;
      changed = true;
      pushIds.add(deviceId);
      const updated: DevicePlaylistAssignment = {
        ...assignment,
        snapshot: {
          ...assignment.snapshot,
          items: replaced.items as DevicePlaylistAssignment["snapshot"]["items"]
        }
      };
      return updated;
    });
    if (changed) await deps.store.setDeviceAssignments(deviceId, next);
  }

  for (const deviceId of pushIds) {
    try {
      await deps.host.pushLatestPolicyToDevice(deviceId);
    } catch {
      // An offline screen picks up the renamed tag the next time it connects.
    }
  }
}

async function replyAfterPush(
  res: ServerResponse,
  deps: ScreenTagHttpDeps,
  deviceId: string,
  tags: string[]
): Promise<void> {
  try {
    const result = await deps.host.pushLatestPolicyToDevice(deviceId);
    sendJson(res, 200, {
      status: "success",
      deviceId,
      tags,
      pushed: result.pushed,
      ...(result.pushed
        ? {}
        : {
            note: "Tag saved. The screen updates when it is online and a playlist is assigned."
          })
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "push failed";
    sendJson(res, 200, {
      status: "success",
      deviceId,
      tags,
      pushed: false,
      error: message
    });
  }
}

export async function handleScreenTagHttp(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ScreenTagHttpDeps
): Promise<boolean> {
  const method = String(req.method || "GET").toUpperCase();
  const pathname = pathnameOf(req);
  const url = new URL(req.url || "/", "http://localhost");

  if (method === "GET" && pathname === "/tags") {
    sendJson(res, 200, { status: "success", tags: await listKnownTags(deps) });
    return true;
  }

  if (method === "POST" && pathname === "/tags") {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (err) {
      sendJson(res, 400, {
        status: "failed",
        error: err instanceof Error ? err.message : "Invalid JSON"
      });
      return true;
    }
    const tag = normalizeTag(body.tag);
    if (!tag) {
      sendJson(res, 400, {
        status: "failed",
        error: "Tag must be letters, numbers, hyphens, or underscores (e.g. screen-a)"
      });
      return true;
    }
    const known = await listKnownTags(deps);
    if (!known.includes(tag)) await deps.tags.remember(tag);
    sendJson(res, 200, { status: "success", tags: await listKnownTags(deps) });
    return true;
  }

  const catalogTag = /^\/tags\/([^/]+)$/.exec(pathname);
  if (catalogTag && (method === "PATCH" || method === "DELETE")) {
    const from = normalizeTag(decodeURIComponent(catalogTag[1]));
    if (!from) {
      sendJson(res, 400, { status: "failed", error: "Invalid tag" });
      return true;
    }
    const known = await listKnownTags(deps);
    if (!known.includes(from)) {
      sendJson(res, 404, { status: "failed", error: "Tag not found" });
      return true;
    }

    if (method === "DELETE") {
      const usage = await findTagUsage(deps, from);
      if (usage.screens.length > 0 || usage.assets.length > 0) {
        sendJson(res, 409, {
          status: "failed",
          error: tagInUseMessage(from, usage),
          screens: usage.screens,
          assets: usage.assets
        });
        return true;
      }
      await deps.tags.forget(from);
      sendJson(res, 200, { status: "success", tags: await listKnownTags(deps) });
      return true;
    }

    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (err) {
      sendJson(res, 400, {
        status: "failed",
        error: err instanceof Error ? err.message : "Invalid JSON"
      });
      return true;
    }
    const to = normalizeTag(body.tag);
    if (!to) {
      sendJson(res, 400, {
        status: "failed",
        error: "Tag must be letters, numbers, hyphens, or underscores (e.g. screen-a)"
      });
      return true;
    }
    if (to !== from && known.includes(to)) {
      sendJson(res, 409, { status: "failed", error: `Tag “${to}” already exists.` });
      return true;
    }
    if (to !== from) await renameTagEverywhere(deps, from, to);
    sendJson(res, 200, { status: "success", tags: await listKnownTags(deps) });
    return true;
  }

  if (method === "GET" && pathname === "/screen-tags") {
    const tag = normalizeTag(url.searchParams.get("tag"));
    if (url.searchParams.has("tag") && !tag) {
      sendJson(res, 400, { status: "failed", error: "Invalid tag" });
      return true;
    }
    const tagsByDevice = await deps.tags.all();
    if (!tag) {
      sendJson(res, 200, { status: "success", tagsByDevice });
      return true;
    }
    const devices = await deps.host.listDevices();
    const screens = devices
      .filter((device) => (tagsByDevice[device.deviceId] ?? []).includes(tag))
      .map((device) => ({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        tags: tagsByDevice[device.deviceId] ?? []
      }));
    sendJson(res, 200, { status: "success", tag, screens });
    return true;
  }

  const preview = /^\/device\/([^/]+)\/playback-preview$/.exec(pathname);
  if (method === "GET" && preview) {
    const deviceId = decodeURIComponent(preview[1]);
    if (!(await requirePaired(deps, deviceId, res))) return true;
    const tags = await deps.tags.get(deviceId);
    const built = await deps.host.playlists.buildPolicyForDevice(deviceId, {
      useLatest: true
    });
    const policy = filterPolicyForScreen(built.policy, tags) as {
      playlists?: Array<{ id?: string; name?: string; items?: unknown[] }>;
    };
    sendJson(res, 200, {
      status: "success",
      deviceId,
      tags,
      playlists: (policy.playlists ?? []).map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        items: playlist.items ?? []
      }))
    });
    return true;
  }

  const tagCollection = /^\/device\/([^/]+)\/tags$/.exec(pathname);
  if (method === "POST" && tagCollection) {
    const deviceId = decodeURIComponent(tagCollection[1]);
    if (!(await requirePaired(deps, deviceId, res))) return true;
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (err) {
      sendJson(res, 400, {
        status: "failed",
        error: err instanceof Error ? err.message : "Invalid JSON"
      });
      return true;
    }
    const tag = normalizeTag(body.tag);
    if (!tag) {
      sendJson(res, 400, {
        status: "failed",
        error: "Tag must be letters, numbers, hyphens, or underscores (e.g. screen-a)"
      });
      return true;
    }
    const tags = await deps.tags.add(deviceId, tag);
    await replyAfterPush(res, deps, deviceId, tags);
    return true;
  }

  const oneTag = /^\/device\/([^/]+)\/tags\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && oneTag) {
    const deviceId = decodeURIComponent(oneTag[1]);
    const tag = normalizeTag(decodeURIComponent(oneTag[2]));
    if (!tag) {
      sendJson(res, 400, { status: "failed", error: "Invalid tag" });
      return true;
    }
    if (!(await requirePaired(deps, deviceId, res))) return true;
    const tags = await deps.tags.remove(deviceId, tag);
    await replyAfterPush(res, deps, deviceId, tags);
    return true;
  }

  return false;
}
