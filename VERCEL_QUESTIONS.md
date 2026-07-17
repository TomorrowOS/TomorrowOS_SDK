# Vercel / v0 — Verbatim question bank

> **Protocol:** `vercel-questions/1.0` (pairs with `VERCEL_SETUP.md` 1.9+ / `@tomorrowos/sdk` 0.9.35+)  
> **For Agents:** When asking the user a setup question, **copy-paste the block below for that step EXACTLY**.  
> Do **not** paraphrase, reorder, rename options, or invent alternatives (no S3, no Supabase Storage, no “Blob recommended”, no “disable media”).  
> After each answer, configure per `VERCEL_SETUP.md`, then paste the **next** block.

---

## Q1 — Database (paste this entire block)

Which database should TomorrowOS use on Vercel?

**1. Supabase Postgres (recommended)** — durable pairing/playlists; use the **Session pooler** URL (`*.pooler.supabase.com:6543`).

**2. Neon Postgres** — serverless Postgres native to Vercel; use Neon’s **pooled** connection string from the Neon dashboard (not the direct un-pooled host for serverless).

**3. SQLite (`data/tomorrowos.db`)** — **demo / local only on Vercel.** The filesystem is ephemeral; pairings and playlists will not survive redeploys. Only choose this if you understand the limitation.

Reply with **1**, **2**, or **3** (or “Supabase” / “Neon” / “SQLite”).

---

## After Q1 — agent only (do not ask the user)

| Choice | You set silently | User only provides |
|--------|------------------|--------------------|
| 1 Supabase | `TOMORROWOS_STORE=supabase`, `DATABASE_SSL=true` | `SUPABASE_URL` (pooler) |
| 2 Neon | `TOMORROWOS_STORE=postgres`, `DATABASE_SSL=true` | `DATABASE_URL` (pooled) |
| 3 SQLite | `TOMORROWOS_STORE=sqlite` | confirmation |

Never show blank Env fields for `TOMORROWOS_STORE` or `DATABASE_SSL`.

---

## Q2 — Media (paste this entire block)

How should playlist media (images/videos) be stored?

**1. Cloudinary (recommended)** — durable public HTTPS URLs (`https://res.cloudinary.com/...`). Works out of the box with `@tomorrowos/sdk` auto-detection. **Prefer this on Vercel.**

**2. Vercel Blob** — Vercel-native object storage; durable `https://*.public.blob.vercel-storage.com/...` URLs. Use when you want media on the same Vercel project without a Cloudinary account.

**3. Local disk only** — `cms-panel/uploads` or `public/uploads` (OK for quick local tests; **not** for production Vercel fleets — files are ephemeral).

Reply with **1**, **2**, or **3** (or “Cloudinary” / “Vercel Blob” / “local”).

**Forbidden replacements (never ask these):** Vercel Blob as recommended #1; Supabase Storage; S3 / R2 / B2 / `MEDIA_S3_*`; “no media storage” / disable uploads.

---

## Q3 — Brand (paste this entire block)

Let’s brand your TomorrowOS experience. Choose **one**:

**Option A — Website URL (recommended if you have a site)**  
Paste **one public website URL**. I will use it **only** to fill **`brand.json`**: product name, tagline, primary / secondary / **background** / text colours, fonts, and logo.  
I will **not** rebuild that website or add login — unless you explicitly ask for login/auth later.

**Option B — Manual brand fields**  
Send as many of these as you can (name + at least one colour + logo is ideal):
1. **Product / venue name** (required)
2. **Tagline** (optional)
3. **Primary colour** (hex, e.g. `#FF8A3D`)
4. **Background colour** (hex — page / panel background)
5. **Text colour** (hex, optional — default `#0A0908`)
6. **Secondary / accent colour** (hex, optional)
7. **Logo** — upload SVG/PNG into the project, or a public image URL I can fetch into `./assets/`

Reply with a URL **or** the manual fields. Do not send only a name with no colours/logo unless you want defaults (I will confirm defaults before writing).
