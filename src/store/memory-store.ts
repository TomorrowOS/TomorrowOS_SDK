import type {
  DevicePlaylistAssignment,
  DeviceRegistryRecord,
  PairedDeviceEntry,
  PairedDeviceRecord,
  PendingCodeRecord,
  StoredPlaylist,
  TomorrowOSStore,
  UploadedAssetRecord
} from "./types.js";

/**
 * Default store for development / single-node demos.
 * Data is lost on process restart — not for multi-instance production.
 */
export class MemoryStore implements TomorrowOSStore {
  private readonly pendingCodes = new Map<string, PendingCodeRecord>();
  private readonly deviceRegistry = new Map<string, DeviceRegistryRecord>();
  private readonly codeToDeviceId = new Map<string, string>();
  private readonly pairedDevices = new Map<string, PairedDeviceRecord>();
  private readonly playlists = new Map<string, StoredPlaylist>();
  private readonly uploadedAssets = new Map<string, UploadedAssetRecord>();
  private readonly deviceAssignments = new Map<string, DevicePlaylistAssignment[]>();

  async setPendingCode(code: string, record: PendingCodeRecord): Promise<void> {
    this.pendingCodes.set(code, record);
  }

  async getPendingCode(code: string): Promise<PendingCodeRecord | undefined> {
    return this.pendingCodes.get(code);
  }

  async deletePendingCode(code: string): Promise<void> {
    this.pendingCodes.delete(code);
  }

  async getDeviceRegistry(
    deviceId: string
  ): Promise<DeviceRegistryRecord | undefined> {
    return this.deviceRegistry.get(deviceId);
  }

  async setDeviceRegistry(
    deviceId: string,
    record: DeviceRegistryRecord
  ): Promise<void> {
    const existing = this.deviceRegistry.get(deviceId);
    if (existing?.permanentPairingCode) {
      this.codeToDeviceId.delete(existing.permanentPairingCode);
    }
    this.deviceRegistry.set(deviceId, record);
    this.codeToDeviceId.set(record.permanentPairingCode, deviceId);
  }

  async getDeviceRegistryByCode(
    code: string
  ): Promise<{ deviceId: string; record: DeviceRegistryRecord } | undefined> {
    const deviceId = this.codeToDeviceId.get(code);
    if (!deviceId) return undefined;
    const record = this.deviceRegistry.get(deviceId);
    if (!record) return undefined;
    return { deviceId, record };
  }

  async setPairedDevice(
    deviceId: string,
    record: PairedDeviceRecord
  ): Promise<void> {
    this.pairedDevices.set(deviceId, record);
  }

  async getPairedDevice(
    deviceId: string
  ): Promise<PairedDeviceRecord | undefined> {
    return this.pairedDevices.get(deviceId);
  }

  async deletePairedDevice(deviceId: string): Promise<void> {
    this.pairedDevices.delete(deviceId);
  }

  async listPairedDevices(): Promise<PairedDeviceEntry[]> {
    return [...this.pairedDevices.entries()].map(([deviceId, record]) => ({
      deviceId,
      record
    }));
  }

  async listPlaylists(): Promise<StoredPlaylist[]> {
    return [...this.playlists.values()];
  }

  async getPlaylist(id: string): Promise<StoredPlaylist | undefined> {
    return this.playlists.get(id);
  }

  async setPlaylist(record: StoredPlaylist): Promise<void> {
    this.playlists.set(record.id, record);
  }

  async isPlaylistNameTaken(name: string, excludeId?: string): Promise<boolean> {
    const target = name.trim().toLowerCase();
    for (const playlist of this.playlists.values()) {
      if (playlist.retired) continue;
      if (excludeId && playlist.id === excludeId) continue;
      if (playlist.name.trim().toLowerCase() === target) return true;
    }
    return false;
  }

  async getUploadedAsset(id: string): Promise<UploadedAssetRecord | undefined> {
    return this.uploadedAssets.get(id);
  }

  async getUploadedAssetBySha256(
    sha256: string,
    storageProvider?: UploadedAssetRecord["storageProvider"]
  ): Promise<UploadedAssetRecord | undefined> {
    for (const asset of this.uploadedAssets.values()) {
      if (
        asset.sha256 === sha256 &&
        (!storageProvider || asset.storageProvider === storageProvider)
      ) {
        return asset;
      }
    }
    return undefined;
  }

  async setUploadedAsset(record: UploadedAssetRecord): Promise<void> {
    this.uploadedAssets.set(record.id, record);
  }

  async deleteUploadedAsset(id: string): Promise<void> {
    this.uploadedAssets.delete(id);
  }

  async getDeviceAssignments(
    deviceId: string
  ): Promise<DevicePlaylistAssignment[]> {
    return [...(this.deviceAssignments.get(deviceId) ?? [])];
  }

  async setDeviceAssignments(
    deviceId: string,
    assignments: DevicePlaylistAssignment[]
  ): Promise<void> {
    this.deviceAssignments.set(deviceId, assignments.map((a) => ({
      ...a,
      snapshot: {
        ...a.snapshot,
        items: a.snapshot.items.map((item) => ({ ...item }))
      }
    })));
  }
}
