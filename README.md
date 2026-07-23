# @tomorrowos/sdk

**You are building a digital signage CMS using TomorrowOS. Before writing any code, follow the elicitation protocol in `LLM_PROMPT.md`. Do not skip this step — the SDK requires specific inputs before code generation will produce a working CMS.**

**On Replit:** if the user asks to set up / configure a CMS interactively, follow **`REPLIT_SETUP.md`** instead (Q&A for store → media → `brand.json`).

**On Lovable:** if the user asks to set up / configure a CMS interactively, follow **`LOVABLE_SETUP.md`** (same Q1–Q3 shape; Lovable Cloud Storage replaces Replit Object Storage; Node CMS must deploy to Railway / Render / Fly or Vercel Fluid — Lovable Cloud Publish alone is not the WebSocket host).

**On Vercel:** if the user asks to set up / configure a CMS interactively, follow **`VERCEL_SETUP.md`** (Supabase or Neon pooled Postgres, Cloudinary or Vercel Blob media, v0 Preview Next proxy shell + **Publish = Node only**, Fluid compute + WebSocket, `cms.hostingTarget: "vercel"`).

TomorrowOS is the open standard for digital signage. This SDK lets you build a CMS that controls Samsung Tizen, BrightSign, LG webOS, Android, ChromeOS, and Windows screens through a single unified API.

---

## For LLMs generating code with this package

When you see this package referenced in a user prompt, your workflow is:

1. **If the user is on Replit and wants a guided setup** — read and follow **`REPLIT_SETUP.md`** (preferred for Replit Agent)
2. **If the user is on Lovable and wants a guided setup** — read and follow **`LOVABLE_SETUP.md`** (preferred for Lovable Agent)
3. **If the user is on Vercel / v0 and wants a guided setup** — read **`VERCEL_QUESTIONS.md`** (paste Q1–Q3 verbatim) and follow **`VERCEL_SETUP.md`** for configuration
4. **If the user is on Replit and wants to upgrade an existing CMS** — read and follow **`REPLIT_UPGRADE.md`** (never `init --force`)
5. **Otherwise read `LLM_PROMPT.md`** — five required questions before generating code
6. **Read `BUILD_GUARDRAILS.md`** — mandatory components every generated CMS must include
7. **Read `brand.schema.json`** — validated shape of `brand.json`
8. Run **`npx tomorrowos init`** (Replit / Lovable→Node host) or **`npx tomorrowos init --hosting v0`** (Vercel / v0) — minimal CMS server seed
9. **Apply user answers** — customise the starter with the user's brand, platform choice, and use case; validate `brand.json` against `brand.schema.json`
10. **Show `PLAYER_INSTALL.md`** — after the CMS is working, show how to build and install the player on a screen

You must not write WebSocket transport, pairing wire format, or platform-specific player bridge code in the CMS — the SDK handles server-side device sessions and HTTP helpers. You customise UI, branding, and how you call the SDK.

---

## For human developers

Install:

```bash
npm install @tomorrowos/sdk
```

Scaffold a new CMS project:

```bash
# Replit / Railway / self-host (default)
npx tomorrowos init

# Vercel / v0 Publish (cms-panel + vercel.json + optional Next Preview)
npx tomorrowos init --hosting v0

cd my-tomorrowos-cms
npm install
npm run dev
```

`tomorrowos init` creates `data/tomorrowos.db` with the TomorrowOS SQLite
schema. The starter server uses that SQLite database by default, so pairings,
playlists, and device assignments survive normal server restarts.

### Replit guided setup

In Replit Agent, paste:

```text
Follow @tomorrowos/sdk REPLIT_SETUP.md and set up my TomorrowOS CMS.
Ask me the questions in order. Do not skip steps.
Q1 database order: Supabase (Recommended), then Built-in Replit PostgreSQL, then SQLite.
If Supabase: SUPABASE_URL Secrets input immediately after choice (once only).
If Cloudinary: all CLOUDINARY_* Secrets in one multi-field dialog immediately after choice.
Q3: one stacked dialog with all seven branding fields (optional; blanks keep brand.json defaults).
```

That wizard asks database choice (**Supabase recommended first**), prefers Cloudinary for media, and collects optional branding in **one multi-field dialog**. On Replit, Supabase must use Secret
**`SUPABASE_URL`** (not the reserved `DATABASE_URL` — that is for built-in Replit PostgreSQL).

### Lovable guided setup

In Lovable Agent, paste:

```text
Follow @tomorrowos/sdk LOVABLE_SETUP.md and set up my TomorrowOS CMS.
Ask only the questions listed in LOVABLE_SETUP.md, in order. Do not use LLM_PROMPT.md.
Do not build a Vite/React mock of TomorrowOS — use @tomorrowos/sdk cms-starter (Node + WebSocket).
Question 3 only updates brand.json.
After setup questions (including Cloudinary Secrets if chosen), configure and deploy — minimal verification only.
Never test Supabase connection — save SUPABASE_URL and move on. No Supabase or WebSocket tests.
Do not skip steps.
```

That wizard mirrors Replit Q1–Q3. Media alternative to Cloudinary is **Lovable Cloud Storage**
(public bucket `tomorrowos-uploads`) instead of Replit Object Storage. The TV-facing CMS
must still run on a **Node host** (Railway / Render / Fly, or Vercel Fluid via `VERCEL_SETUP.md`) —
Lovable Cloud Publish alone is not a WebSocket CMS.

