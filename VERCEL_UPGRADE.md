# Vercel Upgrade Protocol for TomorrowOS CMS

> **This file is a contract for Vercel Agent / v0 / AI coding assistants.**  
> Follow it literally. This protocol **upgrades an existing CMS** to the latest `@tomorrowos/sdk`.  
> It is **not** a greenfield setup. Do **not** use `VERCEL_SETUP.md` / `VERCEL_QUESTIONS.md` for this flow unless the user explicitly asks for a full re-setup.

---

## User trigger (copy-paste)

When a human pastes a prompt like this, **read this file and execute the upgrade steps immediately** (no questionnaire):

```text
Follow NPM package @tomorrowos/sdk VERCEL_UPGRADE.md to upgrade my CMS with the latest SDK.
Do not run init or init --force. Do not delete data/ or cms-panel uploads / media state.
Compare cms-starter-v0 template files and merge carefully — do not blindly overwrite custom changes.
Keep the NON-NEGOTIABLE VERCEL RUNTIME CONTRACT (one TomorrowOS instance, Fluid Function, no public/ Output Directory).
```

Alternate triggers that also activate this protocol:

- “Upgrade TomorrowOS on Vercel using VERCEL_UPGRADE.md”
- “Update my Vercel CMS to the latest @tomorrowos/sdk”
- “Follow VERCEL_UPGRADE.md”

When any of these triggers fire:

1. **Ignore `VERCEL_SETUP.md` / `VERCEL_QUESTIONS.md` questionnaires** — this is an upgrade, not setup Q&A.
2. **Do not** reinvent pairing, WebSocket, or playlist servers.
3. Preserve project data, Env Vars, and custom UI/server wiring.
4. Preserve the **NON-NEGOTIABLE VERCEL RUNTIME CONTRACT** from `VERCEL_SETUP.md`.

---

## Hard rules (non-negotiable)

1. **Do NOT** run `npx @tomorrowos/sdk init`, `npx @tomorrowos/sdk@latest init`, or any `init --force` (or any command that re-scaffolds / overwrites the project from the starter). Upgrade = **`npm install @tomorrowos/sdk@latest` only**.
2. **Do NOT** delete `data/`, media uploads, or wipe Postgres / Supabase / Neon data.
3. **Do NOT** invent or rotate Environment Variables (`SUPABASE_URL`, `DATABASE_URL`, Cloudinary keys, `BLOB_READ_WRITE_TOKEN`, etc.). Keep existing Vercel Env Vars / `.env`.
4. **Do NOT** blindly overwrite `cms-panel/methods.js`, `cms-panel/index.html`, `cms-panel/panel.css`, `server.ts`, `cms-app.ts`, or `api/index.ts` with template copies. Always **diff → report → merge only with user consent** (or apply surgical patches that preserve custom code).
5. **Do NOT** create a second `new TomorrowOS(...)` in `api/ws.ts` or elsewhere. **One** shared instance only.
6. **Do NOT** set Vercel Output Directory to `public/` or switch Production to Next/`next start` / static-only.
7. Prefer **`npm install @tomorrowos/sdk@latest`** over pinning an older version unless the user named a specific version.
8. Keep `tsx` available at runtime (`dependencies`, not only `devDependencies`) if local `npm run start` / Preview still relies on `tsx server.ts`.
9. After upgrade, re-check Production gates: `GET /status` → JSON, `GET /` → Control Panel, WebSocket `/` or `/api` → **101**.

---

## Preflight (record before changing anything)

Capture and remember:

| Item | How |
|------|-----|
| **Old SDK version** | `package.json` → `dependencies["@tomorrowos/sdk"]`, and/or `npm ls @tomorrowos/sdk --depth=0` |
| **Layout** | Confirm `cms-starter-v0` shape: `cms-app.ts` / `api/index.ts` / `cms-panel/` (or equivalent shared TomorrowOS export) |
| **Runtime** | Confirm Fluid Function + `vercel.json` rewrites; Output Directory empty |

If `@tomorrowos/sdk` is not a dependency, stop and tell the user this project does not look like a TomorrowOS CMS — offer `VERCEL_SETUP.md` instead. Do **not** run `init` unless they explicitly switch to setup.

---

## Upgrade steps (exact order)

### 1. Note current deploy state

Record the Production URL and whether Preview uses the `preview/` Next shell. Do not change Framework / Fluid settings unless they already violate the runtime contract.

### 2. Backup merge candidates (required)

Before any UI/server merge, copy the current files to a timestamped backup folder under the project (e.g. `.tomorrowos-upgrade-backup/<ISO-timestamp>/`):

- `cms-panel/methods.js` (or `public/methods.js` if that is the panel path)
- `cms-panel/index.html`
- `cms-panel/panel.css`
- `server.ts`
- `cms-app.ts` (if present)
- `api/index.ts` (if present)
- `vercel.json` (if present)

Also back up `package.json` (version pin record).

**Do not** put backups inside user media folders.  
Record the **backup path** for the final report.

### 3. Install latest SDK

**REQUIRED — always `@latest`:**

```bash
npm install @tomorrowos/sdk@latest
```

Do **not** run `npm install @tomorrowos/sdk` without `@latest` (may keep a stale lockfile / range).

### 4. Verify `package.json` dependency

Confirm `dependencies["@tomorrowos/sdk"]` reflects a newer / latest range (or exact version after install).

- If `package.json` did not update, set `"@tomorrowos/sdk": "^<installed version>"` and run:

```bash
npm install @tomorrowos/sdk@latest
```

