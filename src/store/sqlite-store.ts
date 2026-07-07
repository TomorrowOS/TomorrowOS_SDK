import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

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
  UploadedAssetRecord,
  UploadedAssetStorageProvider
} from "./types.js";
import { normalizePublishedPlaylistSnapshot } from "./snapshot-utils.js";

interface SQLiteStoreOptions {
  databasePath?: string;
}

interface PendingCodeRow {
  code: string;
  device_id: string;
  created_at: number;
}

interface DeviceRegistryRow {
  device_id: string;
  permanent_pairing_code: string;
  code_created_at: number;
  serial_number: string | null;
  first_seen_at: number | null;
  last_hello_at: number | null;
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
}

interface PlaylistRow {
  id: string;
  name: string;
  schedule_json: string | null;
  items_json: string;
  updated_at: string;
  retired: number;
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
  storage_provider: string;
  storage_key: string;
  url: string;
  original_filename: string | null;
  mime_type: string | null;
  resource_type: string | null;
  bytes: number | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_SQLITE_PATH = path.join(process.cwd(), "data", "tomorrowos.db");

function optionalString(value: string | null): string | undefined {
  return value ?? undefined;
}

function optionalNumber(value: number | null): number | undefined {
  return value ?? undefined;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
}

/**
 * Durable single-node store backed by a local SQLite database.
 * For multi-instance production, inject a Postgres/Supabase-backed TomorrowOSStore instead.
 */
export class SQLiteStore implements TomorrowOSMigratableStore {
  readonly databasePath: string;
  private readonly db: Database.Database;

  constructor(options: SQLiteStoreOptions | string = {}) {
    const databasePath =
      typeof options === "string"
        ? options
        : options.databasePath ?? DEFAULT_SQLITE_PATH;
    this.databasePath = databasePath === ":memory:" ? databasePath : path.resolve(databasePath);

    if (this.databasePath !== ":memory:") {
      fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    }

    this.db = new Database(this.databasePath);
    this.init();
  }

