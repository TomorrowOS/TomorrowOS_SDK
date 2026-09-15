# Vercel Setup Protocol for TomorrowOS CMS

> **This file is a contract for Vercel Agent / AI coding assistants setting up TomorrowOS on Vercel.**  
> Follow it literally. Ask questions in order. Do not invent secrets. Prefer configuring **Vercel Environment Variables**, `.env` (non-secrets only), `brand.json`, and `server.ts` store wiring over inventing a custom CMS.
>
> **On Vercel, this file is the setup questionnaire** (not `REPLIT_SETUP.md`).
>
> Protocol id: `vercel-setup/1.19` - pairs with `@tomorrowos/sdk` **0.9.70+** (`templates/cms-starter-v0`, Fluid Functions WebSockets).
>
> **Questions source of truth:** `VERCEL_QUESTIONS.md` - Agents must **open that file and paste each Q block verbatim**. Do not paraphrase.  
> **Q1/Q2 = clickable choice UI (same pattern):** open a **button / radio / option-card UI** with the two fixed choices. Do **not** ask the user to type `1` or `2` in chat when a choice UI is available. Chat “reply 1 or 2” is fallback only.  
> **Q3 = form only:** open **all seven optional inputs at once**, then **HARD STOP and WAIT** for submit or "skip". Never auto-skip because fields are optional. Never ask a branding choice first. Never show only Name + Primary colour. Logo = **Upload** above **Logo URL**.  
> **Q4 = optional `CMS_PASSWORD` (immediately after Q3, no prelude):** open the **CMS password Env/Secret input** right away. Blank/skip is valid. **Forbidden:** yes/no “Do you want a password / enable auth?” before the field. Control Panel auth only — never Vercel Deployment Protection / whole-site password.  
> **After Q&A (before debugging DB):** run **IRON GATE — v0 Preview hygiene** (clear root Next leftovers, restart supervised `dev`, prove `GET /status` is TomorrowOS JSON). Do **not** spend turns “fixing Neon/Blob” while port 3000 is still a stale Next/Turbopack process.  
> **Publish Output Directory:** must stay **empty / unset**.  
> **Publish Build Command:** must be **empty / skip build** (`"buildCommand": ""` in `vercel.json` + dashboard). A defined build command (even a no-op `npm run build`) forces Vercel **static-build** mode and requires `public/` — that causes `Output Directory "public" is empty` / not found. Do **not** “fix” by stuffing `public/robots.txt`.  
> **Copy questions verbatim from `VERCEL_QUESTIONS.md`.** Do not invent alternate Q2 options (no "Supabase Storage", no S3, no "disable media", no making Blob the recommended option).  
> **`TOMORROWOS_STORE` and `DATABASE_SSL` are agent-only** - set them automatically after Q1; never put them in a user-facing Env form for the customer to type.

## NON-NEGOTIABLE VERCEL RUNTIME CONTRACT

The following rules are **mandatory acceptance criteria**, not suggestions. The Agent must preserve them throughout setup, Preview, Publish, fixes, and upgrades:

1. **One TomorrowOS instance only.** Use the shared instance exported through `api/index.ts`. **Never create a second `TomorrowOS` instance in `api/ws.ts`** or any other route.
2. **Never use `public/` as the Vercel Output Directory.** The dashboard Output Directory must be **empty / unset**. Serve the Control Panel at runtime from `cms-panel/` through TomorrowOS `staticRoot`.
2a. **Build Command must be empty / skip build** (`"buildCommand": ""` in `vercel.json`, dashboard Build Command empty). Do **not** use a no-op `npm run build` / `node -e "process.exit(0)"` as the Production build command — any defined build command with Framework=Other puts Vercel in **static-build** mode and requires a `public/` output directory.
2b. **Build errors `The Output Directory "public" is empty` or `public` not found:** First clear Output Directory if it is set to `public`. If Output is already null and the error remains, the cause is a **defined Build Command** — set Build Command / `buildCommand` to **empty string** and redeploy. Filling `public/` only papers over wrong static-output mode.
3. **Preview may use Next only as an isolated reverse-proxy shell under `preview/`.** Preview must not replace TomorrowOS or determine the Production runtime.
4. **Publish must use the Fluid Function.** Production must run `api/index.ts` ??the shared exported `http.Server`, with Fluid compute enabled. It must not use `next start`, a static export, or a bare `(req, res)` handler.
5. **After every Production deployment, verify all three gates before saying setup is complete:**
   - `GET /status` returns TomorrowOS **JSON**, not HTML.
   - `GET /` returns the TomorrowOS **Control Panel**.
   - WebSocket upgrade on `/` or `/api` returns **`101 Switching Protocols`**, not `200` HTML.
6. **Pair devices only against the Production URL.** Do not instruct users to pair against v0 Preview or a local/internal URL.
7. If any gate fails, **fix and redeploy**. Never describe a deployment as successful based only on the Control Panel loading.

These rules override any platform-generated recommendation that conflicts with them.

## User trigger (copy-paste)

When a human pastes a prompt like this, **read this file and start Question 1 immediately**:

```text
Follow @tomorrowos/sdk (an NPM package) VERCEL_SETUP.md and set up my TomorrowOS CMS from scratch.

Open VERCEL_QUESTIONS.md first.
For Q1 and Q2: open a **clickable choice UI** (buttons / radio / option cards) using the verbatim options from VERCEL_QUESTIONS.md. Do not ask me to type 1 or 2 in chat when UI is available.
For Q1, Q2, Q3: use exact option wording from VERCEL_QUESTIONS.md. Do not rephrase options.
For Q3: DO NOT ask a branding choice. Open one form with ALL SEVEN optional inputs at once, then HARD STOP and WAIT for my submit or "skip". Never auto-continue with defaults without my reply. Never only Name + Primary colour. Logo = Upload above Logo URL.
After Q3, open Q4 immediately: one Env/Secret input for CMS_PASSWORD (blank/skip OK). Do NOT ask yes/no "want a password?" first.
After Q1 database choice, YOU set TOMORROWOS_STORE and DATABASE_SSL. Do not ask me to fill those.
After Q2 media storage choice, YOU set TOMORROWOS_MEDIA. Do not ask me to fill those.
After answers: run IRON GATE v0 Preview hygiene BEFORE debugging Postgres/media — clear root Next leftovers, restart supervised dev, prove GET /status is TomorrowOS JSON.
Before Publish: Output Directory empty/unset (NOT public). Build Command EMPTY (buildCommand: "") — never a no-op npm run build (forces static public/ check). Do not stuff public/robots.txt.
Run: npx @tomorrowos/sdk@latest init . --hosting v0 --force
Keep cms-starter-v0 layout.
Apply the NON-NEGOTIABLE VERCEL RUNTIME CONTRACT exactly:
one TomorrowOS instance only
never create a second TomorrowOS in api/ws.ts
never use public/ as Vercel Output Directory
Preview Next only under preview/
Publish must be the Fluid Function
after deploy verify: GET /status ? JSON, GET / ? Control Panel, WebSocket on / or /api ? 101
pair devices against the Production URL only
```

Alternate triggers:

- ?Set up TomorrowOS on Vercel using VERCEL_SETUP.md?
- ?Configure my TomorrowOS CMS (Vercel wizard)?

When any of these fire, **ignore `REPLIT_SETUP.md`** for the Q&A phase (you may skim Replit docs only for shared SDK semantics).

---

## IRON RULE: Preview vs Publish (dual runtime)

> **This is the #1 deployability rule on Vercel. Non-negotiable.**

TomorrowOS CMS is **one Node process** that serves:

- Browser Control Panel at `GET /` (`public/` via `staticRoot`)
- Device **WebSocket** on the same origin (`https` ??players use `wss`)

### Production / Publish ??Node only (no Next.js)

| Required | Forbidden |
|----------|-----------|
| Single **Node HTTP server** entry (`tsx server.ts` / exported `http.Server` from `listen()`) | **Next.js as the Production CMS** (`next start`, Next App Router as the live app) |
| **Framework Preset = Other / `null`** (dashboard **and** project settings API) | Leaving Framework Preset as **Next.js** (causes `404: NOT_FOUND`) |
| **Fluid compute** enabled (needed for WebSockets on Vercel) | Classic short-lived serverless with no WebSocket / no Fluid |
| Durable store = **Postgres** (Supabase or Neon, pooled URL) | **SQLite / `data/*.db` as production store** on Vercel (ephemeral filesystem) |
| Media = **Cloudinary** or **Vercel Blob** (durable HTTPS URLs) | Relying on local `public/uploads` alone for production fleets |
| Env vars in **Vercel Project ??Settings ??Environment Variables** | Committing passwords / API secrets / `.env` with secrets |
| `cms.hostingTarget`: `"vercel"` in `brand.json` | Creating `.replit` / Replit artifact files |

**Publish / Production Deploy** must run **`TomorrowOS.listen(...)`** directly. Do **not** put Next.js in front of Production traffic.

### Publish `404: NOT_FOUND` ??mandatory prevention (read before every deploy)

The production URL showing:

```text
404: NOT_FOUND
Code: NOT_FOUND
```

almost always means **Vercel still thinks this is a Next.js / static deploy**, not a Node TomorrowOS server.

**Before every Production deploy, you MUST verify all of the following:**

1. **Project ??Settings ??General ??Framework Preset = Other** (or unset / null).  
   If it still says **Next.js**, patch it via Vercel API / CLI / dashboard **before** redeploying.  
   `"framework": null` in `vercel.json` alone is **not enough** if the dashboard still says Next.js.
2. **Install Command** = `npm install` / `pnpm install` / `yarn` (normal install).
3. **Build Command** = **empty / skip build** (`""` in `vercel.json` and dashboard).  
   **Never** run `next build` for Production. **Never** use a no-op `npm run build` / `node -e "process.exit(0)"` as the Production build command — that forces static-build mode and the `public/` output check.
