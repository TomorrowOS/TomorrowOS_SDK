/**
 * Per-screen key/value references.
 *
 * Stored in screen-references.json beside the database. Each setPolicy for a
 * screen includes that screen's references. The shared playlist is unchanged.
 * The default CMS panel does not edit these; a product UI calls the HTTP routes.
 */

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import type { IncomingMessage, ServerResponse } from "http";
import { dirname } from "path";

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_KEYS = 32;
const MAX_VALUE_LENGTH = 500;

export type ScreenReferences = Record<string, string>;

interface ReferenceFile {
  devices: Record<string, ScreenReferences>;
}

export interface ScreenReferenceHost {
  pushLatestPolicyToDevice(deviceId: string): Promise<{ pushed: boolean }>;
}

export function parseScreenReferences(raw: unknown): ScreenReferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("references must be an object of string values");
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_KEYS) {
    throw new Error(`At most ${MAX_KEYS} references`);
  }
  const out: ScreenReferences = {};
  for (const [key, value] of entries) {
    const name = key.trim();
    if (!KEY_PATTERN.test(name)) {
      throw new Error(
        `Invalid reference key “${key}”. Use a letter, then letters, numbers, or underscores.`
      );
    }
    if (typeof value !== "string") {
      throw new Error(`Reference “${name}” must be a string`);
    }
    const text = value.trim();
    if (!text || text.length > MAX_VALUE_LENGTH) {
      throw new Error(`Reference “${name}” must be 1–${MAX_VALUE_LENGTH} characters`);
    }
    out[name] = text;
  }
  return out;
}

/** Copy a policy and add this screen's references. Does not mutate the input. */
export function policyWithScreenReferences(
  policy: unknown,
  references: ScreenReferences
): unknown {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return policy;
  return {
    ...(policy as Record<string, unknown>),
    references: { ...references }
  };
}

export class ScreenReferenceStore {
  constructor(private readonly filePath: string) {}

  async get(deviceId: string): Promise<ScreenReferences> {
    const file = await this.read();
    return { ...(file.devices[deviceId] ?? {}) };
  }

  async all(): Promise<Record<string, ScreenReferences>> {
    const file = await this.read();
    const out: Record<string, ScreenReferences> = {};
    for (const [deviceId, references] of Object.entries(file.devices)) {
      out[deviceId] = { ...references };
    }
    return out;
  }

  async replace(deviceId: string, references: ScreenReferences): Promise<ScreenReferences> {
    const file = await this.read();
    if (Object.keys(references).length === 0) delete file.devices[deviceId];
    else file.devices[deviceId] = references;
    await this.write(file);
    return { ...references };
  }

  async removeKey(deviceId: string, key: string): Promise<ScreenReferences> {
    const file = await this.read();
    const current = { ...(file.devices[deviceId] ?? {}) };
    delete current[key];
    if (Object.keys(current).length === 0) delete file.devices[deviceId];
    else file.devices[deviceId] = current;
    await this.write(file);
    return current;
  }

  async deleteDevice(deviceId: string): Promise<void> {
    const file = await this.read();
    if (!file.devices[deviceId]) return;
    delete file.devices[deviceId];
    await this.write(file);
  }

  private async read(): Promise<ReferenceFile> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as {
        devices?: Record<string, ScreenReferences>;
      };
      const devices: Record<string, ScreenReferences> = {};
      if (raw?.devices && typeof raw.devices === "object") {
        for (const [deviceId, references] of Object.entries(raw.devices)) {
          try {
            devices[deviceId] = parseScreenReferences(references);
          } catch {
            devices[deviceId] = {};
          }
        }
      }
      return { devices };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { devices: {} };
      throw err;
    }
  }

  private async write(file: ReferenceFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
    await rename(tmp, this.filePath);
  }
}

export interface ScreenReferenceHttpDeps {
  host: ScreenReferenceHost;
  store: { getPairedDevice(deviceId: string): Promise<unknown> };
  references: ScreenReferenceStore;
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
  deps: ScreenReferenceHttpDeps,
  deviceId: string,
  res: ServerResponse
): Promise<boolean> {
  const paired = await deps.store.getPairedDevice(deviceId);
  if (paired) return true;
  sendJson(res, 404, { status: "failed", error: "Device not found" });
  return false;
}

async function pushReferences(
  deps: ScreenReferenceHttpDeps,
  deviceId: string
): Promise<boolean> {
  try {
    const result = await deps.host.pushLatestPolicyToDevice(deviceId);
    return result.pushed;
  } catch {
    return false;
  }
}

export async function handleScreenReferenceHttp(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ScreenReferenceHttpDeps
): Promise<boolean> {
  const method = String(req.method || "GET").toUpperCase();
  const pathname = pathnameOf(req);

  if (method === "GET" && pathname === "/screen-references") {
    sendJson(res, 200, {
      status: "success",
      referencesByDevice: await deps.references.all()
    });
    return true;
  }

  const collection = /^\/device\/([^/]+)\/references$/.exec(pathname);
  if (collection && method === "GET") {
    const deviceId = decodeURIComponent(collection[1]);
    if (!(await requirePaired(deps, deviceId, res))) return true;
    sendJson(res, 200, {
      status: "success",
      deviceId,
      references: await deps.references.get(deviceId)
    });
    return true;
  }

  if (collection && method === "PUT") {
    const deviceId = decodeURIComponent(collection[1]);
    if (!(await requirePaired(deps, deviceId, res))) return true;
    let references: ScreenReferences;
    try {
      const body = await readJson(req);
      references = parseScreenReferences(body.references);
    } catch (err) {
      sendJson(res, 400, {
        status: "failed",
        error: err instanceof Error ? err.message : "Invalid references"
      });
      return true;
    }
    const saved = await deps.references.replace(deviceId, references);
    const pushed = await pushReferences(deps, deviceId);
    sendJson(res, 200, { status: "success", deviceId, references: saved, pushed });
    return true;
  }

  const oneKey = /^\/device\/([^/]+)\/references\/([^/]+)$/.exec(pathname);
  if (oneKey && method === "DELETE") {
    const deviceId = decodeURIComponent(oneKey[1]);
    const key = decodeURIComponent(oneKey[2]);
    if (!KEY_PATTERN.test(key)) {
      sendJson(res, 400, { status: "failed", error: "Invalid reference key" });
      return true;
    }
    if (!(await requirePaired(deps, deviceId, res))) return true;
    const references = await deps.references.removeKey(deviceId, key);
    const pushed = await pushReferences(deps, deviceId);
    sendJson(res, 200, { status: "success", deviceId, references, pushed });
    return true;
  }

  return false;
}
