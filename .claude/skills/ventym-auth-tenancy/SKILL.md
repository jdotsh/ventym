---
name: ventym-auth-tenancy
description: Use when touching login, sessions, WorkOS/SSO/SCIM, API tokens, the RBAC policy, RLS, tenant scoping, or rate limiting — anything under middleware/session, services/identity, services/admin, tools/workos, config/rbacPolicy, or RLS in migrations.
---

# ventym auth & tenancy skill

The highest-consequence code. Identity, session, authorization, and tenancy are
**four separate layers** — never solve one in another's code.

## Layer map (who owns what)

| Layer | Source of truth | Files |
|---|---|---|
| Identity (WHO) | **WorkOS, feed-only** — it authenticates; it NEVER decides roles | `tools/workos/client.ts` (the only SDK file — swappable broker) |
| Session (LOGGED IN) | WorkOS **sealed cookie**, re-validated EVERY request (revoke-immediately) | `middleware/session.ts`, `services/identity/service.ts` |
| Authorization (CAN) | `RBAC_POLICY` table — default-deny, fail-closed | `config/rbacPolicy.ts` (`decideRbac`/`policyFor`), `middleware/rbacEnforce.ts` |
| Tenancy (WHICH DATA) | **3-GUC RLS** (tenant+user+session) + repo WHERE predicate | `config/db.ts withTenantScope`, `assertRlsEnforced` |

## Invariants you MUST NOT weaken

- **Roles come from our `membership` table, never WorkOS.** WorkOS feeds identity; ventym authorizes. This is the moat and the lock-in answer (swap WorkOS → Keycloak in one file).
- **All three GUCs or zero rows** — never set fewer. `withTenantScope` sets them in one tx; unset GUC ⇒ NULL ⇒ zero rows (fail-closed).
- The app connects as **non-owner `vms_app`**; `assertRlsEnforced` boot-fails if the role can bypass RLS. Migrations/seed run as the owner.
- Suspension/role-change take effect on the user's **next request** — the session is re-resolved each request, no cached-role window (this is why ventym needs no explicit session revocation, unlike Athena's cached `vms_session`).
- A new route without a `RBAC_POLICY` entry is DENIED — fix the table, not the middleware.

## WorkOS, properly (feed-only)

AuthKit = login (password/MFA/SSO). Directory Sync (SCIM) webhooks → membership *shells*; roles assigned in vms (`/admin/users`, version-checked + audited). Admin Portal = tenant self-serve SSO/SCIM. Agent OAuth (MCP) → same RBAC+RLS, `actor_kind='agent'`. See `docs/workos-setup.md`.

## Local dev only

`GET /auth/dev` (404s outside `ENVIRONMENT=local`) sets a `vms_dev` cookie → `loadDevSessionContext` resolves a real seeded user, no WorkOS. A fresh local login is granted ADMIN+MANAGER. **Never** make this path reachable in a deployed env.

## Red flags

- "Take roles from the WorkOS token" → no; roles are the `membership` SSOT.
- "Cache roles for the whole session" → revoked membership must stop pinning immediately.
- A code path that sets only `app.tenant_id` (not user+session) → 3-GUC or nothing.
- "Use a service-role connection for this job" → no backdoor, ever; run `withTenantScope` per tenant.
