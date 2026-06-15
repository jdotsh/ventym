import { Hono } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { authenticateAgent, agentChallenge, PROTECTED_RESOURCE_PATH } from '@/middleware/agentAuth'

/** Agent-facing discovery + a probe. Auth is the bearer token, not a cookie. */
export const agentRoutes = new Hono<AppEnv>()
  // RFC 9728: point agents at the WorkOS authorization server.
  .get(PROTECTED_RESOURCE_PATH, (c) => {
    const origin = new URL(c.req.url).origin
    const authkit = c.get('config').WORKOS_AUTHKIT_DOMAIN
    return c.json({
      resource: `${origin}/mcp`,
      authorization_servers: authkit ? [authkit] : [],
      bearer_methods_supported: ['header'],
    })
  })

  // Proves an agent token maps to our identity + roles (the MCP substrate).
  .get('/agent/whoami', async (c) => {
    const session = await authenticateAgent(c)
    if (!session) return agentChallenge(c)
    return c.json({
      data: {
        userId: session.userId,
        tenantId: session.tenantId,
        roles: session.roles,
        actorKind: 'agent',
      },
    })
  })
