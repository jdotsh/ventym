import { withTenantScope, type Database } from '../../../config/db'
import type { ActorKind } from '../../../db/schema'
import { createWorkOrderRepo } from '@/tools/db/workOrderRepo'
import { createTimesheetRepo } from '@/tools/db/timesheetRepo'
import { createErpRepo } from '@/tools/db/erpRepo'
import { createMockErpAdapter } from '@/tools/erp/adapter'
import { randomId } from '@/utils/ids'
import type { ErpDeps } from './service'

/** Wire the ERP service's I/O (DI composition root). The ERP adapter is the stub
 *  for now; the real SAP/Oracle adapter swaps here. */
export function buildErpDeps(db: Database, actorKind: ActorKind = 'human'): ErpDeps {
  return {
    woRepo: createWorkOrderRepo(db),
    tsRepo: createTimesheetRepo(db),
    erpRepo: createErpRepo(db),
    erp: createMockErpAdapter(),
    withTenantScope: (scope, fn) => withTenantScope(db, scope, fn),
    uuid: randomId,
    now: () => new Date(),
    actorKind,
  }
}
