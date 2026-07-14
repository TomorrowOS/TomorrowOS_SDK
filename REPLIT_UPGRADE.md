# Replit Upgrade Protocol for TomorrowOS CMS

> **This file is a contract for Replit Agent / Replit AI.**  
> Follow it literally. This protocol **upgrades an existing CMS** to the latest `@tomorrowos/sdk`.  
> It is **not** a greenfield setup. Do **not** use `REPLIT_SETUP.md` or `LLM_PROMPT.md` for this flow unless the user explicitly asks for a full re-setup.

---

## User trigger (copy-paste)

When a human pastes a prompt like this, **read this file and execute the upgrade steps immediately** (no questionnaire):

```text
Follow @tomorrowos/sdk REPLIT_UPGRADE.md to upgrade my CMS with the latest SDK.
Do not run init or init --force. Do not delete data/ or public/uploads/.
Compare cms-starter template files and merge carefully — do not blindly overwrite custom changes.
```

Alternate triggers that also activate this protocol:

- “Upgrade TomorrowOS on Replit using REPLIT_UPGRADE.md”
- “Update my CMS to the latest @tomorrowos/sdk”
- “Follow REPLIT_UPGRADE.md”

When any of these triggers fire:

1. **Ignore `LLM_PROMPT.md` and `REPLIT_SETUP.md` questionnaires** — this is an upgrade, not setup Q&A.
2. **Do not** reinvent pairing, WebSocket, or playlist servers.
3. Preserve project data and custom UI/server wiring.

---

## Hard rules (non-negotiable)

1. **Do NOT** run `npx @tomorrowos/sdk init` or `npx @tomorrowos/sdk init --force` (or any command that re-scaffolds / overwrites the project from the starter). That would wipe customisations.
2. **Do NOT** delete `data/` or `public/uploads/` (or move them aside permanently). Pairings, playlists, and local media must survive the upgrade.
3. **Do NOT** invent or rotate Secrets (`SUPABASE_URL`, Cloudinary keys, etc.). Keep existing Secrets / `.env`.
4. **Do NOT** blindly overwrite `public/methods.js`, `public/index.html`, `public/panel.css`, or `server.ts` with template copies. Always **diff → report → merge only with user consent** (or apply surgical patches that preserve custom code).
5. **Do NOT** change artifact `kind` to `api`. CMS must stay a **web** app if already web.
6. **Do NOT** treat Replit Preview Supabase `ENOTFOUND` / `getaddrinfo` as an upgrade failure. Configure-only; DB often works after **Publish**.
7. Prefer **`npm install @tomorrowos/sdk@latest`** over pinning an older version unless the user named a specific version.
8. Keep `tsx` available at runtime (`dependencies`, not only `devDependencies`) if the project already relies on `tsx server.ts`.

---

## Preflight (record before changing anything)

Capture and remember:

| Item | How |
|------|-----|
| **Old SDK version** | `package.json` → `dependencies["@tomorrowos/sdk"]`, and/or `npm ls @tomorrowos/sdk --depth=0` |
| **Run command** | `.replit` `run` / `[deployment].run`, else `package.json` scripts (`dev` / `start`) |
| **Project root** | Confirm `server.ts` (or equivalent) and `public/` exist — this is an existing CMS |

If `@tomorrowos/sdk` is not a dependency, stop and tell the user this project does not look like a TomorrowOS CMS — offer `REPLIT_SETUP.md` instead. Do **not** run `init` unless they explicitly switch to setup.

---

## Upgrade steps (exact order)

### 1. Stop the running server

If a TomorrowOS / `tsx server.ts` / `npm run start|dev` process is active, stop it (Replit Stop / kill the listening process). Port conflicts (`EADDRINUSE`) block a clean restart.

### 2. Backup merge candidates (required)

Before any UI/server merge, copy the current files to a timestamped backup folder under the project (e.g. `.tomorrowos-upgrade-backup/<ISO-timestamp>/`):

- `public/methods.js`
- `public/index.html`
- `public/panel.css`
- `server.ts`

Also back up `package.json` (version pin record).

**Do not** put backups inside `data/` or `public/uploads/`.  
Record the **backup path** for the final report.

### 3. Install latest SDK

```bash
npm install @tomorrowos/sdk@latest
```

### 4. Verify `package.json` dependency

Confirm `dependencies["@tomorrowos/sdk"]` reflects a newer / latest range (or exact version after install).

- If `package.json` did not update, set `"@tomorrowos/sdk": "^<installed version>"` (or `@latest` resolution result) and run:

```bash
npm install
```

- Confirm `node_modules/@tomorrowos/sdk/package.json` `"version"` is the **new** version.

Record **new SDK version** for the final report.

### 5. Template compare (merge — never blind overwrite)

Compare the project files with the **installed** starter template:

**Template root:**

