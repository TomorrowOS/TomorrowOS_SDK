import { Pool, type PoolConfig } from "pg";

import type {
  DevicePlaylistAssignment,
  DeviceRegistryEntry,
  DeviceRegistryRecord,
  PairedDeviceEntry,
  PairedDeviceRecord,
  PendingCodeEntry,
  PendingCodeRecord,
  PlaylistSchedule,
  PublishedPlaylistSnapshot,
  StoredPlaylist,
  TomorrowOSMigratableStore,
  UploadedAssetRecord
} from "./types.js";
import { normalizePublishedPlaylistSnapshot } from "./snapshot-utils.js";

export interface PostgresStoreOptions {
  connectionString: string;
  ssl?: PoolConfig["ssl"];
}

interface DeviceRegistryRow {
  device_id: string;
  permanent_pairing_code: string;
  code_created_at: number | string;
  serial_number: string | null;
  first_seen_at: number | string | null;
  last_hello_at: number | string | null;
}

interface PairedDeviceRow {
  device_id: string;
  pairing_token: string;
  paired_at: string;
  device_name: string | null;
  platform: string | null;
  system: string | null;
  player_version: string | null;
  system_version: string | null;
  last_boot_at: string | null;
  last_online_at: string | null;
  last_offline_at: string | null;
  last_policy_push_at: string | null;
  last_screenshot_asset_id: string | null;
  last_screenshot_captured_at: string | null;
}

interface PlaylistRow {
  id: string;
  name: string;
  schedule_json: string | null;
  items_json: string;
  updated_at: string;
  retired: boolean;
  retired_at: string | null;
}

interface DeviceAssignmentRow {
  playlist_id: string;
  published_at: string;
  snapshot_json: string;
}

interface UploadedAssetRow {
  id: string;
  sha256: string;
  storage_key: string;
  url: string;
  original_filename: string | null;
  mime_type: string | null;
  resource_type: string | null;
  bytes: number | string | null;
  created_at: string;
  updated_at: string;
}

function optionalString(value: string | null): string | undefined {
  return value ?? undefined;
}

function optionalNumber(value: number | string | null): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
}

/**
 * Durable store backed by Postgres. Supabase works through its Postgres
 * connection string, usually provided as DATABASE_URL.
 */
export class PostgresStore implements TomorrowOSMigratableStore {
  private readonly pool: Pool;
  private ready?: Promise<void>;

