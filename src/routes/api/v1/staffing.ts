import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../../../config/bindings'
import { buildStaffingDeps } from '@/services/staffing/deps'
import {
  createAssignment,
  createVendor,
  createWorker,
  endAssignment,
  getVendor,
  getWorker,
} from '@/services/staffing/service'
import {
  createAssignmentSchema,
  createVendorSchema,
  createWorkerSchema,
  transitionAssignmentSchema,
  type StaffingError,
} from '@/services/staffing/schema'
import { staffingErrorCode } from '@/services/staffing/httpError'
import { problemResponse } from '@/utils/problemResponse'
import { randomId } from '@/utils/ids'
import { requireSession } from './_shared'

const staffingProblem = (c: Context<AppEnv>, error: StaffingError): Response =>
  problemResponse(c.get('traceId'), staffingErrorCode(error), error.kind === 'capacity_exceeded' ? { details: error } : {})
const badBody = (c: Context<AppEnv>, error: z.ZodError): Response =>
  problemResponse(c.get('traceId'), 'VALIDATION_ERROR', { details: error.flatten() })
const readJson = (c: Context<AppEnv>): Promise<unknown> => c.req.json().catch(() => null)

export const staffingApiRoutes = new Hono<AppEnv>()
  .post('/api/v1/vendors', async (c) => {
    const session = requireSession(c)
    const parsed = createVendorSchema.safeParse(await readJson(c))
    if (!parsed.success) return badBody(c, parsed.error)
    const result = await createVendor(session, parsed.data, buildStaffingDeps(c.get('db'), 'human'))
    if (!result.ok) return staffingProblem(c, result.error)
    return c.json({ data: result.value }, 201)
  })
  .get('/api/v1/vendors/:id', async (c) => {
    const session = requireSession(c)
    const vendor = await getVendor(session, c.req.param('id'), buildStaffingDeps(c.get('db'), 'human'))
    if (!vendor) return problemResponse(c.get('traceId'), 'VENDOR_NOT_FOUND')
    return c.json({ data: vendor })
  })
  .post('/api/v1/workers', async (c) => {
    const session = requireSession(c)
    const parsed = createWorkerSchema.safeParse(await readJson(c))
    if (!parsed.success) return badBody(c, parsed.error)
    const result = await createWorker(session, parsed.data, buildStaffingDeps(c.get('db'), 'human'))
    if (!result.ok) return staffingProblem(c, result.error)
    return c.json({ data: result.value }, 201)
  })
  .get('/api/v1/workers/:id', async (c) => {
    const session = requireSession(c)
    const worker = await getWorker(session, c.req.param('id'), buildStaffingDeps(c.get('db'), 'human'))
    if (!worker) return problemResponse(c.get('traceId'), 'WORKER_NOT_FOUND')
    return c.json({ data: worker })
  })
  .post('/api/v1/assignments', async (c) => {
    const session = requireSession(c)
    const parsed = createAssignmentSchema.safeParse(await readJson(c))
    if (!parsed.success) return badBody(c, parsed.error)
    const result = await createAssignment(session, parsed.data, buildStaffingDeps(c.get('db'), 'human'))
    if (!result.ok) return staffingProblem(c, result.error)
    return c.json({ data: result.value }, 201)
  })
  .post('/api/v1/assignments/:id/end', async (c) => {
    const session = requireSession(c)
    const parsed = transitionAssignmentSchema.safeParse(await readJson(c))
    if (!parsed.success) return badBody(c, parsed.error)
    const eventId = c.req.header('idempotency-key') ?? randomId()
    const result = await endAssignment(
      session,
      { assignmentId: c.req.param('id'), expectedVersion: parsed.data.expectedVersion, eventId, ...(parsed.data.endReason ? { endReason: parsed.data.endReason } : {}) },
      buildStaffingDeps(c.get('db'), 'human'),
    )
    if (!result.ok) return staffingProblem(c, result.error)
    return c.json({ data: result.value })
  })
