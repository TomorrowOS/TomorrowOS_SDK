const PANEL_MEDIA_BASE_KEY = "tomorrowos.panel.mediaBaseUrl";

/** @type {Array<Record<string, unknown>>} */
let playlistsCatalog = [];

/** @type {Array<Record<string, unknown>>} */
let devicesCache = [];

/** @type {string|null} */
let selectedPlaylistId = null;

/** True while creating a new playlist locally (assets allowed before Save). */
let playlistDraftActive = false;

/** @type {{ id: string, assetId?: string, url: string, name: string, type: string, durationMs: number }[]} */
let editorItems = [];

/** Item id currently being dragged in the asset list (reorder). */
let draggingEditorItemId = null;

/** @type {string|null} */
let publishModalDeviceId = null;
let publishInProgress = false;
/** @type {string|null} */
let editingDeviceNameId = null;
/** @type {string} */
let editingDeviceNameValue = "";

let devicePollTimer = null;
let serverStatusTimer = null;
/** @type {string} Latest known `@tomorrowos/sdk` version from GET /status. */
let cachedSdkVersion = "";
/** @type {number|null} CMS server boot time (ms) from GET /devices. */
let serverStartedAtMs = null;

const UPDATE_SDK_PROMPT =
  "Follow @tomorrowos/sdk REPLIT_UPGRADE.md to upgrade my CMS with the latest SDK.";
/** @type {ReturnType<typeof setTimeout>|null} */
let reconnectGraceTimer = null;
let uploadQueue = [];
let uploadInProgress = false;

const UPLOAD_MAX_RETRIES = 3;
const DEVICE_RECONNECT_GRACE_MS = 60000;
const UPLOAD_TIMEOUT_MS = 120000;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatDateTimeSeconds(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function resolveDeviceConnectionState(device) {
  if (device.connected) return "online";
  if (serverStartedAtMs != null) {
    const elapsed = Date.now() - serverStartedAtMs;
    if (elapsed >= 0 && elapsed < DEVICE_RECONNECT_GRACE_MS) return "loading";
  }
  return "offline";
}

function statusLedClass(connectionState) {
  if (connectionState === "online") return "status-led status-led--online";
  if (connectionState === "loading") return "status-led status-led--loading";
  return "status-led status-led--offline";
}

function statusLedTitle(connectionState) {
  if (connectionState === "online") return "Device connected";
  if (connectionState === "loading") return "Waiting for device to reconnect";
  return "Device not connected";
}

function formatDeviceOnlineLabel(device, connectionState) {
  if (connectionState === "loading") return "Reconnecting…";
  if (connectionState !== "online") return "Not active";
  const bootIso = device.lastBootAt;
  if (!bootIso) return "Not active";
  const bootMs = new Date(bootIso).getTime();
  if (Number.isNaN(bootMs)) return "Not active";
  return formatDurationMs(Date.now() - bootMs);
}

function scheduleReconnectGraceRerender() {
  if (reconnectGraceTimer) {
    clearTimeout(reconnectGraceTimer);
    reconnectGraceTimer = null;
  }
  if (serverStartedAtMs == null) return;

  const hasLoadingDevice = devicesCache.some(
    (device) => resolveDeviceConnectionState(device) === "loading"
  );
  if (!hasLoadingDevice) return;

  const remaining = DEVICE_RECONNECT_GRACE_MS - (Date.now() - serverStartedAtMs);
  if (remaining <= 0) {
    renderDeviceCards();
    return;
  }

  reconnectGraceTimer = setTimeout(() => {
    reconnectGraceTimer = null;
    renderDeviceCards();
  }, remaining + 50);
}

function showResult(data) {
  document.getElementById("result").textContent = JSON.stringify(data, null, 2);
}

function setAssetUploadBusy(isBusy) {
  const addBtn = document.getElementById("addAssetBtn");
  if (addBtn) {
    addBtn.disabled = isBusy;
    addBtn.textContent = isBusy ? "Uploading..." : "+";
  }
}

function updateUploadStatusUi(status) {
  const shell = document.getElementById("uploadStatusShell");
  const text = document.getElementById("uploadStatusText");
  const bar = document.getElementById("uploadProgressBar");
  const queue = document.getElementById("uploadQueueText");
  if (!shell || !text || !bar || !queue) return;

  if (!status || status.hidden) {
    shell.classList.add("hidden");
    bar.style.width = "0%";
    return;
  }

  shell.classList.remove("hidden");
  text.textContent = status.text || "Uploading...";
  queue.textContent = status.queueText || "";
  const percent = Math.max(0, Math.min(100, Number(status.percent) || 0));
  bar.style.width = `${percent}%`;
}

function isLocalPanelHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function normalizeMediaBaseUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    return new URL(s).origin;
  } catch {
    return "";
  }
}

/** User-saved LAN override (local dev only). Not used on hosted CMS unless explicitly set. */
function getExplicitLanMediaBase() {
  return normalizeMediaBaseUrl(localStorage.getItem(PANEL_MEDIA_BASE_KEY) || "");
}

/**
 * Prefill CMS URL for screens from server-detected LAN IP:port when running on localhost
 * and the operator has not saved a value yet. Auto-persists so thumbs/publish work without Save.
 */
function applyDefaultCmsUrlForScreens(suggested) {
  if (!isLocalPanelHost(window.location.hostname)) return;
  const normalized = normalizeMediaBaseUrl(suggested);
  if (!normalized) return;

  const cmsBaseInput = document.getElementById("cmsDeviceBaseUrl");
  const saved = getExplicitLanMediaBase();
  if (saved) {
    if (cmsBaseInput && !String(cmsBaseInput.value || "").trim()) {
      cmsBaseInput.value = saved;
    }
    return;
  }

  if (cmsBaseInput) cmsBaseInput.value = normalized;
  localStorage.setItem(PANEL_MEDIA_BASE_KEY, normalized);
}

function playlistHasRelativeMediaUrls(playlist) {
  return (playlist?.items || []).some((item) => {
    const url = String(item?.url || "").trim();
    return url && !/^https?:\/\//i.test(url);
  });
}

/**
 * Base URL sent on publish only when needed.
 * - Hosted (e.g. Replit): use public origin when items are relative (/uploads/...).
 * - Local: prefer saved LAN override; otherwise fall back to current origin for dev.
 * - Returns null to omit mediaBaseUrl (playlist already has absolute https URLs).
 */
function getPublishMediaBaseUrl(selectedPlaylists) {
  const explicitLan = getExplicitLanMediaBase();
  if (explicitLan) return explicitLan;

  const needsRewrite = selectedPlaylists.some(playlistHasRelativeMediaUrls);
  if (!needsRewrite) return null;

  if (!isLocalPanelHost(window.location.hostname)) {
    return window.location.origin;
  }
  // Local dev: same-origin fallback so panel publish/verify works without LAN override.
  return window.location.origin;
}

/** Browser-side check URL — always same-origin so localhost panel can reach /uploads. */
function resolveVerificationMediaUrl(url) {
  const p = String(url || "").trim();
  if (!p) return "";
  if (p.startsWith("/")) return p;
  try {
    const parsed = new URL(p);
    const path = parsed.pathname + parsed.search;
    if (path.startsWith("/uploads/") || path.startsWith("/screenshots/")) {
      return path;
    }
    return p;
  } catch {
    return p;
  }
}

function resolvePublishMediaUrl(url, mediaBaseUrl) {
  const p = String(url || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const base =
    normalizeMediaBaseUrl(mediaBaseUrl) ||
    getExplicitLanMediaBase() ||
    window.location.origin;
  if (!base) return "";
  return `${base}${p.startsWith("/") ? p : `/${p}`}`;
}

async function verifyMediaAssetReachable(url) {
  if (!url) return { ok: false, reason: "missing URL" };

  const candidates = [];
  const sameOriginPath = resolveVerificationMediaUrl(url);
  if (sameOriginPath) candidates.push(sameOriginPath);
  if (url && url !== sameOriginPath) candidates.push(url);

  let lastReason = "unreachable";
  for (const target of candidates) {
    try {
      // CMS static files are served on GET only (no HEAD / Range support).
      const res = await fetch(target, { method: "GET", cache: "no-store" });
      if (res.ok) return { ok: true };
      lastReason = `HTTP ${res.status}`;
    } catch (err) {
      lastReason = err?.message || "network error";
    }
  }
  return { ok: false, reason: lastReason };
}

async function verifyPlaylistsAssetsReady(playlists, mediaBaseUrl, onProgress) {
  const tasks = [];
  for (const pl of playlists) {
    for (const item of pl.items || []) {
      const name = String(item?.name || item?.url || "asset").split("/").pop() || "asset";
      const resolvedUrl = resolveVerificationMediaUrl(item?.url);
      tasks.push({
        playlist: pl.name || pl.id,
        name,
        url: item?.url,
        resolvedUrl
      });
    }
  }

  if (tasks.length === 0) {
    return { ok: false, failures: [{ playlist: "—", name: "—", reason: "no assets in playlist" }] };
  }

  const failures = [];
  let done = 0;
  for (const task of tasks) {
    onProgress?.(done, tasks.length, task.name);
    if (!task.resolvedUrl) {
      failures.push({
        playlist: task.playlist,
        name: task.name,
        reason: "could not resolve media URL"
      });
    } else {
      const result = await verifyMediaAssetReachable(task.resolvedUrl);
      if (!result.ok) {
        failures.push({
          playlist: task.playlist,
          name: task.name,
          reason: result.reason || "unreachable"
        });
      }
    }
    done += 1;
    onProgress?.(done, tasks.length, task.name);
  }

  return { ok: failures.length === 0, failures, total: tasks.length };
}

async function refreshPlaylistsForPublish() {
  try {
    const res = await fetch("/playlists");
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok || !Array.isArray(data.playlists)) return false;
    playlistsCatalog = data.playlists;
    renderPlaylistCatalog();
    return true;
  } catch {
    return false;
  }
}

