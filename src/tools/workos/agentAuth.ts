import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/**
 * Agent identity, extracted from a WorkOS-issued OAuth 2.1 bearer token.
 * WorkOS AuthKit is the authorization server; we are the protected resource —
 * we only VERIFY (signature + issuer + audience), never mint. Pattern lifted
 * from authkit-xmcp / pipes-mcp.
 */
export type AgentPrincipal = {
  workosUserId: string // JWT `sub` — the user who authorized the agent
  sessionId: string // JWT `sid`
  organizationId: string | null // JWT `org_id`
  scopes: string[] // JWT `scope`/`scp` — per-token least-privilege (empty = full delegation)
}

function extractScopes(payload: Record<string, unknown>): string[] {
  const raw = payload.scope ?? payload.scp
  if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean)
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string')
  return []
}

export type AgentVerifier = {
  verify(token: string): Promise<AgentPrincipal | null>
}

/**
 * Build a verifier bound to a tenant's AuthKit domain. The JWKS is fetched and
 * cached by jose across calls (one set per isolate). Disabled (always null)
 * when no domain is configured.
 */
export function createAgentVerifier(config: {
  authkitDomain: string
  audience: string
  // Injectable for tests; production fetches the remote JWKS.
  jwks?: JWTVerifyGetKey
}): AgentVerifier {
  if (!config.authkitDomain) {
    return { verify: async () => null }
  }
  const issuer = config.authkitDomain
  const jwks = config.jwks ?? createRemoteJWKSet(new URL(`${issuer}/oauth2/jwks`))

  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, jwks, { issuer, audience: config.audience })
        if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null
        return {
          workosUserId: payload.sub,
          sessionId: payload.sid,
          organizationId: typeof payload.org_id === 'string' ? payload.org_id : null,
          scopes: extractScopes(payload),
        }
      } catch {
        return null
      }
    },
  }
}
