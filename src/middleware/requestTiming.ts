import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../../config/bindings'
import { logger } from '@/utils/logger'

function classify(status: number): 'ok' | 'client_error' | 'server_error' {
  if (status >= 500) return 'server_error'
  if (status >= 400) return 'client_error'
  return 'ok'
}

/**
 * Golden-signal source: one `http.request` log line + one Analytics Engine
 * datapoint per request. Runs after the handler, so it never delays a response.
 */
export function createRequestTiming() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const startedAt = Date.now()
    await next()
    const durationMs = Date.now() - startedAt
    const route = c.req.routePath
    const outcome = classify(c.res.status)
    logger.info('http.request', {
      method: c.req.method,
      route,
      status: c.res.status,
      durationMs,
      outcome,
      traceId: c.get('traceId'),
    })
    c.env.SLI?.writeDataPoint({
      blobs: [route, c.req.method, outcome],
      doubles: [durationMs],
      indexes: [route.slice(0, 96)],
    })
  })
}
