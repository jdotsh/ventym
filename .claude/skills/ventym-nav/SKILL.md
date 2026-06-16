---
name: ventym-nav
description: Use FIRST when starting any ventym task and unsure where code lives or which skill applies — the orientation map. Routes to the right domain skill and the binding rules register.
---

# ventym orientation

Read this before touching the codebase cold. The authoritative rules are
**`docs/RULES.md`** (numbered R-/ADR — cite them in PRs and review). To run locally:
**`docs/LOCAL_SETUP.md`**.

## Which skill

| Working on… | Skill |
|---|---|
| routes / services / repos / business logic (default) | **ventym-backend** |
| `db/schema/` or `db/migrations/` | **ventym-data-model** |
| login / session / WorkOS / RBAC policy / RLS / tenant scope | **ventym-auth-tenancy** |
| JSON API / capability registry / OpenAPI / MCP / idempotency | **ventym-api-mcp** |
| server-rendered UI under `src/views/` | **ventym-frontend** |
| `.github/workflows` / `wrangler.toml` / deploys / gates | **ventym-cicd** |

## Where things live (the map)

```
config/        env.ts (parseConfig) · db.ts (openDatabase/withTenantScope/assertRlsEnforced) · bindings.ts
db/schema/     one file per aggregate → re-exported by db/schema.ts   db/migrations/ generated + hand-RLS
src/
  app.ts                 the middleware wall sequence
  middleware/            traceId · session · rbacEnforce · rateLimit · requestTiming · security · agentAuth
  config/rbacPolicy.ts   route→access SSOT (fail-closed)      config/capabilities.ts  contract SSOT
  routes/                api/v1/* · views.ts · admin · auth · mcp · agent · webhooks · health · openapi
  services/<domain>/     service.ts (Result) · deps.ts · schema.ts · machine.ts · httpError.ts
  services/mcp/          server.ts (transport) · handlers.ts (projections)   openapi/document.ts
  tools/                 db/<agg>Repo · erp/{adapter,factory} · workos · secrets
  types/                 errorRegistry.ts (DOMAIN_REGISTRY) · result.ts · errors.ts
  utils/                 logger · hash · ids · result · problemResponse (PURE)
  views/                 pages/ · components/ · layouts/ · styles/* · i18n.ts · html.ts
scripts/       check-rbac · check-mcp · check-filesize · check-discipline · secret-scan · integration
```

## The invariants (never violate — full list in RULES.md)

- One service, three faces (R-35). Roles from `membership`, not WorkOS (R-16). 3-GUC RLS or zero rows (R-17). Every route in `RBAC_POLICY` (R-15). `Result<T,E>`, throw only at boundaries (R-10). No fake data in a view (R-46). Migrations before code (R-53). A rule needs a gate or it's theater (R-51).

## Verify by execution (always)

`bun run ci` green → `bun run dev` → log in via `/auth/dev` → hit the route → confirm real data + `200`. Reading is not verification.