function resetPublishModalStatus() {
  publishInProgress = false;
  updatePublishStatusUi({ hidden: true });
  const confirmBtn = document.getElementById("publishConfirmBtn");
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Publish selected";
  }
  const modal = document.getElementById("publishModal");
  modal?.querySelectorAll("[data-close-modal]").forEach((el) => {
    if (el instanceof HTMLButtonElement) el.disabled = false;
  });
  document
    .querySelectorAll("#publishChecklist input[type=checkbox]")
    .forEach((el) => {
      if (el instanceof HTMLInputElement) el.disabled = false;
    });
}

function setPublishModalBusy(busy) {
  publishInProgress = busy;
  const confirmBtn = document.getElementById("publishConfirmBtn");
  if (confirmBtn) {
    confirmBtn.disabled = busy;
    confirmBtn.textContent = busy ? "Publishing..." : "Publish selected";
  }
  document
    .querySelectorAll("#publishChecklist input[type=checkbox]")
    .forEach((el) => {
      if (el instanceof HTMLInputElement) el.disabled = busy;
    });
  document.querySelectorAll("#publishModal [data-close-modal]").forEach((el) => {
    if (el instanceof HTMLButtonElement) el.disabled = busy;
  });
}

function updatePublishStatusUi(status) {
  const shell = document.getElementById("publishStatusShell");
  const text = document.getElementById("publishStatusText");
  const bar = document.getElementById("publishProgressBar");
  if (!shell || !text || !bar) return;

  if (!status || status.hidden) {
    shell.classList.add("hidden");
    shell.classList.remove("publish-status--error", "publish-status--success");
    bar.style.width = "0%";
    text.textContent = "";
    return;
  }

  shell.classList.remove("hidden");
  shell.classList.toggle("publish-status--error", !!status.isError);
  shell.classList.toggle("publish-status--success", !!status.isSuccess);
  text.textContent = status.text || "Working...";
  const percent = Math.max(0, Math.min(100, Number(status.percent) || 0));
  bar.style.width = `${percent}%`;
}

/** Resolve media URLs in the editor (save / thumbnails). */
function getMediaBaseOrigin() {
  const explicitLan = getExplicitLanMediaBase();
  if (explicitLan) return explicitLan;
  if (!isLocalPanelHost(window.location.hostname)) return window.location.origin;
  const draft = normalizeMediaBaseUrl(document.getElementById("cmsDeviceBaseUrl")?.value);
  return draft;
}

function saveCmsDeviceBaseUrl() {
  const normalized = normalizeMediaBaseUrl(
    document.getElementById("cmsDeviceBaseUrl")?.value
  );
  if (!normalized) {
    alert("Enter a valid URL, e.g. http://192.168.1.105:3000");
    return;
  }
  document.getElementById("cmsDeviceBaseUrl").value = normalized;
  localStorage.setItem(PANEL_MEDIA_BASE_KEY, normalized);
  showResult({ status: "saved", mediaBaseUrl: normalized });
}

function absoluteMediaUrl(path) {
  const p = String(path || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const base = getMediaBaseOrigin();
  if (!base) {
    throw new Error("Set CMS URL for screens (LAN IP, not localhost).");
  }
  return `${base}${p.startsWith("/") ? p : `/${p}`}`;
}

function inferMediaType(filename, mime) {
  const lower = String(filename || "").toLowerCase();
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("image/")) return "image";
  if (lower.endsWith(".wgt") || lower.endsWith(".zip")) return "widget";
  if (/\.(mp4|webm|mov|m4v)$/.test(lower)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(lower)) return "image";
  return "image";
}

function defaultDurationMs(type) {
  if (type === "video") return 30000;
  if (type === "widget") return 20000;
  return 10000;
}

function clampVideoDurationMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(3600 * 1000, Math.max(1000, Math.round(ms)));
}

/** Probe duration from a local File or an absolute media URL. */
function probeVideoDurationInBrowser(fileOrUrl) {
  if (!fileOrUrl) return Promise.resolve(null);

  let objectUrl = null;
  const src = typeof fileOrUrl === "string" ? fileOrUrl : null;
  if (!src && fileOrUrl instanceof File) {
    objectUrl = URL.createObjectURL(fileOrUrl);
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const timer = setTimeout(() => done(null), 20000);

    const cleanup = () => {
      clearTimeout(timer);
      video.removeAttribute("src");
      try {
        video.load();
      } catch (_) {}
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };

    const done = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(clampVideoDurationMs(value));
    };

    const readDuration = () => {
      const seconds = Number(video.duration);
      if (Number.isFinite(seconds) && seconds > 0 && seconds !== Infinity) {
        done(seconds * 1000);
      }
    };

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.addEventListener("loadedmetadata", readDuration);
    video.addEventListener("durationchange", readDuration);
    video.addEventListener("loadeddata", readDuration);
    video.addEventListener("canplay", readDuration);
    video.addEventListener("error", () => done(null));

    if (src) {
      video.src = src;
    } else if (objectUrl) {
      video.src = objectUrl;
    } else {
      done(null);
      return;
    }
    try {
      video.load();
    } catch (_) {
      done(null);
    }
  });
}

async function resolveVideoDurationMs(file, type, uploadData) {
  if (type !== "video") return defaultDurationMs(type);

  // Local File metadata is the most reliable source during upload.
  const fromFile = await probeVideoDurationInBrowser(file);
  if (fromFile) return fromFile;

  const fromServerRaw = Number(uploadData?.durationMs);
  const fromServer =
    Number.isFinite(fromServerRaw) && fromServerRaw > 0
      ? clampVideoDurationMs(fromServerRaw)
      : null;
  if (fromServer) return fromServer;

  if (uploadData?.url) {
    try {
      const fromUrl = await probeVideoDurationInBrowser(absoluteMediaUrl(uploadData.url));
      if (fromUrl) return fromUrl;
    } catch (_) {}
  }

  return defaultDurationMs(type);
}

function normalizeDurationMs(item) {
  const minMs = 1000;
  const maxMs = 3600 * 1000;
  let ms = Number(item?.durationMs);
  if (!Number.isFinite(ms) || ms < minMs) return defaultDurationMs(item?.type);
  if (ms === 1000000) return defaultDurationMs(item?.type);
  return Math.min(maxMs, ms);
}

function buildScheduleFromForm() {
  const schedule = {};
  const startDate = document.getElementById("scheduleStartDate")?.value?.trim();
  const endDate = document.getElementById("scheduleEndDate")?.value?.trim();
  const startTime = document.getElementById("scheduleStartTime")?.value?.trim();
  const endTime = document.getElementById("scheduleEndTime")?.value?.trim();
  if (startDate) schedule.startDate = startDate;
  if (endDate) schedule.endDate = endDate;
  if (startTime) schedule.start = startTime;
  if (endTime) schedule.end = endTime;
  return Object.keys(schedule).length > 0 ? schedule : undefined;
}

function loadScheduleIntoForm(schedule) {
  const s = schedule || {};
  document.getElementById("scheduleStartDate").value = s.startDate || "";
  document.getElementById("scheduleEndDate").value = s.endDate || "";
  document.getElementById("scheduleStartTime").value = s.start || "";
  document.getElementById("scheduleEndTime").value = s.end || "";
}

