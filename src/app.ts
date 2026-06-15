import { Hono } from 'hono'
import { parseConfig, type AppConfig } from '../config/env'
import { createDatabase, type Database } from '../config/db'
import type { AppEnv, WorkerEnv } from '../config/bindings'
import { createWorkosClient, type WorkosClient } from '@/tools/workos/client'
import { createAgentVerifier, type AgentVerifier } from '@/tools/workos/agentAuth'
import { createTraceId } from '@/middleware/traceId'
import { createRequestTiming } from '@/middleware/requestTiming'
import { createSecurityHeaders } from '@/middleware/security'
import { createRateLimit } from '@/middleware/rateLimit'
import { createSessionMiddleware } from '@/middleware/session'
import { createCsrf } from '@/middleware/csrf'
import { createIdempotency } from '@/middleware/idempotency'
import { requireRoutePolicy } from '@/middleware/rbacEnforce'
import { authRoutes } from '@/routes/auth'
import { adminRoutes } from '@/routes/admin'
import { webhookRoutes } from '@/routes/webhooks'
import { agentRoutes } from '@/routes/agent'
import { mcpRoutes } from '@/routes/mcp'
import { workOrderApiRoutes } from '@/routes/api/v1/workOrders'
import { timesheetApiRoutes } from '@/routes/api/v1/timesheets'
import { erpApiRoutes } from '@/routes/api/v1/erp'
import { openapiRoutes } from '@/routes/openapi'
import { viewRoutes } from '@/routes/views'
import { healthRoutes } from '@/routes/health'
import { logger, serializeError } from '@/utils/logger'
import { appErrorToProblem, problemResponse } from '@/utils/problemResponse'
import { isAppError } from '@/types/errors'

// Resolve config + DB + WorkOS once per isolate, not per request.
let cachedConfig: AppConfig | undefined
let cachedDb: Database | undefined
let cachedWorkos: WorkosClient | undefined
let cachedAgentVerifier: AgentVerifier | undefined

const resolveConfig = (env: WorkerEnv): AppConfig => (cachedConfig ??= parseConfig(env))

const resolveWorkos = (config: AppConfig): WorkosClient =>
  (cachedWorkos ??= createWorkosClient({
    apiKey: config.WORKOS_API_KEY,
    clientId: config.WORKOS_CLIENT_ID,
    redirectUri: config.WORKOS_REDIRECT_URI,
    cookiePassword: config.SESSION_SECRET,
    webhookSecret: config.WORKOS_WEBHOOK_SECRET,
  }))

const resolveAgentVerifier = (config: AppConfig): AgentVerifier =>
  (cachedAgentVerifier ??= createAgentVerifier({
    authkitDomain: config.WORKOS_AUTHKIT_DOMAIN,
    audience: config.WORKOS_CLIENT_ID,
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

  app.use('*', createTraceId()) // FIRST — every log line correlates by trace id
  app.use('*', async (c, next) => {
    const config = resolveConfig(c.env)
    c.set('config', config)
    c.set('db', resolveDb(c.env, config))
    c.set('workos', resolveWorkos(config))
    c.set('agentVerifier', resolveAgentVerifier(config))
    await next()
  })
  app.use('*', createSecurityHeaders())
  app.use('*', createRequestTiming())
  // Throttle the unauthenticated/machine surfaces (auth is the token/signature).
  app.use('/mcp', createRateLimit({ name: 'mcp', limit: 120, windowSec: 60 }))
  app.use('/webhooks/*', createRateLimit({ name: 'webhook', limit: 240, windowSec: 60 }))
  app.use('/agent/*', createRateLimit({ name: 'agent', limit: 120, windowSec: 60 }))
  app.use('/api/*', createRateLimit({ name: 'api', limit: 300, windowSec: 60 }))
  app.use('*', createSessionMiddleware())
  app.use('*', createCsrf()) // after session: CSRF applies only to cookie-authed mutations
  app.use('*', requireRoutePolicy())
  app.use('/api/*', createIdempotency()) // after RBAC: only authorized mutations claim keys

  app.route('/', healthRoutes)
  app.route('/', authRoutes)
  app.route('/', webhookRoutes)
  app.route('/', agentRoutes)
  app.route('/', mcpRoutes)
  app.route('/', workOrderApiRoutes)
  app.route('/', timesheetApiRoutes)
  app.route('/', erpApiRoutes)
  app.route('/', openapiRoutes)
  app.route('/', viewRoutes)
  app.route('/', adminRoutes)

  app.onError((err, c) => {
    const traceId = c.get('traceId')
    if (isAppError(err)) {
      const level = err.statusCode >= 500 ? 'error' : 'warn'
      logger[level]('app_error', { traceId, code: err.code, ...serializeError(err) })
      return appErrorToProblem(err, traceId)
    }
    logger.error('unhandled', { traceId, ...serializeError(err) })
    return problemResponse(traceId, 'INTERNAL')
  })

  return app
}
