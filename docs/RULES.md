# Ventym — Binding Architecture Rules (the register)

> The single, numbered, auditable source of truth for *how ventym is built*. Skills
> cite these R-numbers; PRs reference them; code review enforces them; CI gates the
> mechanical ones. A rule that only orients is theater — every rule here is either
> **[GATE]** (CI-enforced), **[REVIEW]** (a reviewer blocks on it), or **[ADR]**
> (a recorded decision). Audience bar: tier-1 bank / insurer change-management.

Legend: **[GATE]** mechanically enforced · **[REVIEW]** human-enforced · **[ADR]** decision of record.

---

## 1. Layering & seams (the modular monolith)

- **R-1 [REVIEW]** Four layers, one direction: `routes → services → tools → utils`. A layer never imports "up".
- **R-2 [REVIEW]** `routes/` only: parse → `requireSession` → **one** service call → format. No DB, no business logic, no vendor SDKs in a route.
- **R-3 [REVIEW]** `services/<domain>/` own all business rules and return `Result<T, DomainError>`. All I/O is injected via `deps.ts` (`typeof`-bound); a service never imports a vendor SDK or Drizzle directly.
- **R-4 [REVIEW]** `tools/` own all external I/O behind adapter types (`tools/db/*Repo`, `tools/erp`, `tools/workos`, `tools/secrets`). No business rules in a tool.
- **R-5 [GATE]** `utils/` are pure; they never import services/tools/routes (`gate:discipline` extension + review).
- **R-6 [REVIEW]** One aggregate = one schema file = one repo = one service folder = one MCP tool family. Hold any vertical slice in your head.
- **R-7 [REVIEW]** Extend an existing seam; never introduce a parallel pattern for the same concern.

## 2. Errors & control flow

- **R-10 [REVIEW]** Domain failures are `Result<T,E>` (`utils/result.ts`) with a discriminated `DomainError` union; `throw` only at true boundaries.
- **R-11 [GATE]** Every `DomainError` kind maps to a registered `DomainCode` via `services/<domain>/httpError.ts` with an exhaustive `switch` (`never` default). Unregistered code ⇒ `resolveError` throws (drift guard).
- **R-12 [REVIEW]** Client-facing errors are **problem+json** from `types/errorRegistry.ts` (`{error:{code,grpc,message,trace_id,…}}`). No inline status invention, no bespoke error shape.

## 3. Auth, tenancy, RLS (the moat — highest consequence)

- **R-15 [GATE]** Every route appears in `config/rbacPolicy.ts`. Absent ⇒ DENIED (fail-closed). `gate:rbac` boots the app and fails on any ungoverned route.
- **R-16 [REVIEW]** **Roles come from the `membership` table, never WorkOS.** WorkOS authenticates (feed-only); ventym authorizes. The broker is swappable in one file (`tools/workos/client.ts`).
- **R-17 [GATE]** Mutations run inside `withTenantScope` (sets all **3 GUCs**: tenant+user+session). Unset GUC ⇒ NULL ⇒ zero rows.
- **R-18 [GATE/ADR]** App connects as the **non-owner `vms_app`**; `assertRlsEnforced` boot-fails if the role can bypass RLS. Migrations/seed run as the owner. No service-role backdoor, ever.
- **R-19 [GATE]** Every tenant read also carries the explicit `tenantId` predicate in the repo WHERE (defence-in-depth; the read path may skip the tx). *(Target gate: tenant-predicate AST.)*
- **R-20 [REVIEW]** Session is re-resolved every request (revoke-immediately); never cache derived authz state (roles/membership). Suspension/role change takes effect on the next request.
- **R-21 [REVIEW]** Least privilege: tokens/agents get the narrowest role for the task; no generic super-role.

## 4. Data model

- **R-24 [GATE]** Migrations are **generated** (`bun run db:generate`; valid meta) + the **RLS block hand-appended** to the generated SQL, copied from the prior migration's tail.
- **R-25 [GATE]** Every tenant-scoped mutable table: `tenant_id NOT NULL` + `ENABLE ROW LEVEL SECURITY` + isolation policy **in the same migration**; `tenant_id` first in every composite index. *(Target gate: RLS-coverage.)*
- **R-26 [REVIEW]** `version int` for optimistic concurrency on mutables; replay-safe.
- **R-27 [GATE]** Status = `varchar` + CHECK + a Zod literal union (+ `machine.ts`); **never `pgEnum`** (`gate:discipline`).
- **R-28 [REVIEW]** Money = `numeric` with `_excl`/`_incl` suffix; never float. `timestamptz` everywhere.
- **R-29 [REVIEW]** State change ⇒ a row in `event_log` (transactional outbox) in the **same tx**; the `eventId` is the idempotency key. `actor_kind ∈ {human,agent,system}`.
- **R-30 [REVIEW]** Person-PII lives ONLY in `sensitive.party_pii` (surrogate `party_id`); never copied onto a business row (GDPR-erasable). Append-only logs carry an immutability trigger.
- **R-31 [REVIEW]** Verify the migrated object exists (`SELECT`) post-migrate — a ledger can report success while skipping SQL. Never edit an applied migration; never `drizzle-kit` against a drifted meta.

## 5. API, contract & MCP (one service, three faces)

