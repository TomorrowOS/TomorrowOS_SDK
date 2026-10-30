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
  /** CMS operator display name — survives unpair / re-pair. */
  displayName?: string;
}

/**
 * Device-local daily screen on/off window (HH:mm, device clock).
 * Off = display mute / power-save (Tizen panel mute or BrightSign HDMI power-save);
 * device stays CMS-connected.
 */
export interface DeviceOnOffTimer {
  /** HH:mm — unmute / screen on */
  turnOnAt: string;
  /** HH:mm — screen off (device stays CMS-connected) */
  turnOffAt: string;
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
  /** Screen mute schedule (not device power off). */
  onOffTimer?: DeviceOnOffTimer;
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

/** Which screens play this playlist item. No rule means every screen. */
export interface PlaylistItemTagRule {
  match: "any" | "all" | "notAny" | "notAll";
  tags: string[];
}

/**
 * When this playlist item plays. Days are Monday-first:
 * index 0 is Monday and index 6 is Sunday. No schedule means all the time.
 */
export interface PlaylistItemSchedule {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  days?: boolean[];
}

export interface PlaylistItemRecord {
  url: string;
  assetId?: string;
  type?: string;
  durationMs?: number;
  tagRule?: PlaylistItemTagRule;
  schedule?: PlaylistItemSchedule;
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
  deletePlaylist(id: string): Promise<void>;
  isPlaylistAssigned(playlistId: string): Promise<boolean>;
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
