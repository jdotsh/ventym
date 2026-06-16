import { withTenantScope, type Database } from '../../../config/db'
import type { ActorKind } from '../../../db/schema'
import { createStaffingRepo } from '@/tools/db/staffingRepo'
import { randomId } from '@/utils/ids'
import type { StaffingDeps } from './service'

/** Wire the staffing service's I/O (DI composition root). */
export function buildStaffingDeps(db: Database, actorKind: ActorKind = 'human'): StaffingDeps {
  return {
    repo: createStaffingRepo(db),
    withTenantScope: (scope, fn) => withTenantScope(db, scope, fn),
    uuid: randomId,
    now: () => new Date(),
    actorKind,
  }
}