function parseScheduleDateTimeMs(dateStr, timeStr, defaultTime) {
  const date = String(dateStr || "").trim();
  if (!date) return null;
  const time = String(timeStr || "").trim() || defaultTime;
  const value = new Date(`${date}T${time}:00`);
  const ms = value.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** True when the playlist has no start/end date or time (always-on / default content). */
function isUnscheduledPublishedPlaylist(playlist) {
  const schedule = playlist?.schedule;
  if (!schedule) return true;
  return !(
    schedule.startDate ||
    schedule.endDate ||
    schedule.start ||
    schedule.end
  );
}

function getPublishedPlaylistStartMs(playlist) {
  const schedule = playlist?.schedule;
  if (isUnscheduledPublishedPlaylist(playlist) || !schedule) return null;
  return parseScheduleDateTimeMs(schedule.startDate, schedule.start, "00:00");
}

function getPublishedPlaylistEndMs(playlist) {
  const schedule = playlist?.schedule;
  if (isUnscheduledPublishedPlaylist(playlist) || !schedule) return null;
  return parseScheduleDateTimeMs(schedule.endDate, schedule.end, "23:59");
}

function isPublishedPlaylistActiveNow(playlist, now = new Date()) {
  if (isUnscheduledPublishedPlaylist(playlist)) return true;
  const nowMs = now.getTime();
  const startMs = getPublishedPlaylistStartMs(playlist);
  const endMs = getPublishedPlaylistEndMs(playlist);
  if (startMs !== null && nowMs < startMs) return false;
  if (endMs !== null && nowMs >= endMs) return false;
  return true;
}

/**
 * Green-light target for the device card.
 * - Prefer an in-window scheduled playlist (latest start wins).
 * - Else among always-on (no schedule) playlists, prefer the latest publishedAt
 *   so a later publish overrides earlier ones in the activity indicator.
 */
function pickScheduledPlaylistForIndicator(playlists, now = new Date()) {
  const list = Array.isArray(playlists) ? playlists : [];
  const active = list
    .map((playlist, index) => ({ playlist, index }))
    .filter(({ playlist }) => isPublishedPlaylistActiveNow(playlist, now));
  if (!active.length) return null;

  const scheduled = active.filter(
    ({ playlist }) => !isUnscheduledPublishedPlaylist(playlist)
  );
  // Match player: scheduled takeovers beat always-on; always-on uses latest publish.
  const pool = scheduled.length ? scheduled : active;

  pool.sort((a, b) => {
    if (scheduled.length) {
      const aStart = getPublishedPlaylistStartMs(a.playlist) ?? 0;
      const bStart = getPublishedPlaylistStartMs(b.playlist) ?? 0;
      if (aStart !== bStart) return bStart - aStart;
    }
    const aPublished = new Date(a.playlist?.publishedAt || 0).getTime() || 0;
    const bPublished = new Date(b.playlist?.publishedAt || 0).getTime() || 0;
    if (aPublished !== bPublished) return bPublished - aPublished;
    // Same publish time → later entry in the assignments list (last published) wins.
    return b.index - a.index;
  });

  return pool[0]?.playlist || null;
}

function getSelectedPlaylist() {
  return playlistsCatalog.find((p) => p.id === selectedPlaylistId) || null;
}

async function fetchPlaylists() {
  try {
    const res = await fetch("/playlists");
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      console.warn("[CMS] GET /playlists failed", res.status, data);
      if (res.status === 404) {
        showResult({
          status: "failed",
          error:
            "CMS server is missing /playlists. Restart CMS with @tomorrowos/sdk 0.3.10 or newer."
        });
      }
      return;
    }
    if (Array.isArray(data.playlists)) {
      playlistsCatalog = data.playlists;
      renderPlaylistCatalog();
      if (selectedPlaylistId && !getSelectedPlaylist()) {
        selectedPlaylistId = null;
        playlistDraftActive = false;
        loadEditorFromSelection();
      }
    }
  } catch (err) {
    console.error("[CMS] fetchPlaylists:", err);
    showResult({ status: "failed", error: err.message });
  }
}

function renderPlaylistCatalog() {
  const list = document.getElementById("playlistCatalog");
  if (!list) return;
  list.innerHTML = "";

  if (playlistsCatalog.length === 0) {
    const li = document.createElement("li");
    li.className = "playlist-catalog-item";
    li.textContent = "No playlists yet. Tap +.";
    list.appendChild(li);
    return;
  }

  for (const pl of playlistsCatalog) {
    const li = document.createElement("li");
    li.className = "playlist-catalog-item";
    if (pl.id === selectedPlaylistId) li.classList.add("playlist-catalog-item--active");
    li.innerHTML = `<strong>${escapeHtml(pl.name)}</strong><small>${(pl.items || []).length} items</small>`;
    li.addEventListener("click", () => {
      playlistDraftActive = false;
      selectedPlaylistId = pl.id;
      loadEditorFromSelection();
      renderPlaylistCatalog();
    });
    list.appendChild(li);
  }
}

function isPlaylistEditorOpen() {
  return playlistDraftActive || !!selectedPlaylistId;
}

function updatePlaylistEditorVisibility() {
  const section = document.getElementById("playlistEditorSection");
  if (!section) return;
  section.classList.toggle("hidden", !isPlaylistEditorOpen());
}

function loadEditorFromSelection() {
  const pl = getSelectedPlaylist();
  const nameInput = document.getElementById("playlistName");
  const editorTitle = document.getElementById("editorTitle");

  if (!pl) {
    if (playlistDraftActive) {
      if (editorTitle) editorTitle.textContent = "New playlist";
      updatePlaylistEditorVisibility();
      renderEditorAssets();
      return;
    }
    playlistDraftActive = false;
    if (editorTitle) editorTitle.textContent = "Playlist editor";
    if (nameInput) nameInput.value = "";
    editorItems = [];
    loadScheduleIntoForm(null);
    updatePlaylistEditorVisibility();
    renderEditorAssets();
    return;
  }

  playlistDraftActive = false;
  if (editorTitle) editorTitle.textContent = `Edit: ${pl.name}`;
  if (nameInput) nameInput.value = pl.name || "";
  loadScheduleIntoForm(pl.schedule);
  editorItems = (pl.items || []).map((item) => ({
    id: crypto.randomUUID(),
    assetId: item.assetId,
    url: item.url,
    name: item.url?.split("/").pop() || "asset",
    type: item.type || "image",
    durationMs: normalizeDurationMs(item)
  }));
  renderEditorAssets();
  updatePlaylistEditorVisibility();
}

function clearPlaylistItemDropTargets() {
  document
    .querySelectorAll(".playlist-item--drop-target, .playlist-item--dragging")
    .forEach((el) => {
      el.classList.remove("playlist-item--drop-target", "playlist-item--dragging");
    });
}

function reorderEditorItems(fromId, toId) {
  const fromIdx = editorItems.findIndex((x) => x.id === fromId);
  const toIdx = editorItems.findIndex((x) => x.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
  const [moved] = editorItems.splice(fromIdx, 1);
  editorItems.splice(toIdx, 0, moved);
  renderEditorAssets();
}

function attachPlaylistItemDragDrop(li, item) {
  li.dataset.itemId = item.id;

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "playlist-item-drag-handle";
  handle.setAttribute("aria-label", "Drag to reorder");
  handle.title = "Drag to reorder";
  handle.textContent = "⋮⋮";
  handle.draggable = true;

  handle.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    draggingEditorItemId = item.id;
    li.classList.add("playlist-item--dragging");
  });

  handle.addEventListener("dragend", () => {
    draggingEditorItemId = null;
    clearPlaylistItemDropTargets();
  });

  li.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingEditorItemId && draggingEditorItemId !== item.id) {
      li.classList.add("playlist-item--drop-target");
    }
  });

  li.addEventListener("dragleave", (e) => {
    if (!li.contains(e.relatedTarget)) {
      li.classList.remove("playlist-item--drop-target");
    }
  });

  li.addEventListener("drop", (e) => {
    e.preventDefault();
    li.classList.remove("playlist-item--drop-target");
    const fromId = e.dataTransfer.getData("text/plain") || draggingEditorItemId;
    if (!fromId || fromId === item.id) return;
    reorderEditorItems(fromId, item.id);
  });

  li.insertBefore(handle, li.firstChild);
}

