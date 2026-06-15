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
  'GET /auth/login': PUBLIC,
  'GET /auth/callback': PUBLIC,
  'POST /webhooks/workos': PUBLIC, // machine surface — auth is the signature
  'GET /.well-known/oauth-protected-resource': PUBLIC,
  'GET /agent/whoami': PUBLIC, // machine surface — auth is the bearer token
  'POST /mcp': PUBLIC, // machine surface — auth is the agent bearer token
  'POST /auth/logout': AUTHENTICATED,
  'GET /dashboard': AUTHENTICATED,
  'GET /admin/users': roles('ADMIN'),
  'POST /admin/users/:id/roles': roles('ADMIN'),
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
