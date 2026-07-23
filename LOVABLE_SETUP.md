# Lovable Setup Protocol for TomorrowOS CMS

> **This file is a contract for Lovable AI / Lovable Agent.**  
> Follow it literally. Ask questions in order. Do not invent answers. Do not write or rewrite application logic until the Q&A is complete. Prefer configuring Secrets, `.env`, `brand.json`, and `server.ts` store wiring over inventing a custom CMS.
>
> **On Lovable, this file is the ONLY questionnaire.**

## User trigger (copy-paste)

When a human pastes a prompt like this, **read this file and start Question 1 immediately**:

```text
Follow @tomorrowos/sdk LOVABLE_SETUP.md and set up my TomorrowOS CMS.
Ask only the questions listed in LOVABLE_SETUP.md, in order. Do not use LLM_PROMPT.md.
Do not build a Vite/React mock of TomorrowOS 閳?use @tomorrowos/sdk cms-starter (Node + WebSocket).
Question 3 only updates brand.json.
After setup questions (including Cloudinary Secrets if chosen), configure and deploy 閳?minimal verification only.
Never test Supabase connection 閳?save SUPABASE_URL and move on. No Supabase or WebSocket tests.
Do not skip steps.
```

Alternate triggers that also activate this protocol:

- 閳ユ藩et up TomorrowOS on Lovable using LOVABLE_SETUP.md閳?
- 閳ユ窅onfigure my TomorrowOS CMS (Lovable wizard)閳?

When any of these triggers fire, **ignore `LLM_PROMPT.md` entirely** for the Q&A phase.

**Before Question 1:** read **IRON RULE: real Node CMS only** below. If the project is already a default Lovable Vite + React app with no `@tomorrowos/sdk` server, **do not** keep building that as the TV CMS 閳?seed or replace with the SDK `cms-starter` layout first.

---

## IRON RULE: real Node CMS only (Lovable Cloud Publish is not enough)

> **This is the #1 deployability rule. Non-negotiable.**

TomorrowOS CMS needs a **Node.js process** that:

- installs **`@tomorrowos/sdk`**
- runs `tsx server.ts` / `TomorrowOS.listen(...)`
- serves the Control Panel at **`GET /`**
- keeps **WebSocket** connections open for Tizen / BrightSign players

Lovable閳ユ獨 default app is **Vite + React + Lovable Cloud** (Postgres / Auth / Storage / Edge Functions). That stack **cannot** replace `@tomorrowos/sdk`閳ユ獨 long-lived WebSocket CMS by itself.

| Required | Forbidden |
|----------|-----------|
| Project seeded from **`npx @tomorrowos/sdk init`** (or `templates/cms-starter`) | Rebuilding pairing / WebSocket / `setPolicy` in React or Edge Functions |
| Live Node entry: `npm run start` 閳?`tsx server.ts` | Claiming Lovable Cloud **Publish** alone is the TV CMS endpoint |
| Control Panel HTML at `/` via `staticRoot: public` | Vite-only SPA that 閳ユ笓ooks like閳?a CMS but has no TomorrowOS server |
| Durable DB via Supabase / Lovable Cloud Postgres URL | Inventing a hand-rolled store protocol |

### How Publish works on Lovable (read carefully)

1. **Lovable Agent** = wizard + editor (ask Q1閳ユ彌3, write Secrets / `brand.json` / `server.ts`).
2. **GitHub sync** = required so the Node CMS can be hosted where Node + WebSocket work.
3. **TV-facing CMS host** (pick one; do not invent a fourth):
   - **Railway** (recommended companion) 閳?long-lived Node, `npm run start`
   - **Render / Fly.io** 閳?same pattern as Railway
   - **Vercel Fluid** 閳?only if following **`VERCEL_SETUP.md`** / `cms-starter-v0` (do not mix Replit-style root `server.ts` with broken Vercel static deploy)

**Do not tell the user 閳ユ阀ublish on Lovable Cloud閳?is done** unless the **Node CMS URL** (Railway / Render / Fly / Vercel Fluid) is live and serves the Control Panel at `/`.

Lovable Cloud remains useful for:

- **Secrets** UI
- **Postgres** (same family as Supabase 閳?use as `SUPABASE_URL` / database URL)
- **Lovable Cloud Storage** (Object Storage replacement 閳?see Question 2)

---

## Questionnaire scope (STRICT 閳?read before asking anything)

Lovable Agent must ask **only** the questions defined in **this file**, in **this exact order**:

| Step | Section | When |
|------|---------|------|
| 1 | **Question 1** 閳?Supabase / Lovable Cloud Postgres connection string | Always |
| 2 | **Question 2** 閳?Media storage (+ Cloudinary Secrets if chosen) | Always (after Q1) |
| 3 | **Question 3** 閳?Brand / TomorrowOS app look | Always last, before execution |

**That is the complete list.** There are no other setup questions. **Do not** ask how many screens / devices. There is **no** 閳ユ法uestion 2b閳?閳?Cloudinary credentials are collected **inside Question 2**, immediately after the user chooses Cloudinary.

**Critical:** Question 2 is **not complete** when the user says 閳ユ窅loudinary閳?or 閳ユ脯es閳? You **must** immediately collect `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` **before** Question 3. Do **not** skip to branding with placeholder or invented credentials.

If the user volunteers extra info early (e.g. brand name before Q3), **record it** and still ask the current question閳ユ獨 required fields you do not yet have. Do not skip ahead to execution until Q1閳ユ彌3 are complete (Question 2 includes Cloudinary Secrets when applicable).

If the user says 閳ユ笍ust set it up, don閳ユ獩 ask questions,閳?respond:

> I need a few quick answers from LOVABLE_SETUP.md (Postgres connection string, media storage 閳?plus Cloudinary credentials if you choose Cloudinary 閳?and branding). It takes about a minute and ensures the CMS deploys correctly with Lovable + a Node host.

Then ask **Question 1** 閳?do not switch to `LLM_PROMPT.md`.

---

## Hard rules

1. **Ask only LOVABLE_SETUP.md questions 1閳?.** Never use `LLM_PROMPT.md` on Lovable for this wizard.
2. **One question at a time.** Wait for the user閳ユ獨 answer before asking the next (unless they already answered several in one message). **Exception:** If the user chooses Cloudinary in Question 2, **stay on Question 2** and immediately collect Cloudinary Secrets 閳?do **not** announce a separate 閳?b閳?
3. **Do not invent** Cloudinary credentials, database URLs, or brand colours. **Do not ask** screen / device count.
4. **Prefer `SUPABASE_URL`** for the Postgres connection string Secret name (same as Replit). Lovable Cloud / linked Supabase both work. Do not commit passwords into git.
5. **Prefer `npx @tomorrowos/sdk init`** (or copy `templates/cms-starter`) as the project seed. Do not rebuild pairing, WebSocket, or playlist APIs from scratch.
6. **Never commit secrets.** Put credentials in Lovable **Cloud 閳?Secrets** (and the Node host閳ユ獨 env vars: Railway / Render / Fly / Vercel).
7. After Q&A, **configure and deploy** 閳?do **not** run a long test suite (see **Post-Q&A: minimal verification only**).
8. **Supabase / Lovable Postgres: configure only 閳?never test.** Save `SUPABASE_URL` + `TOMORROWOS_STORE=supabase` and proceed. Do not ping Postgres or treat preview DB errors as a failed setup.
9. **Do not** replace `@tomorrowos/sdk` with Edge Functions, React state, or a fake WebSocket.
10. **Media durability:** Lovable has **no Replit Object Storage mount** on a local `public/uploads` disk. Use **Cloudinary** or **Lovable Cloud Storage** (see Question 2). Plain local `public/uploads` is ephemeral on most Node hosts unless a volume is attached.

**Question order (always):**

- Q1 閳?Q2 閳?Q3 閳?execution checklist

---

## Question 1 閳?Supabase / Lovable Cloud Postgres (always)

> **This is the first setup question.** Always configure durable Postgres. **Do not** ask how many screens / devices.

**Ask exactly:**

> Paste your Postgres connection string. I will store it as Secret **`SUPABASE_URL`** (works for Lovable Cloud DB or a linked Supabase project).
>
> Example shape: `postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
>
> If you use **Lovable Cloud**, open **Cloud 閳?Database** (or project connection settings) and copy the Postgres URI. Also confirm SSL (usually **yes**).

**You must then:**

1. Save Lovable Cloud Secret: `SUPABASE_URL=<user value>`
2. Save also:
   - `TOMORROWOS_STORE=supabase`
   - `DATABASE_SSL=true` (unless the user explicitly says SSL is off)
3. Mirror the same env vars on the **Node host** (Railway / Render / Fly / Vercel) 閳?Lovable Secrets alone do not reach a Railway process.
4. Wire `server.ts` like the Replit starter:

```ts
import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createTomorrowOSStore, TomorrowOS } from "@tomorrowos/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const brand = JSON.parse(readFileSync(join(__dirname, "brand.json"), "utf8"));