  constructor(options: PostgresStoreOptions | string) {
    const connectionString =
      typeof options === "string" ? options : options.connectionString;
    const ssl = typeof options === "string" ? undefined : options.ssl;

    if (!connectionString.trim()) {
      throw new Error("PostgresStore requires a connection string.");
    }

    this.pool = new Pool({ connectionString, ssl });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS pending_codes (
        code TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS device_registry (
        device_id TEXT PRIMARY KEY,
        permanent_pairing_code TEXT NOT NULL UNIQUE,
        code_created_at BIGINT NOT NULL,
        serial_number TEXT,
        first_seen_at BIGINT,
        last_hello_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS paired_devices (
        device_id TEXT PRIMARY KEY,
        pairing_token TEXT NOT NULL,
        paired_at TEXT NOT NULL,
        device_name TEXT,
        platform TEXT,
        system TEXT,
        player_version TEXT,
        system_version TEXT,
        last_boot_at TEXT,
        last_online_at TEXT,
        last_offline_at TEXT,
        last_policy_push_at TEXT
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule_json TEXT,
        items_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        retired BOOLEAN NOT NULL DEFAULT false,
        retired_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS playlists_active_name_unique
        ON playlists (lower(trim(name)))
        WHERE retired = false;

      CREATE TABLE IF NOT EXISTS device_assignments (
        device_id TEXT NOT NULL,
        playlist_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        published_at TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY (device_id, playlist_id)
      );

      CREATE INDEX IF NOT EXISTS device_assignments_device_order_idx
        ON device_assignments (device_id, sort_order);

      CREATE TABLE IF NOT EXISTS uploaded_assets (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        storage_key TEXT NOT NULL,
        url TEXT NOT NULL,
        original_filename TEXT,
        mime_type TEXT,
        resource_type TEXT,
        bytes BIGINT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS uploaded_assets_sha256_idx
        ON uploaded_assets (sha256);

      INSERT INTO schema_migrations (id, name)
        VALUES (1, 'initial_tomorrowos_store')
        ON CONFLICT (id) DO NOTHING;

      ALTER TABLE paired_devices
        ADD COLUMN IF NOT EXISTS player_version TEXT;

      ALTER TABLE paired_devices
        ADD COLUMN IF NOT EXISTS system_version TEXT;

      ALTER TABLE paired_devices
        ADD COLUMN IF NOT EXISTS last_screenshot_asset_id TEXT;

      ALTER TABLE paired_devices
        ADD COLUMN IF NOT EXISTS last_screenshot_captured_at TEXT;
    `);
    await this.migrateDropPlaylistVersionColumns();
    await this.migrateDropUploadedAssetStorageProvider();
  }

  private async migrateDropUploadedAssetStorageProvider(): Promise<void> {
    const applied = await this.pool.query(`
      SELECT 1
      FROM schema_migrations
      WHERE name = 'drop_uploaded_asset_storage_provider'
      LIMIT 1
    `);
    if (applied.rows.length > 0) return;

    const columnExists = await this.pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'uploaded_assets'
          AND column_name = 'storage_provider'
      ) AS exists
    `);
    if (!columnExists.rows[0]?.exists) {
      await this.pool.query(`
        INSERT INTO schema_migrations (id, name)
        VALUES (2, 'drop_uploaded_asset_storage_provider')
        ON CONFLICT (id) DO NOTHING
      `);
      return;
    }

    await this.pool.query(`
      DELETE FROM uploaded_assets a
      USING uploaded_assets b
      WHERE a.sha256 = b.sha256
        AND (
          CASE WHEN a.url LIKE 'http%' THEN 0 ELSE 1 END,
          a.updated_at
        ) > (
          CASE WHEN b.url LIKE 'http%' THEN 0 ELSE 1 END,
          b.updated_at
        )
    `);

    await this.pool.query(`
      ALTER TABLE uploaded_assets
        DROP CONSTRAINT IF EXISTS uploaded_assets_storage_provider_sha256_key
    `);
    await this.pool.query(`
      ALTER TABLE uploaded_assets
        DROP COLUMN IF EXISTS storage_provider
    `);
    await this.pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'uploaded_assets_sha256_key'
        ) THEN
          ALTER TABLE uploaded_assets
            ADD CONSTRAINT uploaded_assets_sha256_key UNIQUE (sha256);
        END IF;
      END $$;
    `);

    await this.pool.query(`
      INSERT INTO schema_migrations (id, name)
      VALUES (2, 'drop_uploaded_asset_storage_provider')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  private async migrateDropPlaylistVersionColumns(): Promise<void> {
    const applied = await this.pool.query<{ exists: number }>(`
      SELECT 1 AS exists
      FROM schema_migrations
      WHERE name = 'drop_playlist_version'
      LIMIT 1
    `);
    if (applied.rows.length > 0) return;

    await this.pool.query(`
      ALTER TABLE playlists
        DROP COLUMN IF EXISTS version;
    `);
    await this.pool.query(`
      ALTER TABLE device_assignments
        DROP COLUMN IF EXISTS published_version;
    `);

    const assignmentRows = await this.pool.query<{
      device_id: string;
      playlist_id: string;
      snapshot_json: string;
    }>(`
      SELECT device_id, playlist_id, snapshot_json
      FROM device_assignments
    `);

    for (const row of assignmentRows.rows) {
      const snapshot = normalizePublishedPlaylistSnapshot(
        parseJson<PublishedPlaylistSnapshot & { version?: unknown }>(
          row.snapshot_json,
          {
            id: row.playlist_id,
            name: row.playlist_id,
            items: []
          }
        )
      );
      await this.pool.query(`
        UPDATE device_assignments
        SET snapshot_json = $1
        WHERE device_id = $2 AND playlist_id = $3
      `, [JSON.stringify(snapshot), row.device_id, row.playlist_id]);
    }

    await this.pool.query(`
      INSERT INTO schema_migrations (id, name)
      VALUES (2, 'drop_playlist_version')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureReady(): Promise<void> {
    this.ready ??= this.init();
    await this.ready;
  }

  async setPendingCode(code: string, record: PendingCodeRecord): Promise<void> {
    await this.ensureReady();
    await this.pool.query(`
      INSERT INTO pending_codes (code, device_id, created_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (code) DO UPDATE SET
        device_id = EXCLUDED.device_id,
        created_at = EXCLUDED.created_at
    `, [code, record.deviceId, record.createdAt]);
  }

  async getPendingCode(code: string): Promise<PendingCodeRecord | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<{
      device_id: string;
      created_at: number | string;
    }>(`
      SELECT device_id, created_at
      FROM pending_codes
      WHERE code = $1
    `, [code]);
    const row = result.rows[0];
    if (!row) return undefined;
    return { deviceId: row.device_id, createdAt: Number(row.created_at) };
  }

  async deletePendingCode(code: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query("DELETE FROM pending_codes WHERE code = $1", [code]);
  }

  async listPendingCodes(): Promise<PendingCodeEntry[]> {
    await this.ensureReady();
    const result = await this.pool.query<{
      code: string;
      device_id: string;
      created_at: number | string;
    }>(`
      SELECT code, device_id, created_at
      FROM pending_codes
      ORDER BY created_at ASC
    `);
    return result.rows.map((row) => ({
      code: row.code,
      record: { deviceId: row.device_id, createdAt: Number(row.created_at) }
    }));
  }

  async getDeviceRegistry(
    deviceId: string
  ): Promise<DeviceRegistryRecord | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<DeviceRegistryRow>(`
      SELECT *
      FROM device_registry
      WHERE device_id = $1
    `, [deviceId]);
    const row = result.rows[0];
    return row ? this.mapDeviceRegistryRow(row) : undefined;
  }

  async setDeviceRegistry(
    deviceId: string,
    record: DeviceRegistryRecord
  ): Promise<void> {
    await this.ensureReady();
    await this.pool.query(`
      INSERT INTO device_registry (
        device_id,
        permanent_pairing_code,
        code_created_at,
        serial_number,
        first_seen_at,
        last_hello_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (device_id) DO UPDATE SET
        permanent_pairing_code = EXCLUDED.permanent_pairing_code,
        code_created_at = EXCLUDED.code_created_at,
        serial_number = EXCLUDED.serial_number,
        first_seen_at = EXCLUDED.first_seen_at,
        last_hello_at = EXCLUDED.last_hello_at
    `, [
      deviceId,
      record.permanentPairingCode,
      record.codeCreatedAt,
      record.serialNumber ?? null,
      record.firstSeenAt ?? null,
      record.lastHelloAt ?? null
    ]);
  }

  async getDeviceRegistryByCode(
    code: string
  ): Promise<{ deviceId: string; record: DeviceRegistryRecord } | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<DeviceRegistryRow>(`
      SELECT *
      FROM device_registry
      WHERE permanent_pairing_code = $1
    `, [code]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      deviceId: row.device_id,
      record: this.mapDeviceRegistryRow(row)
    };
  }

  async listDeviceRegistry(): Promise<DeviceRegistryEntry[]> {
    await this.ensureReady();
    const result = await this.pool.query<DeviceRegistryRow>(`
      SELECT *
      FROM device_registry
      ORDER BY code_created_at ASC
    `);
    return result.rows.map((row) => ({
      deviceId: row.device_id,
      record: this.mapDeviceRegistryRow(row)
    }));
  }

  async setPairedDevice(
    deviceId: string,
    record: PairedDeviceRecord
  ): Promise<void> {
    await this.ensureReady();
    await this.pool.query(`
      INSERT INTO paired_devices (
        device_id,
        pairing_token,
        paired_at,
        device_name,
        platform,
        system,
        player_version,
        system_version,
        last_boot_at,
        last_online_at,
        last_offline_at,
        last_policy_push_at,
        last_screenshot_asset_id,
        last_screenshot_captured_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (device_id) DO UPDATE SET
        pairing_token = EXCLUDED.pairing_token,
        paired_at = EXCLUDED.paired_at,
        device_name = EXCLUDED.device_name,
        platform = EXCLUDED.platform,
        system = EXCLUDED.system,
        player_version = EXCLUDED.player_version,
        system_version = EXCLUDED.system_version,
        last_boot_at = EXCLUDED.last_boot_at,
        last_online_at = EXCLUDED.last_online_at,
        last_offline_at = EXCLUDED.last_offline_at,
        last_policy_push_at = EXCLUDED.last_policy_push_at,
        last_screenshot_asset_id = EXCLUDED.last_screenshot_asset_id,
        last_screenshot_captured_at = EXCLUDED.last_screenshot_captured_at
    `, [
      deviceId,
      record.pairingToken,
      record.pairedAt,
      record.deviceName ?? null,
      record.platform ?? null,
      record.system ?? null,
      record.playerVersion ?? null,
      record.systemVersion ?? null,
      record.lastBootAt ?? null,
      record.lastOnlineAt ?? null,
      record.lastOfflineAt ?? null,
      record.lastPolicyPushAt ?? null,
      record.lastScreenshotAssetId ?? null,
      record.lastScreenshotCapturedAt ?? null
    ]);
  }

  async getPairedDevice(
    deviceId: string
  ): Promise<PairedDeviceRecord | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<PairedDeviceRow>(`
      SELECT *
      FROM paired_devices
      WHERE device_id = $1
    `, [deviceId]);
    const row = result.rows[0];
    return row ? this.mapPairedDeviceRow(row) : undefined;
  }

  async deletePairedDevice(deviceId: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query("DELETE FROM paired_devices WHERE device_id = $1", [
      deviceId
    ]);
  }

  async listPairedDevices(): Promise<PairedDeviceEntry[]> {
    await this.ensureReady();
    const result = await this.pool.query<PairedDeviceRow>(`
      SELECT *
      FROM paired_devices
      ORDER BY paired_at ASC
    `);
    return result.rows.map((row) => ({
      deviceId: row.device_id,
      record: this.mapPairedDeviceRow(row)
    }));
  }

  async listPlaylists(): Promise<StoredPlaylist[]> {
    await this.ensureReady();
    const result = await this.pool.query<PlaylistRow>(`
      SELECT *
      FROM playlists
      ORDER BY updated_at DESC
    `);
    return result.rows.map((row) => this.mapPlaylistRow(row));
  }

  async getPlaylist(id: string): Promise<StoredPlaylist | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<PlaylistRow>(`
      SELECT *
      FROM playlists
      WHERE id = $1
    `, [id]);
    const row = result.rows[0];
    return row ? this.mapPlaylistRow(row) : undefined;
  }

  async setPlaylist(record: StoredPlaylist): Promise<void> {
    await this.ensureReady();
    await this.pool.query(`
      INSERT INTO playlists (
        id,
        name,
        schedule_json,
        items_json,
        updated_at,
        retired,
        retired_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        schedule_json = EXCLUDED.schedule_json,
        items_json = EXCLUDED.items_json,
        updated_at = EXCLUDED.updated_at,
        retired = EXCLUDED.retired,
        retired_at = EXCLUDED.retired_at
    `, [
      record.id,
      record.name,
      record.schedule ? JSON.stringify(record.schedule) : null,
      JSON.stringify(record.items ?? []),
      record.updatedAt,
      record.retired === true,
      record.retiredAt ?? null
    ]);
  }

  async isPlaylistNameTaken(name: string, excludeId?: string): Promise<boolean> {
    await this.ensureReady();
    const target = name.trim().toLowerCase();
    if (!target) return false;
    const result = await this.pool.query<{ id: string }>(`
      SELECT id
      FROM playlists
      WHERE retired = false
        AND lower(trim(name)) = $1
        AND ($2::text IS NULL OR id != $2)
      LIMIT 1
    `, [target, excludeId ?? null]);
    return result.rows.length > 0;
  }

  async getUploadedAsset(id: string): Promise<UploadedAssetRecord | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<UploadedAssetRow>(`
      SELECT *
      FROM uploaded_assets
      WHERE id = $1
    `, [id]);
    const row = result.rows[0];
    return row ? this.mapUploadedAssetRow(row) : undefined;
  }

  async getUploadedAssetBySha256(
    sha256: string
  ): Promise<UploadedAssetRecord | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<UploadedAssetRow>(`
      SELECT *
      FROM uploaded_assets
      WHERE sha256 = $1
      LIMIT 1
    `, [sha256]);
    const row = result.rows[0];
    return row ? this.mapUploadedAssetRow(row) : undefined;
  }

  async setUploadedAsset(record: UploadedAssetRecord): Promise<void> {
    await this.ensureReady();
    await this.pool.query(`
      INSERT INTO uploaded_assets (
        id,
        sha256,
        storage_key,
        url,
        original_filename,
        mime_type,
        resource_type,
        bytes,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        sha256 = EXCLUDED.sha256,
        storage_key = EXCLUDED.storage_key,
        url = EXCLUDED.url,
        original_filename = EXCLUDED.original_filename,
        mime_type = EXCLUDED.mime_type,
        resource_type = EXCLUDED.resource_type,
        bytes = EXCLUDED.bytes,
        updated_at = EXCLUDED.updated_at
    `, [
      record.id,
      record.sha256,
      record.storageKey,
      record.url,
      record.originalFilename ?? null,
      record.mimeType ?? null,
      record.resourceType ?? null,
      record.bytes ?? null,
      record.createdAt,
      record.updatedAt
    ]);
  }

  async deleteUploadedAsset(id: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query("DELETE FROM uploaded_assets WHERE id = $1", [id]);
  }

  async listUploadedAssets(): Promise<UploadedAssetRecord[]> {
    await this.ensureReady();
    const result = await this.pool.query<UploadedAssetRow>(`
      SELECT *
      FROM uploaded_assets
      ORDER BY created_at ASC
    `);
    return result.rows.map((row) => this.mapUploadedAssetRow(row));
  }

  async getDeviceAssignments(
    deviceId: string
  ): Promise<DevicePlaylistAssignment[]> {
    await this.ensureReady();
    const result = await this.pool.query<DeviceAssignmentRow>(`
      SELECT playlist_id, published_at, snapshot_json
      FROM device_assignments
      WHERE device_id = $1
      ORDER BY sort_order ASC
    `, [deviceId]);
    return result.rows.map((row) => ({
      playlistId: row.playlist_id,
      publishedAt: row.published_at,
      snapshot: normalizePublishedPlaylistSnapshot(
        parseJson<PublishedPlaylistSnapshot & { version?: unknown }>(
          row.snapshot_json,
          {
            id: row.playlist_id,
            name: row.playlist_id,
            items: []
          }
        )
      )
    }));
  }

  async setDeviceAssignments(
    deviceId: string,
    assignments: DevicePlaylistAssignment[]
  ): Promise<void> {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM device_assignments WHERE device_id = $1", [
        deviceId
      ]);

      for (const [index, assignment] of assignments.entries()) {
        await client.query(`
          INSERT INTO device_assignments (
            device_id,
            playlist_id,
            sort_order,
            published_at,
            snapshot_json
          )
          VALUES ($1, $2, $3, $4, $5)
        `, [
          deviceId,
          assignment.playlistId,
          index,
          assignment.publishedAt,
          JSON.stringify(assignment.snapshot)
        ]);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private mapDeviceRegistryRow(row: DeviceRegistryRow): DeviceRegistryRecord {
    return {
      permanentPairingCode: row.permanent_pairing_code,
      codeCreatedAt: Number(row.code_created_at),
      serialNumber: optionalString(row.serial_number),
      firstSeenAt: optionalNumber(row.first_seen_at),
      lastHelloAt: optionalNumber(row.last_hello_at)
    };
  }

  private mapPairedDeviceRow(row: PairedDeviceRow): PairedDeviceRecord {
    return {
      pairingToken: row.pairing_token,
      pairedAt: row.paired_at,
      deviceName: optionalString(row.device_name),
      platform: optionalString(row.platform),
      system: optionalString(row.system),
      playerVersion: optionalString(row.player_version),
      systemVersion: optionalString(row.system_version),
      lastBootAt: optionalString(row.last_boot_at),
      lastOnlineAt: optionalString(row.last_online_at),
      lastOfflineAt: optionalString(row.last_offline_at),
      lastPolicyPushAt: optionalString(row.last_policy_push_at),
      lastScreenshotAssetId: optionalString(row.last_screenshot_asset_id),
      lastScreenshotCapturedAt: optionalString(row.last_screenshot_captured_at)
    };
  }

  private mapPlaylistRow(row: PlaylistRow): StoredPlaylist {
    return {
      id: row.id,
      name: row.name,
      schedule: parseJson<PlaylistSchedule | undefined>(row.schedule_json, undefined),
      items: parseJson(row.items_json, []),
      updatedAt: row.updated_at,
      retired: row.retired,
      retiredAt: optionalString(row.retired_at)
    };
  }

  private mapUploadedAssetRow(row: UploadedAssetRow): UploadedAssetRecord {
    return {
      id: row.id,
      sha256: row.sha256,
      storageKey: row.storage_key,
      url: row.url,
      originalFilename: optionalString(row.original_filename),
      mimeType: optionalString(row.mime_type),
      resourceType: optionalString(row.resource_type),
      bytes: optionalNumber(row.bytes),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
