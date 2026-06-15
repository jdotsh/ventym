import { withTenantScope, type Database } from '../../../config/db'
import { createIdentityRepo } from '@/tools/db/identityRepos'
import type { IdentityDeps } from './service'

/** Wire the identity service's I/O from a database handle (DI composition root). */
export function buildIdentityDeps(db: Database): IdentityDeps {
  return {
    repo: createIdentityRepo(db),
    withTenantScope: (scope, fn) => withTenantScope(db, scope, fn),
  }
}
