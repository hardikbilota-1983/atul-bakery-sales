import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { SalesLine } from '@/types/sales'
import { parseMoney, toISODate } from '@/utils/money'
import { isCloverItemsReport, parseCloverItemsReport, splitCsv } from '@/services/cloverParser'

/** Column aliases → canonical field */
const ALIASES: Record<string, keyof MappedRow | 'ignore'> = {
  'order date': 'orderDate',
  date: 'orderDate',
  'sale date': 'orderDate',
  'transaction date': 'orderDate',
  'report date': 'orderDate',
  'product name': 'productName',
  product: 'productName',
  item: 'productName',
  'item name': 'productName',
  name: 'productName',
  category: 'category',
  'category name': 'category',
  quantity: 'quantity',
  qty: 'quantity',
  sold: 'quantity',
  units: 'quantity',
  revenue: 'revenue',
  'net sales': 'revenue',
  sales: 'revenue',
  'sales amount': 'revenue',
  amount: 'revenue',
  'gross sales': 'grossSales',
  price: 'avgUnitPrice',
  'unit price': 'avgUnitPrice',
  'avg item size': 'avgUnitPrice',
  discount: 'discounts',
  discounts: 'discounts',
  tax: 'ignore',
  taxes: 'ignore',
  cogs: 'cogs',
  cost: 'cogs',
  profit: 'profit',
  'gross profit': 'profit',
  'payment type': 'paymentMethod',
  'payment method': 'paymentMethod',
  tender: 'paymentMethod',
  store: 'store',
  location: 'store',
  'store location': 'store',
  customer: 'customer',
  'customer name': 'customer',
  'order id': 'orderId',
  'invoice number': 'orderId',
  invoice: 'orderId',
  'order number': 'orderId',
  refunds: 'refunds',
  refunded: 'refundedQty',
}

type MappedRow = {
  orderDate?: string
  productName?: string
  category?: string
  quantity?: number
  revenue?: number
  grossSales?: number
  discounts?: number
  refunds?: number
  refundedQty?: number
  cogs?: number
  profit?: number
  avgUnitPrice?: number
  store?: string
  paymentMethod?: string
  customer?: string
  orderId?: string
}

function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function mapHeaders(headers: string[]): Record<number, keyof MappedRow | 'ignore' | null> {
  const out: Record<number, keyof MappedRow | 'ignore' | null> = {}
  headers.forEach((h, i) => {
    out[i] = ALIASES[normKey(h)] ?? null
  })
  return out
}

function parseGenericRows(
  headers: string[],
  dataRows: unknown[][],
  filename: string,
): SalesLine[] {
  const map = mapHeaders(headers)
  const lines: SalesLine[] = []
  for (const row of dataRows) {
    const m: MappedRow = {}
    Object.entries(map).forEach(([idx, field]) => {
      if (!field || field === 'ignore') return
      const raw = row[Number(idx)]
      if (
        field === 'quantity' ||
        field === 'revenue' ||
        field === 'grossSales' ||
        field === 'discounts' ||
        field === 'refunds' ||
        field === 'refundedQty' ||
        field === 'cogs' ||
        field === 'profit' ||
        field === 'avgUnitPrice'
      ) {
        ;(m as Record<string, number>)[field] = parseMoney(raw)
      } else {
        ;(m as Record<string, string>)[field] = String(raw ?? '').trim()
      }
    })
    if (!m.productName && m.revenue == null && m.quantity == null) continue
    const d = m.orderDate ? new Date(m.orderDate) : new Date()
    const iso = Number.isFinite(d.getTime()) ? toISODate(d) : toISODate(new Date())
    const revenue = m.revenue ?? m.grossSales ?? 0
    const quantity = m.quantity ?? 0
    lines.push({
      orderDate: iso,
      periodEnd: iso,
      productName: m.productName || 'Unknown',
      category: m.category || 'Uncategorized',
      quantity,
      revenue,
      grossSales: m.grossSales ?? revenue,
      discounts: m.discounts ?? 0,
      refunds: m.refunds ?? 0,
      refundedQty: m.refundedQty ?? 0,
      cogs: m.cogs ?? 0,
      profit: m.profit ?? revenue - (m.cogs ?? 0),
      avgUnitPrice: m.avgUnitPrice ?? (quantity ? revenue / quantity : 0),
      pctNetSales: 0,
      sourceFile: filename,
      store: m.store || 'Hillside',
      paymentMethod: m.paymentMethod,
      customer: m.customer,
      orderId: m.orderId,
    })
  }
  return lines
}

export async function parseSalesFile(
  filename: string,
  content: ArrayBuffer | string,
): Promise<{ lines: SalesLine[]; kind: 'clover' | 'generic' }> {
  const lower = filename.toLowerCase()

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(content, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: '',
    }) as unknown[][]
    const asStrings = rows.map((r) => (r as unknown[]).map((c) => String(c ?? '')))
    if (isCloverItemsReport(asStrings)) {
      const text = asStrings.map((r) => r.map(csvEscape).join(',')).join('\n')
      const parsed = parseCloverItemsReport(text, filename)
      return { lines: parsed.lines, kind: 'clover' }
    }
    if (!rows.length) return { lines: [], kind: 'generic' }
    const headers = (rows[0] as unknown[]).map((c) => String(c ?? ''))
    return {
      lines: parseGenericRows(headers, rows.slice(1), filename),
      kind: 'generic',
    }
  }

  const text =
    typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content as ArrayBuffer)

  if (lower.endsWith('.json') || lower.endsWith('.jsonl')) {
    const records = lower.endsWith('.jsonl')
      ? text
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as Record<string, unknown>)
      : (JSON.parse(text) as Record<string, unknown>[] | { data: Record<string, unknown>[] })
    const arr = Array.isArray(records) ? records : records.data
    if (!arr?.length) return { lines: [], kind: 'generic' }
    const headers = Object.keys(arr[0])
    const dataRows = arr.map((obj) => headers.map((h) => obj[h]))
    return { lines: parseGenericRows(headers, dataRows, filename), kind: 'generic' }
  }

  // CSV
  const matrix = splitCsv(text)
  if (isCloverItemsReport(matrix)) {
    return { lines: parseCloverItemsReport(text, filename).lines, kind: 'clover' }
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.meta.fields?.length) {
    const headers = parsed.meta.fields
    const dataRows = parsed.data.map((obj) => headers.map((h) => obj[h]))
    return { lines: parseGenericRows(headers, dataRows, filename), kind: 'generic' }
  }

  return { lines: [], kind: 'generic' }
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}
