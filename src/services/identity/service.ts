import type { Database, TenantScope } from '../../../config/db'
import type { TenantRole } from '../../../db/schema'
import type { IdentityRepo } from '@/tools/db/identityRepos'
import type { WorkosIdentity } from '@/tools/workos/client'

/** The authenticated principal for a request — identity + authorization facets. */
export type SessionContext = {
  userId: string
  email: string
  displayName: string | null
  tenantId: string
  sessionId: string
  roles: TenantRole[]
  activeRole: TenantRole | null
  // Per-token OAuth scopes (agent path only). Undefined for humans / unscoped
  // tokens = full delegation; a present, non-empty list narrows what the agent may do.
  tokenScopes?: readonly string[]
}

export type IdentityDeps = {
  repo: IdentityRepo
  withTenantScope: <T>(scope: TenantScope, fn: (tx: Database) => Promise<T>) => Promise<T>
}

const DEFAULT_ROLE: TenantRole = 'MEMBER'

// First role is the active "hat" for the MVP; a workspace switcher pins it later.
const pickActiveRole = (roles: TenantRole[]): TenantRole | null => roles[0] ?? null

function displayNameOf(identity: WorkosIdentity): string | null {
  const name = [identity.firstName, identity.lastName].filter((p): p is string => !!p).join(' ').trim()
  return name.length > 0 ? name : null
}

// Multi-org: route to the tenant that owns the WorkOS organization; fall back to
// the default tenant for users with no organization context.
async function resolveTenant(identity: WorkosIdentity, deps: IdentityDeps): Promise<string | null> {
  if (identity.organizationId) {
    const byOrg = await deps.repo.resolveTenantByOrganization(identity.organizationId)
    if (byOrg) return byOrg
  }
  return deps.repo.resolveDefaultTenantId()
}

/** Callback path: ensure user + membership exist (JIT), return the session context.
 *  `jitRoles` is the role set granted to a BRAND-NEW membership (existing members keep
 *  theirs). Deployed envs pass [MEMBER]; local dev passes [ADMIN, MANAGER] so a fresh
 *  login can exercise the whole app. */
export async function resolveLoginContext(
  identity: WorkosIdentity,
  deps: IdentityDeps,
  jitRoles: readonly TenantRole[] = [DEFAULT_ROLE],
): Promise<SessionContext> {
  const tenantId = await resolveTenant(identity, deps)
  if (!tenantId) throw new Error('no active tenant to admit the user')

  const user = await deps.repo.upsertUserByWorkos({
    workosUserId: identity.workosUserId,
    email: identity.email,
    displayName: displayNameOf(identity),
  })

  const scope = { tenantId, userId: user.id, sessionId: identity.sessionId }
  const roles = await deps.withTenantScope(scope, async (tx) => {
    const existing = await deps.repo.findActiveMembership(tx, user.id)
    const member =
      existing ?? (await deps.repo.createMembership(tx, { tenantId, appUserId: user.id, roles: [...jitRoles] }))
    return member.roles
  })

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    tenantId,
    sessionId: identity.sessionId,
    roles,
    activeRole: pickActiveRole(roles),
  }
}

/** Per-request path: load context read-only (roles re-checked every request). */
export async function loadSessionContext(
  identity: WorkosIdentity,
  deps: IdentityDeps,
): Promise<SessionContext | null> {
  const user = await deps.repo.findUserByWorkosId(identity.workosUserId)
  if (!user || !user.isActive) return null

  const tenantId = await resolveTenant(identity, deps)
  if (!tenantId) return null

  const scope = { tenantId, userId: user.id, sessionId: identity.sessionId }
  const member = await deps.withTenantScope(scope, (tx) => deps.repo.findActiveMembership(tx, user.id))
  if (!member) return null

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    tenantId,
    sessionId: identity.sessionId,
    roles: member.roles,
    activeRole: pickActiveRole(member.roles),
  }
}
