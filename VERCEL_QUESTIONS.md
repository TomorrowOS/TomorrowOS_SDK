# Vercel / v0 - Verbatim question bank

> **Protocol:** `vercel-questions/1.8` (pairs with `VERCEL_SETUP.md` 1.19+ / `@tomorrowos/sdk` 0.9.70+)  
> **For Agents:** When asking the user a setup question, **copy-paste the block below for that step EXACTLY**.  
> Do **not** paraphrase, reorder, rename options, or invent alternatives (no S3, no Supabase Storage, no "Blob recommended", no "disable media").  
> After each answer, configure per `VERCEL_SETUP.md`, then paste the **next** block.  
> **Q1 and Q2 are choice questions — present them as a clickable choice UI** (buttons / radio / option cards) using the exact option labels below. Do **not** ask the user to type `1` or `2` in chat when a choice UI is available (chat typing is fallback only).  
> **Q3 is a form only - never a multiple-choice question.**  
> **Q4 is optional CMS password (`CMS_PASSWORD`) — immediately after Q3, no yes/no prelude.** Open the password Env/Secret input; blank/skip is valid.  
> **HARD STOP on Q3:** show the form, then **wait** for the user's reply. Optional fields do **not** mean you may auto-skip.  
> **Q4 is optional:** blank/skip is valid; they can set `CMS_PASSWORD` later.  
> **After Q4 (or after Q3 if you deferred Q4):** run `VERCEL_SETUP.md` **IRON GATE — v0 Preview hygiene** before debugging Neon/Postgres or Blob.

---

## Q1 - Database (clickable choice UI — paste option text exactly)

**UX:** Open a **clickable choice UI** (two option buttons / radio cards). Labels must match the bold titles below.

Which database should TomorrowOS use on Vercel?

**1. Supabase Postgres (recommended)** - durable pairing/playlists; use the **Session pooler** URL (`*.pooler.supabase.com:6543`).

**2. Neon Postgres** - serverless Postgres native to Vercel; use Neon's **pooled** connection string from the Neon dashboard (not the direct un-pooled host for serverless).

**Fallback only** (no choice UI available): Reply with **1** or **2** (or "Supabase" / "Neon").

---

## After Q1 - agent only (do not ask the user)

| Choice | You set silently | User only provides |
|--------|------------------|--------------------|
| 1 Supabase | `TOMORROWOS_STORE=supabase`, `DATABASE_SSL=true` | `SUPABASE_URL` (pooler) |
| 2 Neon | `TOMORROWOS_STORE=postgres`, `DATABASE_SSL=true` | `DATABASE_URL` (pooled) |

Never show blank Env fields for `TOMORROWOS_STORE` or `DATABASE_SSL`.

---

## Q2 - Media (clickable choice UI — same pattern as Q1)

**UX:** Open a **clickable choice UI** (two option buttons / radio cards). **Forbidden when UI exists:** chat-only “Reply with **1** or **2**”.

How should playlist media (images/videos) be stored?

**1. Cloudinary (recommended)** - durable public HTTPS URLs (`https://res.cloudinary.com/...`). Works out of the box with `@tomorrowos/sdk` auto-detection. **Prefer this on Vercel.**

**2. Vercel Blob** - Vercel-native object storage; durable `https://*.public.blob.vercel-storage.com/...` URLs. Use when you want media on the same Vercel project without a Cloudinary account.

**Fallback only** (no choice UI available): Reply with **1** or **2** (or "Cloudinary" / "Vercel Blob").

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

After the user submits (including all-blank) or says "skip": apply `brand.json`, then open **Q4 immediately** (CMS_PASSWORD Env input — **no** yes/no prelude). **Do not** re-ask Q3 a second time.
Blank fields -> keep existing `brand.json`. Logo blank -> `./assets/logo.svg`.

---

## Q4 - Optional CMS password (Env input immediately after Q3)

**IRON RULE — no prelude:** Right after Q3, open the **CMS_PASSWORD** Env/Secret input. **Forbidden first:** "Do you want a password?", "Enable auth?", "Protect the CMS?", Option A/B yes/no.

**UX (required):** One Env/Secret field labeled **`CMS_PASSWORD`** (password input). User may enter a password **or** leave blank / skip.

**Title / helper:**

Optional CMS password — Environment Variable **`CMS_PASSWORD`**.

Enter a password to lock the Control Panel, or leave blank / skip to keep the panel open. You can add `CMS_PASSWORD` later in Vercel → Settings → Environment Variables and redeploy.

**Notes for the agent (do not invent extra UX):**
- This is **optional**. Blank/skip is a valid complete answer.
- If set: store as Vercel Env `CMS_PASSWORD` only (Control Panel auth). Never echo the password back in chat summaries.
- Do **not** enable Vercel Deployment Protection / whole-site password (breaks Tizen/BrightSign).
- Devices still use WebSocket / brand / uploads without this password.

---

## After Q4 - agent only (do not ask the user)

| Reply | You do |
|-------|--------|
| blank / skip / later / no | Omit `CMS_PASSWORD` |
| non-empty password | Set Env `CMS_PASSWORD` (Production + Preview as needed), then continue execution |

Never commit the password. Never enable host-wide password protection as a substitute.
