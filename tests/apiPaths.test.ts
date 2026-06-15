import { describe, expect, it } from 'vitest'
import { isApiPath } from '@/utils/apiPaths'

describe('isApiPath', () => {
  it('classifies the machine/API surface', () => {
    expect(isApiPath('/api/v1/work-orders')).toBe(true)
    expect(isApiPath('/mcp')).toBe(true)
    expect(isApiPath('/agent/whoami')).toBe(true)
    expect(isApiPath('/webhooks/workos')).toBe(true)
    expect(isApiPath('/.well-known/oauth-protected-resource')).toBe(true)
  })

  it('classifies the HTML view surface as non-API', () => {
    expect(isApiPath('/')).toBe(false)
    expect(isApiPath('/login')).toBe(false)
    expect(isApiPath('/dashboard')).toBe(false)
    expect(isApiPath('/admin/users')).toBe(false)
  })
})
