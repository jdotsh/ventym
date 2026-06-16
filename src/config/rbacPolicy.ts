import type { TenantRole } from '../../db/schema'

export type PolicyEntry =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'roles'; roles: readonly TenantRole[] }

const PUBLIC: PolicyEntry = { kind: 'public' }
const AUTHENTICATED: PolicyEntry = { kind: 'authenticated' }
const roles = (...list: TenantRole[]): PolicyEntry => ({ kind: 'roles', roles: list })

/**
 * The single source of truth for route → access. Every route MUST appear here;
 * an absent route is DENIED (fail-closed). Keyed by `METHOD /route-pattern`.
 */
export const RBAC_POLICY: Readonly<Record<string, PolicyEntry>> = {
  'GET /': PUBLIC,
  'GET /login': PUBLIC,
  'GET /assets/app.css': PUBLIC,
  'GET /health': PUBLIC,
  'GET /health/ready': PUBLIC,
  'GET /api/v1/openapi.json': PUBLIC, // the contract SSOT (SDK/MCP/humans)
  'GET /auth/login': PUBLIC,
  'GET /auth/signup': PUBLIC,
  'GET /auth/callback': PUBLIC,
  'GET /auth/dev': PUBLIC, // local-only login bypass (handler 404s outside local)
  'POST /webhooks/workos': PUBLIC, // machine surface — auth is the signature
  'GET /.well-known/oauth-protected-resource': PUBLIC,
  'GET /agent/whoami': PUBLIC, // machine surface — auth is the bearer token
  'POST /mcp': PUBLIC, // machine surface — auth is the agent bearer token
  'POST /auth/logout': AUTHENTICATED,
  'GET /dashboard': AUTHENTICATED,
  'GET /work-orders': AUTHENTICATED, // the work-order list view (any member of the tenant)
  'GET /timesheets': AUTHENTICATED, // the approval queue view
  'POST /timesheets/:id/approve': roles('ADMIN', 'MANAGER'), // referent approves (SoD enforced in the service)
  'POST /timesheets/:id/reject': roles('ADMIN', 'MANAGER'),
  'GET /staffing': AUTHENTICATED, // vendors + workers list view
  // Work Order JSON API — the technical referent (MANAGER) drives the workflow.
  'POST /api/v1/work-orders': roles('ADMIN', 'MANAGER'),
  'POST /api/v1/work-orders/:id/transitions': roles('ADMIN', 'MANAGER'),
  'GET /api/v1/work-orders/:id': AUTHENTICATED,
  // Timesheet — vendor enters/submits (MEMBER+); the technical referent approves (MANAGER).
  'POST /api/v1/timesheets': roles('ADMIN', 'MANAGER', 'MEMBER'),
  'POST /api/v1/timesheets/:id/submit': roles('ADMIN', 'MANAGER', 'MEMBER'),
  'POST /api/v1/timesheets/:id/approve': roles('ADMIN', 'MANAGER'),
  'POST /api/v1/timesheets/:id/reject': roles('ADMIN', 'MANAGER'),
  'POST /api/v1/timesheets/:id/revise': roles('ADMIN', 'MANAGER', 'MEMBER'),
  'GET /api/v1/timesheets/:id': AUTHENTICATED,
  // ERP money loop — AP links the PO; the approved timesheet books to ERP.
  'POST /api/v1/work-orders/:id/link-po': roles('ADMIN', 'MANAGER'),
  'POST /api/v1/timesheets/:id/book': roles('ADMIN', 'MANAGER'),
  // Staffing — admin onboards vendors; the vendor side (MEMBER+) staffs workers/assignments.
  'POST /api/v1/vendors': roles('ADMIN', 'MANAGER'),
  'GET /api/v1/vendors/:id': AUTHENTICATED,
  'POST /api/v1/workers': roles('ADMIN', 'MANAGER', 'MEMBER'),
  'GET /api/v1/workers/:id': AUTHENTICATED,
  'POST /api/v1/assignments': roles('ADMIN', 'MANAGER', 'MEMBER'),
  'POST /api/v1/assignments/:id/end': roles('ADMIN', 'MANAGER'),
  'GET /admin/users': roles('ADMIN'),
  'POST /admin/users/:id/roles': roles('ADMIN'),
  'POST /admin/users/:id/active': roles('ADMIN'), // suspend / reactivate a membership
  'POST /admin/sso/portal': roles('ADMIN'),
}

export type RbacDecision = { kind: 'allow' } | { kind: 'login' } | { kind: 'forbidden' }

/** Pure decision core — exhaustively testable, no I/O. */
export function decideRbac(
  entry: PolicyEntry | undefined,
  ctx: { authenticated: boolean; roles: readonly TenantRole[] },
): RbacDecision {
  if (!entry) return { kind: 'forbidden' } // fail-closed
  if (entry.kind === 'public') return { kind: 'allow' }
  if (!ctx.authenticated) return { kind: 'login' }
  if (entry.kind === 'authenticated') return { kind: 'allow' }
  return entry.roles.some((r) => ctx.roles.includes(r)) ? { kind: 'allow' } : { kind: 'forbidden' }
}

/** Resolve the policy for a request: exact match first, then `:param` patterns. */
export function policyFor(method: string, path: string): PolicyEntry | undefined {
  const exact = RBAC_POLICY[`${method} ${path}`]
  if (exact) return exact
  for (const [key, entry] of Object.entries(RBAC_POLICY)) {
    const [m, pattern] = key.split(' ')
    if (m === method && pattern && matchesPattern(pattern, path)) return entry
  }
  return undefined
}

function matchesPattern(pattern: string, path: string): boolean {
  const p = pattern.split('/')
  const a = path.split('/')
  return p.length === a.length && p.every((seg, i) => seg.startsWith(':') || seg === a[i])
}