`node_modules/@tomorrowos/sdk/templates/cms-starter/`

**Always compare at least:**

| Project file | Template file |
|--------------|---------------|
| `public/methods.js` | `templates/cms-starter/public/methods.js` |
| `public/index.html` | `templates/cms-starter/public/index.html` |
| `public/panel.css` | `templates/cms-starter/public/panel.css` |
| `server.ts` | `templates/cms-starter/server.ts` |

**Also notice (optional extras in newer SDKs):**

- `public/assets/player-download/*` (Download Players assets)
- Any new starter files that the panel references

**Agent behaviour for diffs:**

1. Summarise meaningful differences (new status UI, buttons, API routes usage, store wiring helpers, CSS classes, etc.).
2. Classify each file:

   | Classification | Meaning |
   |----------------|---------|
   | **No merge needed** | Project already has the feature / only whitespace differs |
   | **Safe additive merge** | Template adds new sections the project lacks (e.g. Server status card, Download Players) without conflicting customs |
   | **Needs human decision** | Both sides edited the same regions — do **not** overwrite; propose a patch or ask |

3. **Default:** report the recommendation and wait for confirmation before applying merges that touch customised regions.  
   If the user already said “upgrade and apply safe merges”, apply **only additive / non-conflicting** changes, and list anything skipped.
4. When merging `server.ts`: preserve existing Secrets wiring (`SUPABASE_URL`, Cloudinary, `createTomorrowOSStore`, `staticRoot`, `host: "0.0.0.0"`, `PORT`). Prefer bringing in new SDK usage patterns without dropping production config.
5. When merging panel files: preserve custom branding, copy, and business-specific UI the starter does not know about.

**Forbidden:** `cp -r node_modules/@tomorrowos/sdk/templates/cms-starter/* .` or wholesale replace of `public/` / `server.ts`.

### 6. Restart the server

Start with the project’s normal Replit run command:

1. Prefer `.replit` `run` value if present.
2. Else `npm run start` if that is the Deploy / Publish entrypoint.
3. Else `npm run dev` for iterative Preview (starter default).

Confirm logs show something like `[TomorrowOS] listening on http://0.0.0.0:<port>`.

### 7. Smoke check (minimal)

After the server is up:

1. Preview Control Panel at `/` loads.
2. Check playlists still load (`GET /playlists` or panel Playlists list).
3. Check devices still load (`GET /devices` or Paired devices section).
4. If the new SDK includes Server status UI, note that Supabase may show **Warning** in Replit Preview (`ENOTFOUND`) — that is expected; not an upgrade failure.

**Do not** run long Supabase/Cloudinary/WebSocket test suites.

---

## Final report (required)

Tell the user clearly:

1. **SDK version:** `old → new` (e.g. `0.9.5 → 0.9.8`)
2. **Backup path:** where the pre-merge copies live
3. **Template merge:** which files were compared; what was merged / skipped / needs their decision
4. **Data preserved:** confirm `data/` and `public/uploads/` were not deleted
5. **Runtime:** which command restarted the server
6. **Smoke:** whether playlists and devices still load (yes / no / could not verify + why)
7. **Next step:** re-Publish the Repl if they use Deployments, so production picks up the new dependency and merged UI

---

## What not to do

- ❌ `npx @tomorrowos/sdk init` / `init --force`
- ❌ Delete or empty `data/`, `public/uploads/`, or SQLite DB files
- ❌ Blind overwrite of customised panel / `server.ts`
- ❌ Re-run full `REPLIT_SETUP.md` questionnaire during upgrade
- ❌ “Fix” Supabase by removing `SUPABASE_URL` because Preview logs show `ENOTFOUND`
- ❌ Switch Publish mode to Static-only or artifact `kind = "api"`
- ❌ Commit real secrets into git

---

## Failure recovery (upgrade-specific)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Panel looks old after `npm install` | Dependency updated but UI not merged | Diff template `public/*` → merge carefully from backup/template |
| `Cannot find module '@tomorrowos/sdk'` | Install failed / wrong cwd | Re-run `npm install @tomorrowos/sdk@latest` at project root |
| Playlists/devices empty after upgrade | Accidental DB wipe or wrong Secrets | Restore `data/` from backup/hosting; confirm `SUPABASE_URL` / `TOMORROWOS_STORE` unchanged |
| `EADDRINUSE` | Old server still running | Stop old process, restart once |
| Preview Supabase Warning / ENOTFOUND | Replit Preview DNS | Expected — validate on published URL |

---

## Protocol version

`replit-upgrade/1.0` — pairs with `@tomorrowos/sdk` packages that ship `templates/cms-starter` and this file.

**Changelog 1.0:** Initial upgrade-only Agent contract: install `@latest`, backup, template diff/merge (no init, no data wipe), restart, report versions + smoke.