- **R-35 [REVIEW]** The service + Zod schema is the SSOT. The JSON API, the HTML view, and the MCP tool are *consumers* — never a second logic path.
- **R-36 [GATE]** Each capability is declared once in `config/capabilities.ts` (`{route, input, output?, mcp?}`). OpenAPI bodies and MCP `inputSchema` are **generated** from its Zod (`zodToJsonSchema`); hand-writing either is forbidden (`gate:mcp`).
- **R-37 [GATE]** MCP RBAC resolves via the **same** `decideRbac(policyFor(cap.route))` as the HTTP wall — API and MCP cannot diverge. Every routed tool is a registry projection.
- **R-38 [REVIEW]** Every mutation accepts + enforces an idempotency key (the outbox `eventId`/`Idempotency-Key`). *(Target: SHA-256 body-fingerprint guard → 422 on key-reuse-with-different-body; TTL **below** the retry window.)*
- **R-39 [REVIEW]** Agents authenticate via WorkOS OAuth and hit the same RBAC+RLS path; every agent action lands in `event_log`/`audit_log` with `actor_kind='agent'`. Permission-aware discovery; structured `{code,grpc,retryable}` so agents retry-or-stop correctly.

## 6. Frontend (server-rendered MPA)

- **R-45 [REVIEW]** No SPA. `hono/html` pages in `src/views/`, token-driven modular CSS (`views/styles/*`) — never a monolith stylesheet.
- **R-46 [REVIEW]** Render layer only: a page receives already-fetched, already-validated data and returns HTML. No DB/service/logic in a view — that's the route's job. **No fake/placeholder data** — wire the real service.
- **R-47 [GATE]** XSS escaped at the boundary (`hono/html`); never raw HTML strings / `innerHTML`.
- **R-48 [REVIEW]** Design tokens/component classes only (no raw hex/px). Every user string bilingual it/en (`i18n.ts`), P2P-glossary-correct. A11y tier-1 (semantic, labelled, focus-visible, contrast).

## 7. CI/CD & environments

- **R-50 [GATE]** `bun run ci` = typecheck · lint · `gate:rbac` · `gate:mcp` · `gate:secrets` · `gate:size` (250-line hard cap) · `gate:discipline` · unit (workerd) · integration (real Postgres as `vms_app`). A change that breaks a gate fails by design; fix the cause, never the gate.
- **R-51 [REVIEW]** "A rule that only orients is theater" — never add a rule without a gate or a reviewer who blocks on it.
- **R-52 [GATE]** Environments: `local → dev → integration → production`. Each `[env.*]` has its OWN Neon (via its own Hyperdrive), KV, SLI dataset, and secrets. Code is env-aware via `ENVIRONMENT`.
- **R-53 [GATE]** **Migrations before code**, as the owner role; verify the object exists; then `wrangler deploy --env`; post-deploy `/health/ready` must be `200`. Rollback = redeploy previous.
- **R-54 [GATE]** Secrets only via `wrangler secret put --env` (never in `wrangler.toml`/code/CI vars). Local runtime = `.dev.vars` (gitignored). Scan the whole repo + gitignored files for leaks.
- **R-55 [REVIEW]** The DB connection is opened **per request** (`openDatabase`, max:1, closed after) — Workers forbid reusing a socket across requests; never reintroduce a cached cross-request `db`.

## 8. Style & limits (CI-enforced)

- **R-60 [GATE]** 250-line files / ~40-line functions / 3 params then options object.
- **R-61 [GATE]** No `any` (use `unknown`), no `as` except branded IDs, no `enum`/`pgEnum`, no `class` except Errors, no `console.*` (use `logger`), no `process.env` in `src/` (use `parseConfig`). Named exports; `type` over `interface`; discriminated unions; early returns; nesting ≤ 3.

## 9. Observability & security (Block 7)

- **R-70 [REVIEW]** One structured `logger` (trace-correlated, PII-scrubbed); every request emits one SLI line to Analytics Engine. *(Target: zero-dep OTLP exporter → Grafana; cron golden-signal alerter.)*
- **R-71 [ADR]** Per-tenant secret vault (AES-256-GCM + HKDF) for connection secrets; no provider key on a business row.
- **R-72 [REVIEW]** Fail loud: a noop/misconfigured provider adapter logs a warning and degrades `/health/ready` — never a silent synthetic success (ERP factory is the reference).
- **R-73 [REVIEW]** CSP on HTML responses (target: per-request nonce, report-only → enforce). Cookies `httpOnly`+`secure`(non-local)+`SameSite=Lax`.

---

### ADR index (decisions of record)
- **ADR-001** Cloudflare Workers + Hono edge runtime; no containers in prod.
- **ADR-002** Postgres (Neon) + 3-GUC RLS as the tenant isolation model.
- **ADR-003** WorkOS feed-only identity broker (swappable); roles in `membership`.
- **ADR-004** `Result<T,E>` over thrown `AppError`; problem+json at the boundary.
- **ADR-005** Capability registry as the one SSOT for API + OpenAPI + MCP.
- **ADR-006** `drizzle-kit generate` with valid meta + hand-appended RLS (ventym keeps a clean baseline; no phantom-migration ban needed).
- **ADR-007** Per-request DB connection (Workers I/O rule) fronted by Hyperdrive pooling in deployed envs.
