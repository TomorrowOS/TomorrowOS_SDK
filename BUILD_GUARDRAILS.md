# Build Guardrails for TomorrowOS CMS Projects

> **These are not suggestions. Every CMS generated from `@tomorrowos/sdk` must include each component in this document. The SDK assumes they exist. If any are missing, pairing will fail, content will not deploy, and the LLM that generated the CMS has produced broken code.**

This document exists because an LLM given a blank canvas will produce a CMS that looks right and doesn't work. This file is the fence that stops that. Read each section. Include each component. Do not skip any.

---

## 1. Server-side WebSocket host

**File:** `server.ts` (or `server.js`)

**Must contain:**

```typescript
import { TomorrowOS } from '@tomorrowos/sdk';
import brand from './brand.json';

const tomorrowos = new TomorrowOS({ brand });

tomorrowos.listen({
  port: Number(process.env.PORT) || 3000,
  host: '0.0.0.0',
});
```

**Why this matters:**

- `TomorrowOS` is a class from the SDK that wraps WebSocket handling, pairing, command envelopes, lifecycle tracking, and event publishing. Do not reimplement any of this.
- `tomorrowos.listen()` binds a WebSocket server that every player connects to. Without this call, no screen can ever pair.
- `host: '0.0.0.0'` is required for Replit / Claude Code / containerised hosting. Do not use `localhost` or `127.0.0.1` in the starter.

**Must not contain:**

- Raw `ws` or `socket.io` imports — the SDK handles WebSocket transport
- Manual pairing code generation — the SDK provides `tomorrowos.pairing.createCode()`
- Manual JWT signing for device tokens — the SDK mints and verifies these

---

## 2. Pairing page

**Route:** `/pair`

**Must include:**

- An input field accepting a 6-digit numeric code (input pattern `\d{6}`)
- A submit button that calls `tomorrowos.pairing.verify(code)` via the SDK
- Success state showing the newly-paired device's name and ID
- Error state for expired, invalid, or already-paired codes
- A link back to the main screens list

**Example flow:**

```typescript
import { useTomorrowOS } from '@tomorrowos/sdk/react';

function PairPage() {
  const { pairing } = useTomorrowOS();
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);

  async function handleSubmit() {
    try {
      const device = await pairing.verify(code);
      setResult({ success: true, device });
    } catch (err) {
      setResult({ success: false, error: err.message });
    }
  }

  return (/* UI here */);
}
```

**Why mandatory:**

Without a pairing page, a device showing an activation code on its screen has no way to tell the CMS "I am device X, please accept me." The CMS will never gain a paired device. Every CMS needs this page regardless of use case.

---

## 3. Screens list page

**Route:** `/` or `/screens`

**Must include:**

- Live list of paired devices from `tomorrowos.devices.list()`
- Online / offline indicator per device (driven by `device.heartbeat` events)
- Last-seen timestamp per device (from heartbeat stream)
- Device name, model, and platform per row
- Click-through to `/screens/[deviceId]`

**Real-time updates:**

The SDK emits `device.online`, `device.offline`, and `device.heartbeat` events. Subscribe to these via `tomorrowos.on('device.online', handler)` to keep the list live without polling.

**Why mandatory:**

This is the operator's primary workspace. Without it, the CMS has paired devices it cannot show.

---

## 4. Per-device control panel

**Route:** `/screens/[deviceId]`

**Must include the following controls, wired to SDK methods:**

### Device info panel (top of page)

Display output of `tomorrowos.device(deviceId).info.get()`:

- Device name
- Platform and platform version
- Hardware model and serial
- Current resolution
- Paired since date

### Control buttons

Each button calls the corresponding SDK method via `tomorrowos.device(deviceId).sendCommand()`:

| Label            | SDK call                                         | Notes                                          |
|------------------|--------------------------------------------------|------------------------------------------------|
| Reboot           | `device.power.reboot()`                          | Confirm dialog before sending                  |
| Deploy content   | Opens URL input → `device.content.setPolicy()`   | Wrap URL as single-item policy; see below      |
| Clear content    | `device.content.clear()`                         | Confirm dialog                                 |
| Screenshot       | `device.display.screenshot()`                    | Only show button if capability supports it     |

### Current content indicator

Poll `tomorrowos.device(deviceId).content.current()` every 10 seconds, or subscribe to `content.started` / `content.finished` events for push updates.

### Deploy content — correct shape

When the user enters a URL to deploy, the SDK call must wrap it as a content policy:

```typescript
await device.sendCommand('device.content.setPolicy', {
  policy: {
    playlists: [{
      id: 'default',
      schedule: {
        startDate: '2026-05-01', // YYYY-MM-DD, optional
        endDate: '2026-05-31',
        daysOfWeek: [1, 2, 3, 4, 5], // 0=Sun … 6=Sat, optional
        start: '09:00', // HH:MM daily window, optional
        end: '17:00',
      },
      items: [{
        url: userProvidedUrl,
        type: 'image',
        durationMs: 30000,
      }],
    }],
    fallback: { type: 'brand' },
  },
});
```

**Do not call** `device.content.deploy(url)` — this method does not exist in V1. Content is declarative policy, not imperative deploy.

**Why mandatory:**

Without the control panel, the CMS is a pretty dashboard with no function. Every TomorrowOS demo, test, and user showcase depends on this page working.

---

## 5. Brand application via `brand.json`

**Brand data MUST flow through `brand.json`**, never hard-coded in components.

### Read brand at startup

```typescript
import brand from './brand.json';
```

