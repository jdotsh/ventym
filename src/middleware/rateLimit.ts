import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../../config/bindings'

/**
 * KV-backed fixed-window rate limiter, keyed by client IP + window. Approximate
 * (read-then-write under KV eventual consistency) — fine for abuse throttling on
 * the machine surfaces. No-op when no KV is bound (local/tests).
 */
export function createRateLimit(opts: { name: string; limit: number; windowSec: number }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const kv = c.env.RATE_LIMIT
    if (!kv) return next()

    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown'
    const window = Math.floor(Date.now() / 1000 / opts.windowSec)
    const key = `rl:${opts.name}:${ip}:${window}`

    const count = Number((await kv.get(key)) ?? '0')
    if (count >= opts.limit) {
      return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, 429)
    }
    await kv.put(key, String(count + 1), { expirationTtl: opts.windowSec * 2 })
    return next()
  })
}
