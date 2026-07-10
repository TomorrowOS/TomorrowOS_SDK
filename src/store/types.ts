/**
 * Persistent (or replaceable) data for pairing — scheme C.
 * Live WebSocket handles stay in-memory on the TomorrowOS instance.
 */

export interface PendingCodeRecord {
  deviceId: string;
  createdAt: number;
}

/** Permanent pairing code bound to a device (serial) on first hello — never rotated. */
export interface DeviceRegistryRecord {
  permanentPairingCode: string;
  codeCreatedAt: number;
  serialNumber?: string;
  firstSeenAt?: number;
  lastHelloAt?: number;
}

export interface PairedDeviceRecord {
  pairingToken: string;
  pairedAt: string;
  deviceName?: string;
  platform?: string;
  system?: string;
  playerVersion?: string;
  systemVersion?: string;
  lastBootAt?: string;
  lastOnlineAt?: string;
  lastOfflineAt?: string;
  lastPolicyPushAt?: string;
  /** Latest device screenshot stored via uploaded_assets (local or Cloudinary). */
  lastScreenshotAssetId?: string;
  lastScreenshotCapturedAt?: string;
}

export interface PairedDeviceEntry {
  deviceId: string;
  record: PairedDeviceRecord;
}

export interface PendingCodeEntry {
  code: string;
  record: PendingCodeRecord;
}

export interface DeviceRegistryEntry {
  deviceId: string;
  record: DeviceRegistryRecord;
}

export interface PlaylistItemRecord {
  url: string;
  assetId?: string;
  type?: string;
  durationMs?: number;
}

export interface UploadedAssetRecord {
  id: string;
  sha256: string;
  storageKey: string;
  url: string;
  originalFilename?: string;
  mimeType?: string;
  resourceType?: string;
  bytes?: number;
  createdAt: string;
  updatedAt: string;
}

/** Device-local run window: startDate+start → endDate+end (one continuous period, not daily repeat). */
export interface PlaylistSchedule {
  startDate?: string;
  endDate?: string;
  /** @deprecated Ignored by player; kept for backward compatibility in stored JSON. */
  daysOfWeek?: number[];
  /** HH:mm — combined with startDate for run-from datetime. */
  start?: string;
  /** HH:mm — combined with endDate for run-until datetime (exclusive). */
  end?: string;
}

export interface StoredPlaylist {
  id: string;
  name: string;
  schedule?: PlaylistSchedule;
  items: PlaylistItemRecord[];
  updatedAt: string;
  retired?: boolean;
  retiredAt?: string;
}

export interface PublishedPlaylistSnapshot {
  id: string;
  name: string;
  schedule?: PlaylistSchedule;
  items: PlaylistItemRecord[];
}

export interface DevicePlaylistAssignment {
  playlistId: string;
  publishedAt: string;
  snapshot: PublishedPlaylistSnapshot;
}

/**
 * Implement with Postgres, Redis, etc. Defaults to MemoryStore (Map).
 * All methods async so DB backends do not need sync adapters.
 */
export interface TomorrowOSStore {
  setPendingCode(code: string, record: PendingCodeRecord): Promise<void>;
  getPendingCode(code: string): Promise<PendingCodeRecord | undefined>;
  deletePendingCode(code: string): Promise<void>;
  getDeviceRegistry(deviceId: string): Promise<DeviceRegistryRecord | undefined>;
  setDeviceRegistry(
    deviceId: string,
    record: DeviceRegistryRecord
  ): Promise<void>;
  getDeviceRegistryByCode(
    code: string
  ): Promise<{ deviceId: string; record: DeviceRegistryRecord } | undefined>;
  setPairedDevice(deviceId: string, record: PairedDeviceRecord): Promise<void>;
  getPairedDevice(deviceId: string): Promise<PairedDeviceRecord | undefined>;
  deletePairedDevice(deviceId: string): Promise<void>;
  listPairedDevices(): Promise<PairedDeviceEntry[]>;
  listPlaylists(): Promise<StoredPlaylist[]>;
  getPlaylist(id: string): Promise<StoredPlaylist | undefined>;
  setPlaylist(record: StoredPlaylist): Promise<void>;
  isPlaylistNameTaken(name: string, excludeId?: string): Promise<boolean>;
  getUploadedAsset(id: string): Promise<UploadedAssetRecord | undefined>;
  getUploadedAssetBySha256(sha256: string): Promise<UploadedAssetRecord | undefined>;
  setUploadedAsset(record: UploadedAssetRecord): Promise<void>;
  deleteUploadedAsset(id: string): Promise<void>;
  getDeviceAssignments(deviceId: string): Promise<DevicePlaylistAssignment[]>;
  setDeviceAssignments(
    deviceId: string,
    assignments: DevicePlaylistAssignment[]
  ): Promise<void>;
}

export interface TomorrowOSDataSnapshot {
  pendingCodes: PendingCodeEntry[];
  deviceRegistry: DeviceRegistryEntry[];
  pairedDevices: PairedDeviceEntry[];
  playlists: StoredPlaylist[];
  uploadedAssets: UploadedAssetRecord[];
  deviceAssignments: Array<{
    deviceId: string;
    assignments: DevicePlaylistAssignment[];
  }>;
}

export interface TomorrowOSMigratableStore extends TomorrowOSStore {
  listPendingCodes(): Promise<PendingCodeEntry[]>;
  listDeviceRegistry(): Promise<DeviceRegistryEntry[]>;
  listUploadedAssets(): Promise<UploadedAssetRecord[]>;
}
