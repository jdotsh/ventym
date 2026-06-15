import { withTenantScope, type Database } from '../../../config/db'
import type { ActorKind } from '../../../db/schema'
import { createTimesheetRepo } from '@/tools/db/timesheetRepo'
import { randomId } from '@/utils/ids'
import type { TimesheetDeps } from './service'

/** Wire the timesheet service's I/O (DI composition root). `actorKind` is set by
 *  the request principal — 'agent' for MCP, 'human' for the UI/REST. */
export function buildTimesheetDeps(db: Database, actorKind: ActorKind = 'human'): TimesheetDeps {
  return {
    repo: createTimesheetRepo(db),
    withTenantScope: (scope, fn) => withTenantScope(db, scope, fn),
    uuid: randomId,
    now: () => new Date(),
    actorKind,
  }
}
