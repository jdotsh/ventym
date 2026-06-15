import { Hono } from 'hono'
import { parseConfig, type AppConfig } from '../config/env'
import type { AppEnv, WorkerEnv } from '../config/bindings'
import { createRequestTiming } from '@/middleware/requestTiming'
import { healthRoutes } from '@/routes/health'
import { logger, serializeError } from '@/utils/logger'
import { randomId } from '@/utils/ids'

// Parse the env once per isolate, not per request.
let cachedConfig: AppConfig | undefined
const resolveConfig = (env: WorkerEnv): AppConfig => (cachedConfig ??= parseConfig(env))

/** Builds the Hono app. Middleware order is the request "walls". */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('traceId', c.req.header('x-trace-id') ?? randomId())
    c.set('config', resolveConfig(c.env))
    await next()
  })
  app.use('*', createRequestTiming())

  app.route('/', healthRoutes)

  app.onError((err, c) => {
    logger.error('unhandled', { traceId: c.get('traceId'), ...serializeError(err) })
    return c.json({ error: { code: 'INTERNAL', message: 'Internal error' } }, 500)
  })

  return app
}