function renderEditorAssets() {
  const list = document.getElementById("playlistList");
  const empty = document.getElementById("playlistEmpty");
  draggingEditorItemId = null;
  list.querySelectorAll(".playlist-item").forEach((el) => el.remove());

  if (!isPlaylistEditorOpen()) {
    empty.classList.remove("hidden");
    empty.textContent = "Select or create a playlist (Playlists +).";
    return;
  }

  if (editorItems.length === 0) {
    empty.classList.remove("hidden");
    empty.textContent = "No assets yet. Tap + to upload.";
    return;
  }

  empty.classList.add("hidden");

  for (const item of editorItems) {
    const li = document.createElement("li");
    li.className = "playlist-item";

    if (item.type === "image" || item.type === "video") {
      const thumb = document.createElement(item.type === "video" ? "video" : "img");
      thumb.className = "playlist-item-thumb";
      thumb.draggable = false;
      try {
        thumb.src = absoluteMediaUrl(item.url);
      } catch {
        thumb.removeAttribute("src");
      }
      if (item.type === "video") {
        thumb.muted = true;
        thumb.playsInline = true;
      }
      li.appendChild(thumb);
    }

    const name = document.createElement("div");
    name.className = "playlist-item-name";
    name.textContent = item.name;

    const meta = document.createElement("div");
    meta.className = "playlist-item-meta";
    meta.textContent = `${item.type} · ${(item.durationMs / 1000).toFixed(0)}s`;

    const actions = document.createElement("div");
    actions.className = "playlist-item-actions";
    const durInput = document.createElement("input");
    const isVideo = item.type === "video";
    durInput.type = "number";
    durInput.min = "1";
    durInput.max = "3600";
    durInput.value = String(Math.round(item.durationMs / 1000));
    if (isVideo) {
      durInput.readOnly = true;
      durInput.disabled = true;
      durInput.title = "Video duration is auto-detected and cannot be edited.";
    }
    durInput.addEventListener("change", () => {
      if (isVideo) {
        durInput.value = String(Math.round(item.durationMs / 1000));
        return;
      }
      item.durationMs = Math.min(3600, Math.max(1, Number(durInput.value) || 10)) * 1000;
      meta.textContent = `${item.type} · ${Math.round(item.durationMs / 1000)}s`;
    });

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "playlist-item-btn";
    downloadBtn.textContent = "Download";
    downloadBtn.title = "Download asset";
    downloadBtn.addEventListener("click", () => void downloadMediaAsset(item));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger playlist-item-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      editorItems = editorItems.filter((x) => x.id !== item.id);
      renderEditorAssets();
    });

    actions.appendChild(durInput);
    actions.appendChild(downloadBtn);
    actions.appendChild(removeBtn);
    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(actions);
    attachPlaylistItemDragDrop(li, item);
    list.appendChild(li);
  }
}

async function saveCurrentPlaylist() {
  const name = String(document.getElementById("playlistName")?.value || "").trim();
  if (!name) {
    alert("Enter a playlist name.");
    return;
  }
  if (editorItems.length === 0) {
    alert("Add at least one asset before saving.");
    return;
  }

  let items;
  try {
    items = editorItems.map((item) => ({
      url: absoluteMediaUrl(item.url),
      assetId: item.assetId,
      type: item.type,
      durationMs: item.durationMs
    }));
  } catch (err) {
    alert(err.message);
    return;
  }

  const body = {
    id: selectedPlaylistId || undefined,
    name,
    schedule: buildScheduleFromForm(),
    items
  };

  const res = await fetch("/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  showResult(data);

  if (!res.ok) {
    alert(data.error || "Save failed");
    return;
  }

  playlistDraftActive = false;
  selectedPlaylistId = data.playlist?.id || selectedPlaylistId;
  await fetchPlaylists();
  loadEditorFromSelection();
}

async function deleteCurrentPlaylist() {
  if (!selectedPlaylistId) {
    alert("Select a playlist to delete.");
    return;
  }
  const pl = getSelectedPlaylist();
  if (
    !confirm(
      `Delete playlist "${pl?.name}"? Devices already playing it keep their cached copy until Clear or reboot without sync. New devices cannot receive it.`
    )
  ) {
    return;
  }

  const res = await fetch(`/playlists/${encodeURIComponent(selectedPlaylistId)}`, {
    method: "DELETE"
  });
  const data = await res.json();
  showResult(data);
  if (!res.ok) {
    alert(data.error || "Delete failed");
    return;
  }

  selectedPlaylistId = null;
  playlistDraftActive = false;
  editorItems = [];
  await fetchPlaylists();
  loadEditorFromSelection();
}

function newPlaylistDraft() {
  selectedPlaylistId = null;
  playlistDraftActive = true;
  const nameInput = document.getElementById("playlistName");
  if (nameInput) {
    nameInput.value = "";
    nameInput.focus();
  }
  loadScheduleIntoForm(null);
  editorItems = [];
  renderPlaylistCatalog();
  renderEditorAssets();
  updatePlaylistEditorVisibility();
  const editorTitle = document.getElementById("editorTitle");
  if (editorTitle) editorTitle.textContent = "New playlist";
  document.getElementById("playlistEditorSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  showResult({
    status: "draft",
    message: "New playlist — enter a name, add assets with + (right), then Save playlist."
  });
}

async function fetchDevices() {
  try {
    const res = await fetch("/devices");
    const data = await res.json();
    if (typeof data.serverStartedAt === "string") {
      const parsed = new Date(data.serverStartedAt).getTime();
      if (!Number.isNaN(parsed)) {
        const prev = serverStartedAtMs;
        serverStartedAtMs = parsed;
        if (prev !== parsed) scheduleReconnectGraceRerender();
      }
    }
    if (Array.isArray(data.devices)) {
      devicesCache = data.devices;
      renderDeviceCards();
      scheduleReconnectGraceRerender();
    }
  } catch (err) {
    showResult({ status: "failed", error: err.message });
  }
}

function screenshotThumbUrl(screenshot) {
  if (!screenshot?.url) return "";
  const cacheBust = encodeURIComponent(screenshot.capturedAt || Date.now());
  const joiner = screenshot.url.includes("?") ? "&" : "?";
  return `${screenshot.url}${joiner}v=${cacheBust}`;
}

function appendDeviceMetaRow(meta, label, value) {
  const row = document.createElement("div");
  row.className = "device-meta-row";
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  row.appendChild(dt);
  row.appendChild(dd);
  meta.appendChild(row);
}

function hasConfiguredOnOffTimer(timer) {
  return !!(
    timer &&
    typeof timer.turnOnAt === "string" &&
    typeof timer.turnOffAt === "string" &&
    timer.turnOnAt &&
    timer.turnOffAt
  );
}

function appendHardwareTimerStatusRow(meta, device) {
  const timer = device.onOffTimer || null;
  const configured = hasConfiguredOnOffTimer(timer);

  const row = document.createElement("div");
  row.className = "device-meta-row device-meta-row--timer-status";

  const dt = document.createElement("dt");
  dt.textContent = "Hardware timer status";

  const dd = document.createElement("dd");
  const statusWrap = document.createElement("span");
  statusWrap.className = "hardware-timer-status";
  statusWrap.tabIndex = 0;

  const statusValue = document.createElement("span");
  statusValue.className = configured
    ? "hardware-timer-status__value hardware-timer-status__value--on"
    : "hardware-timer-status__value hardware-timer-status__value--off";
  statusValue.textContent = configured ? "On" : "Off";

  const popup = document.createElement("span");
  popup.className = "hardware-timer-status__popup";
  popup.setAttribute("role", "tooltip");
  if (configured) {
    const onLine = document.createElement("div");
    const onLabel = document.createElement("strong");
    onLabel.textContent = "Turn on";
    onLine.appendChild(onLabel);
    onLine.appendChild(document.createTextNode(` ${timer.turnOnAt}`));

    const offLine = document.createElement("div");
    const offLabel = document.createElement("strong");
    offLabel.textContent = "Turn off";
    offLine.appendChild(offLabel);
    offLine.appendChild(document.createTextNode(` ${timer.turnOffAt}`));

    popup.appendChild(onLine);
    popup.appendChild(offLine);
  } else {
    popup.textContent = "No timer configured";
  }

  statusWrap.appendChild(statusValue);
  statusWrap.appendChild(popup);
  dd.appendChild(statusWrap);
  row.appendChild(dt);
  row.appendChild(dd);
  meta.appendChild(row);
}

function createDeviceScreenshotThumb(device) {
  const slot = document.createElement("div");
  slot.className = "device-screenshot-slot";
  const screenshot = device.latestScreenshot;
  if (screenshot?.url) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "device-screenshot-thumb";
    btn.title = `Last screenshot — ${formatDateTimeSeconds(screenshot.capturedAt)}`;
    const img = document.createElement("img");
    img.alt = `Last screenshot for ${device.deviceId}`;
    img.src = screenshotThumbUrl(screenshot);
    btn.appendChild(img);
    btn.addEventListener("click", () => openScreenshotModal(device.deviceId, screenshot));
    slot.appendChild(btn);
  }
  return slot;
}

