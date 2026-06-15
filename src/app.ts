import { Hono } from 'hono'
import { parseConfig, type AppConfig } from '../config/env'
import { createDatabase, type Database } from '../config/db'
import type { AppEnv, WorkerEnv } from '../config/bindings'
import { createRequestTiming } from '@/middleware/requestTiming'
import { healthRoutes } from '@/routes/health'
import { logger, serializeError } from '@/utils/logger'
import { randomId } from '@/utils/ids'

// Resolve config + DB once per isolate, not per request.
let cachedConfig: AppConfig | undefined
let cachedDb: Database | undefined

const resolveConfig = (env: WorkerEnv): AppConfig => (cachedConfig ??= parseConfig(env))

function resolveDb(env: WorkerEnv, config: AppConfig): Database {
  if (cachedDb) return cachedDb
  // Deployed envs use Hyperdrive (→ on-prem via Tunnel). Local dev connects
  // directly: the simulated Hyperdrive proxy can't reach Docker Postgres.
  const connectionString =
    config.ENVIRONMENT === 'local'
      ? config.DATABASE_URL
      : (env.HYPERDRIVE?.connectionString ?? config.DATABASE_URL)
  if (!connectionString) throw new Error('Missing HYPERDRIVE binding or DATABASE_URL')
  return (cachedDb = createDatabase(connectionString))
}

/** Builds the Hono app. Middleware order is the request "walls". */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    const config = resolveConfig(c.env)
    c.set('traceId', c.req.header('x-trace-id') ?? randomId())
    c.set('config', config)
    c.set('db', resolveDb(c.env, config))
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
