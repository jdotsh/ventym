// ERP adapter port — the goods-receipt posting boundary. The real SAP/Oracle
// adapter swaps behind this interface (vendor change = one file). For now a
// deterministic stub: the same payload always yields the same document ref, so
// re-posting is naturally idempotent.

export type GoodsReceiptPayload = {
  tenantId: string
  entityType: string
  entityId: string
  poCode: string
  amountExcl: string
  currency: string
}

export type GoodsReceiptResult = { erpDocumentRef: string }

export type ErpAdapter = {
  postGoodsReceipt(payload: GoodsReceiptPayload): Promise<GoodsReceiptResult>
}

/** Deterministic stub: derives a stable GR-<hash> ref from the payload. */
export function createStubErpAdapter(): ErpAdapter {
  return {
    async postGoodsReceipt(payload) {
      const seed = `${payload.tenantId}:${payload.entityType}:${payload.entityId}:${payload.poCode}`
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
      return { erpDocumentRef: `GR-${hex.slice(0, 16).toUpperCase()}` }
    },
  }
}