function renderDeviceCards() {
  const grid = document.getElementById("devicesGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (devicesCache.length === 0) {
    const empty = document.createElement("p");
    empty.className = "devices-empty";
    empty.textContent = "No paired devices yet.";
    grid.appendChild(empty);
    return;
  }

  for (const device of devicesCache) {
    const card = document.createElement("article");
    card.className = "device-card";

    const header = document.createElement("div");
    header.className = "device-card-header";
    const headerMain = document.createElement("div");
    headerMain.className = "device-card-header-main";
    const connectionState = resolveDeviceConnectionState(device);
    const led = document.createElement("span");
    led.className = statusLedClass(connectionState);
    led.title = statusLedTitle(connectionState);
    led.setAttribute("role", "status");
    led.setAttribute("aria-label", statusLedTitle(connectionState));
    const title = document.createElement("h3");
    title.className = "device-card-title";
    const isEditingName = editingDeviceNameId === device.deviceId;
    if (isEditingName) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "device-card-title-input";
      input.value = editingDeviceNameValue || device.deviceName || "Screen";
      input.placeholder = "Device name";
      input.addEventListener("input", (ev) => {
        editingDeviceNameValue = String(ev.target.value || "");
      });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          void submitInlineDeviceRename(device.deviceId);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          cancelInlineDeviceRename();
        }
      });
      title.appendChild(input);
    } else {
      title.textContent = device.deviceName || "Screen";
    }
    headerMain.appendChild(led);
    headerMain.appendChild(title);

    const headerActions = document.createElement("div");
    headerActions.className = "device-card-header-actions";
    if (isEditingName) {
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "primary";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () =>
        void submitInlineDeviceRename(device.deviceId)
      );
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", cancelInlineDeviceRename);
      headerActions.appendChild(saveBtn);
      headerActions.appendChild(cancelBtn);
    } else {
      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", () =>
        startInlineDeviceRename(device.deviceId, device.deviceName)
      );
      headerActions.appendChild(renameBtn);
    }
    header.appendChild(headerMain);
    header.appendChild(headerActions);

    const published = document.createElement("ul");
    published.className = "device-published-list";
    const pubs = Array.isArray(device.publishedPlaylists) ? device.publishedPlaylists : [];
    const indicatorPlaylist = pickScheduledPlaylistForIndicator(pubs);
    const indicatorPlaylistId = indicatorPlaylist?.playlistId || "";
    if (pubs.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No playlists published";
      published.appendChild(li);
    } else {
      for (const p of pubs) {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.className = "device-published-label";
        label.textContent = p.name;
        const isPlaying = !!indicatorPlaylistId && p.playlistId === indicatorPlaylistId;
        if (isPlaying) {
          const playingLight = document.createElement("span");
          playingLight.className = "playlist-playing-light";
          playingLight.title = "Active now";
          label.appendChild(playingLight);
        }
        const rm = document.createElement("button");
        rm.type = "button";
        rm.textContent = "Remove";
        rm.addEventListener("click", () => removePlaylistFromDevice(device.deviceId, p.playlistId));
        li.appendChild(label);
        li.appendChild(rm);
        published.appendChild(li);
      }
    }

    const metaBlock = document.createElement("div");
    metaBlock.className = "device-meta-block";

    const metaTop = document.createElement("div");
    metaTop.className = "device-meta-top";

    const metaPrimary = document.createElement("dl");
    metaPrimary.className = "device-meta device-meta--primary";
    const primaryRows = [
      ["Device ID", device.deviceId],
      ["System", device.system || device.platform || "—"],
      ["Player version", device.playerVersion || "—"]
    ];
    for (const [label, value] of primaryRows) {
      appendDeviceMetaRow(metaPrimary, label, value);
    }

    metaTop.appendChild(metaPrimary);
    metaTop.appendChild(createDeviceScreenshotThumb(device));

    const metaSecondary = document.createElement("dl");
    metaSecondary.className = "device-meta device-meta--secondary";
    const secondaryRows = [
      ["Device online", formatDeviceOnlineLabel(device, connectionState)],
      ["Last boot", formatDateTimeSeconds(device.lastBootAt)],
      ["Latest push", formatDateTimeSeconds(device.lastPolicyPushAt)],
      ["Latest error", device.latestErrorMessage || "—"],
      ["Error at", formatDateTimeSeconds(device.latestErrorAt)]
    ];
    for (const [label, value] of secondaryRows) {
      appendDeviceMetaRow(metaSecondary, label, value);
    }
    appendHardwareTimerStatusRow(metaSecondary, device);

    metaBlock.appendChild(metaTop);
    metaBlock.appendChild(metaSecondary);

    const actions = document.createElement("div");
    actions.className = "device-card-actions";

    const publishBtn = document.createElement("button");
    publishBtn.type = "button";
    publishBtn.className = "primary";
    publishBtn.textContent = "Publish";
    publishBtn.addEventListener("click", () => openPublishModal(device.deviceId));

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.textContent = "Info";
    infoBtn.addEventListener("click", () => deviceAction(device.deviceId, "get-info"));

    const capBtn = document.createElement("button");
    capBtn.type = "button";
    capBtn.textContent = "Get capabilities";
    capBtn.addEventListener("click", () =>
      deviceAction(device.deviceId, "get-capabilities")
    );

    const rebootBtn = document.createElement("button");
    rebootBtn.type = "button";
    rebootBtn.textContent = "Reboot";
    rebootBtn.addEventListener("click", () => deviceAction(device.deviceId, "reboot"));

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => deviceAction(device.deviceId, "content/clear"));

    const logsBtn = document.createElement("button");
    logsBtn.type = "button";
    logsBtn.textContent = "Logs";
    logsBtn.addEventListener("click", () => viewDeviceLogs(device.deviceId));

    const screenshotBtn = document.createElement("button");
    screenshotBtn.type = "button";
    screenshotBtn.textContent = "Screenshot";
    screenshotBtn.addEventListener("click", () => captureDeviceScreenshot(device.deviceId));

    const latestScreenshotBtn = document.createElement("button");
    latestScreenshotBtn.type = "button";
    latestScreenshotBtn.textContent = "Last screen";
    latestScreenshotBtn.addEventListener("click", () => viewLatestScreenshot(device.deviceId));

    const timerBtn = document.createElement("button");
    timerBtn.type = "button";
    timerBtn.textContent = "Timer";
    timerBtn.title = "Daily screen on/off timer";
    timerBtn.addEventListener("click", () => openOnOffTimerModal(device.deviceId));

    const unpairBtn = document.createElement("button");
    unpairBtn.type = "button";
    unpairBtn.className = "danger";
    unpairBtn.textContent = "Unpair";
    unpairBtn.addEventListener("click", () => unpairDevice(device.deviceId));

    actions.appendChild(publishBtn);
    actions.appendChild(infoBtn);
    actions.appendChild(capBtn);
    actions.appendChild(rebootBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(logsBtn);
    actions.appendChild(screenshotBtn);
    actions.appendChild(latestScreenshotBtn);
    actions.appendChild(timerBtn);
    actions.appendChild(unpairBtn);

    card.appendChild(header);
    card.appendChild(published);
    card.appendChild(metaBlock);
    card.appendChild(actions);
    grid.appendChild(card);
  }
}

