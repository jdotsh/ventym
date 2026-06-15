import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../../../config/bindings'
import { buildErpDeps } from '@/services/erp/deps'
import { bookTimesheet, linkPurchaseOrder } from '@/services/erp/service'
import { bookSchema, linkPoSchema, type ErpError } from '@/services/erp/schema'
import { erpErrorCode } from '@/services/erp/httpError'
import { problemResponse } from '@/utils/problemResponse'
import { randomId } from '@/utils/ids'
import { requireSession } from './_shared'

const erpProblem = (c: Context<AppEnv>, error: ErpError): Response =>
  problemResponse(c.get('traceId'), erpErrorCode(error))
const badBody = (c: Context<AppEnv>, error: z.ZodError): Response =>
  problemResponse(c.get('traceId'), 'VALIDATION_ERROR', { details: error.flatten() })
const readJson = (c: Context<AppEnv>): Promise<unknown> => c.req.json().catch(() => null)

// The money loop: AP links the PO, then an APPROVED timesheet books to ERP.
export const erpApiRoutes = new Hono<AppEnv>()
  .post('/api/v1/work-orders/:id/link-po', async (c) => {
    const session = requireSession(c)
    const parsed = linkPoSchema.safeParse(await readJson(c))
    if (!parsed.success) return badBody(c, parsed.error)
    const eventId = c.req.header('idempotency-key') ?? randomId()
    const result = await linkPurchaseOrder(
      session,
      { workOrderId: c.req.param('id'), poCode: parsed.data.poCode, expectedVersion: parsed.data.expectedVersion, eventId },
      buildErpDeps(c.get('db'), 'human'),
    )
    if (!result.ok) return erpProblem(c, result.error)
    return c.json({ data: result.value })
  })
  .post('/api/v1/timesheets/:id/book', async (c) => {
    const session = requireSession(c)
    const parsed = bookSchema.safeParse(await readJson(c))
    if (!parsed.success) return badBody(c, parsed.error)
    const eventId = c.req.header('idempotency-key') ?? randomId()
    const result = await bookTimesheet(
      session,
      { timesheetId: c.req.param('id'), expectedVersion: parsed.data.expectedVersion, eventId },
      buildErpDeps(c.get('db'), 'human'),
    )
    if (!result.ok) return erpProblem(c, result.error)
    return c.json({ data: result.value })
  })