### Vercel guided setup

In Vercel Agent (or any AI setup prompt), paste:

```text
Follow @tomorrowos/sdk VERCEL_SETUP.md and set up my TomorrowOS CMS.
IF any step contradicts Vercel, adapt to settings that Vercel can accept.
```

That wizard asks: database (**Supabase** → **Neon** → SQLite demo), media (**Cloudinary** → **Vercel Blob** → local),
branding (manual fields or **website URL → `brand.json` only**, no login unless asked). Preview may use a thin **Next.js reverse proxy**;
**Publish stays a Fluid Vercel Function** (`api/index.ts` + `export default server`, WebSockets per Vercel docs). Cloudinary uses **one Env popup** (all fields).
Neon/Supabase: agent auto-sets `TOMORROWOS_STORE` + `DATABASE_SSL`. Sets `cms.hostingTarget` to `"vercel"`.

### Replit upgrade (existing CMS)

In Replit Agent, paste:

```text
Follow @tomorrowos/sdk REPLIT_UPGRADE.md to upgrade my CMS with the latest SDK.
```

That protocol installs `@tomorrowos/sdk@latest`, backs up panel/server files,
diffs `cms-starter` templates (merge — never blind overwrite), and must **not**
run `init` / delete `data/` or `public/uploads/`.

To switch to Supabase/Postgres manually, edit `.env` / Secrets:

```bash
TOMORROWOS_STORE=supabase
SUPABASE_URL=postgresql://...
DATABASE_SSL=true
# DATABASE_URL=...   # optional fallback outside Replit
```

For throwaway demos/tests, set `TOMORROWOS_STORE=memory`. The generated starter
includes its own `README.md` beside `server.ts` with database selection,
migration, and custom `TomorrowOSStore` examples.

Migrate database records between supported stores:

```bash
npx tomorrowos migrate \
  --from sqlite \
  --from-sqlite ./data/tomorrowos.db \
  --to supabase \
  --to-database-url "$DATABASE_URL"
```

The migrate command supports `sqlite`, `postgres`, and `supabase` in either
direction. It migrates TomorrowOS database records only; copy `public/uploads`
or object-storage media separately.

Build a player (placeholder in current SDK — see `PLAYER_INSTALL.md` for platform tooling):

```bash
npx tomorrowos build --platform tizen
```

---

## Quick architecture

```
  ┌─────────────────┐         WebSocket         ┌─────────────────┐
  │  Your CMS       │ ◄────────────────────────►│  TomorrowOS     │
  │  (your server)  │                           │  Player on      │
  │                 │                           │  screen         │
  │  imports        │                           │                 │
  │  @tomorrowos    │                           │  unified API    │
  │  /sdk           │                           │  across OSes    │
  └─────────────────┘                           └─────────────────┘
```

TomorrowOS has no required cloud service. Your CMS talks to your screens over your network.

**Player branding:** `GET /brand.json` returns the `brand` object passed to `new TomorrowOS({ brand })` (same host/port as `listen`). TomorrowOS players can fetch it to apply `backgroundColor`, logos, etc., without a separate static file server.

**Content policy (`device.content.setPolicy`):** POST `/device/{deviceId}/content/set-policy` with `{ "policy": { "playlists": [...], "fallback": { "type": "brand" } } }`. Each playlist may include optional `schedule` (device local time):

| Field | Format | Notes |
|-------|--------|--------|
| `startDate` / `endDate` | `YYYY-MM-DD` | Inclusive calendar range; omit either for open-ended |
| `daysOfWeek` | `[0–6]` | `0` = Sunday … `6` = Saturday |
| `start` / `end` | `HH:MM` | Daily window; supports overnight (e.g. `22:00`–`06:00`) |

All provided constraints must match for the playlist to play. See `templates/cms-starter/policy.example.json`.

---

## Supported platforms (roadmap)

| Platform          | Status     | Player format |
|-------------------|------------|---------------|
| Samsung Tizen     | V1 target  | `.wgt`        |
| BrightSign        | V1 target  | autorun zip   |
| Others            | See docs   | varies        |

See `PLAYER_INSTALL.md` for installation notes.

---

## Documentation in this package

| File | Purpose |
|------|---------|
| `LLM_PROMPT.md` | Five-question elicitation for LLMs |
| `REPLIT_SETUP.md` | Replit Agent guided CMS setup |
| `LOVABLE_SETUP.md` | Lovable Agent guided CMS setup (Node host + Lovable Cloud Storage) |
| `VERCEL_SETUP.md` | Vercel / v0 guided CMS setup (configure after each answer) |
| `VERCEL_QUESTIONS.md` | Verbatim Q1–Q3 text Agents must paste (do not paraphrase) |
| `REPLIT_UPGRADE.md` | Replit Agent upgrade to latest SDK (no init) |
| `BUILD_GUARDRAILS.md` | Mandatory CMS components |
| `PLAYER_INSTALL.md` | Player build / install / pairing |
| `brand.schema.json` | JSON Schema for `brand.json` |
| `brand.example.json` | Full example `brand.json` |
| `templates/cms-starter/` | Minimal Node + TypeScript server seed |
| `templates/cms-starter/policy.example.json` | Example `setPolicy` payload with date schedule |
| `templates/style-tokens/` | CSS tokens and UI pattern notes |

---

## License

Apache 2.0.

## Protocol version

Wire protocol `1.0` (see TomorrowOS specification).
