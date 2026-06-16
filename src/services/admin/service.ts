import { z } from 'zod'
import type { Database, TenantScope } from '../../../config/db'
import { TENANT_ROLES } from '../../../db/schema'
import type { AdminRepo, MemberView } from '@/tools/db/adminRepos'
import type { WorkosClient } from '@/tools/workos/client'

export const setRolesSchema = z.object({
  roles: z.array(z.enum(TENANT_ROLES)).min(1),
  expectedVersion: z.coerce.number().int().nonnegative(),
})
export type SetRolesInput = z.infer<typeof setRolesSchema>

export const setActiveSchema = z.object({
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true'),
  expectedVersion: z.coerce.number().int().nonnegative(),
})
export type SetActiveInput = z.infer<typeof setActiveSchema>

export type AdminActor = { tenantId: string; userId: string; sessionId: string }

export type AdminDeps = {
  repo: AdminRepo
  workos: WorkosClient
  withTenantScope: <T>(scope: TenantScope, fn: (tx: Database) => Promise<T>) => Promise<T>
}

export type SetRolesResult = { type: 'ok' } | { type: 'notFound' } | { type: 'conflict' }

const scopeOf = (a: AdminActor): TenantScope => ({
  tenantId: a.tenantId,
  userId: a.userId,
  sessionId: a.sessionId,
})

export function listMembers(actor: AdminActor, deps: AdminDeps): Promise<MemberView[]> {
  return deps.withTenantScope(scopeOf(actor), (tx) => deps.repo.listMembers(tx, actor.tenantId))
}

/** Change a member's roles atomically: read-before → version-checked update → audit. */
export function setMemberRoles(
  actor: AdminActor,
  membershipId: string,
  input: SetRolesInput,
  deps: AdminDeps,
): Promise<SetRolesResult> {
  return deps.withTenantScope(scopeOf(actor), async (tx) => {
    const before = await deps.repo.findMember(tx, membershipId)
    if (!before) return { type: 'notFound' }
    const updated = await deps.repo.setRoles(tx, {
      membershipId,
      roles: input.roles,
      expectedVersion: input.expectedVersion,
    })
    if (!updated) return { type: 'conflict' }
    await deps.repo.writeAudit(tx, {
      tenantId: actor.tenantId,
      action: 'ROLE_CHANGED',
      entityId: membershipId,
      actorUserId: actor.userId,
      before: { roles: before.roles },
      after: { roles: input.roles },
    })
    return { type: 'ok' }
  })
}

export type SetActiveResult =
  | { type: 'ok' }
  | { type: 'notFound' }
  | { type: 'conflict' }
  | { type: 'selfSuspend' } // can't suspend your own membership (Athena safeguard)
  | { type: 'lastAdmin' } // can't suspend the last active ADMIN — don't lock the tenant out

/**
 * Suspend / reactivate a member (the leaver in joiner/mover/leaver). Version-checked
 * + audited, same as role changes. No explicit session revocation needed: vms
 * re-resolves the session every request, so an inactive membership is denied on the
 * suspended user's next call — where Athena had to clear a ~30s cache.
 */
export function setMemberActive(
  actor: AdminActor,
  membershipId: string,
  input: SetActiveInput,
  deps: AdminDeps,
): Promise<SetActiveResult> {
  return deps.withTenantScope(scopeOf(actor), async (tx) => {
    const before = await deps.repo.findMember(tx, membershipId)
    if (!before) return { type: 'notFound' }
    if (!input.isActive) {
      if (before.appUserId === actor.userId) return { type: 'selfSuspend' }
      if (before.roles.includes('ADMIN') && (await deps.repo.countActiveAdmins(tx, actor.tenantId)) <= 1) {
        return { type: 'lastAdmin' }
      }
    }
    const updated = await deps.repo.setActive(tx, { membershipId, isActive: input.isActive, expectedVersion: input.expectedVersion })
    if (!updated) return { type: 'conflict' }
    await deps.repo.writeAudit(tx, {
      tenantId: actor.tenantId,
      action: input.isActive ? 'USER_REACTIVATED' : 'USER_SUSPENDED',
      entityId: membershipId,
      actorUserId: actor.userId,
      before: { isActive: before.isActive, roles: before.roles },
      after: { isActive: input.isActive, roles: before.roles },
    })
    return { type: 'ok' }
  })
}

/** A WorkOS Admin Portal link so the tenant's IT self-serves SSO. Null = no WorkOS org configured. */
export async function ssoPortalLink(
  actor: AdminActor,
  intent: 'sso' | 'dsync',
  deps: AdminDeps,
): Promise<string | null> {
  const orgId = await deps.withTenantScope(scopeOf(actor), (tx) => deps.repo.findWorkosOrgId(tx, actor.tenantId))
  return orgId ? deps.workos.adminPortalLink(orgId, intent) : null
}
