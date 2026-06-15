import { withTenantScope, type Database } from '../../../config/db'
import { createIdentityRepo } from '@/tools/db/identityRepos'
import type { DirectoryDeps } from './service'

export function buildDirectoryDeps(db: Database): DirectoryDeps {
  return {
    repo: createIdentityRepo(db),
    withTenantScope: (scope, fn) => withTenantScope(db, scope, fn),
  }
}