function openPublishModal(deviceId) {
  publishModalDeviceId = deviceId;
  const modal = document.getElementById("publishModal");
  const checklist = document.getElementById("publishChecklist");
  const hint = document.getElementById("publishModalHint");
  if (!modal || !checklist) return;

  if (playlistsCatalog.length === 0) {
    alert("Create and save at least one playlist first.");
    return;
  }

  const pubs = devicesCache.find((d) => d.deviceId === deviceId)?.publishedPlaylists || [];
  const publishedIds = new Set(pubs.map((p) => p.playlistId));
  const unpublished = playlistsCatalog.filter((pl) => !publishedIds.has(pl.id));

  if (unpublished.length === 0) {
    alert("All playlists are already published to this device. Use Remove on the card to unpublish one first.");
    return;
  }

  hint.textContent =
    `Device ${deviceId} — add playlists not yet on this device (snapshot at publish time). ` +
    `Publishing a playlist with no start/end date/time replaces any previously published unscheduled playlist on this device.`;
  checklist.innerHTML = "";

  for (const pl of unpublished) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = pl.id;
    cb.dataset.name = pl.name;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${pl.name}`));
    checklist.appendChild(label);
  }

  modal.classList.remove("hidden");
  resetPublishModalStatus();
}

function closePublishModal() {
  if (publishInProgress) return;
  publishModalDeviceId = null;
  resetPublishModalStatus();
  document.getElementById("publishModal")?.classList.add("hidden");
}

async function confirmPublishModal() {
  if (!publishModalDeviceId || publishInProgress) return;

  if (uploadInProgress || uploadQueue.length > 0) {
    alert("Wait for asset uploads to finish before publishing.");
    return;
  }

  const ids = [
    ...document.querySelectorAll("#publishChecklist input[type=checkbox]:checked")
  ].map((el) => el.value);

  if (ids.length === 0) {
    alert("Select at least one playlist.");
    return;
  }

  const deviceId = publishModalDeviceId;
  setPublishModalBusy(true);
  updatePublishStatusUi({ hidden: false, text: "Refreshing playlists...", percent: 8 });

  try {
    const refreshed = await refreshPlaylistsForPublish();
    if (!refreshed) {
      updatePublishStatusUi({
        text: "Could not load playlists from the server.",
        percent: 0,
        isError: true
      });
      setPublishModalBusy(false);
      alert("Could not load playlists from the server. Try again.");
      return;
    }

    const selectedPlaylists = ids
      .map((id) => playlistsCatalog.find((p) => p.id === id))
      .filter(Boolean);

    if (selectedPlaylists.length !== ids.length) {
      updatePublishStatusUi({
        text: "A selected playlist is no longer available.",
        percent: 0,
        isError: true
      });
      setPublishModalBusy(false);
      alert("A selected playlist was removed or changed. Close this dialog and open Publish again.");
      return;
    }

    for (const pl of selectedPlaylists) {
      if (!(pl.items || []).length) {
        updatePublishStatusUi({
          text: `Playlist "${pl.name || pl.id}" has no assets.`,
          percent: 0,
          isError: true
        });
        setPublishModalBusy(false);
        alert(`Playlist "${pl.name || pl.id}" has no assets. Save the playlist first.`);
        return;
      }
    }

    const mediaBaseUrl = getPublishMediaBaseUrl(selectedPlaylists);

    const verification = await verifyPlaylistsAssetsReady(
      selectedPlaylists,
      mediaBaseUrl,
      (done, total, assetName) => {
        const pct = 12 + Math.round((done / Math.max(total, 1)) * 68);
        updatePublishStatusUi({
          text: `Verifying assets (${done}/${total}): ${assetName}`,
          percent: pct
        });
      }
    );

    if (!verification.ok) {
      const lines = verification.failures
        .map((f) => `• ${f.playlist} — ${f.name}: ${f.reason}`)
        .join("\n");
      updatePublishStatusUi({
        text: `Could not load ${verification.failures.length} asset(s). Publishing blocked.`,
        percent: 0,
        isError: true
      });
      setPublishModalBusy(false);
      alert(`Cannot publish until all playlist assets are reachable:\n\n${lines}`);
      return;
    }

    updatePublishStatusUi({ text: "Publishing to device...", percent: 88 });

    const device = devicesCache.find((d) => d.deviceId === deviceId);
    const alreadyOnDevice = (device?.publishedPlaylists || []).map((p) => p.playlistId);
    const playlistIds = [...new Set([...alreadyOnDevice, ...ids])];

    const publishBody = { playlistIds };
    if (mediaBaseUrl) publishBody.mediaBaseUrl = mediaBaseUrl;

    const res = await fetch(`/device/${encodeURIComponent(deviceId)}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(publishBody)
    });
    const data = await res.json();
    showResult({ deviceId, publish: data });

    if (!res.ok) {
      updatePublishStatusUi({
        text: data.error || "Publish failed",
        percent: 0,
        isError: true
      });
      setPublishModalBusy(false);
      alert(data.error || "Publish failed");
      return;
    }

    updatePublishStatusUi({ text: "Published successfully!", percent: 100, isSuccess: true });
    await fetchDevices();
    await new Promise((resolve) => setTimeout(resolve, 900));
    publishInProgress = false;
    closePublishModal();
  } catch (err) {
    updatePublishStatusUi({
      text: err?.message || "Publish failed",
      percent: 0,
      isError: true
    });
    setPublishModalBusy(false);
    alert(err?.message || "Publish failed");
  }
}

async function removePlaylistFromDevice(deviceId, playlistId) {
  if (!confirm("Remove this playlist from the device? Currently playing content may continue until Clear or failed reboot sync.")) {
    return;
  }
  const res = await fetch(
    `/device/${encodeURIComponent(deviceId)}/assignments/${encodeURIComponent(playlistId)}`,
    { method: "DELETE" }
  );
  const data = await res.json();
  showResult({ deviceId, remove: data });
  if (!res.ok) {
    alert(data.error || "Remove failed");
    return;
  }
  await fetchDevices();
}

function uploadFileWithProgress(file, { onProgress, attempt }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const q = new URLSearchParams({ filename: file.name });
    xhr.open("POST", `/media/upload?${q.toString()}`, true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      if (typeof onProgress === "function") onProgress(percent);
    };

    xhr.onerror = () => reject(new Error(`Network error on attempt ${attempt}`));
    xhr.ontimeout = () => reject(new Error(`Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s`));

    xhr.onload = () => {
      let payload = {};
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.status !== "failed") {
        resolve(payload);
        return;
      }
      reject(new Error(payload.error || `Upload failed (${xhr.status})`));
    };

    xhr.send(file);
  });
}

