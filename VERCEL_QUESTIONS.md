# Vercel / v0 閳?Verbatim question bank

> **Protocol:** `vercel-questions/1.0` (pairs with `VERCEL_SETUP.md` 1.9+ / `@tomorrowos/sdk` 0.9.50+)  
> **For Agents:** When asking the user a setup question, **copy-paste the block below for that step EXACTLY**.  
> Do **not** paraphrase, reorder, rename options, or invent alternatives (no S3, no Supabase Storage, no 閳ユ窂lob recommended閳? no 閳ユ竸isable media閳?.  
> After each answer, configure per `VERCEL_SETUP.md`, then paste the **next** block.

---

## Q1 閳?Database (paste this entire block)

Which database should TomorrowOS use on Vercel?

**1. Supabase Postgres (recommended)** 閳?durable pairing/playlists; use the **Session pooler** URL (`*.pooler.supabase.com:6543`).

**2. Neon Postgres** 閳?serverless Postgres native to Vercel; use Neon閳ユ獨 **pooled** connection string from the Neon dashboard (not the direct un-pooled host for serverless).

**3. SQLite (`data/tomorrowos.db`)** 閳?**demo / local only on Vercel.** The filesystem is ephemeral; pairings and playlists will not survive redeploys. Only choose this if you understand the limitation.

Reply with **1**, **2**, or **3** (or 閳ユ藩upabase閳?/ 閳ユ罚eon閳?/ 閳ユ藩QLite閳?.

---

## After Q1 閳?agent only (do not ask the user)

| Choice | You set silently | User only provides |
|--------|------------------|--------------------|
| 1 Supabase | `TOMORROWOS_STORE=supabase`, `DATABASE_SSL=true` | `SUPABASE_URL` (pooler) |
| 2 Neon | `TOMORROWOS_STORE=postgres`, `DATABASE_SSL=true` | `DATABASE_URL` (pooled) |
| 3 SQLite | `TOMORROWOS_STORE=sqlite` | confirmation |

Never show blank Env fields for `TOMORROWOS_STORE` or `DATABASE_SSL`.

---

## Q2 閳?Media (paste this entire block)

How should playlist media (images/videos) be stored?

**1. Cloudinary (recommended)** 閳?durable public HTTPS URLs (`https://res.cloudinary.com/...`). Works out of the box with `@tomorrowos/sdk` auto-detection. **Prefer this on Vercel.**

**2. Vercel Blob** 閳?Vercel-native object storage; durable `https://*.public.blob.vercel-storage.com/...` URLs. Use when you want media on the same Vercel project without a Cloudinary account.

**3. Local disk only** 閳?`cms-panel/uploads` or `public/uploads` (OK for quick local tests; **not** for production Vercel fleets 閳?files are ephemeral).

Reply with **1**, **2**, or **3** (or 閳ユ窅loudinary閳?/ 閳ユ钒ercel Blob閳?/ 閳ユ笓ocal閳?.

**Forbidden replacements (never ask these):** Vercel Blob as recommended #1; Supabase Storage; S3 / R2 / B2 / `MEDIA_S3_*`; 閳ユ笜o media storage閳?/ disable uploads.

---

## Q3 閳?Brand (paste this entire block)

Let閳ユ獨 brand your TomorrowOS experience. Choose **one**:

**Option A 閳?Website URL (recommended if you have a site)**  
Paste **one public website URL**. I will use it **only** to fill **`brand.json`**: product name, tagline, primary / secondary / **background** / text colours, fonts, and logo.  
I will **not** rebuild that website or add login 閳?unless you explicitly ask for login/auth later.

**Option B 閳?Manual brand fields**  
Send as many of these as you can (name + at least one colour + logo is ideal):
1. **Product / venue name** (required)
2. **Tagline** (optional)
3. **Primary colour** (hex, e.g. `#FF8A3D`)
4. **Background colour** (hex 閳?page / panel background)
5. **Text colour** (hex, optional 閳?default `#0A0908`)
6. **Secondary / accent colour** (hex, optional)
7. **Logo** 閳?upload SVG/PNG into the project, or a public image URL I can fetch into `./assets/`

Reply with a URL **or** the manual fields. Do not send only a name with no colours/logo unless you want defaults (I will confirm defaults before writing).
