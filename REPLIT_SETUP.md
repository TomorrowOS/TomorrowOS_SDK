# Replit Setup Protocol for TomorrowOS CMS

> **This file is a contract for Replit Agent / Replit AI.**  
> Follow it literally. Ask questions in order. Do not invent answers. Do not write or rewrite application logic until the Q&A is complete. Prefer configuring Secrets, `.env`, `brand.json`, and `server.ts` store wiring over inventing a custom CMS.
>
> **On Replit, this file is the ONLY questionnaire.**

## User trigger (copy-paste)

When a human pastes a prompt like this, **read this file and start Question 1 immediately**:

```text
Follow @tomorrowos/sdk REPLIT_SETUP.md and set up my TomorrowOS CMS.
Ask only the questions listed in REPLIT_SETUP.md, in order. Do not use LLM_PROMPT.md.
Artifact kind must be **web** (never **api**). Question 3 only updates **brand.json**.
After all setup questions are answered (including Cloudinary Secrets if you chose Cloudinary), configure and start — minimal verification only (Web app type + Preview at /). **Never test Supabase connection** — save `SUPABASE_URL` and move on. No Supabase or WebSocket tests.
Do not skip steps.
```

Alternate triggers that also activate this protocol:

- “Set up TomorrowOS on Replit using REPLIT_SETUP.md”
- “Configure my TomorrowOS CMS (Replit wizard)”

When any of these triggers fire, **ignore `LLM_PROMPT.md` entirely** for the Q&A phase.

**Before Question 1:** ensure the Replit workspace primary artifact **`kind` is `web`** (see **IRON RULE: `web` kind only**). If the project is `api` / API-only or not publishable, **fix artifact kind first** — do not continue the questionnaire on a broken project type.

---

## IRON RULE: `web` kind only (Publish will fail on `api`)

> **This is the #1 deployability rule. Non-negotiable.**

TomorrowOS CMS serves a **browser Control Panel at `/`** plus WebSocket for TVs. Replit’s publish detector treats **`kind = "api"`** artifacts as **not deployable** as a user-facing app — Publish may only see design mockups / libs and fail with *“api-server artifact isn't being recognized as deployable”*.

| Required | Forbidden |
|----------|-----------|
| Primary artifact **`kind = "web"`** | **`kind = "api"`** on the CMS artifact |
| Homepage / project type: **Web app** | **API server** as the only publishable artifact |
| `GET /` → Control Panel HTML (`public/index.html`) | `artifacts/api-server` with `kind = "api"` for this CMS |
| `.replit` + `npm run start` → live Node (`tsx server.ts`) | Splitting CMS into a non-publishable API artifact |

**Agent must enforce before and after Q&A:**

1. If `.replit-artifact/artifact.toml` (or artifact metadata) shows **`kind = "api"`** → change to **`kind = "web"`** immediately (validated temp-file flow). **Never** leave the CMS on `api` kind.
2. **Do not** scaffold TomorrowOS CMS under `artifacts/api-server` with `kind = "api"`. The CMS lives at the **project root** (or a **`web`** artifact at `/`).
3. **Do not** create a separate `api` artifact “for the backend” — TomorrowOS is one **web** app (HTTP + WebSocket in `server.ts`).
4. After setup, confirm publish detector sees a **web** artifact serving `/` — not api-only.

**If Publish says api-kind / api-server not deployable:** fix `kind` to **`web`** first, then `.replit` ports + `deploymentTarget = "autoscale"`. Creating a **new Web app** Repl is the fastest fix if Agent locked the project as API-only.

---

## Questionnaire scope (STRICT — read before asking anything)

Replit Agent must ask **only** the questions defined in **this file**, in **this exact order**:

| Step | Section | When |
|------|---------|------|
| 1 | **Question 1** — Supabase connection string | Always |
| 2 | **Question 2** — Media storage (+ Cloudinary Secrets if chosen) | Always (after Q1) |
| 3 | **Question 3** — Brand / TomorrowOS app look | Always last, before execution |

**That is the complete list.** There are no other setup questions. **Do not** ask how many screens / devices. There is **no** “Question 2b” — Cloudinary credentials are collected **inside Question 2**, immediately after the user chooses Cloudinary.