- Confirm `node_modules/@tomorrowos/sdk/package.json` `"version"` is the **current npm latest**.

```bash
node -p "require('./node_modules/@tomorrowos/sdk/package.json').version"
npm view @tomorrowos/sdk version
```

If local version < npm latest, re-run Step 3 until they match.

Record **new SDK version** for the final report.

### 5. Template compare (merge — never blind overwrite)

Compare the project files with the **installed** Vercel starter template:

**Template root:**

`node_modules/@tomorrowos/sdk/templates/cms-starter-v0/`

**Always compare at least:**

| Project file | Template file |
|--------------|---------------|
| `cms-panel/methods.js` | `templates/cms-starter-v0/cms-panel/methods.js` |
| `cms-panel/index.html` | `templates/cms-starter-v0/cms-panel/index.html` |
| `cms-panel/panel.css` | `templates/cms-starter-v0/cms-panel/panel.css` |
| `server.ts` | `templates/cms-starter-v0/server.ts` |
| `cms-app.ts` | `templates/cms-starter-v0/cms-app.ts` |
| `api/index.ts` | `templates/cms-starter-v0/api/index.ts` |
| `vercel.json` | `templates/cms-starter-v0/vercel.json` |

If the project still uses `public/` for the panel (older layout), compare against `templates/cms-starter/public/*` **or** migrate carefully toward `cms-panel/` without breaking Production Output Directory rules.

**Agent behaviour for diffs:**

1. Summarise meaningful differences (new status UI, upload routes, Download Players, Fluid/`vercel.json` tweaks, etc.).
2. Classify each file:

   | Classification | Meaning |
   |----------------|---------|
   | **No merge needed** | Project already has the feature / only whitespace differs |
   | **Safe additive merge** | Template adds new sections the project lacks without conflicting customs |
   | **Needs human decision** | Both sides edited the same regions — do **not** overwrite; propose a patch or ask |

3. **Default:** report the recommendation and wait for confirmation before applying merges that touch customised regions.  
   If the user already said “upgrade and apply safe merges”, apply **only additive / non-conflicting** changes, and list anything skipped.
4. When merging `server.ts` / `cms-app.ts`: preserve existing Env wiring (`SUPABASE_URL` / `DATABASE_URL`, Cloudinary, Blob, `createTomorrowOSStore`, `staticRoot`, `host` / Fluid export). Prefer bringing in new SDK usage patterns without dropping production config.
5. When merging panel files: preserve custom branding, copy, and business-specific UI the starter does not know about.
6. **Never** introduce a second TomorrowOS instance or set Output Directory to `public/`.

**Forbidden:** `cp -r node_modules/@tomorrowos/sdk/templates/cms-starter-v0/* .` or wholesale replace of `cms-panel/` / `api/` / `server.ts`.

### 6. Redeploy / restart

1. Local Preview (if used): restart `npm run start` / `npm run dev:preview` as appropriate.
2. Production: trigger a Vercel **redeploy** so the new dependency and merged files ship.
3. Confirm Fluid Function is still the Production runtime.

### 7. Smoke check (minimal)

After Production is up:

1. `GET /` → Control Panel HTML.
2. `GET /status` → TomorrowOS JSON (not HTML).
3. Playlists / devices still load in the panel.
4. WebSocket upgrade on `/` or `/api` returns **101** when tested (or note if not verified).

**Do not** run long DB/media/WebSocket test suites unless the user asks.

---

## Final report (required)

Tell the user clearly:

1. **SDK version:** `old → new`
2. **Backup path:** where the pre-merge copies live
3. **Template merge:** which files were compared; what was merged / skipped / needs their decision
4. **Data / Env preserved:** confirm media DB and Env Vars were not wiped
5. **Runtime contract:** still one TomorrowOS instance; Fluid Function; Output Directory not `public/`
6. **Smoke:** `/`, `/status`, playlists/devices (yes / no / could not verify + why)
7. **Next step:** use Production URL for pairing; Preview is optional

---

## What not to do

- ❌ `npx @tomorrowos/sdk init` / `npx @tomorrowos/sdk@latest init` / `init --force`
- ❌ Blind overwrite of customised panel / `cms-app.ts` / `api/index.ts`
- ❌ Re-run full `VERCEL_SETUP.md` / `VERCEL_QUESTIONS.md` questionnaire during upgrade
- ❌ Second `new TomorrowOS` in `api/ws.ts`
- ❌ Production = Next / static `public/` / unset Fluid
- ❌ Commit real secrets into git

---

## Failure recovery (upgrade-specific)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Panel looks old after `npm install` | Dependency updated but UI not merged | Diff template `cms-panel/*` → merge carefully from backup/template |
| `Cannot find module '@tomorrowos/sdk'` | Install failed / wrong cwd | Re-run `npm install @tomorrowos/sdk@latest` at project root |
| `/status` returns HTML | Not hitting Fluid Function | Fix `vercel.json` rewrites + Framework = Other; redeploy |
| Playlists/devices empty | Wrong Env / DB wipe | Restore Env Vars; confirm `TOMORROWOS_STORE` + pooler URL unchanged |
| WS fails after upgrade | Second TomorrowOS isolate or Fluid off | One shared export; enable Fluid; verify 101 |

---

## Protocol version

`vercel-upgrade/1.0` — pairs with `@tomorrowos/sdk` packages that ship `templates/cms-starter-v0` and this file.

**Changelog 1.0:** Initial Vercel upgrade-only Agent contract: install `@latest`, backup, template diff/merge against `cms-starter-v0` (no init, no data wipe), keep Fluid runtime contract, redeploy, report versions + smoke.
