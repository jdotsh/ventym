# Deploy runbook — dev / integration / production

Three environments, each with its **own Neon instance** + Cloudflare bindings.
vms's code is env-aware (`ENVIRONMENT`); this is config + secrets + pipeline.

## One-time per environment (`<env>` = dev | integration | production)

1. **Neon** — create a project/instance for `<env>`; note two connection strings:
   - **owner** `vms` (runs migrations) and **app** `vms_app` (the Worker connects as
     this non-owner role so RLS is enforced — `assertRlsEnforced` checks it at boot).
2. **Hyperdrive** → that Neon app connection:
   ```
   bunx wrangler hyperdrive create vms-<env> --connection-string="postgres://vms_app:…@<neon-host>/vms"
   ```
   Put the returned id into `wrangler.toml` → `[env.<env>].hyperdrive`.
3. **KV** for rate-limit counters:
   ```
   bunx wrangler kv namespace create RATE_LIMIT --env <env>
   ```
   Put the id into `[env.<env>].kv_namespaces`.
4. **Secrets** (never in the repo):
   ```
   bunx wrangler secret put WORKOS_API_KEY      --env <env>
   bunx wrangler secret put WORKOS_CLIENT_ID    --env <env>
   bunx wrangler secret put WORKOS_REDIRECT_URI --env <env>
   bunx wrangler secret put SESSION_SECRET      --env <env>   # openssl rand -base64 32
   bunx wrangler secret put CONNECTION_SECRETS_KEY --env <env>
   ```
5. **WorkOS** — use the matching WorkOS environment (Staging for dev/int, Production
   for prod). In its **Redirects**, register exactly the `<env>` callback URL that
   `WORKOS_REDIRECT_URI` points to (e.g. `https://vms-<env>.<acct>.workers.dev/auth/callback`).
6. **GitHub secrets** for CI deploy: `CLOUDFLARE_API_TOKEN`, `DB_OWNER_URL_DEV/_INT/_PROD`.

## Deploy

- **dev** — auto on push to `dev`.
- **integration** — Actions → Deploy → run with `integration`.
- **production** — Actions → Deploy → `production` (manual; gate behind a release tag).

Each run: `bun run ci` → **migrate as owner** → `wrangler deploy --env <env>` →
`/health/ready` smoke. Migrations always run **before** code.

## Manual deploy (from a workstation with `wrangler` logged in)

```
DATABASE_URL='postgres://vms:…@<neon>/vms' bun run db:migrate    # owner, first
bunx wrangler deploy --env <env>
curl -s https://vms-<env>.<acct>.workers.dev/health/ready         # expect {"status":"ready"}
```
