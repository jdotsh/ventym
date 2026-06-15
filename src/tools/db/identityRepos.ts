import { and, desc, eq, or } from 'drizzle-orm'
import type { Database } from '../../../config/db'
import { appUser, membership, tenant, type TenantRole } from '../../../db/schema'

export type AppUserRow = typeof appUser.$inferSelect
export type MembershipRow = typeof membership.$inferSelect

/**
 * Identity data access. Global tables (app_user, tenant) are read with the base
 * client pre-session; membership is read/written through a tenant-scoped tx.
 */
export type IdentityRepo = ReturnType<typeof createIdentityRepo>

export function createIdentityRepo(db: Database) {
  return {
    // Single-tenant MVP: the one active tenant. Multi-tenant resolves an
    // organizationId → tenant_connection here later.
    async resolveDefaultTenantId(): Promise<string | null> {
      const [row] = await db
        .select({ id: tenant.id })
        .from(tenant)
        .where(eq(tenant.isActive, true))
        .orderBy(desc(tenant.createdAt))
        .limit(1)
      return row?.id ?? null
    },

    async findUserByWorkosId(workosUserId: string): Promise<AppUserRow | null> {
      const [row] = await db.select().from(appUser).where(eq(appUser.workosUserId, workosUserId)).limit(1)
      return row ?? null
    },

    // JIT: link the WorkOS user to an app_user (by workosUserId, else email).
    async upsertUserByWorkos(input: {
      workosUserId: string
      email: string
      displayName: string | null
    }): Promise<AppUserRow> {
      const [existing] = await db
        .select()
        .from(appUser)
        .where(or(eq(appUser.workosUserId, input.workosUserId), eq(appUser.email, input.email)))
        .limit(1)

      if (existing) {
        const [updated] = await db
          .update(appUser)
          .set({ workosUserId: input.workosUserId, lastLoginAt: new Date(), updatedAt: new Date() })
          .where(eq(appUser.id, existing.id))
          .returning()
        return updated ?? existing
      }
      const [created] = await db
        .insert(appUser)
        .values({ workosUserId: input.workosUserId, email: input.email, displayName: input.displayName })
        .returning()
      if (!created) throw new Error('failed to create app_user')
      return created
    },

    // Tenant-scoped (call inside withTenantScope). Returns null when absent.
    async findActiveMembership(tx: Database, appUserId: string): Promise<MembershipRow | null> {
      const [row] = await tx
        .select()
        .from(membership)
        .where(and(eq(membership.appUserId, appUserId), eq(membership.isActive, true)))
        .limit(1)
      return row ?? null
    },

    async createMembership(
      tx: Database,
      input: { tenantId: string; appUserId: string; roles: TenantRole[] },
    ): Promise<MembershipRow> {
      const [row] = await tx.insert(membership).values(input).returning()
      if (!row) throw new Error('failed to create membership')
      return row
    },
  }
}
