import type { Context } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { buildIdentityDeps } from '@/services/identity/deps'
import { loadSessionContext, type SessionContext } from '@/services/identity/service'

export const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource'

/**
 * Resolve an agent's WorkOS bearer token into OUR SessionContext — so an agent
 * gets the exact same membership + roles as the human who authorized it
 * (feed-only RBAC, no service-role backdoor). Null = no/invalid token or no
 * active membership.
 */
export async function authenticateAgent(c: Context<AppEnv>): Promise<SessionContext | null> {
  const header = c.req.header('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
  if (!token) return null

  const principal = await c.get('agentVerifier').verify(token)
  if (!principal) return null

  const session = await loadSessionContext(
    {
      workosUserId: principal.workosUserId,
      sessionId: principal.sessionId,
      organizationId: principal.organizationId,
      email: '',
      firstName: null,
      lastName: null,
      emailVerified: true,
    },
    buildIdentityDeps(c.get('db')),
  )
  // Carry the token's OAuth scopes so the MCP layer can enforce least-privilege.
  return session ? { ...session, tokenScopes: principal.scopes } : null
}

/** RFC 9728 challenge: tells the agent where to discover the auth server. */
export function agentChallenge(c: Context<AppEnv>): Response {
  const origin = new URL(c.req.url).origin
  c.header('WWW-Authenticate', `Bearer resource_metadata="${origin}${PROTECTED_RESOURCE_PATH}"`)
  return c.json({ error: { code: 'UNAUTHENTICATED', message: 'agent bearer token required' } }, 401)
}
