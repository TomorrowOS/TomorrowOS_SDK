# @tomorrowos/sdk

[![npm version](https://img.shields.io/npm/v/@tomorrowos/sdk.svg)](https://www.npmjs.com/package/@tomorrowos/sdk)
[![license](https://img.shields.io/npm/l/@tomorrowos/sdk.svg)](https://www.npmjs.com/package/@tomorrowos/sdk)
[![protocol](https://img.shields.io/badge/wire%20protocol-1.0-blue.svg)](#protocol-version)

Build and own your digital signage CMS.

An open-source SDK and player runtime for digital signage. One server-side API drives commercial signage panels â€?you write the CMS, we handle device sessions, pairing, and the wire protocol.

Apache 2.0. Build a proprietary CMS on top of it and sell it as your own â€?no royalty, no permission needed.

---

## Requirements

| | |
|---|---|
| Node.js | **18** or newer (`engines.node` in this package) |
| npm | 9 or newer (or a compatible client) |
| OS | macOS, Linux, Windows (WSL2 recommended on Windows) |
| Network | CMS host reachable from your screens â€?a public HTTPS address in production |

Screens connect to your CMS over the network. For real panels, deploy to a public host (Railway, Render, Fly, Vercel Fluid, Replit, your own server), or use a tunnel while developing locally.

There is no required TomorrowOS cloud. Your screens talk to *your* server.

---

## Choose your path

Three ways to build with this SDK. Pick one and follow it through.

| | You are | Start here |
|---|---|---|
| **1** | Building with an AI tool on **Replit** (recommended) or **Vercel / v0** | [Build with an AI tool](#1-build-with-an-ai-tool) |
| **2** | Writing the CMS yourself | [Build it yourself](#2-build-it-yourself) |
| **3** | Adding screen management to an existing SaaS or web app | [Add to an existing app](#3-add-to-an-existing-app) |

All three end in the same place: a running CMS with a paired screen. From there, go to [Connect a screen](#connect-a-screen).

---

## 1. Build with an AI tool

Guided setup is supported for **Replit** and **Vercel / v0** only. **Replit is recommended** for the fastest path to a live WebSocket CMS.

| Host | Recommended AI mode |
|------|---------------------|
| **Replit** | **Power** |
| **Vercel / v0** | **v0 Max** |

The SDK ships an elicitation protocol so the agent asks the right questions before it writes anything. Skipping it reliably produces a CMS that doesn't run.

### Replit (recommended) â€?use Power agent mode

Paste into Replit **Power**:

```text
Follow NPM package @tomorrowos/sdk REPLIT_SETUP.md and set up my TomorrowOS CMS.
```

On Replit, Supabase must use the `SUPABASE_URL` secret. `DATABASE_URL` is reserved by Replit for its built-in PostgreSQL.

Upgrading an existing Replit CMS instead:

```text
Follow NPM package @tomorrowos/sdk REPLIT_UPGRADE.md to upgrade my CMS with the latest SDK.
```

That protocol diffs and merges against the current templates. It must never run `init --force` or delete `data/` or `public/uploads/`.

### Vercel / v0 â€?use v0 Max

Paste into **v0 Max** (or Vercel Agent with Max capability):

```text
Follow NPM package @tomorrowos/sdk VERCEL_SETUP.md and set up my TomorrowOS CMS.
```

Agents must paste questions from [`VERCEL_QUESTIONS.md`](./VERCEL_QUESTIONS.md) verbatim.

Upgrading an existing Vercel / v0 CMS instead:

```text
Follow NPM package @tomorrowos/sdk VERCEL_UPGRADE.md to upgrade my CMS with the latest SDK.
```

That protocol installs `@tomorrowos/sdk@latest`, diffs `cms-starter-v0` templates, and must never run `init --force` or wipe Env Vars / media data.

<details>
<summary><strong>Agent workflow (for the agent, not you)</strong></summary>

Supported hosts: **Replit** and **Vercel / v0**. Prefer **Replit Power agent mode** and **v0 Max**.

1. Follow the host setup doc for this request (`REPLIT_SETUP.md` / `REPLIT_UPGRADE.md`, or `VERCEL_SETUP.md` + `VERCEL_QUESTIONS.md` / `VERCEL_UPGRADE.md`).
2. On Vercel: paste Q1â€“Q3 **verbatim** from `VERCEL_QUESTIONS.md`; after database choice set `TOMORROWOS_STORE` and `DATABASE_SSL` yourself; after media choice set `TOMORROWOS_MEDIA` yourself.
3. Read `brand.schema.json` for the validated shape of `brand.json`.
4. Scaffold with the correct template (**always `@latest`**):
   - Replit / self-host style: `npx @tomorrowos/sdk@latest init .` (default `cms-starter`)
   - Vercel / v0: `npx @tomorrowos/sdk@latest init . --hosting v0 --force` (`cms-starter-v0`)
5. Apply the userâ€™s answers â€?brand and use case. Validate `brand.json`. On Vercel, apply the **NON-NEGOTIABLE VERCEL RUNTIME CONTRACT** from `VERCEL_SETUP.md`.
6. Point the user at `PLAYER_INSTALL.md` and the Control Panel **Download Players** UI once the CMS is running.

Do not write WebSocket transport, pairing wire format, or platform-specific player bridge code. The SDK handles server-side device sessions and HTTP helpers. Customise the UI, the branding, and how you call the SDK.

</details>

**Next:** [Connect a screen](#connect-a-screen).

---

## 2. Build it yourself

```bash
npm install @tomorrowos/sdk@latest
```

Scaffold, install, run:

```bash
# Default template (good for Replit, Railway, Render, Fly.io, self-host)
npx @tomorrowos/sdk@latest init my-cms

# Vercel / v0 Publish (cms-panel + vercel.json + optional Next preview)
npx @tomorrowos/sdk@latest init my-cms --hosting v0

cd my-cms
npm install
npm run dev
```

`init` creates `data/tomorrowos.db` with the TomorrowOS SQLite schema. The starter server uses it by default, so pairings, playlists, and device assignments survive restarts.

**Recommended deploy hosts** for this path (long-lived Node + WebSockets):

| Host | Notes |
|---|---|
| **Railway** | Simple Node deploy; good default for self-built CMS |
| **Render** | Web Service with persistent process |
| **Fly.io** | Global edge VMs; hold WebSockets cleanly |
| **Replit** | Fastest AI-assisted path â€?see [Build with an AI tool](#1-build-with-an-ai-tool) |
| **Vercel Fluid** | Use `--hosting v0` and follow [`VERCEL_SETUP.md`](./VERCEL_SETUP.md) |

Avoid classic short-lived serverless without WebSocket support.

You now have a CMS serving:

- pairing HTTP helpers (`POST /pairing/verify`, `POST /pairing/unpair`)
- `GET /brand.json` for player branding
- a WebSocket device channel
- media upload helpers (`/media/upload`, and Cloudinary direct upload when configured)
- `GET /players/brightsign.zip` â€?BrightSign package with `config.js` `cmsEndpoint` set to this CMS origin
- a minimal admin panel (static UI under `staticRoot`)

Deploy it to a public HTTPS address before pairing a production screen. While developing locally, a tunnel is the fastest way to get one.

**Next:** [Connect a screen](#connect-a-screen).

---

## 3. Add to an existing app

If you already have a SaaS or web app and want screen management as a feature inside it, you don't need the starter. Import the SDK into your existing server.

```bash
npm install @tomorrowos/sdk
```

```ts
import { createTomorrowOSStore, TomorrowOS } from "@tomorrowos/sdk";

const store = createTomorrowOSStore({
  // Prefer SUPABASE_URL on Replit; DATABASE_URL elsewhere / fallback
  databaseUrl: process.env.SUPABASE_URL || process.env.DATABASE_URL
});

const tomorrowos = new TomorrowOS({ brand, store });

const server = tomorrowos.listen({
  port: Number(process.env.PORT) || 3000,
  host: "0.0.0.0",
  staticRoot: "./public" // optional Control Panel + uploads
});
```

What you keep from your app: your auth, your users, your tenancy model, your UI. What the SDK adds: device sessions, the pairing handshake, playlist/policy delivery, and optional static CMS helpers.

Points to plan for:

- **Multi-tenancy.** Devices belong to whatever tenant model you already have. The SDK does not impose one â€?map device IDs to your own tenant records.
- **Auth.** Pairing is a device-side flow. Your admin routes stay behind your existing auth.
- **Store.** Use `createTomorrowOSStore` / `TOMORROWOS_STORE` for SQLite, Postgres, or Supabase, or pass a custom `TomorrowOSStore`.
- **WebSockets.** Your host must hold long-lived connections. Most serverless platforms terminate idle sockets â€?check before you commit (Vercel needs Fluid compute).

**Next:** [Connect a screen](#connect-a-screen).

---

## Architecture

```
  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?        WebSocket         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?
  â”? Your CMS       â”?â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–ºâ”‚  TomorrowOS     â”?
  â”? (your server)  â”?                          â”? Player on      â”?
  â”?                â”?                          â”? screen         â”?
  â”? imports        â”?                          â”?                â”?
  â”? @tomorrowos    â”?                          â”? unified API    â”?
  â”? /sdk           â”?                          â”? across panels  â”?
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?                          â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”?
```

You own the CMS: the UI, the branding, the business logic, the data. The SDK owns the device session, the pairing handshake, and the wire protocol.

You should not need to write WebSocket transport, pairing wire format, or platform-specific player bridge code. If you find yourself doing that, open an issue â€?it means the SDK has a gap.

---

## Connect a screen

Your CMS is running. This is what happens next, in order.

1. **Deploy the CMS to a public HTTPS address** (or tunnel for local tests). Screens must reach it from their network.
2. **Get a player package** for your platform (see below and [`PLAYER_INSTALL.md`](./PLAYER_INSTALL.md)).  
   Note: `npx tomorrowos build --platform â€¦` is still a **placeholder** in this package â€?packaging lives in the player repos / prebuilt downloads, not in the CLI yet.
3. **Install the player on the panel.**
4. **Pair.** The player shows a 6-character code. Enter it in the Control Panel. The device appears in your device list.
5. **Publish content.** Assign playlists / push a content policy. The screen updates without reloading the app.

### Samsung Tizen

Supported target: **Tizen 6.5+** commercial displays (see Control Panel captions and [`PLAYER_INSTALL.md`](./PLAYER_INSTALL.md)).

**Fastest path for many setups â€?URL Launcher / prebuilt package**

- From a running Control Panel, use **Download Players â†?Samsung**, or fetch the published Tizen package from TomorrowOS distribution (`https://tmr.sh/app/tizen/â€¦`).
- Or host / sideload a `.wgt` as described in [`PLAYER_INSTALL.md`](./PLAYER_INSTALL.md).

On the panel, enter the CMS HTTPS URL (or the player package URL your install path requires). The player shows a pairing code.

Signed packages need a Samsung distributor certificate for production distribution. Unsigned / URL Launcher paths are fine for testing when your environment allows them.

### BrightSign

Supported target: **Series 5 / 6** (as labeled in the Control Panel). Older series may work but should be validated on your hardware before fleet rollout.

**Recommended download path**

1. Open your live CMS Control Panel â†?**Download Players â†?BrightSign**.
2. That hits `GET /players/brightsign.zip` on *this* CMS.
3. The SDK fetches the mother zip and rewrites `config.js` so:

   ```js
   cmsEndpoint: "https://your-cms-host/"
   ```

   matches the CMS you downloaded from (for example `https://testcms2.replit.app/`).

4. Unzip, copy the **contents** to a microSD card (files at the card root, including `autorun.brs` and `config.js`).
5. Insert the card and power on. Pair with the on-screen code.

Override the mother zip URL with `TOMORROWOS_BRIGHTSIGN_ZIP_URL` if you host your own package.

### Coming soon

Android, LG webOS, and Windows are on the roadmap. They are not validated for production in this SDK release.

If you are building for one of those platforms later: build your CMS against the same server API now. Server-side code does not need to change when a new player package lands â€?only the installable player does.

---

## Platform support

| Platform | Status | Install |
|---|---|---|
| Samsung Tizen 6.5+ | V1 supported | Control Panel download / `.wgt` / URL Launcher â€?see `PLAYER_INSTALL.md` |
| BrightSign Series 5, 6 | V1 supported | Control Panel `GET /players/brightsign.zip` â†?microSD autorun |
| BrightSign older series | Validate on hardware | Same autorun zip flow |
| Android | Roadmap | â€?|
| LG webOS | Roadmap | â€?|
| Windows | Roadmap | â€?|

Treat a platform as production-ready only after you have validated it on your panels.

---

## Configuration

### Database

SQLite by default (no configuration required for the starter). To switch:

```bash
TOMORROWOS_STORE=supabase
SUPABASE_URL=postgresql://...
DATABASE_SSL=true
# DATABASE_URL=...   # optional fallback outside Replit
```

Supported store drivers: `sqlite`, `postgres`, `supabase`, `memory`.

Use `memory` for throwaway demos only â€?nothing survives a restart.

### Migrating between stores

```bash
npx tomorrowos migrate \
  --from sqlite \
  --from-sqlite ./data/tomorrowos.db \
  --to supabase \
  --to-database-url "$DATABASE_URL"
```

Works in either direction across `sqlite`, `postgres`, and `supabase`. It moves database records only â€?copy `public/uploads` or object-storage / Cloudinary media separately.

### Media

- **Local disk:** small files may use `POST /media/upload`. Larger files use **chunked upload** (`/media/upload-init` â†?`/media/upload-chunk` â†?`/media/upload-complete`).
- **Replit Object Storage:** set `TOMORROWOS_MEDIA=replit-object-storage` (auto-preferred on Replit when Cloudinary is unset). Uses `@replit/object-storage`; URLs stay `/uploads/...` and are served from the bucket after Republish. Same upload HTTP routes as local.
- **Cloudinary:** set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (optional `CLOUDINARY_FOLDER`). The Control Panel uses **browser â†?Cloudinary** direct upload (`/media/upload-sign` + `/media/register`) when Cloudinary is configured.
- **Vercel Blob:** set `BLOB_READ_WRITE_TOKEN` and `TOMORROWOS_MEDIA=vercel-blob` (token alone also auto-enables Blob when Cloudinary is unset). SDK uploads via `@vercel/blob` `put()`; asset URLs are absolute `https://*.public.blob.vercel-storage.com/...`.

Cloudinary account plans still enforce their own max file sizes (for example Free plan video caps).

### Branding

Pass a brand object to the constructor (usually loaded from `brand.json`):

```ts
const tomorrowos = new TomorrowOS({ brand, store });
```

It is served at `GET /brand.json` on the same host as `listen`. Players fetch it for colours, logos, and display defaults.

Validate against [`brand.schema.json`](./brand.schema.json). A complete example is in [`brand.example.json`](./brand.example.json).

### Content policy and scheduling

```
POST /device/{deviceId}/content/set-policy
```

```json
{
  "policy": {
    "playlists": [],
    "fallback": { "type": "brand" }
  }
}
```

Each playlist may include optional `schedule`, evaluated in **device local time**. The run window is **one continuous period**:

**from** `startDate` + `start` **â†?until** `endDate` + `end` (until is exclusive).

| Field | Format | Notes |
|---|---|---|
| `startDate` / `endDate` | `YYYY-MM-DD` | Combined with `start` / `end`; omit bounds for open-ended |
| `start` / `end` | `HH:mm` | Clock times on those dates |

This is **not** a daily-repeat schedule inside a date range. Leave schedule empty for always-on. Example shape: [`templates/cms-starter/policy.example.json`](./templates/cms-starter/policy.example.json) (ignore legacy `daysOfWeek` if present).

---

## Troubleshooting

**Screen won't pair.**  
The player must reach your CMS. Confirm a public HTTPS (or reachable tunnel) URL, DNS, firewall, and that the panel has network access. A CMS only on `localhost` will not pair from a real display.

**Paired, but the screen is black (BrightSign).**  
Common causes: media the player cannot decode (codec / profile / unexpected tracks), or HTML video surface alpha / HTML widget timing in `autorun.brs`. Re-encode to a supported profile and confirm `config.js` points at the correct CMS. Check player logs on the device.

**Paired, but the screen is black (other).**  
Fetch `GET /brand.json` from the panelâ€™s network. A live WebSocket with a black screen usually means no playable policy item â€?check published playlists, absolute media URLs, and fallback.

**Media 404s on the screen but loads in your browser.**  
Policy URLs must be absolute and reachable from the screen. Relative paths or hosts only visible on your laptop will fail on the panel.

**Upload fails with HTTP 413 on Replit (or similar hosts).**  
Use `@tomorrowos/sdk` Control Panel / templates: non-Cloudinary uploads over ~2MB go through **chunked** `/media/upload-chunk`. On Replit, set `TOMORROWOS_MEDIA=replit-object-storage` (or rely on auto-detect) so files land in App Storage. On Vercel Blob, set `TOMORROWOS_MEDIA=vercel-blob` + `BLOB_READ_WRITE_TOKEN` so proxy/chunked complete stores absolute Blob URLs. With Cloudinary configured, the panel uses browser direct upload instead.

**BrightSign zip has empty `cmsEndpoint`.**  
You downloaded the mother zip from a static CDN instead of **this** CMSâ€™s `/players/brightsign.zip`. Use Control Panel â†?Download Players â†?BrightSign on the deployed CMS.

**WebSocket disconnects on a serverless host.**  
Most serverless platforms terminate idle connections. Vercel requires Fluid compute. Prefer a long-lived Node host (Railway, Render, Fly, Replit) if your platform cannot hold sockets.

**Database changes don't persist.**  
You are probably on `TOMORROWOS_STORE=memory`. Switch to `sqlite` or Postgres/Supabase.

---

## Getting help

- **Package docs:** the Markdown files listed below ship inside `@tomorrowos/sdk`
- **npm:** [https://www.npmjs.com/package/@tomorrowos/sdk](https://www.npmjs.com/package/@tomorrowos/sdk)

If something in this README doesn't match what the package actually does, treat that as a bug and report it â€?documentation drift matters as much as a code defect.

---

## Documentation in this package

| File | Purpose |
|---|---|
| [`PLAYER_INSTALL.md`](./PLAYER_INSTALL.md) | Player install and pairing notes |
| [`brand.schema.json`](./brand.schema.json) | JSON Schema for `brand.json` |
| [`brand.example.json`](./brand.example.json) | Complete example `brand.json` |
| [`REPLIT_SETUP.md`](./REPLIT_SETUP.md) | Replit Agent guided setup |
| [`REPLIT_UPGRADE.md`](./REPLIT_UPGRADE.md) | Upgrading an existing Replit CMS |
| [`VERCEL_SETUP.md`](./VERCEL_SETUP.md) | Vercel / v0 guided setup |
| [`VERCEL_QUESTIONS.md`](./VERCEL_QUESTIONS.md) | Verbatim Q1â€“Q3 text for Vercel agents |
| [`VERCEL_UPGRADE.md`](./VERCEL_UPGRADE.md) | Upgrading an existing Vercel / v0 CMS |
| [`templates/cms-starter/`](./templates/cms-starter/) | Minimal Node + TypeScript server seed |
| [`templates/cms-starter-v0/`](./templates/cms-starter-v0/) | Vercel / v0 starter (Fluid + cms-panel) |
| [`templates/style-tokens/`](./templates/style-tokens/) | CSS tokens and UI pattern notes |

---

## License

Apache 2.0 (see `license` in `package.json`).

You can use TomorrowOS commercially, modify it, and build closed-source products on top of it. You can ship a proprietary CMS built on this SDK and sell it under your own brand. You do not owe a fee, a licence, or a mention.

## Protocol version

Wire protocol **1.0** (see `protocolVersion` in [`brand.example.json`](./brand.example.json) and the TomorrowOS player/CMS contract).
