import { and, eq } from 'drizzle-orm'
import type { Database } from '../../../config/db'
import { idempotency } from '../../../db/schema'

export type ClaimResult =
  | { kind: 'claimed' } // first time — caller runs the handler then completes/releases
  | { kind: 'replay'; statusCode: number; body: string; contentType: string }
  | { kind: 'mismatch' } // same key, different request body
  | { kind: 'in_progress' } // claimed by a concurrent request, not yet completed

export type IdempotencyRepo = ReturnType<typeof createIdempotencyRepo>

/** Durable idempotency. Claim-first (insert before running) so a concurrent retry
 *  can never double-execute. All methods run inside a tenant-scoped tx (RLS). */
export function createIdempotencyRepo(db: Database) {
  void db
  return {
    async claim(
      tx: Database,
      input: { tenantId: string; key: string; fingerprint: string },
    ): Promise<ClaimResult> {
      const inserted = await tx
        .insert(idempotency)
        .values({ tenantId: input.tenantId, idemKey: input.key, requestFingerprint: input.fingerprint })
        .onConflictDoNothing()
        .returning({ id: idempotency.id })
      if (inserted.length > 0) return { kind: 'claimed' }

      const [row] = await tx
        .select()
        .from(idempotency)
        .where(and(eq(idempotency.tenantId, input.tenantId), eq(idempotency.idemKey, input.key)))
        .limit(1)
      if (!row) return { kind: 'in_progress' } // raced with a delete; let the caller retry
      if (row.requestFingerprint !== input.fingerprint) return { kind: 'mismatch' }
      if (row.statusCode === null || row.responseJson === null) return { kind: 'in_progress' }
      return { kind: 'replay', statusCode: row.statusCode, body: row.responseJson.body, contentType: row.responseJson.ct }
    },

    async complete(
      tx: Database,
      input: { tenantId: string; key: string; statusCode: number; body: string; contentType: string },
    ): Promise<void> {
      await tx
        .update(idempotency)
        .set({ statusCode: input.statusCode, responseJson: { body: input.body, ct: input.contentType } })
        .where(and(eq(idempotency.tenantId, input.tenantId), eq(idempotency.idemKey, input.key)))
    },

    // Release a claim (handler 5xx'd or threw) so a retry can re-run.
    async release(tx: Database, input: { tenantId: string; key: string }): Promise<void> {
      await tx
        .delete(idempotency)
        .where(and(eq(idempotency.tenantId, input.tenantId), eq(idempotency.idemKey, input.key)))
    },
  }
}
