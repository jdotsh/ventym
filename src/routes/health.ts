import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { logger, serializeError } from '@/utils/logger'

// Liveness (always 200 if deployed) + readiness (DB ping).
export const healthRoutes = new Hono<AppEnv>()
  .get('/health', (c) => c.json({ status: 'ok', service: 'vms-mvp', time: new Date().toISOString() }))
  .get('/health/ready', async (c) => {
    try {
      await c.get('db').execute(sql`select 1`)
      return c.json({ status: 'ready', checks: { db: 'ok' } })
    } catch (err) {
      logger.error('health.db_down', { traceId: c.get('traceId'), ...serializeError(err) })
      return c.json({ status: 'degraded', checks: { db: 'down' } }, 503)
    }
  })
