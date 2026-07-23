import { randomBytes, randomUUID } from "crypto";
import { EventEmitter } from "events";
import fs from "fs/promises";
import http from "http";
import path from "path";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";

import {
  generateDeterministicPairingCode,
  generateRandomPairingCode,
  isValidPairingCodeFormat,
  normalizePairingCode,
  resolvePairingCodeSecret
} from "./pairing-code.js";
import { PlaylistCatalog, type BuiltDevicePolicy } from "./playlist-catalog.js";
import type {
  DeviceOnOffTimer,
  DeviceRegistryRecord,
  PairedDeviceRecord,
  PlaylistItemRecord,
  PlaylistSchedule,
  TomorrowOSStore,
  UploadedAssetRecord
} from "./store/types.js";
import { MemoryStore } from "./store/memory-store.js";
import {
  resolveBrandLogoPath,
  syncProjectAssetsToStaticRoot
} from "./brand-assets.js";
import {
  deleteCloudinaryAsset,
  resolveCloudinaryConfig,
  uploadBufferToCloudinary
} from "./cloudinary-storage.js";
import { probeVideoDurationMs } from "./media-probe.js";
import { contentHashHex, storeUploadIfNeeded } from "./upload-storage.js";
import { detectPrimaryLanIpv4 } from "./lan-address.js";
import { buildServerStatus } from "./server-status.js";
export type {
  ConnectorState,
  ConnectorStatus,
  ServerStatusReport,
  StatusBlocker
} from "./server-status.js";

export interface TomorrowOSBrand {
  name?: string;
  cmsEndpoint?: string;
  [key: string]: unknown;
}

export interface TomorrowOSOptions {
  brand: TomorrowOSBrand;
  /** Scheme C: inject Postgres/Redis-backed store. Defaults to MemoryStore. */
  store?: TomorrowOSStore;
}

export interface ListenOptions {
  port: number;
  host?: string;
  /**
   * If set, GET requests serve files from this directory (e.g. CMS UI assets).
   * `GET /` serves `staticIndex` (default `index.html`) under this root.
   * WebSocket upgrades are accepted on `/` and common Vercel Function paths (`/api`, `/api/ws`).
   * Note: `GET /brand.json` is always served from the `brand` passed to the constructor (not from this folder).
   */
  staticRoot?: string;
  /**
   * Entry file under `staticRoot` for `GET /` (relative path only, no `..`).
   * Default: `index.html`. Ignored when `staticRoot` is not set.
   */
  staticIndex?: string;
  /**
   * When true (default), call `server.listen(port)`.
   * On Vercel Functions set false (or rely on auto-detect via `process.env.VERCEL`)
   * and `export default server` — Vercel owns the socket; see
   * https://vercel.com/docs/functions/websockets
   */
  autoListen?: boolean;
  /**
   * Pathnames that accept WebSocket upgrades (default: `/`, `/api`, `/api/ws`, …).
   * Replit / Railway / local keep using `wss://host/`. Vercel Functions often mount at `/api`.
   */
  webSocketPaths?: string[];
}

type TomorrowOSEvent =
  | "device.paired"
  | "device.unpaired"
  | "device.online"
  | "device.offline"
  | "device.heartbeat"
  | "command.verified"
  | "command.failed";

interface DeviceSocket extends WebSocket {
  deviceId?: string;
}

interface DeviceHelloMeta {
  platform?: string;
  deviceName?: string;
  system?: string;
  bootedAt?: string;
  bootUptimeSec?: number;
  playerVersion?: string;
  serialNumber?: string;
  systemVersion?: string;
}

function normalizeDevicePlatform(
  platform?: string | null,
  system?: string | null
): string | undefined {
  const explicit = typeof platform === "string" ? platform.trim().toLowerCase() : "";
  if (explicit) return explicit;

  const systemLabel = typeof system === "string" ? system.toLowerCase() : "";
  if (systemLabel.includes("brightsign")) return "brightsign";
  if (systemLabel.includes("tizen")) return "tizen";
  return undefined;
}

function formatDeviceSystemForFirmware(
  platform: string | undefined,
  firmware: string | undefined,
  existingSystem?: string | null
): string | undefined {
  const fw = typeof firmware === "string" ? firmware.trim() : "";
  if (!fw) return existingSystem ?? undefined;

  if (platform === "brightsign") return "BrightSignOS";
  if (platform === "tizen") return "Tizen";

  const base = typeof existingSystem === "string"
    ? existingSystem.replace(/\s*\([^)]*\)\s*$/, "").trim()
    : "";
  return base ? `${base}` : fw;
}

function normalizeDeviceSystemLabel(
  platform?: string | null,
  system?: string | null
): string | undefined {
  const normalizedPlatform = normalizeDevicePlatform(platform, system);
  if (normalizedPlatform === "brightsign") return "BrightSignOS";
  if (normalizedPlatform === "tizen") return "Tizen";

  const label = typeof system === "string" ? system.trim() : "";
  return label || undefined;
}

export interface DeviceListItem {
  deviceId: string;
  /** Permanent 6-character alphanumeric pairing code (same after unpair). */
  pairingCode: string | null;
  connected: boolean;
  deviceName: string | null;
  platform: string | null;
  system: string | null;
  playerVersion: string | null;
  systemVersion: string | null;
  serialNumber: string | null;
  pairedAt: string;
  lastBootAt: string | null;
  lastOnlineAt: string | null;
  lastOfflineAt: string | null;
  lastPolicyPushAt: string | null;
  screenOnlineActive: boolean;
  screenOnlineLabel: string;
  /** Same as lastBootAt while connected; used for uptime display. */
  screenOnlineSince: string | null;
  publishedPlaylists: Array<{
    playlistId: string;
    name: string;
    publishedAt: string;
    schedule?: {
      startDate?: string;
      endDate?: string;
      start?: string;
      end?: string;
    };
  }>;
  latestErrorAt: string | null;
  latestErrorMessage: string | null;
  latestScreenshot: {
    url: string;
    capturedAt: string;
  } | null;
  /** Daily screen mute schedule (device stays connected). */
  onOffTimer: DeviceOnOffTimer | null;
}

const ON_OFF_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeOnOffTimer(input: unknown): DeviceOnOffTimer {
  if (!input || typeof input !== "object") {
    throw new Error("onOffTimer object is required");
  }
  const body = input as Record<string, unknown>;
  const turnOnAt = String(body.turnOnAt ?? "").trim();
  const turnOffAt = String(body.turnOffAt ?? "").trim();
  if (!ON_OFF_TIME_RE.test(turnOnAt) || !ON_OFF_TIME_RE.test(turnOffAt)) {
    throw new Error("turnOnAt and turnOffAt must be HH:mm (24h)");
  }
  if (turnOnAt === turnOffAt) {
    throw new Error("turnOnAt and turnOffAt must be different");
  }
  return { turnOnAt, turnOffAt };
}

export interface DeviceLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  source?: string;
  details?: unknown;
}

export interface DeviceScreenshotInfo {
  deviceId: string;
  url: string;
  capturedAt: string;
  mimeType: string;
  assetId?: string;
  width?: number;
  height?: number;
}

interface DeviceScreenshotPayload {
  mimeType?: string;
  dataBase64?: string;
  capturedAt?: string;
  width?: number;
  height?: number;
}

