/**
 * Replit App Storage (Object Storage) via `@replit/object-storage`.
 * Optional at runtime: outside Replit (or without a bucket) helpers no-op / return null.
 */

export type ReplitObjectStorageMode = "off" | "preferred" | "required";

export interface ReplitObjectStorageClient {
  uploadBytes(objectKey: string, body: Buffer): Promise<void>;
  downloadBytes(objectKey: string): Promise<Buffer | null>;
  exists(objectKey: string): Promise<boolean>;
  deleteObject(objectKey: string): Promise<void>;
  ping(): Promise<void>;
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = String(value || "").trim();
  return trimmed || undefined;
}

export function isReplitHost(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(
    env.REPL_ID ||
    env.REPLIT_DEV_DOMAIN ||
    env.REPLIT_DEPLOYMENT ||
    env.REPL_SLUG ||
    env.REPLIT_DOMAINS
  );
}

/**
 * - `TOMORROWOS_MEDIA=replit-object-storage|replit|object-storage` → required
 * - `TOMORROWOS_MEDIA=local|disk|filesystem` → off
 * - On Replit with no override → preferred (try bucket, fall back to local disk)
 * - Elsewhere → off
 */
export function resolveReplitObjectStorageMode(
  env: NodeJS.ProcessEnv = process.env
): ReplitObjectStorageMode {
  const media = cleanOptional(env.TOMORROWOS_MEDIA)?.toLowerCase();
  if (
    media === "local" ||
    media === "disk" ||
    media === "filesystem" ||
    media === "cloudinary" ||
    media === "vercel-blob" ||
    media === "blob"
  ) {
    return "off";
  }
  if (
    media === "replit" ||
    media === "replit-object-storage" ||
    media === "object-storage" ||
    media === "app-storage"
  ) {
    return "required";
  }
  if (isReplitHost(env)) return "preferred";
  return "off";
}

export function uploadsObjectKey(storedName: string): string {
  const name = String(storedName || "").replace(/^\/+/, "");
  if (name.startsWith("uploads/")) return name;
  return `uploads/${name}`;
}

type RosModule = {
  Client: new (options?: { bucketId?: string }) => {
    uploadFromBytes: (
      objectName: string,
      contents: Buffer,
      options?: unknown
    ) => Promise<{ ok: boolean; error?: unknown }>;
    downloadAsBytes: (
      objectName: string,
      options?: unknown
    ) => Promise<{ ok: boolean; value?: Buffer | Buffer[]; error?: unknown }>;
    exists: (
      objectName: string
    ) => Promise<{ ok: boolean; value?: boolean; error?: unknown }>;
    delete: (
      objectName: string,
      options?: { ignoreNotFound?: boolean }
    ) => Promise<{ ok: boolean; error?: unknown }>;
    list: (
      options?: unknown
    ) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>;
  };
};

let cachedClient: ReplitObjectStorageClient | null | undefined;
let cachedMode: ReplitObjectStorageMode | undefined;

function resultErrorMessage(error: unknown): string {
  if (error == null) return "Replit Object Storage request failed";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function asBuffer(value: Buffer | Buffer[] | undefined): Buffer | null {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    const parts = value.filter((p): p is Buffer => Buffer.isBuffer(p));
    if (parts.length === 0) return null;
    return Buffer.concat(parts);
  }
  return null;
}

async function loadRosModule(): Promise<RosModule | null> {
  try {
    return (await import("@replit/object-storage")) as unknown as RosModule;
  } catch {
    return null;
  }
}

function createClientWrapper(
  raw: InstanceType<RosModule["Client"]>
): ReplitObjectStorageClient {
  return {
    async uploadBytes(objectKey: string, body: Buffer): Promise<void> {
      const result = await raw.uploadFromBytes(objectKey, body);
      if (!result.ok) {
        throw new Error(resultErrorMessage(result.error));
      }
    },
    async downloadBytes(objectKey: string): Promise<Buffer | null> {
      const result = await raw.downloadAsBytes(objectKey);
      if (!result.ok) return null;
      return asBuffer(result.value as Buffer | Buffer[] | undefined);
    },
    async exists(objectKey: string): Promise<boolean> {
      const result = await raw.exists(objectKey);
      if (!result.ok) return false;
      return Boolean(result.value);
    },
    async deleteObject(objectKey: string): Promise<void> {
      const result = await raw.delete(objectKey, { ignoreNotFound: true });
      if (!result.ok) {
        throw new Error(resultErrorMessage(result.error));
      }
    },
    async ping(): Promise<void> {
      const result = await raw.list();
      if (!result.ok) {
        throw new Error(resultErrorMessage(result.error));
      }
    }
  };
}

/**
 * Resolve a live client. Returns null when mode is off or Client cannot start.
 * When mode is `required`, throws if the client cannot be created / used.
 */
export async function getReplitObjectStorageClient(
  env: NodeJS.ProcessEnv = process.env
): Promise<ReplitObjectStorageClient | null> {
  const mode = resolveReplitObjectStorageMode(env);
  if (mode === "off") {
    cachedClient = null;
    cachedMode = mode;
    return null;
  }

  if (cachedClient !== undefined && cachedMode === mode) {
    return cachedClient;
  }
  cachedMode = mode;

  const mod = await loadRosModule();
  if (!mod?.Client) {
    cachedClient = null;
    if (mode === "required") {
      throw new Error(
        "TOMORROWOS_MEDIA requests Replit Object Storage but @replit/object-storage could not be loaded. Run npm install @replit/object-storage and ensure an App Storage bucket is linked."
      );
    }
    return null;
  }

  try {
    const bucketId = cleanOptional(env.REPLIT_OBJECT_STORAGE_BUCKET_ID);
    const raw = bucketId ? new mod.Client({ bucketId }) : new mod.Client();
    const client = createClientWrapper(raw);
    // Soft ping — preferred mode can still proceed if list fails until first upload.
    if (mode === "required") {
      await client.ping();
    }
    cachedClient = client;
    return client;
  } catch (err) {
    cachedClient = null;
    if (mode === "required") {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Replit Object Storage is required (TOMORROWOS_MEDIA) but unavailable: ${msg}`
      );
    }
    console.warn(
      "[TomorrowOS] Replit Object Storage unavailable; using local public/uploads:",
      err
    );
    return null;
  }
}

/** Reset cached client (tests / env changes). */
export function resetReplitObjectStorageClientCache(): void {
  cachedClient = undefined;
  cachedMode = undefined;
}
