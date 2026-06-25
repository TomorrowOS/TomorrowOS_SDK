# Player Installation — Getting TomorrowOS on your screens

Your CMS is running. Now you need to get a TomorrowOS player onto your physical screen so the two can talk.

This document covers:

1. How to build a player for your platform
2. How to install it on a screen
3. How to pair the screen with your CMS
4. Troubleshooting

---

## Prerequisites

- You have a running TomorrowOS CMS (either locally, on Replit, Vercel, Railway, or self-hosted)
- The CMS has a publicly reachable URL (or tunneled via ngrok for local testing)
- `brand.json` at the project root is configured with your target platforms

---

## Samsung Tizen

### Build the player

From your project root:

    npx tomorrowos build --platform tizen

This reads `brand.json`, applies your branding to the activation screen, and outputs:

    dist/player-tizen.wgt

The `.wgt` is a signed Tizen web package ready to install on any compatible Samsung commercial display.

### Install on the screen

You have three options, depending on your setup:

**Option A — URL Launcher (easiest for testing)**

1. On the Samsung display, press the remote's menu button
2. Go to `Menu → System → Ext. Device Manager → URL Launcher Settings`
3. Enter the URL where your `.wgt` is hosted (your CMS serves this at `/player/tizen.wgt` once built)
4. Save and exit
5. The display reboots and launches TomorrowOS on boot

**Option B — Tizen Studio Device Manager (for bulk deployment)**

1. Install Tizen Studio from samsung.com
2. Put the display into Developer Mode (Menu → Support → Developer Mode → enter your PC's IP address)
3. In Tizen Studio, open Device Manager
4. Connect to your display by IP
5. Right-click → Install App → select `dist/player-tizen.wgt`
6. App installs and auto-launches

**Option C — USB Sideload (no network needed)**

1. Copy `dist/player-tizen.wgt` to a USB stick
2. Insert USB into display
3. On the remote, open Home → Apps → USB Sideload
4. Select the `.wgt` file and install

### Supported Tizen versions

V1 supports:

- SSSP 5 and newer commercial displays
- TEP 6.5 and newer commercial displays

If you have an older SSSP 4 display, you will need a firmware update or the older-generation player build (contact support).

### Activation

Once the player is running, the Samsung display shows the TomorrowOS activation screen branded with your logo and colours. Displayed on the screen:

- Your logo (top)
- A 6-digit activation code
- "Enter this code at [your CMS URL]"
- Device ID (small text, bottom)

On your CMS, go to the **Pair** page, enter the 6-digit code, and press Submit. Within a few seconds the display will transition from the activation screen to your content.

---

## BrightSign

### Build the player

    npx tomorrowos build --platform brightsign

Outputs:

    dist/player-brightsign.zip

### Install on the screen

1. Copy the **contents** of `player-brightsign.zip` (not the zip itself) onto a microSD card or USB stick
2. The root of the card should contain `autorun.brs`, the player files, and the `brand/` assets
3. Insert the card into the BrightSign device
4. Power on — BrightSign boots into TomorrowOS automatically

### Supported BrightSign versions

- BrightSign OS 9.0 and newer
- BrightSign OS 8.x: not supported in V1 (known local DWS API differences; support planned for V1.1)

### Activation

Same as Tizen — the BrightSign displays an activation screen with your branding and a 6-digit code. Enter the code in your CMS's Pair page.

---

## LG webOS Signage (V1.1)

Support planned for V1.1 release. Build command will be:

    npx tomorrowos build --platform webos

Output: `dist/player-webos.ipk` installable via webOS Signage Manager or sideload.

---

## Android Managed (V1.1)

Support planned for V1.1 release. Build command will be:

    npx tomorrowos build --platform android-managed

Output: `dist/player-android.apk` with device-owner privileges required at enrolment.

Generic (unmanaged) Android boxes are supported in V1.x with capability-limited functionality (see TomorrowOS protocol documentation).

---

## ChromeOS Managed Kiosk (V1.x)

Support planned for V1.x release. Deployment will be via Google Admin Console as a managed kiosk web app.

---

## Windows (V1.x)

Support planned for V1.x release. Distribution as MSI installer via Group Policy or Intune.

---

## Troubleshooting

### Activation screen doesn't appear

**Check:**

- Display is powered on and has network connectivity
- `brand.json` has `cms_endpoint` set to your publicly reachable CMS URL (it should be `wss://` for production, `ws://` only for local testing on the same network)
- You rebuilt the player after changing `brand.json` — the CMS endpoint is baked into the `.wgt` at build time

### Activation code appears but pairing fails

**Check:**

- The code has not expired — codes are valid for 15 minutes; generate a new one by restarting the player
- The CMS server is actually reachable from the display's network — test by opening the CMS URL in the display's browser (if available)
- Firewall rules — the display needs to reach your CMS on WebSocket port 443 (or whatever you configured)

### Replit workspaces go to sleep

Replit's free tier sleeps inactive workspaces. Your screen will show "reconnecting..." when the workspace is asleep, and reconnect automatically when someone wakes it.

**For production:** upgrade to Replit Hacker (Always-On) or move to Railway / Vercel / self-hosted.

### Samsung display stuck on black screen after URL Launcher

Check that your `.wgt` is reachable at the URL you set. Open the URL in any browser — it should download the `.wgt` file. If not, the display can't fetch it. Common causes:

- URL is http:// but server redirects to https:// (Samsung doesn't follow the redirect)
- URL requires auth (host the `.wgt` publicly)
- File is named `.zip` instead of `.wgt` (must be `.wgt`)

### BrightSign won't boot into the player

Check `autorun.brs` is at the root of the SD card, not in a subfolder. BrightSign only runs `autorun.brs` from the root.

### "Pairing already completed" error

A device can only be paired once. If you want to re-pair (e.g. moving a screen to a new CMS), first unpair it from the current CMS (`tomorrowos.pairing.revoke(deviceId)` from your CMS server), then generate a new activation code on the device by power-cycling or running "Unpair" from the device's Settings menu (if enabled in `brand.json`).

### Pairing code rolls past 15 minutes before I can enter it

Power-cycle the device (or call `player.restart()` if available) to generate a fresh code.

---

## Getting help

- Package issues — file a GitHub issue at `github.com/TomorrowOS/sdk`
- Samsung-specific issues — the TomorrowOS Samsung bridge is Apache 2.0 at `github.com/TomorrowOS/player-tizen`
- BrightSign-specific issues — `github.com/TomorrowOS/player-brightsign`
- Commercial support — SL-X provides supported, SLA-backed deployments; see `sl-x.com`

---

## Glossary

- `.wgt` — Tizen web package (a signed zip containing your branded player for Samsung displays)
- **Activation screen** — the branded full-screen UI a new player shows while it waits to be paired
- **Pairing code** — six-digit number shown on the screen, entered in the CMS to complete device registration
- **SSSP** — Samsung Smart Signage Platform (older Tizen signage firmware generation)
- **TEP** — Tizen Enterprise Platform (newer Samsung signage firmware generation)
- **DWS** — BrightSign's Device Web Services (local HTTPS REST API)
- **URL Launcher** — Samsung's built-in mechanism for loading a web app from a URL on startup
