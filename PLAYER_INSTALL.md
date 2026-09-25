# Player Installation — Getting TomorrowOS on your screens

This guide covers the full path from a verified player package to a paired screen.

| Step | What this doc answers |
| --- | --- |
| 1 | Where the verified player package comes from |
| 2 | How the player receives the CMS endpoint |
| 3 | Exact device installation steps |
| 4 | Six-character pairing |
| 5 | Tested firmware and model limitations |
| 6 | Safe unpair / re-pair |
| 7 | Known failure states |

---

## Prerequisites

- A running TomorrowOS CMS (Replit, Vercel, Railway, or self-hosted)
- A CMS URL the **panel** can reach (public HTTPS in production, or a tunnel / LAN IP for lab tests)
- A supported panel: **Samsung Tizen 6.5 and 7.0**, **BrightSign Series 3-6**, or **Windows 11 Pro x64** (Windows Player V1)

---

## 1. Where the verified player package comes from

| Platform | Installation |
| --- | --- |
| **Samsung** | Install on a Samsung Tizen player via **Custom App** (`https://tmr.sh/tizen`), or download the player from the CMS and install it via USB. |
| **BrightSign** | Download the ZIP package from the CMS with `config.js` configured so that `cmsEndpoint` points to your CMS origin and install it via SD card. |
| **Windows** | Download **Windows Player V1** (`TomorrowOS-Windows-Setup.exe`) and run the installer on **Windows 11 Pro x64**. |

### Samsung (recommended path)

**Preferred:** on the display, open **App Management** and install with **Custom App**:

```txt
https://tmr.sh/tizen
```

**Alternative:** Control Panel → **Download Players → Samsung**, download the player package, then install the `.wgt` and `.html` via USB.

After install, enter your CMS URL on the on-device setup screen.

### BrightSign

**Option A — distribution ZIP**

1. Download `https://tmr.sh/app/brightsign/brightsign_package.zip`.
2. Unzip and set `config.js` `cmsEndpoint` to your CMS origin (and set `orientation`).
3. Copy files to the SD card root.

**Option B — from your CMS (auto-fills CMS URL)**

1. Control Panel → **Download Players → BrightSign** (`GET /players/brightsign.zip`).
2. That zip already has `cmsEndpoint` pointed at **this** CMS origin — usually you only confirm `orientation`.

### Windows

**Windows 11 Pro x64** — Windows Player V1. Download the installer from either:

- `https://tmr.sh/app/windows/TomorrowOS-Windows-Setup.exe`, **or**
- Control Panel → **Download Players → Windows**

Then install:

1. Run `TomorrowOS-Windows-Setup.exe`.
2. In the wizard, set the CMS endpoint, orientation, display, and maintenance passcode.
3. Finish the wizard and launch the player.
4. The screen shows a six-character pairing code. Enter it in the Control Panel to pair.

Caption in the Control Panel today: **Tizen 6.5 and 7.0**, **BrightSign Series 3-6**, **Windows 11 Pro x64**. 

---

## 2. How the player receives the CMS endpoint

The two platforms differ. Using the wrong method is a common pairing failure.

### Samsung Tizen — on-device CMS setup

The Tizen `.wgt` does **not** bake a BrightSign-style `config.js` endpoint.

1. Install / launch the player.
2. First boot: choose **orientation** (`landscape` / `portrait-right` / `portrait-left`).
3. If no CMS URL is stored yet, the player shows the **CMS setup** screen.
4. Enter the CMS HTTP(S) origin, for example:
   - Hosted: `https://your-cms.example.com/`
   - Lab: `http://192.168.1.105:3000/` (your PC **LAN IP**, not `localhost`)
5. The player saves the URL in `localStorage` and converts `http://` / `https://` → `ws://` / `wss://` for the device WebSocket.
6. Press remote **Red (A)** later to re-open orientation selection.

If you installed via App URL or a CMS USB download, enter **your CMS origin** on the setup screen (not the App URL itself).

### BrightSign — `config.js` on the storage card

