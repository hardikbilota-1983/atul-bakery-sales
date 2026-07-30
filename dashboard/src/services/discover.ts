import type { DataCapabilities, SalesLine } from '@/types/sales'
import { parseSalesFile } from '@/services/schemaInfer'
import { bootstrapClover, type CloverCatalog } from '@/services/cloverApi'

export type LoadedDataset = {
  lines: SalesLine[]
  files: string[]
  capabilities: DataCapabilities
  errors: string[]
  source: 'clover' | 'csv' | 'mixed' | 'empty'
  catalog: CloverCatalog | null
  fromCache?: boolean
  dayKey?: string
}

/** Default load: Clover bootstrap only (today cached server-side). No CSV/PDF. */
export async function loadAllSalesData(extraFiles?: File[]): Promise<LoadedDataset> {
  const errors: string[] = []

  // Optional manual uploads only — never auto-load public/data CSVs
  if (extraFiles?.length) {
    const uploaded: SalesLine[] = []
    const used: string[] = []
    for (const f of extraFiles) {
      try {
        const buf = await f.arrayBuffer()
        const { lines } = await parseSalesFile(f.name, buf)
        uploaded.push(...lines)
        used.push(f.name)
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (uploaded.length) {
      return {
        lines: uploaded,
        files: used,
        capabilities: detectCapabilities(uploaded),
        errors,
        source: 'csv',
        catalog: null,
      }
    }
  }

  try {
    const boot = await bootstrapClover()
    return {
      lines: boot.lines ?? [],
      files: ['clover-api'],
      capabilities: detectCapabilities(boot.lines ?? []),
      errors,
      source: boot.lines?.length ? 'clover' : 'empty',
      catalog: boot.catalog,
      fromCache: boot.fromCache,
      dayKey: boot.dayKey,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(msg)
    return {
      lines: [],
      files: [],
      capabilities: detectCapabilities([]),
      errors,
      source: 'empty',
      catalog: null,
    }
  }
}

export function detectCapabilities(lines: SalesLine[]): DataCapabilities {
  if (!lines.length) {
    return {
      hasHourly: false,
      hasDaily: false,
      hasCustomers: false,
      hasPayments: false,
      hasOrderIds: false,
      hasMultiStore: false,
      grain: 'monthly',
    }
  }

  const dates = new Set(lines.map((l) => l.orderDate))
  const uniqueDays = dates.size
  const sorted = [...dates].sort()
  const spanDays =
    sorted.length > 1
      ? Math.max(
          1,
          (new Date(sorted[sorted.length - 1]).getTime() - new Date(sorted[0]).getTime()) /
            86400000,
        )
      : 30
  const density = uniqueDays / spanDays

  const hasCustomers = lines.some((l) => Boolean(l.customer))
  const hasPayments = lines.some((l) => Boolean(l.paymentMethod))
  const hasOrderIds = lines.some((l) => Boolean(l.orderId))
  const stores = new Set(lines.map((l) => l.store))

  let grain: DataCapabilities['grain'] = 'monthly'
  if (hasOrderIds && density > 0.5) grain = 'transaction'
  else if (density > 0.4) grain = 'daily'

  return {
    hasHourly: false,
    hasDaily: grain !== 'monthly',
    hasCustomers,
    hasPayments,
    hasOrderIds,
    hasMultiStore: stores.size > 1,
    grain,
  }
}
