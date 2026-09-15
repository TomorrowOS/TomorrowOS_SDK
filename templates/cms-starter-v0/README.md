# TomorrowOS CMS Starter (Vercel / v0)

This starter is for **Vercel Publish** and **v0**. It follows
[Vercel Functions WebSockets](https://vercel.com/docs/functions/websockets):

- **`cms-app.ts`** — shared `TomorrowOS.listen` + `export const server`
- **`api/index.ts`** — Production Function: `export default server` (Fluid)
- **`server.ts`** — local / Preview: same server (`npm start`)
- **`cms-panel/`** — Control Panel static files (not `public/`)
- **`preview/`** — Next.js shell for v0 Preview only
- **`vercel.json`** — `fluid`, rewrites → `/api`, `maxDuration`

**Publish settings (critical):**
- **Output Directory** = empty / unset (never `public/`)
- **Build Command** = empty / skip (`"buildCommand": ""` in `vercel.json`) — a defined no-op `npm run build` forces Vercel static-build mode and requires `public/`
- If the build fails with `The Output Directory "public" is empty` (or public not found): clear Output Directory **and** set Build Command to empty — do **not** add filler files under `public/`

## Scaffold

```bash
npx @tomorrowos/sdk@latest init my-cms --hosting v0
```

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Pairing uses `ws://localhost:3000/` (root path).

### Optional CMS password

Set `CMS_PASSWORD` in `.env` or Vercel/Replit Secrets to lock the admin UI. Leave unset for open admin. Sign in at `/login` when enabled.

### v0-style Preview

```bash
npm run dev:preview
```

Pair devices against the **Publish URL**, not Preview.

## Production acceptance

1. `GET /status` → JSON  
2. `GET /` → Control Panel  
3. WebSocket upgrade on `/` or `/api` → **101** (not 200 HTML)

TV endpoint: `https://YOUR.vercel.app/` (players also try `/api` on `*.vercel.app`).

## Replit / Railway

Use the default starter (unchanged Node listen, no `api/` Function):

```bash
npx @tomorrowos/sdk@latest init my-cms --hosting replit
```
