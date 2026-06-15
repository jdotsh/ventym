import { Hono } from 'hono'
import { parseConfig, type AppConfig } from '../config/env'
import { createDatabase, type Database } from '../config/db'
import type { AppEnv, WorkerEnv } from '../config/bindings'
import { createWorkosClient, type WorkosClient } from '@/tools/workos/client'
import { createRequestTiming } from '@/middleware/requestTiming'
import { createSessionMiddleware } from '@/middleware/session'
import { requireRoutePolicy } from '@/middleware/rbacEnforce'
import { authRoutes } from '@/routes/auth'
import { adminRoutes } from '@/routes/admin'
import { viewRoutes } from '@/routes/views'
import { healthRoutes } from '@/routes/health'
import { logger, serializeError } from '@/utils/logger'
import { randomId } from '@/utils/ids'

// Resolve config + DB + WorkOS once per isolate, not per request.
let cachedConfig: AppConfig | undefined
let cachedDb: Database | undefined
let cachedWorkos: WorkosClient | undefined

const resolveConfig = (env: WorkerEnv): AppConfig => (cachedConfig ??= parseConfig(env))

const resolveWorkos = (config: AppConfig): WorkosClient =>
  (cachedWorkos ??= createWorkosClient({
    apiKey: config.WORKOS_API_KEY,
    clientId: config.WORKOS_CLIENT_ID,
    redirectUri: config.WORKOS_REDIRECT_URI,
    cookiePassword: config.SESSION_SECRET,
  }))

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
    c.set('workos', resolveWorkos(config))
    await next()
  })
  app.use('*', createRequestTiming())
  app.use('*', createSessionMiddleware())
  app.use('*', requireRoutePolicy())

  app.route('/', healthRoutes)
  app.route('/', authRoutes)
  app.route('/', viewRoutes)
  app.route('/', adminRoutes)

  app.onError((err, c) => {
    logger.error('unhandled', { traceId: c.get('traceId'), ...serializeError(err) })
    return c.json({ error: { code: 'INTERNAL', message: 'Internal error' } }, 500)
  })

  return app
}
