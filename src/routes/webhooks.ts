import { Hono } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { buildDirectoryDeps } from '@/services/directorySync/deps'
import { handleDirectoryEvent } from '@/services/directorySync/service'
import { logger, serializeError } from '@/utils/logger'

/**
 * WorkOS Directory-Sync receiver. Auth is the SIGNATURE (machine surface, no
 * cookie). Verify → route to provision/deprovision. 401 a forged signature;
 * 400 a malformed payload (no point retrying); 5xx only transient handler faults.
 */
export const webhookRoutes = new Hono<AppEnv>().post('/webhooks/workos', async (c) => {
  const signature = c.req.header('workos-signature')
  const rawBody = await c.req.text()
  if (!signature) return c.json({ error: { code: 'NO_SIGNATURE', message: 'missing signature' } }, 400)

  const event = await c.get('workos').verifyWebhook(rawBody, signature)
  if (!event) {
    logger.warn('webhook.invalid_signature', { traceId: c.get('traceId') })
    return c.json({ error: { code: 'INVALID_SIGNATURE', message: 'verification failed' } }, 401)
  }

  try {
    const result = await handleDirectoryEvent(event, buildDirectoryDeps(c.get('db')))
    logger.info('webhook.handled', { traceId: c.get('traceId'), type: event.type, action: result.action })
    return c.json({ received: true, action: result.action })
  } catch (err) {
    logger.error('webhook.handler_failed', { traceId: c.get('traceId'), type: event.type, ...serializeError(err) })
    return c.json({ error: { code: 'HANDLER_ERROR', message: 'handler failed' } }, 500)
  }
})