**Critical:** Question 2 is **not complete** when the user says “Cloudinary” or “yes”. You **must** immediately show the Cloudinary Secrets input (same step — do **not** label a new question) and collect `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` **before** Question 3. Do **not** skip to branding with placeholder or invented credentials.


If the user volunteers extra info early (e.g. brand name before Q3), **record it** and still ask the current question’s required fields you do not yet have. Do not skip ahead to execution until Q1–Q3 are complete (Question 2 includes Cloudinary Secrets when applicable).

If the user says “just set it up, don’t ask questions,” respond:

> I need a few quick answers from REPLIT_SETUP.md (Supabase connection string, media storage — plus Cloudinary credentials if you choose Cloudinary — and branding). It takes about a minute and ensures the CMS deploys correctly on Replit.

Then ask **Question 1** — do not switch to `LLM_PROMPT.md`.

---

## Hard rules

1. **Ask only REPLIT_SETUP.md questions 1–3** (see **Questionnaire scope**). Never use `LLM_PROMPT.md` on Replit.
2. **One question at a time.** Wait for the user’s answer before asking the next question (unless they already answered several in one message). **Exception:** If the user chooses Cloudinary in Question 2, **stay on Question 2** and immediately show the Secrets form — do **not** open a separate “2b” step or announce a new question number.
3. **Do not invent** Cloudinary credentials, Supabase URLs, or brand colours. **Do not ask** screen / device count.
4. **Do not use Replit’s reserved `DATABASE_URL` Secret for Supabase.** On Replit, `DATABASE_URL` is often pre-claimed. Always use **`SUPABASE_URL`** for TomorrowOS ↔ Supabase.
5. **Prefer `npx @tomorrowos/sdk init`** (or the package’s `templates/cms-starter`) as the project seed. Do not rebuild pairing, WebSocket, or playlist APIs from scratch.
6. **Never commit secrets** into git. Put credentials only in Replit **Secrets** (and optionally mirror non-secret flags in `.env` that reference env vars).
7. After Q&A, **configure and start** — do **not** run a long test suite (see **Post-Q&A: minimal verification only**).
8. **Follow the Runtime & Replit publish rules below exactly.** A project that cannot Deploy / Publish on Replit is incomplete.
9. **Supabase: configure only — never test.** Save `SUPABASE_URL` + `TOMORROWOS_STORE=supabase` and proceed. **Do not** ping Postgres, run `psql`, start the server solely to verify DB connectivity, or treat log errors like `ENOTFOUND` / `database connection failure` in **Replit dev / Preview** as a failed setup. Supabase often works only after **Publish** (production networking), not in the dev shell.
10. **Artifact kind = `web` only.** **`kind = "api"` is forbidden** for the TomorrowOS CMS artifact. See **IRON RULE** above. Setup is incomplete if Publish would still see an `api` artifact.

**Question order (always):**

- Q1 → Q2 → Q3 → execution checklist

Never insert extra questions between these steps. When the user chooses Cloudinary, **Question 2 continues** with the Secrets form immediately — then proceed to Q3 only after secrets are saved.

---

## Deployability: Web app artifact (mandatory — fixes “api-kind not deployable”)

> **Reminder:** Re-read **IRON RULE: `web` kind only** — `api` kind is never acceptable for this CMS.

TomorrowOS CMS is a **user-facing Web app** (Control Panel at `/` + WebSocket for TVs). Replit must treat it as a **`web`** artifact, **not** `api` / API-only.

### Create the project correctly (do this first)

When scaffolding a **new** Repl:

1. On the Replit homepage, open the artifact-type dropdown and choose **Web app** (not API, not “Backend only”, not Agent & Automation-only).
2. **Do not** create an “API server” artifact as the only publishable output.
3. Describe the project as: *“TomorrowOS digital signage CMS — web Control Panel at `/` with WebSocket device pairing.”*
4. Run `npx @tomorrowos/sdk init` at the project root (or merge the cms-starter template).

**Forbidden setups that cause publish failure:**

- ❌ **`kind = "api"`** on the CMS artifact (`api-server`, `artifacts/api-server`, etc.)
- ❌ Project / primary artifact classified as **API** (`api-kind` artifact)
- ❌ Backend-only Express/Fastify service with **no** `staticRoot` / Control Panel at `/`
- ❌ Splitting CMS into a non-publishable API artifact + separate unpublished frontend
- ❌ **Static Deployment** as the publish type (TomorrowOS needs a **live Node server** for WebSocket)
- ❌ `deploymentTarget` or publish mode that only serves static files without `tsx server.ts`