4. **Production entry** = Fluid **Vercel Function** `api/index.ts` that **`export default server`** from shared `cms-app.ts` (see [WebSockets docs](https://vercel.com/docs/functions/websockets)). Local `npm start` may still use root `server.ts`.
5. **Output Directory** = **empty / unset**. Do **not** set `outputDirectory: "."` as a fake static site.
6. **Do** use a single `api/index.ts` that exports the TomorrowOS `http.Server`. **Do not** create a second TomorrowOS in `api/ws.ts`, and **do not** use bare `(req, res)` handlers that drop upgrades.
7. If Preview needs Next, keep Next files **isolated** so Production auto-detect cannot latch onto them:
   - Prefer `preview/` (or similar) for `next.config.*`, `app/`, `pages/` used only by v0 Preview, **or**
   - Ensure Production Framework Preset is forced to **Other** and never runs `next` as the CMS.

**Setup is NOT complete** while Production `GET /` returns `404: NOT_FOUND` or WebSocket upgrade returns 200 HTML.

### Publish static trap — `public/` served without Node (read this)

**Symptom A — wrong runtime (common worse failure than `404: NOT_FOUND`):**
- `GET /` loads the Control Panel HTML (from static files)
- `GET /status`, `/devices`, etc. return **HTML** (Vercel 404 page)
- The panel shows **CMS unreachable** and console:  
  `Unexpected token 'T', "The page c"... is not valid JSON`

**Root cause A:** Vercel deployed `public/` as a **static site** (Output Directory = `public` or Framework=Other default “public if it exists”). **No Function** is running TomorrowOS.

**Symptom B — build fails before deploy:**
```text
Error: The Output Directory "public" is empty.
```
or (after deleting `public/`):
```text
No Output Directory named "public"
```
(wording may vary; both mean Vercel is in **static-build** mode looking for `public/`)

**Root cause B (check in order):**
1. Project Settings **Output Directory = `public`** (explicit override) — clear it.
2. Output Directory is already **null**, but a **Build Command is defined** (`npm run build` or any no-op). With Framework=Other, a defined build command forces static-build mode and defaults the output check to `public/` — even when dashboard Output is unset.

**Correct fix (mandatory for A and B):**

1. Set **Output Directory** = **empty / unset**.
2. Set **Build Command** = **empty** (`"buildCommand": ""` in `vercel.json` + dashboard). This is a **functions-only** deploy; skip the static build step entirely.
3. Framework Preset = **Other** / null; Fluid on; `api/index.ts` + rewrites per Scheme A.
4. Redeploy. Verify `GET /status` is **JSON** and WebSocket is **101**.

**Forbidden “fixes”:**

- Adding `public/robots.txt` / `.gitkeep` **so a static Output Directory = `public` build passes** — that leaves Production on the static trap path.
- Keeping a no-op `buildCommand: "npm run build"` while hoping Output=null is enough — the defined build command still triggers the `public/` check.
- Setting Output Directory to `cms-panel`, `.`, or `public`.
- Claiming Publish succeeded because the build log turned green while Output is still `public` or Build Command still runs a static check.

**Optional:** If some tooling creates an empty `public/` folder, delete it or ignore it — **never** point Output Directory at it.

**Scheme A reminder:** use `cms-panel/` (not `public/`), Fluid Function `api/index.ts` + rewrites, Output Directory empty. Static UI is served **at runtime** via `staticRoot` in `listen()`.

**Publish gate (mandatory):** after deploy, `GET /status` must return **JSON** starting with `{`, not HTML starting with `<` or `The page`. **And** WebSocket upgrade on `/` or `/api` must return **101**.

```bash
curl -s https://YOUR-PROJECT.vercel.app/status | head -c 80
# Expected: {"status":"success",...}
# Failure:  The page could not be found  OR  <!DOCTYPE html>
```

**Setup is NOT complete** while `/status` returns HTML, the panel shows the JSON parse error, or devices cannot open `wss://`.

### Preview (v0 / Vercel Agent sandbox) ??Next.js shell allowed

v0 Preview is often a **Next.js runtime** hardwired to `next dev`. A raw `tsx server.ts` may listen successfully while Preview still shows a blank page, because the sandbox intercepts the public port with Next before requests reach TomorrowOS.

**For Preview only**, you **must** keep a thin Next.js host that **reverse-proxies** HTTP to TomorrowOS on an **internal** port.

| Preview requirement | Detail |
|---------------------|--------|
| Next.js remains the Preview host | Satisfies v0 / sandbox expectations |
| TomorrowOS on internal port | e.g. `TOMORROWOS_INTERNAL_PORT=3001` (not the public Preview port) |
| Transparent HTTP reverse proxy | Next route/middleware forwards `/` (and Control Panel paths) ??`http://127.0.0.1:3001` |
| Start both processes in Preview | Next + `tsx server.ts` (or a `dev:preview` script that starts both) |

**Preview WebSocket note:** HTTP proxy is enough for Control Panel HTML/API smoke checks. Device `wss` pairing may not work through a Next proxy in Preview ??that is acceptable. **Pair devices against the Production Publish URL**, not v0 Preview.

**Do not** replace TomorrowOS with a Next-only CMS. Next is a **Preview adapter**, not the product.

---

## Questionnaire scope (STRICT)

Ask **only** these questions, in **this exact order**. **Copy the ?Ask exactly??blocks verbatim** ??do not paraphrase options.

| Step | Section | When |
|------|---------|------|
| 1 | **Question 1** ? Database (Supabase ? Neon) | Always |
| 2 | **Question 2** ? Media (**Cloudinary recommended** ? Vercel Blob) | Always (after Q1) |
| 3 | **Question 3** - Brand form (`brand.json` only; **not a choice** - open all 7 optional inputs at once) | Always (after Q2) |
| 4 | **Question 4** - Optional CMS password Env `CMS_PASSWORD` (**immediately after Q3**; blank = skip; **no** yes/no prelude) | Always last |

**That is the complete list (Q1–Q4).** Do **not** ask how many screens / devices.

| Step UX | Rule |
|---------|------|
| Q4 CMS password | **Immediately after Q3** — one Env/Secret input for `CMS_PASSWORD` (blank/skip allowed). **Never** ask a yes/no "do you want a password?" first. |

**Forbidden invented Question 2 options (never offer these in chat or UI):**

- ???Vercel Blob **(recommended)**??as option 1 ??Blob is option **2**, not recommended over Cloudinary
- ???Supabase Storage??/ S3 bucket / `SUPABASE_SERVICE_ROLE_KEY` for media
- ???No media storage??/ ?disable media uploads??/ ?remote URLs only??as a numbered choice
- ??Any media list that does not start with **Cloudinary (recommended)**

**Forbidden Env UX after Question 1:**

- ??Showing the user empty fields for `TOMORROWOS_STORE` or `DATABASE_SSL` to fill
- ??Asking in chat ?what should TOMORROWOS_STORE be???
- ??After DB choice + URL paste: **you** write those two vars silently (see Q1 Steps B/C/D)

**Forbidden extra questions (never ask, even if the user skips a step):**

- ??OpenAI / Anthropic / Gemini / any LLM API key (`sk-?`, etc.)
- ???AI pairing?? ?AI feature logic?? or inventing auth that needs an LLM key
- ??Asking the user to type `TOMORROWOS_STORE` or `DATABASE_SSL`
- Any secret not listed in Questions 1–4 (DB URL, media credentials, brand, optional `CMS_PASSWORD`)

TomorrowOS pairing and Control Panel logic live in `@tomorrowos/sdk`. They do **not** call OpenAI.

If the user **skips** a Question 2 option, do **not** invent a substitute question. Re-state Question 2 choices **verbatim** ? never pivot to LLM keys, Supabase Storage, or local disk uploads.

If the user says ?just set it up, don?t ask questions,??respond:

> I need a few quick answers from VERCEL_SETUP.md (database — Supabase or Neon preferred — media storage with Cloudinary recommended, branding, and optional CMS password). It takes about a minute and ensures the CMS works on Vercel.

Then ask **Question 1**.

---

## Hard rules

1. **Open `VERCEL_QUESTIONS.md` first.** Ask Q1 → configure → Q2 → configure → Q3 → Q4. Never paraphrase question options. Never use `REPLIT_SETUP.md` as the questionnaire. **Never** ask for OpenAI or other LLM API keys.
1a. **Q1 and Q2 UX:** Prefer a **clickable choice UI** (same pattern for both): two option buttons/cards matching the verbatim labels. **Forbidden when UI exists:** chat-only “Reply with 1 or 2”. Chat typing is fallback only if the platform cannot render choices.
1b. **Q4 UX:** Immediately after Q3, open the **`CMS_PASSWORD` Env/Secret input**. **Forbidden:** yes/no “Do you want a password / enable auth?” prelude. Blank/skip is a complete answer.
2. **Question 2 options are fixed:** (1) Cloudinary **(recommended)**, (2) Vercel Blob. Do not reorder; do not invent Supabase Storage, local disk, or disable-uploads.
3. **Cloudinary:** open **one** Vercel Env popup with **all** Cloudinary fields together. Do **not** quiz one credential at a time.
4. **`TOMORROWOS_STORE` + `DATABASE_SSL` = agent-owned.** After Q1 choice (and URL if needed), set them yourself in Vercel Env Vars. **Never** include them as blank fields for the customer. Mapping: Supabase ? `TOMORROWOS_STORE=supabase` + `DATABASE_SSL=true`; Neon ? `TOMORROWOS_STORE=postgres` + `DATABASE_SSL=true`. **Do not offer SQLite as a questionnaire choice** ? it is ephemeral on Vercel and unsuitable for production.
5. **Do not invent** Cloudinary credentials, database URLs, Vercel Blob tokens, brand colours, **or LLM API keys**.
6. **Postgres env naming:** prefer **`SUPABASE_URL`** for Supabase; prefer **`DATABASE_URL`** for Neon.
7. **Always prefer pooled connection strings** (Supabase Session pooler **6543**; Neon pooled host).
8. **Prefer `npx @tomorrowos/sdk@latest init --hosting v0`**. For Replit/Railway use `npx @tomorrowos/sdk@latest init .`. Do not rebuild pairing / WebSocket APIs. Untagged `npx @tomorrowos/sdk init` is forbidden (stale cache).
9. **Never commit secrets.** Use Vercel Environment Variables.
10. **Skip Replit-only files.**
11. **SQLite is not a production store on Vercel.**
12. **Enable Fluid compute** for Production WebSockets.
13. **Production:** `api/index.ts` exports `http.Server` from `TomorrowOS.listen`. Not `next start`. No second TomorrowOS in `api/ws.ts`.
14. **Preview:** Next reverse-proxy shell when v0 is Next-hardwired.
15. After Q&A: **configure ??install ??deploy ??minimal verify**.
16. **No inventing CMS login** from a branding URL.
17. **Skip → invent.** Stay on Q1–Q4 only.
18. **Publish gate:** `/status` JSON + WebSocket 101; no static `public/` trap.
19. **Q3 is a form, not a question — and you must WAIT.** After Q2, open one dialog with **all seven** optional inputs visible together, then **stop and wait** for submit or explicit **"skip"**. **Never** auto-continue because fields are optional. **Never** ask a preliminary branding choice. **Never** show only Product Name + Primary colour. **Never** use multiple-choice / Option A-B for branding. Logo = **Upload** above **Logo URL**.
20. **IRON GATE after Q&A:** Before blaming Neon / Blob / migrations, complete **IRON GATE — v0 Preview hygiene** below. Preview 500s are usually leftover root Next or a stale supervised `next-server`, not a bad Q1/Q2 choice.

**Question order:** Q1 -> (auto-set store env) -> Q2 -> Q3 form (**wait for user**) -> Q4 `CMS_PASSWORD` Env input (**no yes/no prelude**; blank/skip OK) -> **IRON GATE** -> execution checklist.

---

## IRON GATE — v0 Preview hygiene (run after Q&A, before DB rabbit holes)

> **Why this exists:** On v0, agents often answer Q1–Q3, run `init`, then spend a long time “fixing Postgres” while port **3000** is still the original **Next/Turbopack** starter (or a manually spawned `tsx` without injected env). Neon vs Blob choices are **not** the usual cause.

### Do this in order — stop when each check passes

1. **Identify what owns `:3000` (empirical, 30 seconds)**  
   - If process/logs look like `next-server` / Turbopack / `ENOENT .../app` → you are **not** talking to TomorrowOS yet.  
   - If `GET /status` returns TomorrowOS **JSON** (`{"status":...}`) → proceed.  
   - **Forbidden:** debugging `DATABASE_URL` / Neon pooler while `/status` is HTML, Next error overlay, or Turbopack crash.

2. **Clear forbidden root Next leftovers (from the original v0 starter)**  
   Remove from **project root** (keep the SDK shell under `preview/`):  
   `app/`, `pages/`, root `next.config.*`, root `next-env.d.ts`, root `postcss.config.*`, leftover `components/` / `lib/` from the starter, `components.json` — anything that makes Framework detection or v0 Preview latch onto Next at root.  
   **Do not** delete `preview/` (that is the sanctioned Next reverse-proxy shell).  
   Empty leftover dirs after deleting files.

3. **Confirm scripts + layout**  
   - Root `package.json` `"dev"` / `"start"` run TomorrowOS (`tsx` …), not `next dev` at root.  
   - `preview/` exists if Preview stays Next-hardwired; use `dev:preview` (Next public + TomorrowOS on **3001**) when required.  
   - `cms-panel/` (or template static root) is TomorrowOS UI — **not** Vercel Output Directory `public/`.

4. **Restart the platform-supervised `dev` — do not double-bind**  
   - After rewriting `package.json` scripts, the **old** supervised `next-server` may still hold `:3000`. Kill/restart so the supervisor re-execs the **new** `dev` script.  
   - **Forbidden:** spawning a second manual `pnpm dev` / `tsx` that fights the supervised process (`EADDRINUSE`) **and** lacks v0-injected env.  
   - Prefer the **v0/Vercel managed** process (it inherits injected secrets). Only start TomorrowOS yourself if you also load the same env (see **Env loading trap**).

5. **Prove TomorrowOS before touching DB**  
   - `GET /status` → **200 JSON** from TomorrowOS (not Next HTML, not `The page could not be found`).  
   - `GET /` → Control Panel HTML (or CMS login HTML if `CMS_PASSWORD` set).  
   - Only **then** interpret Database/Media connector errors as real store/media issues.

### Env loading trap (v0 / Preview vs Production)

| Context | How secrets arrive | What `import "dotenv/config"` sees |
|---------|-------------------|-------------------------------------|
| **Production Deploy** | Vercel injects into `process.env` | N/A — platform env wins |
| **v0 / Agent Preview** | Often written to **`.env.development.local`** (and/or injected only into the **supervised** Node process) | **Only `.env`** by default — **not** `.env.development.local` |
| **Manual Bash `pnpm dev`** | Usually **no** injected `DATABASE_URL` / Blob token unless you export them | Easy false “Postgres broken” |

**Rules:**

- Non-secret flags may live in committed `.env` (`TOMORROWOS_STORE`, `DATABASE_SSL`, `TOMORROWOS_MEDIA`).  
- Secrets (`DATABASE_URL`, `SUPABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `CMS_PASSWORD`, Cloudinary keys) belong in **Vercel Env** / v0 injection — never commit them.  
- If logs say store=`postgres` but `DATABASE_URL` is missing in a **manual** process: load `.env` **and** `.env.development.local`, or restart the **supervised** server — do **not** immediately change Neon URLs.  
- Preview flakes ≠ Production failure. Fix Preview hygiene first; do not “repair” Production Framework because Preview 500’d.

### Preview decision tree (after hygiene)

```
Is GET /status TomorrowOS JSON on the Preview URL?
  YES → continue checklist (Publish gates still required).
  NO → What owns the public port?
        next-server / Turbopack / ENOENT app/ → clear root Next + restart supervised dev (steps 2–4).
        tsx TomorrowOS listening but Preview blank → v0 still hardwires Next: use preview/ reverse-proxy + TOMORROWOS_INTERNAL_PORT=3001 + dev:preview.
        EADDRINUSE :3000 → kill stale Next/tsx; one process only.
```

**Reminder:** Q1 Neon / Q2 Blob are valid protocol choices. A long Preview outage after those answers is almost always **process/layout/env injection**, not “wrong database/media product.”

---

## Scheme A — Vercel Functions + WebSockets (mandatory for Production)

> **Goal:** Preview may use Next + proxy; **Publish** runs TomorrowOS as a **Vercel Function** (`api/index.ts`) on **Fluid**, with WebSocket support per [Vercel WebSockets docs](https://vercel.com/docs/functions/websockets).  
> **Scope:** Layout + `vercel.json` + dashboard. Prefer `npx @tomorrowos/sdk@latest init --hosting v0` (`cms-starter-v0`).  
> **Do not** break Replit/Railway: those keep using default `init` ??`cms-starter` (root `server.ts` + `server.listen`, no `api/`).

### Why Scheme A exists

| Layer | Preview (v0) | Publish (Production) |
|-------|----------------|----------------------|
| Host | Next.js shell + HTTP proxy | **Vercel Function** `api/index.ts` ??`export default server` |
| Static UI | Proxied from TomorrowOS | Served by **`staticRoot`** (`cms-panel/`) inside `listen()` ??**not** Vercel Output Directory |
| WebSocket | Optional / may fail in Preview | **Required** ??Fluid Function upgrade (`wss://` ??`/` rewritten to `/api`, or direct `/api`) |
| Next files | Allowed under `preview/` | **Must not** live at project root |

**Root cause of ?Control Panel works, TV cannot connect??** HTTP can be served without WebSocket upgrades. Classic root-only `server.ts` / plain serverless handlers often return **200 HTML** on `Upgrade` instead of **101**. Official pattern is a Function that exports `http.Server` with `ws` attached ([docs](https://vercel.com/docs/functions/websockets)).

### A1 ??Project layout (Agent must enforce)

**Production (Vercel / v0 starter):**

```
cms-app.ts         ??shared TomorrowOS.listen + export const server
api/index.ts       ??export { server as default } from "../cms-app.js"
server.ts          ??local/Preview: same default export (npm start / internal port)
vercel.json        ??fluid + rewrites + functions.maxDuration
package.json
brand.json
cms-panel/         ??CMS static UI (NOT named public/ ??avoids static-output trap)
preview/           ??Next proxy for v0 Preview only
```

**Preview only ??keep ALL Next under `preview/`:**

```
preview/
  next.config.mjs
  app/
  ??
```

**Do NOT:**

- ??Leave `next.config.mjs` + `app/` at project root
- ??Set Output Directory to `public`, `cms-panel`, or `.`
- ??Create a **second** TomorrowOS instance in `api/ws.ts` (separate isolate = broken pairing memory)
- ??Use `(req, res) =>` serverless handlers that drop `upgrade`
- ??Put `startCommand` / `processes` in `vercel.json` (v0 schema rejects them)

**`package.json` scripts:**

```json
{
  "scripts": {
    "dev": "tsx watch server.ts",
    "dev:preview": "concurrently -k \"npm:dev:tomorrowos\" \"npm:dev:next\"",
    "dev:tomorrowos": "cross-env TOMORROWOS_INTERNAL_PORT=3001 tsx watch server.ts",
    "dev:next": "cd preview && next dev -p 3000",
    "start": "tsx server.ts",
    "build": "node -e \"process.exit(0)\""
  }
}
```

- **Local / Railway-style:** `npm start` ??`tsx server.ts` ??SDK calls `server.listen` (no `VERCEL` env).
- **Vercel Production:** Function loads `api/index.ts`; SDK skips `listen` when `process.env.VERCEL` is set and Vercel owns the socket.

### A2 ??Function entry (matches Vercel WebSockets docs)

```ts
// api/index.ts
export { server as default } from "../cms-app.js";
```

```ts
// cms-app.ts (shared)
const server = tomorrowos.listen({
  port: Number(process.env.PORT) || 3000,
  host: "0.0.0.0",
  staticRoot: join(__dirname, "cms-panel"),
});
export { server, tomorrowos };
```

SDK behaviour (0.9.32+):

- Accepts WebSocket upgrades on `/`, `/api`, `/api/ws` (players may use either)
- When `VERCEL` is set: **`autoListen` defaults to false** ??do not bind a port yourself
- Pattern aligns with docs: create `http.Server`, attach `ws`, **`export default server`**

### A3 ??`vercel.json` (Production)

```json
{
  "fluid": true,
  "framework": null,
  "installCommand": "npm install",
  "buildCommand": "",
  "functions": {
    "api/index.ts": {
      "maxDuration": 300,
      "memory": 1024,
      "includeFiles": "{cms-panel/**,brand.json,assets/**}"
    }
  },
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/api" }
  ]
}
```

**`maxDuration` plan limits:** Hobby / many default plans allow **1–300** seconds. **800** requires a higher Vercel plan. Prefer **`300`** unless the account already allows more — otherwise Publish fails with *maxDuration must be between 1 and 300 / upgrade your plan*.

**Why rewrites:** Public URLs stay `https://app.vercel.app/` and `/status` while the Function mount is `/api`. Device `wss://app.vercel.app/` is rewritten to the same Function so one isolate handles HTTP + WS.

**v0 schema:** never add `startCommand` or `processes`.

**Critical:**

- `"fluid": true` is required for WebSockets
- **Do not** set `outputDirectory` to `cms-panel` / `public`
- `"buildCommand": ""` — **skip build entirely** (functions-only). **Never** `next build`. **Never** a no-op `npm run build` as Production build (forces static `public/` check)
- Dashboard Output Directory must stay **empty**; dashboard Build Command must stay **empty** (or match `""`)

### A4 — Vercel Project Settings (dashboard — mandatory)

| Setting | Required value |
|---------|----------------|
| Framework Preset | **Other** / null — **not Next.js** |
| Install Command | `npm install` |
| **Build Command** | **empty / skip** — **not** `npm run build` |
| **Output Directory** | **empty / unset** — **never `public`** |
| Fluid compute | **On** |
| WebSockets | Account must allow Functions WebSockets (see docs — Permissions Required) |

**If Publish build fails with `The Output Directory "public" is empty` or `public` not found:**
1. Clear Output Directory if set to `public`.
2. If Output is already null: set **Build Command** / `vercel.json` `"buildCommand"` to **`""`** and redeploy. A defined build command (even no-op) forces static-build mode.
3. Do **not** add `public/robots.txt` as the primary fix.

**`vercel.json` must not set `outputDirectory`.** Leaving it out is correct. **`buildCommand` must be `""`** (empty string), not omitted if the dashboard still has a leftover `npm run build` — set both file and dashboard.

### A5 ??Publish acceptance (all must pass)

1. `curl -s https://PROD/status` ??JSON (`{"status":...}`)
2. `curl -s https://PROD/` ??Control Panel HTML
3. **WebSocket upgrade returns 101**, not 200 HTML:

```bash
curl.exe -i --http1.1 ^
  -H "Connection: Upgrade" -H "Upgrade: websocket" ^
  -H "Sec-WebSocket-Version: 13" ^
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" ^
  "https://PROD/"
# Also try: https://PROD/api
```

4. Control Panel does **not** show CMS unreachable / `Unexpected token 'T'`
5. Fluid on; Framework = Other

If (1)+(2) pass but (3) fails ??Function is serving HTTP only. Re-check Fluid, `api/index.ts` default export, rewrites, and WebSockets permission. **Do not** invent a second `api/ws.ts` TomorrowOS instance.

### A6 ??What Scheme A does **not** require

- ??No Next.js as Production CMS
- ??No replacing SDK transport with hand-rolled pairing
- ??No SQLite as production store on Vercel
- ??No changes to Replit `cms-starter` layout for Vercel-only fixes

### A7 ??If v0 Publish still fails (Path B / C)

**Path B:** Deploy with `vercel --prod` or Git integration (full Vercel), same Scheme A layout.

**Path C:** Host CMS on **Railway / Fly.io / Replit** (long-lived Node). Use Vercel only for Preview if needed.

### A8 ??Migrate an existing broken Vercel project

1. Scaffold/compare with `cms-starter-v0` (`init --hosting v0`) or copy:
   - `cms-app.ts`, `api/index.ts`, `server.ts`, `vercel.json`
   - rename `public/` ??`cms-panel/` if still present
2. Ensure **one** Function exports the **same** `server` from `cms-app.ts`
3. Fluid on ??Redeploy
4. Verify A5 (especially WebSocket 101)
5. On TVs: enter `https://YOUR.vercel.app/` (players also try `/api` automatically on vercel.app hosts)

---

## Runtime & Vercel deploy rules (mandatory)

### Production runtime (Publish)

- Serve TomorrowOS via **Vercel Function** `api/index.ts` ??`export default server` (Fluid + WebSockets).
- Keep root **`server.ts`** for **local** `npm start` / Preview internal port only (same `cms-app.ts`).
- Keep **`@tomorrowos/sdk`** (0.9.32+) and put **`tsx` in `dependencies`** for local start.
- Node **20+**.
- **Do not** replace the SDK with a hand-rolled server that drops WebSocket upgrades.
- **Forbidden as the Production CMS:** `next start`, static export only, or a bare `(req,res)` handler without `http.Server` + `ws`.

### Expected `package.json` scripts

```json
{
  "scripts": {
    "dev": "tsx watch server.ts",
    "dev:preview": "concurrently -k \"npm:dev:tomorrowos\" \"npm:dev:next\"",
    "dev:tomorrowos": "cross-env PORT=3001 TOMORROWOS_INTERNAL_PORT=3001 tsx watch server.ts",
    "dev:next": "cd preview && next dev -p 3000",
    "start": "tsx server.ts",
    "build": "node -e \"process.exit(0)\""
  }
}
```

Adapt script names / process runners as needed. **Invariant:**

- **Local `npm start`** = TomorrowOS Node with `server.listen`.
- **Vercel Production** = Function `api/index.ts` (SDK `autoListen=false` when `VERCEL` is set).
- **`vercel.json` `"buildCommand"`** = `""` (skip build). Optional `package.json` `"build"` no-op is unused by Vercel Publish — **never** wire it as the Production Build Command.
- **Preview / v0** = Next on public port + TomorrowOS on internal port + proxy.

### Minimal dependencies (Production)

```json
{
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@tomorrowos/sdk": "latest",
    "dotenv": "^17.2.3",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0"
  },
  "scripts": {
    "dev": "tsx watch server.ts",
    "start": "tsx server.ts",
    "build": "node -e \"process.exit(0)\""
  }
}
```

Use the latest published `@tomorrowos/sdk` when scaffolding (do not invent versions).

Add nothing extra for Blob when using `@tomorrowos/sdk@0.9.70+` (`@vercel/blob` is bundled). Only ensure `BLOB_READ_WRITE_TOKEN` + `TOMORROWOS_MEDIA=vercel-blob` when the user chooses **Vercel Blob** in Question 2.

For Preview shell only, add as needed: `next`, `react`, `react-dom`, and a process runner (`concurrently` or equivalent). These must **not** become the Production CMS.

### `server.ts` pattern (Vercel-adapted ??Production)

Keep the server at **project root** (e.g. `server.ts` / `server.mts`). Do **not** move Production into `api/` solely to satisfy Vercel routing myths.

```ts
import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createTomorrowOSStore, TomorrowOS } from "@tomorrowos/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const brand = JSON.parse(readFileSync(join(__dirname, "brand.json"), "utf8"));

const store = createTomorrowOSStore({
  // Supabase: SUPABASE_URL (pooler). Neon: DATABASE_URL (pooled).
  databaseUrl:
    process.env.SUPABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_URL,
  sqlitePath: join(__dirname, "data", "tomorrowos.db") // local/dev fallback only
});

const tomorrowos = new TomorrowOS({ brand, store });

const port =
  Number(process.env.TOMORROWOS_INTERNAL_PORT) ||
  Number(process.env.PORT) ||
  3000;

const server = tomorrowos.listen({
  port,
  host: "0.0.0.0",
  staticRoot: join(__dirname, "public")
});

// Vercel / Node server capture: export the HTTP server, not only TomorrowOS.
export default server;
```

- **Production:** `PORT` from Vercel — TomorrowOS listens on that port (no Next).
- **Preview:** set `TOMORROWOS_INTERNAL_PORT=3001` (or similar) so Next can own `:3000` and proxy inward.

Load env with `dotenv` for local/`vercel dev` (loads **`.env` only**). On production Deploy, Vercel injects Environment Variables natively.

**v0 / Preview caveat:** platform secrets often land in **`.env.development.local`** or only in the **supervised** process env. TomorrowOS `import "dotenv/config"` does **not** auto-load `.env.development.local`. See **IRON GATE — Env loading trap**. Never treat a manual Bash server missing `DATABASE_URL` as proof that Neon is misconfigured.

### Preview adapter (v0 / Next reverse proxy) — required when Preview is Next-hardwired

Detect Preview / v0 (Next already present, or Preview blank while TomorrowOS logs ?listening??. Then:

1. Keep a **minimal** Next app **isolated when possible** (e.g. under `preview/`) so Production Framework detection does not latch onto root `next.config.*`.
2. TomorrowOS listens on **`127.0.0.1:TOMORROWOS_INTERNAL_PORT`** (default **3001**).
3. Add a **catch-all** Next route (or middleware) that proxies HTTP to TomorrowOS:

```ts
// Example: preview app proxy handler
// Forward method, headers, and body to http://127.0.0.1:3001/<path>
// Return the upstream status, headers, and body to the browser.
```

Preferred UX: proxy **`/`** itself (rewrites) so the Preview URL shows the Control Panel at `/`, not only under `/api/...`.

4. Start **both** processes for Preview (`dev:preview` pattern above).
5. Document in the final summary: **Preview = Next shell + proxy; Publish = Node only.**

**Forbidden:**

- Making Next the Production CMS or the only server after Publish.
- Deleting TomorrowOS `server.ts` because Preview needed Next.
- Claiming setup complete if Production entrypoint is still `next start`.
- Claiming setup complete if Production `GET /` is `404: NOT_FOUND`.
- Creating root `api/index.*` + `routes` catch-all that exports a raw `http.Server` ?to fix 404??

### `vercel.json` (Production ??explicit Node, not Next)

Write `vercel.json` so Production cannot be mistaken for Next. Minimum:

```json
{
  "fluid": true,
  "framework": null,
  "installCommand": "npm install",
  "buildCommand": ""
}
```

Use `pnpm` / `yarn` variants of install if that is the project's package manager. **`buildCommand` must be `""`** (skip build) — do **not** set `npm run build` even as a no-op.

**Do not** add `startCommand`, `processes`, or `outputDirectory` to `vercel.json` when v0 schema rejects them. Start = `package.json` `"start": "tsx server.ts"`. Output Directory = **empty in dashboard**. Build Command = **empty in dashboard**.

**Also force Project Settings (dashboard or Vercel API) — this is mandatory (see Scheme A4):**

| Setting | Required value |
|---------|----------------|
| Framework Preset | **Other** / null — **not Next.js** |
| Install Command | `npm install` (or pnpm/yarn) |
| **Build Command** | **empty / skip** — **not** `npm run build` |
| Output Directory | **empty / null** — **NOT `public`** |
| Start Command | `npm run start` — `tsx server.ts` (or `.mts`) — set in **dashboard**, not `vercel.json` |
| Fluid compute | **On** |

If `next` / `next.config.*` exist for Preview and the dashboard still auto-selects Next.js:

1. Patch Framework Preset to **Other** via API/CLI/dashboard.
2. Redeploy.
3. Hit Production `GET /status` ??must be **JSON**, not HTML.
4. Hit Production `GET /` ??must be Control Panel HTML, not `404: NOT_FOUND`.

If Vercel?s UI and this file disagree on bundling, **prefer whatever keeps a single long-lived Node HTTP server with WebSocket upgrade on `/` for Production**. Document the adaptation in the final summary.

### WebSocket / multi-instance note

- Device sockets are pinned to **one** function/instance. TomorrowOS device maps are **in-memory**.
- For large fleets on multi-instance Vercel, prefer **one stable instance / region**, or accept that reconnects may land on another instance until the product adds shared presence (out of scope for this setup).
- Always use **Postgres** (Supabase or Neon) so pairings/playlists survive cold starts and deploys.
- **Pair TVs to the Production HTTPS origin**, not the v0 Preview URL.

### What not to create

- ??`.replit`, `.replit-artifact`
- ??Next.js as the **Production** CMS (App Router replacing TomorrowOS)
- ??Root `api/` catch-all exporting raw `http.Server` to ?fix??Publish 404
- ??Separate ?API project??without the Control Panel
- ??Committing database passwords, Cloudinary secrets, or Blob tokens

---

## Question 1 ? Database (always)

> **Do not** ask screen counts. Present both options; recommend **Supabase** for Vercel fleets.  
> **After the user picks a database:** collect the URL if needed, then **you** set `TOMORROWOS_STORE` + `DATABASE_SSL` (see mapping below). The customer must **never** be asked to type those two names or values.  
> **Forbidden:** offering SQLite as a user-facing Q1 choice (ephemeral filesystem on Vercel).

### Agent-owned env mapping (mandatory)

| User chose | You set (silently) | User only provides |
|------------|--------------------|--------------------|
| 1 Supabase | `TOMORROWOS_STORE=supabase`, `DATABASE_SSL=true` | `SUPABASE_URL` (pooler string) |
| 2 Neon | `TOMORROWOS_STORE=postgres`, `DATABASE_SSL=true` | `DATABASE_URL` (pooled string) |

If you open an Env configuration UI for Q1, fields visible to the user may include **only** `SUPABASE_URL` or `DATABASE_URL`. **Do not** show blank `TOMORROWOS_STORE` / `DATABASE_SSL` inputs ? write those yourself in the same step.

### Step A — Ask database choice (**clickable UI required**)

**UX:** Open a **choice UI** the user can **click** — two option buttons / radio cards / select list. Labels must match the verbatim options below. Same clickable pattern as Q2.

| # | Exact option label (UI) |
|---|-------------------------|
| 1 | **Supabase Postgres (recommended)** |
| 2 | **Neon Postgres** |

Supporting copy under each option may match `VERCEL_QUESTIONS.md`. **Do not** default to a chat message that only says “Reply with 1 or 2” when the platform can render choices.

**Ask exactly (wording / option text must match):**

> Which database should TomorrowOS use on Vercel?
>
> **1. Supabase Postgres (recommended)** — durable pairing/playlists; use the **Session pooler** URL (`*.pooler.supabase.com:6543`).
>
> **2. Neon Postgres** — serverless Postgres native to Vercel; use Neon's **pooled** connection string from the Neon dashboard (not the direct un-pooled host for serverless).

**Fallback only** (no choice UI available): allow chat reply **1** / **2** / "Supabase" / "Neon".

### Step B ??If **1 / Supabase**

**Ask exactly (connection string only ??not TOMORROWOS_STORE / DATABASE_SSL):**

> Paste your Supabase Postgres connection string. I will store it as **`SUPABASE_URL`**. I will set **`TOMORROWOS_STORE`** and **`DATABASE_SSL`** for you automatically.
>
> In Supabase: **Project Settings ??Database ??Connection string ??Connection pooling** (Session mode).  
> Preferred shape:  
> `postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
>
> **Do not** use the direct host `db.*.supabase.co:5432` for Vercel.

**You must then (automatic ??do NOT ask the user to type store/ssl vars):**

1. Set Vercel Env Vars in one step:
   - `SUPABASE_URL=<user pooler string>` ??from user
   - `TOMORROWOS_STORE=supabase` ??**you set; never ask**
   - `DATABASE_SSL=true` ??**you set; never ask**
2. Wire `cms-app.ts` / `server.ts` store as in **Runtime & Vercel deploy rules**.
3. Optional committed `.env.example` with **placeholders only**.
4. **Do not** commit the real connection string.
5. **Do not** open a form whose blank fields include `TOMORROWOS_STORE` or `DATABASE_SSL`.

### Step C ??If **2 / Neon**

**Ask exactly (connection string only):**

> Paste your **Neon pooled** Postgres connection string. I will store it as **`DATABASE_URL`**. I will set **`TOMORROWOS_STORE`** and **`DATABASE_SSL`** for you automatically.
>
> In Neon: **Dashboard ??Connection details ??Pooled connection**.  
> Typical shape:  
> `postgresql://[user]:[password]@[endpoint]-pooler.[region].aws.neon.tech/[dbname]?sslmode=require`

**You must then (automatic):**

1. Set Vercel Env Vars:
   - `DATABASE_URL=<user pooled string>` ??from user
   - `TOMORROWOS_STORE=postgres` ??**you set; never ask**
   - `DATABASE_SSL=true` ??**you set; never ask**
2. Wire `createTomorrowOSStore` for Postgres.
3. **Do not** commit the real connection string.
4. **Do not** ask the user to fill `TOMORROWOS_STORE` or `DATABASE_SSL` in chat or Env UI.
5. If you see `ENETUNREACH` on `:5432`, switch to Neon's **pooled** URL.

**Later in Question 3:** set `cms.hostingTarget` to **`"vercel"`** (all Q1 branches).

---

## Question 2 ??Media storage

> **This question is only about media files (images/videos).**  
> It is **not** about OpenAI, AI pairing, or LLM keys. If you are about to ask for an `sk-` key, **stop** ??you are off-protocol.  
> **Copy the two options below verbatim.** Wrong examples that must **never** appear: "Vercel Blob (recommended)", "Supabase Storage", "No media storage / disable uploads", "local disk only".

### Step A — Ask storage choice (**clickable UI required — same as Q1**)

**UX:** Open a **choice UI** the user can **click** — two option buttons / radio cards. **Forbidden when UI exists:** chat-only “Reply with **1** or **2**”.

| # | Exact option label (UI) |
|---|-------------------------|
| 1 | **Cloudinary (recommended)** |
| 2 | **Vercel Blob** |

**Ask exactly (wording must match — Cloudinary is recommended):**

> How should playlist media (images/videos) be stored?
>
> **1. Cloudinary (recommended)** — durable public HTTPS URLs (`https://res.cloudinary.com/...`). Works out of the box with `@tomorrowos/sdk` auto-detection. **Prefer this on Vercel.**
>
> **2. Vercel Blob** — Vercel-native object storage; durable `https://*.public.blob.vercel-storage.com/...` URLs. Use when you want media on the same Vercel project without a Cloudinary account.

**Fallback only** (no choice UI): chat reply **1** / **2** / "Cloudinary" / "Vercel Blob".

If you catch yourself about to offer Blob-as-recommended, Supabase Storage, local disk, or "no media" — **stop and use the block above instead**.

### Step B ??If **1 / Cloudinary** (same Question 2 ??**one Env popup**)

> **Critical UX rule:** Immediately open the **Vercel Environment Variables configuration popup / form** with **all Cloudinary fields in one UI**. Do **not** ask for cloud name, then key, then secret in separate chat messages.

**Preferred:** Vercel Env Vars UI (or Agent secrets form) with these fields together:

| Field | Env name | Required |
|-------|----------|----------|
| Cloud name | `CLOUDINARY_CLOUD_NAME` | Yes |
| API Key | `CLOUDINARY_API_KEY` | Yes |
| API Secret | `CLOUDINARY_API_SECRET` | Yes |
| Folder (optional) | `CLOUDINARY_FOLDER` | No (e.g. `tomorrowos`) |

**If a multi-field popup is unavailable, ask once in a single message** (still not three turns):

> Paste Cloudinary credentials from [cloudinary.com/console](https://cloudinary.com/console) (I will store them as Vercel Env Vars):
>
> 1. `CLOUDINARY_CLOUD_NAME`
> 2. `CLOUDINARY_API_KEY`
> 3. `CLOUDINARY_API_SECRET`
> 4. optional `CLOUDINARY_FOLDER`

**You must then:**

1. Save all three required Env Vars for Production + Preview + Development as appropriate.
2. **Do not** invent placeholders.
3. **Do not** proceed to Question 3 until all three required vars exist.
4. **Do not** run a formal Cloudinary upload test unless the user asks.

The SDK auto-detects these env vars.

### Step C - If **2 / Vercel Blob** (same Question 2)

**Ask exactly:**

> I will enable **Vercel Blob** for media uploads.
>
> 1. In the Vercel project: **Storage ? Create ? Blob** (or link an existing Blob store to this project).
> 2. Confirm **`BLOB_READ_WRITE_TOKEN`** is available (Vercel usually injects it when Blob is linked).
>
> Paste the token only if it is not already set in your project Env Vars. Do you already have Blob linked on this Vercel project? (yes / no)

**You must then:**

1. Set Vercel Env Var: `BLOB_READ_WRITE_TOKEN=<token>` (if not auto-injected). Prefer the Env popup when available.
2. Set Vercel Env Var yourself (agent-owned): `TOMORROWOS_MEDIA=vercel-blob`. **Do not** ask the user to type this.
3. Ensure `@tomorrowos/sdk@0.9.70+` is installed (`@vercel/blob` is a transitive dependency ? no project-level Blob bridge / custom `put()` middleware).
4. The SDK **natively** uploads via Vercel Blob when the token is present (same HTTP routes as local: `/media/upload` and chunked complete). Returned asset URLs are absolute `https://*.public.blob.vercel-storage.com/...`.
5. Confirm Control Panel **Media Server** shows provider **Blob** (not Local). Do **not** invent status copy about "Blob bridge" or paste the URL pattern as a status detail.
6. Do **not** proceed to Question 3 until `BLOB_READ_WRITE_TOKEN` exists (or Blob is linked and token is confirmed in the Vercel dashboard).

**Forbidden for Q2=Blob:** scaffolding a custom "Blob bridge", writing status text like "uploads persist to durable https://*.public.blob.vercel-storage.com/ URLs via the Blob bridge", or leaving uploads on local `cms-panel/uploads`.
---

## Question 3 - Brand form (`brand.json` only; **not a choice question**; **must wait**)

> Updates **only** `brand.json`. Does **not** change Vercel project settings, Env Vars, `vercel.json`, or `server.ts` store wiring beyond what Q1-Q2 already required.
>
> **IRON RULE - form, not question; show then WAIT:** As soon as Q2 is done, **open the brand form**. Do **not** ask a choice first. Show **all seven optional fields on one screen at the same time**. Then **HARD STOP** until the user submits the form, replies with values, or says **"skip"**.
>
> **Optional fields ? optional step.** Leaving a field blank keeps the starter default **after the user responds**. It does **not** authorize you to skip waiting or auto-apply defaults in the same turn.
>
> - **Forbidden:** any preliminary question ("customize branding?", "skip or set brand?", Option A/B)
> - **Forbidden:** multiple-choice / radio / "reply 1 or 2" for branding
> - **Forbidden:** showing only Product Name + Primary colour (or any subset under 7)
> - **Forbidden:** field-by-field Next wizard (name -> wait -> tagline -> ...)
> - **Forbidden:** one freeform / Other box for all brand values
> - **Forbidden:** auto-continuing to init / scaffold / env / deploy because "fields are optional" or "I shouldn't re-ask"
> - **Required:** six text inputs + Logo Upload above Logo URL, all visible together
> - **Required:** wait for one user action (submit / values / "skip") before scaffolding continues
>
> **Self-check:** If the UI you are about to show has fewer than six text fields for name/tagline/four colours, **abort and rebuild** - that UI is off-protocol.
>
> **Every field is optional** once the form is shown. After the user submits (including all-blank) or says "skip": keep starter **`brand.json`** for blanks; **do not** re-ask Q3 a second time. **Do not** invent a second branding prompt.
>
> Without `CMS_PASSWORD`, the Control Panel has **no login**. Do **not** invent custom login/auth. Optional **Question 4** may set Env `CMS_PASSWORD` for Control Panel auth only (never Vercel Deployment Protection / whole-site password).

### Preferred UI (open immediately - all seven at once - then wait)

Open **one** dialog titled **Brand your TomorrowOS experience**. Render **each row as its own control**. All rows must appear **together** on first paint - not revealed after a choice, not after filling a previous field. After opening, **end your turn** and wait.

| # | Exact label | Control type | Blank default |
|---|-------------|--------------|---------------|
| 1 | **Product Name** | text input | existing `brand.json` `name` (e.g. `My Venue`) |
| 2 | **Tagline** | text input | existing tagline (e.g. `Digital signage`) |
| 3 | **Primary colour** | text input (hex) | e.g. `#FF8A3D` |
| 4 | **Background colour** | text input (hex) | e.g. `#FAFAF9` |
| 5 | **Text colour** | text input (hex) | e.g. `#0A0908` |
| 6 | **Secondary colour** | text input (hex) | e.g. `#F5F3EF` |
| 7 | **Logo** | **Upload** (SVG/PNG file picker) **above** **Logo URL** (text input) | keep `./assets/logo.svg` |

Helper text: *All fields optional. Leave blank to keep starter brand.json defaults. Submit once, or reply "skip". I will wait before continuing setup.*

**Logo UX:** Upload control directly above Logo URL. Either is fine; if both provided, prefer the uploaded file.

### If a form UI is unavailable - one chat message only (still wait)

Only when the platform **cannot** render multi-field forms. Do **not** ask a choice first. Send **exactly one** message listing all seven fields, then **end your turn and wait** (user may answer partially, attach a logo, or say "skip"):

> Brand your TomorrowOS experience (**all optional - reply once**). Leave any field blank to keep starter `brand.json` defaults. I will wait for your reply before scaffolding:
>
> 1. **Product Name**
> 2. **Tagline**
> 3. **Primary colour** (hex)
> 4. **Background colour** (hex)
> 5. **Text colour** (hex)
> 6. **Secondary colour** (hex)
> 7. **Logo** - attach SVG/PNG or paste a Logo URL
>
> Or reply **skip** to keep all defaults.

### After the user submits

**You must:**

1. For each blank field, **keep the existing starter `brand.json` value** - do not invent new colours/names.
2. For filled fields, write them into `brand.json` only.
3. If Logo is a URL: fetch into `./assets/logo.png` or `./assets/logo.svg` when possible and set `logoPath`; if fetch fails, keep existing `logoPath` and note it.
4. If Logo is an upload: save under `./assets/` and set `logoPath` (prefer upload over URL when both are present).
5. Always set **`cms.hostingTarget`: `"vercel"`** without asking.
6. Default `cms.expectedScreens` to `5` unless the user already volunteered a number.
7. Show a one-line summary (name + primary hex + logo path) - **do not** ask a second branding question.
8. **Do not** build login, signup, OAuth, or clone a marketing site from branding answers.

### Write `brand.json`

Validate mentally against `brand.schema.json`. Minimum shape (values = user input **or** existing defaults):

```json
{
  "name": "<Product Name or existing brand.json name>",
  "tagline": "<Tagline or existing>",
  "targetPlatforms": ["tizen"],
  "primaryColor": "#FF8A3D",
  "secondaryColor": "#F5F3EF",
  "backgroundColor": "#FAFAF9",
  "textColor": "#0A0908",
  "logoPath": "./assets/logo.svg",
  "fontFamily": "Inter",
  "cms": {
    "useCase": "other",
    "hostingTarget": "vercel",
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

Set `cmsEndpoint` only if they already know the public `https://?vercel.app` URL; otherwise tell them to pair TVs with the **Published** HTTPS origin (player maps `https://` ? `wss://`).

---

## Question 4 — Optional CMS password (`CMS_PASSWORD`)

> **Optional.** Protect the Control Panel with app-level auth. You may **skip** and set Env Var `CMS_PASSWORD` later (then Redeploy).

> **IRON RULE — no prelude:** As soon as Q3 is submitted/skipped, open **this** step next. Do **not** first ask whether they want a password / auth / lock. Open the password Env/Secret field (or one chat prompt) immediately; blank/skip is a complete Q4 answer.

**UX (required):** Open **one** Env/Secret input labeled **`CMS_PASSWORD`** (password field). User may enter a password **or** leave blank / skip.

**Ask (Env input — preferred — or one chat reply):**

> Optional CMS password — Environment Variable **`CMS_PASSWORD`**.
>
> Enter a password to lock the Control Panel, or leave blank / skip to keep the panel open. You can add `CMS_PASSWORD` later in Vercel → Settings → Environment Variables and redeploy.

**Forbidden before / instead of this input:**
- "Do you want to protect the CMS?"
- "Add a password?" / "Enable auth?"
- Option A/B or yes/no for password first

**Why:**
- Locks the **CMS Control Panel only** (not the whole deployment).
- Devices still reach WebSocket / brand / uploads without that password.
- Safer than Vercel **Deployment Protection** / whole-site password (those break Tizen/BrightSign).
- Leaving it blank is fine; add `CMS_PASSWORD` later when you want the login page.

**Accept:**
- blank / skip / "later" / "no" → do **not** set `CMS_PASSWORD`
- any non-empty password → set Vercel Env **`CMS_PASSWORD`** (Production + Preview as needed)

**Reject / clarify:**
- Do **not** enable Vercel Deployment Protection / whole-site password for device reachability.
- Do **not** put the password in committed source.

---

## After all answers — execution checklist

### A0. IRON GATE first (mandatory)

Complete **IRON GATE — v0 Preview hygiene** before long Postgres/media debugging:

1. Prove `GET /status` is TomorrowOS JSON (or clear root Next + restart supervised `dev` until it is).
2. Remove root `app/` / `next.config.*` leftovers; keep `preview/` only for the proxy shell.
3. Do not spawn a second manual server that lacks injected env / fights `:3000`.
4. Only then treat Database/Media connector errors as real.

### A. Seed the project

```bash
npx @tomorrowos/sdk@latest init . --hosting v0
# If not empty and user confirms starter overwrite:
# npx @tomorrowos/sdk@latest init . --hosting v0 --force
```

Then (**Scheme A — mandatory for Publish**):

1. Keep **`server.ts`** at **project root** with top-level `listen()` + `export default server`.
2. **Immediately** move leftover v0 Next from root into **`preview/`** or delete root Next files (`next.config.*`, `app/`, Next `tsconfig` / `postcss` / `next-env.d.ts`, starter `components/`). Production must not see root Next.
3. Write `vercel.json` per **Scheme A3** (`fluid`, `framework: null`, `"buildCommand": ""` — **no** `startCommand`, **no** no-op `npm run build`).
4. **Force Project Settings** per **Scheme A4** (Framework = Other, Output Directory **empty/unset**, Build Command **empty**, Start = `npm run start`, Fluid on). Patch dashboard via API if it still says Next.js, Output = `public`, **or** Build = `npm run build`.
4a. **Pre-Publish build/output check:** If build fails with `Output Directory "public" is empty` / not found: clear Output Directory **and** set Build Command / `buildCommand` to **`""`**. Do **not** add `public/robots.txt`. Do **not** keep a no-op build command.
5. Do **not** add root `api/` catch-all for raw `http.Server`.
6. Do **not** add `.replit*`.
7. If Q2 = Vercel Blob: set `BLOB_READ_WRITE_TOKEN` + `TOMORROWOS_MEDIA=vercel-blob` (SDK-native; no custom bridge).
8. **Restart** the platform-supervised Preview `dev` after script/layout changes (stale `next-server` is the #1 false “DB failure”).
### B. Environment Variables (Vercel dashboard + local)

| Name | Required | Who fills it |
|------|----------|--------------|
| `SUPABASE_URL` | If Q1 = Supabase | User pastes URL |
| `DATABASE_URL` | If Q1 = Neon | User pastes URL |
| `TOMORROWOS_STORE` | Yes | **Agent auto-sets only** ? never a blank field for the user (`supabase` / `postgres`) |
| `DATABASE_SSL` | Yes for Postgres | **Agent auto-sets only** ??never a blank field for the user (`true`) |
| `CLOUDINARY_*` | If Q2 = Cloudinary | User via **one Env popup** (all fields) |
| `BLOB_READ_WRITE_TOKEN` | If Q2 = Vercel Blob | User / Blob link |
| `TOMORROWOS_MEDIA` | If Q2 = Vercel Blob | **Agent auto-sets** `vercel-blob` |
| `TOMORROWOS_INTERNAL_PORT` | Preview only | Agent (e.g. `3001`) |
| `PORT` | Optional | Vercel injects for Production |
| `CMS_PASSWORD` | Optional (Q4) | User if set; blank/skip = omit (can add later) |

Mirror non-secrets in `.env` for local `npm run start` if helpful; never commit secrets.  
On v0 Preview, secrets may exist only in **`.env.development.local`** / supervised env — see **Env loading trap**. Do not “fix Neon” until the process that serves `/status` actually has `DATABASE_URL` / `SUPABASE_URL`.

### C. Install and run

```bash
npm install
npm run start
# Preview / v0 when Next-hardwired: npm run dev:preview  (Next :3000 + TomorrowOS :3001)
# After changing package.json "dev": restart the supervised process — do not leave stale next-server on :3000
```

Confirm logs: `[TomorrowOS] listening on http://0.0.0.0:?`  
Confirm browser:

- **Preview:** Control Panel visible through the Next proxy at `/`
- **Production start:** Control Panel served directly by TomorrowOS at `/`

### D. Deploy (Publish ??Node only)

```bash
vercel --prod
# or git push ??Vercel Git integration
```

**Publish acceptance checklist (all must pass ??Scheme A5):**

1. Framework Preset = **Other** / null (dashboard confirms — not Next.js)
2. Output Directory = **empty** (not `public`)
2a. Build Command = **empty** (`"buildCommand": ""` — not `npm run build`)
3. Start Command = Node `TomorrowOS.listen` (`npm run start` / `tsx server.ts`)
4. Fluid compute on
5. Env Vars present for Production
6. Production `GET /status` returns **JSON** — **not** HTML (`Unexpected token 'T'` means this failed)
7. Production `GET /` returns Control Panel HTML — **not** `404: NOT_FOUND`

If step 6 fails but step 7 passes: **static `public/` trap** — Vercel is not running Node. Re-apply Scheme A3–A4; try **Path B** (Git / `vercel --prod`); do **not** invent `api/` + `rewrites`.

Tell the user:

- **Control Panel (Publish):** `https://YOUR-PROJECT.vercel.app`
- **TV CMS endpoint:** same HTTPS origin (players use `wss://`)
- **Preview:** Next shell is for v0 only — do not pair devices to Preview

Then **you must tell the user how to install a player and pair**. Do **not** only link a file — spell out the steps:

#### Samsung Tizen (6.5 and 7.0)

1. On the display, open **App Management** → install via **Custom App** URL:

   ```txt
   https://tmr.sh/tizen
   ```

   Or use Control Panel → **Download Players → Samsung** and install via USB.
2. Choose orientation, then enter the **Production** CMS URL: `https://YOUR-PROJECT.vercel.app/` (never Preview, never `localhost`).
3. Enter the **six-character** pairing code in Control Panel → **Pair**.

#### BrightSign (Series 3-6)

1. On the **Production** Control Panel → **Download Players → BrightSign** (preferred — `cmsEndpoint` is filled for this CMS),  
   or download `https://tmr.sh/app/brightsign/brightsign_package.zip` and set `cmsEndpoint` in `config.js` to `https://YOUR-PROJECT.vercel.app/`.
2. Unzip and copy the **contents** to the SD card root (`autorun.brs`, `config.js`, player files).
3. Power-cycle the player, wait ~10s through the black boot window, then pair with the six-character code.

4. Create a playlist, upload media, **Publish** to the device.

More detail: https://docs.tomorrowos.org/docs/os/tizen and https://docs.tomorrowos.org/docs/os/brightsign

### E. Minimal verification only

**Do:**

1. Preview: Control Panel HTML at `/` (via Next proxy in `preview/` if applicable)
2. Publish: `GET /status` ??JSON; `GET /` ??Control Panel from **Node** TomorrowOS
3. Publish: panel does **not** show `Unexpected token 'T'` / CMS unreachable
4. Server status: Media OK when Cloudinary or Blob configured
5. Database: if ERROR shows **`ENETUNREACH` ??IPv6 ??`:5432`**, switch to **pooled** URL (Supabase `:6543` or Neon pooler) and redeploy ??call this out explicitly to the user
6. Fluid compute on for Production

**Do not block** on long WebSocket/device pairing tests unless the user asks. Prefer pairing against **Publish**, not Preview.

---

## Failure recovery cheat sheet

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Build: `Output Directory "public" is empty` / public not found | (1) Output Directory = `public`, **or** (2) Output null but **Build Command defined** → static-build mode | Clear Output; set `"buildCommand": ""` + dashboard Build empty; Fluid `api/index.ts`. Do **not** primary-fix with `public/robots.txt` or keep no-op `npm run build` |
| Agent asked Q2 as chat “type 1 or 2” while choice UI available | Off-protocol Q2 UX | Re-ask Q2 with **clickable** Cloudinary / Vercel Blob options (same pattern as Q1) |
| Agent asked yes/no “want a CMS password?” before Q4 | Off-protocol Q4 UX | After Q3, open **CMS_PASSWORD** Env input immediately (blank/skip OK) |
| Preview 500 / Turbopack / `ENOENT .../app` after Q1–Q3 | Leftover **root** Next from v0 starter; not Neon/Blob | **IRON GATE:** delete/move root `app/` + `next.config.*`; keep `preview/`; restart supervised `dev`; prove `/status` JSON |
| `Internal Server Error` + logs blame missing `DATABASE_URL` in a **manual** Bash server | `dotenv` loaded `.env` only; secret is in `.env.development.local` / supervised env | Restart **supervised** Preview process; or load both env files — do **not** immediately change Neon URL |
| `EADDRINUSE :3000` while debugging | Second `pnpm dev` / stale `next-server` after script rewrite | Kill stale Next/tsx; one process; let supervisor re-exec new `"dev"` |
| Preview still Next after `package.json` `"dev"` → `tsx` | Supervised process never restarted | Kill old tree; wait for supervisor / restart Preview |
| Agent spent many turns on Postgres before `/status` JSON | Skipped IRON GATE | Stop; run hygiene steps 1–5; only then debug store |
| Q1=Neon / Q2=Blob then long Preview outage | Usually **not** the product choice | Same as root-Next / env-injection failures; choices are valid |
| Publish `404: NOT_FOUND` | Framework Preset still **Next.js** / no Function | Scheme A: Framework = **Other**, Fluid on, `api/index.ts` + rewrites; redeploy |
| Panel loads but **CMS unreachable** / `Unexpected token 'T', "The page c"...` | **`public/` deployed as static site** ??no Function | Rename to `cms-panel/`; Output empty; Scheme A Function entry; **Path B** if needed |
| Only `/api/status` returns JSON, `/status` is 404 | Missing **rewrites** to `/api` | Add Scheme A3 rewrite `/(.*) ??/api` (exclude existing `/api/`); redeploy |
| Control Panel OK, TV **could not connect** | WebSocket upgrade not reaching Function (200 HTML) | Fluid on; `export default server`; verify 101 on `/` and `/api`; check WebSockets permission |
| `vercel.json` error: invalid `startCommand` | v0 schema rejects it | Remove from `vercel.json`; Function entry does not need startCommand |
| Separate `api/ws.ts` with a second `new TomorrowOS` | Two isolates ??pairing memory split | **One** Function only (`api/index.ts` ??shared `cms-app.ts`) |
| `vercel inspect` shows Output = `public if it exists` | Framework=Other static default | Force Output Directory **empty**; use `cms-panel/`; Path B redeploy |
| Build runs `next build` / missing routes-manifest | Next auto-detected from root `next.config` / `app/` | Move Next to `preview/`; Framework null/Other; `"buildCommand": ""` |
| Preview blank but logs show TomorrowOS listening | v0 Next intercepts public port | Add Next reverse proxy ??internal TomorrowOS port |
| Preview works, Publish broken / Next-only | Production still on Next | Switch Production to Fluid Function `api/index.ts` |
| `ENETUNREACH` / IPv6 / `:5432` | Direct Postgres URL | Use **pooled** URL (Supabase `:6543` or Neon pooler) |
| Control Panel OK, devices never stay paired after restart | SQLite / ephemeral disk | Use Supabase or Neon |
| Uploads break / broken thumbs in prod | Local uploads only | Cloudinary or Vercel Blob |
| Blob uploads 401 / missing token | Blob not linked | Vercel Storage ??Blob + `BLOB_READ_WRITE_TOKEN` |
| WebSocket fails on Publish | Fluid off / static-only / Next as Production / no Function WS | Enable Fluid; Scheme A; test 101 upgrade |
| Devices fail only on Preview | Next proxy cannot upgrade `wss` | Expected ??pair on Publish URL |
| Agent asked user to fill `TOMORROWOS_STORE` / `DATABASE_SSL` | Off-protocol | Agent must auto-set after DB choice; remove those fields from user Env forms |
| Agent offered Blob-as-recommended / Supabase Storage / local disk / "no media" for Q2 | Invented options | Re-ask Q2 verbatim: **1 Cloudinary (recommended)**, 2 Vercel Blob |
| Agent asked Cloudinary key/secret in three chat turns | Off-protocol | Use **one Env popup** with all Cloudinary fields |
| Agent asked for OpenAI / `sk-` key during setup | Hallucinated ?AI pairing??requirement | **Refuse.** TomorrowOS does not need LLM keys. Return to Q2 media choices only |
| Agent asked a branding choice / Option A-B / "customize?" before the form | Off-protocol Q3 | Close it; immediately open the **7-field form** (no choice step) |
| Agent showed only Name + Primary colour (or any subset) | Off-protocol Q3 | Rebuild with **all seven** inputs visible at once |
| Agent auto-continued after showing Q3 because "fields are optional" / "shouldn't re-ask" | Off-protocol Q3 | **HARD STOP** and wait for submit or explicit "skip"; do not scaffold yet |
| Agent asked branding as Option A URL vs Option B, or field-by-field Next | Off-protocol Q3 | Re-open Q3 as **seven separate optional inputs** in one dialog; blanks keep `brand.json` |
| Agent enabled Vercel Deployment Protection / whole-site password | Blocks Tizen/BrightSign | Disable host gate; use optional `CMS_PASSWORD` for Control Panel only |
| Agent built a login page from branding answers | Misread brand step as product scope | Remove login; keep starter Control Panel; apply answers only to `brand.json` |
| Secrets in git | Mistake | Rotate keys; move to Vercel Env Vars |
| Replit files present | Copied wrong protocol | Delete `.replit*`; use this file |

---

## How this differs from `REPLIT_SETUP.md`

| Topic | Replit | Vercel |
|-------|--------|--------|
| Secrets | Replit Secrets | Vercel Environment Variables |
| Deploy config | `.replit`, artifact `kind=web` | `vercel.json` + Fluid; **Framework = Other**; **no** `.replit` |
| `hostingTarget` | `"here"` | `"vercel"` |
| Database | Supabase (primary) | Supabase **or Neon** (pooled) |
| Media | Cloudinary or Replit Object Storage | Cloudinary **or Vercel Blob** |
| Preview | Replit Preview / Autoscale Node | **Next shell + proxy** when v0 hardwires Next |
| Publish | Long-lived Node | **Node `TomorrowOS.listen` only** (not Next); gate on no `404 NOT_FOUND` |
| Brand | Replit 7-field optional dialog | **Form not question:** all 7 optional inputs at once; no choice first; Logo Upload above Logo URL |

---

## Final summary template (Agent — human)

After setup, report:

1. **Live URL** (Production Publish)
2. **Publish health:** Framework = Other; Output — `public`; `GET /status` — JSON; `GET /` OK
3. **Preview note:** Next proxy shell used / not needed
4. **Env Vars set** (names only — never values); note which were auto-set (`TOMORROWOS_STORE`, `DATABASE_SSL`)
5. **Store:** Supabase pooler or Neon pooled
6. **Media:** Cloudinary or Vercel Blob
7. **Brand:** name + `hostingTarget: vercel` (from optional Q3 fields; blanks = starter defaults)
8. **CMS password:** set or skipped (yes/no only — never echo the password)
9. **Runtime split:** Preview = …; Publish = Node TomorrowOS (confirm **not** Next)
10. **Open action:** if Database still ERROR, paste the pooler instruction again
11. **Connect a screen:** include the Tizen Custom App URL / BrightSign SD install + six-character pairing steps from section **D. Deploy** above (required — do not skip)

Protocol complete when:

- **Preview** shows the Control Panel at `/` (via Next proxy if required), **and**
- **Publish** returns Control Panel at `/` **and** `/status` JSON from pure Node `TomorrowOS.listen` with Fluid (not static `public/`, not `404: NOT_FOUND`, not `Unexpected token 'T'`), **and**
- Q1–Q4 configuration is saved, **and**
- the user has been told how to install Tizen and/or BrightSign and pair

? even if a sandbox DB probe still flakes **after** the pooled URL is correctly set for Production.

---

## Protocol version

`vercel-setup/1.19` - pairs with `@tomorrowos/sdk` 0.9.70+ and `VERCEL_QUESTIONS.md` 1.8.

**Changelog 1.19:** Publish Build Command must be **empty** (`"buildCommand": ""`) — a defined no-op `npm run build` forces Vercel static-build mode and the `public/` output check (empty → “not found” after deleting `public/`). Q4 opens **immediately after Q3** as the `CMS_PASSWORD` Env input with **no** yes/no password prelude.

**Changelog 1.18:** Q1/Q2 must use **clickable choice UI** (not chat “type 1 or 2” when UI exists). Publish build error `Output Directory "public" is empty` → **clear Output Directory** (forbidden primary fix: stuff `public/robots.txt` while Output stays `public`). Strengthens static-output trap docs.

**Changelog 1.17:** After Q&A, agents **must** run **IRON GATE — v0 Preview hygiene** before DB rabbit holes: clear root Next leftovers, restart supervised `dev`, prove `GET /status` is TomorrowOS JSON. Documents `.env` vs `.env.development.local` / supervised-env trap. Preview decision tree + cheat-sheet rows for Turbopack/`ENOENT`, missing `DATABASE_URL` in manual Bash, `EADDRINUSE`, stale `next-server`. Neon/Blob choices are not the usual Preview failure cause.

**Changelog 1.16:** Question 4 is optional Control Panel Env `CMS_PASSWORD` (blank/skip allowed; can set later). Do not use Vercel Deployment Protection / whole-site password for devices.

**Changelog 1.15:** After Publish is healthy, agents **must** tell the user how to install Tizen (Custom App `https://tmr.sh/tizen`) and BrightSign (CMS zip → SD root) and pair against the **Production** URL. Final summary requires this screen-connect step.

**Changelog 1.14:** Vercel Blob is **SDK-native** (`BLOB_READ_WRITE_TOKEN` + `TOMORROWOS_MEDIA=vercel-blob`). No project Blob bridge. Status providers use display names (Neon, Supabase, Blob, Cloudinary, Replit Object Storage). Forbidden marketing status copy about blob URL patterns.

**Changelog 1.13:** Q3 must **HARD STOP and WAIT** for user submit or "skip". Optional fields do **not** authorize auto-continuing with defaults. Clarifies "do not re-ask" = after the user already replied, not "skip waiting".

**Changelog 1.12:** Q3 is a **form, not a question**. No preliminary branding choice. Must show **all seven** optional inputs at once (never only Name + Primary colour). Logo = Upload above Logo URL.

**Changelog 1.11:** Q3 must render **seven separate input controls** (not one freeform / Other box). Logo field = **Upload** above **Logo URL**; blanks keep starter `brand.json`.

**Changelog 1.10:** Q3 is a **single** seven-field optional branding dialog (Product Name, Tagline, Primary / Background / Text / Secondary colour, Logo URL or upload). Removed Option A website-URL vs Option B split. Blanks keep starter `brand.json`. Pairs with new `VERCEL_UPGRADE.md`.

