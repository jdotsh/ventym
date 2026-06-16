import { describe, expect, it } from 'vitest'
import type { Database } from '../config/db'
import type { MemberView } from '@/tools/db/adminRepos'
import { setMemberActive, setMemberRoles, type AdminDeps } from '@/services/admin/service'

const actor = { tenantId: 't_1', userId: 'u_1', sessionId: 's_1' }

const existing: MemberView = {
  membershipId: 'm_1',
  appUserId: 'u_2', // not the actor — suspendable
  email: 'a@acme.test',
  displayName: null,
  roles: ['MEMBER'],
  isActive: true,
  version: 3,
}

const workos: AdminDeps['workos'] = {
  authorizationUrl: () => '',
  completeLogin: async () => {
    throw new Error('unused')
  },
  authenticateSession: async () => null,
  logoutUrl: async () => null,
  adminPortalLink: async () => 'https://portal',
  verifyWebhook: async () => null,
}

function deps(repo: Partial<AdminDeps['repo']>, audit: { calls: number }): AdminDeps {
  const base: AdminDeps['repo'] = {
    listMembers: async () => [],
    findMember: async () => existing,
    setRoles: async () => true,
    setActive: async () => true,
    countActiveAdmins: async () => 2,
    findWorkosOrgId: async () => null,
    writeAudit: async () => {
      audit.calls += 1
    },
  }
  return { repo: { ...base, ...repo }, workos, withTenantScope: (_scope, fn) => fn({} as Database) }
}

describe('setMemberRoles (optimistic concurrency + audit)', () => {
  it('updates and writes one audit row on success', async () => {
    const audit = { calls: 0 }
    const result = await setMemberRoles(actor, 'm_1', { roles: ['ADMIN'], expectedVersion: 3 }, deps({}, audit))
    expect(result).toEqual({ type: 'ok' })
    expect(audit.calls).toBe(1)
  })

  it('returns conflict and writes NO audit when the version moved', async () => {
    const audit = { calls: 0 }
    const result = await setMemberRoles(
      actor,
      'm_1',
      { roles: ['ADMIN'], expectedVersion: 3 },
      deps({ setRoles: async () => false }, audit),
    )
    expect(result).toEqual({ type: 'conflict' })
    expect(audit.calls).toBe(0)
  })

  it('returns notFound when the member is absent', async () => {
    const result = await setMemberRoles(
      actor,
      'gone',
      { roles: ['ADMIN'], expectedVersion: 3 },
      deps({ findMember: async () => null }, { calls: 0 }),
    )
    expect(result).toEqual({ type: 'notFound' })
  })
})

describe('setMemberActive (suspend/reactivate — Athena safeguards, vms style)', () => {
  it('suspends a member and writes one audit row', async () => {
    const audit = { calls: 0 }
    const r = await setMemberActive(actor, 'm_1', { isActive: false, expectedVersion: 3 }, deps({}, audit))
    expect(r).toEqual({ type: 'ok' })
    expect(audit.calls).toBe(1)
  })

  it('refuses to suspend your own membership (no self-lockout)', async () => {
    const self: MemberView = { ...existing, appUserId: 'u_1' }
    const r = await setMemberActive(actor, 'm_1', { isActive: false, expectedVersion: 3 }, deps({ findMember: async () => self }, { calls: 0 }))
    expect(r).toEqual({ type: 'selfSuspend' })
  })

  it('refuses to suspend the last active ADMIN (no tenant lockout)', async () => {
    const admin: MemberView = { ...existing, roles: ['ADMIN'] }
    const r = await setMemberActive(
      actor,
      'm_1',
      { isActive: false, expectedVersion: 3 },
      deps({ findMember: async () => admin, countActiveAdmins: async () => 1 }, { calls: 0 }),
    )
    expect(r).toEqual({ type: 'lastAdmin' })
  })

  it('returns conflict when the version moved', async () => {
    const r = await setMemberActive(actor, 'm_1', { isActive: false, expectedVersion: 3 }, deps({ setActive: async () => false }, { calls: 0 }))
    expect(r).toEqual({ type: 'conflict' })
  })
})