### What “deployable” means for TomorrowOS

Replit Publish must see:

- A **Web app** that serves HTML at `GET /` (`public/index.html`)
- A Node process started by `npm run start` → `tsx server.ts`
- `host: "0.0.0.0"` and `port: Number(process.env.PORT) || 3000`
- An exposed port with `externalPort = 80` in `.replit` (see template below)
- **Autoscale** (or Reserved VM) deployment — **not** Static-only

### `.replit` (create or replace — required for publish)

Use this **minimum** configuration (merge with existing Nix/modules if needed; **do not** remove `[[ports]]` or `deploymentTarget`):

```toml
entrypoint = "server.ts"
modules = ["nodejs-20"]
hidden = [".config", "package-lock.json"]
run = "npm run start"

[nix]
channel = "stable-24_11"

[[ports]]
localPort = 3000
externalPort = 80

[deployment]
run = ["sh", "-c", "npm run start"]
deploymentTarget = "autoscale"
ignorePorts = false
```

**Agent rules for `.replit`:**

- Set `entrypoint = "server.ts"` (not `index.js` unless that file exists and starts TomorrowOS).
- Set `deploymentTarget = "autoscale"` (WebSocket + long-lived connections; Static Deploy is wrong).
- Keep exactly **one** primary `[[ports]]` entry with `externalPort = 80` for the CMS server.
- Ensure `.replit-artifact/artifact.toml` has **`kind = "web"`** (shipped in cms-starter). If `kind = "api"`, change to **`web`** before Publish.
- If `.replit` contains `[[artifacts]]` with **only** `artifacts/api-server` and Publish fails, set artifact **`kind = "web"`** or create a **new Web app** Repl and migrate — do not tell the user publish succeeded.

If Replit assigns a different `localPort` via `PORT`, update `localPort` to match the port in `[TomorrowOS] listening on http://0.0.0.0:<PORT>` logs, but keep `externalPort = 80`.

### Publishing pane (human + Agent)

Before Publish:

1. Confirm project filter / type shows **Web** (not API-only).
2. In Publishing, choose **Autoscale** (recommended) or **Reserved VM** — **not Static**.
3. Stop stale processes; clear port conflicts; restart workspace if needed.
4. `npm run start` → Preview at `/` shows Control Panel.

After Publish, the public URL is:

`https://YOUR-REPLIT-DOMAIN`

### If Publish says “api-kind artifact … not deployable”

**Do not** keep retrying publish unchanged. Fix in this order:

1. Open `.replit-artifact/artifact.toml` (or artifact config) — set **`kind = "web"`** (never `api`). This is the most common fix.
2. Verify homepage artifact type is **Web app**; if the Repl was created as API-only, **create a new Web app Repl** and re-run this setup (fastest fix).
3. Replace `.replit` with the template above (`entrypoint`, `modules`, `[[ports]]`, `deploymentTarget = "autoscale"`).
4. Confirm `server.ts` calls `tomorrowos.listen({ staticRoot: join(__dirname, "public"), host: "0.0.0.0", port: Number(process.env.PORT) || 3000 })`.
5. Confirm `GET /` returns Control Panel HTML (not JSON-only API root).
6. In Publishing, switch to **Autoscale** if currently Static.
7. Restart workspace → `npm run start` → Publish again.

Tell the user plainly if step 2 requires a new Repl — API-only projects cannot publish a browser CMS without **`kind = "web"`**.

---

## Runtime & Replit publish rules (mandatory)

These rules exist so the CMS can be **Run** and **Published/Deployed** on Replit without custom build steps.

### Runtime

- The server **must** run directly from source using `tsx server.ts`.
- **Do not** compile to `dist/` as the production entrypoint.
- **Do not** replace `@tomorrowos/sdk` with a hand-rolled server, Express wrapper that drops WebSocket upgrades, or a different package name.
- Always depend on **`@tomorrowos/sdk`**.
- **`tsx` must be available at runtime.** Prefer putting `tsx` in **`dependencies`** (not only `devDependencies`) so Replit Deploy / production installs still include it.
- Use **Node.js 20 or newer** (set in `.replit` / Nix / package engines if the workspace asks).

### Expected `package.json` scripts