const store = createTomorrowOSStore({
  databaseUrl: process.env.SUPABASE_URL || process.env.DATABASE_URL,
  sqlitePath: join(__dirname, "data", "tomorrowos.db")
});

const tomorrowos = new TomorrowOS({ brand, store });

tomorrowos.listen({
  port: Number(process.env.PORT) || 3000,
  host: "0.0.0.0",
  staticRoot: join(__dirname, "public")
});
```

5. **Do not** write the real password into committed files.
6. **Do not** test the database connection after saving 閳?configuration only.
7. **Do not** proceed to Question 2 until `SUPABASE_URL` is saved.

If the user refuses Postgres, warn that fleets need a durable store, then offer SQLite only after they explicitly confirm (SQLite is a poor fit on ephemeral Lovable/Railway disks).

**Later in Question 3:** set `cms.hostingTarget` to `"self-hosted"` (Railway / Render / Fly) or `"vercel"` if using Vercel Fluid. Do **not** ask for `expectedScreens`; default e.g. `5`.

---

## Question 2 閳?Media storage (uploads / thumbnails)

### Step A 閳?Ask storage choice

**Ask exactly:**

> How should playlist media (images/videos) be stored?
>
> **Recommended: Cloudinary** 閳?public HTTPS URLs; `@tomorrowos/sdk` auto-detects `CLOUDINARY_*` Secrets and `/media/upload` works out of the box.
>
> Alternatives:
> - **Lovable Cloud Storage** (replaces Replit Object Storage) 閳?public Storage bucket on Lovable Cloud / Supabase Storage; durable HTTPS URLs for players.
> - **Local disk only** 閳?`public/uploads` on the Node host (fine for quick tests; files may disappear on redeploy without a volume).
>
> Do you want me to set up **Cloudinary**? (yes / no 閳?if no, say whether you want **Lovable Cloud Storage** or local only)

### Step B 閳?If YES / Cloudinary (same Question 2 閳?no 閳?b閳?

**Do this immediately** when the user chooses Cloudinary. **Go straight to collecting Secrets.**

**Preferred:** Lovable **Cloud 閳?Secrets** fields for:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- Optional: `CLOUDINARY_FOLDER` (e.g. `tomorrowos`)

**If Secrets UI is unavailable, ask exactly:**

> Paste your Cloudinary credentials (from [cloudinary.com/console](https://cloudinary.com/console) 閳?Dashboard 閳?**API Keys**). I will store them as Secrets:
>
> 1. **`CLOUDINARY_CLOUD_NAME`**
> 2. **`CLOUDINARY_API_KEY`**
> 3. **`CLOUDINARY_API_SECRET`**
>
> Optional: **`CLOUDINARY_FOLDER`**

**You must then:**

1. Save those Secrets in Lovable **and** on the Node host.
2. **Do not** invent or placeholder credentials.
3. **Do not** proceed to Question 3 until all three required Secrets exist.
4. **Do not** run a Cloudinary upload test 閳?configuration only.

The SDK auto-detects these env vars; new uploads return `https://res.cloudinary.com/...` URLs.

### If NO 閳?Lovable Cloud Storage (Object Storage replacement)

This is the Lovable equivalent of **Replit Object Storage**: durable files with public HTTPS URLs, not an ephemeral disk folder.

**Do this:**

1. Open / use **Cloud 閳?Storage**.
2. Create a **public** bucket named **`tomorrowos-uploads`** (or confirm it exists). Public read is required so Tizen / BrightSign players can fetch media by URL.
3. Save Secrets (Lovable + Node host) as needed for Storage access used by your upload path, typically:
   - `SUPABASE_URL` (already from Q1 閳?API URL form may differ from Postgres URI; if the project exposes a separate API URL, store it as `SUPABASE_API_URL` only when required)
   - Service role or upload-capable key **only in server-side Secrets**, never in client bundles
4. Tell the user clearly:
   - Playlist items must use **absolute `https://...` Storage (or Cloudinary) URLs**.
   - `@tomorrowos/sdk` built-in `/media/upload` persists to **Cloudinary** or **local `public/uploads`**. It does **not** natively write to Lovable Storage yet.
   - Therefore: **prefer Cloudinary for one-click Control Panel uploads**, or upload files into the `tomorrowos-uploads` bucket and paste/publicize the HTTPS object URLs into playlists.
