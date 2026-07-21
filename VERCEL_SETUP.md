# Vercel Setup Protocol for TomorrowOS CMS

> **This file is a contract for Vercel Agent / AI coding assistants setting up TomorrowOS on Vercel.**  
> Follow it literally. Ask questions in order. Do not invent secrets. Prefer configuring **Vercel Environment Variables**, `.env` (non-secrets only), `brand.json`, and `server.ts` store wiring over inventing a custom CMS.
>
> **On Vercel, this file is the setup questionnaire** (not `REPLIT_SETUP.md`, not `LLM_PROMPT.md`).
>
> Protocol id: `vercel-setup/1.9` ‚Ä?pairs with `@tomorrowos/sdk` **0.9.41+** (`templates/cms-starter-v0`, Fluid Functions WebSockets).
>
> **Questions source of truth:** `VERCEL_QUESTIONS.md` ‚Ä?Agents must **open that file and paste each Q block verbatim**. Do not paraphrase.  
> **Copy questions verbatim from `VERCEL_QUESTIONS.md`.** Do not invent alternate Q2 options (no ‚ÄúSupabase Storage‚Ä? no S3, no ‚Äúdisable media‚Ä? no making Blob the recommended option).  
> **`TOMORROWOS_STORE` and `DATABASE_SSL` are agent-only** ‚Ä?set them automatically after Q1; never put them in a user-facing Env form for the customer to type.

## NON-NEGOTIABLE VERCEL RUNTIME CONTRACT

The following rules are **mandatory acceptance criteria**, not suggestions. The Agent must preserve them throughout setup, Preview, Publish, fixes, and upgrades:

