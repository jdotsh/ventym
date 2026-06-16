import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../../../config/bindings'
import { buildWorkOrderDeps } from '@/services/workOrder/deps'
import { createWorkOrder, getWorkOrder, transitionWorkOrder } from '@/services/workOrder/service'
import { createWorkOrderSchema, transitionWorkOrderBodySchema, type WorkOrderError } from '@/services/workOrder/schema'
import { workOrderErrorCode } from '@/services/workOrder/httpError'
import { problemResponse } from '@/utils/problemResponse'
import { randomId } from '@/utils/ids'
import { requireSession } from './_shared'

const transitionSchema = transitionWorkOrderBodySchema

// A WorkOrderError → problem+json, surfacing the registered domain code (and the
// transition context when relevant) so clients/agents can react precisely.
function workOrderProblem(c: Context<AppEnv>, error: WorkOrderError): Response {
  const details = error.kind === 'invalid_transition' ? { from: error.from, transition: error.transition } : undefined
  return problemResponse(c.get('traceId'), workOrderErrorCode(error), details ? { details } : {})
}

const badBody = (c: Context<AppEnv>, error: z.ZodError): Response =>
  problemResponse(c.get('traceId'), 'VALIDATION_ERROR', { details: error.flatten() })

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null)
}

// Thin handlers: parse → service → format. No business logic, no DB access here.
export const workOrderApiRoutes = new Hono<AppEnv>()
  .post('/api/v1/work-orders', async (c) => {
    const session = requireSession(c)
    const parsed = createWorkOrderSchema.safeParse(await readJson(c))
    if (!parsed.success) return badBody(c, parsed.error)
    const result = await createWorkOrder(session, parsed.data, buildWorkOrderDeps(c.get('db'), 'human'))
    if (!result.ok) return workOrderProblem(c, result.error)
    return c.json({ data: result.value }, 201)
  })
  .post('/api/v1/work-orders/:id/transitions', async (c) => {
    const session = requireSession(c)
    const parsed = transitionSchema.safeParse(await readJson(c))
    if (!parsed.success) return badBody(c, parsed.error)
    // Idempotency-Key IS the event id — a replayed transition is a no-op (outbox).
    const eventId = c.req.header('idempotency-key') ?? randomId()
    const result = await transitionWorkOrder(
      session,
      { workOrderId: c.req.param('id'), transition: parsed.data.transition, expectedVersion: parsed.data.expectedVersion, eventId },
      buildWorkOrderDeps(c.get('db'), 'human'),
    )
    if (!result.ok) return workOrderProblem(c, result.error)
    return c.json({ data: result.value })
  })
  .get('/api/v1/work-orders/:id', async (c) => {
    const session = requireSession(c)
    const workOrder = await getWorkOrder(session, c.req.param('id'), buildWorkOrderDeps(c.get('db'), 'human'))
    if (!workOrder) return problemResponse(c.get('traceId'), 'WO_NOT_FOUND')
    return c.json({ data: workOrder })
  })
