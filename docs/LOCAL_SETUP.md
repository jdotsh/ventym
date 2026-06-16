# Ventym — Local setup (run the codebase in 5 minutes)

Every key, where it comes from, and the exact commands. Binding rules: `docs/RULES.md`.

## Prerequisites

| Tool | Why | Check |
|---|---|---|
| **Bun** ≥ 1.1 | runtime + scripts | `bun --version` |
| **Docker** | local Postgres (`docker-compose.dev.yml`) | `docker info` |
| **Cloudflare `wrangler`** (via `bunx`) | dev server (workerd) + deploy | `bunx wrangler --version` |
| WorkOS account | identity (or use the local dev login) | dashboard.workos.com |

## `.dev.vars` (gitignored — the local runtime secrets, R-54)

Copy `.dev.vars.example` → `.dev.vars` and fill in:

| Key | What | Where to get it | Required? |
|---|---|---|---|
| `ENVIRONMENT` | `local` | literal | ✅ |
| `DATABASE_URL` | `postgres://vms_app:vms_app@localhost:5433/vms` | the Docker Postgres (non-owner role — RLS enforced, R-18) | ✅ |
| `WORKOS_CLIENT_ID` | `client_…` | WorkOS dashboard → Configuration → **your** environment | ✅ for SSO login |
| `WORKOS_API_KEY` | `sk_test_…` | WorkOS dashboard → API Keys (Staging key) | ✅ for SSO login |
| `WORKOS_REDIRECT_URI` | `http://localhost:8787/auth/callback` | must be **registered in WorkOS → Redirects**, byte-exact | ✅ for SSO login |
| `SESSION_SECRET` | 32+ byte random | `openssl rand -base64 32` | ✅ |
| `WORKOS_WEBHOOK_SECRET` | Directory Sync (SCIM) webhook secret | WorkOS → Webhooks | optional |
| `WORKOS_AUTHKIT_DOMAIN` | `https://<slug>.authkit.app` | WorkOS → AuthKit (for MCP agent OAuth) | optional |
| `CONNECTION_SECRETS_KEY` | base64 master key for the per-tenant secret vault | `openssl rand -base64 32` | optional |

> **No WorkOS yet?** Skip all `WORKOS_*` and use the **local dev login** (below) — it
> bypasses WorkOS entirely and only works when `ENVIRONMENT=local`.

## Run

```bash
# 1. Postgres
docker compose -f docker-compose.dev.yml up -d --wait

# 2. Schema + demo data (run as the OWNER role — migrations need DDL; R-24)
DATABASE_URL='postgres://vms:vms@localhost:5433/vms' bun run db:migrate
DATABASE_URL='postgres://vms:vms@localhost:5433/vms' bun run db:seed

# 3. Dev server (uses .dev.vars; opens the DB per request — R-55)
bun run dev            # → http://localhost:8787
```

## Log in (two ways)

- **Local dev login (no WorkOS):** open **http://localhost:8787/auth/dev** → you're in as
  `admin@acme.test` with **ADMIN+MANAGER** (local-only; 404s in any deployed env).
- **Real WorkOS:** open `http://localhost:8787` → **Sign in / Create an account** (AuthKit:
  email+password, no SSO config needed). Requires the redirect URI registered (above).

You'll see the seeded demo: 2 Work Orders, 1 Timesheet awaiting approval, 1 Vendor + Worker.

## Verify it's healthy

```bash
curl localhost:8787/health         # {"status":"ok","service":"ventym",…}
curl localhost:8787/health/ready   # {"status":"ready","checks":{"db":"ok"}}
bun run ci                         # 5 gates + unit + integration — all green
```

## Roles (`vms` owner vs `vms_app` app — R-18)

Migrations/seed run as **`vms`** (owner, bypasses RLS). The app connects as **`vms_app`**
(non-owner) so RLS is actually enforced — `assertRlsEnforced` boot-fails otherwise. Both
roles + the grants are created by migration `0000`.

## Common snags

- *"This is not a valid redirect URI"* → register `http://localhost:8787/auth/callback` in
  the WorkOS environment that owns your `WORKOS_CLIENT_ID` (R-54 is about secrets; this is
  dashboard config). Or just use `/auth/dev`.
- *`/health/ready` → db down* → Postgres isn't up, or `DATABASE_URL` points at `:5432` (the
  compose maps host **`:5433`**).
- *`assertRlsEnforced` boot error* → you pointed the app at the **owner** role; use `vms_app`.
