# VMS — Architecture Charter

> Single source of truth for *what the rules are* and *how the skeleton is shaped*.
> This is a masterclass foundation: WorkOS-native identity, Cloudflare Workers, on-prem
> Postgres, **agentic-ready by design**. Athena (the prior VMS) is our **answer key** — it
> proved *what* a VMS needs across 62 tables and 303 routes; here we re-derive each piece
> on clean patterns, at a **stricter bar**, with no legacy debt to grandfather.

---

## 0. The three invariants (above everything)

1. **API-first is absolute.** No capability ever lives only in a route handler or a view.
   The **service + Zod schema is the SSOT**; the UI and the MCP tool layer are both
   *consumers*. A capability is "done" only when its service backs an API endpoint, a view,
   and an MCP tool — all three off the one service, never a second logic path.
2. **Every mutation is idempotent + versioned by construction**, not by convention. Agents
   and automations *will* retry. `Idempotency-Key` is enforced; every mutable row carries a
   `version` for optimistic concurrency.
3. **Agents are governed identities, not an integration.** An agent hits the *same*
   session → tenant-scope → RBAC → RLS walls as a human, with a least-privilege scoped token.
   `actor_kind ∈ {human, agent, system}` on every audit row. **No service-role backdoor, ever.**

---

## 1. Discipline charter — stricter than Athena

Each rule is tied to a specific Athena scar we refuse to inherit.

| Rule | Athena | **Here (stricter)** | Why |
|---|---|---|---|
| File length | 400 lines | **250 hard / 150 target** | Athena froze a 14k-line `styles.ts` and a 6k-line `views.ts` it can only *shrink* |
| Function length | 50 lines | **40 lines** | flatter, more testable units |
| Params | 3 | **3, then options object** | no positional sprawl |
| CSS | one giant file | **modular from day one** (`views/styles/*`) | the frozen-giant trap is structural — prevent it |
| Migrations | hand-written forever (broken meta) | **`drizzle-kit generate`, meta stays VALID** | Athena's phantom-migration hazard came from a broken baseline |
| Idempotency | retrofitted | **CI gate fails any mutation without `Idempotency-Key`** | born-in leaves no gaps |
| Audit `actor_kind` | added late (migration 0066) | **present in migration 0001** | agentic-by-design means the column exists before the first agent |
| Errors | `throw AppError` | **`Result<T,E>` discriminated unions**; throw only at true boundaries | no throw-for-control-flow; exhaustive switches |
| API/UI coupling | logic in views | **services are the only logic home** | one SSOT, two faces |

### Type & style law (lint-enforced)
- `type` over `interface`; **discriminated unions** for every variant (errors, states, results).
- No `any` (use `unknown`), no `as` except branded IDs, no `!`, no `enum`, no `class` except Errors.
- Named exports only. Named function declarations, not arrow consts (arrows for inline callbacks only).
- Early returns / guard clauses. Nesting depth ≤ 3.
- Schema-first: Zod is the source of truth; types are `z.infer`. Validate once at the boundary, trust inside.

### Naming convention (one scheme, everywhere)
| Item | Convention | Example |
|---|---|---|
| Files | camelCase | `workOrderService.ts` |
| Types | PascalCase | `WorkOrder`, `WorkOrderState` |
| Functions | camelCase, verb-first | `createWorkOrder`, `transitionWorkOrder` |
| Predicates | `is`/`has`/`can` | `canTransition`, `isAgentToken` |
| Constants | SCREAMING_SNAKE | `WORK_ORDER_STATES` |
| Zod schemas | camelCase + `Schema` | `createWorkOrderSchema` |
| DB tables | snake_case singular | `work_order`, `audit_log` |
| State machines | `<entity>State` union + `machine.ts` | `WorkOrderState` |

---

## 2. The skeleton (module map)

One aggregate = one schema file = one repo = one service folder = one MCP tool family.
You can hold any vertical slice in your head.