```json
{
  "scripts": {
    "dev": "tsx watch server.ts",
    "start": "tsx server.ts"
  }
}
```

Allowed extras (optional): `"build-player": "tomorrowos build --platform tizen"`.  
**Forbidden as the Deploy entrypoint:** `node dist/server.js`, `next start`, static-only hosts, or any command that does not start `TomorrowOS.listen(...)`.

### Minimal dependency expectations

```json
{
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@tomorrowos/sdk": "^0.9.12",
    "dotenv": "^17.2.3",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0"
  },
  "scripts": {
    "dev": "tsx watch server.ts",
    "start": "tsx server.ts"
  }
}
```

Bump `@tomorrowos/sdk` to the latest published version when scaffolding.

### Replit Run command

```text
npm run start
```

### Replit deployment / publish command

```text
npm run start
```

### `.replit` (create or edit)

Use the full template in **Deployability: Web app artifact** (not run/deployment lines only). Minimum:

```toml
entrypoint = "server.ts"
modules = ["nodejs-20"]
run = "npm run start"

[[ports]]
localPort = 3000
externalPort = 80

[deployment]
run = ["sh", "-c", "npm run start"]
deploymentTarget = "autoscale"
ignorePorts = false
```

If the workspace already has a `.replit`, **merge** these keys — do not wipe unrelated Nix/modules config. Ensure Run, Deployment, **ports**, and **deploymentTarget** are correct.

### Publish readiness checklist (before telling the user “done”)

**Only these three checks matter after setup.** Do not add more unless Publish fails.

1. **Web app, not API** — primary artifact **`kind = "web"`** (not `api` / API-only).
2. **`.replit` is correct** — `entrypoint = "server.ts"`, `modules = ["nodejs-20"]`, `[[ports]]` with `externalPort = 80`, `deploymentTarget = "autoscale"`, Run/Deploy = `npm run start`.
3. **Preview at `/`** — after `npm run start`, logs show `[TomorrowOS] listening on http://0.0.0.0:...` and Preview shows the Control Panel (HTML), not empty / API JSON.

If all three pass, tell the user setup is complete. **Do not** block on extra tests below.

### Preview requirements (Replit workspace)

The Replit **Preview** must show the **TomorrowOS Control Panel** at `/` (root URL).

- `GET /` must serve the CMS Control Panel (`public/index.html` via `staticRoot: public`).
- **Do not** serve another app, API-only landing page, or placeholder at `/`.
- **Do not** use or rely on the **Canvas** preview for this CMS — use the normal **Web** preview in the browser.
- If the preview is **empty** or shows the wrong thing:
  1. Confirm the Replit project type is **Web**, not **API**.
  2. Confirm `npm run start` is running and logs show `[TomorrowOS] listening on http://0.0.0.0:...`
  3. Confirm `server.ts` calls `tomorrowos.listen({ staticRoot: join(__dirname, "public"), ... })`
  4. Open the preview URL directly (not Canvas) and hard-refresh.

### Before publishing / deploying

Do this **before** clicking Publish / Deploy:

1. **Stop** stale running processes (old `tsx` / `node` servers from prior attempts).
2. **Clear** old background tasks from previous failed projects (Replit Shell / Processes panel).
3. **Ensure no old process is holding the port** (`EADDRINUSE` in logs = something still bound to `PORT`).
4. **Restart the Replit workspace** if the port is stuck or preview still shows a ghost app.
5. Run `npm run start` once cleanly and confirm Control Panel loads at `/` in preview.

### After publishing / deploying

Tell the user their live CMS URLs:

- **Control Panel (browser):** `https://YOUR-REPLIT-DOMAIN`
- **TV / player CMS endpoint:** same HTTPS origin, e.g. `https://YOUR-REPLIT-DOMAIN/` (player converts `https://` → `wss://` for WebSocket)

Replace `YOUR-REPLIT-DOMAIN` with the actual published hostname (e.g. `my-cms.replit.app`).

**Do not** run post-publish smoke tests unless the user reports a problem. Telling them the URL is enough.

---

## Post-Q&A: minimal verification only

After Questions 1–3, **configure → `npm install` → `npm run start` → done.**

### Supabase: never test in Replit dev (mandatory)

Setup always uses Supabase: **save credentials + wire `server.ts` + start** — **nothing else**.

