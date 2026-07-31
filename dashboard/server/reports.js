/**
 * Weekly franchisor sales report (Mon–Sun Eastern).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatInTimeZone } from 'date-fns-tz'
import { syncCloverSales, readCache, cloverConfigured } from './clover.js'
import { dayBoundsInZone, dayKeyInZone, merchantTimeZone } from './timezone.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SENT_PATH = path.join(__dirname, 'cache', 'last-weekly-report.json')

/** Default categories when REPORT_CATEGORIES is unset — matches dashboard watch list. */
export const DEFAULT_REPORT_CATEGORIES = [
  'AB - Cake 2LB',
  'AB - Cake 1LB',
  'AB - Pastries',
  'AB - Puffs',
  'AB - Snacks',
  'H - Deluxe Ice Cream',
  'H - Ice creams and Shakes',
  'H - Premium Ice Cream',
  'H - Traditional Ice Cream',
  'PCE - Chaaps',
  'PCE - Dosas',
  'PCE - Idli',
  'PCE - Momos',
  'PCE - Snacks South Indian',
  'PCE - Specialty Dosas',
  'PCE - Wraps',
]

export function parseListEnv(raw) {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function reportCategories() {
  const fromEnv = parseListEnv(process.env.REPORT_CATEGORIES)
  return fromEnv.length ? fromEnv : DEFAULT_REPORT_CATEGORIES
}

export function reportRecipients() {
  return parseListEnv(process.env.REPORT_TO)
}

function addDayKeys(dayKey, deltaDays) {
  const { start } = dayBoundsInZone(dayKey)
  return dayKeyInZone(new Date(start.getTime() + deltaDays * 86400000 + 12 * 3600000))
}

/**
 * Most recently completed Mon–Sun week in merchant TZ.
 * On Sunday: that Sunday is the week end. Otherwise: previous Sunday.
 */
export function completedWeekBounds(asOf = new Date()) {
  const tz = merchantTimeZone()
  const todayKey = dayKeyInZone(asOf, tz)
  const dow = Number(formatInTimeZone(asOf, tz, 'i')) // 1=Mon … 7=Sun
  const daysBackToSunday = dow === 7 ? 0 : dow
  const endKey = addDayKeys(todayKey, -daysBackToSunday)
  const startKey = addDayKeys(endKey, -6)
  const { start } = dayBoundsInZone(startKey, tz)
  const { end } = dayBoundsInZone(endKey, tz)
  const weekKey = `${startKey}_${endKey}`
  const periodLabel = formatPeriodLabel(startKey, endKey)
  return { startKey, endKey, start, end, weekKey, periodLabel }
}

function formatPeriodLabel(startKey, endKey) {
  const a = formatInTimeZone(
    dayBoundsInZone(startKey).start,
    merchantTimeZone(),
    'MMM d',
  )
  const b = formatInTimeZone(dayBoundsInZone(endKey).start, merchantTimeZone(), 'MMM d, yyyy')
  return `${a}–${b}`
}

/** Auto-send window: Sunday ≥23:00 ET, or Monday before 05:00 ET (DST cron coverage). */
export function isWeeklySendWindow(asOf = new Date()) {
  const tz = merchantTimeZone()
  const dow = Number(formatInTimeZone(asOf, tz, 'i'))
  const hour = Number(formatInTimeZone(asOf, tz, 'H'))
  if (dow === 7 && hour >= 23) return true
  if (dow === 1 && hour < 5) return true
  return false
}

export function readLastSent() {
  try {
    if (!fs.existsSync(SENT_PATH)) return null
    return JSON.parse(fs.readFileSync(SENT_PATH, 'utf8'))
  } catch {
    return null
  }
}

export function writeLastSent(payload) {
  fs.mkdirSync(path.dirname(SENT_PATH), { recursive: true })
  fs.writeFileSync(SENT_PATH, JSON.stringify(payload, null, 2))
}

function money(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n)
}

function countPaidOrders(lines) {
  const ids = new Set()
  for (const l of lines) {
    if (l.orderId) ids.add(l.orderId)
  }
  return ids.size
}

/**
 * Sync week from Clover, filter to report categories, build aggregates + HTML + CSV.
 */