BrightSign has **no** on-device CMS setup UI in the current player.

```js
window.TOMORROWOS_CONFIG = {
  cmsEndpoint: "https://your-cms.example.com/",
  orientation: "landscape" // landscape | portrait-right | portrait-left
};
```

| Field | Purpose |
| --- | --- |
| `cmsEndpoint` | CMS HTTP(S) URL (converted to `ws://` / `wss://` at runtime) |
| `orientation` | Screen orientation baked into the boot config |

When you download via the CMS, `cmsEndpoint` is **filled automatically** with that CMS origin. Usually you only confirm `orientation`.

### Never use `localhost` on a panel

`localhost` / `127.0.0.1` on the player points at the **display itself**, not your laptop. Pairing and WebSocket will fail. Use a LAN IP, tunnel, or public HTTPS URL the panel can resolve.

---

## 3. Exact device installation steps

### Samsung Tizen

**Option A — App Management / App URL (recommended)**

1. On the Samsung commercial display, open **App Management**.
2. Choose install / add app by **App URL**.
3. Enter:

   ```txt
   https://tmr.sh/tizen
   ```

4. Install and launch TomorrowOS.
5. Complete orientation + CMS URL setup ([section 2](#2-how-the-player-receives-the-cms-endpoint)).

**Option B — USB sideload (download from CMS)**

1. Control Panel → **Download Players → Samsung**, download the player package and obtain the `.wgt`.
2. Copy the `.wgt` and `.html` to the root folder of a USB stick.
3. Insert USB into the display to install.
4. Complete orientation + CMS URL setup.

### BrightSign

1. Get a player zip from either:
   - `https://tmr.sh/app/brightsign/brightsign_package.zip`, **or**
   - Control Panel → **Download Players → BrightSign**
2. Unzip on a computer.
3. If you used the distribution ZIP, edit `config.js` so `cmsEndpoint` is your CMS origin and set `orientation`.  
   If you used the CMS download, `cmsEndpoint` is usually already filled — confirm `orientation`.
4. Copy the **contents** of the unzipped folder (not the zip file itself) onto a microSD card or USB stick.
5. Confirm the **root** of the card contains:
   - `autorun.brs`
   - `config.js`
   - the rest of the player files
6. Ensure only one `autorun.brs` exists (no competing BSN autorun artifacts).
7. Insert the card into the BrightSign player.
8. Full power-cycle the player.
9. Wait through the initial black window (~10 seconds before `Show()` is normal).
10. Confirm the pairing / brand UI appears.

### Windows

**Windows 11 Pro x64** — Windows Player V1.

1. Download the installer from either:
   - `https://tmr.sh/app/windows/TomorrowOS-Windows-Setup.exe`, **or**
   - Control Panel → **Download Players → Windows**
2. Run `TomorrowOS-Windows-Setup.exe`.
3. In the wizard, set the CMS endpoint, orientation, display, and maintenance passcode.
4. Finish the wizard and launch the player.
5. The screen shows a six-character pairing code. Enter it in the Control Panel to pair.

---

## 4. Six-character pairing

1. With CMS endpoint configured and network up, the player shows a **six-character** pairing code (digits and uppercase letters `0-9` / `A-Z`).
2. In the Control Panel, open **Pair**.
3. Enter the code exactly (the UI normalises to uppercase / strips invalid characters; length must be **6**).
4. Submit. The CMS calls `POST /pairing/verify`.
5. Within a few seconds the device should appear in the device list as paired / online.
6. Publish a small image + video playlist to confirm playback.

Notes:

- The code is bound to the device identity in the CMS registry and is treated as a **permanent** pairing code for that serial (the same code is used again after a safe unpair).
- If the UI is still generating / rolling the code, wait until a stable code is shown before submitting.
- If pairing fails, see [known failure states](#7-known-failure-states) before generating confusion by reinstalling.

---

## 5. Tested firmware and model limitations

Always record **model + firmware** from `device.info.get` before calling a fleet production-ready.

### Samsung Tizen

| Topic | Limitation |
| --- | --- |
| OS baseline | **Tizen 6.5 and 7.0** commercial displays only |
| Older panels | SSSP 4 / older Tizen generations are out of scope without a separate player / firmware path |
| Screenshots | `device.telemetry.captureScreen` needs commercial firmware **1080+** |
| Orientation | First-boot intro; change later with remote **Red (A)** |
| Capability truth | Trust live `device.info.getCapabilities` over docs tables |

### BrightSign

| Topic | Limitation |
| --- | --- |
| Control Panel caption | Series **3-6** called out as supported |
| Series 3–6 | May work; **validate on real hardware** before fleet rollout |
| Series 3 video | Upgrade firmware to **9.1.140+** for reliable video |
| Series 3 4K H.264 | **Hardware limit** — use **1080p H.264**, not 4K |
| Boot black screen | ~10s delay before UI show is normal |
| On/off timer | Supported only when display mute API is available |
| Capability truth | Trust live `device.info.getCapabilities` over docs tables |

### Not shipping yet

LG webOS and Android players are not in this SDK release.

---

## 6. Safe unpair / re-pair instructions

Do **not** wipe the SD card or reinstall the app as the first unpair step. Unpair in the CMS first.

### Unpair (safe)

1. Open the Control Panel device list.
2. Find the device and click **Unpair** (confirms before sending).
3. That calls `POST /pairing/unpair` with `{ "deviceId": "..." }`.
4. The CMS removes the paired-device record. Operator display name can survive in the device registry for later.
5. If the player is still connected, the CMS sends a `pairing.unpaired` message over the WebSocket so the player can return to the pairing UI.

Programmatic equivalent on the server:

```ts
await tomorrowos.pairing.unpair(deviceId);
```

### Re-pair

1. Confirm the player shows the pairing UI again (power-cycle if it did not receive the unpair push).
2. Enter the **same six-character code** shown on the screen into Control Panel → **Pair**.
3. Publish content again if needed (assignments were cleared with the paired record).

### Moving a screen to a different CMS

1. Unpair on the **old** CMS first.
2. Point the player at the **new** CMS endpoint:
   - Tizen: re-enter CMS URL on the setup screen (clear / change stored URL if needed, then reboot).
   - BrightSign: download a new zip from the **new** CMS (or edit `config.js` `cmsEndpoint`), copy to SD, power-cycle.
   - Windows: re-run `TomorrowOS-Windows-Setup.exe` and set the new CMS endpoint, then launch the player.
3. Pair on the new CMS with the on-screen code.

---

## 7. Known failure states

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Pairing / WebSocket fails immediately | CMS URL is `localhost` / `127.0.0.1` on the panel | Use LAN IP, tunnel, or public HTTPS |
| BrightSign empty / wrong `cmsEndpoint` | Distribution ZIP used without editing `config.js`, or wrong CMS download | Set `cmsEndpoint` in `config.js`, or re-download from **this** CMS (`/players/brightsign.zip`) |
| BrightSign never boots player | `autorun.brs` not at SD root, or competing autorun | Put files at card root; only one `autorun.brs` |
| BrightSign black for ~10s then UI | Normal boot delay | Wait; do not treat as a crash yet |
| BrightSign Series 3 video fails | Firmware below **9.1.140** | Upgrade firmware, re-test |
| BrightSign Series 3 4K video fails | Hardware codec limit | Re-encode to **1080p H.264** |
| Tizen pairs but screenshot fails | Firmware below **1080** | Upgrade commercial firmware to **1080+** |

---

## Coming soon

LG webOS and Android players.

---

## Glossary

- **`.wgt`** — Tizen web package for Samsung commercial displays
- **Pairing code** — six-character `0-9A-Z` code shown on the screen and entered in the CMS
- **App URL** — Samsung App Management install URL (`https://tmr.sh/tizen`)
- **`cmsEndpoint`** — BrightSign `config.js` CMS HTTP(S) URL
- **`POST /pairing/verify`** — Control Panel pair action
- **`POST /pairing/unpair`** — Control Panel unpair action