**Forbidden after Q&A (and after Question 1):**

- ❌ “Testing Supabase connection…”
- ❌ `psql`, `pg`, Prisma `db pull`, or any one-off DB probe script
- ❌ Restarting / debugging the server **because** logs show `database connection failure`, `getaddrinfo ENOTFOUND`, or `db.*.supabase.co can't be resolved`
- ❌ Telling the user their Supabase URL is wrong **only** because dev Preview cannot resolve the host
- ❌ Blocking setup completion on Supabase connectivity

**Expected in Replit dev:** Supabase host may **not resolve** in the dev environment. That is **normal**. The Control Panel at `/` can still load. Mark setup **complete** when Web app type is correct and Preview shows the Control Panel — **even if** Supabase errors appear in logs.

**When Supabase actually gets validated:** after the user **Publishes** the Repl and uses the live URL — not during the setup wizard.

### Do (maximum)

1. Confirm **Web app** artifact (not API) — **most important**.
2. Write Secrets / `.env` / `brand.json` / `server.ts` / `.replit` from answers.
3. `npm install` && `npm run start`.
4. Glance at logs for `[TomorrowOS] listening on http://0.0.0.0:...`.
5. Glance at Preview — Control Panel visible at `/`.

### Do NOT run after setup (unless user asks or Publish fails)

- ❌ **Supabase connection test** — **never**, including after `npm run start` (no `psql`, no DB ping, no “verifying database…”, no retry loops for `ENOTFOUND`)
- ❌ **Cloudinary upload test**
- ❌ **`curl` / `fetch` on `/brand.json`** as a formal gate
- ❌ **Browser WebSocket console snippet** as a formal gate
- ❌ **Publishing dry-run** unless the user asked to publish now
- ❌ **Long troubleshooting loops** when Preview already shows the Control Panel
- ❌ Re-running the full **Publish readiness checklist** item-by-item in chat

If Preview shows the Control Panel and the project is **Web app** type, **stop testing** and give the user their URL and next steps — **even when using Supabase and dev logs show DB connection errors**.

### Only if Preview is empty or Publish fails

Then (and only then) check: API vs Web type → `.replit` ports/`deploymentTarget` → stale process / port conflict → see **Failure recovery cheat sheet**.

---

## Question 1 — Supabase connection (always)

> **This is the first setup question.** Always configure Supabase. **Do not** ask how many screens / devices.

**Preferred on Replit:** open an **input / Secrets** UI where the user pastes the connection string into a field for:

- `SUPABASE_URL`

**Ask exactly (copy wording; do not substitute LLM_PROMPT questions):**

> Paste your Supabase Postgres connection string below. I will store it as the Replit Secret **`SUPABASE_URL`** (not `DATABASE_URL` — that name is often reserved by Replit).
>
> Example shape: `postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
>
> Also confirm whether SSL is required (usually **yes** for Supabase).

**You must then:**

1. Create / update Replit Secret: `SUPABASE_URL=<user value>`
2. Create / update Replit Secret or `.env`:
   - `TOMORROWOS_STORE=supabase`
   - `DATABASE_SSL=true` (unless the user explicitly says SSL is off)
3. Update `server.ts` so the store uses Supabase via `SUPABASE_URL`:

```ts
import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createTomorrowOSStore, TomorrowOS } from "@tomorrowos/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const brand = JSON.parse(readFileSync(join(__dirname, "brand.json"), "utf8"));

