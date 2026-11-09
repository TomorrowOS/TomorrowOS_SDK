import type {
  TomorrowOSDataSnapshot,
  TomorrowOSMigratableStore
} from "./types.js";

export interface MigrationResult {
  pendingCodes: number;
  deviceRegistry: number;
  pairedDevices: number;
  playlists: number;
  uploadedAssets: number;
  deviceAssignments: number;
  screenTagCatalog: number;
  screenTags: number;
  screenReferences: number;
}

export async function exportTomorrowOSData(
  store: TomorrowOSMigratableStore
): Promise<TomorrowOSDataSnapshot> {
  const [
    pendingCodes,
    deviceRegistry,
    pairedDevices,
    playlists,
    uploadedAssets,
    screenTags,
    screenReferences
  ] = await Promise.all([
    store.listPendingCodes(),
    store.listDeviceRegistry(),
    store.listPairedDevices(),
    store.listPlaylists(),
    store.listUploadedAssets(),
    store.getScreenTagState(),
    store.listScreenReferences()
  ]);

  const deviceAssignments = await Promise.all(
    pairedDevices.map(async ({ deviceId }) => ({
      deviceId,
      assignments: await store.getDeviceAssignments(deviceId)
    }))
  );

  return {
    pendingCodes,
    deviceRegistry,
    pairedDevices,
    playlists,
    uploadedAssets,
    deviceAssignments,
    screenTags: {
      catalog: screenTags.catalog,
      devices: Object.entries(screenTags.devices).map(([deviceId, tags]) => ({
        deviceId,
        tags
      }))
    },
    screenReferences: Object.entries(screenReferences).map(([deviceId, references]) => ({
      deviceId,
      references
    }))
  };
}

export async function importTomorrowOSData(
  store: TomorrowOSMigratableStore,
  snapshot: TomorrowOSDataSnapshot
): Promise<MigrationResult> {
  for (const { deviceId, record } of snapshot.deviceRegistry) {
    await store.setDeviceRegistry(deviceId, record);
  }

  for (const { deviceId, record } of snapshot.pairedDevices) {
    await store.setPairedDevice(deviceId, record);
  }

  for (const playlist of snapshot.playlists) {
    await store.setPlaylist(playlist);
  }

  for (const asset of snapshot.uploadedAssets ?? []) {
    await store.setUploadedAsset(asset);
  }

  for (const { deviceId, assignments } of snapshot.deviceAssignments) {
    await store.setDeviceAssignments(deviceId, assignments);
  }

  for (const { code, record } of snapshot.pendingCodes) {
    await store.setPendingCode(code, record);
  }

  if (snapshot.screenTags) {
    const devices: Record<string, string[]> = {};
    for (const entry of snapshot.screenTags.devices) {
      devices[entry.deviceId] = entry.tags;
    }
    await store.replaceScreenTagState({
      catalog: snapshot.screenTags.catalog,
      devices
    });
  }

  if (snapshot.screenReferences) {
    const devices: Record<string, Record<string, string>> = {};
    for (const entry of snapshot.screenReferences) {
      devices[entry.deviceId] = entry.references;
    }
    await store.replaceScreenReferences(devices);
  }

  return {
    pendingCodes: snapshot.pendingCodes.length,
    deviceRegistry: snapshot.deviceRegistry.length,
    pairedDevices: snapshot.pairedDevices.length,
    playlists: snapshot.playlists.length,
    uploadedAssets: snapshot.uploadedAssets?.length ?? 0,
    deviceAssignments: snapshot.deviceAssignments.reduce(
      (total, entry) => total + entry.assignments.length,
      0
    ),
    screenTagCatalog: snapshot.screenTags?.catalog.length ?? 0,
    screenTags: snapshot.screenTags?.devices.length ?? 0,
    screenReferences: snapshot.screenReferences?.length ?? 0
  };
}

export async function migrateTomorrowOSData(
  from: TomorrowOSMigratableStore,
  to: TomorrowOSMigratableStore
): Promise<MigrationResult> {
  const snapshot = await exportTomorrowOSData(from);
  return importTomorrowOSData(to, snapshot);
}
