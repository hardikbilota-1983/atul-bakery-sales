import type { SalesLine } from '@/types/sales'

export type CloverStatus = {
  configured: boolean
  merchant: { ok: boolean; merchantId: string; name?: string } | null
  error: string | null
  todayCached?: boolean
  dayKey?: string
  catalogCached?: boolean
  cache: {
    syncedAt: string
    lineCount: number
    orderCount: number
    startMs: number
    endMs: number
    store?: string
    cachedDays?: string[]
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
  cachedDays?: string[]
  error?: string
}

export type CloverCatalog = {
  fetchedAt: string
  fromCache?: boolean
  categories: string[]
  productsByCategory: Record<string, string[]>
  products?: { name: string; category: string; id?: string }[]
  itemCount: number
}

export type CloverBootstrap = {
  ok: boolean
  fromCache: boolean
  dayKey: string
  todayLineCount: number
  syncedAt: string
  orderCount: number
  lineCount: number
  cachedDays?: string[]
  lines: SalesLine[]
  catalog: CloverCatalog
  error?: string
}

export async function fetchCloverStatus(): Promise<CloverStatus> {
  const res = await fetch('/api/clover/status', { credentials: 'include' })
  if (!res.ok) throw new Error(`Status ${res.status}`)
  return res.json()
}

export async function syncClover(startDate: string, endDate: string): Promise<CloverSyncResult> {
  const res = await fetch('/api/clover/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate }),
  })
  const json = (await res.json()) as CloverSyncResult & { error?: string }
  if (!res.ok) throw new Error(json.error || `Sync failed (${res.status})`)
  return json
}

export async function bootstrapClover(): Promise<CloverBootstrap> {
  const res = await fetch('/api/clover/bootstrap', { method: 'POST', credentials: 'include' })
  const json = (await res.json()) as CloverBootstrap & { error?: string }
  if (!res.ok) throw new Error(json.error || `Bootstrap failed (${res.status})`)
  return json
}

export async function fetchCloverCatalog(force = false): Promise<CloverCatalog> {
  const res = await fetch(`/api/clover/catalog${force ? '?force=1' : ''}`, {
    credentials: 'include',
  })
  const json = (await res.json()) as CloverCatalog & { error?: string }
  if (!res.ok) throw new Error(json.error || `Catalog failed (${res.status})`)
  return json
}

export async function fetchCloverSalesCache(): Promise<{
  lines: SalesLine[]
  cachedDays: string[]
  syncedAt?: string
  lineCount?: number
  orderCount?: number
}> {
  const res = await fetch('/api/clover/sales', { credentials: 'include' })
  if (res.status === 404) return { lines: [], cachedDays: [] }
  if (!res.ok) throw new Error(`Clover sales ${res.status}`)
  const json = (await res.json()) as {
    lines?: SalesLine[]
    cachedDays?: string[]
    syncedAt?: string
    lineCount?: number
    orderCount?: number
  }
  return {
    lines: json.lines ?? [],
    cachedDays: json.cachedDays ?? [],
    syncedAt: json.syncedAt,
    lineCount: json.lineCount,
    orderCount: json.orderCount,
  }
}

export async function fetchCloverSalesLines(): Promise<SalesLine[]> {
  const data = await fetchCloverSalesCache()
  return data.lines
}
