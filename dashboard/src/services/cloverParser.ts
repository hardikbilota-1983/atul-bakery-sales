import type { SalesLine, SalesModifier } from '@/types/sales'
import {
  parseCloverPeriod,
  parseMoney,
  parsePct,
  parsePeriodFromFilename,
  toISODate,
} from '@/utils/money'

export type ParseResult = {
  lines: SalesLine[]
  modifiers: SalesModifier[]
  summary: {
    grossSales: number
    netSales: number
    cogs: number
    grossProfit: number
    marginPct: number
  } | null
  store: string
}

function inferStore(filename: string): string {
  if (/hillside/i.test(filename)) return 'Hillside'
  const m = /^(.+?)-Revenue/i.exec(filename)
  if (m) return m[1].replace(/ATUL BAKERY\s*/i, 'Atul Bakery ').trim()
  return 'Hillside'
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function findHeaderIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map(normalizeHeader)
    const joined = cells.join('|')
    if (
      joined.includes('category name') &&
      joined.includes('name') &&
      (joined.includes('net sales') || joined.includes('gross sales'))
    ) {
      return i
    }
  }
  return -1
}

function colMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  header.forEach((h, i) => {
    map[normalizeHeader(h)] = i
  })
  return map
}

function cell(row: string[], map: Record<string, number>, ...keys: string[]): string {
  for (const k of keys) {
    const i = map[k]
    if (i != null && row[i] != null && String(row[i]).trim() !== '') return String(row[i]).trim()
  }
  return ''
}

export function isCloverItemsReport(rows: string[][]): boolean {
  if (!rows.length) return false
  const first = (rows[0][0] ?? '').replace(/^"|"$/g, '').trim().toLowerCase()
  if (first.includes('items report')) return true
  return findHeaderIndex(rows) >= 0
}

/**
 * Parse a Clover POS "Items Report" CSV into product-level sales lines.
 * Skips category headers, category totals, modifiers (captured separately), and grand total.
 */
export function parseCloverItemsReport(text: string, filename: string): ParseResult {
  const rows = splitCsv(text)
  const store = inferStore(filename)

  let period = parsePeriodFromFilename(filename)
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const blob = rows[i].join(' ')
    const p = parseCloverPeriod(blob)
    if (p) {
      period = p
      break
    }
  }
  if (!period) {
    period = { start: new Date(), end: new Date() }
  }

  const orderDate = toISODate(period.start)
  const periodEnd = toISODate(period.end)

  // Summary KPIs from preamble
  let summary: ParseResult['summary'] = null
  const preamble = rows.slice(0, 20).map((r) => r.map((c) => c.trim()))
  const pick = (label: string) => {
    for (const r of preamble) {
      if (normalizeHeader(r[0] ?? '') === label) return parseMoney(r[1])
    }
    return 0
  }
  if (preamble.some((r) => normalizeHeader(r[0] ?? '') === 'net sales')) {
    summary = {
      grossSales: pick('gross sales'),
      netSales: pick('net sales'),
      cogs: pick('cogs'),
      grossProfit: pick('gross profit'),
      marginPct: (() => {
        for (const r of preamble) {
          if (normalizeHeader(r[0] ?? '') === 'gross profit margin') return parsePct(r[1])
        }
        return 0
      })(),
    }
  }

  const hi = findHeaderIndex(rows)
  if (hi < 0) {
    return { lines: [], modifiers: [], summary, store }
  }

  const map = colMap(rows[hi])
  const lines: SalesLine[] = []
  const modifiers: SalesModifier[] = []
  let currentCategory = 'Uncategorized'
  let lastProduct = ''

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => !String(c ?? '').trim())) continue

    const catCell = cell(row, map, 'category name')
    const name = cell(row, map, 'name')
    const modName = cell(row, map, 'modifier name')
    const first = String(row[0] ?? '').trim()

    // Category-only header: first cell is category, name empty
    if (first && !name && !modName && !/^total\b/i.test(first) && first.toUpperCase() !== 'TOTAL') {
      // Heuristic: category rows often have empty metrics
      const net = parseMoney(cell(row, map, 'net sales'))
      const sold = parseMoney(cell(row, map, 'sold'))
      if (net === 0 && sold === 0 && !cell(row, map, 'gross sales')) {
        currentCategory = first
        continue
      }
    }

    if (/^total\s*\(/i.test(first) || first.toUpperCase() === 'TOTAL') continue

    if (catCell && !name) {
      currentCategory = catCell
      continue
    }

    // Modifier sub-row
    if ((!name || name === '') && modName) {
      modifiers.push({
        productName: lastProduct || 'Unknown',
        category: currentCategory,
        modifierName: modName,
        sold: parseMoney(cell(row, map, 'modifier sold')),
        amount: parseMoney(cell(row, map, 'modifier amount')),
        orderDate,
        sourceFile: filename,
      })
      continue
    }

    if (!name) continue

    const quantity = parseMoney(cell(row, map, 'sold'))
    const revenue = parseMoney(cell(row, map, 'net sales'))
    const grossSales = parseMoney(cell(row, map, 'gross sales'))
    // Skip empty product shells
    if (quantity === 0 && revenue === 0 && grossSales === 0) continue

    lastProduct = name
    lines.push({
      orderDate,
      periodEnd,
      productName: name,
      category: currentCategory || catCell || 'Uncategorized',
      quantity,
      revenue,
      grossSales,
      discounts: parseMoney(cell(row, map, 'discounts')),
      refunds: parseMoney(cell(row, map, 'refunds')),
      refundedQty: parseMoney(cell(row, map, 'refunded')),
      cogs: parseMoney(cell(row, map, 'cogs')),
      profit: parseMoney(cell(row, map, 'gross profit')),
      avgUnitPrice: parseMoney(cell(row, map, 'avg item size')),
      pctNetSales: parsePct(cell(row, map, '% net sales')),
      sourceFile: filename,
      store,
    })
  }

  return { lines, modifiers, summary, store }
}

/** Minimal CSV splitter that respects quotes. */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n') {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else if (ch === '\r') {
      // skip
    } else {
      cur += ch
    }
  }
  if (cur.length || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}
