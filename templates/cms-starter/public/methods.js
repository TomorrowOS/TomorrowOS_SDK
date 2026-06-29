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

/** @type {string|null} */
let publishModalDeviceId = null;

let devicePollTimer = null;
let uploadQueue = [];
let uploadInProgress = false;

const UPLOAD_MAX_RETRIES = 3;
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

function formatDeviceOnlineLabel(device) {
  if (!device.connected) return "Not active";
  const bootIso = device.lastBootAt;
  if (!bootIso) return "Not active";
  const bootMs = new Date(bootIso).getTime();
  if (Number.isNaN(bootMs)) return "Not active";
  return formatDurationMs(Date.now() - bootMs);
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

function playlistHasRelativeMediaUrls(playlist) {
  return (playlist?.items || []).some((item) => {
    const url = String(item?.url || "").trim();
    return url && !/^https?:\/\//i.test(url);
  });
}

/**
 * Base URL sent on publish only when needed.
 * - Hosted (e.g. Replit): use public origin only if items are still relative (/uploads/...).
 * - Local: use saved LAN override only when set; never default to rewriting otherwise.
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
  return "";
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

function renderEditorAssets() {
  const list = document.getElementById("playlistList");
  const empty = document.getElementById("playlistEmpty");
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

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      editorItems = editorItems.filter((x) => x.id !== item.id);
      renderEditorAssets();
    });

    actions.appendChild(durInput);
    actions.appendChild(removeBtn);
    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(actions);
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
    if (Array.isArray(data.devices)) {
      devicesCache = data.devices;
      renderDeviceCards();
    }
  } catch (err) {
    showResult({ status: "failed", error: err.message });
  }
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
    const led = document.createElement("span");
    led.className = `status-led ${device.connected ? "status-led--online" : "status-led--offline"}`;
    const title = document.createElement("h3");
    title.className = "device-card-title";
    title.textContent = device.deviceName || "Screen";
    header.appendChild(led);
    header.appendChild(title);

    const published = document.createElement("ul");
    published.className = "device-published-list";
    const pubs = Array.isArray(device.publishedPlaylists) ? device.publishedPlaylists : [];
    if (pubs.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No playlists published";
      published.appendChild(li);
    } else {
      for (const p of pubs) {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = p.name;
        const rm = document.createElement("button");
        rm.type = "button";
        rm.textContent = "Remove";
        rm.addEventListener("click", () => removePlaylistFromDevice(device.deviceId, p.playlistId));
        li.appendChild(label);
        li.appendChild(rm);
        published.appendChild(li);
      }
    }

    const meta = document.createElement("dl");
    meta.className = "device-meta";
    const rows = [
      ["Device ID", device.deviceId],
      ["System", device.system || device.platform || "—"],
      ["Player version", device.playerVersion || "—"],
      ["Device online", formatDeviceOnlineLabel(device)],
      ["Last boot", formatDateTimeSeconds(device.lastBootAt)],
      ["Latest push", formatDateTimeSeconds(device.lastPolicyPushAt)],
      ["Latest error", device.latestErrorMessage || "—"],
      ["Error at", formatDateTimeSeconds(device.latestErrorAt)]
    ];
    for (const [label, value] of rows) {
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
    actions.appendChild(unpairBtn);

    card.appendChild(header);
    card.appendChild(published);
    card.appendChild(meta);
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

  hint.textContent = `Device ${deviceId} — add playlists not yet on this device (snapshot at publish time).`;
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
}

function closePublishModal() {
  publishModalDeviceId = null;
  document.getElementById("publishModal")?.classList.add("hidden");
}

async function confirmPublishModal() {
  if (!publishModalDeviceId) return;
  const ids = [
    ...document.querySelectorAll("#publishChecklist input[type=checkbox]:checked")
  ].map((el) => el.value);

  if (ids.length === 0) {
    alert("Select at least one playlist.");
    return;
  }

  const selectedPlaylists = ids
    .map((id) => playlistsCatalog.find((p) => p.id === id))
    .filter(Boolean);

  for (const pl of selectedPlaylists) {
    if (!(pl.items || []).length) {
      alert(`Playlist "${pl.name || pl.id}" has no assets. Save the playlist first.`);
      return;
    }
  }

  const mediaBaseUrl = getPublishMediaBaseUrl(selectedPlaylists);
  if (mediaBaseUrl === "") {
    alert(
      "Local CMS: save a LAN URL under “CMS URL for screens” (e.g. http://192.168.1.105:3000) so TVs can load /uploads paths. On Replit/hosted CMS this field is not required."
    );
    return;
  }

  const device = devicesCache.find((d) => d.deviceId === publishModalDeviceId);
  const alreadyOnDevice = (device?.publishedPlaylists || []).map((p) => p.playlistId);
  const playlistIds = [...new Set([...alreadyOnDevice, ...ids])];

  const publishBody = { playlistIds };
  if (mediaBaseUrl) publishBody.mediaBaseUrl = mediaBaseUrl;

  const res = await fetch(
    `/device/${encodeURIComponent(publishModalDeviceId)}/assignments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(publishBody)
    }
  );
  const data = await res.json();
  showResult({ deviceId: publishModalDeviceId, publish: data });
  if (!res.ok) {
    alert(data.error || "Publish failed");
    return;
  }
  closePublishModal();
  await fetchDevices();
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

function startDevicePolling() {
  if (devicePollTimer) clearInterval(devicePollTimer);
  void fetchDevices();
  devicePollTimer = setInterval(() => void fetchDevices(), 8000);
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

  document.getElementById("newPlaylistBtn")?.addEventListener("click", newPlaylistDraft);
  document.getElementById("savePlaylistBtn")?.addEventListener("click", () => void saveCurrentPlaylist());
  document.getElementById("deletePlaylistBtn")?.addEventListener("click", () => void deleteCurrentPlaylist());
  document.getElementById("publishConfirmBtn")?.addEventListener("click", () => void confirmPublishModal());

  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closePublishModal);
  });

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