5. **Do not** claim that `public/uploads` on Lovable is durable like Replit Object Storage.
6. **Do not** invent Cloudinary credentials.

### If NO 閳?local disk only

1. Ensure `public/uploads` exists on the Node host (`mkdir -p public/uploads`).
2. Warn: redeploys may wipe files unless the host has a persistent volume.
3. Prefer Cloudinary or Lovable Cloud Storage for production.

---

## Question 3 閳?Brand / TomorrowOS app look (`brand.json` only)

> **Scope:** Question 3 answers **only** update **`brand.json`**.  
> **Do not** change deploy host, Secrets, or `server.ts` from branding answers.

**Ask exactly (one message; user may answer in one reply):**

> Let閳ユ獨 brand your TomorrowOS experience. Please provide:
>
> 1. **Product / venue name** (shown on screens and the Control Panel)
> 2. **Tagline** (optional)
> 3. **Primary colour** (hex, e.g. `#FF8A3D`)
> 4. **Background colour** (hex, optional 閳?default `#FAFAF9`)
> 5. **Text colour** (hex, optional 閳?default `#0A0908`)
> 6. **Secondary / accent colour** (hex, optional)
> 7. **Logo** 閳?upload an SVG/PNG into the project, or give a URL I can fetch into `./assets/`

If the user only gives a name and primary colour, use defaults for the rest and say what you assumed.

**Then write / update `brand.json` only** (validate mentally against `brand.schema.json`). Minimum example:

```json
{
  "name": "<user name>",
  "tagline": "<user tagline or Digital signage>",
  "targetPlatforms": ["tizen"],
  "primaryColor": "#FF8A3D",
  "secondaryColor": "#F5F3EF",
  "backgroundColor": "#FAFAF9",
  "textColor": "#0A0908",
  "logoPath": "./assets/logo.svg",
  "fontFamily": "Inter",
  "cms": {
    "useCase": "other",
    "hostingTarget": "self-hosted",
    "expectedScreens": 5,
    "features": {
      "bulkCommands": false,
      "proofOfPlay": false,
      "contentScheduling": true,
      "userManagement": false
    }
  },
  "protocolVersion": "1.0"
}
```

- Default `cms.hostingTarget` to `"self-hosted"` for Railway / Render / Fly.
- Use `"vercel"` only when following the Vercel Fluid path.
- Set `cmsEndpoint` only if the user already knows the public `wss://閳ヮ泦 URL; otherwise leave it out and tell them to point players at the published HTTPS CMS URL (player converts `https://` 閳?`wss://`).

---

## After all answers 閳?execution checklist

### A. Seed the TomorrowOS CMS (not a Lovable React mock)

```bash
npx @tomorrowos/sdk@latest init .
# If the directory is not empty and the user confirms overwrite of starter files only:
# npx @tomorrowos/sdk@latest init . --force
```

If Lovable already generated a Vite app:

1. **Keep** Lovable only as the editor / Secrets / Storage UI if useful.
2. **Add** the cms-starter Node CMS at repo root (or a clear `cms/` folder that is the deploy root).
3. **Do not** implement TomorrowOS protocol inside React pages.

### B. Apply store + media Secrets

**Postgres (always from Question 1):**

```env
TOMORROWOS_STORE=supabase
SUPABASE_URL=...
DATABASE_SSL=true
```

**Cloudinary (if chosen):**

```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Copy the same keys to the **Node host** env.

### C. Wire `server.ts`

- `host: "0.0.0.0"`
- `port: Number(process.env.PORT) || 3000`
- `staticRoot: public`
- Supabase path: `databaseUrl: process.env.SUPABASE_URL || process.env.DATABASE_URL`
- Keep starter event handlers (paired / online policy push)

### D. Runtime files for Node publish

```json
{
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch server.ts",
    "start": "tsx server.ts"
  },
  "dependencies": {
    "@tomorrowos/sdk": "^0.9.50",
    "dotenv": "^17.2.3",
    "tsx": "^4.19.0"
  }
}
```

- Keep **`tsx` in `dependencies`** (not only `devDependencies`).
- Bump `@tomorrowos/sdk` to latest when scaffolding.

### E. GitHub sync + deploy Node CMS

1. Enable **GitHub sync** from Lovable (or push the cms-starter repo).
2. Create a **Railway** (or Render / Fly) service from that repo.
3. Set Start Command: `npm run start`
4. Paste Secrets from Q1閳ユ彌2 into the host.
5. Deploy and open the public HTTPS URL.

**If the user insists on Vercel:** stop using this Railway-oriented finish path and follow **`VERCEL_SETUP.md`** (`npx tomorrowos init --hosting v0`) instead 閳?do not half-migrate.

### F. Minimal verification only

1. `GET /` shows TomorrowOS Control Panel HTML.
2. Host logs show `[TomorrowOS] listening on http://0.0.0.0:...`
3. **Do not** run Supabase connection tests, Cloudinary upload tests, or WebSocket console gates.

