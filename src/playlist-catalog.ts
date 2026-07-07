import { randomUUID } from "crypto";

import type {
  DevicePlaylistAssignment,
  PlaylistItemRecord,
  PlaylistSchedule,
  PublishedPlaylistSnapshot,
  StoredPlaylist,
  TomorrowOSStore
} from "./store/types.js";

export interface SavePlaylistInput {
  id?: string;
  name: string;
  schedule?: PlaylistSchedule;
  items: PlaylistItemRecord[];
}

export interface BuiltDevicePolicy {
  policy: {
    playlists: PublishedPlaylistSnapshot[];
    fallback: { type: "brand" };
    revision?: number;
    syncMode?: "latest" | "snapshot";
  };
}

export interface PolicyBuildOptions {
  useLatest?: boolean;
  mediaBaseUrl?: string;
}

function normalizeMediaBaseUrl(raw: string | undefined): string {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    return new URL(s).origin;
  } catch {
    return "";
  }
}

function absolutizeMediaUrl(url: string, mediaBaseUrl: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = normalizeMediaBaseUrl(mediaBaseUrl);
  if (!base) return trimmed;
  return `${base}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

function absolutizePlaylistItems(
  items: PlaylistItemRecord[],
  mediaBaseUrl?: string
): PlaylistItemRecord[] {
  const base = normalizeMediaBaseUrl(mediaBaseUrl);
  if (!base) return items.map((item) => ({ ...item }));
  return items.map((item) => ({
    ...item,
    url: absolutizeMediaUrl(item.url, base)
  }));
}

function cloneSnapshot(
  playlist: StoredPlaylist,
  mediaBaseUrl?: string
): PublishedPlaylistSnapshot {
  return {
    id: playlist.id,
    name: playlist.name,
    schedule: playlist.schedule ? { ...playlist.schedule } : undefined,
    items: absolutizePlaylistItems(playlist.items, mediaBaseUrl)
  };
}

export class PlaylistCatalog {
  constructor(private readonly store: TomorrowOSStore) {}

  async listPlaylists(): Promise<StoredPlaylist[]> {
    const all = await this.store.listPlaylists();
    return all.filter((p) => !p.retired);
  }

  async listPlaylistsIncludingRetired(): Promise<StoredPlaylist[]> {
    return this.store.listPlaylists();
  }

  async getPlaylist(id: string): Promise<StoredPlaylist | undefined> {
    return this.store.getPlaylist(id);
  }

  async savePlaylist(input: SavePlaylistInput): Promise<StoredPlaylist> {
    const name = String(input.name || "").trim();
    if (!name) {
      throw Object.assign(new Error("Playlist name is required"), {
        code: "PLAYLIST_INVALID"
      });
    }

    const id = input.id?.trim() || randomUUID();
    const taken = await this.store.isPlaylistNameTaken(name, id);
    if (taken) {
      throw Object.assign(new Error("Playlist name already exists"), {
        code: "PLAYLIST_NAME_CONFLICT"
      });
    }

    const now = new Date().toISOString();
    const record: StoredPlaylist = {
      id,
      name,
      schedule: input.schedule,
      items: Array.isArray(input.items) ? input.items : [],
      updatedAt: now,
      retired: false
    };

    await this.store.setPlaylist(record);
    return record;
  }

  async retirePlaylist(id: string): Promise<StoredPlaylist> {
    const existing = await this.store.getPlaylist(id);
    if (!existing) {
      throw Object.assign(new Error("Playlist not found"), { code: "PLAYLIST_NOT_FOUND" });
    }
    const record: StoredPlaylist = {
      ...existing,
      retired: true,
      retiredAt: new Date().toISOString()
    };
    await this.store.setPlaylist(record);
    return record;
  }

  async getDeviceAssignments(
    deviceId: string
  ): Promise<DevicePlaylistAssignment[]> {
    return this.store.getDeviceAssignments(deviceId);
  }

  async publishPlaylistsToDevice(
    deviceId: string,
    playlistIds: string[],
    options: PolicyBuildOptions = {}
  ): Promise<BuiltDevicePolicy> {
    const incoming = [...new Set(playlistIds.map((x) => String(x).trim()).filter(Boolean))];
    if (incoming.length === 0) {
      throw Object.assign(new Error("Select at least one playlist"), {
        code: "PLAYLIST_INVALID"
      });
    }

    const existing = await this.store.getDeviceAssignments(deviceId);
    const existingById = new Map(existing.map((a) => [a.playlistId, a]));
    const allIds = [...new Set([...existing.map((a) => a.playlistId), ...incoming])];

    const assignments: DevicePlaylistAssignment[] = [];

    for (const playlistId of allIds) {
      if (!incoming.includes(playlistId)) {
        const kept = existingById.get(playlistId);
        if (kept) assignments.push(kept);
        continue;
      }

      const playlist = await this.store.getPlaylist(playlistId);
      if (!playlist || playlist.retired) {
        throw Object.assign(new Error(`Playlist not available: ${playlistId}`), {
          code: "PLAYLIST_NOT_FOUND"
        });
      }

      assignments.push({
        playlistId,
        publishedAt: new Date().toISOString(),
        snapshot: cloneSnapshot(playlist, options.mediaBaseUrl)
      });
    }

    await this.store.setDeviceAssignments(deviceId, assignments);
    return this.buildPolicyFromAssignments(assignments, {
      useLatest: false,
      mediaBaseUrl: options.mediaBaseUrl
    });
  }

  async removePlaylistFromDevice(
    deviceId: string,
    playlistId: string
  ): Promise<BuiltDevicePolicy> {
    const assignments = await this.store.getDeviceAssignments(deviceId);
    const next = assignments.filter((a) => a.playlistId !== playlistId);
    await this.store.setDeviceAssignments(deviceId, next);
    return this.buildPolicyFromAssignments(next, { useLatest: false });
  }

  /** Remove every playlist assignment from a device (CMS catalog + empty policy). */
  async clearAllAssignmentsFromDevice(deviceId: string): Promise<BuiltDevicePolicy> {
    await this.store.setDeviceAssignments(deviceId, []);
    return this.buildPolicyFromAssignments([], { useLatest: false });
  }

  /**
   * If the device has this playlist assigned, refresh its snapshot to latest
   * and return a rebuilt snapshot policy for immediate push.
   */
  async refreshPlaylistSnapshotOnDevice(
    deviceId: string,
    playlistId: string,
    options: PolicyBuildOptions = {}
  ): Promise<{ updated: boolean; built?: BuiltDevicePolicy }> {
    const assignments = await this.store.getDeviceAssignments(deviceId);
    const idx = assignments.findIndex((a) => a.playlistId === playlistId);
    if (idx < 0) return { updated: false };

    const playlist = await this.store.getPlaylist(playlistId);
    if (!playlist || playlist.retired) {
      return { updated: false };
    }

    const next = assignments.map((a, i) =>
      i !== idx
        ? a
        : {
            playlistId,
            publishedAt: new Date().toISOString(),
            snapshot: cloneSnapshot(playlist, options.mediaBaseUrl)
          }
    );

    await this.store.setDeviceAssignments(deviceId, next);
    const built = await this.buildPolicyFromAssignments(next, {
      useLatest: false,
      mediaBaseUrl: options.mediaBaseUrl
    });
    return { updated: true, built };
  }

  async buildPolicyForDevice(
    deviceId: string,
    options: PolicyBuildOptions = {}
  ): Promise<BuiltDevicePolicy> {
    const assignments = await this.store.getDeviceAssignments(deviceId);
    return this.buildPolicyFromAssignments(assignments, options);
  }

  private async buildPolicyFromAssignments(
    assignments: DevicePlaylistAssignment[],
    options: PolicyBuildOptions
  ): Promise<BuiltDevicePolicy> {
    const useLatest = options.useLatest === true;
    const mediaBaseUrl = options.mediaBaseUrl;
    const playlists: PublishedPlaylistSnapshot[] = [];

    for (const assignment of assignments) {
      if (useLatest) {
        const current = await this.store.getPlaylist(assignment.playlistId);
        if (current && !current.retired) {
          playlists.push(cloneSnapshot(current, mediaBaseUrl));
          continue;
        }
      }
      playlists.push({
        ...assignment.snapshot,
        items: absolutizePlaylistItems(assignment.snapshot.items, mediaBaseUrl)
      });
    }

    return {
      policy: {
        playlists,
        fallback: { type: "brand" },
        revision: Date.now(),
        syncMode: useLatest ? "latest" : "snapshot"
      }
    };
  }

  canPublishPlaylistToNewDevice(playlistId: string): Promise<boolean> {
    return this.store.getPlaylist(playlistId).then((p) => !!p && !p?.retired);
  }
}
