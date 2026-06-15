import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { createAgentVerifier } from '@/tools/workos/agentAuth'

const ISSUER = 'https://auth.vms.test'
const AUDIENCE = 'client_abc'

let sign: (claims: Record<string, unknown>, over?: { iss?: string; aud?: string }) => Promise<string>
let jwks: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'k1'
  jwk.alg = 'RS256'
  jwks = createLocalJWKSet({ keys: [jwk] })
  sign = (claims, over = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(over.iss ?? ISSUER)
      .setAudience(over.aud ?? AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey)
})

describe('createAgentVerifier', () => {
  it('verifies a valid token and extracts the principal', async () => {
    const verifier = createAgentVerifier({ authkitDomain: ISSUER, audience: AUDIENCE, jwks })
    const token = await sign({ sub: 'user_1', sid: 'sess_1', org_id: 'org_1' })
    expect(await verifier.verify(token)).toEqual({
      workosUserId: 'user_1',
      sessionId: 'sess_1',
      organizationId: 'org_1',
      scopes: [], // no scope claim ⇒ full delegation
    })
  })

  it('extracts space-delimited OAuth scopes from the token', async () => {
    const verifier = createAgentVerifier({ authkitDomain: ISSUER, audience: AUDIENCE, jwks })
    const token = await sign({ sub: 'user_1', sid: 'sess_1', scope: 'vms:read vms:write' })
    const principal = await verifier.verify(token)
    expect(principal?.scopes).toEqual(['vms:read', 'vms:write'])
  })

  it('rejects a wrong audience', async () => {
    const verifier = createAgentVerifier({ authkitDomain: ISSUER, audience: 'someone_else', jwks })
    const token = await sign({ sub: 'user_1', sid: 'sess_1' })
    expect(await verifier.verify(token)).toBeNull()
  })

  it('rejects a wrong issuer', async () => {
    const verifier = createAgentVerifier({ authkitDomain: ISSUER, audience: AUDIENCE, jwks })
    const token = await sign({ sub: 'user_1', sid: 'sess_1' }, { iss: 'https://evil.test' })
    expect(await verifier.verify(token)).toBeNull()
  })

  it('rejects a token missing sub/sid', async () => {
    const verifier = createAgentVerifier({ authkitDomain: ISSUER, audience: AUDIENCE, jwks })
    expect(await verifier.verify(await sign({ sub: 'user_1' }))).toBeNull()
  })

  it('rejects garbage', async () => {
    const verifier = createAgentVerifier({ authkitDomain: ISSUER, audience: AUDIENCE, jwks })
    expect(await verifier.verify('not-a-jwt')).toBeNull()
  })

  it('is disabled (always null) when no AuthKit domain is configured', async () => {
    const verifier = createAgentVerifier({ authkitDomain: '', audience: AUDIENCE })
    expect(await verifier.verify(await sign({ sub: 'user_1', sid: 'sess_1' }))).toBeNull()
  })
})