1. **One TomorrowOS instance only.** Use the shared instance exported through `api/index.ts`. **Never create a second `TomorrowOS` instance in `api/ws.ts`** or any other route.
2. **Never use `public/` as the Vercel Output Directory.** The dashboard Output Directory must be **empty / unset**. Serve the Control Panel at runtime from `cms-panel/` through TomorrowOS `staticRoot`.
3. **Preview may use Next only as an isolated reverse-proxy shell under `preview/`.** Preview must not replace TomorrowOS or determine the Production runtime.
4. **Publish must use the Fluid Function.** Production must run `api/index.ts` ‚Ü?the shared exported `http.Server`, with Fluid compute enabled. It must not use `next start`, a static export, or a bare `(req, res)` handler.
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
Follow @tomorrowos/sdk VERCEL_SETUP.md and set up my TomorrowOS CMS.
First open VERCEL_QUESTIONS.md. For Q1, Q2, Q3: paste each question block VERBATIM (character-for-character). Do not rephrase options.
Q2 must show Cloudinary (recommended) as option 1 ‚Ä?never Blob-as-recommended, never S3, never Supabase Storage.
After database choice, YOU set TOMORROWOS_STORE and DATABASE_SSL ‚Ä?do not ask me to fill those.
Do not use LLM_PROMPT.md or REPLIT_SETUP.md. No OpenAI/LLM API keys.
Apply the NON-NEGOTIABLE VERCEL RUNTIME CONTRACT exactly: one TomorrowOS instance; no public/ Output Directory; Preview Next only under preview/; Publish through the Fluid Function; verify /status JSON, / Control Panel, and WebSocket 101; pair devices only with the Production URL.
```

Alternate triggers:

- ‚ÄúSet up TomorrowOS on Vercel using VERCEL_SETUP.md‚Ä?
- ‚ÄúConfigure my TomorrowOS CMS (Vercel wizard)‚Ä?

When any of these fire, **ignore `REPLIT_SETUP.md` and `LLM_PROMPT.md`** for the Q&A phase (you may skim Replit docs only for shared SDK semantics).

---

## IRON RULE: Preview vs Publish (dual runtime)

> **This is the #1 deployability rule on Vercel. Non-negotiable.**

TomorrowOS CMS is **one Node process** that serves:

- Browser Control Panel at `GET /` (`public/` via `staticRoot`)
- Device **WebSocket** on the same origin (`https` ‚Ü?players use `wss`)

### Production / Publish ‚Ä?Node only (no Next.js)

| Required | Forbidden |
|----------|-----------|
| Single **Node HTTP server** entry (`tsx server.ts` / exported `http.Server` from `listen()`) | **Next.js as the Production CMS** (`next start`, Next App Router as the live app) |
| **Framework Preset = Other / `null`** (dashboard **and** project settings API) | Leaving Framework Preset as **Next.js** (causes `404: NOT_FOUND`) |
| **Fluid compute** enabled (needed for WebSockets on Vercel) | Classic short-lived serverless with no WebSocket / no Fluid |
| Durable store = **Postgres** (Supabase or Neon, pooled URL) | **SQLite / `data/*.db` as production store** on Vercel (ephemeral filesystem) |
| Media = **Cloudinary** or **Vercel Blob** (durable HTTPS URLs) | Relying on local `public/uploads` alone for production fleets |
| Env vars in **Vercel Project ‚Ü?Settings ‚Ü?Environment Variables** | Committing passwords / API secrets / `.env` with secrets |
| `cms.hostingTarget`: `"vercel"` in `brand.json` | Creating `.replit` / Replit artifact files |

**Publish / Production Deploy** must run **`TomorrowOS.listen(...)`** directly. Do **not** put Next.js in front of Production traffic.

### Publish `404: NOT_FOUND` ‚Ä?mandatory prevention (read before every deploy)

The production URL showing:

```text
404: NOT_FOUND
Code: NOT_FOUND
```

almost always means **Vercel still thinks this is a Next.js / static deploy**, not a Node TomorrowOS server.

**Before every Production deploy, you MUST verify all of the following:**

1. **Project ‚Ü?Settings ‚Ü?General ‚Ü?Framework Preset = Other** (or unset / null).  
   If it still says **Next.js**, patch it via Vercel API / CLI / dashboard **before** redeploying.  
   `"framework": null` in `vercel.json` alone is **not enough** if the dashboard still says Next.js.
2. **Install Command** = `npm install` / `pnpm install` / `yarn` (normal install).
3. **Build Command** = a **no-op that exits 0** (e.g. `node -e "process.exit(0)"` or `npm run build` where `build` is that no-op).  
   **Never** run `next build` for Production.
4. **Production entry** = Fluid **Vercel Function** `api/index.ts` that **`export default server`** from shared `cms-app.ts` (see [WebSockets docs](https://vercel.com/docs/functions/websockets)). Local `npm start` may still use root `server.ts`.
5. **Output Directory** = **empty / unset**. Do **not** set `outputDirectory: "."` as a fake static site.
6. **Do** use a single `api/index.ts` that exports the TomorrowOS `http.Server`. **Do not** create a second TomorrowOS in `api/ws.ts`, and **do not** use bare `(req, res)` handlers that drop upgrades.
7. If Preview needs Next, keep Next files **isolated** so Production auto-detect cannot latch onto them:
   - Prefer `preview/` (or similar) for `next.config.*`, `app/`, `pages/` used only by v0 Preview, **or**
   - Ensure Production Framework Preset is forced to **Other** and never runs `next` as the CMS.

**Setup is NOT complete** while Production `GET /` returns `404: NOT_FOUND` or WebSocket upgrade returns 200 HTML.

### Publish static trap ‚Ä?`public/` served without Node (read this)

A common **worse** failure mode than `404: NOT_FOUND`:

- `GET /` loads the Control Panel HTML (from static `public/index.html`)
- `GET /status`, `/devices`, etc. return **HTML** (Vercel 404 page)
- The panel shows **CMS unreachable** and console:  
  `Unexpected token 'T', "The page c"... is not valid JSON`

**Root cause:** Vercel deployed `public/` as a **static site** (Output Directory = `public` or Framework=Other default *‚Äúpublic if it exists‚Ä?). **No Function** is running TomorrowOS.

**Fix (Scheme A):** use `cms-panel/` (not `public/`), Fluid Function `api/index.ts` + rewrites, Output Directory empty. Static UI is served **at runtime** via `staticRoot` in `listen()`.

**Publish gate (mandatory):** after deploy, `GET /status` must return **JSON** starting with `{`, not HTML starting with `<` or `The page`. **And** WebSocket upgrade on `/` or `/api` must return **101**.

```bash
curl -s https://YOUR-PROJECT.vercel.app/status | head -c 80
# Expected: {"status":"success",...}
# Failure:  The page could not be found  OR  <!DOCTYPE html>
```

**Setup is NOT complete** while `/status` returns HTML, the panel shows the JSON parse error, or devices cannot open `wss://`.

### Preview (v0 / Vercel Agent sandbox) ‚Ä?Next.js shell allowed

v0 Preview is often a **Next.js runtime** hardwired to `next dev`. A raw `tsx server.ts` may listen successfully while Preview still shows a blank page, because the sandbox intercepts the public port with Next before requests reach TomorrowOS.

**For Preview only**, you **must** keep a thin Next.js host that **reverse-proxies** HTTP to TomorrowOS on an **internal** port.

| Preview requirement | Detail |
|---------------------|--------|
| Next.js remains the Preview host | Satisfies v0 / sandbox expectations |
| TomorrowOS on internal port | e.g. `TOMORROWOS_INTERNAL_PORT=3001` (not the public Preview port) |
| Transparent HTTP reverse proxy | Next route/middleware forwards `/` (and Control Panel paths) ‚Ü?`http://127.0.0.1:3001` |
| Start both processes in Preview | Next + `tsx server.ts` (or a `dev:preview` script that starts both) |

**Preview WebSocket note:** HTTP proxy is enough for Control Panel HTML/API smoke checks. Device `wss` pairing may not work through a Next proxy in Preview ‚Ä?that is acceptable. **Pair devices against the Production Publish URL**, not v0 Preview.

**Do not** replace TomorrowOS with a Next-only CMS. Next is a **Preview adapter**, not the product.

---

## Questionnaire scope (STRICT)

Ask **only** these questions, in **this exact order**. **Copy the ‚ÄúAsk exactly‚Ä?blocks verbatim** ‚Ä?do not paraphrase options.

| Step | Section | When |
|------|---------|------|
| 1 | **Question 1** ‚Ä?Database (Supabase ‚Ü?Neon ‚Ü?SQLite) | Always |
| 2 | **Question 2** ‚Ä?Media (**Cloudinary recommended** ‚Ü?Vercel Blob ‚Ü?local) | Always (after Q1) |
| 3 | **Question 3** ‚Ä?Brand / TomorrowOS look (`brand.json` only) | Always last |

**That is the complete list.** Do **not** ask how many screens / devices.

**Forbidden invented Question 2 options (never offer these in chat or UI):**

- ‚ù?‚ÄúVercel Blob **(recommended)**‚Ä?as option 1 ‚Ä?Blob is option **2**, not recommended over Cloudinary
- ‚ù?‚ÄúSupabase Storage‚Ä?/ S3 bucket / `SUPABASE_SERVICE_ROLE_KEY` for media
- ‚ù?‚ÄúNo media storage‚Ä?/ ‚Äúdisable media uploads‚Ä?/ ‚Äúremote URLs only‚Ä?as a numbered choice
- ‚ù?Any media list that does not start with **Cloudinary (recommended)**

**Forbidden Env UX after Question 1:**

- ‚ù?Showing the user empty fields for `TOMORROWOS_STORE` or `DATABASE_SSL` to fill
- ‚ù?Asking in chat ‚Äúwhat should TOMORROWOS_STORE be?‚Ä?
- ‚ú?After DB choice + URL paste: **you** write those two vars silently (see Q1 Steps B/C/D)

**Forbidden extra questions (never ask, even if the user skips a step):**

- ‚ù?OpenAI / Anthropic / Gemini / any LLM API key (`sk-‚Ä¶`, etc.)
- ‚ù?‚ÄúAI pairing‚Ä? ‚ÄúAI feature logic‚Ä? or inventing auth that needs an LLM key
- ‚ù?Asking the user to type `TOMORROWOS_STORE` or `DATABASE_SSL`
- ‚ù?Any secret not listed in Questions 1‚Ä? (DB URL, media credentials, brand)

TomorrowOS pairing and Control Panel logic live in `@tomorrowos/sdk`. They do **not** call OpenAI.

If the user **skips** a Question 2 option, do **not** invent a substitute question. Re-state Question 2 choices **verbatim**, or proceed with local uploads + warning ‚Ä?never pivot to LLM keys or Supabase Storage.

If the user says ‚Äújust set it up, don‚Äôt ask questions,‚Ä?respond:

> I need a few quick answers from VERCEL_SETUP.md (database ‚Ä?Supabase or Neon preferred ‚Ä?media storage with Cloudinary recommended, and branding). It takes about a minute and ensures the CMS works on Vercel.

Then ask **Question 1**.

---

## Hard rules

1. **Open `VERCEL_QUESTIONS.md` first.** Paste Q1 ‚Ü?configure ‚Ü?paste Q2 ‚Ü?configure ‚Ü?paste Q3. Never paraphrase question options. Never use `LLM_PROMPT.md` or `REPLIT_SETUP.md` as the questionnaire. **Never** ask for OpenAI or other LLM API keys.
2. **Question 2 options are fixed:** (1) Cloudinary **(recommended)**, (2) Vercel Blob, (3) local disk. Do not reorder; do not invent Supabase Storage / disable-uploads.
3. **Cloudinary:** open **one** Vercel Env popup with **all** Cloudinary fields together. Do **not** quiz one credential at a time.
4. **`TOMORROWOS_STORE` + `DATABASE_SSL` = agent-owned.** After Q1 choice (and URL if needed), set them yourself in Vercel Env Vars. **Never** include them as blank fields for the customer. Mapping: Supabase ‚Ü?`TOMORROWOS_STORE=supabase` + `DATABASE_SSL=true`; Neon ‚Ü?`TOMORROWOS_STORE=postgres` + `DATABASE_SSL=true`; SQLite ‚Ü?`TOMORROWOS_STORE=sqlite` (no `DATABASE_SSL` required).
5. **Do not invent** Cloudinary credentials, database URLs, Vercel Blob tokens, brand colours, **or LLM API keys**.
6. **Postgres env naming:** prefer **`SUPABASE_URL`** for Supabase; prefer **`DATABASE_URL`** for Neon.
7. **Always prefer pooled connection strings** (Supabase Session pooler **6543**; Neon pooled host).
8. **Prefer `npx @tomorrowos/sdk init --hosting v0`**. For Replit/Railway use default `init`. Do not rebuild pairing / WebSocket APIs.
9. **Never commit secrets.** Use Vercel Environment Variables.
10. **Skip Replit-only files.**
11. **SQLite is not a production store on Vercel.**
12. **Enable Fluid compute** for Production WebSockets.
13. **Production:** `api/index.ts` exports `http.Server` from `TomorrowOS.listen`. Not `next start`. No second TomorrowOS in `api/ws.ts`.
14. **Preview:** Next reverse-proxy shell when v0 is Next-hardwired.
15. After Q&A: **configure ‚Ü?install ‚Ü?deploy ‚Ü?minimal verify**.
16. **No inventing CMS login** from a branding URL.
17. **Skip ‚â?invent.** Stay on Q1‚ÄìQ3 only.
18. **Publish gate:** `/status` JSON + WebSocket 101; no static `public/` trap.

**Question order:** Q1 ‚Ü?(auto-set store env) ‚Ü?Q2 ‚Ü?Q3 ‚Ü?execution checklist.

---

## Scheme A ‚Ä?Vercel Functions + WebSockets (mandatory for Production)

> **Goal:** Preview may use Next + proxy; **Publish** runs TomorrowOS as a **Vercel Function** (`api/index.ts`) on **Fluid**, with WebSocket support per [Vercel WebSockets docs](https://vercel.com/docs/functions/websockets).  
> **Scope:** Layout + `vercel.json` + dashboard. Prefer `npx @tomorrowos/sdk init --hosting v0` (`cms-starter-v0`).  
> **Do not** break Replit/Railway: those keep using default `init` ‚Ü?`cms-starter` (root `server.ts` + `server.listen`, no `api/`).

### Why Scheme A exists

| Layer | Preview (v0) | Publish (Production) |
|-------|----------------|----------------------|
| Host | Next.js shell + HTTP proxy | **Vercel Function** `api/index.ts` ‚Ü?`export default server` |
| Static UI | Proxied from TomorrowOS | Served by **`staticRoot`** (`cms-panel/`) inside `listen()` ‚Ä?**not** Vercel Output Directory |
| WebSocket | Optional / may fail in Preview | **Required** ‚Ä?Fluid Function upgrade (`wss://` ‚Ü?`/` rewritten to `/api`, or direct `/api`) |
| Next files | Allowed under `preview/` | **Must not** live at project root |

**Root cause of ‚ÄúControl Panel works, TV cannot connect‚Ä?** HTTP can be served without WebSocket upgrades. Classic root-only `server.ts` / plain serverless handlers often return **200 HTML** on `Upgrade` instead of **101**. Official pattern is a Function that exports `http.Server` with `ws` attached ([docs](https://vercel.com/docs/functions/websockets)).

### A1 ‚Ä?Project layout (Agent must enforce)

**Production (Vercel / v0 starter):**

```
cms-app.ts         ‚Ü?shared TomorrowOS.listen + export const server
api/index.ts       ‚Ü?export { server as default } from "../cms-app.js"
server.ts          ‚Ü?local/Preview: same default export (npm start / internal port)
vercel.json        ‚Ü?fluid + rewrites + functions.maxDuration
package.json
brand.json
cms-panel/         ‚Ü?CMS static UI (NOT named public/ ‚Ä?avoids static-output trap)
preview/           ‚Ü?Next proxy for v0 Preview only
```

**Preview only ‚Ä?keep ALL Next under `preview/`:**

```
preview/
  next.config.mjs
  app/
  ‚Ä?
```

**Do NOT:**

- ‚ù?Leave `next.config.mjs` + `app/` at project root
- ‚ù?Set Output Directory to `public`, `cms-panel`, or `.`
- ‚ù?Create a **second** TomorrowOS instance in `api/ws.ts` (separate isolate = broken pairing memory)
- ‚ù?Use `(req, res) =>` serverless handlers that drop `upgrade`
- ‚ù?Put `startCommand` / `processes` in `vercel.json` (v0 schema rejects them)

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

- **Local / Railway-style:** `npm start` ‚Ü?`tsx server.ts` ‚Ü?SDK calls `server.listen` (no `VERCEL` env).
- **Vercel Production:** Function loads `api/index.ts`; SDK skips `listen` when `process.env.VERCEL` is set and Vercel owns the socket.

### A2 ‚Ä?Function entry (matches Vercel WebSockets docs)

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
- When `VERCEL` is set: **`autoListen` defaults to false** ‚Ä?do not bind a port yourself
- Pattern aligns with docs: create `http.Server`, attach `ws`, **`export default server`**

### A3 ‚Ä?`vercel.json` (Production)

```json
{
  "fluid": true,
  "framework": null,
  "installCommand": "npm install",
  "buildCommand": "npm run build",
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

**`maxDuration` plan limits:** Hobby / many default plans allow **1‚Ä?00** seconds. **800** requires a higher Vercel plan. Prefer **`300`** unless the account already allows more ‚Ä?otherwise Publish fails with *‚ÄúmaxDuration must be between 1 and 300‚Ä?upgrade your plan‚Ä?.

**Why rewrites:** Public URLs stay `https://app.vercel.app/` and `/status` while the Function mount is `/api`. Device `wss://app.vercel.app/` is rewritten to the same Function so one isolate handles HTTP + WS.

**v0 schema:** never add `startCommand` or `processes`.

**Critical:**

- `"fluid": true` is required for WebSockets
- **Do not** set `outputDirectory` to `cms-panel` / `public`
- `"buildCommand"` = no-op ‚Ä?**never** `next build` for Production
- Dashboard Output Directory must stay **empty**

### A4 ‚Ä?Vercel Project Settings (dashboard ‚Ä?mandatory)

| Setting | Required value |
|---------|----------------|
| Framework Preset | **Other** / null ‚Ä?**not Next.js** |
| Install Command | `npm install` |
| Build Command | `npm run build` (no-op) |
| **Output Directory** | **empty** |
| Fluid compute | **On** |
| WebSockets | Account must allow Functions WebSockets (see docs ‚ÄúPermissions Required‚Ä? |

### A5 ‚Ä?Publish acceptance (all must pass)

1. `curl -s https://PROD/status` ‚Ü?JSON (`{"status":...}`)
2. `curl -s https://PROD/` ‚Ü?Control Panel HTML
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

If (1)+(2) pass but (3) fails ‚Ü?Function is serving HTTP only. Re-check Fluid, `api/index.ts` default export, rewrites, and WebSockets permission. **Do not** invent a second `api/ws.ts` TomorrowOS instance.

### A6 ‚Ä?What Scheme A does **not** require

- ‚ù?No Next.js as Production CMS
- ‚ù?No replacing SDK transport with hand-rolled pairing
- ‚ù?No SQLite as production store on Vercel
- ‚ù?No changes to Replit `cms-starter` layout for Vercel-only fixes

### A7 ‚Ä?If v0 Publish still fails (Path B / C)

**Path B:** Deploy with `vercel --prod` or Git integration (full Vercel), same Scheme A layout.

**Path C:** Host CMS on **Railway / Fly.io / Replit** (long-lived Node). Use Vercel only for Preview if needed.

### A8 ‚Ä?Migrate an existing broken Vercel project

1. Scaffold/compare with `cms-starter-v0` (`init --hosting v0`) or copy:
   - `cms-app.ts`, `api/index.ts`, `server.ts`, `vercel.json`
   - rename `public/` ‚Ü?`cms-panel/` if still present
2. Ensure **one** Function exports the **same** `server` from `cms-app.ts`
3. Fluid on ‚Ü?Redeploy
4. Verify A5 (especially WebSocket 101)
5. On TVs: enter `https://YOUR.vercel.app/` (players also try `/api` automatically on vercel.app hosts)

---

## Runtime & Vercel deploy rules (mandatory)

### Production runtime (Publish)

- Serve TomorrowOS via **Vercel Function** `api/index.ts` ‚Ü?`export default server` (Fluid + WebSockets).
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
- **`build`** = no-op exit 0 (never `next build` for Production).
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

Add `@vercel/blob` only when the user chooses **Vercel Blob** in Question 2.

For Preview shell only, add as needed: `next`, `react`, `react-dom`, and a process runner (`concurrently` or equivalent). These must **not** become the Production CMS.

### `server.ts` pattern (Vercel-adapted ‚Ä?Production)

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

- **Production:** `PORT` from Vercel ‚Ü?TomorrowOS listens on that port (no Next).
- **Preview:** set `TOMORROWOS_INTERNAL_PORT=3001` (or similar) so Next can own `:3000` and proxy inward.

Load env with `dotenv` for local/`vercel dev`. On production Deploy, Vercel injects Environment Variables natively.

### Preview adapter (v0 / Next reverse proxy) ‚Ä?required when Preview is Next-hardwired

Detect Preview / v0 (Next already present, or Preview blank while TomorrowOS logs ‚Äúlistening‚Ä?. Then:

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
- Creating root `api/index.*` + `routes` catch-all that exports a raw `http.Server` ‚Äúto fix 404‚Ä?

### `vercel.json` (Production ‚Ä?explicit Node, not Next)

Write `vercel.json` so Production cannot be mistaken for Next. Minimum:

```json
{
  "fluid": true,
  "framework": null,
  "installCommand": "npm install",
  "buildCommand": "npm run build"
}
```

Use `pnpm` / `yarn` variants of install/build if that is the project‚Äôs package manager.

**Do not** add `startCommand`, `processes`, or `outputDirectory` to `vercel.json` when v0 schema rejects them. Start = `package.json` `"start": "tsx server.ts"`. Output Directory = **empty in dashboard**.

**Also force Project Settings (dashboard or Vercel API) ‚Ä?this is mandatory (see Scheme A4):**

| Setting | Required value |
|---------|----------------|
| Framework Preset | **Other** / null ‚Ä?**not Next.js** |
| Install Command | `npm install` (or pnpm/yarn) |
| Build Command | `npm run build` (no-op exit 0) |
| Output Directory | **empty / null** ‚Ä?**NOT `public`** |
| Start Command | `npm run start` ‚Ü?`tsx server.ts` (or `.mts`) ‚Ä?set in **dashboard**, not `vercel.json` |
| Fluid compute | **On** |

If `next` / `next.config.*` exist for Preview and the dashboard still auto-selects Next.js:

1. Patch Framework Preset to **Other** via API/CLI/dashboard.
2. Redeploy.
3. Hit Production `GET /status` ‚Ä?must be **JSON**, not HTML.
4. Hit Production `GET /` ‚Ä?must be Control Panel HTML, not `404: NOT_FOUND`.

If Vercel‚Äôs UI and this file disagree on bundling, **prefer whatever keeps a single long-lived Node HTTP server with WebSocket upgrade on `/` for Production**. Document the adaptation in the final summary.

### WebSocket / multi-instance note

- Device sockets are pinned to **one** function/instance. TomorrowOS device maps are **in-memory**.
- For large fleets on multi-instance Vercel, prefer **one stable instance / region**, or accept that reconnects may land on another instance until the product adds shared presence (out of scope for this setup).
- Always use **Postgres** (Supabase or Neon) so pairings/playlists survive cold starts and deploys.
- **Pair TVs to the Production HTTPS origin**, not the v0 Preview URL.

### What not to create

- ‚ù?`.replit`, `.replit-artifact`
- ‚ù?Next.js as the **Production** CMS (App Router replacing TomorrowOS)
- ‚ù?Root `api/` catch-all exporting raw `http.Server` to ‚Äúfix‚Ä?Publish 404
- ‚ù?Separate ‚ÄúAPI project‚Ä?without the Control Panel
- ‚ù?Committing database passwords, Cloudinary secrets, or Blob tokens

---

## Question 1 ‚Ä?Database (always)

> **Do not** ask screen counts. Present all three options; recommend **Supabase** for Vercel fleets.  
> **After the user picks a database:** collect the URL if needed, then **you** set `TOMORROWOS_STORE` + `DATABASE_SSL` (see mapping below). The customer must **never** be asked to type those two names or values.

### Agent-owned env mapping (mandatory)

| User chose | You set (silently) | User only provides |
|------------|--------------------|--------------------|
| 1 Supabase | `TOMORROWOS_STORE=supabase`, `DATABASE_SSL=true` | `SUPABASE_URL` (pooler string) |
| 2 Neon | `TOMORROWOS_STORE=postgres`, `DATABASE_SSL=true` | `DATABASE_URL` (pooled string) |
| 3 SQLite | `TOMORROWOS_STORE=sqlite` | Confirmation only |

If you open an Env configuration UI for Q1, fields visible to the user may include **only** `SUPABASE_URL` or `DATABASE_URL`. **Do not** show blank `TOMORROWOS_STORE` / `DATABASE_SSL` inputs ‚Ä?write those yourself in the same step.

### Step A ‚Ä?Ask storage choice

**Ask exactly:**

> Which database should TomorrowOS use on Vercel?
>
> **1. Supabase Postgres (recommended)** ‚Ä?durable pairing/playlists; use the **Session pooler** URL (`*.pooler.supabase.com:6543`).
>
> **2. Neon Postgres** ‚Ä?serverless Postgres native to Vercel; use Neon‚Äôs **pooled** connection string from the Neon dashboard (not the direct un-pooled host for serverless).
>
> **3. SQLite (`data/tomorrowos.db`)** ‚Ä?**demo / local only on Vercel.** The filesystem is ephemeral; pairings and playlists will not survive redeploys. Only choose this if you understand the limitation.
>
> Reply with **1**, **2**, or **3** (or ‚ÄúSupabase‚Ä?/ ‚ÄúNeon‚Ä?/ ‚ÄúSQLite‚Ä?.

### Step B ‚Ä?If **1 / Supabase**

**Ask exactly (connection string only ‚Ä?not TOMORROWOS_STORE / DATABASE_SSL):**

> Paste your Supabase Postgres connection string. I will store it as **`SUPABASE_URL`**. I will set **`TOMORROWOS_STORE`** and **`DATABASE_SSL`** for you automatically.
>
> In Supabase: **Project Settings ‚Ü?Database ‚Ü?Connection string ‚Ü?Connection pooling** (Session mode).  
> Preferred shape:  
> `postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
>
> **Do not** use the direct host `db.*.supabase.co:5432` for Vercel.

**You must then (automatic ‚Ä?do NOT ask the user to type store/ssl vars):**

1. Set Vercel Env Vars in one step:
   - `SUPABASE_URL=<user pooler string>` ‚Ü?from user
   - `TOMORROWOS_STORE=supabase` ‚Ü?**you set; never ask**
   - `DATABASE_SSL=true` ‚Ü?**you set; never ask**
2. Wire `cms-app.ts` / `server.ts` store as in **Runtime & Vercel deploy rules**.
3. Optional committed `.env.example` with **placeholders only**.
4. **Do not** commit the real connection string.
5. **Do not** open a form whose blank fields include `TOMORROWOS_STORE` or `DATABASE_SSL`.

### Step C ‚Ä?If **2 / Neon**

**Ask exactly (connection string only):**

> Paste your **Neon pooled** Postgres connection string. I will store it as **`DATABASE_URL`**. I will set **`TOMORROWOS_STORE`** and **`DATABASE_SSL`** for you automatically.
>
> In Neon: **Dashboard ‚Ü?Connection details ‚Ü?Pooled connection**.  
> Typical shape:  
> `postgresql://[user]:[password]@[endpoint]-pooler.[region].aws.neon.tech/[dbname]?sslmode=require`

**You must then (automatic):**

1. Set Vercel Env Vars:
   - `DATABASE_URL=<user pooled string>` ‚Ü?from user
   - `TOMORROWOS_STORE=postgres` ‚Ü?**you set; never ask**
   - `DATABASE_SSL=true` ‚Ü?**you set; never ask**
2. Wire `createTomorrowOSStore` for Postgres.
3. **Do not** commit the real connection string.
4. **Do not** ask the user to fill `TOMORROWOS_STORE` or `DATABASE_SSL` in chat or Env UI.
5. If you see `ENETUNREACH` on `:5432`, switch to Neon‚Äôs **pooled** URL.

### Step D ‚Ä?If **3 / SQLite**

**Warn exactly before continuing:**

> SQLite on Vercel is **not** suitable for production fleets ‚Ä?data in `data/tomorrowos.db` is lost when the instance is recycled or redeployed. Continue only for a quick demo.

Only proceed after the user explicitly confirms.

**You must then (automatic):**

1. Set `TOMORROWOS_STORE=sqlite` yourself (do not ask the user to type it).
2. Keep `sqlitePath` for `data/tomorrowos.db`.
3. Warn again in the final summary that they should move to Supabase or Neon for real devices.

**Later in Question 3:** set `cms.hostingTarget` to **`"vercel"`** (all Q1 branches).

---

## Question 2 ‚Ä?Media storage

> **This question is only about media files (images/videos).**  
> It is **not** about OpenAI, AI pairing, or LLM keys. If you are about to ask for an `sk-` key, **stop** ‚Ä?you are off-protocol.  
> **Copy the three options below verbatim.** Wrong examples that must **never** appear: ‚ÄúVercel Blob (recommended)‚Ä? ‚ÄúSupabase Storage‚Ä? ‚ÄúNo media storage / disable uploads‚Ä?

### Step A ‚Ä?Ask storage choice

**Ask exactly (wording must match ‚Ä?Cloudinary is recommended):**

> How should playlist media (images/videos) be stored?
>
> **1. Cloudinary (recommended)** ‚Ä?durable public HTTPS URLs (`https://res.cloudinary.com/...`). Works out of the box with `@tomorrowos/sdk` auto-detection. **Prefer this on Vercel.**
>
> **2. Vercel Blob** ‚Ä?Vercel-native object storage; durable `https://*.public.blob.vercel-storage.com/...` URLs. Use when you want media on the same Vercel project without a Cloudinary account.
>
> **3. Local disk only** ‚Ä?`cms-panel/uploads` or `public/uploads` (OK for quick local tests; **not** for production Vercel fleets ‚Ä?files are ephemeral).
>
> Reply with **1**, **2**, or **3** (or ‚ÄúCloudinary‚Ä?/ ‚ÄúVercel Blob‚Ä?/ ‚Äúlocal‚Ä?.

If you catch yourself about to offer Blob-as-recommended, Supabase Storage, or ‚Äúno media‚Ä? **stop and paste the block above instead**.

### Step B ‚Ä?If **1 / Cloudinary** (same Question 2 ‚Ä?**one Env popup**)

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

### Step C ‚Ä?If **2 / Vercel Blob** (same Question 2)

**Ask exactly:**

> I will enable **Vercel Blob** for media uploads.
>
> 1. In the Vercel project: **Storage ‚Ü?Create ‚Ü?Blob** (or link an existing Blob store to this project).
> 2. Confirm **`BLOB_READ_WRITE_TOKEN`** is available (Vercel usually injects it when Blob is linked).
>
> Paste the token only if it is not already set in your project Env Vars. Do you already have Blob linked on this Vercel project? (yes / no)

**You must then:**

1. Set Vercel Env Var: `BLOB_READ_WRITE_TOKEN=<token>` (if not auto-injected). Prefer the Env popup when available.
2. `npm install @vercel/blob` (add to `dependencies`).
3. Wire uploads so media returns **absolute HTTPS Blob URLs** stored in `uploaded_assets` (players need stable public URLs).
   - The SDK **natively auto-detects Cloudinary** today. For Vercel Blob, add a thin upload bridge in the CMS project (e.g. custom route or middleware that calls `put()` from `@vercel/blob` and persists the returned `url` the same way Cloudinary URLs are stored).
   - Minimum pattern:

```ts
import { put } from "@vercel/blob";

// On upload: const blob = await put(filename, body, { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN });
// Store blob.url in uploaded_assets ‚Ä?same shape as Cloudinary secure URLs.
```

4. Warn: until the project‚Äôs Blob bridge is wired, Control Panel **Media** status may show local/ephemeral ‚Ä?verify uploads return `https://*.blob.vercel-storage.com/...` before calling setup complete.
5. Do **not** proceed to Question 3 until `BLOB_READ_WRITE_TOKEN` exists (or Blob is linked and token is confirmed in the Vercel dashboard).

### Step D ‚Ä?If **3 / local uploads**

1. `mkdir -p public/uploads`
2. Warn clearly: files may vanish on redeploy; players need stable HTTPS URLs ‚Ä?Cloudinary or Vercel Blob is strongly preferred for Vercel.

---

## Question 3 ‚Ä?Brand (`brand.json` only)

> Updates **only** `brand.json`. Does **not** change Vercel project settings, Env Vars, or `server.ts` store wiring beyond what Q1‚ÄìQ2 already required.
>
> **IRON RULE ‚Ä?website URL ‚â?build a website / login / auth CMS.**  
> If the user pastes a URL (or says ‚Äúmake it look like this site‚Ä?, that input is **reference material for `brand.json` only** (name, colours, fonts, logo, tagline).  
> **Do not** scaffold a login page, signup, OAuth, gated dashboard, or copy the reference site‚Äôs IA/pages ‚Ä?**unless the user explicitly asks for CMS login / auth**.  
> Default TomorrowOS Control Panel has **no login**. Keep it that way.

### Step A ‚Ä?Ask branding input

**Ask exactly:**

> Let‚Äôs brand your TomorrowOS experience. You can answer in either way:
>
> **Option A ‚Ä?Website URL only (brand reference)**  
> Paste **one public website URL**. I will use it **only** to infer colours, fonts, name, tagline, and logo for **`brand.json`**.  
> I will **not** rebuild that website, add a login page, or change Control Panel features ‚Ä?unless you explicitly ask for login/auth later.
>
> **Option B ‚Ä?Manual fields**  
> Provide:
> 1. **Product / venue name**
> 2. **Tagline** (optional)
> 3. **Primary colour** (hex, e.g. `#FF8A3D`)
> 4. **Background colour** (hex, optional ‚Ä?default `#FAFAF9`)
> 5. **Text colour** (hex, optional ‚Ä?default `#0A0908`)
> 6. **Secondary / accent colour** (hex, optional)
> 7. **Logo** ‚Ä?upload SVG/PNG into the project, or a URL I can fetch into `./assets/`

### Step B ‚Ä?If the user gives **only a website URL** (Option A)

**You must:**

1. **Fetch and inspect** the page (HTTP GET the URL; follow one redirect if needed). Do not invent colours.
2. **Write / update `brand.json` only** from what you infer. Touch nothing else for this step (no new pages, no auth, no Next marketing site, no login UI).
3. **Derive branding** using this priority order:
   - **Name:** `<title>`, `og:site_name`, or prominent header / logo `alt` text (trim to ‚â?60 chars).
   - **Tagline:** `meta[name="description"]`, `og:description`, or first hero subtitle (‚â?120 chars).
   - **Primary colour:** `meta[name="theme-color"]`, CSS `--primary` / `--brand` variables, or dominant accent from linked stylesheets / inline styles (convert to `#RRGGBB`).
   - **Background colour:** `body` / `:root` background (default `#FAFAF9` if light site).
   - **Text colour:** main body text colour (default `#0A0908` if light site).
   - **Secondary colour:** muted border / secondary button colour, or a tint of the primary.
   - **Font:** first `font-family` on `body` (strip quotes; default `Inter` if generic system stack).
   - **Logo:** prefer `og:image`, then `link[rel="icon"]` / apple-touch-icon, then header `<img>` logo. Download into `./assets/logo.png` or `./assets/logo.svg` and set `logoPath` accordingly. If only favicon exists, use it and note size in the summary.
4. **Contrast check:** if background is dark, set `activationScreen.theme` to `"dark"` and add `logoPathOnDark` when a light logo variant exists.
5. **Infer `cms.useCase`** from page content when obvious (restaurant / retail / corporate / etc.); otherwise `"other"`.
6. **Show a one-line summary** to the user (name + primary hex + logo path) before or while writing the file ‚Ä?do not ask a second branding question unless fetch failed.
7. If the URL is unreachable, blocked, or has no usable styles, say so and fall back to **Option B** manual questions for missing fields only.

**Explicitly forbidden when the user only gave a URL (no login request):**

- ‚ù?Login / signup / ‚ÄúSign in to continue‚Ä?screens
- ‚ù?Auth middleware, sessions, cookies, OAuth, password forms
- ‚ù?Cloning the reference site as a marketing landing or multi-page CMS
- ‚ù?Gating the Control Panel behind authentication
- ‚ù?Treating ‚Äúmake it like this site‚Ä?as ‚Äúrebuild this site‚Ä?

If the reference site itself is a login page, **still only extract visual brand tokens** (colours/logo/name) into `brand.json` ‚Ä?do **not** recreate that login flow.

### Step C ‚Ä?Write `brand.json`

Validate mentally against `brand.schema.json`. Minimum:

```json
{
  "name": "<user name or site-derived name>",
  "tagline": "<tagline or Digital signage>",
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

Always set **`cms.hostingTarget`: `"vercel"`** without asking. Default `expectedScreens` to `5` unless the user already volunteered a number. Set `cmsEndpoint` only if they already know the public `https://‚Ä¶vercel.app` URL; otherwise tell them to pair TVs with the **Published** HTTPS origin (player maps `https://` ‚Ü?`wss://`).

---

## After all answers ‚Ä?execution checklist

### A. Seed the project

```bash
npx @tomorrowos/sdk@latest init .
# If not empty and user confirms starter overwrite:
# npx @tomorrowos/sdk@latest init . --force
```

Then (**Scheme A ‚Ä?mandatory for Publish**):

1. Keep **`server.ts`** at **project root** with top-level `listen()` + `export default server`.
2. If Preview needs Next: **move** `next.config.*`, `app/`, Next `tsconfig` / `postcss` / `next-env.d.ts` into **`preview/`** ‚Ä?remove them from root so Production is not mistaken for Next/static.
3. Write `vercel.json` per **Scheme A3** (`fluid`, `framework: null`, no-op `buildCommand` ‚Ä?**no** `startCommand`).
4. **Force Project Settings** per **Scheme A4** (Framework = Other, Output Directory empty, Start = `npm run start`, Fluid on). Patch dashboard via API if it still says Next.js.
5. Do **not** add root `api/` catch-all for raw `http.Server`.
6. Do **not** add `.replit*`.
7. If Q2 = Vercel Blob: install `@vercel/blob` and wire the upload bridge.

### B. Environment Variables (Vercel dashboard + local)

| Name | Required | Who fills it |
|------|----------|--------------|
| `SUPABASE_URL` | If Q1 = Supabase | User pastes URL |
| `DATABASE_URL` | If Q1 = Neon | User pastes URL |
| `TOMORROWOS_STORE` | Yes | **Agent auto-sets only** ‚Ä?never a blank field for the user (`supabase` / `postgres` / `sqlite`) |
| `DATABASE_SSL` | Yes for Postgres | **Agent auto-sets only** ‚Ä?never a blank field for the user (`true`) |
| `CLOUDINARY_*` | If Q2 = Cloudinary | User via **one Env popup** (all fields) |
| `BLOB_READ_WRITE_TOKEN` | If Q2 = Vercel Blob | User / Blob link |
| `TOMORROWOS_INTERNAL_PORT` | Preview only | Agent (e.g. `3001`) |
| `PORT` | Optional | Vercel injects for Production |

Mirror non-secrets in `.env` for local `npm run dev` if helpful; never commit secrets.

### C. Install and run

```bash
npm install
npm run start
# Preview / v0: npm run dev:preview  (Next + TomorrowOS internal)
```

Confirm logs: `[TomorrowOS] listening on http://0.0.0.0:‚Ä¶`  
Confirm browser:

- **Preview:** Control Panel visible through the Next proxy at `/`
- **Production start:** Control Panel served directly by TomorrowOS at `/`

### D. Deploy (Publish ‚Ä?Node only)

```bash
vercel --prod
# or git push ‚Ü?Vercel Git integration
```

**Publish acceptance checklist (all must pass ‚Ä?Scheme A5):**

1. Framework Preset = **Other** / null (dashboard confirms ‚Ä?not Next.js)
2. Output Directory = **empty** (not `public`)
3. Start Command = Node `TomorrowOS.listen` (`npm run start` / `tsx server.ts`)
4. Fluid compute on
5. Env Vars present for Production
6. Production `GET /status` returns **JSON** ‚Ä?**not** HTML (`Unexpected token 'T'` means this failed)
7. Production `GET /` returns Control Panel HTML ‚Ä?**not** `404: NOT_FOUND`

If step 6 fails but step 7 passes: **static `public/` trap** ‚Ä?Vercel is not running Node. Re-apply Scheme A3‚ÄìA4; try **Path B** (Git / `vercel --prod`); do **not** invent `api/` + `rewrites`.

Tell the user:

- **Control Panel (Publish):** `https://YOUR-PROJECT.vercel.app`
- **TV CMS endpoint:** same HTTPS origin (players use `wss://`)
- **Preview:** Next shell is for v0 only ‚Ä?do not pair devices to Preview

### E. Minimal verification only

**Do:**

1. Preview: Control Panel HTML at `/` (via Next proxy in `preview/` if applicable)
2. Publish: `GET /status` ‚Ü?JSON; `GET /` ‚Ü?Control Panel from **Node** TomorrowOS
3. Publish: panel does **not** show `Unexpected token 'T'` / CMS unreachable
4. Server status: Media OK when Cloudinary or Blob configured
5. Database: if ERROR shows **`ENETUNREACH` ‚Ä?IPv6 ‚Ä?`:5432`**, switch to **pooled** URL (Supabase `:6543` or Neon pooler) and redeploy ‚Ä?call this out explicitly to the user
6. Fluid compute on for Production

**Do not block** on long WebSocket/device pairing tests unless the user asks. Prefer pairing against **Publish**, not Preview.

---

## Failure recovery cheat sheet

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Publish `404: NOT_FOUND` | Framework Preset still **Next.js** / no Function | Scheme A: Framework = **Other**, Fluid on, `api/index.ts` + rewrites; redeploy |
| Panel loads but **CMS unreachable** / `Unexpected token 'T', "The page c"...` | **`public/` deployed as static site** ‚Ä?no Function | Rename to `cms-panel/`; Output empty; Scheme A Function entry; **Path B** if needed |
| Only `/api/status` returns JSON, `/status` is 404 | Missing **rewrites** to `/api` | Add Scheme A3 rewrite `/(.*) ‚Ü?/api` (exclude existing `/api/`); redeploy |
| Control Panel OK, TV **could not connect** | WebSocket upgrade not reaching Function (200 HTML) | Fluid on; `export default server`; verify 101 on `/` and `/api`; check WebSockets permission |
| `vercel.json` error: invalid `startCommand` | v0 schema rejects it | Remove from `vercel.json`; Function entry does not need startCommand |
| Separate `api/ws.ts` with a second `new TomorrowOS` | Two isolates ‚Ä?pairing memory split | **One** Function only (`api/index.ts` ‚Ü?shared `cms-app.ts`) |
| `vercel inspect` shows Output = `public if it exists` | Framework=Other static default | Force Output Directory **empty**; use `cms-panel/`; Path B redeploy |
| Build runs `next build` / missing routes-manifest | Next auto-detected from root `next.config` / `app/` | Move Next to `preview/`; Framework null/Other; `build` = no-op |
| Preview blank but logs show TomorrowOS listening | v0 Next intercepts public port | Add Next reverse proxy ‚Ü?internal TomorrowOS port |
| Preview works, Publish broken / Next-only | Production still on Next | Switch Production to Fluid Function `api/index.ts` |
| `ENETUNREACH` / IPv6 / `:5432` | Direct Postgres URL | Use **pooled** URL (Supabase `:6543` or Neon pooler) |
| Control Panel OK, devices never stay paired after restart | SQLite / ephemeral disk | Use Supabase or Neon |
| Uploads break / broken thumbs in prod | Local uploads only | Cloudinary or Vercel Blob |
| Blob uploads 401 / missing token | Blob not linked | Vercel Storage ‚Ü?Blob + `BLOB_READ_WRITE_TOKEN` |
| WebSocket fails on Publish | Fluid off / static-only / Next as Production / no Function WS | Enable Fluid; Scheme A; test 101 upgrade |
| Devices fail only on Preview | Next proxy cannot upgrade `wss` | Expected ‚Ä?pair on Publish URL |
| Agent asked user to fill `TOMORROWOS_STORE` / `DATABASE_SSL` | Off-protocol | Agent must auto-set after DB choice; remove those fields from user Env forms |
| Agent offered Blob-as-recommended / Supabase Storage / ‚Äúno media‚Ä?for Q2 | Invented options | Re-ask Q2 verbatim: **1 Cloudinary (recommended)**, 2 Blob, 3 local |
| Agent asked Cloudinary key/secret in three chat turns | Off-protocol | Use **one Env popup** with all Cloudinary fields |
| Agent asked for OpenAI / `sk-` key during setup | Hallucinated ‚ÄúAI pairing‚Ä?requirement | **Refuse.** TomorrowOS does not need LLM keys. Return to Q2 media choices only |
| Agent built a login page after user pasted a URL | Misread brand reference as product scope | Remove login; keep starter Control Panel; apply URL only to `brand.json` |
| Secrets in git | Mistake | Rotate keys; move to Vercel Env Vars |
| Replit files present | Copied wrong protocol | Delete `.replit*`; use this file |

---

## How this differs from `REPLIT_SETUP.md`

| Topic | Replit | Vercel |
|-------|--------|--------|
| Secrets | Replit Secrets | Vercel Environment Variables |
| Deploy config | `.replit`, artifact `kind=web` | `vercel.json` + Fluid; **Framework = Other**; **no** `.replit` |
| `hostingTarget` | `"here"` | `"vercel"` |
| Database | Supabase (primary) | Supabase **or Neon** (pooled); SQLite demo only |
| Media | Cloudinary or Replit Object Storage | Cloudinary **or Vercel Blob** |
| Preview | Replit Preview / Autoscale Node | **Next shell + proxy** when v0 hardwires Next |
| Publish | Long-lived Node | **Node `TomorrowOS.listen` only** (not Next); gate on no `404 NOT_FOUND` |
| Brand from URL | Not in Replit protocol | **Option A** ‚Ä?infer **`brand.json` only**; never invent login |

---

## Final summary template (Agent ‚Ü?human)

After setup, report:

1. **Live URL** (Production Publish)
2. **Publish health:** Framework = Other; Output ‚â?`public`; `GET /status` ‚Ü?JSON; `GET /` OK
3. **Preview note:** Next proxy shell used / not needed
4. **Env Vars set** (names only ‚Ä?never values); note which were auto-set (`TOMORROWOS_STORE`, `DATABASE_SSL`)
5. **Store:** Supabase pooler / Neon pooled / SQLite (with warning)
6. **Media:** Cloudinary, Vercel Blob, or local (with warning)
7. **Brand:** name + `hostingTarget: vercel` (+ note if derived from website URL)
8. **Runtime split:** Preview = ‚Ä?; Publish = Node TomorrowOS (confirm **not** Next)
9. **Open action:** if Database still ERROR, paste the pooler instruction again

Protocol complete when:

- **Preview** shows the Control Panel at `/` (via Next proxy if required), **and**
- **Publish** returns Control Panel at `/` **and** `/status` JSON from pure Node `TomorrowOS.listen` with Fluid (not static `public/`, not `404: NOT_FOUND`, not `Unexpected token 'T'`), **and**
- Q1‚ÄìQ3 configuration is saved

‚Ä?even if a sandbox DB probe still flakes **after** the pooled URL is correctly set for Production.
