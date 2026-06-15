import { z } from 'zod'
import { Hono } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { authenticateAgent, agentChallenge } from '@/middleware/agentAuth'
import { handleMcpRequest } from '@/services/mcp/server'
import { logger } from '@/utils/logger'

const jsonRpcSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
})

/** The MCP surface. Agents authenticate with a WorkOS bearer token (S9); every
 * tool runs with their resolved roles → same RBAC + RLS + audit path as a human. */
export const mcpRoutes = new Hono<AppEnv>().post('/mcp', async (c) => {
  const session = await authenticateAgent(c)
  if (!session) return agentChallenge(c)

  const parsed = jsonRpcSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
  }

  logger.info('mcp.request', {
    traceId: c.get('traceId'),
    method: parsed.data.method,
    userId: session.userId,
    actorKind: 'agent',
  })
  const response = await handleMcpRequest(parsed.data, session, { db: c.get('db'), workos: c.get('workos') })
  return response ? c.json(response) : c.body(null, 202) // 202 for notifications
})
