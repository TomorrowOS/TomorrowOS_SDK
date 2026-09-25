# @tomorrowos/sdk

[![npm version](https://img.shields.io/npm/v/@tomorrowos/sdk.svg)](https://www.npmjs.com/package/@tomorrowos/sdk)
[![license](https://img.shields.io/npm/l/@tomorrowos/sdk.svg)](https://www.npmjs.com/package/@tomorrowos/sdk)

**Server SDK for building and self-hosting digital signage CMS products with TomorrowOS players.**

Apache 2.0. You own the CMS you build - no seat licences, no revenue share, no required TomorrowOS cloud. Screens talk to *your* server.

---

## Requirements

| | |
| --- | --- |
| Node.js | **20** or newer |
| npm | 10 or newer (or a compatible client) |
| OS | macOS, Linux, Windows (WSL2 recommended on Windows) |
| Network | CMS reachable from your screens (public HTTPS in production) |

There is no required TomorrowOS-hosted backend. Deploy on Railway, Render, Fly.io, Replit, Vercel Fluid, or your own Node host.

---

## Install / scaffold

```bash
npm install @tomorrowos/sdk@latest

npx @tomorrowos/sdk@latest init my-cms
cd my-cms
npm install
npm run dev
```

For Vercel / v0 Publish, use:

```bash
npx @tomorrowos/sdk@latest init my-cms --hosting v0
```

This starts a local CMS server and Control Panel. It does **not** by itself install a player or pair a screen. To connect hardware: deploy the CMS to a reachable HTTPS address, install a supported TomorrowOS player, and pair with the six-character code shown on screen. Details: [`PLAYER_INSTALL.md`](./PLAYER_INSTALL.md).

---

## Choose your path

| | You are | Start here |
| --- | --- | --- |
| **1** | Building with an AI tool (**Replit** recommended, or **Vercel / v0**) | [AI-assisted](#1-ai-assisted) |
| **2** | Writing the CMS yourself | [Build it yourself](#2-build-it-yourself) |
| **3** | Adding screens to an existing SaaS or web app | [Add to an existing app](#3-add-to-an-existing-app) |

All three end in the same place: a running CMS you host, then a paired TomorrowOS player.

### 1. AI-assisted

Paste into the agent (Replit **Power**, or **v0 Max**):

```text
Follow NPM package @tomorrowos/sdk REPLIT_SETUP.md and set up my TomorrowOS CMS.
```

```text
Follow NPM package @tomorrowos/sdk VERCEL_SETUP.md and set up my TomorrowOS CMS.
```

Upgrades use `REPLIT_UPGRADE.md` / `VERCEL_UPGRADE.md`. Those protocols install `@tomorrowos/sdk@latest`, merge template changes, and must **not** run `init --force` or wipe `data/` / uploads / env vars on an existing project.

### 2. Build it yourself

Scaffold with `init`, then deploy to a host with a **persistent Node process** and long-lived WebSockets. Prefer Railway, Render, Fly.io, Replit, or Vercel Fluid (v0 template). Avoid classic short-lived serverless without WebSocket support.

### 3. Add to an existing app

Keep your auth, users, tenancy model, and UI. Import `@tomorrowos/sdk` for device sessions, pairing, playlist / policy delivery, and optional static CMS helpers. Map device IDs to your own tenant records - the SDK does not impose multi-tenancy.

---

## What this package handles

- CMS server (`TomorrowOS.listen`) - HTTP helpers + WebSocket device channel
- Device pairing (`POST /pairing/verify`, `POST /pairing/unpair`)
- Playlist catalog and content policy push to players
- Media upload helpers (local, Cloudinary, Vercel Blob, Replit Object Storage)
- Stores: SQLite, Postgres / Supabase, or memory (demos only)
- Optional starter Control Panel and `GET /brand.json`
- CLI: `tomorrowos init`
- BrightSign zip rewrite: `GET /players/brightsign.zip`

## What it does not handle

- Building or signing on-device **player** packages
- A hosted TomorrowOS SaaS you must subscribe to
- Your product UI, authentication, billing, or business workflows
- Guaranteeing every panel model / firmware without certification on real hardware

Player install and pairing: `PLAYER_INSTALL.md`. Deep hosting and agent protocols ship as Markdown beside this README and in Mintlify.

---

## Supported platforms

| Platform | Launch status | Important limitation |
| --- | --- | --- |
| Samsung Tizen 6.5 and 7.0 | Supported | Certified models and firmware only |
| BrightSign Series 3-6 | Supported | Series 3 requires firmware **9.1.140+** |
| BrightSign Series 3 4K H.264 | Not supported | Use certified **1080p H.264** media |
| Windows 11 Pro x64 | Supported | None |
| Android | Planned | Not available for production |
| LG webOS | Planned | Not available for production |

Treat a combination as production-ready only after you validate it on your panels.

---

## Minimal working server

```ts
import { readFileSync } from "fs";
import { createTomorrowOSStore, TomorrowOS } from "@tomorrowos/sdk";

const brand = JSON.parse(readFileSync("./brand.json", "utf8"));
const store = createTomorrowOSStore({
  databaseUrl: process.env.SUPABASE_URL || process.env.DATABASE_URL,
  sqlitePath: "./data/tomorrowos.db"
});

const tomorrowos = new TomorrowOS({ brand, store });

tomorrowos.listen({
  port: Number(process.env.PORT) || 3000,
  host: "0.0.0.0",
  staticRoot: "./public" // optional Control Panel + uploads
});
```

Validate `brand.json` against `brand.schema.json`.

After `listen()` is up, connect hardware in this order:

1. Deploy the CMS to a public HTTPS address (or a tunnel for lab tests).
2. Install a verified player package - see `PLAYER_INSTALL.md`.
3. Pair with the six-character code shown on the screen.
4. Publish a playlist from the Control Panel.

Deeper topics - database migration, media backends, Vercel Fluid wiring, Replit secrets, troubleshooting - live in Mintlify and the setup Markdown files shipped with this package, not on this npm landing page.

---

## Documentation and support

| Resource | Source |
| --- | --- |
| Website | [https://tomorrowos.org](https://tomorrowos.org) |
| Product docs | [https://docs.tomorrowos.org](https://docs.tomorrowos.org) |
| Player install | `PLAYER_INSTALL.md` |
| Replit setup / upgrade | `REPLIT_SETUP.md` / `REPLIT_UPGRADE.md` |
| Vercel / v0 | `VERCEL_SETUP.md` / `VERCEL_QUESTIONS.md` / `VERCEL_UPGRADE.md` |

If this README disagrees with package behaviour, treat that as a bug and report it.

---

## Licence

**Apache 2.0.** Build commercial products on this SDK and keep your CMS proprietary - no fee, no revenue share, no requirement to open-source your application.