async function uploadFile(file, onProgress) {
  let lastErr = null;
  for (let attempt = 1; attempt <= UPLOAD_MAX_RETRIES; attempt += 1) {
    try {
      const payload = await uploadFileWithProgress(file, { onProgress, attempt });
      return payload;
    } catch (err) {
      lastErr = err;
      if (attempt >= UPLOAD_MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastErr || new Error("Upload failed");
}

async function addAssetFromFile(file, queueIndex, queueTotal) {
  if (!isPlaylistEditorOpen()) {
    newPlaylistDraft();
  }
  const type = inferMediaType(file.name, file.type);
  const data = await uploadFile(file, (percent) => {
    updateUploadStatusUi({
      text: `Uploading ${file.name} (${percent}%)`,
      percent,
      queueText: `File ${queueIndex}/${queueTotal}`
    });
  });
  const durationMs = await resolveVideoDurationMs(file, type, data);
  editorItems.push({
    id: crypto.randomUUID(),
    assetId: data.assetId,
    url: data.url,
    name: file.name,
    type,
    durationMs
  });
  renderEditorAssets();
  showResult({
    status: "uploaded",
    ...data,
    fileName: file.name,
    detectedDurationMs: durationMs,
    detectedDurationSec: Math.round(durationMs / 1000)
  });
}

async function processUploadQueue() {
  if (uploadInProgress) return;
  if (uploadQueue.length === 0) {
    updateUploadStatusUi({ hidden: true });
    setAssetUploadBusy(false);
    return;
  }

  uploadInProgress = true;
  setAssetUploadBusy(true);
  const total = uploadQueue.length;
  const failures = [];

  try {
    for (let i = 0; i < total; i += 1) {
      const file = uploadQueue[i];
      try {
        await addAssetFromFile(file, i + 1, total);
      } catch (err) {
        failures.push({ file: file.name, error: err?.message || String(err) });
      }
    }
  } finally {
    uploadQueue = [];
    uploadInProgress = false;
    setAssetUploadBusy(false);
    updateUploadStatusUi({ hidden: true });
  }

  if (failures.length > 0) {
    showResult({ status: "upload_completed_with_failures", failures });
    alert(
      `Uploaded with ${failures.length} failure(s). Check result panel for details.`
    );
  } else {
    showResult({ status: "upload_completed", total });
  }
}

async function verify() {
  const code = String(document.getElementById("code").value || "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (code.length !== 6) {
    showResult({ status: "failed", error: "Enter the 6-character code from the screen." });
    return;
  }
  const res = await fetch("/pairing/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const data = await res.json();
  showResult(data);
  if (data.deviceId) {
    document.getElementById("code").value = "";
    await fetchDevices();
  }
}

async function unpairDevice(deviceId) {
  if (!confirm("Unpair this device?")) return;
  const res = await fetch("/pairing/unpair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId })
  });
  const data = await res.json();
  showResult(data);
  if (res.ok) await fetchDevices();
}

async function renameDevice(deviceId, currentName) {
  if (!deviceId) return false;
  const trimmed = String(currentName || "").trim();
  if (!trimmed) {
    alert("Device name cannot be empty.");
    return false;
  }

  const res = await fetch(`/device/${encodeURIComponent(deviceId)}/name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceName: trimmed })
  });
  const data = await res.json();
  showResult({ deviceId, rename: data });
  if (!res.ok) {
    alert(data.error || "Rename failed");
    return false;
  }
  return true;
}

function startInlineDeviceRename(deviceId, currentName) {
  editingDeviceNameId = deviceId;
  editingDeviceNameValue = String(currentName || "").trim() || "Screen";
  renderDeviceCards();
}

function cancelInlineDeviceRename() {
  editingDeviceNameId = null;
  editingDeviceNameValue = "";
  renderDeviceCards();
}

async function submitInlineDeviceRename(deviceId) {
  const ok = await renameDevice(deviceId, editingDeviceNameValue);
  if (!ok) return;
  editingDeviceNameId = null;
  editingDeviceNameValue = "";
  await fetchDevices();
}

async function deviceAction(deviceId, action) {
  if (!deviceId) return;
  if (action === "reboot" && !confirm("Reboot this device?")) return;
  if (
    action === "content/clear" &&
    !confirm("Clear content on this device and remove all published playlists?")
  ) {
    return;
  }
  const res = await fetch(`/device/${encodeURIComponent(deviceId)}/${action}`, {
    method: "POST"
  });
  const data = await res.json();
  showResult({ deviceId, action, ...data });
  if (!res.ok) {
    alert(data.error || `${action} failed`);
    return;
  }
  if (action === "content/clear" && data.assignmentsCleared !== true) {
    alert("Content cleared on device, but playlist assignments were not removed. Restart CMS with latest SDK.");
  }
  if (action === "reboot" || action === "content/clear") await fetchDevices();
}

async function viewDeviceLogs(deviceId) {
  if (!deviceId) return;
  const res = await fetch(`/device/${encodeURIComponent(deviceId)}/logs`);
  const data = await res.json();
  showResult({ deviceId, logs: data.logs || [] });
  if (!res.ok) {
    alert(data.error || "Failed to load logs");
    return;
  }
}

async function captureDeviceScreenshot(deviceId) {
  if (!deviceId) return;
  const res = await fetch(`/device/${encodeURIComponent(deviceId)}/screenshot`, {
    method: "POST"
  });
  const data = await res.json();
  showResult({ deviceId, screenshot: data });
  if (!res.ok) {
    alert(data.error || "Screenshot failed");
    return;
  }
  const capturedAt = formatDateTimeSeconds(data.screenshot?.capturedAt);
  alert(`Screenshot captured successfully${capturedAt ? ` at ${capturedAt}` : ""}.`);
  void fetchDevices();
}

async function viewLatestScreenshot(deviceId) {
  if (!deviceId) return;
  const res = await fetch(`/device/${encodeURIComponent(deviceId)}/screenshot/latest`);
  const data = await res.json();
  showResult({ deviceId, latestScreenshot: data });
  if (!res.ok) {
    alert(data.error || "No screenshot available");
    return;
  }
  openScreenshotModal(deviceId, data.screenshot);
}

function openScreenshotModal(deviceId, screenshot) {
  const modal = document.getElementById("screenshotModal");
  const hint = document.getElementById("screenshotModalHint");
  const img = document.getElementById("screenshotModalImage");
  if (!modal || !hint || !img || !screenshot) return;

  const capturedAt = formatDateTimeSeconds(screenshot.capturedAt);
  hint.textContent = `Device ${deviceId} — captured at ${capturedAt}`;
  const cacheBust = encodeURIComponent(screenshot.capturedAt || Date.now());
  img.src = `${screenshot.url}${screenshot.url.includes("?") ? "&" : "?"}v=${cacheBust}`;
  img.classList.remove("hidden");
  modal.classList.remove("hidden");
}

function closeScreenshotModal() {
  const modal = document.getElementById("screenshotModal");
  const img = document.getElementById("screenshotModalImage");
  if (img) {
    img.removeAttribute("src");
    img.classList.add("hidden");
  }
  modal?.classList.add("hidden");
}

function normalizeTimeInputValue(value, fallback) {
  const raw = String(value || "").trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!match) return fallback;
  const hh = Math.min(23, Math.max(0, Number(match[1])));
  const mm = Math.min(59, Math.max(0, Number(match[2])));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return fallback;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

let onOffTimerModalDeviceId = null;

function openOnOffTimerModal(deviceId) {
  const device = devicesCache.find((d) => d.deviceId === deviceId);
  if (!device) return;

  onOffTimerModalDeviceId = deviceId;
  const modal = document.getElementById("onOffTimerModal");
  const onEl = document.getElementById("onOffTimerTurnOnAt");
  const offEl = document.getElementById("onOffTimerTurnOffAt");
  const removeBtn = document.getElementById("onOffTimerRemoveBtn");
  if (!modal || !onEl || !offEl) return;

  const timer = device.onOffTimer || {};
  const configured = hasConfiguredOnOffTimer(device.onOffTimer);
  onEl.value = normalizeTimeInputValue(timer.turnOnAt, "06:00");
  offEl.value = normalizeTimeInputValue(timer.turnOffAt, "18:00");
  if (removeBtn) {
    removeBtn.classList.toggle("hidden", !configured);
    removeBtn.disabled = false;
  }
  modal.classList.remove("hidden");
}

function closeOnOffTimerModal() {
  const modal = document.getElementById("onOffTimerModal");
  if (modal) modal.classList.add("hidden");
  onOffTimerModalDeviceId = null;
}

async function saveOnOffTimerModal() {
  const deviceId = onOffTimerModalDeviceId;
  if (!deviceId) return;

  const onEl = document.getElementById("onOffTimerTurnOnAt");
  const offEl = document.getElementById("onOffTimerTurnOffAt");
  const saveBtn = document.getElementById("onOffTimerSaveBtn");
  const removeBtn = document.getElementById("onOffTimerRemoveBtn");
  if (!onEl || !offEl) return;

  const onOffTimer = {
    turnOnAt: normalizeTimeInputValue(onEl.value, "06:00"),
    turnOffAt: normalizeTimeInputValue(offEl.value, "18:00")
  };

  if (onOffTimer.turnOnAt === onOffTimer.turnOffAt) {
    alert("Turn on and turn off times must be different.");
    return;
  }

  if (saveBtn) saveBtn.disabled = true;
  if (removeBtn) removeBtn.disabled = true;
  try {
    const res = await fetch(`/device/${encodeURIComponent(deviceId)}/on-off-timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onOffTimer })
    });
    const data = await res.json();
    if (!res.ok || data.status === "failed") {
      alert(data.error || "Could not save on/off timer");
      return;
    }
    showResult({ deviceId, onOffTimer: data.onOffTimer, pushed: data.pushed });
    closeOnOffTimerModal();
    await fetchDevices();
  } catch (err) {
    alert(err?.message || "Could not save on/off timer");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (removeBtn) removeBtn.disabled = false;
  }
}

async function removeOnOffTimerModal() {
  const deviceId = onOffTimerModalDeviceId;
  if (!deviceId) return;

  if (
    !confirm(
      "Remove the on/off timer? The screen will stay in its current on or off state until you set a timer again."
    )
  ) {
    return;
  }

  const saveBtn = document.getElementById("onOffTimerSaveBtn");
  const removeBtn = document.getElementById("onOffTimerRemoveBtn");
  if (saveBtn) saveBtn.disabled = true;
  if (removeBtn) removeBtn.disabled = true;
  try {
    const res = await fetch(`/device/${encodeURIComponent(deviceId)}/on-off-timer`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!res.ok || data.status === "failed") {
      alert(data.error || "Could not remove on/off timer");
      return;
    }
    showResult({ deviceId, onOffTimer: null, pushed: data.pushed });
    closeOnOffTimerModal();
    await fetchDevices();
  } catch (err) {
    alert(err?.message || "Could not remove on/off timer");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (removeBtn) removeBtn.disabled = false;
  }
}

function openDownloadFailedModal(detail) {
  const modal = document.getElementById("downloadFailedModal");
  const message = document.getElementById("downloadFailedModalMessage");
  if (!modal) return;
  if (message) {
    message.textContent = detail
      ? `Could not download this asset: ${detail}`
      : "Could not download this asset.";
  }
  modal.classList.remove("hidden");
}

function closeDownloadFailedModal() {
  document.getElementById("downloadFailedModal")?.classList.add("hidden");
}

function openDownloadPlayersModal() {
  document.getElementById("downloadPlayersModal")?.classList.remove("hidden");
}

function closeDownloadPlayersModal() {
  document.getElementById("downloadPlayersModal")?.classList.add("hidden");
}

function setUpdateSdkVersionLabel(version) {
  const label = document.getElementById("updateSdkVersionLabel");
  if (!label) return;
  label.textContent = version || "unknown";
}

async function openUpdateSdkModal() {
  const modal = document.getElementById("updateSdkModal");
  const promptEl = document.getElementById("updateSdkPromptText");
  if (promptEl) promptEl.textContent = UPDATE_SDK_PROMPT;
  setUpdateSdkVersionLabel(cachedSdkVersion || "Loading…");
  modal?.classList.remove("hidden");

  if (!cachedSdkVersion) {
    await fetchServerStatus();
    setUpdateSdkVersionLabel(cachedSdkVersion || "unknown");
  }
}

function closeUpdateSdkModal() {
  document.getElementById("updateSdkModal")?.classList.add("hidden");
}

async function copyUpdateSdkPrompt() {
  const text =
    document.getElementById("updateSdkPromptText")?.textContent?.trim() ||
    UPDATE_SDK_PROMPT;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("copyUpdateSdkPromptBtn");
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = prev || "Copy prompt";
      }, 1200);
    }
  } catch {
    alert("Could not copy automatically. Select the prompt text and copy it manually.");
  }
}

function handlePlayerDownloadLinkClick(ev) {
  ev.preventDefault();
  const platform = ev.currentTarget?.dataset?.playerDownload || "unknown";
  console.info(`[CMS] Player download link placeholder (${platform}) — URL not configured yet.`);
}

