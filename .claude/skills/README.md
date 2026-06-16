# ventym skills

Project skills that encode ventym's discipline so every session follows the same
seams. Learned from Athena's skill set, adapted + improved for ventym's stack.

| Skill | Use when… |
|---|---|
| **ventym-backend** | routes / services / repos / business logic under `src/` (the default) |
| **ventym-data-model** | `db/schema/` or `db/migrations/` — tables, columns, RLS |
| **ventym-auth-tenancy** | login, sessions, WorkOS, RBAC policy, RLS, tenant scoping |
| **ventym-api-mcp** | JSON API, the capability registry, OpenAPI, MCP tools, idempotency |
| **ventym-frontend** | server-rendered UI under `src/views/` |
| **ventym-cicd** | `.github/workflows`, `wrangler.toml`, deploys, CI gates |

Where ventym improves on Athena: `drizzle-kit generate` works (valid meta) instead of
hand-written migrations; the capability registry makes API+MCP one SSOT and gates it
(`gate:mcp`); errors are `Result<T,E>` + a problem+json registry, not thrown classes;
the 250-line cap (vs 400); per-request DB connection (Workers I/O rule); session
re-resolved every request (no cached-role window, so no explicit revocation needed).
