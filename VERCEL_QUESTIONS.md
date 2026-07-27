# Vercel / v0 - Verbatim question bank

> **Protocol:** `vercel-questions/1.5` (pairs with `VERCEL_SETUP.md` 1.14+ / `@tomorrowos/sdk` 0.9.69+)  
> **For Agents:** When asking the user a setup question, **copy-paste the block below for that step EXACTLY**.  
> Do **not** paraphrase, reorder, rename options, or invent alternatives (no S3, no Supabase Storage, no "Blob recommended", no "disable media").  
> After each answer, configure per `VERCEL_SETUP.md`, then paste the **next** block.  
> **Q1 and Q2 are choice questions. Q3 is a form only - never a multiple-choice question.**  
> **HARD STOP on Q3:** show the form, then **wait** for the user's reply. Optional fields do **not** mean you may auto-skip.

---

## Q1 - Database (paste this entire block)

Which database should TomorrowOS use on Vercel?

**1. Supabase Postgres (recommended)** - durable pairing/playlists; use the **Session pooler** URL (`*.pooler.supabase.com:6543`).

**2. Neon Postgres** - serverless Postgres native to Vercel; use Neon's **pooled** connection string from the Neon dashboard (not the direct un-pooled host for serverless).

Reply with **1** or **2** (or "Supabase" / "Neon").

---

## After Q1 - agent only (do not ask the user)

| Choice | You set silently | User only provides |
|--------|------------------|--------------------|
| 1 Supabase | `TOMORROWOS_STORE=supabase`, `DATABASE_SSL=true` | `SUPABASE_URL` (pooler) |
| 2 Neon | `TOMORROWOS_STORE=postgres`, `DATABASE_SSL=true` | `DATABASE_URL` (pooled) |

Never show blank Env fields for `TOMORROWOS_STORE` or `DATABASE_SSL`.

---

## Q2 - Media (paste this entire block)

How should playlist media (images/videos) be stored?

**1. Cloudinary (recommended)** - durable public HTTPS URLs (`https://res.cloudinary.com/...`). Works out of the box with `@tomorrowos/sdk` auto-detection. **Prefer this on Vercel.**

**2. Vercel Blob** - Vercel-native object storage; durable `https://*.public.blob.vercel-storage.com/...` URLs. Use when you want media on the same Vercel project without a Cloudinary account.

Reply with **1** or **2** (or "Cloudinary" / "Vercel Blob").

**Forbidden replacements (never ask these):** Vercel Blob as recommended #1; Supabase Storage; S3 / R2 / B2 / `MEDIA_S3_*`; "no media storage" / disable uploads; local disk only.

---

## Q3 - Brand form (NOT a question - open this form, then WAIT)

**STOP - read before doing anything for branding:**

1. Q3 is **not** a chat multiple-choice step.
2. **Do not** ask: "Want to customize branding?", "Option A / Option B", "skip or customize?", or any other choice first.
3. **Do not** open a form with only Product Name + Primary colour (or any subset).
4. **Immediately** open **one** multi-input form with **all seven fields visible at the same time**.
5. **HARD STOP and WAIT** for the user to submit the form, reply with values, or say **"skip"**.  
   - Fields being optional means blanks keep defaults **after** the user responds.  
   - Fields being optional does **NOT** mean you may continue scaffolding without a user reply.  
   - **Forbidden:** "fields are optional so I'll proceed with defaults" / auto-skip / thinking past Q3 in the same turn.

**Title:** Brand your TomorrowOS experience  
**Helper:** All fields optional. Leave blank to keep starter brand.json defaults. Submit once (or reply "skip"). I will wait for your reply before continuing setup.

**Create exactly these seven controls - all on screen together (no Next / no wizard steps):**

| # | Exact label | Control |
|---|-------------|---------|
| 1 | Product Name | text input |
| 2 | Tagline | text input |
| 3 | Primary colour | text input (placeholder `#FF8A3D`) |
| 4 | Background colour | text input (placeholder `#FAFAF9`) |
| 5 | Text colour | text input (placeholder `#0A0908`) |
| 6 | Secondary colour | text input (placeholder `#F5F3EF`) |
| 7 | Logo | **Upload** (file picker, SVG/PNG) **above** **Logo URL** (text input) |

**Pass / fail check before showing the user:** count the text inputs. If you see fewer than **six** text fields (Product Name, Tagline, Primary, Background, Text, Secondary) plus the Logo Upload+URL row, **do not show it** - rebuild the form with all seven.

**Forbidden Q3 UIs / behaviors:**

- Any multiple-choice / radio / "1 or 2" / Option A vs B
- A preliminary question before the form
- Only Name + Primary colour (or any 1-2 field subset)
- One freeform / Other box for all brand values
- Field-by-field Next wizard
- Auto-continuing to init/scaffold/deploy without a user Q3 reply or explicit "skip"
- Interpreting "do not re-ask" as "do not wait for the first reply"

After the user submits (including all-blank) or says "skip": apply `brand.json`, then continue. **Do not** re-ask Q3 a second time.
Blank fields -> keep existing `brand.json`. Logo blank -> `./assets/logo.svg`.
