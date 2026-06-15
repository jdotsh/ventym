import { describe, expect, it } from 'vitest'
import type { Database } from '../config/db'
import type { AppUserRow, MembershipRow } from '@/tools/db/identityRepos'
import type { WorkosIdentity } from '@/tools/workos/client'
import {
  loadSessionContext,
  resolveLoginContext,
  type IdentityDeps,
} from '@/services/identity/service'

const identity: WorkosIdentity = {
  workosUserId: 'wos_1',
  email: 'ann@acme.test',
  firstName: 'Ann',
  lastName: 'Lee',
  emailVerified: true,
  organizationId: null,
  sessionId: 'sess_1',
}

const user = (over: Partial<AppUserRow> = {}): AppUserRow => ({
  id: 'user_1',
  workosUserId: 'wos_1',
  email: 'ann@acme.test',
  displayName: 'Ann Lee',
  locale: 'en',
  isActive: true,
  isPlatformAdmin: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
  ...over,
})

const member = (over: Partial<MembershipRow> = {}): MembershipRow => ({
  id: 'm_1',
  tenantId: 't_1',
  appUserId: 'user_1',
  roles: ['MEMBER'],
  externalId: null,
  idpProvider: null,
  isActive: true,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
})

// A fake IdentityRepo whose behavior each test overrides.
function deps(repo: Partial<IdentityDeps['repo']>): IdentityDeps {
  const base: IdentityDeps['repo'] = {
    resolveDefaultTenantId: async () => 't_1',
    resolveTenantByOrganization: async () => null,
    findUserByWorkosId: async () => user(),
    findUserByEmail: async () => user(),
    upsertUserByWorkos: async () => user(),
    ensureUserByEmail: async () => user(),
    findActiveMembership: async () => member(),
    createMembership: async () => member(),
    suspendMemberships: async () => 0,
    writeAudit: async () => {},
  }
  return {
    repo: { ...base, ...repo },
    withTenantScope: (_scope, fn) => fn({} as Database),
  }
}

describe('resolveLoginContext (callback JIT)', () => {
  it('creates a default MEMBER membership when none exists', async () => {
    let created = false
    const ctx = await resolveLoginContext(
      identity,
      deps({
        findActiveMembership: async () => null,
        createMembership: async () => {
          created = true
          return member({ roles: ['MEMBER'] })
        },
      }),
    )
    expect(created).toBe(true)
    expect(ctx.activeRole).toBe('MEMBER')
    expect(ctx.tenantId).toBe('t_1')
    expect(ctx.sessionId).toBe('sess_1')
  })

  it('reuses an existing membership and never creates one', async () => {
    let created = false
    const ctx = await resolveLoginContext(
      identity,
      deps({
        findActiveMembership: async () => member({ roles: ['ADMIN', 'AUDITOR'] }),
        createMembership: async () => {
          created = true
          return member()
        },
      }),
    )
    expect(created).toBe(false)
    expect(ctx.roles).toEqual(['ADMIN', 'AUDITOR'])
    expect(ctx.activeRole).toBe('ADMIN')
  })

  it('throws when there is no active tenant', async () => {
    await expect(
      resolveLoginContext(identity, deps({ resolveDefaultTenantId: async () => null, resolveTenantByOrganization: async () => null })),
    ).rejects.toThrow()
  })

  it('routes to the org-owned tenant when the identity carries an organizationId', async () => {
    const ctx = await resolveLoginContext(
      { ...identity, organizationId: 'org_X' },
      deps({ resolveTenantByOrganization: async () => 't_org' }),
    )
    expect(ctx.tenantId).toBe('t_org')
  })
})

describe('loadSessionContext (per-request, read-only)', () => {
  it('returns the context for an active member', async () => {
    const ctx = await loadSessionContext(identity, deps({}))
    expect(ctx?.userId).toBe('user_1')
    expect(ctx?.activeRole).toBe('MEMBER')
  })

  it('returns null when the user is unknown', async () => {
    const ctx = await loadSessionContext(identity, deps({ findUserByWorkosId: async () => null }))
    expect(ctx).toBeNull()
  })

  it('returns null when the user has no active membership', async () => {
    const ctx = await loadSessionContext(identity, deps({ findActiveMembership: async () => null }))
    expect(ctx).toBeNull()
  })
})
