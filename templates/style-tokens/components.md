# Component patterns for TomorrowOS CMSs

> This is a visual seed, not a component library. It shows the LLM generating a CMS what "good" looks like so the output doesn't default to a 1990s admin panel. Reference these patterns when building UI; don't copy them literally.

---

## Design principles

**Restrained.** The CMS is a professional tool, not a consumer app. No gradients, no shadows-on-everything, no animations for their own sake. Information density matters more than visual polish.

**Brand-led.** The primary colour from `brand.json` anchors the interface. Everything else is near-neutral. This lets the operator's brand show through instead of competing with it.

**Status-first.** An operator glances at a dashboard and needs to know: what's online, what's offline, what needs attention. Colour is used for status (green online, red offline, amber warning), never decoration.

**Monospace for technical data.** Device IDs, URLs, IP addresses, timestamps — all monospace. Operators scan these; they should line up visually.

---

## Cards

Use for: device rows, content items, recent activity items.

```html
<article class="card">
  <header class="card-header">
    <span class="status-dot status-online"></span>
    <h3 class="card-title">Melbourne Store — Menu 01</h3>
  </header>
  <dl class="card-meta">
    <dt>Platform</dt><dd>Samsung Tizen 7.0</dd>
    <dt>Last seen</dt><dd>just now</dd>
    <dt>Now playing</dt><dd>Summer menu v3</dd>
  </dl>
</article>
```

```css
.card {
  background: white;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: border-color var(--transition-fast);
}
.card:hover {
  border-color: var(--color-primary);
}
```

Avoid: drop shadows on cards by default, thick borders, rounded corners larger than `--radius-md`.

---

## Buttons

Three variants: primary (brand action), default (neutral action), destructive (dangerous action with confirmation).

```html
<!-- Primary: the main action on a page. One per page max. -->
<button class="btn btn-primary">Pair screen</button>

<!-- Default: most actions -->
<button class="btn">Clear content</button>

<!-- Destructive: deletion, revocation -->
<button class="btn btn-destructive">Unpair device</button>
```

```css
.btn {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-divider);
  background: white;
  color: var(--color-text);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.btn:hover { border-color: var(--color-text); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}
.btn-primary:hover { filter: brightness(0.92); }

.btn-destructive {
  color: var(--color-error);
  border-color: var(--color-error);
}
.btn-destructive:hover { background: var(--color-error-bg); }
```

Avoid: buttons that don't indicate hover or disabled state, text-only buttons (use a link instead), multiple primary buttons on one page.

---

## Status indicators

Small dots or pills indicating device / job / alert state.

```html
<span class="status-dot status-online"></span>
<span class="status-pill status-pill-warning">3 offline</span>
```

```css
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: var(--space-2);
}
.status-online { background: var(--color-success); }
.status-offline { background: var(--color-error); }
.status-warning { background: var(--color-warning); }
.status-unknown { background: var(--color-faint); }

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-2);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  border-radius: var(--radius-pill);
}
.status-pill-success { background: var(--color-success-bg); color: var(--color-success); }
.status-pill-warning { background: var(--color-warning-bg); color: var(--color-warning); }
.status-pill-error { background: var(--color-error-bg); color: var(--color-error); }
```

---

## Tables

For lists where many rows need comparing column-by-column.

```css
table.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.data-table th {
  text-align: left;
  font-weight: var(--weight-medium);
  color: var(--color-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--text-xs);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-divider);
}
.data-table td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-divider);
}
.data-table tr:hover td { background: var(--color-mist); }
.data-table td.mono { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-dim); }
```

Use monospace + dim colour for IDs, timestamps, URLs, hashes.

---

## Forms

```css
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
}
.form-label {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}
.form-input {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
  background: white;
  transition: border-color var(--transition-fast);
}
.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
}
.form-help {
  font-size: var(--text-xs);
  color: var(--color-dim);
}
```

---

## Page layout

Three-section pattern: header, main content, optional right sidebar.

```html
<div class="app-shell">
  <header class="app-header">
    <img src="{brand.logoPath}" alt="{brand.name}" class="app-logo" />
    <nav class="app-nav">
      <a href="/screens">Screens</a>
      <a href="/content">Content</a>
      <a href="/settings">Settings</a>
    </nav>
  </header>
  <main class="app-main">
    <!-- page content -->
  </main>
</div>
```

```css
.app-header {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-3) var(--space-6);
  border-bottom: 1px solid var(--color-divider);
  background: white;
}
.app-logo { height: 24px; }
.app-nav { display: flex; gap: var(--space-4); }
.app-nav a {
  font-size: var(--text-sm);
  color: var(--color-dim);
  text-decoration: none;
}
.app-nav a:hover, .app-nav a.active { color: var(--color-text); }
.app-main { padding: var(--space-8) var(--space-6); max-width: 1200px; margin: 0 auto; }
```

---

## Empty states

When a list has no items yet, show an inviting empty state, not a blank page.

```html
<section class="empty-state">
  <svg class="empty-icon">...</svg>
  <h2>No screens paired yet</h2>
  <p>Install the TomorrowOS player on a screen, then pair it using the code shown on the display.</p>
  <a href="/pair" class="btn btn-primary">Pair your first screen</a>
</section>
```

```css
.empty-state {
  text-align: center;
  padding: var(--space-16) var(--space-6);
  color: var(--color-dim);
}
.empty-state h2 { color: var(--color-text); margin: var(--space-4) 0 var(--space-2); }
.empty-state .btn { margin-top: var(--space-6); }
```

---

## What to avoid

- Glassmorphism / heavy blur / frosted panels — not appropriate for an operations tool
- Gradients on buttons or cards — the primary colour is a flat brand colour, not a gradient
- Icon-only buttons without labels — labels are always clearer for operations work
- More than one "primary" button on a page — primary means *the* action
- Dark mode by default — operators work in retail / restaurant environments under normal lighting; use light mode unless the user explicitly requests dark
- Animations longer than 200ms — they slow operators down
