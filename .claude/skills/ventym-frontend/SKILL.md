---
name: ventym-frontend
description: Use when adding or changing the server-rendered UI — pages, components, layouts, styles, i18n under src/views/ — or the view routes that fetch data and render. This is the render layer; for the service the route calls, use ventym-backend.
---

# ventym frontend skill

**Design SSOT: `docs/design-system.md`** (read before ANY visual change — mission, brand,
the locked type ladder, color/amber-accent rules, components, a11y, tone). Binding rules:
`docs/RULES.md` R-45–48. No SPA: a server-rendered MPA with `hono/html` in `src/views/`,
styled by a token-driven, **modular** CSS system (`views/styles/{tokens,base,components,index}.ts`)
— modular from day one (the anti-`styles.ts`-monolith rule). Compose existing tokens;
never invent styles or raw hex/px.

## Where things live

| Concern | File(s) |
|---|---|
| One page = one file | `views/pages/<page>.ts` (a pure fn: data → HTML) |
| Shared chrome | `views/components/` (appHeader, …) |
| Page shell | `views/layouts/baseLayout.ts` |
| Tokens + CSS | `views/styles/*` — token-driven; never hardcode hex/px |
| it/en strings | `views/i18n.ts` — every user-facing string is bilingual |
| Route → service → page | `routes/views.ts` (fetch+validate here, render in the page) |

## The contract (violations fail review)

1. **Render layer only.** A page receives already-fetched, already-validated data and returns HTML. NO DB, NO service calls, NO logic inside a view — that's the route's job (the seam law). The route fetches via the real service over `withTenantScope`; **no fake data**.
2. **XSS — escape at the boundary.** `hono/html` escapes interpolations; never build raw HTML strings or set `innerHTML`.
3. **Design tokens, not magic values.** Use the classes from `views/styles/*` (`card`, `table`, `badge`, `badge--ok`, `btn`, `btn--sm`, …). A new hex/px is a design-system violation.
4. **Bilingual + glossary-correct.** Every string through `i18n.ts` (it/en). P2P terms: Vendor=Fornitore, Timesheet=Consuntivo, OdA/RdO…
5. **A11y tier-1:** semantic elements, labelled controls, visible focus, contrast. Workflow-first: lead with friction removed, not aesthetics.
6. **250-line cap** (`gate:size`) — split into per-page/per-component files; never grow a file past it.

## Mandatory flow for a new screen

Add a `listX`/`getX` service method (tenant-scoped) if missing → a `views/pages/<x>.ts` pure render → a `GET /<x>` (and any action POSTs) in `routes/views.ts` calling the REAL service → an `RBAC_POLICY` entry (`gate:rbac`) → a nav link in `appHeader` → i18n keys (it+en).

## Verify by execution

`bun run dev`, log in via `GET /auth/dev` (local), curl/open the route — confirm `200` and that the REAL seeded data renders. Reading the template is not verification.

## Red flags

- "I'll fetch the data here in the page" → no — the route fetches+validates, the page renders.
- A raw hex/px in a page → use a token.
- A hardcoded English string → i18n it (it/en), glossary-checked.
- A page rendering placeholder/fake data → wire the real service or don't ship it.
