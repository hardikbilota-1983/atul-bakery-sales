export type CloverStatus = {
  configured: boolean
  merchant: { ok: boolean; merchantId: string; name?: string } | null
  error: string | null
  cache: {
    syncedAt: string
    lineCount: number
    orderCount: number
    startMs: number
    endMs: number
    store?: string
  } | null
}

export type CloverSyncResult = {
  ok: boolean
  syncedAt: string
  orderCount: number
  lineCount: number
  skippedOpen: number
  startMs: number
  endMs: number
  error?: string
}

export async function fetchCloverStatus(): Promise<CloverStatus> {
  const res = await fetch('/api/clover/status')
  if (!res.ok) throw new Error(`Status ${res.status}`)
  return res.json()
}

export async function syncClover(startDate: string, endDate: string): Promise<CloverSyncResult> {
  const res = await fetch('/api/clover/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate }),
  })
  const json = (await res.json()) as CloverSyncResult & { error?: string }
  if (!res.ok) throw new Error(json.error || `Sync failed (${res.status})`)
  return json
}

export async function fetchCloverSalesLines(): Promise<import('@/types/sales').SalesLine[]> {
  const res = await fetch('/api/clover/sales')
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Clover sales ${res.status}`)
  const json = (await res.json()) as { lines?: import('@/types/sales').SalesLine[] }
  return json.lines ?? []
}