```
vms-mvp/
├── config/                 env.ts · db.ts (withTenantScope) · bindings.ts            [done]
├── db/
│   ├── schema/             one file per aggregate (split before it ever becomes a monolith)
│   │                       tenant.ts identity.ts workOrder.ts timesheet.ts
│   │                       milestone.ts approval.ts vendor.ts catalog.ts audit.ts agent.ts
│   └── migrations/         drizzle-kit generated; meta VALID
├── src/
│   ├── app.ts              the middleware wall sequence                               [done]
│   ├── middleware/         trace · session · tenantScope · rbacEnforce · rateLimit ·
│   │                       idempotency · requestTiming(SLI) · security(CSP)           [most done]
│   ├── config/rbacPolicy.ts   fail-closed route→access SSOT                           [done]
│   ├── routes/
│   │   ├── views/          one file per page — thin: parse → service → render
│   │   ├── api/v1/         typed JSON — the automation-first surface
│   │   └── auth · mcp · agent · webhooks · health                                     [done]
│   ├── openapi/            document.ts — generated from rbacPolicy + Zod (one SSOT)
│   ├── mcp/                server.ts — tools generated from the OpenAPI surface        [minimal]
│   ├── services/<domain>/  service.ts · deps.ts · schema.ts · machine.ts
│   ├── tools/              db/<aggregate>/repo.ts · workos/ · erp/ · email/ · secrets/
│   ├── utils/              result.ts · logger.ts · escape.ts · ids.ts · money.ts (PURE only)
│   └── views/
│        ├── styles/        tokens.ts + per-concern modules (no giant file, ever)
│        ├── layouts/ components/ pages/   Athena design quality, modular
│        └── i18n.ts        it/en, P2P-glossary-correct
└── scripts/                check-rbac · check-idempotency · check-actorKind ·
                            check-filesize · secret-scan   (run by `bun run ci`)
```

---

## 3. Data model — agentic envelope (current reality)

Shared column groups (DRY) live in `db/schema`: `id` (uuid pk), `createdAt`, `updatedAt`,
`tenantId` (FK → tenant). Vocabularies are **string-literal unions, never `pgEnum`**.

**Every tenant-scoped, mutable table MUST carry the agentic envelope from its first migration:**
- `tenant_id` **first** in every composite index (the RLS filter column).
- **RLS** `ENABLE`d, isolated on `current_setting('app.tenant_id', true)::uuid`. The app connects
  as the non-owner role **`vms_app`** (owner runs migrations/seed) so RLS is actually enforced;
  unset GUC ⇒ NULL ⇒ zero rows (fail-closed).
- `version int` for optimistic concurrency (safe replay).
- Status = `varchar` + CHECK constraint + Zod literal union (+ a `machine.ts`); never `pgEnum`.
- Money = `numeric`/`decimal` with `_excl`/`_incl` suffix; **never float**.
- `timestamptz` everywhere; `created_at` always, `updated_at` on mutables.
- State change ⇒ a row in `audit_log` (standard envelope, `actor_kind`, immutability trigger) in
  the **same transaction**.

**Shipped tables:** `tenant` · `app_user` (no password) · `membership` · `tenant_connection`
(NOT RLS — org→tenant routing, read pre-session) · `session` · `api_token` (agent credential) ·
`idempotency` · `audit_log`.

