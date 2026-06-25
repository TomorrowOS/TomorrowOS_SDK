import type {
  TomorrowOSDataSnapshot,
  TomorrowOSMigratableStore
} from "./types.js";

export interface MigrationResult {
  pendingCodes: number;
  deviceRegistry: number;
  pairedDevices: number;
  playlists: number;
  deviceAssignments: number;
}

export async function exportTomorrowOSData(
  store: TomorrowOSMigratableStore
): Promise<TomorrowOSDataSnapshot> {
  const [
    pendingCodes,
    deviceRegistry,
    pairedDevices,
    playlists
  ] = await Promise.all([
    store.listPendingCodes(),
    store.listDeviceRegistry(),
    store.listPairedDevices(),
    store.listPlaylists()
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
    deviceAssignments
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

  for (const { deviceId, assignments } of snapshot.deviceAssignments) {
    await store.setDeviceAssignments(deviceId, assignments);
  }

  for (const { code, record } of snapshot.pendingCodes) {
    await store.setPendingCode(code, record);
  }

  return {
    pendingCodes: snapshot.pendingCodes.length,
    deviceRegistry: snapshot.deviceRegistry.length,
    pairedDevices: snapshot.pairedDevices.length,
    playlists: snapshot.playlists.length,
    deviceAssignments: snapshot.deviceAssignments.reduce(
      (total, entry) => total + entry.assignments.length,
      0
    )
  };
}

export async function migrateTomorrowOSData(
  from: TomorrowOSMigratableStore,
  to: TomorrowOSMigratableStore
): Promise<MigrationResult> {
  const snapshot = await exportTomorrowOSData(from);
  return importTomorrowOSData(to, snapshot);
}