export async function buildWeeklyReport({ asOf = new Date() } = {}) {
  if (!cloverConfigured()) {
    throw new Error('Clover is not configured.')
  }

  const week = completedWeekBounds(asOf)
  const categories = reportCategories()
  const store = process.env.CLOVER_STORE_NAME?.trim() || 'Hillside'

  await syncCloverSales({
    startMs: week.start.getTime(),
    endMs: week.end.getTime(),
  })

  const cache = readCache()
  const allLines = cache?.lines ?? []
  const wanted = new Map(categories.map((c) => [c.toLowerCase(), c]))
  const lines = allLines.filter((l) => {
    if (l.orderDate < week.startKey || l.orderDate > week.endKey) return false
    return wanted.has(String(l.category || '').trim().toLowerCase())
  })

  const byCategory = new Map()
  for (const cat of categories) {
    byCategory.set(cat, { category: cat, revenue: 0, quantity: 0 })
  }
  const byProduct = new Map()

  for (const l of lines) {
    const cat = wanted.get(String(l.category || '').trim().toLowerCase())
    if (!cat) continue
    const row = byCategory.get(cat)
    row.revenue += l.revenue
    row.quantity += l.quantity

    const pKey = `${cat}||${l.productName}`
    let p = byProduct.get(pKey)
    if (!p) {
      p = { category: cat, productName: l.productName, revenue: 0, quantity: 0 }
      byProduct.set(pKey, p)
    }
    p.revenue += l.revenue
    p.quantity += l.quantity
  }

  const categoryRows = [...byCategory.values()]
    .filter((r) => r.revenue > 0 || r.quantity > 0)
    .sort((a, b) => b.revenue - a.revenue)

  const totalRevenue = categoryRows.reduce((s, r) => s + r.revenue, 0)
  const totalQuantity = categoryRows.reduce((s, r) => s + r.quantity, 0)
  const paidOrders = countPaidOrders(lines)

  for (const r of categoryRows) {
    r.pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0
  }

  const topItems = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15)

  const html = renderHtml({
    store,
    week,
    categories,
    categoryRows,
    topItems,
    totalRevenue,
    totalQuantity,
    paidOrders,
  })

  const csv = renderCsv({ week, categoryRows, topItems, lines })

  return {
    week,
    store,
    categories,
    categoryRows,
    topItems,
    totalRevenue,
    totalQuantity,
    paidOrders,
    lineCount: lines.length,
    html,
    csv,
    csvFilename: `atul-bakery-weekly-${week.startKey}-to-${week.endKey}.csv`,
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderHtml({
  store,
  week,
  categoryRows,
  topItems,
  totalRevenue,
  totalQuantity,
  paidOrders,
}) {
  const catRows = categoryRows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(r.category)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${money(r.revenue)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.quantity.toFixed(1)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.pct.toFixed(1)}%</td>
        </tr>`,
    )
    .join('')

  const itemRows = topItems
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(r.productName)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(r.category)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${money(r.revenue)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.quantity.toFixed(1)}</td>
        </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Weekly Sales Report</title></head>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
    <p style="margin:0 0 4px;font-size:12px;color:#0d9488;text-transform:uppercase;letter-spacing:0.08em;">Atul Bakery · ${escapeHtml(store)}</p>
    <h1 style="margin:0 0 8px;font-size:22px;">Weekly Sales Report</h1>
    <p style="margin:0 0 20px;color:#64748b;">Period: <strong>${escapeHtml(week.periodLabel)}</strong> (Mon–Sun, Eastern)</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td style="padding:12px;background:#f0fdfa;border-radius:8px;">
          <div style="font-size:11px;color:#64748b;">Net Sales</div>
          <div style="font-size:20px;font-weight:700;">${money(totalRevenue)}</div>
        </td>
        <td style="width:12px;"></td>
        <td style="padding:12px;background:#f0fdfa;border-radius:8px;">
          <div style="font-size:11px;color:#64748b;">Paid Orders</div>
          <div style="font-size:20px;font-weight:700;">${paidOrders}</div>
        </td>
        <td style="width:12px;"></td>
        <td style="padding:12px;background:#f0fdfa;border-radius:8px;">
          <div style="font-size:11px;color:#64748b;">Items Sold</div>
          <div style="font-size:20px;font-weight:700;">${totalQuantity.toFixed(0)}</div>
        </td>
      </tr>
    </table>

    <h2 style="font-size:16px;margin:0 0 8px;">Sales by category</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
      <thead>
        <tr style="background:#f1f5f9;text-align:left;">
          <th style="padding:8px;">Category</th>
          <th style="padding:8px;text-align:right;">Revenue</th>
          <th style="padding:8px;text-align:right;">Qty</th>
          <th style="padding:8px;text-align:right;">% of total</th>
        </tr>
      </thead>
      <tbody>
        ${catRows || '<tr><td colspan="4" style="padding:12px;color:#64748b;">No sales in selected categories this week.</td></tr>'}
      </tbody>
    </table>

    <h2 style="font-size:16px;margin:0 0 8px;">Top items</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f1f5f9;text-align:left;">
          <th style="padding:8px;">Item</th>
          <th style="padding:8px;">Category</th>
          <th style="padding:8px;text-align:right;">Revenue</th>
          <th style="padding:8px;text-align:right;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="4" style="padding:12px;color:#64748b;">No items.</td></tr>'}
      </tbody>
    </table>

    <p style="margin:24px 0 0;font-size:11px;color:#94a3b8;">
      Auto-generated by Atul Bakery Sales Analytics. CSV attachment has category and item detail for Excel.
    </p>
  </div>
</body>
</html>`
}

function csvEscape(v) {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function renderCsv({ week, categoryRows, topItems, lines }) {
  const sections = []

  sections.push('Section,Category,Product,Revenue,Quantity,PctOfTotal,OrderDate,OrderId')
  for (const r of categoryRows) {
    sections.push(
      ['Category', r.category, '', r.revenue.toFixed(2), r.quantity.toFixed(2), r.pct.toFixed(2), '', '']
        .map(csvEscape)
        .join(','),
    )
  }
  for (const r of topItems) {
    sections.push(
      ['TopItem', r.category, r.productName, r.revenue.toFixed(2), r.quantity.toFixed(2), '', '', '']
        .map(csvEscape)
        .join(','),
    )
  }
  for (const l of lines) {
    sections.push(
      [
        'Line',
        l.category,
        l.productName,
        Number(l.revenue).toFixed(2),
        Number(l.quantity).toFixed(2),
        '',
        l.orderDate,
        l.orderId || '',
      ]
        .map(csvEscape)
        .join(','),
    )
  }

  return `# Atul Bakery weekly report ${week.periodLabel}\n# Week ${week.startKey} to ${week.endKey}\n${sections.join('\n')}\n`
}
