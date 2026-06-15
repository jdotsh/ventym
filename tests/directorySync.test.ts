import { describe, expect, it } from 'vitest'
import type { Database } from '../config/db'
import type { AppUserRow, IdentityRepo, MembershipRow } from '@/tools/db/identityRepos'
import { handleDirectoryEvent, type DirectoryDeps } from '@/services/directorySync/service'

const user = (over: Partial<AppUserRow> = {}): AppUserRow => ({
  id: 'u1',
  workosUserId: null,
  email: 'lee@acme.test',
  displayName: 'Lee',
  locale: 'en',
  isActive: true,
  isPlatformAdmin: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
  ...over,
})

const member = (): MembershipRow => ({
  id: 'm1',
  tenantId: 't1',
  appUserId: 'u1',
  roles: ['MEMBER'],
  externalId: null,
  idpProvider: null,
  isActive: true,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
})

type Spy = { created: number; suspended: number; audits: number }

function deps(over: Partial<IdentityRepo>, spy: Spy): DirectoryDeps {
  const base: IdentityRepo = {
    resolveDefaultTenantId: async () => 't1',
    findUserByWorkosId: async () => null,
    findUserByEmail: async () => user(),
    suspendMemberships: async () => {
      spy.suspended += 1
      return 1
    },
    upsertUserByWorkos: async () => user(),
    findActiveMembership: async () => member(),
    createMembership: async () => {
      spy.created += 1
      return member()
    },
    ensureUserByEmail: async () => user(),
    writeAudit: async () => {
      spy.audits += 1
    },
  }
  return { repo: { ...base, ...over }, withTenantScope: (_scope, fn) => fn({} as Database) }
}

const dsyncUser = {
  id: 'du1',
  idp_id: 'idp1',
  emails: [{ value: 'lee@acme.test', primary: true }],
  first_name: 'Lee',
  last_name: 'Park',
}

describe('handleDirectoryEvent (Directory Sync joiner/leaver)', () => {
  it('provisions on user.created — creates a membership + audits', async () => {
    const spy: Spy = { created: 0, suspended: 0, audits: 0 }
    const r = await handleDirectoryEvent(
      { type: 'dsync.user.created', data: dsyncUser },
      deps({ findActiveMembership: async () => null }, spy),
    )
    expect(r.action).toBe('provisioned')
    expect(spy.created).toBe(1)
    expect(spy.audits).toBe(1)
  })

  it('does not recreate a membership that already exists', async () => {
    const spy: Spy = { created: 0, suspended: 0, audits: 0 }
    const r = await handleDirectoryEvent({ type: 'dsync.user.updated', data: dsyncUser }, deps({}, spy))
    expect(r.action).toBe('provisioned')
    expect(spy.created).toBe(0)
  })

  it('deprovisions on user.deleted — suspends + audits (the leaver path)', async () => {
    const spy: Spy = { created: 0, suspended: 0, audits: 0 }
    const r = await handleDirectoryEvent({ type: 'dsync.user.deleted', data: dsyncUser }, deps({}, spy))
    expect(r.action).toBe('deprovisioned')
    expect(spy.suspended).toBe(1)
    expect(spy.audits).toBe(1)
  })

  it('ignores user.deleted for an unknown user', async () => {
    const r = await handleDirectoryEvent(
      { type: 'dsync.user.deleted', data: dsyncUser },
      deps({ findUserByEmail: async () => null }, { created: 0, suspended: 0, audits: 0 }),
    )
    expect(r.action).toBe('ignored')
  })

  it('ignores unrelated events without parsing their payload', async () => {
    const r = await handleDirectoryEvent(
      { type: 'dsync.group.user_added', data: {} },
      deps({}, { created: 0, suspended: 0, audits: 0 }),
    )
    expect(r.action).toBe('ignored')
  })
})
