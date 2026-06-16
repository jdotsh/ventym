---
name: ventym-api-mcp
description: Use when adding or changing JSON API endpoints (routes/api/v1), the capability registry, OpenAPI, MCP tools, idempotency, webhooks, or the error registry.
---

# ventym API & MCP skill

**One service, three faces.** The service + Zod schema is the SSOT; the JSON API,
the HTML view, and the MCP tool are all *consumers* of the same service — never a
second logic path.

## The capability registry (the contract SSOT)

`src/config/capabilities.ts` is the one declaration per capability: `{ route, input (Zod), output?, mcp? }`. From it:
- **OpenAPI 3.1** (`openapi/document.ts`) generates paths+security from `RBAC_POLICY` and request bodies from the registry's Zod — served at `/api/v1/openapi.json`.
- **MCP tools** (`services/mcp/{server,handlers}.ts`) are PROJECTIONS: `inputSchema = zodToJsonSchema(cap.mcp.args)`, RBAC resolved via the SAME `decideRbac(policyFor(cap.route))` the HTTP wall uses. Hand-writing an MCP `inputSchema` is forbidden — `gate:mcp` fails any routed tool that isn't a registry projection.

So: a new governed endpoint adds a governed MCP tool for free, and API+MCP RBAC cannot diverge.

## Endpoint checklist

1. Zod schema in `services/<domain>/schema.ts`; add the capability to `capabilities.ts`.
2. RBAC entry in `rbacPolicy.ts` (`gate:rbac`). API tokens + agent OAuth flow through the SAME policy table as the UI.
3. Response shapes fixed: `{ data }` singles/lists; errors are **problem+json** from the error registry (`types/errorRegistry.ts` → `utils/problemResponse.ts`). Never invent a status or shape inline.
4. **Every mutation accepts + enforces an idempotency key** (the `eventId`/`Idempotency-Key` → transactional-outbox replay = no-op).
5. Errors map through `services/<domain>/httpError.ts` → a registered `DomainCode`. Adding a code = a row in `DOMAIN_REGISTRY` (drift-guarded by `resolveError`).

## MCP-specific

Agents authenticate via WorkOS OAuth and hit the SAME RBAC+RLS path — no backdoor. Every agent action lands in `event_log`/`audit_log` with `actor_kind='agent'`. Permission-aware discovery: `tools/list` advertises only what the agent's role × token-scope can call; failures return structured `{code, grpc, retryable}` so the agent retries or stops correctly.

## Red flags

- A hand-written MCP `inputSchema` literal → derive from the capability's Zod (`gate:mcp`).
- A POST/PATCH without idempotency → bank integrations retry; duplicates are incidents.
- A bespoke error shape "just for this endpoint" → problem+json from the registry.
- A route in the API but not in `capabilities.ts`/`RBAC_POLICY` → ungoverned; gates fail.