### Apply brand via CSS custom properties

Generate a `brand.css` file (or equivalent) on server start that derives CSS variables from `brand.json`:

```css
:root {
  --color-primary: #FF8A3D;       /* from brand.primaryColor */
  --color-background: #FAFAF9;    /* from brand.backgroundColor */
  --color-text: #0A0908;          /* from brand.textColor */
  --font-sans: 'Inter', sans-serif; /* from brand.fontFamily */
}
```

### Use the `useBrand()` hook in React components

```typescript
import { useBrand } from '@tomorrowos/sdk/react';

function Header() {
  const brand = useBrand();
  return (
    <header>
      <img src={brand.logoPath} alt={brand.name} />
      <h1>{brand.name} Signage</h1>
    </header>
  );
}
```

**Must not:**

- Hard-code the brand name, logo path, or colours in any component
- Use inline `style={{ color: '#FF8A3D' }}` — always use the CSS variable
- Reference the TomorrowOS amber or the starter's placeholder colour in production components

**Why mandatory:**

Hard-coded branding means the user has to edit every file to change a colour. `brand.json`-driven branding means one file change propagates everywhere — including into the device's activation screen (baked into the `.wgt` at build time by `tomorrowos build`).

---

## 6. Command envelope

**Every mutating command must go through `sdk.sendCommand(method, params)`.**

The SDK wraps your call with the standard command envelope:

```json
{
  "commandId": "uuid-generated",
  "method": "device.power.reboot",
  "params": {},
  "issuedAt": "2026-05-14T10:30:00Z",
  "ttlSec": 300,
  "idempotencyKey": "uuid-generated",
  "requiresAck": true
}
```

**Must not:**

- Write to the WebSocket directly. If you find yourself typing `ws.send()` or `socket.emit()` in your CMS code, stop — you are bypassing the SDK and your commands will be rejected by the player.
- Construct your own commandId or idempotency logic. The SDK does this.
- Assume a command is complete when `sendCommand` resolves. `sendCommand` returns when the command is `accepted`. Listen for `command.verified` or `command.failed` events to know the final outcome.

---

## 7. No platform-specific branching in CMS code

The CMS must be platform-agnostic. The SDK + capability declarations abstract every platform difference.

**Do not write:**

```typescript
// WRONG
if (device.platform === 'tizen') {
  await device.sendCommand('device.power.reboot');
} else if (device.platform === 'brightsign') {
  await device.sendCommand('device.power.restart');
}
```

**Write:**

```typescript
// CORRECT
await device.sendCommand('device.power.reboot');
```

If the device doesn't support reboot, the SDK returns a `CAPABILITY_NOT_SUPPORTED` error. Handle that error — do not pre-branch on platform.

**Do not:**

- Check `device.platform` or `device.class` to change which methods you call
- Call raw native APIs (there are none exposed to the CMS — only SDK methods)
- Import any `@tomorrowos/player-*` packages into the CMS — those are player-side, not CMS-side

---

## 8. Event subscription for real-time UI

Subscribe to events for live dashboards. Do not poll unless explicitly required.

```typescript
tomorrowos.on('device.online', (event) => {
  // update UI
});

tomorrowos.on('device.heartbeat', (event) => {
  // update last-seen
});

tomorrowos.on('command.verified', (event) => {
  // mark command as successful in UI
});

tomorrowos.on('command.failed', (event) => {
  // show error to operator
});

tomorrowos.on('content.error', (event) => {
  // alert operator of content playback failure
});
```

---

## Optional but strongly recommended

The following are not required but improve the CMS substantially. Include them if the user is at expectedScreens > 10 or if the use case warrants it.

### Build player button

A button in the CMS admin area that runs `npx tomorrowos build --platform tizen` (or other) and links the user to the generated `.wgt` file in `dist/`. Saves the user a terminal step.

### Settings page for `brand.json`

A `/settings` page that lets the user edit brand fields in-UI and writes back to `brand.json`. On save, the CMS reloads the brand.

### Fleet broadcast

A bulk-command UI that uses `tomorrowos.fleet.broadcast(method, params, targets)` to send the same command to many devices at once. Essential at > 50 screens.

### Proof-of-play log

A `/playback` page showing which content played on which screen at what time. Reads from `tomorrowos.device(id).proofOfPlay.getLog()`.

---

## Summary — the "did I build this right?" checklist

Before shipping a generated CMS, verify:

- `server.ts` imports `TomorrowOS` from `@tomorrowos/sdk` and calls `listen()` — ☐
- `/pair` page exists and calls `pairing.verify(code)` — ☐
- `/screens` page shows live device list with online/offline status — ☐
- `/screens/[id]` page has reboot, deploy, clear, current-content at minimum — ☐
- Deploy uses `device.content.setPolicy` with a wrapped policy object, not `content.deploy` — ☐
- `brand.json` exists at project root and drives all UI branding via CSS variables — ☐
- No hard-coded colours, logos, or brand names in components — ☐
- All mutating commands use `sdk.sendCommand()` — no raw WebSocket writes — ☐
- No platform branching in CMS code — ☐
- Event subscriptions for `device.online`, `device.offline`, `device.heartbeat` active — ☐

If every box is checked, the CMS will work on first connection. If any box is unchecked, pairing or control will fail in ways the user cannot diagnose.

---

## Protocol compliance

This guardrails document is version `1.0`, aligned with TomorrowOS wire protocol `1.0`. Future SDK versions may add or strengthen guardrails; they will not relax them without a major-version bump.
