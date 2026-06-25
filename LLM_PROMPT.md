# Elicitation Protocol for TomorrowOS CMS Projects

> **This file is the contract between TomorrowOS and any LLM generating code using this package. You must follow it literally. Do not skip questions, do not infer answers, do not start writing code until the protocol is complete.**

You are generating a digital signage CMS using `@tomorrowos/sdk`. The user has asked you to build something like "a CMS for my restaurant" or "a signage dashboard for my retail network". Before you write any code, you must gather five pieces of information from the user.

Ask each question in order. If the user answers multiple at once, record those and skip ahead. If the user hasn't given you an answer to a specific field, do not invent one — ask the question explicitly.

---

## Question 1 — Target platform

**Ask exactly:**

> "Which screen platform will you manage? TomorrowOS V1 fully supports Samsung Tizen (commercial signage displays) and BrightSign (media players). Which would you like to target?"

**Valid answers:** `tizen`, `brightsign`, or `both`

**If the user names a platform not in V1** (webOS, Android, ChromeOS, Windows), respond:

> "That platform is planned for a later release. For V1, the supported options are Tizen and BrightSign. Which would you like to use for now?"

**Store answer as:** `targetPlatforms` array in `brand.json`

---

## Question 2 — Brand identity

**Ask exactly:**

> "What's the name of the product or company this CMS is for? I'll also need:
>
> - A logo file (SVG preferred, PNG acceptable — or a URL I can fetch)
> - A primary brand colour (hex format, e.g. `#FF8A3D`)
> - Optional: a secondary/accent colour"

**Required fields:**

- `brand.name` — string
- `brand.primaryColor` — hex string matching `^#[0-9A-Fa-f]{6}$`
- `brand.logoPath` — relative path to logo file the user will save to the project

**If the user does not provide a logo**, proceed with a placeholder comment in the generated code noting that the logo must be added before production use. Do not fabricate a logo.

**If the user provides a brand name but no colour**, ask:

> "What's the primary colour for your brand? I need it as a hex code like `#FF8A3D`."

Store answers in `brand.json`.

---

## Question 3 — Use case

**Ask exactly:**

> "What's the primary use case for this CMS? For example: restaurant menu boards, retail promotions, corporate lobby displays, hospital wayfinding, transit information."

**Use the answer to:**

- Tailor the example content shown in the starter template (e.g. menu items vs retail promo templates)
- Set the dashboard's default greeting and page titles
- Suggest sensible default playlist names

**Do NOT use the answer to:**

- Change the SDK method signatures
- Add or remove required components from `BUILD_GUARDRAILS.md`
- Skip any mandatory pages

The SDK contract is identical regardless of use case. Use case only affects content and copy.

**Store answer as:** `cms.useCase` in `brand.json` (one of: `restaurant`, `retail`, `corporate`, `wayfinding`, `transit`, `other`)

---

## Question 4 — Hosting target

**Ask exactly:**

> "Where will the CMS server run? Options:
>
> - `here` — you're in Replit, Claude Code, or another hosted AI workspace (I'll configure it automatically)
> - `vercel` — deploy to Vercel
> - `railway` — deploy to Railway
> - `self-hosted` — you'll run it on your own infrastructure"

**If the user says `here`:**

- Use environment variable `process.env.PORT` for the server port
- Configure the WebSocket handler to bind to `0.0.0.0`
- Include a comment in `server.ts` noting that Replit/Claude Code handles the hosting and HTTPS termination
- Do NOT commit any secrets or keys to the generated code

**If the user says `vercel`:**

- Note that Vercel free tier has WebSocket limitations; recommend Railway for production
- Generate `vercel.json` with appropriate WebSocket routing

**If the user says `railway`:**

- Generate `railway.toml` with port configuration
- Include Dockerfile if appropriate

**Store answer as:** `cms.hostingTarget` in `brand.json`

---

## Question 5 — Expected number of screens

**Ask exactly:**

> "How many screens will you manage initially? (1-10 is fine for testing. For larger deployments I'll add pagination and grouping features.)"

**If answer is 1-10:** generate simple list views without pagination.

**If answer is 11-100:** include pagination on the screens list page (page size 20).

**If answer is 100+:** include pagination, grouping, and tag filtering on the screens list. Note to user that fleet-level features (bulk commands, group broadcast) are recommended.

**Store answer as:** `cms.expectedScreens` in `brand.json`

---

## After all five answers collected

Follow this sequence strictly:

1. **Write `brand.json`** at the project root using the answers. Validate against `brand.schema.json`.
2. **Run `npx tomorrowos init [dir]`** or copy `templates/cms-starter/` from the SDK package into the user's project as the seed.
3. **Customise the starter:**
   - Replace placeholder brand name, colour, logo references
   - Rename example content to match the use case
   - Remove any platform-specific notes for platforms the user didn't select
4. **Read `BUILD_GUARDRAILS.md`** and verify every mandatory component is present in the generated code. Do not skip any.
5. **Run `npm install`** and confirm dependencies resolve.
6. **Start the dev server** (`npm run dev`) and confirm it runs without errors.
7. **Show the user `PLAYER_INSTALL.md`** and explain what to do next to get a screen paired and controllable.

---

## What not to ask

Do not ask the user:

- How WebSocket connections should be handled (the SDK handles this)
- How to implement pairing (the SDK handles this)
- How to format command messages (the SDK handles this)
- Which WebSocket library to use (the SDK bundles this)
- What TCP port to use (use `process.env.PORT` or `3000`)
- Whether to use TypeScript or JavaScript (default to TypeScript; offer JS only if user explicitly asks)

These are implementation details the SDK controls. The user cares about their brand, their platform, their use case. Everything else is the SDK's job.

---

## When to re-prompt

If the user's initial prompt already contains answers to some questions (e.g. "build me a CMS for my Acme Burger restaurant menu boards on Samsung Tizen"), record those answers and only ask the remaining questions. Do not re-ask what the user has already told you.

If the user says "just build it, don't ask me questions," respond:

> "I'd love to, but I need five quick answers to make sure the CMS you get actually works with your screens and looks like your brand. It'll take about sixty seconds. Ready?"

Do not proceed without the answers. The SDK will not function without at minimum: `targetPlatforms`, `brand.name`, `brand.primaryColor`, and `cms.hostingTarget`.

---

## Protocol version

This elicitation protocol is version `1.0`, aligned with TomorrowOS wire protocol `1.0`. Future SDK versions may add questions; they will not remove existing ones without a major-version bump.