**Domain spine (ported from Athena's blueprint, table-by-table approval):** `work_order`
(`type: T_AND_M | FIXED_PRICE`) · `timesheet` · `milestone` · `approval_step` · `vendor` ·
`rate_card` · `site` · `erp_export` / `erp_inbound`.

Every state machine is **documented before it is coded** (in `services/<domain>/machine.ts`).

---

## 4. Backend — the canonical domain slice

The masterclass is one slice done perfectly, then replicated. **Work Order** is the template:

```
db/schema/workOrder.ts        Zod-first table + inferred type + status union
tools/db/workOrder/repo.ts    Drizzle queries; rows parsed by schema; tenant predicate in WHERE
services/workOrder/
  ├── schema.ts               createWorkOrderSchema, transition inputs (Zod = SSOT)
  ├── machine.ts              WorkOrderState union + canTransition() — pure, exhaustively tested
  ├── service.ts              rules; returns Result<WorkOrder, DomainError>; deps injected
  └── deps.ts                 typeof-bound I/O (repo, audit, clock, ids)
routes/api/v1/workOrders.ts   parse → service → format; Idempotency-Key enforced; RBAC entry
routes/views/workOrders.ts    parse → SAME service → render (no second logic path)
mcp/ (generated)              create_work_order / transition_work_order inherit the route's RBAC
```

**The seam law:** routes parse + format only; services own all logic and return `Result`;
tools own all I/O; utils are pure (never import services/tools/routes).

**Mandatory flow for any slice:**
1. Zod schema first; types inferred.
2. New route ⇒ entry in `rbacPolicy.ts` same PR (the `gate:rbac` coverage check fails otherwise;
   runtime 403s undeclared routes — fail-closed).
3. Mutations run inside `withTenantScope`; **reads carry the explicit tenant predicate** too.
4. State change writes `audit_log` in the same transaction.
5. Every mutation accepts + enforces an `Idempotency-Key`.
6. Verify by **execution**: `bun run ci` green; hit the endpoint. Reading is not verification.

---

## 5. Frontend — Athena's quality, none of its debt

Server-rendered MPA (`hono/html`), token-driven design system, **modular from line one**:
- `views/styles/tokens.ts` + per-concern CSS modules — no file ever becomes `styles.ts`.
- One page = one file, **thin**: receives already-fetched, already-validated data, returns HTML.
  Zero DB, zero service calls, zero logic in a view.
- XSS escaped at the boundary; never `innerHTML`.
- Bilingual it/en via `i18n.ts`, P2P glossary-correct (Vendor=Fornitore, OdA, RdO…).
- A11y as the tier-1 bar (semantic, labelled, focus-visible, contrast). North-star: tier-1 banks.
- **Workflow-first:** every page scored by hours-saved-per-week, not aesthetics.

---

## 6. MCP / agentic-ready-by-design

Not a feature — a property of the whole skeleton:
1. **Generated, not hand-written.** MCP tools ← OpenAPI ← `rbacPolicy` + Zod. *If it isn't a
   clean endpoint, it isn't a tool.* A new governed endpoint adds a governed tool for free.
2. **One auth path.** Agent OAuth 2.1 (WorkOS) → scoped least-privilege tenant-bound token → the
   same session → tenant-scope → RBAC → RLS walls. No bypass.
3. **Idempotent + versioned** mutations → agents retry safely by construction.
4. **Audited + traced + cost-logged** — always answer *which agent did what, under whose
   authority, at what cost*. `actor_kind='agent'` on every row.
5. **Automation fabric** — the append-only audit log *is* the event source; webhooks/Queue let
   agents react to state changes, idempotently.

---

## 7. Build sequence (domain slices on the foundation)

Foundation (auth, RLS, RBAC, MCP scaffold, observability) is done. The domain ports as vertical
slices — each green (`bun run ci` + gates), each shipping its API + view + MCP tool together:

- **D1 — Work Order (T&M):** the canonical slice; everything copies its shape.
- **D2 — Timesheet → Approve:** consumption + governance path.
- **D3 — Milestone (Fixed-Price):** the second WO variant.
- **D4 — Approve → ERP post:** the core value loop closes (idempotent posting + reconcile).
- **D5 — Supporting catalog:** vendor · rate card · site (minimized).
- **D6 — Automation fabric:** audit-log event source → agent-reactive webhooks/Queue.

Each slice ports the *rules* from Athena's matching service/page and re-expresses them at this bar.
The data model grows **table-by-table with review** — no migration is written before its table list
is approved.
