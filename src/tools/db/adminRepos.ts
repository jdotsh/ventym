import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '../../../config/db'
import { appUser, auditLog, membership, tenantConnection, type ActorKind, type TenantRole } from '../../../db/schema'

export type MemberView = {
  membershipId: string
  email: string
  displayName: string | null
  roles: TenantRole[]
  isActive: boolean
  version: number
}

export type AuditEntry = {
  tenantId: string
  action: string
  entityId: string
  actorUserId: string
  actorKind?: ActorKind
  before?: unknown
  after?: unknown
}

export type AdminRepo = ReturnType<typeof createAdminRepo>

// All methods take a tenant-scoped tx (call inside withTenantScope).
export function createAdminRepo() {
  const memberColumns = {
    membershipId: membership.id,
    email: appUser.email,
    displayName: appUser.displayName,
    roles: membership.roles,
    isActive: membership.isActive,
    version: membership.version,
  }

  return {
    listMembers(tx: Database, tenantId: string): Promise<MemberView[]> {
      return tx
        .select(memberColumns)
        .from(membership)
        .innerJoin(appUser, eq(membership.appUserId, appUser.id))
        .where(eq(membership.tenantId, tenantId))
        .orderBy(asc(appUser.email))
    },

    async findMember(tx: Database, membershipId: string): Promise<MemberView | null> {
      const [row] = await tx
        .select(memberColumns)
        .from(membership)
        .innerJoin(appUser, eq(membership.appUserId, appUser.id))
        .where(eq(membership.id, membershipId))
        .limit(1)
      return row ?? null
    },

    // Succeeds only when `version` still matches (optimistic concurrency).
    async setRoles(
      tx: Database,
      input: { membershipId: string; roles: TenantRole[]; expectedVersion: number },
    ): Promise<boolean> {
      const updated = await tx
        .update(membership)
        .set({ roles: input.roles, version: input.expectedVersion + 1, updatedAt: new Date() })
        .where(and(eq(membership.id, input.membershipId), eq(membership.version, input.expectedVersion)))
        .returning({ id: membership.id })
      return updated.length > 0
    },

    async findWorkosOrgId(tx: Database, tenantId: string): Promise<string | null> {
      const [row] = await tx
        .select({ config: tenantConnection.config })
        .from(tenantConnection)
        .where(and(eq(tenantConnection.tenantId, tenantId), eq(tenantConnection.providerId, 'workos')))
        .limit(1)
      return row?.config.organizationId ?? null
    },

    async writeAudit(tx: Database, entry: AuditEntry): Promise<void> {
      await tx.insert(auditLog).values({
        tenantId: entry.tenantId,
        entityType: 'membership',
        entityId: entry.entityId,
        action: entry.action,
        actorUserId: entry.actorUserId,
        actorKind: entry.actorKind ?? 'human',
        beforeJson: entry.before ?? null,
        afterJson: entry.after ?? null,
      })
    },
  }
}
