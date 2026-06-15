import { withTenantScope, type Database } from '../../../config/db'
import { createAdminRepo } from '@/tools/db/adminRepos'
import type { WorkosClient } from '@/tools/workos/client'
import type { AdminDeps } from './service'

export function buildAdminDeps(db: Database, workos: WorkosClient): AdminDeps {
  return {
    repo: createAdminRepo(),
    workos,
    withTenantScope: (scope, fn) => withTenantScope(db, scope, fn),
  }
}
