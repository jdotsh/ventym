import { withTenantScope, type Database } from '../../../config/db'
import type { ActorKind } from '../../../db/schema'
import { createWorkOrderRepo } from '@/tools/db/workOrderRepo'
import { randomId } from '@/utils/ids'
import type { WorkOrderDeps } from './service'

/** Wire the Work Order service's I/O (DI composition root). `actorKind` is set by
 *  the request principal — 'agent' for the MCP/agent path, 'human' for the UI. */
export function buildWorkOrderDeps(db: Database, actorKind: ActorKind = 'human'): WorkOrderDeps {
  return {
    repo: createWorkOrderRepo(db),
    withTenantScope: (scope, fn) => withTenantScope(db, scope, fn),
    uuid: randomId,
    now: () => new Date(),
    actorKind,
  }
}