const store = createTomorrowOSStore({
  // Prefer SUPABASE_URL on Replit. Do NOT rely on Replit's reserved DATABASE_URL.
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

4. Ensure `.env` / Secrets include:

```env
TOMORROWOS_STORE=supabase
SUPABASE_URL=postgresql://...
DATABASE_SSL=true
```

5. **Do not** write the real password into committed files.
6. **Do not** test the Supabase connection after saving the Secret — **configuration only**. No probe, no `npm run start` just to verify DB, no fixing “connection failure” in dev. Saving `SUPABASE_URL` completes Question 1.
7. **Do not** proceed to Question 2 until `SUPABASE_URL` is saved.

If the user refuses Supabase, warn that Replit fleets need a durable Postgres store, then offer SQLite only after they explicitly confirm.

**Store in `brand.json` later (Question 3):** `cms.hostingTarget`: `"here"`. Do **not** ask for `expectedScreens`; leave a default (e.g. `5`) when writing `brand.json`.

---

## Question 2 — Media storage (uploads / thumbnails)

### Step A — Ask storage choice

**Ask exactly:**

> How should playlist media (images/videos) be stored?
>
> **Recommended: Cloudinary** — public HTTPS URLs, survives Replit restarts/redeploys, avoids Object Storage permission issues.
>
> Alternatives:
> - **Replit Object Storage** — keep files under `public/uploads` backed by Object Storage (no Cloudinary account).
> - **Local disk only** — `public/uploads` on the Repl filesystem (fine for quick tests; files may disappear on rebuild if not persistent).
>
> Do you want me to set up **Cloudinary**? (yes / no)

### Step B — If YES / Cloudinary (same Question 2 — no “2b”, no extra question)

**Do this immediately** when the user chooses Cloudinary. **Do not** say “Question 2b”, “next step”, or “Great — I’ll use Cloudinary” as a separate message before the form. **Go straight to the Secrets input.**

**Preferred on Replit:** open the **Replit Secrets** UI with fields for:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- Optional: `CLOUDINARY_FOLDER` (e.g. `tomorrowos`)

**If Secrets UI is unavailable, ask exactly (one message with all fields):**

> Paste your Cloudinary credentials (from [cloudinary.com/console](https://cloudinary.com/console) → Dashboard → **API Keys**). I will store them as Replit **Secrets**:
>
> 1. **`CLOUDINARY_CLOUD_NAME`**
> 2. **`CLOUDINARY_API_KEY`**
> 3. **`CLOUDINARY_API_SECRET`**
>
> Optional: **`CLOUDINARY_FOLDER`**

**You must then:**

1. Save Replit Secrets: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (and optional `CLOUDINARY_FOLDER`).
2. **Do not** write real secrets into committed files.
3. **Do not** invent or placeholder credentials.
4. **Do not** proceed to Question 3 until all three required Secrets exist.
5. **Do not** run a Cloudinary upload test — configuration only.

**If the user does not have a Cloudinary account yet:** tell them to sign up at cloudinary.com and return with API keys. **Wait** on Question 2 — do not skip to Question 3.

The SDK auto-detects these env vars and uploads media to Cloudinary. New uploads will return `https://res.cloudinary.com/...` URLs.

### If NO — Replit Object Storage (or local)

**Do this:**

1. Prefer configuring **Replit Object Storage** so writes to `public/uploads/` succeed and persist.
2. Create the directory if missing: `mkdir -p public/uploads`
3. Warn: if Object Storage IAM denies `storage.objects.create`, uploads will fail with a Google Cloud Storage permission error — fix Object Storage permissions or switch to Cloudinary.
4. Do **not** invent Cloudinary credentials.

---

## Question 3 — Brand / TomorrowOS app look (`brand.json` only)

> **Scope:** Question 3 answers **only** update **`brand.json`** — colours, name, tagline, logo path, etc. They configure how the **TomorrowOS player app** looks and metadata flags.
>
> **Question 3 does NOT affect:** Replit Publish, artifact `kind`, `.replit`, `server.ts`, Secrets, Supabase, Cloudinary, ports, deployment target, or CMS server wiring. **Never** change deploy/runtime config based on branding answers.

> **This is the only branding / platform / use-case question block.** Do not ask separate LLM_PROMPT “target platform”, “use case”, or “hosting” questions before this. **Do not** ask screen count.

**Ask exactly (one message; user may answer in one reply):**

> Let’s brand your TomorrowOS experience. Please provide:
>
> 1. **Product / venue name** (shown on screens and the Control Panel)
> 2. **Tagline** (optional)
> 3. **Primary colour** (hex, e.g. `#FF8A3D`)
> 4. **Background colour** (hex, optional — default `#FAFAF9`)
> 5. **Text colour** (hex, optional — default `#0A0908`)
> 6. **Secondary / accent colour** (hex, optional)
> 7. **Logo** — upload an SVG/PNG into the project, or give a URL I can fetch into `./assets/`


If the user only gives a name and primary colour, use defaults for the rest and say what you assumed.

**Then write / update `brand.json` only** at the project root (validate mentally against `brand.schema.json` in the SDK). **Do not** modify `.replit`, `server.ts`, Secrets, or deployment settings from these answers. Minimum example:

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
    "hostingTarget": "here",
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

Do **not** ask for screen count. Keep a default `cms.expectedScreens` (e.g. `5`) unless the user already volunteered a number. Always set `cms.hostingTarget` to `"here"` on Replit without asking. Set `cmsEndpoint` only if the user already knows their public `wss://…replit.app` URL; otherwise leave it out and tell them to pair TVs using the published HTTPS URL (player converts `https://` → `wss://`).

---

## After all answers — execution checklist

Run these steps in order. Tick mentally; do not skip.

### A. Seed the project (Web app + `kind = "web"` first)

**If creating a new Repl:** choose **Web app** on the Replit homepage before `init`. Confirm `.replit-artifact/artifact.toml` has **`kind = "web"`** after init.

```bash
npx @tomorrowos/sdk@latest init .
# If the directory is not empty and the user confirms overwrite of starter files only:
# npx @tomorrowos/sdk@latest init . --force
```

If `init` is inappropriate (existing customised project), merge carefully:

- Keep `data/tomorrowos.db` and `public/uploads/`
- Update `brand.json`, Secrets, and store wiring only

### B. Apply store + media Secrets

**Supabase (always from Question 1):**

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

### C. Wire `server.ts`

- Always: `host: "0.0.0.0"`, `port: Number(process.env.PORT) || 3000`, `staticRoot: public`
- Supabase path: pass `databaseUrl: process.env.SUPABASE_URL || process.env.DATABASE_URL` into `createTomorrowOSStore`
- Keep TomorrowOS event handlers from the starter (paired / online policy push)

### D. Runtime files for Replit publish

1. Ensure `package.json` scripts are exactly:

```json
"dev": "tsx watch server.ts",
"start": "tsx server.ts"
```

2. Move / keep `tsx` in **`dependencies`** so Deploy works.
3. Set `engines.node` to `>=20`.
4. Create or update `.replit` using the **Deployability** template (`entrypoint`, `modules`, `[[ports]]`, `deploymentTarget = "autoscale"`).

### E. Install and run

```bash
npm install
npm run start
```

(Use `npm run dev` only for local edit/watch. **Publish / Deploy / Replit Run must use `npm run start`.**)

**Minimal check:** logs contain `[TomorrowOS] listening on http://0.0.0.0:...` and Preview shows Control Panel at `/`. Then proceed to **G** — no further tests. **Ignore** Supabase `ENOTFOUND` / `database connection failure` in dev logs; do not debug DB for that reason alone.

### F. Done — skip extended verification

If the **three-item Publish readiness checklist** passes (especially **Web app, not API**), mark setup complete.

**Do not** run WebSocket console tests, Supabase connection tests, or `brand.json` curl checks here. **Supabase `ENOTFOUND` in dev is not a setup failure** — tell the user DB will connect after Publish if needed.

Only investigate further if Preview is empty, server crashed, or user reports Publish failure.

### G. Tell the user next steps (no code)

1. Keep this Repl **running** (Always On if available).
2. **Published Control Panel URL:** `https://YOUR-REPLIT-DOMAIN`
3. On the TomorrowOS player, enter the CMS URL: `https://YOUR-REPLIT-DOMAIN/`
4. Enter the 6-character pairing code from the screen into the Control Panel.
5. Create a playlist, upload media, Publish to the device.
6. Point them at `PLAYER_INSTALL.md` in the SDK for player install details.

---

## What not to ask / change

### Forbidden questionnaire sources

- **`LLM_PROMPT.md`** — not used on Replit setup; its questions are **replaced** by REPLIT_SETUP Questions 1–3
- Standalone “target platform” / “hosting target” / “use case” / **screen count** prompts outside Question 3

Do **not** ask the user how to implement:

- WebSocket framing
- Pairing crypto
- `device.content.setPolicy` payload shape
- Which WS library to use

Do **not**:

- Replace `@tomorrowos/sdk` with a hand-rolled server
- Change the production start command away from `tsx server.ts` / `npm run start`
- Point Supabase at Replit’s reserved `DATABASE_URL` when `SUPABASE_URL` should be used
- Skip Cloudinary recommendation without stating the persistence tradeoff
- **Skip Cloudinary Secrets** after the user chooses Cloudinary — always collect `CLOUDINARY_*` inside Question 2 before Question 3
- **Announce “Question 2b”** or a separate follow-up question — show the Secrets form immediately instead
- Claim uploads are “permanent” on Replit local disk without Object Storage or Cloudinary
- Leave `tsx` only in `devDependencies` if the Deploy pipeline installs production deps only
- Use Canvas preview as the primary CMS verification surface
- Serve a different app or API-only response at `/` instead of the Control Panel
- Create the Repl as **API-only** or publish with **Static Deployment** only
- Set or leave artifact **`kind = "api"`** for the TomorrowOS CMS
- Change `.replit`, `server.ts`, Secrets, or deployment config based on **Question 3** branding answers (those go in **`brand.json` only**)
- Omit `[[ports]]` / `deploymentTarget` from `.replit` when setting up for Publish
- Run **Supabase connection tests**, **WebSocket console tests**, or other post-setup smoke tests unless Preview fails or the user asks
- **Debug or “fix” Supabase** because dev logs show `getaddrinfo ENOTFOUND` or `database connection failure` — save config and finish setup instead
- Ask how many screens / devices (≤5 vs >5) — always start with Supabase

---

## SQLite fallback — `server.ts` reference (only if user refuses Supabase)

```ts
const store = createTomorrowOSStore({
  sqlitePath: join(__dirname, "data", "tomorrowos.db")
});
```

With Secrets / `.env`:

```env
TOMORROWOS_STORE=sqlite
```

---

## Failure recovery cheat sheet

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Publish: **api-kind artifact not deployable** | CMS artifact `kind = "api"` or API-only Repl | Set **`kind = "web"`** in `.replit-artifact/artifact.toml`; new **Web app** Repl if needed; `.replit` ports + `deploymentTarget=autoscale` |
| Preview empty / wrong app at `/` | Project type API, wrong staticRoot, or stale process | Set project to **Web app**; confirm `staticRoot: public`; stop old servers; restart workspace |
| TV / browser: WebSocket handshake timeout | Node CMS not running or crash-loop | Fix Run → `npm run start`; check logs for `listening` |
| Deploy/Publish fails / `tsx: not found` | `tsx` only in devDependencies | Move `tsx` to `dependencies`, reinstall, keep `start`: `tsx server.ts` |
| Deploy runs wrong process | `.replit` / Deployment not `npm run start` | Set `run = "npm run start"` and `[deployment] run = ["sh", "-c", "npm run start"]` |
| `EADDRINUSE` on start | Old process holding port | Stop stale processes, clear background tasks, restart Repl |
| Upload: `storage.objects.create` denied | Replit Object Storage IAM | Fix Object Storage permissions **or** switch to Cloudinary |
| Upload OK then thumbnails vanish later | Non-persistent `public/uploads` | Object Storage or Cloudinary |
| Supabase `ENOTFOUND` / `can't be resolved` in **dev** logs after setup | Replit dev network cannot reach Supabase host | **Not a setup failure.** Finish wizard; user validates DB after **Publish** |
| Supabase connection errors on **published** URL | Wrong URL or using reserved `DATABASE_URL` | Use `SUPABASE_URL` + `TOMORROWOS_STORE=supabase`; pooler URL `*.pooler.supabase.com:6543` |
| Pairing works on one Repl but not another | That Repl’s WS/backend only | Compare Run command and logs with a known-good Repl |

---

## Protocol version

`replit-setup/1.8` — aligned with TomorrowOS protocol `1.0` and `@tomorrowos/sdk` store drivers `sqlite` | `supabase` | `postgres` | `memory`.

**Changelog 1.8:** Question 1 is always Supabase connection string (input / Secret). Removed screen-count branching (≤5 SQLite vs >5 Supabase). Media storage is Question 2; branding is Question 3.

**Changelog 1.7:** **IRON RULE** — artifact **`kind = "web"` only** (never `api`); Question 4 (**now 3**) **only** writes `brand.json` (no deploy/server changes).

**Changelog 1.6:** **Never test Supabase** in Replit dev — `ENOTFOUND` in Preview logs is expected.

**Changelog 1.5:** Cloudinary Secrets inside media question — no “3b” step.

**Changelog 1.4:** mandatory Cloudinary credential collection before branding (superseded by 1.5 flow).

**Changelog 1.3:** minimal post-Q&A verification — no Supabase/WS smoke tests; prioritize **Web app vs API** only.
