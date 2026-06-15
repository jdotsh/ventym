import { Hono } from 'hono'
import type { AppEnv } from '../../config/bindings'

// Liveness (always 200 if deployed). Readiness gains a DB ping in S3.
export const healthRoutes = new Hono<AppEnv>()
  .get('/health', (c) => c.json({ status: 'ok', service: 'vms-mvp', time: new Date().toISOString() }))
  .get('/health/ready', (c) => c.json({ status: 'ready' }))
