import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { randomId } from '@/utils/ids'

const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i

// Correlation id, set FIRST so every downstream log line carries it. Honours an
// inbound W3C `traceparent` (or `x-trace-id`), else mints one; echoes it back.
export function createTraceId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const traceId = parseTraceparent(c.req.header('traceparent')) ?? c.req.header('x-trace-id') ?? randomId()
    c.set('traceId', traceId)
    await next()
    c.header('x-trace-id', traceId)
  }
}

function parseTraceparent(header: string | undefined): string | null {
  const match = header ? TRACEPARENT.exec(header) : null
  const traceId = match?.[1]
  // Reject the all-zero trace-id (invalid per the W3C spec).
  return traceId && !/^0+$/.test(traceId) ? traceId : null
}
