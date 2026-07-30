import type { DataCapabilities, SalesLine } from '@/types/sales'
import { parseSalesFile } from '@/services/schemaInfer'
import { fetchCloverSalesLines } from '@/services/cloverApi'

export type LoadedDataset = {
  lines: SalesLine[]
  files: string[]
  capabilities: DataCapabilities
  errors: string[]
  source: 'clover' | 'csv' | 'mixed' | 'empty'
}

export async function fetchManifest(): Promise<string[]> {
  const res = await fetch('/data/manifest.json')
  if (!res.ok) throw new Error('Could not load data manifest. Is the Vite server running?')
  const json = (await res.json()) as { files: string[] }
  return json.files ?? []
}

async function loadCsvFiles(extraFiles?: File[]): Promise<{ lines: SalesLine[]; files: string[]; errors: string[] }> {
  const errors: string[] = []
  const all: SalesLine[] = []
  const used: string[] = []

  try {
    const files = await fetchManifest()
    await Promise.all(
      files.map(async (name) => {
        try {
          const res = await fetch(`/data/${encodeURIComponent(name)}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const buf = await res.arrayBuffer()
          const { lines } = await parseSalesFile(name, buf)
          all.push(...lines)
          used.push(name)
        } catch (e) {
          errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }),
    )
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  if (extraFiles?.length) {
    for (const f of extraFiles) {
      try {
        const buf = await f.arrayBuffer()
        const { lines } = await parseSalesFile(f.name, buf)
        all.push(...lines)
        used.push(f.name)
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  return { lines: all, files: used, errors }
}

export async function loadAllSalesData(
  extraFiles?: File[],
  opts?: { includeCsvWithClover?: boolean },
): Promise<LoadedDataset> {
  const errors: string[] = []
  let cloverLines: SalesLine[] = []

  try {
    cloverLines = await fetchCloverSalesLines()
  } catch (e) {
    // API server may be down in pure static mode — ignore
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('Failed to fetch') && !msg.includes('404')) {
      errors.push(`Clover: ${msg}`)
    }
  }

  const csv = await loadCsvFiles(extraFiles)
  errors.push(...csv.errors)

  if (cloverLines.length && !opts?.includeCsvWithClover) {
    return {
      lines: cloverLines,
      files: ['clover-api'],
      capabilities: detectCapabilities(cloverLines),
      errors,
      source: 'clover',
    }
  }

  if (cloverLines.length && opts?.includeCsvWithClover) {
    const lines = [...cloverLines, ...csv.lines]
    return {
      lines,
      files: ['clover-api', ...csv.files],
      capabilities: detectCapabilities(lines),
      errors,
      source: 'mixed',
    }
  }

  if (csv.lines.length) {
    return {
      lines: csv.lines,
      files: csv.files,
      capabilities: detectCapabilities(csv.lines),
      errors,
      source: 'csv',
    }
  }

  return {
    lines: [],
    files: [],
    capabilities: detectCapabilities([]),
    errors: errors.length ? errors : ['No sales data found'],
    source: 'empty',
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
