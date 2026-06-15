import { describe, expect, it } from 'vitest'
import { decideRbac, policyFor } from '@/config/rbacPolicy'

describe('decideRbac', () => {
  it('public allows anyone', () => {
    expect(decideRbac({ kind: 'public' }, { authenticated: false, roles: [] })).toEqual({ kind: 'allow' })
  })

  it('absent policy is forbidden (fail-closed)', () => {
    expect(decideRbac(undefined, { authenticated: true, roles: ['ADMIN'] })).toEqual({ kind: 'forbidden' })
  })

  it('authenticated route bounces anonymous to login', () => {
    expect(decideRbac({ kind: 'authenticated' }, { authenticated: false, roles: [] })).toEqual({ kind: 'login' })
  })

  it('roles route allows a holder and forbids a non-holder', () => {
    const entry = { kind: 'roles', roles: ['ADMIN'] } as const
    expect(decideRbac(entry, { authenticated: true, roles: ['MEMBER', 'ADMIN'] })).toEqual({ kind: 'allow' })
    expect(decideRbac(entry, { authenticated: true, roles: ['MEMBER'] })).toEqual({ kind: 'forbidden' })
  })
})

describe('policyFor', () => {
  it('matches an exact route', () => {
    expect(policyFor('GET', '/health')).toEqual({ kind: 'public' })
  })

  it('returns undefined for an undeclared route (→ fail-closed deny)', () => {
    expect(policyFor('GET', '/totally/unknown')).toBeUndefined()
  })
})