  init(): void {
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pending_codes (
        code TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS device_registry (
        device_id TEXT PRIMARY KEY,
        permanent_pairing_code TEXT NOT NULL UNIQUE,
        code_created_at INTEGER NOT NULL,
        serial_number TEXT,
        first_seen_at INTEGER,
        last_hello_at INTEGER
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
        retired INTEGER NOT NULL DEFAULT 0,
        retired_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS playlists_active_name_unique
        ON playlists (lower(trim(name)))
        WHERE retired = 0;

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
        sha256 TEXT NOT NULL,
        storage_provider TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        url TEXT NOT NULL,
        original_filename TEXT,
        mime_type TEXT,
        resource_type TEXT,
        bytes INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (storage_provider, sha256)
      );

      CREATE INDEX IF NOT EXISTS uploaded_assets_sha256_idx
        ON uploaded_assets (sha256);

      INSERT OR IGNORE INTO schema_migrations (id, name)
        VALUES (1, 'initial_tomorrowos_store');
    `);
    this.addColumnIfMissing("paired_devices", "player_version TEXT");
    this.addColumnIfMissing("paired_devices", "system_version TEXT");
    this.migrateDropPlaylistVersionColumns();
  }

  private tableHasColumn(table: string, column: string): boolean {
    const rows = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    return rows.some((row) => row.name === column);
  }

  private migrateDropPlaylistVersionColumns(): void {
    const alreadyApplied = this.db.prepare(`
      SELECT 1
      FROM schema_migrations
      WHERE name = 'drop_playlist_version'
      LIMIT 1
    `).get();
    if (alreadyApplied) return;

    if (this.tableHasColumn("playlists", "version")) {
      this.db.exec(`
        CREATE TABLE playlists_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          schedule_json TEXT,
          items_json TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL,
          retired INTEGER NOT NULL DEFAULT 0,
          retired_at TEXT
        );

        INSERT INTO playlists_new (
          id, name, schedule_json, items_json, updated_at, retired, retired_at
        )
        SELECT id, name, schedule_json, items_json, updated_at, retired, retired_at
        FROM playlists;

        DROP TABLE playlists;
        ALTER TABLE playlists_new RENAME TO playlists;

        CREATE UNIQUE INDEX IF NOT EXISTS playlists_active_name_unique
          ON playlists (lower(trim(name)))
          WHERE retired = 0;
      `);
    }

    if (this.tableHasColumn("device_assignments", "published_version")) {
      const rows = this.db.prepare(`
        SELECT device_id, playlist_id, sort_order, published_at, snapshot_json
        FROM device_assignments
        ORDER BY device_id ASC, sort_order ASC
      `).all() as Array<{
        device_id: string;
        playlist_id: string;
        sort_order: number;
        published_at: string;
        snapshot_json: string;
      }>;

      this.db.exec(`
        CREATE TABLE device_assignments_new (
          device_id TEXT NOT NULL,
          playlist_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL,
          published_at TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          PRIMARY KEY (device_id, playlist_id)
        );
      `);

      const insert = this.db.prepare(`
        INSERT INTO device_assignments_new (
          device_id,
          playlist_id,
          sort_order,
          published_at,
          snapshot_json
        )
        VALUES (?, ?, ?, ?, ?)
      `);

      const replaceAssignments = this.db.transaction(() => {
        for (const row of rows) {
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
          insert.run(
            row.device_id,
            row.playlist_id,
            row.sort_order,
            row.published_at,
            JSON.stringify(snapshot)
          );
        }
        this.db.exec("DROP TABLE device_assignments");
        this.db.exec("ALTER TABLE device_assignments_new RENAME TO device_assignments");
        this.db.exec(`
          CREATE INDEX IF NOT EXISTS device_assignments_device_order_idx
            ON device_assignments (device_id, sort_order)
        `);
      });

      replaceAssignments();
    }

    this.db.prepare(`
      INSERT OR IGNORE INTO schema_migrations (id, name)
      VALUES (2, 'drop_playlist_version')
    `).run();
  }

  private addColumnIfMissing(table: string, columnDefinition: string): void {
    try {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (!msg.includes("duplicate column")) throw err;
    }
  }

  close(): void {
    this.db.close();
  }

  async setPendingCode(code: string, record: PendingCodeRecord): Promise<void> {
    this.db.prepare(`
      INSERT INTO pending_codes (code, device_id, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        device_id = excluded.device_id,
        created_at = excluded.created_at
    `).run(code, record.deviceId, record.createdAt);
  }

  async getPendingCode(code: string): Promise<PendingCodeRecord | undefined> {
    const row = this.db.prepare(`
      SELECT device_id, created_at
      FROM pending_codes
      WHERE code = ?
    `).get(code) as PendingCodeRow | undefined;
    if (!row) return undefined;
    return { deviceId: row.device_id, createdAt: row.created_at };
  }

  async deletePendingCode(code: string): Promise<void> {
    this.db.prepare("DELETE FROM pending_codes WHERE code = ?").run(code);
  }

  async listPendingCodes(): Promise<PendingCodeEntry[]> {
    const rows = this.db.prepare(`
      SELECT code, device_id, created_at
      FROM pending_codes
      ORDER BY created_at ASC
    `).all() as PendingCodeRow[];
    return rows.map((row) => ({
      code: row.code,
      record: { deviceId: row.device_id, createdAt: row.created_at }
    }));
  }

  async getDeviceRegistry(
    deviceId: string
  ): Promise<DeviceRegistryRecord | undefined> {
    const row = this.db.prepare(`
      SELECT *
      FROM device_registry
      WHERE device_id = ?
    `).get(deviceId) as DeviceRegistryRow | undefined;
    return row ? this.mapDeviceRegistryRow(row) : undefined;
  }

  async setDeviceRegistry(
    deviceId: string,
    record: DeviceRegistryRecord
  ): Promise<void> {
    this.db.prepare(`
      INSERT INTO device_registry (
        device_id,
        permanent_pairing_code,
        code_created_at,
        serial_number,
        first_seen_at,
        last_hello_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        permanent_pairing_code = excluded.permanent_pairing_code,
        code_created_at = excluded.code_created_at,
        serial_number = excluded.serial_number,
        first_seen_at = excluded.first_seen_at,
        last_hello_at = excluded.last_hello_at
    `).run(
      deviceId,
      record.permanentPairingCode,
      record.codeCreatedAt,
      record.serialNumber ?? null,
      record.firstSeenAt ?? null,
      record.lastHelloAt ?? null
    );
  }

  async getDeviceRegistryByCode(
    code: string
  ): Promise<{ deviceId: string; record: DeviceRegistryRecord } | undefined> {
    const row = this.db.prepare(`
      SELECT *
      FROM device_registry
      WHERE permanent_pairing_code = ?
    `).get(code) as DeviceRegistryRow | undefined;
    if (!row) return undefined;
    return {
      deviceId: row.device_id,
      record: this.mapDeviceRegistryRow(row)
    };
  }

  async listDeviceRegistry(): Promise<DeviceRegistryEntry[]> {
    const rows = this.db.prepare(`
      SELECT *
      FROM device_registry
      ORDER BY code_created_at ASC
    `).all() as DeviceRegistryRow[];
    return rows.map((row) => ({
      deviceId: row.device_id,
      record: this.mapDeviceRegistryRow(row)
    }));
  }

  async setPairedDevice(
    deviceId: string,
    record: PairedDeviceRecord
  ): Promise<void> {
    this.db.prepare(`
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
        last_policy_push_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        pairing_token = excluded.pairing_token,
        paired_at = excluded.paired_at,
        device_name = excluded.device_name,
        platform = excluded.platform,
        system = excluded.system,
        player_version = excluded.player_version,
        system_version = excluded.system_version,
        last_boot_at = excluded.last_boot_at,
        last_online_at = excluded.last_online_at,
        last_offline_at = excluded.last_offline_at,
        last_policy_push_at = excluded.last_policy_push_at
    `).run(
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
      record.lastPolicyPushAt ?? null
    );
  }

  async getPairedDevice(
    deviceId: string
  ): Promise<PairedDeviceRecord | undefined> {
    const row = this.db.prepare(`
      SELECT *
      FROM paired_devices
      WHERE device_id = ?
    `).get(deviceId) as PairedDeviceRow | undefined;
    return row ? this.mapPairedDeviceRow(row) : undefined;
  }

  async deletePairedDevice(deviceId: string): Promise<void> {
    this.db.prepare("DELETE FROM paired_devices WHERE device_id = ?").run(deviceId);
  }

  async listPairedDevices(): Promise<PairedDeviceEntry[]> {
    const rows = this.db.prepare(`
      SELECT *
      FROM paired_devices
      ORDER BY paired_at ASC
    `).all() as PairedDeviceRow[];
    return rows.map((row) => ({
      deviceId: row.device_id,
      record: this.mapPairedDeviceRow(row)
    }));
  }

  async listPlaylists(): Promise<StoredPlaylist[]> {
    const rows = this.db.prepare(`
      SELECT *
      FROM playlists
      ORDER BY updated_at DESC
    `).all() as PlaylistRow[];
    return rows.map((row) => this.mapPlaylistRow(row));
  }

  async getPlaylist(id: string): Promise<StoredPlaylist | undefined> {
    const row = this.db.prepare(`
      SELECT *
      FROM playlists
      WHERE id = ?
    `).get(id) as PlaylistRow | undefined;
    return row ? this.mapPlaylistRow(row) : undefined;
  }

  async setPlaylist(record: StoredPlaylist): Promise<void> {
    this.db.prepare(`
      INSERT INTO playlists (
        id,
        name,
        schedule_json,
        items_json,
        updated_at,
        retired,
        retired_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        schedule_json = excluded.schedule_json,
        items_json = excluded.items_json,
        updated_at = excluded.updated_at,
        retired = excluded.retired,
        retired_at = excluded.retired_at
    `).run(
      record.id,
      record.name,
      record.schedule ? JSON.stringify(record.schedule) : null,
      JSON.stringify(record.items ?? []),
      record.updatedAt,
      record.retired ? 1 : 0,
      record.retiredAt ?? null
    );
  }

  async isPlaylistNameTaken(name: string, excludeId?: string): Promise<boolean> {
    const target = name.trim().toLowerCase();
    if (!target) return false;
    const row = this.db.prepare(`
      SELECT id
      FROM playlists
      WHERE retired = 0
        AND lower(trim(name)) = ?
        AND (? IS NULL OR id != ?)
      LIMIT 1
    `).get(target, excludeId ?? null, excludeId ?? null) as { id: string } | undefined;
    return !!row;
  }

  async getUploadedAsset(id: string): Promise<UploadedAssetRecord | undefined> {
    const row = this.db.prepare(`
      SELECT *
      FROM uploaded_assets
      WHERE id = ?
    `).get(id) as UploadedAssetRow | undefined;
    return row ? this.mapUploadedAssetRow(row) : undefined;
  }

  async getUploadedAssetBySha256(
    sha256: string,
    storageProvider?: UploadedAssetStorageProvider
  ): Promise<UploadedAssetRecord | undefined> {
    const row = this.db.prepare(`
      SELECT *
      FROM uploaded_assets
      WHERE sha256 = ?
        AND (? IS NULL OR storage_provider = ?)
      LIMIT 1
    `).get(
      sha256,
      storageProvider ?? null,
      storageProvider ?? null
    ) as UploadedAssetRow | undefined;
    return row ? this.mapUploadedAssetRow(row) : undefined;
  }

  async setUploadedAsset(record: UploadedAssetRecord): Promise<void> {
    this.db.prepare(`
      INSERT INTO uploaded_assets (
        id,
        sha256,
        storage_provider,
        storage_key,
        url,
        original_filename,
        mime_type,
        resource_type,
        bytes,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        sha256 = excluded.sha256,
        storage_provider = excluded.storage_provider,
        storage_key = excluded.storage_key,
        url = excluded.url,
        original_filename = excluded.original_filename,
        mime_type = excluded.mime_type,
        resource_type = excluded.resource_type,
        bytes = excluded.bytes,
        updated_at = excluded.updated_at
    `).run(
      record.id,
      record.sha256,
      record.storageProvider,
      record.storageKey,
      record.url,
      record.originalFilename ?? null,
      record.mimeType ?? null,
      record.resourceType ?? null,
      record.bytes ?? null,
      record.createdAt,
      record.updatedAt
    );
  }

  async deleteUploadedAsset(id: string): Promise<void> {
    this.db.prepare("DELETE FROM uploaded_assets WHERE id = ?").run(id);
  }

  async listUploadedAssets(): Promise<UploadedAssetRecord[]> {
    const rows = this.db.prepare(`
      SELECT *
      FROM uploaded_assets
      ORDER BY created_at ASC
    `).all() as UploadedAssetRow[];
    return rows.map((row) => this.mapUploadedAssetRow(row));
  }

  async getDeviceAssignments(
    deviceId: string
  ): Promise<DevicePlaylistAssignment[]> {
    const rows = this.db.prepare(`
      SELECT playlist_id, published_at, snapshot_json
      FROM device_assignments
      WHERE device_id = ?
      ORDER BY sort_order ASC
    `).all(deviceId) as DeviceAssignmentRow[];
    return rows.map((row) => ({
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
    const replaceAssignments = this.db.transaction(() => {
      this.db.prepare("DELETE FROM device_assignments WHERE device_id = ?").run(deviceId);
      const insert = this.db.prepare(`
        INSERT INTO device_assignments (
          device_id,
          playlist_id,
          sort_order,
          published_at,
          snapshot_json
        )
        VALUES (?, ?, ?, ?, ?)
      `);

      assignments.forEach((assignment, index) => {
        insert.run(
          deviceId,
          assignment.playlistId,
          index,
          assignment.publishedAt,
          JSON.stringify(assignment.snapshot)
        );
      });
    });

    replaceAssignments();
  }

  private mapDeviceRegistryRow(row: DeviceRegistryRow): DeviceRegistryRecord {
    return {
      permanentPairingCode: row.permanent_pairing_code,
      codeCreatedAt: row.code_created_at,
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
      lastPolicyPushAt: optionalString(row.last_policy_push_at)
    };
  }

  private mapPlaylistRow(row: PlaylistRow): StoredPlaylist {
    return {
      id: row.id,
      name: row.name,
      schedule: parseJson<PlaylistSchedule | undefined>(row.schedule_json, undefined),
      items: parseJson(row.items_json, []),
      updatedAt: row.updated_at,
      retired: row.retired === 1,
      retiredAt: optionalString(row.retired_at)
    };
  }

  private mapUploadedAssetRow(row: UploadedAssetRow): UploadedAssetRecord {
    return {
      id: row.id,
      sha256: row.sha256,
      storageProvider: row.storage_provider as UploadedAssetStorageProvider,
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
