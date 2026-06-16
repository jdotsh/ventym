import { hmacSha256Hex, sha256Hex } from '@/utils/hash'

// The ERP posting boundary — ONE non-throwing method (ported from Athena: errors
// fold into EmitResult so the dispatcher state machine never breaks on an
// exception). A new vendor is a new adapter behind this interface, selected by the
// factory from per-tenant config.
export const ERP_KINDS = ['GOODS_RECEIPT', 'SERVICE_ENTRY_SHEET'] as const
export type ErpKind = (typeof ERP_KINDS)[number]

export type ErpRequest = {
  kind: ErpKind
  tenantId: string
  entityType: string
  entityId: string
  exportLogId: string // the idempotency key — threaded to the ERP so a replay is a no-op
  poCode: string
  amountExcl: string
  currency: string
  payload?: Record<string, unknown>
}

// Discriminated result. `failed.retriable` is the dispatcher's retry-vs-dead-letter
// signal; `skipped` is an intentional no-op (e.g. a zero-amount posting).
export type EmitResult =
  | { type: 'sent'; erpDocumentRef: string; response?: Record<string, unknown> }
  | { type: 'failed'; retriable: boolean; statusCode?: number; error: string }
  | { type: 'skipped'; reason: string }

export type ErpAdapter = {
  send(req: ErpRequest): Promise<EmitResult>
}

const refPrefix = (kind: ErpKind): string => (kind === 'SERVICE_ENTRY_SHEET' ? 'SES' : 'GR')

/** Production-shaped mock: deterministic doc ref (idempotent re-post), skips a
 *  zero-amount request exactly as a real ERP would. Never a synthetic CONFIRMED. */
export function createMockErpAdapter(): ErpAdapter {
  return {
    async send(req) {
      if (Number(req.amountExcl) === 0) return { type: 'skipped', reason: 'zero-amount' }
      const hex = await sha256Hex(req.exportLogId)
      return { type: 'sent', erpDocumentRef: `${refPrefix(req.kind)}-${hex.slice(0, 16).toUpperCase()}` }
    },
  }
}

export type ErpHttpConfig = { endpointUrl: string; secret: string }

/** Signed-HTTP adapter (provider-agnostic): POSTs the request as JSON, HMAC-signed
 *  with the tenant secret and carrying the export id as the Idempotency-Key. 4xx is
 *  terminal; 408/429/5xx and network faults are retriable; an unparseable success is
 *  a terminal parse failure (never a fabricated ref). */
export function createHttpErpAdapter(config: ErpHttpConfig, fetchImpl: typeof fetch = fetch): ErpAdapter {
  return {
    async send(req) {
      const body = JSON.stringify({
        kind: req.kind,
        exportLogId: req.exportLogId,
        tenantId: req.tenantId,
        entityType: req.entityType,
        entityId: req.entityId,
        poCode: req.poCode,
        amountExcl: req.amountExcl,
        currency: req.currency,
        payload: req.payload ?? {},
      })
      try {
        const signature = await hmacSha256Hex(config.secret, body)
        const res = await fetchImpl(config.endpointUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': req.exportLogId, 'x-vms-signature': signature },
          body,
        })
        if (!res.ok) {
          const retriable = res.status === 408 || res.status === 429 || res.status >= 500
          return { type: 'failed', retriable, statusCode: res.status, error: `ERP responded ${res.status}` }
        }
        const json = (await res.json().catch(() => null)) as { erpDocumentRef?: string } | null
        if (!json?.erpDocumentRef) return { type: 'failed', retriable: false, error: 'ERP success without an erpDocumentRef (parse failure)' }
        return { type: 'sent', erpDocumentRef: json.erpDocumentRef, response: json }
      } catch (e) {
        // Network/transport fault — retriable; the dispatcher re-attempts with backoff.
        return { type: 'failed', retriable: true, error: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}