function sanitizeDownloadFilename(name) {
  const base = String(name || "asset").trim() || "asset";
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

async function downloadMediaAsset(item) {
  const candidates = [];
  const sameOriginPath = resolveVerificationMediaUrl(item.url);
  if (sameOriginPath) candidates.push(sameOriginPath);
  try {
    const absolute = absoluteMediaUrl(item.url);
    if (absolute && !candidates.includes(absolute)) candidates.push(absolute);
  } catch (_) {}

  if (candidates.length === 0) {
    openDownloadFailedModal("Media URL is not available.");
    return;
  }

  const filename = sanitizeDownloadFilename(item.name || item.url.split("/").pop() || "asset");

  let lastError = "Network or browser error.";
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      return;
    } catch (err) {
      lastError = err?.message || lastError;
    }
  }

  openDownloadFailedModal(lastError);
}

function connectorStateLabel(state) {
  if (state === "ok") return "OK";
  if (state === "warn") return "Warning";
  if (state === "missing") return "Not set";
  return "Error";
}

function overallStatusCopy(overall) {
  if (overall === "ok") return "All connectors look healthy.";
  if (overall === "degraded") {
    return "CMS is running with warnings — review media or database durability below.";
  }
  if (overall === "blocked") {
    return "Setup incomplete — fix the blockers below so pairing and media work reliably.";
  }
  return "Checking connectors…";
}

function renderServerStatus(report) {
  const section = document.getElementById("serverStatusSection");
  const list = document.getElementById("serverStatusList");
  const overallEl = document.getElementById("serverStatusOverall");
  const blockersEl = document.getElementById("serverStatusBlockers");
  if (!section || !list || !overallEl || !blockersEl) return;

  const overall = report?.overall || "blocked";
  section.classList.remove(
    "server-status-card--ok",
    "server-status-card--degraded",
    "server-status-card--blocked"
  );
  section.classList.add(`server-status-card--${overall}`);
  overallEl.textContent = overallStatusCopy(overall);

  list.innerHTML = "";
  const connectors = Array.isArray(report?.connectors) ? report.connectors : [];
  for (const connector of connectors) {
    const li = document.createElement("li");
    li.className = "server-status-row";

    const main = document.createElement("div");
    main.className = "server-status-row-main";

    const label = document.createElement("span");
    label.className = "server-status-label";
    label.textContent = connector.label || connector.id || "Connector";
    main.appendChild(label);

    if (connector.provider) {
      const provider = document.createElement("span");
      provider.className = "server-status-provider";
      provider.textContent = connector.provider;
      main.appendChild(provider);
    }

    const badge = document.createElement("span");
    const state = connector.state || "error";
    badge.className = `server-status-badge server-status-badge--${state}`;
    badge.textContent = connectorStateLabel(state);

    const detail = document.createElement("p");
    detail.className = "server-status-detail";
    detail.textContent = connector.detail || "";

    li.appendChild(main);
    li.appendChild(badge);
    li.appendChild(detail);
    list.appendChild(li);
  }

  const blockers = Array.isArray(report?.blockers) ? report.blockers : [];
  blockersEl.innerHTML = "";
  if (blockers.length === 0) {
    blockersEl.classList.add("hidden");
    return;
  }

  blockersEl.classList.remove("hidden");
  for (const blocker of blockers) {
    const card = document.createElement("div");
    card.className = "server-status-blocker";

    const title = document.createElement("h3");
    title.textContent = blocker.title || "Connector issue";

    const message = document.createElement("p");
    message.textContent = blocker.message || "";

    const fix = document.createElement("p");
    fix.className = "server-status-blocker-fix";
    fix.textContent = blocker.fixHint
      ? `How to fix: ${blocker.fixHint}`
      : "How to fix: update Secrets / env and restart the CMS.";

    card.appendChild(title);
    card.appendChild(message);
    card.appendChild(fix);
    blockersEl.appendChild(card);
  }
}

async function fetchServerStatus() {
  try {
    const res = await fetch("/status", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      renderServerStatus({
        overall: "blocked",
        connectors: [
          {
            id: "server",
            label: "Server",
            state: "error",
            detail: data?.error || `HTTP ${res.status}`
          }
        ],
        blockers: [
          {
            connectorId: "server",
            title: "Could not load server status",
            message: data?.error || `HTTP ${res.status}`,
            fixHint: "Confirm the CMS is running with @tomorrowos/sdk that includes GET /status."
          }
        ]
      });
      return;
    }
    if (typeof data.sdkVersion === "string" && data.sdkVersion.trim()) {
      cachedSdkVersion = data.sdkVersion.trim();
    }
    if (typeof data.suggestedCmsUrl === "string") {
      applyDefaultCmsUrlForScreens(data.suggestedCmsUrl);
    }
    renderServerStatus(data);
  } catch (err) {
    renderServerStatus({
      overall: "blocked",
      connectors: [
        {
          id: "server",
          label: "Server",
          state: "error",
          detail: err?.message || "Network error"
        }
      ],
      blockers: [
        {
          connectorId: "server",
          title: "CMS unreachable",
          message: err?.message || "Network error",
          fixHint: "Start the CMS (`npm run start`) and reload this page."
        }
      ]
    });
  }
}

function startDevicePolling() {
  if (devicePollTimer) clearInterval(devicePollTimer);
  void fetchDevices();
  devicePollTimer = setInterval(() => void fetchDevices(), 8000);
}

function startServerStatusPolling() {
  if (serverStatusTimer) clearInterval(serverStatusTimer);
  void fetchServerStatus();
  serverStatusTimer = setInterval(() => void fetchServerStatus(), 30000);
}

document.addEventListener("DOMContentLoaded", () => {
  const cmsUrlSection = document.getElementById("cmsUrlSection");
  if (cmsUrlSection && !isLocalPanelHost(window.location.hostname)) {
    cmsUrlSection.classList.add("hidden");
  }

  const savedMediaBase = localStorage.getItem(PANEL_MEDIA_BASE_KEY);
  const cmsBaseInput = document.getElementById("cmsDeviceBaseUrl");
  if (savedMediaBase && cmsBaseInput) cmsBaseInput.value = savedMediaBase;

  updatePlaylistEditorVisibility();
  void fetchPlaylists();
  startDevicePolling();
  startServerStatusPolling();

  document
    .getElementById("serverStatusRefreshBtn")
    ?.addEventListener("click", () => void fetchServerStatus());

  document.getElementById("newPlaylistBtn")?.addEventListener("click", newPlaylistDraft);
  document.getElementById("savePlaylistBtn")?.addEventListener("click", () => void saveCurrentPlaylist());
  document.getElementById("deletePlaylistBtn")?.addEventListener("click", () => void deleteCurrentPlaylist());
  document.getElementById("publishConfirmBtn")?.addEventListener("click", () => void confirmPublishModal());

  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closePublishModal);
  });
  document.querySelectorAll("[data-close-screenshot-modal]").forEach((el) => {
    el.addEventListener("click", closeScreenshotModal);
  });
  document.querySelectorAll("[data-close-on-off-timer-modal]").forEach((el) => {
    el.addEventListener("click", closeOnOffTimerModal);
  });
  document
    .getElementById("onOffTimerSaveBtn")
    ?.addEventListener("click", () => void saveOnOffTimerModal());
  document
    .getElementById("onOffTimerRemoveBtn")
    ?.addEventListener("click", () => void removeOnOffTimerModal());
  document.querySelectorAll("[data-close-download-failed-modal]").forEach((el) => {
    el.addEventListener("click", closeDownloadFailedModal);
  });

  document.getElementById("downloadPlayersBtn")?.addEventListener("click", openDownloadPlayersModal);
  document.querySelectorAll("[data-close-download-players-modal]").forEach((el) => {
    el.addEventListener("click", closeDownloadPlayersModal);
  });
  document.querySelectorAll("[data-player-download]").forEach((el) => {
    el.addEventListener("click", handlePlayerDownloadLinkClick);
  });

  document.getElementById("updateSdkBtn")?.addEventListener("click", () => void openUpdateSdkModal());
  document.querySelectorAll("[data-close-update-sdk-modal]").forEach((el) => {
    el.addEventListener("click", closeUpdateSdkModal);
  });
  document
    .getElementById("copyUpdateSdkPromptBtn")
    ?.addEventListener("click", () => void copyUpdateSdkPrompt());

  document.getElementById("addAssetBtn")?.addEventListener("click", () => {
    if (uploadInProgress) return;
    if (!isPlaylistEditorOpen()) {
      newPlaylistDraft();
    }
    document.getElementById("fileInput")?.click();
  });

  document.getElementById("fileInput")?.addEventListener("change", async (ev) => {
    const files = ev.target.files;
    if (!files?.length) return;
    uploadQueue.push(...Array.from(files));
    void processUploadQueue();
    ev.target.value = "";
  });
});