### G. Tell the user next steps (no code)

1. Keep the **Node CMS host** running (Railway Always On / paid plan as needed).
2. **Control Panel URL:** `https://YOUR-CMS-HOST`
3. On the TomorrowOS player, enter CMS URL: `https://YOUR-CMS-HOST/`
4. Enter the 6-character pairing code into the Control Panel.
5. Create a playlist, add media (Cloudinary upload or Lovable Storage HTTPS URLs), Publish to the device.
6. Point them at `PLAYER_INSTALL.md` for player install.

---

## Post-Q&A: minimal verification only

### Do (maximum)

1. Confirm real **`@tomorrowos/sdk`** server (not a React mock).
2. Write Secrets / `.env` / `brand.json` / `server.ts` from answers.
3. Deploy Node host 閳?Preview Control Panel at `/`.

### Do NOT run after setup (unless user asks or deploy fails)

- 閴?Supabase connection test
- 閴?Cloudinary upload test
- 閴?Formal WebSocket console gates
- 閴?Long troubleshooting when `/` already shows the Control Panel

---

## What not to ask / change

- **`LLM_PROMPT.md`** 閳?not used for this Lovable wizard
- Standalone screen-count / platform / hosting questionnaires outside Q1閳ユ彌3
- Replacing `@tomorrowos/sdk` with Edge Functions or React
- Saying **Lovable Cloud Publish** alone is enough for TVs
- Treating **Lovable Cloud Storage** as automatic `public/uploads` persistence (it is **not** a disk mount like Replit Object Storage)
- Skipping Cloudinary Secrets after the user chooses Cloudinary
- Changing deploy wiring based on Question 3 branding answers

---

## SQLite fallback 閳?only if user refuses Postgres

```ts
const store = createTomorrowOSStore({
  sqlitePath: join(__dirname, "data", "tomorrowos.db")
});
```

```env
TOMORROWOS_STORE=sqlite
```

Warn that SQLite on ephemeral hosts loses pairings on redeploy.

---

## Failure recovery cheat sheet

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| 閳ユ窅MS閳?is a React app with no pairing | Agent built a Lovable mock | Re-seed with `npx @tomorrowos/sdk init`; deploy Node host |
| Lovable Publish URL does not pair TVs | Expected 閳?no WebSocket CMS there | Deploy Railway / Render / Fly / Vercel Fluid; use that URL |
| `tsx: not found` on host | `tsx` only in devDependencies | Move `tsx` to `dependencies` |
| Uploads vanish after redeploy | Local `public/uploads` | Cloudinary or Lovable Cloud Storage public URLs |
| Storage files 403 on player | Private bucket | Make `tomorrowos-uploads` **public** read |
| Supabase errors in preview | Preview network / wrong URI | Config-only; validate on published Node host |
| Pairing works on one host not another | Different CMS process / Secrets | Compare env and `listening` logs |

---

## Replit 閳?Lovable mapping (for Agents)

| Replit | Lovable |
|--------|---------|
| Replit Secrets | Lovable **Cloud 閳?Secrets** (+ copy to Node host) |
| Replit Object Storage / `public/uploads` | **Lovable Cloud Storage** public bucket `tomorrowos-uploads` (or Cloudinary) |
| `.replit` + Autoscale Publish | **GitHub sync + Railway/Render/Fly** `npm run start` (or **VERCEL_SETUP.md**) |
| Artifact `kind = web` | Real cms-starter Node app with Control Panel at `/` |
| `cms.hostingTarget: "here"` | `"self-hosted"` or `"vercel"` |

---

## Protocol version

`lovable-setup/1.0` 閳?aligned with TomorrowOS protocol `1.0` and `@tomorrowos/sdk` store drivers `sqlite` | `supabase` | `postgres` | `memory`.

**Changelog 1.0:** Initial Lovable wizard mirroring REPLIT_SETUP Q1閳ユ彌3; IRON RULE that Lovable Cloud Publish is not the WebSocket CMS host; Replit Object Storage replaced by Lovable Cloud Storage (+ Cloudinary still recommended for `/media/upload`).
