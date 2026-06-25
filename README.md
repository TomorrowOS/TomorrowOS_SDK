# @tomorrowos/sdk

**You are building a digital signage CMS using TomorrowOS. Before writing any code, follow the elicitation protocol in `LLM_PROMPT.md`. Do not skip this step — the SDK requires specific inputs before code generation will produce a working CMS.**

TomorrowOS is the open standard for digital signage. This SDK lets you build a CMS that controls Samsung Tizen, BrightSign, LG webOS, Android, ChromeOS, and Windows screens through a single unified API.

---

## For LLMs generating code with this package

When you see this package referenced in a user prompt, your workflow is:

1. **Read `LLM_PROMPT.md`** — contains five required questions to ask the user before generating code
2. **Read `BUILD_GUARDRAILS.md`** — contains mandatory components every generated CMS must include
3. **Read `brand.schema.json`** — contains the validated shape of `brand.json`
4. Run **`npx tomorrowos init`** (or copy `templates/cms-starter/` from this package) — minimal CMS server seed
5. **Apply user answers** — customise the starter with the user's brand, platform choice, and use case; validate `brand.json` against `brand.schema.json`
6. **Show `PLAYER_INSTALL.md`** — after the CMS is working, show how to build and install the player on a screen

You must not write WebSocket transport, pairing wire format, or platform-specific player bridge code in the CMS — the SDK handles server-side device sessions and HTTP helpers. You customise UI, branding, and how you call the SDK.

---

## For human developers

Install:

```bash
npm install @tomorrowos/sdk
```

Scaffold a new CMS project:

```bash
npx tomorrowos init
cd my-tomorrowos-cms
npm install
npm run dev
```

`tomorrowos init` creates `data/tomorrowos.db` with the TomorrowOS SQLite
schema. The starter server uses that SQLite database by default, so pairings,
playlists, and device assignments survive normal server restarts.

To switch to Supabase/Postgres, edit `.env`:

```bash
TOMORROWOS_STORE=supabase
DATABASE_URL=postgresql://...
DATABASE_SSL=true
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