function isRemoteUploadedAssetUrl(url: string): boolean {
  return /^https?:\/\//i.test(String(url || "").trim());
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function parseBootIsoMs(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseBootUptimeSec(msg: Record<string, unknown>): number | null {
  const raw = msg.bootUptimeSec ?? msg.bootUptimeSeconds;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** Derive boot instant from device uptime + CMS clock (avoids wrong TV wall clock). */
function bootAtFromUptimeSec(uptimeSec: number): string {
  return new Date(Date.now() - uptimeSec * 1000).toISOString();
}

function lastBootAtFromHandshake(
  msg: Record<string, unknown>,
  existing?: string
): string | undefined {
  const uptimeSec = parseBootUptimeSec(msg);
  if (uptimeSec != null) {
    return resolveLastBootAt(bootAtFromUptimeSec(uptimeSec), existing);
  }
  const bootedAt =
    typeof msg.bootedAt === "string" ? msg.bootedAt : undefined;
  return resolveLastBootAt(bootedAt, existing);
}

/** Merge device-reported boot time with stored value (ignore page-reload noise, accept reboots). */
function resolveLastBootAt(
  incoming?: string,
  existing?: string
): string | undefined {
  const inMs = parseBootIsoMs(incoming);
  const exMs = parseBootIsoMs(existing);
  if (inMs == null && exMs == null) return undefined;
  if (inMs == null) return existing;
  if (exMs == null) return incoming;

  const gapMs = inMs - exMs;
  if (gapMs < 0) return incoming;
  if (gapMs > 120_000) return incoming;
  return new Date(Math.min(inMs, exMs)).toISOString();
}

function resolveHelloDeviceId(msg: Record<string, unknown>): string | null {
  const serial =
    typeof msg.serialNumber === "string" && msg.serialNumber.trim()
      ? msg.serialNumber.trim()
      : null;
  if (serial) return serial;

  const deviceId =
    typeof msg.deviceId === "string" && msg.deviceId.trim()
      ? msg.deviceId.trim()
      : null;
  return deviceId;
}

/** Default paths that accept device WebSocket upgrades (local + Vercel Functions). */
const DEFAULT_WEBSOCKET_PATHS = ["/", "/api", "/api/", "/api/ws", "/api/index"];

function normalizeWebSocketPaths(paths?: string[]): Set<string> {
  const list =
    paths && paths.length > 0 ? paths : DEFAULT_WEBSOCKET_PATHS;
  const out = new Set<string>();
  for (const raw of list) {
    let p = String(raw || "").trim() || "/";
    if (!p.startsWith("/")) p = `/${p}`;
    out.add(p);
    if (p.length > 1 && p.endsWith("/")) out.add(p.replace(/\/+$/, ""));
    else if (p !== "/") out.add(`${p}/`);
  }
  out.add("/");
  return out;
}

function isAllowedWebSocketPath(pathname: string, allowed: Set<string>): boolean {
  const p = !pathname || pathname === "" ? "/" : pathname;
  if (allowed.has(p)) return true;
  const trimmed = p.replace(/\/+$/, "") || "/";
  return allowed.has(trimmed) || allowed.has(`${trimmed}/`);
}

const MAX_MEDIA_UPLOAD_BYTES = 100 * 1024 * 1024;

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const buf = await readRawBody(req, MAX_MEDIA_UPLOAD_BYTES);
  const raw = buf.toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function readRawBody(
  req: http.IncomingMessage,
  maxBytes: number
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`Body too large (max ${maxBytes} bytes)`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function sanitizeUploadFilename(name: string): string {
  const base = path.basename(String(name || "upload")).replace(/[^\w.\-()+ ]/g, "_");
  return base.slice(0, 180) || "upload";
}

function sanitizeStorageSegment(value: string): string {
  return String(value || "item").replace(/[^\w.\-]+/g, "_").slice(0, 160) || "item";
}

function inferResourceType(mimeType: string | undefined, filename: string): string {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";

  const ext = path.extname(filename).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext)) {
    return "image";
  }
  if ([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"].includes(ext)) {
    return "video";
  }
  return "raw";
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseDevicePath(pathname: string): {
  deviceId: string;
  action: string;
} | null {
  const base = /^\/device\/([^/]+)\/(.+)$/.exec(pathname);
  if (!base) return null;
  const deviceId = decodeURIComponent(base[1]);
  const action = base[2];
  return { deviceId, action };
}

export class TomorrowOS extends EventEmitter {
  readonly brand: TomorrowOSBrand;
  private readonly store: TomorrowOSStore;
  readonly playlists: PlaylistCatalog;
  private readonly devices = new Map<string, DeviceSocket>();
  private readonly pendingDeviceMeta = new Map<string, DeviceHelloMeta>();
  private readonly deviceLogs = new Map<string, DeviceLogEntry[]>();
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private staticRoot: string | null = null;
  private staticIndexFile = "index.html";
  /** Set when listen() starts — exposed to CMS panel for post-restart reconnect grace. */
  private serverStartedAt: string | null = null;
  /** Port passed to listen(); used for suggested LAN CMS URL. */
  private listenPort: number | null = null;

  constructor(options: TomorrowOSOptions) {
    super();
    this.brand = options.brand;
    this.store = options.store ?? new MemoryStore();
    this.playlists = new PlaylistCatalog(this.store);
  }

  /** Push all device assignments using latest playlist definitions (e.g. after reboot). */
  async pushLatestPolicyToDevice(deviceId: string): Promise<{
    pushed: boolean;
    policy?: BuiltDevicePolicy["policy"];
  }> {
    const id = String(deviceId || "").trim();
    const assignments = await this.store.getDeviceAssignments(id);
    if (assignments.length === 0) return { pushed: false };

    const built = await this.playlists.buildPolicyForDevice(id, { useLatest: true });
    const ws = this.devices.get(id);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return { pushed: false, policy: built.policy };
    }

    await this.sendDeviceCommand(id, "device.content.setPolicy", {
      policy: built.policy
    });
    await this.recordPolicyPush(id);
    return { pushed: true, policy: built.policy };
  }

  private async sendDeviceCommand(
    deviceId: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const ws = this.devices.get(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw Object.assign(new Error("Device not connected"), { code: "DEVICE_OFFLINE" });
    }
    return this.sendCommandToSocket(ws, deviceId, method, params);
  }

  /** Verify a 6-character alphanumeric pairing code (POST /pairing/verify). */
  async pairingVerify(code: string): Promise<{ deviceId: string }> {
    const normalized = normalizePairingCode(code);
    if (!isValidPairingCodeFormat(normalized)) {
      const err = new Error("Invalid pairing code format");
      (err as NodeJS.ErrnoException).code = "PAIRING_INVALID";
      throw err;
    }

    let deviceId: string | undefined;
    const registry = await this.store.getDeviceRegistryByCode(normalized);
    if (registry) {
      deviceId = registry.deviceId;
    } else {
      const pending = await this.store.getPendingCode(normalized);
      deviceId = pending?.deviceId;
    }

    if (!deviceId) {
      const err = new Error("Invalid or unknown pairing code");
      (err as NodeJS.ErrnoException).code = "PAIRING_INVALID";
      throw err;
    }

    const pairingToken = randomBytes(32).toString("hex");
    const pairedAt = new Date().toISOString();
    const meta = this.pendingDeviceMeta.get(deviceId);
    const now = pairedAt;
    const lastBootAt =
      meta?.bootUptimeSec != null
        ? resolveLastBootAt(bootAtFromUptimeSec(meta.bootUptimeSec), undefined)
        : resolveLastBootAt(meta?.bootedAt, undefined);
    const deviceName = await this.resolveDeviceNameForPairing(
      deviceId,
      meta?.deviceName
    );

    await this.store.setPairedDevice(deviceId, {
      pairingToken,
      pairedAt,
      deviceName,
      platform: meta?.platform,
      system: meta?.system,
      playerVersion: meta?.playerVersion,
      systemVersion: meta?.systemVersion,
      ...(lastBootAt ? { lastBootAt } : {}),
      lastOnlineAt: this.isDeviceConnected(deviceId) ? now : undefined,
      lastOfflineAt: this.isDeviceConnected(deviceId) ? undefined : now
    });
    if (deviceName) {
      await this.seedRegistryDisplayNameIfEmpty(deviceId, deviceName);
    }
    await this.store.deletePendingCode(normalized);

    // First-pair races: hello may still be awaiting registry I/O, or the socket
    // briefly dropped between showing the code and verify. Wait a short window
    // before giving up — hello-heal will still deliver verified on reconnect.
    let ws = this.devices.get(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      ws = await this.waitForOpenDeviceSocket(deviceId, 5000);
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Re-read in case a concurrent hello path touched the record.
      const latest = await this.store.getPairedDevice(deviceId);
      const tokenToSend = latest?.pairingToken || pairingToken;
      if (latest && !latest.lastOnlineAt) {
        await this.store.setPairedDevice(deviceId, {
          ...latest,
          lastOnlineAt: now,
          lastOfflineAt: undefined
        });
      }
      this.sendPairingVerified(ws, deviceId, tokenToSend);
      this.afterDevicePairedNotify(deviceId);
    } else {
      console.warn(
        `[TomorrowOS] pairing verified in store for ${deviceId}, but device socket not ready; will heal on next hello`
      );
    }

    this.emit("device.paired", { deviceId });
    return { deviceId };
  }

  /** Remove pairing for a device and notify it over WebSocket if connected. */
  async pairingUnpair(deviceId: string): Promise<{ deviceId: string; notified: boolean }> {
    const id = String(deviceId || "").trim();
    if (!id) {
      const err = new Error("deviceId is required");
      (err as NodeJS.ErrnoException).code = "PAIRING_INVALID";
      throw err;
    }

    const paired = await this.store.getPairedDevice(id);
    const screenshotAssetId = paired?.lastScreenshotAssetId;

    if (paired?.deviceName?.trim()) {
      await this.persistRegistryDisplayName(id, paired.deviceName);
    }

    await this.store.deletePairedDevice(id);
    this.pendingDeviceMeta.delete(id);

    if (screenshotAssetId) {
      await this.deleteUploadedAssetIfUnreferenced(screenshotAssetId);
    }

    const ws = this.devices.get(id);
    let notified = false;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "pairing.unpaired",
          method: "tomorrowos.pairing.unpair",
          deviceId: id
        })
      );
      notified = true;
    }

    this.emit("device.unpaired", { deviceId: id });
    return { deviceId: id, notified };
  }

  pairing = {
    verify: (code: string) => this.pairingVerify(code),
    unpair: (deviceId: string) => this.pairingUnpair(deviceId)
  };

  /** List paired devices with live connection + timing fields for the CMS panel. */
  async listDevices(): Promise<DeviceListItem[]> {
    const entries = await this.store.listPairedDevices();
    const now = Date.now();

    return Promise.all(
      entries.map(async ({ deviceId, record }) => {
      const connected = this.isDeviceConnected(deviceId);
      const reg = await this.store.getDeviceRegistry(deviceId);
      const assignments = await this.store.getDeviceAssignments(deviceId);
      let screenOnlineActive = false;
      let screenOnlineLabel = "Not active";

      if (connected && record.lastBootAt) {
        const bootMs = new Date(record.lastBootAt).getTime();
        if (!Number.isNaN(bootMs)) {
          screenOnlineActive = true;
          screenOnlineLabel = formatDurationMs(now - bootMs);
        }
      }

      const screenOnlineSince =
        connected && record.lastBootAt ? record.lastBootAt : null;
      const logs = this.deviceLogs.get(deviceId) ?? [];
      const latestError = [...logs].reverse().find((entry) => entry.level === "error");
      let latestScreenshot: DeviceListItem["latestScreenshot"] = null;
      if (this.staticRoot) {
        try {
          const screenshot = await this.getLatestDeviceScreenshot(deviceId);
          if (screenshot?.url) {
            latestScreenshot = {
              url: screenshot.url,
              capturedAt: screenshot.capturedAt
            };
          }
        } catch {
          latestScreenshot = null;
        }
      }

      return {
        deviceId,
        pairingCode: reg?.permanentPairingCode ?? null,
        publishedPlaylists: assignments.map((a) => ({
          playlistId: a.playlistId,
          name: a.snapshot.name,
          publishedAt: a.publishedAt,
          schedule: a.snapshot.schedule
        })),
        connected,
        deviceName: record.deviceName ?? null,
        platform: record.platform ?? null,
        system: record.system ?? null,
        playerVersion: record.playerVersion ?? null,
        systemVersion: record.systemVersion ?? null,
        serialNumber: reg?.serialNumber ?? deviceId,
        pairedAt: record.pairedAt,
        lastBootAt: record.lastBootAt ?? null,
        lastOnlineAt: record.lastOnlineAt ?? null,
        lastOfflineAt: record.lastOfflineAt ?? null,
        lastPolicyPushAt: record.lastPolicyPushAt ?? null,
        screenOnlineActive,
        screenOnlineLabel,
        screenOnlineSince,
        latestErrorAt: latestError?.timestamp ?? null,
        latestErrorMessage: latestError?.message ?? null,
        latestScreenshot,
        onOffTimer: (() => {
          try {
            return record.onOffTimer
              ? normalizeOnOffTimer(record.onOffTimer)
              : null;
          } catch {
            return null;
          }
        })()
      };
    })
    );
  }

  /**
   * Persist a daily on/off timer (screen mute / HDMI power-save). Saved even if
   * offline; pushed to the player when connected.
   */
  async setDeviceOnOffTimer(
    deviceId: string,
    timerInput: unknown
  ): Promise<{
    deviceId: string;
    onOffTimer: DeviceOnOffTimer;
    pushed: boolean;
  }> {
    const id = String(deviceId || "").trim();
    if (!id) {
      throw new Error("deviceId is required");
    }

    const existing = await this.store.getPairedDevice(id);
    if (!existing) {
      throw new Error("Device is not paired");
    }

    const onOffTimer = normalizeOnOffTimer(timerInput);
    await this.store.setPairedDevice(id, {
      ...existing,
      onOffTimer
    });

    const pushed = await this.pushOnOffTimerToDevice(id);
    return { deviceId: id, onOffTimer, pushed };
  }

  /**
   * Clear the daily on/off timer and push null to the device.
   * Connected players drop the schedule and turn the screen back on.
   */
  async clearDeviceOnOffTimer(deviceId: string): Promise<{
    deviceId: string;
    onOffTimer: null;
    pushed: boolean;
  }> {
    const id = String(deviceId || "").trim();
    if (!id) {
      throw new Error("deviceId is required");
    }

    const existing = await this.store.getPairedDevice(id);
    if (!existing) {
      throw new Error("Device is not paired");
    }

    const { onOffTimer: _removed, ...rest } = existing;
    await this.store.setPairedDevice(id, rest);

    const pushed = await this.pushOnOffTimerToDevice(id);
    return { deviceId: id, onOffTimer: null, pushed };
  }

  private async pushOnOffTimerToDevice(deviceId: string): Promise<boolean> {
    const existing = await this.store.getPairedDevice(deviceId);
    if (!existing) return false;

    const ws = this.devices.get(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    try {
      const result = await this.sendCommandToSocket(
        ws,
        deviceId,
        "device.display.setOnOffTimer",
        { onOffTimer: existing.onOffTimer ?? null },
        15_000
      );
      return result.status === "success" || result.status === "accepted";
    } catch (err) {
      console.error("[TomorrowOS] pushOnOffTimer failed:", err);
      return false;
    }
  }

  async setDeviceName(deviceId: string, deviceName: string): Promise<{
    deviceId: string;
    deviceName: string;
  }> {
    const id = String(deviceId || "").trim();
    if (!id) {
      throw new Error("deviceId is required");
    }

    const existing = await this.store.getPairedDevice(id);
    if (!existing) {
      throw new Error("Device is not paired");
    }

    const normalized = String(deviceName || "").trim();
    if (!normalized) {
      throw new Error("deviceName is required");
    }

    await this.store.setPairedDevice(id, {
      ...existing,
      deviceName: normalized
    });
    await this.persistRegistryDisplayName(id, normalized);

    return { deviceId: id, deviceName: normalized };
  }

  /** Prefer CMS-saved display name; fall back to handshake hardware model on first pair. */
  private async resolveDeviceNameForPairing(
    deviceId: string,
    handshakeName?: string
  ): Promise<string | undefined> {
    const reg = await this.store.getDeviceRegistry(deviceId);
    const saved = reg?.displayName?.trim();
    if (saved) return saved;
    const fromHandshake = handshakeName?.trim();
    return fromHandshake || undefined;
  }

  private async persistRegistryDisplayName(
    deviceId: string,
    displayName: string
  ): Promise<void> {
    const reg = await this.store.getDeviceRegistry(deviceId);
    if (!reg) return;
    await this.store.setDeviceRegistry(deviceId, {
      ...reg,
      displayName: displayName.trim()
    });
  }

  /** First pair only — seed registry display name from device handshake when unset. */
  private async seedRegistryDisplayNameIfEmpty(
    deviceId: string,
    displayName: string
  ): Promise<void> {
    const reg = await this.store.getDeviceRegistry(deviceId);
    if (!reg || reg.displayName?.trim()) return;
    await this.store.setDeviceRegistry(deviceId, {
      ...reg,
      displayName: displayName.trim()
    });
  }

  private pushDeviceLog(deviceId: string, entry: DeviceLogEntry): void {
    const key = String(deviceId || "").trim();
    if (!key) return;
    const existing = this.deviceLogs.get(key) ?? [];
    existing.push(entry);
    if (existing.length > 80) existing.splice(0, existing.length - 80);
    this.deviceLogs.set(key, existing);
  }

  private getDeviceLogs(deviceId: string): DeviceLogEntry[] {
    const key = String(deviceId || "").trim();
    if (!key) return [];
    return [...(this.deviceLogs.get(key) ?? [])].reverse();
  }

  private isDeviceConnected(deviceId: string): boolean {
    const ws = this.devices.get(deviceId);
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Bind a live device socket. Never register a closed socket (avoids a late
   * hello overwriting a healthy reconnect with a dead peer).
   */
  private bindDeviceSocket(deviceId: string, ws: DeviceSocket): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;
    ws.deviceId = deviceId;
    this.devices.set(deviceId, ws);
    return true;
  }

  /** Wait briefly for the device WebSocket to appear (first-pair hello races). */
  private async waitForOpenDeviceSocket(
    deviceId: string,
    timeoutMs = 5000
  ): Promise<DeviceSocket | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const ws = this.devices.get(deviceId);
      if (ws && ws.readyState === WebSocket.OPEN) return ws;
      if (Date.now() >= deadline) return undefined;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private sendPairingVerified(
    ws: DeviceSocket,
    deviceId: string,
    pairingToken: string
  ): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "pairing.verified",
        method: "tomorrowos.pairing.verify",
        deviceId,
        pairingToken
      })
    );
  }

  private afterDevicePairedNotify(deviceId: string): void {
    void this.refreshPairedDeviceInfo(deviceId);
    void this.pushLatestPolicyToDevice(deviceId).catch((err) => {
      console.error("[TomorrowOS] pushLatestPolicy on paired failed:", err);
    });
    void this.pushOnOffTimerToDevice(deviceId).catch((err) => {
      console.error("[TomorrowOS] pushOnOffTimer on paired failed:", err);
    });
  }

  private captureHelloMeta(deviceId: string, msg: Record<string, unknown>): void {
    const bootUptimeSec = parseBootUptimeSec(msg);
    const platform =
      typeof msg.platform === "string" ? msg.platform : undefined;
    const system = typeof msg.system === "string" ? msg.system : undefined;
    this.pendingDeviceMeta.set(deviceId, {
      platform,
      deviceName: typeof msg.deviceName === "string" ? msg.deviceName : undefined,
      system: normalizeDeviceSystemLabel(platform, system),
      bootedAt: typeof msg.bootedAt === "string" ? msg.bootedAt : undefined,
      bootUptimeSec: bootUptimeSec ?? undefined,
      playerVersion:
        typeof msg.playerVersion === "string" ? msg.playerVersion : undefined,
      systemVersion:
        typeof msg.systemVersion === "string" ? msg.systemVersion : undefined,
      serialNumber:
        typeof msg.serialNumber === "string" ? msg.serialNumber : deviceId
    });
  }

  private async getOrCreatePermanentPairingCode(
    deviceId: string,
    serialNumber?: string
  ): Promise<string> {
    const existing = await this.store.getDeviceRegistry(deviceId);
    if (existing?.permanentPairingCode) {
      await this.store.setDeviceRegistry(deviceId, {
        ...existing,
        serialNumber: serialNumber ?? existing.serialNumber ?? deviceId,
        lastHelloAt: Date.now()
      });
      return existing.permanentPairingCode;
    }

    const stableIdentity = String(serialNumber || deviceId || "").trim();
    const secret = resolvePairingCodeSecret();

    for (let attempt = 0; attempt < 32; attempt += 1) {
      const code = stableIdentity
        ? generateDeterministicPairingCode(stableIdentity, { secret, attempt })
        : generateRandomPairingCode();
      const collision = await this.store.getDeviceRegistryByCode(code);
      if (collision && collision.deviceId !== deviceId) continue;

      const now = Date.now();
      await this.store.setDeviceRegistry(deviceId, {
        permanentPairingCode: code,
        codeCreatedAt: now,
        serialNumber: serialNumber ?? deviceId,
        firstSeenAt: now,
        lastHelloAt: now
      });
      return code;
    }

    throw new Error("Failed to allocate unique pairing code");
  }

  private async mergePairedRecord(
    deviceId: string,
    patch: Partial<PairedDeviceRecord>
  ): Promise<void> {
    const existing = await this.store.getPairedDevice(deviceId);
    if (!existing) return;
    await this.store.setPairedDevice(deviceId, { ...existing, ...patch });
  }

  private async touchPairedOnline(
    deviceId: string,
    msg: Record<string, unknown>
  ): Promise<void> {
    this.captureHelloMeta(deviceId, msg);
    const now = new Date().toISOString();
    const existing = await this.store.getPairedDevice(deviceId);
    if (!existing) return;

    const lastBootAt = lastBootAtFromHandshake(msg, existing.lastBootAt);
    const platform =
      (typeof msg.platform === "string" ? msg.platform : undefined) ??
      existing.platform;
    const system =
      normalizeDeviceSystemLabel(
        platform,
        typeof msg.system === "string" ? msg.system : existing.system
      ) ?? existing.system;
    const playerVersion =
      (typeof msg.playerVersion === "string" ? msg.playerVersion : undefined) ??
      existing.playerVersion;
    const systemVersion =
      (typeof msg.systemVersion === "string" ? msg.systemVersion : undefined) ??
      existing.systemVersion;

    await this.store.setPairedDevice(deviceId, {
      ...existing,
      platform,
      system,
      playerVersion,
      systemVersion,
      ...(lastBootAt ? { lastBootAt } : {}),
      lastOnlineAt: now,
      lastOfflineAt: existing.lastOfflineAt
    });
  }

  private async touchPairedOffline(deviceId: string): Promise<void> {
    const existing = await this.store.getPairedDevice(deviceId);
    if (!existing) return;
    await this.store.setPairedDevice(deviceId, {
      ...existing,
      lastOfflineAt: new Date().toISOString(),
      lastOnlineAt: undefined
    });
  }

  /** Mark device offline immediately (e.g. reboot) before WebSocket close propagates. */
  private forceDeviceOffline(deviceId: string): void {
    const ws = this.devices.get(deviceId);
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (this.devices.get(deviceId) === ws) {
        this.devices.delete(deviceId);
      }
    }
    void this.touchPairedOffline(deviceId);
    this.emit("device.offline", {
      deviceId,
      lastSeen: new Date().toISOString()
    });
  }

  private async recordPolicyPush(deviceId: string): Promise<void> {
    await this.mergePairedRecord(deviceId, {
      lastPolicyPushAt: new Date().toISOString()
    });
  }

  private async refreshPairedDeviceInfo(deviceId: string): Promise<void> {
    const ws = this.devices.get(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const existing = await this.store.getPairedDevice(deviceId);
    if (!existing) return;

    try {
      const result = await this.sendCommandToSocket<{
        model?: string;
        firmware?: string;
        deviceId?: string;
        systemVersion?: string;
      }>(ws, deviceId, "device.info.get", {}, 15_000);

      if (result.status !== "success" || !result.data) return;

      const firmware =
        typeof result.data.firmware === "string"
          ? result.data.firmware
          : undefined;
      const systemVersion =
        typeof result.data.systemVersion === "string"
          ? result.data.systemVersion
          : undefined;
      const platform = normalizeDevicePlatform(existing.platform, existing.system);

      await this.store.setPairedDevice(deviceId, {
        ...existing,
        system: formatDeviceSystemForFirmware(
          platform,
          firmware,
          existing.system
        ),
        platform: platform ?? existing.platform,
        systemVersion: systemVersion ?? existing.systemVersion
      });
    } catch {
      /* ignore — panel still shows hello metadata */
    }
  }

  device(deviceId: string) {
    const self = this;
    return {
      async sendCommand<T = unknown>(
        method: string,
        params: Record<string, unknown> = {}
      ): Promise<{ status: string; data?: T; error?: string; stack?: string }> {
        const ws = self.devices.get(deviceId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("Device not connected");
        }
        return self.sendCommandToSocket(ws, deviceId, method, params);
      }
    };
  }

  private sendCommandToSocket<T = unknown>(
    ws: WebSocket,
    deviceId: string,
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 60_000
  ): Promise<{ status: string; data?: T; error?: string; stack?: string }> {
    const commandId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.removeListener("message", onMessage);
        reject(new Error(`Command timeout: ${method}`));
      }, timeoutMs);

      const onMessage = (data: WebSocket.RawData) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(data)) as Record<string, unknown>;
        } catch {
          return;
        }
        if (
          msg.type === "command.result" &&
          msg.commandId === commandId &&
          msg.method === method
        ) {
          clearTimeout(timer);
          ws.removeListener("message", onMessage);
          const status = String(msg.status ?? "unknown");
          if (status === "failed") {
            const error = new Error(String(msg.error ?? "Command failed"));
            this.emit("command.failed", {
              commandId,
              method,
              deviceId,
              error
            });
            resolve({
              status,
              error: String(msg.error),
              stack: msg.stack as string | undefined
            });
            return;
          }
          this.emit("command.verified", { commandId, method, deviceId });
          resolve({ status, data: msg.data as T });
        }
      };

      ws.on("message", onMessage);
      ws.send(
        JSON.stringify({
          type: "command",
          commandId,
          method,
          params
        })
      );
    });
  }

  /** Best-effort LAN URL for local screens (e.g. http://192.168.1.10:3000). */
  private getSuggestedCmsUrl(): string | null {
    const ip = detectPrimaryLanIpv4();
    const port = this.listenPort;
    if (!ip || port == null || !Number.isFinite(port)) return null;
    return `http://${ip}:${port}`;
  }

  listen(options: ListenOptions): http.Server {
    const { port, host = "0.0.0.0", staticRoot, staticIndex } = options;
    this.listenPort = port;
    this.staticRoot = staticRoot ?? null;
    if (this.staticRoot) {
      const idx = (staticIndex ?? "index.html").trim().replace(/^[\\/]+/, "") || "index.html";
      if (idx.includes("..")) {
        throw new Error("staticIndex must not contain '..'");
      }
      this.staticIndexFile = idx;
      const uploadsDir = path.join(path.resolve(this.staticRoot), "uploads");
      void fs.mkdir(uploadsDir, { recursive: true });
      void this.refreshResolvedBrandLogo();
    } else {
      this.staticIndexFile = "index.html";
    }

    const server = http.createServer((req, res) => {
      void this.handleHttp(req, res);
    });

    // Match Vercel Functions WebSocket pattern: attach ws to the http.Server
    // (https://vercel.com/docs/functions/websockets). Path filter keeps non-CMS
    // upgrades from being accepted when the same process hosts other routes.
    const allowedWsPaths = normalizeWebSocketPaths(options.webSocketPaths);
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
      if (!request.url) {
        socket.destroy();
        return;
      }
      const { pathname } = new URL(request.url, `http://${request.headers.host}`);
      if (!isAllowedWebSocketPath(pathname, allowedWsPaths)) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket as Duplex, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });

    wss.on("connection", (ws: DeviceSocket) => {
      this.handleConnection(ws);
    });

    this.serverStartedAt = new Date().toISOString();

    const onVercel = Boolean(process.env.VERCEL);
    const shouldListen = options.autoListen ?? !onVercel;
    if (shouldListen) {
      server.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(`[TomorrowOS] listening on http://${host}:${port}`);
      });
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[TomorrowOS] http.Server ready (autoListen=false${onVercel ? ", Vercel" : ""}; export default server)`
      );
    }

    this.httpServer = server;
    this.wss = wss;
    return server;
  }

  private async handleMediaUpload(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL
  ): Promise<void> {
    if (!this.staticRoot) {
      sendJson(res, 400, { status: "failed", error: "staticRoot is not configured" });
      return;
    }

    try {
      const body = await readRawBody(req, MAX_MEDIA_UPLOAD_BYTES);
      if (body.length === 0) {
        sendJson(res, 400, { status: "failed", error: "Empty upload body" });
        return;
      }

      const rawName = url.searchParams.get("filename") || "upload";
      const safeName = sanitizeUploadFilename(rawName);
      const mimeType =
        typeof req.headers["content-type"] === "string"
          ? req.headers["content-type"]
          : undefined;
      const { asset, deduplicated } = await this.storeUploadedMediaAsset(
        body,
        safeName,
        mimeType
      );

      const durationMs = probeVideoDurationMs(body, safeName);
      const payload: Record<string, unknown> = {
        status: "success",
        url: asset.url,
        assetId: asset.id,
        filename: isRemoteUploadedAssetUrl(asset.url) ? safeName : asset.storageKey,
        size: asset.bytes ?? body.length,
        contentHash: asset.sha256,
        deduplicated
      };
      if (durationMs != null) payload.durationMs = durationMs;

      sendJson(res, 200, payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      sendJson(res, 400, { status: "failed", error: msg });
    }
  }

  private async storeUploadedMediaAsset(
    body: Buffer,
    safeName: string,
    mimeType?: string
  ): Promise<{ asset: UploadedAssetRecord; deduplicated: boolean }> {
    const sha256 = contentHashHex(body);
    const cloudinaryConfig = resolveCloudinaryConfig();

    const existing = await this.store.getUploadedAssetBySha256(sha256);
    if (existing) {
      if (isRemoteUploadedAssetUrl(existing.url)) {
        return { asset: existing, deduplicated: true };
      }

      const existingLocalPath = path.join(
        path.resolve(this.staticRoot || "."),
        "uploads",
        existing.storageKey
      );
      try {
        const stat = await fs.stat(existingLocalPath);
        if (stat.size === body.length) {
          return { asset: existing, deduplicated: true };
        }
      } catch {
        // Local file is missing; rewrite it below and update this asset record.
      }
    }

    const now = new Date().toISOString();
    const resourceType = inferResourceType(mimeType, safeName);

    if (cloudinaryConfig) {
      const uploaded = await uploadBufferToCloudinary(body, {
        config: cloudinaryConfig,
        publicId: sha256,
        filename: safeName
      });
      const asset: UploadedAssetRecord = {
        id: randomUUID(),
        sha256,
        storageKey: uploaded.publicId,
        url: uploaded.secureUrl,
        originalFilename: safeName,
        mimeType,
        resourceType: uploaded.resourceType || resourceType,
        bytes: uploaded.bytes ?? body.length,
        createdAt: now,
        updatedAt: now
      };
      await this.store.setUploadedAsset(asset);
      return { asset, deduplicated: false };
    }

    const uploadsDir = path.join(path.resolve(this.staticRoot || "."), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    const { storedName, deduplicated } = await storeUploadIfNeeded(
      uploadsDir,
      body,
      safeName
    );
    const asset: UploadedAssetRecord = {
      id: existing?.id ?? randomUUID(),
      sha256,
      storageKey: storedName,
      url: `/uploads/${storedName}`,
      originalFilename: safeName,
      mimeType,
      resourceType,
      bytes: body.length,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await this.store.setUploadedAsset(asset);
    return { asset, deduplicated };
  }

  private getAssetIdsFromItems(items: PlaylistItemRecord[] | undefined): Set<string> {
    const ids = new Set<string>();
    for (const item of items ?? []) {
      const assetId = String(item.assetId || "").trim();
      if (assetId) ids.add(assetId);
    }
    return ids;
  }

  private async isUploadedAssetReferenced(assetId: string): Promise<boolean> {
    const playlists = await this.store.listPlaylists();
    return playlists.some((playlist) => {
      if (playlist.retired) return false;
      return playlist.items.some((item) => item.assetId === assetId);
    });
  }

  private async releaseRemovedPlaylistAssets(
    previousItems: PlaylistItemRecord[] | undefined,
    nextItems: PlaylistItemRecord[] | undefined
  ): Promise<void> {
    const previous = this.getAssetIdsFromItems(previousItems);
    const next = this.getAssetIdsFromItems(nextItems);
    const removed = [...previous].filter((assetId) => !next.has(assetId));

    for (const assetId of removed) {
      await this.deleteUploadedAssetIfUnreferenced(assetId);
    }
  }

  private async isUploadedAssetReferencedAsDeviceScreenshot(
    assetId: string
  ): Promise<boolean> {
    const devices = await this.store.listPairedDevices();
    return devices.some((entry) => entry.record.lastScreenshotAssetId === assetId);
  }

  private async deleteUploadedAssetIfUnreferenced(assetId: string): Promise<void> {
    try {
      if (await this.isUploadedAssetReferenced(assetId)) return;
      if (await this.isUploadedAssetReferencedAsDeviceScreenshot(assetId)) return;

      const asset = await this.store.getUploadedAsset(assetId);
      if (!asset) return;

      if (isRemoteUploadedAssetUrl(asset.url)) {
        const cloudinaryConfig = resolveCloudinaryConfig();
        if (!cloudinaryConfig) {
          console.warn(
            `[TomorrowOS] Cloudinary config missing; cannot delete asset ${asset.id}.`
          );
          return;
        }
        await deleteCloudinaryAsset(
          cloudinaryConfig,
          asset.storageKey,
          asset.resourceType || "image"
        );
      }

      await this.store.deleteUploadedAsset(asset.id);
    } catch (err) {
      console.warn("[TomorrowOS] uploaded asset cleanup failed:", err);
    }
  }

  private async refreshResolvedBrandLogo(): Promise<void> {
    if (!this.staticRoot) return;
    try {
      await syncProjectAssetsToStaticRoot(this.staticRoot);
      const logoPath = await resolveBrandLogoPath(
        this.staticRoot,
        this.brand.logoPath
      );
      if (logoPath) {
        this.brand.logoPath = logoPath;
        console.log(`[TomorrowOS] brand logo: ${logoPath}`);
      }
    } catch (err) {
      console.warn("[TomorrowOS] brand logo resolve failed:", err);
    }
  }

  private async tryServeStatic(
    pathname: string,
    res: http.ServerResponse
  ): Promise<boolean> {
    if (!this.staticRoot) return false;

    let relRaw =
      pathname === "/" || pathname === "" ? this.staticIndexFile : pathname.slice(1);
    let rel = relRaw;
    try {
      // Browser path segments are percent-encoded for spaces/non-ASCII.
      // Decode before mapping to filesystem path.
      rel = decodeURIComponent(relRaw);
    } catch {
      return false;
    }
    if (!rel || rel.includes("..")) return false;

    const rootResolved = path.resolve(this.staticRoot);
    const filePath = path.resolve(rootResolved, rel);
    const relativeToRoot = path.relative(rootResolved, filePath);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      return false;
    }

    try {
      const buf = await fs.readFile(filePath);
      const ext = path.extname(rel).toLowerCase();
      const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif"
      };
      const ctype = types[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": ctype });
      res.end(buf);
      return true;
    } catch {
      return false;
    }
  }

  private getLegacyScreenshotsDir(): string {
    if (!this.staticRoot) {
      throw new Error("Screenshot storage requires listen({ staticRoot })");
    }
    return path.join(path.resolve(this.staticRoot), "screenshots");
  }

  private screenshotExtension(mimeType: string): string {
    const normalized = mimeType.toLowerCase();
    if (normalized === "image/png") return ".png";
    if (normalized === "image/webp") return ".webp";
    return ".jpg";
  }

  private async getLegacyDeviceScreenshot(
    deviceId: string
  ): Promise<DeviceScreenshotInfo | null> {
    if (!this.staticRoot) return null;

    const base = sanitizeStorageSegment(deviceId);
    const metaPath = path.join(this.getLegacyScreenshotsDir(), `${base}.json`);
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const parsed = JSON.parse(raw) as DeviceScreenshotInfo;
      if (!parsed || typeof parsed.url !== "string") return null;
      return {
        deviceId,
        url: parsed.url,
        capturedAt: parsed.capturedAt,
        mimeType: parsed.mimeType || "image/jpeg",
        width: parsed.width,
        height: parsed.height
      };
    } catch {
      return null;
    }
  }

  private async saveDeviceScreenshot(
    deviceId: string,
    payload: DeviceScreenshotPayload
  ): Promise<DeviceScreenshotInfo> {
    const mimeType =
      typeof payload.mimeType === "string" && payload.mimeType.startsWith("image/")
        ? payload.mimeType
        : "image/jpeg";
    const dataBase64 =
      typeof payload.dataBase64 === "string" ? payload.dataBase64 : "";
    if (!dataBase64.trim()) {
      throw new Error("Screenshot payload missing dataBase64");
    }

    const capturedAt =
      typeof payload.capturedAt === "string" && payload.capturedAt.trim()
        ? payload.capturedAt
        : new Date().toISOString();
    const body = Buffer.from(dataBase64, "base64");
    const safeName = sanitizeUploadFilename(
      `screenshot-${sanitizeStorageSegment(deviceId)}-${Date.now()}${this.screenshotExtension(mimeType)}`
    );

    const paired = await this.store.getPairedDevice(deviceId);
    const previousAssetId = paired?.lastScreenshotAssetId;

    const { asset } = await this.storeUploadedMediaAsset(body, safeName, mimeType);
    if (paired) {
      await this.store.setPairedDevice(deviceId, {
        ...paired,
        lastScreenshotAssetId: asset.id,
        lastScreenshotCapturedAt: capturedAt
      });
    }

    if (previousAssetId && previousAssetId !== asset.id) {
      await this.deleteUploadedAssetIfUnreferenced(previousAssetId);
    }

    return {
      deviceId,
      assetId: asset.id,
      url: asset.url,
      capturedAt,
      mimeType: asset.mimeType || mimeType,
      width: typeof payload.width === "number" ? payload.width : undefined,
      height: typeof payload.height === "number" ? payload.height : undefined
    };
  }

  private async getLatestDeviceScreenshot(
    deviceId: string
  ): Promise<DeviceScreenshotInfo | null> {
    const paired = await this.store.getPairedDevice(deviceId);
    const assetId = paired?.lastScreenshotAssetId;
    const capturedAt = paired?.lastScreenshotCapturedAt;
    if (assetId && capturedAt) {
      const asset = await this.store.getUploadedAsset(assetId);
      if (asset) {
        return {
          deviceId,
          assetId: asset.id,
          url: asset.url,
          capturedAt,
          mimeType: asset.mimeType || "image/jpeg"
        };
      }
    }

    return this.getLegacyDeviceScreenshot(deviceId);
  }

  private async captureDeviceScreenshot(deviceId: string): Promise<DeviceScreenshotInfo> {
    const result = await this.sendDeviceCommand(deviceId, "device.captureScreen", {});
    if (result.status === "failed") {
      throw new Error(String(result.error ?? "Screenshot failed"));
    }

    const data = (result.data ?? {}) as Record<string, unknown>;
    const screenshot =
      data.screenshot && typeof data.screenshot === "object"
        ? (data.screenshot as DeviceScreenshotPayload)
        : (data as DeviceScreenshotPayload);
    return this.saveDeviceScreenshot(deviceId, screenshot);
  }

  private async handleHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const pathname = url.pathname;

      /** Same-origin brand for TomorrowOS players (e.g. GET /brand.json + applyBrand). */
      if (req.method === "GET" && pathname === "/brand.json") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(this.brand));
        return;
      }

      if (req.method === "GET" && pathname === "/status") {
        const report = await buildServerStatus({
          store: this.store,
          staticRoot: this.staticRoot
        });
        const suggestedCmsUrl = this.getSuggestedCmsUrl();
        sendJson(res, 200, {
          ...(report as unknown as Record<string, unknown>),
          ...(suggestedCmsUrl ? { suggestedCmsUrl } : {})
        });
        return;
      }

      if (req.method === "POST" && pathname === "/media/upload") {
        await this.handleMediaUpload(req, res, url);
        return;
      }

      if (req.method === "GET" && this.staticRoot) {
        const served = await this.tryServeStatic(pathname, res);
        if (served) return;
      }

      if (req.method === "POST" && pathname === "/pairing/verify") {
        const body = (await readJsonBody(req)) as { code?: string };
        const code = typeof body.code === "string" ? body.code : "";
        try {
          const { deviceId } = await this.pairingVerify(code);
          sendJson(res, 200, { status: "success", deviceId });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Verify failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      if (req.method === "POST" && pathname === "/pairing/unpair") {
        const body = (await readJsonBody(req)) as { deviceId?: string };
        const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
        try {
          const result = await this.pairingUnpair(deviceId);
          sendJson(res, 200, { status: "success", ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unpair failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      if (req.method === "GET" && pathname === "/devices") {
        const devices = await this.listDevices();
        sendJson(res, 200, {
          status: "success",
          devices,
          serverStartedAt: this.serverStartedAt
        });
        return;
      }

      const deviceNamePatch = /^\/device\/([^/]+)\/name$/.exec(pathname);
      if (req.method === "PATCH" && deviceNamePatch) {
        const deviceId = decodeURIComponent(deviceNamePatch[1]);
        const body = (await readJsonBody(req)) as { deviceName?: string };
        try {
          const result = await this.setDeviceName(
            deviceId,
            typeof body.deviceName === "string" ? body.deviceName : ""
          );
          sendJson(res, 200, { status: "success", ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Rename failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      const deviceOnOffTimer = /^\/device\/([^/]+)\/on-off-timer$/.exec(pathname);
      if (req.method === "POST" && deviceOnOffTimer) {
        const deviceId = decodeURIComponent(deviceOnOffTimer[1]);
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        try {
          if (body.clear === true || body.onOffTimer === null) {
            const result = await this.clearDeviceOnOffTimer(deviceId);
            sendJson(res, 200, { status: "success", ...result });
          } else {
            const result = await this.setDeviceOnOffTimer(
              deviceId,
              body.onOffTimer ?? body
            );
            sendJson(res, 200, { status: "success", ...result });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "On/off timer failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      if (req.method === "DELETE" && deviceOnOffTimer) {
        const deviceId = decodeURIComponent(deviceOnOffTimer[1]);
        try {
          const result = await this.clearDeviceOnOffTimer(deviceId);
          sendJson(res, 200, { status: "success", ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "On/off timer clear failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      if (req.method === "GET" && pathname === "/playlists") {
        const playlists = await this.playlists.listPlaylists();
        sendJson(res, 200, { status: "success", playlists });
        return;
      }

      if (req.method === "POST" && pathname === "/playlists") {
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        try {
          const playlistId = typeof body.id === "string" ? body.id : undefined;
          const previous = playlistId
            ? await this.store.getPlaylist(playlistId)
            : undefined;
          const items = Array.isArray(body.items)
            ? (body.items as PlaylistItemRecord[])
            : [];
          const saved = await this.playlists.savePlaylist({
            id: playlistId,
            name: String(body.name ?? ""),
            schedule:
              body.schedule && typeof body.schedule === "object"
                ? (body.schedule as PlaylistSchedule)
                : undefined,
            items
          });
          await this.releaseRemovedPlaylistAssets(previous?.items, saved.items);
          const paired = await this.store.listPairedDevices();
          const deployResults: Array<{
            deviceId: string;
            assigned: boolean;
            pushed: boolean;
            error?: string;
          }> = [];

          for (const entry of paired) {
            const deviceId = entry.deviceId;
            try {
              const refreshed = await this.playlists.refreshPlaylistSnapshotOnDevice(
                deviceId,
                saved.id
              );
              if (!refreshed.updated || !refreshed.built) {
                deployResults.push({ deviceId, assigned: false, pushed: false });
                continue;
              }

              const ws = this.devices.get(deviceId);
              if (!ws || ws.readyState !== WebSocket.OPEN) {
                deployResults.push({ deviceId, assigned: true, pushed: false });
                continue;
              }

              await this.sendDeviceCommand(deviceId, "device.content.setPolicy", {
                policy: refreshed.built.policy
              });
              await this.recordPolicyPush(deviceId);
              deployResults.push({ deviceId, assigned: true, pushed: true });
            } catch (err) {
              deployResults.push({
                deviceId,
                assigned: true,
                pushed: false,
                error: err instanceof Error ? err.message : "push failed"
              });
            }
          }

          sendJson(res, 200, {
            status: "success",
            playlist: saved,
            deploy: {
              assignedDevices: deployResults.filter((x) => x.assigned).length,
              pushedDevices: deployResults.filter((x) => x.pushed).length,
              results: deployResults
            }
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Save failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      const playlistDelete = /^\/playlists\/([^/]+)$/.exec(pathname);
      if (req.method === "DELETE" && playlistDelete) {
        const playlistId = decodeURIComponent(playlistDelete[1]);
        try {
          const retired = await this.playlists.retirePlaylist(playlistId);
          sendJson(res, 200, { status: "success", playlist: retired });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Delete failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      const deviceAssignmentsGet = /^\/device\/([^/]+)\/assignments$/.exec(pathname);
      if (req.method === "GET" && deviceAssignmentsGet) {
        const deviceId = decodeURIComponent(deviceAssignmentsGet[1]);
        const assignments = await this.playlists.getDeviceAssignments(deviceId);
        sendJson(res, 200, { status: "success", assignments });
        return;
      }

      const deviceLogsGet = /^\/device\/([^/]+)\/logs$/.exec(pathname);
      if (req.method === "GET" && deviceLogsGet) {
        const deviceId = decodeURIComponent(deviceLogsGet[1]);
        sendJson(res, 200, { status: "success", logs: this.getDeviceLogs(deviceId) });
        return;
      }

      const deviceScreenshot = /^\/device\/([^/]+)\/screenshot$/.exec(pathname);
      if (req.method === "POST" && deviceScreenshot) {
        const deviceId = decodeURIComponent(deviceScreenshot[1]);
        try {
          const screenshot = await this.captureDeviceScreenshot(deviceId);
          sendJson(res, 200, { status: "success", screenshot });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Screenshot failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      const latestScreenshot = /^\/device\/([^/]+)\/screenshot\/latest$/.exec(pathname);
      if (req.method === "GET" && latestScreenshot) {
        const deviceId = decodeURIComponent(latestScreenshot[1]);
        try {
          const screenshot = await this.getLatestDeviceScreenshot(deviceId);
          if (!screenshot) {
            sendJson(res, 404, { status: "failed", error: "No screenshot captured yet" });
            return;
          }
          sendJson(res, 200, { status: "success", screenshot });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Screenshot lookup failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      if (req.method === "DELETE" && deviceAssignmentsGet) {
        const deviceId = decodeURIComponent(deviceAssignmentsGet[1]);
        try {
          const built = await this.playlists.clearAllAssignmentsFromDevice(deviceId);
          const ws = this.devices.get(deviceId);
          let policyPushed = false;
          let policyResult: Awaited<ReturnType<TomorrowOS["sendDeviceCommand"]>> | null =
            null;
          if (ws && ws.readyState === WebSocket.OPEN) {
            policyResult = await this.sendDeviceCommand(
              deviceId,
              "device.content.setPolicy",
              { policy: built.policy }
            );
            policyPushed = policyResult.status === "success";
            if (policyPushed) await this.recordPolicyPush(deviceId);
          }
          sendJson(res, 200, {
            status: "success",
            assignmentsCleared: true,
            policyPushed,
            policy: built.policy,
            result: policyResult
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Clear assignments failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      const deviceAssignmentsPost = /^\/device\/([^/]+)\/assignments$/.exec(pathname);
      if (req.method === "POST" && deviceAssignmentsPost) {
        const deviceId = decodeURIComponent(deviceAssignmentsPost[1]);
        const body = (await readJsonBody(req)) as {
          playlistIds?: string[];
          useLatest?: boolean;
          mediaBaseUrl?: string;
        };
        const ws = this.devices.get(deviceId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          sendJson(res, 404, { status: "failed", error: "Device not connected" });
          return;
        }
        try {
          let built;
          const mediaBaseUrl =
            typeof body.mediaBaseUrl === "string" ? body.mediaBaseUrl : undefined;
          if (body.useLatest === true) {
            built = await this.playlists.buildPolicyForDevice(deviceId, {
              useLatest: true,
              mediaBaseUrl
            });
          } else {
            const ids = Array.isArray(body.playlistIds) ? body.playlistIds : [];
            built = await this.playlists.publishPlaylistsToDevice(deviceId, ids, {
              mediaBaseUrl
            });
          }
          const result = await this.sendDeviceCommand(deviceId, "device.content.setPolicy", {
            policy: built.policy
          });
          await this.recordPolicyPush(deviceId);
          sendJson(res, 200, { status: "success", policy: built.policy, result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Publish failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      const deviceAssignmentDelete =
        /^\/device\/([^/]+)\/assignments\/([^/]+)$/.exec(pathname);
      if (req.method === "DELETE" && deviceAssignmentDelete) {
        const deviceId = decodeURIComponent(deviceAssignmentDelete[1]);
        const playlistId = decodeURIComponent(deviceAssignmentDelete[2]);
        const ws = this.devices.get(deviceId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          sendJson(res, 404, { status: "failed", error: "Device not connected" });
          return;
        }
        try {
          const built = await this.playlists.removePlaylistFromDevice(
            deviceId,
            playlistId
          );
          const result = await this.sendDeviceCommand(deviceId, "device.content.setPolicy", {
            policy: built.policy
          });
          await this.recordPolicyPush(deviceId);
          sendJson(res, 200, { status: "success", policy: built.policy, result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Remove failed";
          sendJson(res, 400, { status: "failed", error: msg });
        }
        return;
      }

      if (req.method === "POST") {
        const parsed = parseDevicePath(pathname);
        if (parsed) {
          await this.handleDeviceHttp(req, res, parsed);
          return;
        }
      }

      sendJson(res, 404, { status: "failed", error: "Not found" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server error";
      sendJson(res, 500, { status: "failed", error: msg });
    }
  }

  private async handleDeviceHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    parsed: { deviceId: string; action: string }
  ): Promise<void> {
    const { deviceId, action } = parsed;
    const ws = this.devices.get(deviceId);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      sendJson(res, 404, { status: "failed", error: "Device not connected" });
      return;
    }

    let method: string;
    let params: Record<string, unknown> = {};

    switch (action) {
      case "get-info":
        method = "device.info.get";
        break;
      case "get-capabilities":
        method = "device.info.getCapabilities";
        break;
      case "reboot":
        method = "device.power.reboot";
        break;
      case "content/set-policy": {
        method = "device.content.setPolicy";
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        if (!body.policy || typeof body.policy !== "object") {
          sendJson(res, 400, {
            status: "failed",
            error: "Invalid payload. Provide params.policy object."
          });
          return;
        }
        params = { policy: body.policy };
        break;
      }
      case "content/clear":
        method = "device.content.clear";
        break;
      default:
        sendJson(res, 404, { status: "failed", error: "Unknown device action" });
        return;
    }

    try {
      const result = await this.sendCommandToSocket(ws, deviceId, method, params);
      if (result.status === "failed") {
        sendJson(res, 500, {
          status: result.status,
          error: result.error ?? "Command failed",
          stack: result.stack
        });
        return;
      }
      if (action === "content/set-policy" && result.status === "success") {
        await this.recordPolicyPush(deviceId);
      }

      if (
        action === "reboot" &&
        (result.status === "success" || result.status === "accepted")
      ) {
        this.forceDeviceOffline(deviceId);
      }

      if (
        action === "content/clear" &&
        (result.status === "success" || result.status === "accepted")
      ) {
        const built = await this.playlists.clearAllAssignmentsFromDevice(deviceId);
        let assignmentsCleared = true;
        let policyPushed = false;
        if (ws.readyState === WebSocket.OPEN) {
          const policyResult = await this.sendDeviceCommand(
            deviceId,
            "device.content.setPolicy",
            { policy: built.policy }
          );
          policyPushed = policyResult.status === "success";
          if (policyPushed) await this.recordPolicyPush(deviceId);
        }
        sendJson(res, 200, {
          status: result.status,
          data: result.data,
          assignmentsCleared,
          policyPushed,
          policy: built.policy
        });
        return;
      }

      sendJson(res, 200, { status: result.status, data: result.data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Command failed";
      sendJson(res, 500, { status: "failed", error: msg });
    }
  }

  private sendBrandSnapshot(ws: DeviceSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "brand.snapshot",
        method: "tomorrowos.brand.snapshot",
        brand: this.brand
      })
    );
  }

  private handleConnection(ws: DeviceSocket): void {
    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;

      if (type === "device.hello") {
        const deviceId = resolveHelloDeviceId(msg) ?? randomUUID();
        const serialNumber =
          typeof msg.serialNumber === "string" && msg.serialNumber.trim()
            ? msg.serialNumber.trim()
            : deviceId;

        // Bind identity before await so close can reconcile, and so verify can
        // find this socket if pairing completes during registry I/O.
        ws.deviceId = deviceId;
        if (ws.readyState === WebSocket.OPEN) {
          this.devices.set(deviceId, ws);
        }

        void (async () => {
          try {
            const code = await this.getOrCreatePermanentPairingCode(
              deviceId,
              serialNumber
            );

            if (!this.bindDeviceSocket(deviceId, ws)) {
              return;
            }

            this.captureHelloMeta(deviceId, msg);

            // Heal first-pair miss: CMS already paired but player never got
            // pairing.verified (socket missing at verify time). Send verified
            // instead of showing the pairing code again.
            const paired = await this.store.getPairedDevice(deviceId);
            if (paired?.pairingToken) {
              await this.touchPairedOnline(deviceId, msg);
              this.sendBrandSnapshot(ws);
              this.sendPairingVerified(ws, deviceId, paired.pairingToken);
              this.afterDevicePairedNotify(deviceId);
              this.emit("device.online", { deviceId });
              return;
            }

            void this.store.setPendingCode(code, {
              deviceId,
              createdAt: Date.now()
            });

            this.sendBrandSnapshot(ws);
            ws.send(
              JSON.stringify({
                type: "pairing.code",
                method: "tomorrowos.pairing.createCode",
                code,
                deviceId,
                serialNumber
              })
            );
            this.emit("device.online", { deviceId });
          } catch (err) {
            console.error("[TomorrowOS] device.hello failed:", err);
          }
        })();
        return;
      }

      if (type === "device.resume") {
        const deviceId = String(msg.deviceId ?? "");
        const pairingToken = String(msg.pairingToken ?? "");

        void (async () => {
          const record = await this.store.getPairedDevice(deviceId);
          if (!record || record.pairingToken !== pairingToken) {
            ws.send(
              JSON.stringify({
                type: "device.resume.failed",
                reason: "Invalid pairing token"
              })
            );
            return;
          }

          this.captureHelloMeta(deviceId, msg);
          if (!this.bindDeviceSocket(deviceId, ws)) {
            return;
          }
          await this.touchPairedOnline(deviceId, msg);

          ws.send(
            JSON.stringify({
              type: "device.resumed",
              method: "tomorrowos.pairing.resume",
              deviceId
            })
          );
          this.sendBrandSnapshot(ws);
          void this.refreshPairedDeviceInfo(deviceId);
          this.emit("device.online", { deviceId });
          void this.pushLatestPolicyToDevice(deviceId).catch((err) => {
            console.error("[TomorrowOS] pushLatestPolicy on resume failed:", err);
          });
          void this.pushOnOffTimerToDevice(deviceId).catch((err) => {
            console.error("[TomorrowOS] pushOnOffTimer on resume failed:", err);
          });
        })();
        return;
      }

      if (type === "device.ping") {
        ws.send(
          JSON.stringify({
            type: "device.pong",
            timestamp: new Date().toISOString()
          })
        );
        const deviceId = ws.deviceId;
        if (deviceId) {
          const timestamp =
            typeof msg.timestamp === "string" && msg.timestamp.trim()
              ? msg.timestamp
              : new Date().toISOString();
          this.emit("device.heartbeat", { deviceId, timestamp });
        }
        return;
      }

      if (type === "device.log") {
        const deviceId = ws.deviceId;
        if (!deviceId) return;
        const rawLevel = String(msg.level ?? "info").toLowerCase();
        const level: DeviceLogEntry["level"] =
          rawLevel === "error" || rawLevel === "warn" ? rawLevel : "info";
        const message = String(msg.message ?? "").trim();
        if (!message) return;
        const source = typeof msg.source === "string" ? msg.source : undefined;
        const details = msg.details;
        const timestamp =
          typeof msg.timestamp === "string" && msg.timestamp.trim()
            ? msg.timestamp
            : new Date().toISOString();
        this.pushDeviceLog(deviceId, { timestamp, level, message, source, details });
        if (level === "error") {
          console.error(`[TomorrowOS][device-log][${deviceId}] ${message}`);
        }
        return;
      }
    });

    ws.on("close", () => {
      const id = ws.deviceId;
      if (!id) return;
      if (this.devices.get(id) !== ws) return;

      this.devices.delete(id);
      void this.touchPairedOffline(id);
      this.emit("device.offline", {
        deviceId: id,
        lastSeen: new Date().toISOString()
      });
    });
  }
}
