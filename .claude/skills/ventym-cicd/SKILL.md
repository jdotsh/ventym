---
name: ventym-cicd
description: Use when touching .github/workflows, wrangler.toml, deploy scripts, secrets, environment config, or when running/diagnosing deploys and CI failures.
---

# ventym CI/CD skill

The pipeline IS the discipline. Weakening a gate is a regression, not a convenience.
SSOT: `docs/deploy.md`.

## The environments

`local` → `dev` → `integration` → `production`. Each `[env.*]` in `wrangler.toml` has its
OWN Neon instance (via its own Hyperdrive), KV, SLI dataset, and secrets. Code is
env-aware via `ENVIRONMENT` (Hyperdrive in deployed envs, direct `DATABASE_URL` local).

## The 5 CI gates (every push/PR — `bun run ci`)

1. `typecheck` (tsc strict) · `lint` (eslint)
2. `gate:rbac` — boots the app, fails on any route without an `RBAC_POLICY` entry
3. `gate:mcp` — every routed MCP tool is a capability-registry projection (RBAC single-sourced)
4. `gate:secrets` — no committed credentials
5. `gate:size` — no source file over the 250-line hard cap
6. `gate:discipline` — no `process.env`/`console.*`/`pgEnum`/`any` in app code
7. unit tests (vitest, workerd pool) + integration tests (real Postgres as `vms_app`)

Adding a route/tool/file that breaks a gate fails CI by design. Fix the cause, never the gate.

## Iron deploy sequence (`.github/workflows/deploy.yml`)

1. `bun run ci` must pass.
2. **Migrations BEFORE code**, as the **owner** role (`DATABASE_URL=<owner> bun run db:migrate`) — code-first against an un-migrated DB 5xxs every request.
3. Verify the migration object exists (phantom-migration hazard).
4. `bunx wrangler deploy --env <tier>`; rollback = redeploy the previous version.
5. Post-deploy smoke: `/health/ready` must be `200` (`{"status":"ready","checks":{"db":"ok"}}`).
6. **Secrets only via `wrangler secret put --env <env>`** — never in `wrangler.toml`, code, or CI vars. Local runtime is `.dev.vars` (gitignored).

dev auto-deploys on push to `dev`; integration/production are manual (`workflow_dispatch`), prod gated behind a tag.

## Known sharp edges

- The DB connection is opened **per request** (`openDatabase`, max:1, closed after) — Workers forbids reusing a socket across requests. Don't reintroduce a cached cross-request `db`.
- `wrangler.toml` ids are placeholders (`REPLACE_*`) until you create the Neon/Hyperdrive/KV resources.

## Red flags

- "Skip the gate just for this hotfix" → the gate is the control; fix the complaint.
- A new `[vars]` entry that smells like a secret → `wrangler secret put`.
- Editing an applied migration → new migration, always.
- Code deployed before its migration → readiness probe (and prod) will 5xx.
