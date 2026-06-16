# Ventym — Design System

> Single source of truth for UI/UX. Read before any visual change (humans + agents).
> Every value here is a CSS variable in `src/views/styles/tokens.ts`; components live in
> `src/views/styles/components.ts`. Cited by the **ventym-frontend** skill. Rules: R-45–48.

## 1. Mission

Make ventym **feel** like the enterprise VMS it is: **calm authority, audit-grade
discipline, zero visual noise**. The product wins on the approve→ERP governance loop; the
UI must never be the reason a procurement lead at a tier-1 bank mistrusts it. Quality bar:
**coherence + restraint**, not richness — a screenshot can sit in a board deck unflinching.

## 2. Brand

- **Audience:** Italian enterprise procurement (banca/utility/industria), 35–55; Italian-primary, English-secondary. Vendor delivery managers on mobile second.
- **Tone:** confident, never showy. Editorial restraint, negative space respected. **No** glassmorphism, animated backgrounds, AI gradients, chartjunk, KPI-tile toys.
- Mono (`--mono`) is for **codes/IDs/timestamps only**, never decorative.

## 3. Foundations (tokens — never raw values)

### Color
- **Brand:** `--navy #1e3a8a` (primary buttons, links) · `--navy-bright` (hover) · `--navy-50` (tint).
- **Accent:** `--amber #f59e0b` — the **"a human must act"** signal only (pending-approval pills, focus outline, eyebrows, warnings). `--amber-soft` background.
- **Warm-stone neutrals:** `--surface #fafaf9` (page) · `--raised #fff` (cards) · `--border`/`--border-strong` · `--ink`/`--ink-soft`/`--ink-dim` (text ladder).
- **Semantic (status only, never brand):** `--ok`/`--ok-bg` · `--warn`/`--warn-bg` · `--danger`/`--danger-bg` · `--info`.

### Type ladder — LOCKED (never invent an intermediate size)
`--fs-caption 12` (eyebrows/badges/meta) · `--fs-body 14` (default) · `--fs-lead 16` · `--fs-h3 20` · `--fs-h2 26` · `--fs-h1 32` · `--fs-display 44`. Line height `--lh-tight 1.2` (headings) / `--lh-body 1.55` (prose). Font `--font` (Inter) + `--mono` (JetBrains Mono).

### Space · radius · shadow
Spacing scale `--sp-1…7` (4→48). Radii `--r-sm/md/lg/pill`. One elevation: `--shadow`.

## 4. Components (the vocabulary — compose, don't reinvent)

`card` · `table` (audit-grade rows) · `badge` / `badge--ok` / `badge--danger` (amber for "act") · `btn` / `btn--primary` / `btn--ghost` / `btn--sm` / `btn--lg` / `btn--block` · `input` / `input--sm` · `alert` / `alert--danger` · `topbar` + `brand` · `container` · `stack` · `spread` · `muted` / `small` / `mono`. A new component is a new recipe in `components.ts`, token-driven.

## 5. Accessibility (tier-1 bar — non-negotiable)

Semantic elements; every control labelled; visible `:focus-visible` (amber outline); WCAG-AA contrast (the stone/ink ladder is tuned for it); 44px touch targets on the vendor-mobile path; never color-only status (badge text + color).

## 6. Writing tone

Bilingual it/en via `i18n.ts`, P2P-glossary-correct (Vendor=Fornitore, Timesheet=Consuntivo, OdA/RdO). Imperative, terse, no exclamation. Errors say what to do next, not just what failed.

## 7. Rules (fail review)

1. No raw hex/px in a component — extend or use a token (R-48).
2. Render layer only: a page renders already-fetched data; no DB/logic/**fake data** in a view (R-46).
3. XSS-escape at the boundary; never `innerHTML` (R-47).
4. Every string bilingual + glossary-correct (R-48).
5. 250-line cap per style/page file — modular, never a monolith stylesheet (R-45/60).
6. Verify by **looking at it** (`bun run dev`, open the page) — reading the template is not verification.

## Note on the login screen

Credential entry (password/MFA/SSO) is rendered by **WorkOS AuthKit (hosted)**, not by
ventym — so it's branded in the **WorkOS dashboard → Branding**, not here. ventym owns the
`/login` landing (brand + a single primary CTA → AuthKit) and `/auth/dev` (local). This is
the deliberate buy-not-build identity choice (ADR-003), and it keeps password/MFA out of
our threat surface.
