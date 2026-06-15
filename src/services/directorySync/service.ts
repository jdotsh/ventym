import { z } from 'zod'
import type { Database, TenantScope } from '../../../config/db'
import type { IdentityRepo } from '@/tools/db/identityRepos'
import type { WebhookEvent } from '@/tools/workos/client'

// The WorkOS Directory-Sync user payload (subset we consume), validated at the boundary.
const dsyncUserSchema = z.object({
  id: z.string().min(1),
  idp_id: z.string().optional(),
  emails: z.array(z.object({ value: z.string().email(), primary: z.boolean().optional() })).default([]),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
})
type DsyncUser = z.infer<typeof dsyncUserSchema>

export type DirectoryDeps = {
  repo: IdentityRepo
  withTenantScope: <T>(scope: TenantScope, fn: (tx: Database) => Promise<T>) => Promise<T>
}

export type DirectoryResult = { action: 'provisioned' | 'deprovisioned' | 'ignored' }

const SYNC_SESSION = 'dsync' // synthetic session id for the RLS GUC on unattended writes

function primaryEmail(user: DsyncUser): string | null {
  return (user.emails.find((e) => e.primary) ?? user.emails[0])?.value.toLowerCase() ?? null
}

function displayName(user: DsyncUser): string | null {
  const name = [user.first_name, user.last_name].filter((p): p is string => !!p).join(' ').trim()
  return name.length > 0 ? name : null
}

/** Route a verified Directory-Sync event to provisioning. Idempotent by construction. */
export async function handleDirectoryEvent(event: WebhookEvent, deps: DirectoryDeps): Promise<DirectoryResult> {
  if (event.type === 'dsync.user.created' || event.type === 'dsync.user.updated') {
    return provision(dsyncUserSchema.parse(event.data), deps)
  }
  if (event.type === 'dsync.user.deleted') {
    return deprovision(dsyncUserSchema.parse(event.data), deps)
  }
  return { action: 'ignored' }
}

// Joiner: link by email, ensure an active membership. Never overwrites AuthKit id.
async function provision(user: DsyncUser, deps: DirectoryDeps): Promise<DirectoryResult> {
  const email = primaryEmail(user)
  const tenantId = await deps.repo.resolveDefaultTenantId()
  if (!email || !tenantId) return { action: 'ignored' }

  const appUser = await deps.repo.ensureUserByEmail({ email, displayName: displayName(user) })
  await deps.withTenantScope({ tenantId, userId: appUser.id, sessionId: SYNC_SESSION }, async (tx) => {
    const existing = await deps.repo.findActiveMembership(tx, appUser.id)
    if (!existing) await deps.repo.createMembership(tx, { tenantId, appUserId: appUser.id, roles: ['MEMBER'] })
    await deps.repo.writeAudit(tx, {
      tenantId,
      action: 'USER_PROVISIONED',
      entityId: appUser.id,
      actorKind: 'system',
      after: { email },
    })
  })
  return { action: 'provisioned' }
}

// Leaver: suspend the user's membership immediately (the bank-critical path).
async function deprovision(user: DsyncUser, deps: DirectoryDeps): Promise<DirectoryResult> {
  const email = primaryEmail(user)
  if (!email) return { action: 'ignored' }
  const appUser = await deps.repo.findUserByEmail(email)
  const tenantId = await deps.repo.resolveDefaultTenantId()
  if (!appUser || !tenantId) return { action: 'ignored' }

  const suspended = await deps.withTenantScope(
    { tenantId, userId: appUser.id, sessionId: SYNC_SESSION },
    async (tx) => {
      const count = await deps.repo.suspendMemberships(tx, appUser.id)
      if (count > 0) {
        await deps.repo.writeAudit(tx, {
          tenantId,
          action: 'USER_DEPROVISIONED',
          entityId: appUser.id,
          actorKind: 'system',
          after: { email, suspended: count },
        })
      }
      return count
    },
  )
  return { action: suspended > 0 ? 'deprovisioned' : 'ignored' }
}
