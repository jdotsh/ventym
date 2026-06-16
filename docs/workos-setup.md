# WorkOS setup (vms-mvp)

vms uses WorkOS as a **feed-only identity broker**: WorkOS *authenticates* (AuthKit —
password, MFA, SSO); vms *authorizes* via its own `membership` table. **Roles never
come from WorkOS.** The SDK is isolated in `src/tools/workos/client.ts`, so the broker
is swappable in one file.

## 0. Use a dedicated WorkOS environment for vms

Do **not** share Athena's WorkOS environment (its `client_id` won't have vms's redirect
URIs and both apps collide on `:8787`). In the WorkOS Dashboard create/select a vms
environment, then copy *its* Client ID + API key.

## 1. AuthKit — enable email + password (no SSO required)

Dashboard → **AuthKit** → enable it, and turn on **Email + Password** (and MFA if you
want). SSO/SAML is optional — a normal user just clicks **Create an account** on the
hosted page. No IdP, no SCIM needed to log in.

## 2. Redirects — register the callback (the #1 login blocker)

Dashboard → **Redirects** → add the callback URI **exactly**, for each environment:

| Env | Redirect URI |
|-----|--------------|
| local dev | `http://localhost:8787/auth/callback` |
| production | `https://<your-domain>/auth/callback` |

It must match `WORKOS_REDIRECT_URI` byte-for-byte — no trailing slash, `http` (not
`https`) for localhost. A mismatch yields *"This is not a valid redirect URI"* on the
WorkOS page **before** vms ever runs — so it can only be fixed here, not in code.

## 3. `.dev.vars` (gitignored — never commit)

```
ENVIRONMENT=local
DATABASE_URL=postgres://vms_app:vms_app@localhost:5433/vms   # non-owner role (RLS enforced)
WORKOS_CLIENT_ID=client_...           # from YOUR vms environment
WORKOS_API_KEY=sk_test_...            # from YOUR vms environment (keep secret)
WORKOS_REDIRECT_URI=http://localhost:8787/auth/callback
SESSION_SECRET=<32+ byte random>      # openssl rand -base64 32
# Optional — enable these enterprise features when ready:
WORKOS_WEBHOOK_SECRET=                # Directory Sync (SCIM) webhook verification
WORKOS_AUTHKIT_DOMAIN=                # OAuth issuer for MCP agent tokens
CONNECTION_SECRETS_KEY=               # base64 master key for the per-tenant secret vault
```

> Migrations run as the **owner** (`vms`), the app connects as the **non-owner**
> `vms_app` so RLS is actually enforced (`assertRlsEnforced` boot-checks this).

## 4. Run it

```bash
docker compose -f docker-compose.dev.yml up -d --wait
DATABASE_URL='postgres://vms:vms@localhost:5433/vms' bun run db:migrate   # as owner
DATABASE_URL='postgres://vms:vms@localhost:5433/vms' bun run db:seed      # demo data
bun run dev                                                               # http://localhost:8787
```

Open http://localhost:8787 → **Create an account** → you land on `/dashboard`. In
`ENVIRONMENT=local`, a fresh login is granted **ADMIN+MANAGER** so you can exercise the
whole app; deployed envs admit new users as **MEMBER** (an admin grants roles at
`/admin/users`).

## 5. Permissions (how authz works)

- New user → JIT `membership` in the tenant (resolved from the WorkOS org, else the
  default tenant). Deployed default role = **MEMBER**.
- An **ADMIN** assigns roles at **`/admin/users`** (version-checked + audited) and can
  **suspend/reactivate** members. Suspension takes effect on the user's next request
  (vms re-resolves the session each request — no cached-role window).

## 6. Optional enterprise features (Phase 2)

- **Directory Sync (SCIM)** — set `WORKOS_WEBHOOK_SECRET`, configure a Directory in the
  Admin Portal; `POST /webhooks/workos` ingests joiner/mover/leaver events.
- **Admin Portal** — `/admin` → "Configure SSO" opens a self-serve WorkOS portal link
  for the tenant's IT (no vms code per customer).
- **Agent OAuth (MCP)** — set `WORKOS_AUTHKIT_DOMAIN`; agents get OAuth 2.1 tokens
  verified against the same issuer, then hit the same RBAC + RLS walls as humans.
- **WorkOS Audit Log streaming** — *not yet wired.* vms's in-DB `audit_log` is the SSOT;
  streaming key events to WorkOS Audit Logs (for customer SIEM export) is a clean
  follow-up, not a correctness gap.
