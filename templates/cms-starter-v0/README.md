# TomorrowOS CMS Starter (Vercel / v0)

This starter is for **Vercel Publish** and **v0**. It follows
[Vercel Functions WebSockets](https://vercel.com/docs/functions/websockets):

- **`cms-app.ts`** — shared `TomorrowOS.listen` + `export const server`
- **`api/index.ts`** — Production Function: `export default server` (Fluid)
- **`server.ts`** — local / Preview: same server (`npm start`)
- **`cms-panel/`** — Control Panel static files (not `public/`)
- **`preview/`** — Next.js shell for v0 Preview only
- **`vercel.json`** — `fluid`, rewrites → `/api`, `maxDuration`

## Scaffold

```bash
npx @tomorrowos/sdk init my-cms --hosting v0
```

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Pairing uses `ws://localhost:3000/` (root path).

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
npx @tomorrowos/sdk init my-cms --hosting replit
```
