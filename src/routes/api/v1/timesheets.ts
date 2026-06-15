import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../../../config/bindings'
import { buildTimesheetDeps } from '@/services/timesheet/deps'
import { createTimesheet, getTimesheet, transitionTimesheet } from '@/services/timesheet/service'
import { createTimesheetSchema, transitionTimesheetSchema, type TimesheetError } from '@/services/timesheet/schema'
import type { TimesheetTransition } from '@/services/timesheet/machine'
import { timesheetErrorCode } from '@/services/timesheet/httpError'
import { problemResponse } from '@/utils/problemResponse'
import { randomId } from '@/utils/ids'
import { requireSession } from './_shared'

function timesheetProblem(c: Context<AppEnv>, error: TimesheetError): Response {
  const details = error.kind === 'invalid_transition' ? { from: error.from, transition: error.transition } : undefined
  return problemResponse(c.get('traceId'), timesheetErrorCode(error), details ? { details } : {})
}

const badBody = (c: Context<AppEnv>, error: z.ZodError): Response =>
  problemResponse(c.get('traceId'), 'VALIDATION_ERROR', { details: error.flatten() })

const readJson = (c: Context<AppEnv>): Promise<unknown> => c.req.json().catch(() => null)

// Action routes role-gate per transition (submit=member, approve/reject=manager);
// the service additionally enforces SoD (approver ≠ submitter) and reject-reason.
async function applyTransition(c: Context<AppEnv>, transition: TimesheetTransition): Promise<Response> {
  const session = requireSession(c)
  const parsed = transitionTimesheetSchema.safeParse(await readJson(c))
  if (!parsed.success) return badBody(c, parsed.error)
  const eventId = c.req.header('idempotency-key') ?? randomId()
  const result = await transitionTimesheet(
    session,
    {
      timesheetId: c.req.param('id'),
      transition,
      expectedVersion: parsed.data.expectedVersion,
      eventId,
      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    },
    buildTimesheetDeps(c.get('db'), 'human'),
  )
  if (!result.ok) return timesheetProblem(c, result.error)
  return c.json({ data: result.value })
}

export const timesheetApiRoutes = new Hono<AppEnv>()
  .post('/api/v1/timesheets', async (c) => {
    const session = requireSession(c)
    const parsed = createTimesheetSchema.safeParse(await readJson(c))
    if (!parsed.success) return badBody(c, parsed.error)
    const result = await createTimesheet(session, parsed.data, buildTimesheetDeps(c.get('db'), 'human'))
    if (!result.ok) return timesheetProblem(c, result.error)
    return c.json({ data: result.value }, 201)
  })
  .post('/api/v1/timesheets/:id/submit', (c) => applyTransition(c, 'submit'))
  .post('/api/v1/timesheets/:id/approve', (c) => applyTransition(c, 'approve'))
  .post('/api/v1/timesheets/:id/reject', (c) => applyTransition(c, 'reject'))
  .post('/api/v1/timesheets/:id/revise', (c) => applyTransition(c, 'revise'))
  .get('/api/v1/timesheets/:id', async (c) => {
    const session = requireSession(c)
    const timesheet = await getTimesheet(session, c.req.param('id'), buildTimesheetDeps(c.get('db'), 'human'))
    if (!timesheet) return problemResponse(c.get('traceId'), 'TS_NOT_FOUND')
    return c.json({ data: timesheet })
  })
