---
name: ventym-data-model
description: Use when creating or modifying anything in db/schema/ or db/migrations/ — new tables, columns, indexes, constraints, RLS policies — or reviewing a PR that touches the data layer.
---

# ventym data-model skill

One aggregate = one file in `db/schema/<agg>.ts`, re-exported from `db/schema.ts`.
The shipped model is canonical — extend its patterns, never invent parallel ones.

## Mandatory flow for a schema change

1. Add/edit the table in `db/schema/<agg>.ts`.
2. **Generate the migration:** `bun run db:generate` (drizzle-kit; the meta journal is VALID here — unlike Athena, generate is allowed and expected).
3. **Hand-append the RLS block** to the generated SQL (drizzle generates table DDL only): `ENABLE ROW LEVEL SECURITY` + a `<table>_isolation` policy `USING/WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)`. Copy the exact pattern from the latest migration's tail. `ALTER DEFAULT PRIVILEGES` (migration 0000) already grants new tables to `vms_app`.
4. Apply as the **owner**: `DATABASE_URL=<owner> bun run db:migrate`. The app connects as the **non-owner `vms_app`** so RLS is enforced (`assertRlsEnforced` boot-checks it).
5. `bun run test:integration` (real Postgres) before declaring done.

## The agentic-envelope checklist (every tenant-scoped mutable table)

| Item | Rule |
|---|---|
| `id uuid` PK, snake_case singular name | — |
| `tenant_id NOT NULL` → `tenant`, **RLS in the same migration** | tenant_id FIRST in every composite index |
| `version int` for optimistic concurrency | safe replay |
| Status = `varchar` + CHECK + a Zod literal union (+ `machine.ts`); **never `pgEnum`** | `gate:discipline` |
| Money = `numeric` with `_excl`/`_incl` suffix; **never float** | — |
| `timestamptz`; `created_at` always, `updated_at` on mutables | — |
| State change ⇒ `event_log` row in the same tx (transactional outbox) | `eventId` = idempotency key |
| `actor_kind ∈ {human,agent,system}` on audit/event rows | agentic-by-design |
| Person-PII lives ONLY in `sensitive.party_pii` (surrogate `party_id`); never copied onto business rows | GDPR-erasable |

## Red flags

- "RLS in a follow-up migration" → same migration, always (else `vms_app` reads cross-tenant or zero rows).
- A `pgEnum` → varchar + CHECK + Zod union.
- A migrate that "succeeded" but you never `SELECT`ed the new object → verify it exists.
- Editing an applied migration → new migration, always.
- Copying a worker's name/email onto a row "for display" → breaks erasure; join `party_pii` at read time.
