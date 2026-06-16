---
name: ventym-backend
description: Use when adding or changing any route, service, repo, middleware, or business logic under src/ — feature work, bug fixes, refactors in the backend. The default backend skill; for the JSON API/OpenAPI/MCP surface use ventym-api-mcp, for src/views/ UI use ventym-frontend, for authz/RLS/sessions use ventym-auth-tenancy, for schema/migrations use ventym-data-model.
---

# ventym backend skill

SSOT for the rules is `ARCHITECTURE.md`. The app is a layered modular monolith on
Cloudflare Workers + Hono. Extend the existing seams; never add a parallel pattern.

## The seam law (violations fail review)

| Layer | Does | Never |
|---|---|---|
| `routes/` | parse → `requireSession` → ONE service call → format | DB access, business logic, vendor SDKs |
| `services/<domain>/` | rules; returns `Result<T, DomainError>`; I/O via `deps.ts` | direct vendor/SDK/Drizzle imports |
| `tools/` | all external I/O behind adapter types (`tools/db/*Repo`, `tools/erp`, `tools/workos`) | business rules |
| `utils/` | pure functions (`result`, `ids`, `hash`, `logger`) | importing services/tools/routes |

## Mandatory flow for a feature

1. **Zod schema first** in `services/<domain>/schema.ts`; types are `z.infer`. Validate once at the boundary, trust inside.
2. **Errors are `Result<T,E>`** (`utils/result.ts`) with a discriminated `DomainError` union + a `httpError.ts` that maps each kind to a registered `DomainCode` (exhaustive `switch`, `never` default). Throw only at true boundaries.
3. **New route ⇒ entry in `src/config/rbacPolicy.ts` same change** — `gate:rbac` boots the app and fails on any ungoverned route; the runtime 403s undeclared routes (fail-closed).
4. **Mutations run inside `withTenantScope`** (sets the 3 RLS GUCs); **reads also carry the explicit `tenantId` predicate** in the repo (defence-in-depth).
5. **State change ⇒ an event in `event_log` (transactional outbox) in the SAME tx**; the `eventId` is the idempotency key (replay = no-op).
6. **Verify by execution:** `bun run ci` green, then hit the endpoint (`bun run dev`, curl). Reading is not verification.

## Hard limits & style (CI-enforced — 5 gates)

250-line files (`gate:size`) / ~40-line functions / 3 params then options object. No `any` (use `unknown`), no `as` except branded IDs, no `enum`/`pgEnum`, no `class` except Errors, no `console.*` (use `logger`), no `process.env` in `src/` (use `parseConfig`) — `gate:discipline` fails these. Named exports; `type` over `interface`; discriminated unions everywhere; early returns, nesting ≤ 3.

## The canonical slice (copy its shape)

`db/schema/<agg>.ts` → `tools/db/<agg>Repo.ts` → `services/<agg>/{schema,machine,service,deps,httpError}.ts` → `routes/api/v1/<agg>.ts` + `routes/views.ts` + an MCP tool via the capability registry. Work Order is the template.

## Red flags

- "Just one quick query in the route" → repo + service, always.
- "Add the rbacPolicy entry later" → `gate:rbac` fails and the route 403s at runtime.
- A repo read without `tenantId` in the WHERE → cross-tenant leak risk on the read path.
- `throw` for control flow → return a `Result` err; throw only at boundaries.
- Importing `db/schema` row types into a route handler → keep DB types in repos/services.
