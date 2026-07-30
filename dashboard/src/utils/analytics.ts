import {
  addDays,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns'
import type {
  AbcRow,
  CategoryAgg,
  DashboardFilters,
  DatePreset,
  Insight,
  KpiBundle,
  PeriodPoint,
  ProductAgg,
  SalesLine,
  TrendGrain,
} from '@/types/sales'

export function resolveDateRange(
  filters: DashboardFilters,
  dataMin: string,
  dataMax: string,
): { start: string; end: string } {
  const today = new Date()
  const preset = filters.datePreset
  let start: Date
  let end: Date = today

  switch (preset) {
    case 'today':
      start = today
      break
    case 'yesterday':
      start = subDays(today, 1)
      end = start
      break
    case 'last7':
      start = subDays(today, 6)
      break
    case 'last30':
      start = subDays(today, 29)
      break
    case 'thisMonth':
      start = startOfMonth(today)
      end = endOfMonth(today)
      break
    case 'prevMonth': {
      const prev = subMonths(today, 1)
      start = startOfMonth(prev)
      end = endOfMonth(prev)
      break
    }
    case 'thisYear':
      start = startOfYear(today)
      end = endOfYear(today)
      break
    case 'custom':
      start = filters.customStart ? parseISO(filters.customStart) : parseISO(dataMin)
      end = filters.customEnd ? parseISO(filters.customEnd) : parseISO(dataMax)
      break
    case 'all':
    default:
      start = parseISO(dataMin)
      end = parseISO(dataMax)
      break
  }

  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  }
}

export function filterLines(lines: SalesLine[], filters: DashboardFilters, dataMin: string, dataMax: string): SalesLine[] {
  const { start, end } = resolveDateRange(filters, dataMin, dataMax)
  const q = filters.search.trim().toLowerCase()

  return lines.filter((l) => {
    if (l.orderDate < start || l.orderDate > end) return false
    if (filters.categories.length && !filters.categories.includes(l.category)) return false
    if (filters.products.length && !filters.products.includes(l.productName)) return false
    if (filters.stores.length && !filters.stores.includes(l.store)) return false
    if (filters.paymentMethods.length) {
      if (!l.paymentMethod || !filters.paymentMethods.includes(l.paymentMethod)) return false
    }
    if (filters.customers.length) {
      if (!l.customer || !filters.customers.includes(l.customer)) return false
    }
    if (q) {
      const hay = `${l.productName} ${l.category}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function dataExtent(lines: SalesLine[]): { min: string; max: string } {
  if (!lines.length) {
    const t = format(new Date(), 'yyyy-MM-dd')
    return { min: t, max: t }
  }
  let min = lines[0].orderDate
  let max = lines[0].orderDate
  for (const l of lines) {
    if (l.orderDate < min) min = l.orderDate
    if (l.periodEnd > max) max = l.periodEnd
    if (l.orderDate > max) max = l.orderDate
  }
  return { min, max }
}

function periodKey(dateStr: string, grain: TrendGrain): string {
  const d = parseISO(dateStr)
  if (grain === 'yearly') return format(d, 'yyyy')
  if (grain === 'monthly') return format(d, 'yyyy-MM')
  if (grain === 'weekly') return format(d, 'yyyy-ww')
  return format(d, 'yyyy-MM-dd')
}

function periodLabel(key: string, grain: TrendGrain): string {
  if (grain === 'yearly') return key
  if (grain === 'monthly') {
    const [y, m] = key.split('-')
    return format(new Date(Number(y), Number(m) - 1, 1), 'MMM yyyy')
  }
  if (grain === 'weekly') return `W${key.slice(5)} ${key.slice(0, 4)}`
  return format(parseISO(key), 'MMM d')
}

export function aggregateByPeriod(lines: SalesLine[], grain: TrendGrain): PeriodPoint[] {
  const map = new Map<string, PeriodPoint & { orderIds: Set<string> }>()
  for (const l of lines) {
    const key = periodKey(l.orderDate, grain)
    let p = map.get(key)
    if (!p) {
      p = {
        period: key,
        label: periodLabel(key, grain),
        revenue: 0,
        quantity: 0,
        profit: 0,
        orders: 0,
        orderIds: new Set(),
      }
      map.set(key, p)
    }
    p.revenue += l.revenue
    p.quantity += l.quantity
    p.profit += l.profit
    if (l.orderId) p.orderIds.add(l.orderId)
    else p.orders += 1
  }
  return [...map.values()]
    .map(({ orderIds, ...rest }) => ({
      ...rest,
      orders: orderIds.size || rest.orders,
    }))
    .sort((a, b) => a.period.localeCompare(b.period))
}

export function aggregateProducts(lines: SalesLine[], prevLines?: SalesLine[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>()
  const totalRev = lines.reduce((s, l) => s + l.revenue, 0) || 1

  for (const l of lines) {
    let p = map.get(l.productName)
    if (!p) {
      p = {
        productName: l.productName,
        category: l.category,
        revenue: 0,
        quantity: 0,
        profit: 0,
        orders: 0,
        avgPrice: 0,
        contributionPct: 0,
        growthPct: null,
      }
      map.set(l.productName, p)
    }
    p.revenue += l.revenue
    p.quantity += l.quantity
    p.profit += l.profit
    p.orders += 1
    p.category = l.category
  }

  const prevMap = new Map<string, number>()
  if (prevLines) {
    for (const l of prevLines) {
      prevMap.set(l.productName, (prevMap.get(l.productName) ?? 0) + l.revenue)
    }
  }

  const list = [...map.values()].map((p) => {
    p.avgPrice = p.quantity ? p.revenue / p.quantity : 0
    p.contributionPct = (p.revenue / totalRev) * 100
    if (prevLines && prevLines.length > 0) {
      const prev = prevMap.get(p.productName)
      if (prev == null) {
        p.growthPct = null // new product in window — no comparable prior
      } else if (prev === 0) {
        p.growthPct = p.revenue > 0 ? 100 : null
      } else {
        p.growthPct = ((p.revenue - prev) / prev) * 100
      }
    }
    return p
  })

  return list.sort((a, b) => b.revenue - a.revenue)
}

export function aggregateCategories(lines: SalesLine[]): CategoryAgg[] {
  const map = new Map<string, CategoryAgg & { products: Set<string> }>()
  const totalRev = lines.reduce((s, l) => s + l.revenue, 0) || 1

  for (const l of lines) {
    let c = map.get(l.category)
    if (!c) {
      c = {
        category: l.category,
        revenue: 0,
        quantity: 0,
        profit: 0,
        productCount: 0,
        contributionPct: 0,
        products: new Set(),
      }
      map.set(l.category, c)
    }
    c.revenue += l.revenue
    c.quantity += l.quantity
    c.profit += l.profit
    c.products.add(l.productName)
  }

  return [...map.values()]
    .map(({ products, ...rest }) => ({
      ...rest,
      productCount: products.size,
      contributionPct: (rest.revenue / totalRev) * 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

export function countPaidOrders(lines: SalesLine[]): number {
  const ids = new Set<string>()
  for (const l of lines) {
    if (l.orderId) ids.add(l.orderId)
  }
  return ids.size
}

function growthPct(current: number, previous: number, hasPrior: boolean): number | null {
  if (!hasPrior) return null
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

export function computeKpis(
  lines: SalesLine[],
  prevLines: SalesLine[] = [],
  opts?: { priorSameTime?: boolean },
): KpiBundle {
  const products = aggregateProducts(lines, prevLines).filter(
    (p) => p.revenue > 0 && !/^https?:\/\//i.test(p.productName),
  )
  const periods = aggregateByPeriod(lines, 'monthly')
  const totalRevenue = lines.reduce((s, l) => s + l.revenue, 0)
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0)
  const totalProfit = lines.reduce((s, l) => s + l.profit, 0)
  const paidOrders = countPaidOrders(lines)
  const averageOrderSize = paidOrders ? totalRevenue / paidOrders : 0

  const prevRevenue = prevLines.reduce((s, l) => s + l.revenue, 0)
  const prevQty = prevLines.reduce((s, l) => s + l.quantity, 0)
  const prevPaidOrders = countPaidOrders(prevLines)
  const prevAov = prevPaidOrders ? prevRevenue / prevPaidOrders : 0
  const hasPrior = prevLines.length > 0 || prevPaidOrders > 0 || prevRevenue > 0

  const sparkRevenue = periods.map((p) => p.revenue)
  const sparkQuantity = periods.map((p) => p.quantity)
  const sparkOrders = periods.map((p) => p.orders)
  const sparkAov = periods.map((p) => (p.orders ? p.revenue / p.orders : 0))

  const highest = products[0]?.productName ?? '—'
  const lowest = products.length ? products[products.length - 1].productName : '—'

  return {
    totalRevenue,
    paidOrders,
    totalQuantity,
    averageOrderSize,
    totalOrders: paidOrders,
    averageOrderValue: averageOrderSize,
    totalProfit,
    profitMarginPct: totalRevenue ? (totalProfit / totalRevenue) * 100 : 0,
    highestItem: highest,
    lowestItem: lowest,
    productCount: new Set(lines.map((l) => l.productName)).size,
    categoryCount: new Set(lines.map((l) => l.category)).size,
    revenueGrowthPct: growthPct(totalRevenue, prevRevenue, hasPrior),
    paidOrdersGrowthPct: growthPct(paidOrders, prevPaidOrders, hasPrior),
    quantityGrowthPct: growthPct(totalQuantity, prevQty, hasPrior),
    averageOrderSizeGrowthPct: growthPct(averageOrderSize, prevAov, hasPrior),
    priorSameTime: Boolean(opts?.priorSameTime),
    sparkRevenue,
    sparkQuantity,
    sparkOrders,
    sparkAov,
  }
}

/**
 * Prior window for KPI growth.
 * - Single calendar day that is still "today": prior day, midnight → same clock time.
 * - Single completed day: prior day full (end of day).
 * - Multi-day ranges: previous equal-length window (full days).
 */
export function priorComparisonLines(
  all: SalesLine[],
  filtered: SalesLine[],
  filters: DashboardFilters,
  dataMin: string,
  dataMax: string,
): { lines: SalesLine[]; priorSameTime: boolean } {
  if (!filtered.length) return { lines: [], priorSameTime: false }

  const { start, end } = resolveDateRange(filters, dataMin, dataMax)
  const isDaily = start === end
  const todayKey = format(new Date(), 'yyyy-MM-dd')

  if (isDaily) {
    const day = parseISO(start)
    const priorKey = format(subDays(day, 1), 'yyyy-MM-dd')
    const priorDayLines = all.filter((l) => l.orderDate === priorKey)

    // In-progress day → cut prior day at the same clock time
    if (start === todayKey) {
      const now = new Date()
      const priorStart = parseISO(priorKey)
      priorStart.setHours(0, 0, 0, 0)
      const cutoffMs =
        priorStart.getTime() +
        now.getHours() * 3600000 +
        now.getMinutes() * 60000 +
        now.getSeconds() * 1000 +
        now.getMilliseconds()

      const hasTimestamps = priorDayLines.some((l) => l.createdTimeMs != null)
      if (hasTimestamps) {
        return {
          lines: priorDayLines.filter(
            (l) => l.createdTimeMs == null || l.createdTimeMs <= cutoffMs,
          ),
          priorSameTime: true,
        }
      }
      // No timestamps in cache yet — fall back to full prior day
      return { lines: priorDayLines, priorSameTime: false }
    }

    // Completed single day → prior day end-of-day (full day)
    return { lines: priorDayLines, priorSameTime: false }
  }

  return { lines: previousPeriodLines(all, filtered), priorSameTime: false }
}

/**
 * Prior comparable window for growth.
 * If the filtered range has no earlier data in `all` (e.g. All Time),
 * fall back to last-month vs previous-month inside the filter (MoM).
 */
export function previousPeriodLines(all: SalesLine[], filtered: SalesLine[]): SalesLine[] {
  if (!filtered.length) return []
  const dates = filtered.map((l) => l.orderDate).sort()
  const start = parseISO(dates[0])
  const end = parseISO(dates[dates.length - 1])
  const spanMs = Math.max(end.getTime() - start.getTime(), 28 * 86400000)
  const prevEnd = addDays(start, -1)
  const prevStart = new Date(prevEnd.getTime() - spanMs)
  const a = format(prevStart, 'yyyy-MM-dd')
  const b = format(prevEnd, 'yyyy-MM-dd')
  const beforeWindow = all.filter((l) => l.orderDate >= a && l.orderDate <= b)
  if (beforeWindow.length) return beforeWindow

  // MoM fallback inside selection
  const months = [...new Set(filtered.map((l) => l.orderDate.slice(0, 7)))].sort()
  if (months.length < 2) return []
  const prevMonth = months[months.length - 2]
  return filtered.filter((l) => l.orderDate.startsWith(prevMonth))
}

/** Current slice used with MoM fallback (latest month when no prior window exists). */
export function currentGrowthLines(all: SalesLine[], filtered: SalesLine[]): SalesLine[] {
  const dates = filtered.map((l) => l.orderDate).sort()
  if (!dates.length) return filtered
  const start = parseISO(dates[0])
  const end = parseISO(dates[dates.length - 1])
  const spanMs = Math.max(end.getTime() - start.getTime(), 28 * 86400000)
  const prevEnd = addDays(start, -1)
  const prevStart = new Date(prevEnd.getTime() - spanMs)
  const a = format(prevStart, 'yyyy-MM-dd')
  const b = format(prevEnd, 'yyyy-MM-dd')
  const hasPrior = all.some((l) => l.orderDate >= a && l.orderDate <= b)
  if (hasPrior) return filtered

  const months = [...new Set(filtered.map((l) => l.orderDate.slice(0, 7)))].sort()
  if (months.length < 2) return filtered
  const last = months[months.length - 1]
  return filtered.filter((l) => l.orderDate.startsWith(last))
}

export function abcClassify(products: ProductAgg[]): AbcRow[] {
  const total = products.reduce((s, p) => s + p.revenue, 0) || 1
  let cum = 0
  return products.map((p) => {
    cum += p.revenue
    const cumulativePct = (cum / total) * 100
    let abc: AbcRow['abc'] = 'C'
    if (cumulativePct <= 80) abc = 'A'
    else if (cumulativePct <= 95) abc = 'B'
    return { ...p, abc, cumulativePct }
  })
}

export function paretoData(products: ProductAgg[]) {
  const total = products.reduce((s, p) => s + p.revenue, 0) || 1
  let cum = 0
  return products.map((p) => {
    cum += p.revenue
    return {
      name: p.productName,
      revenue: p.revenue,
      cumulativePct: (cum / total) * 100,
    }
  })
}

/** Simple moving-average forecast on period series. */
export function movingAverageForecast(
  points: PeriodPoint[],
  periodsAhead: number,
  window = 3,
): { label: string; revenue: number; forecast: boolean }[] {
  const hist = points.map((p) => ({
    label: p.label,
    revenue: p.revenue,
    forecast: false as boolean,
  }))
  if (points.length < 2) return hist

  const values = points.map((p) => p.revenue)
  const out = [...hist]
  for (let i = 0; i < periodsAhead; i++) {
    const slice = values.slice(-window)
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length
    values.push(avg)
    out.push({
      label: `F+${i + 1}`,
      revenue: avg,
      forecast: true,
    })
  }
  return out
}

export function yearOverYearMonthly(lines: SalesLine[]) {
  const byMonth = new Map<string, { month: number; year: number; revenue: number }>()
  for (const l of lines) {
    const d = parseISO(l.orderDate)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const cur = byMonth.get(key) ?? { month: d.getMonth(), year: d.getFullYear(), revenue: 0 }
    cur.revenue += l.revenue
    byMonth.set(key, cur)
  }
  const years = [...new Set([...byMonth.values()].map((v) => v.year))].sort()
  const currentYear = years[years.length - 1]
  const prevYear = years[years.length - 2]
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months.map((label, month) => ({
    label,
    current: byMonth.get(`${currentYear}-${month}`)?.revenue ?? 0,
    previous: prevYear != null ? (byMonth.get(`${prevYear}-${month}`)?.revenue ?? 0) : 0,
    currentYear,
    previousYear: prevYear,
  }))
}

export function seasonalityMatrix(lines: SalesLine[]): { year: number; month: string; revenue: number }[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const map = new Map<string, number>()
  for (const l of lines) {
    const d = parseISO(l.orderDate)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    map.set(key, (map.get(key) ?? 0) + l.revenue)
  }
  const rows: { year: number; month: string; revenue: number }[] = []
  for (const [key, revenue] of map) {
    const [y, m] = key.split('-').map(Number)
    rows.push({ year: y, month: months[m], revenue })
  }
  return rows.sort((a, b) => a.year - b.year || months.indexOf(a.month) - months.indexOf(b.month))
}

export function buildInsights(
  lines: SalesLine[],
  kpis: KpiBundle,
  products: ProductAgg[],
  categories: CategoryAgg[],
  monthly: PeriodPoint[],
): Insight[] {
  const insights: Insight[] = []
  if (!lines.length) {
    return [{ id: 'empty', kind: 'neutral', text: 'No sales rows match the current filters.' }]
  }

  if (kpis.revenueGrowthPct != null) {
    insights.push({
      id: 'rev-growth',
      kind: kpis.revenueGrowthPct >= 0 ? 'positive' : 'negative',
      text: `Revenue ${kpis.revenueGrowthPct >= 0 ? 'increased' : 'decreased'} by ${Math.abs(kpis.revenueGrowthPct).toFixed(1)}% vs the prior comparable period.`,
    })
  }

  if (products[0]) {
    insights.push({
      id: 'top-product',
      kind: 'positive',
      text: `${products[0].productName} leads with ${products[0].contributionPct.toFixed(1)}% of revenue (${products[0].quantity.toLocaleString()} sold).`,
    })
  }

  if (categories[0]) {
    insights.push({
      id: 'top-cat',
      kind: 'neutral',
      text: `${categories[0].category} is the top category at ${categories[0].contributionPct.toFixed(1)}% of net sales.`,
    })
  }

  // MoM product movers
  const growers = products.filter((p) => p.growthPct != null && p.growthPct > 10).slice(0, 3)
  for (const g of growers) {
    insights.push({
      id: `grow-${g.productName}`,
      kind: 'positive',
      text: `${g.productName} sales increased by ${g.growthPct!.toFixed(0)}% vs prior period.`,
    })
  }

  const decliners = [...products]
    .filter((p) => p.growthPct != null && p.growthPct < -10)
    .sort((a, b) => (a.growthPct ?? 0) - (b.growthPct ?? 0))
    .slice(0, 2)
  for (const d of decliners) {
    insights.push({
      id: `drop-${d.productName}`,
      kind: 'negative',
      text: `${d.productName} declined ${Math.abs(d.growthPct!).toFixed(0)}% vs prior period.`,
    })
  }

  // Anomaly detection on monthly revenue (z-score)
  if (monthly.length >= 4) {
    const vals = monthly.map((m) => m.revenue)
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1
    monthly.forEach((m) => {
      const z = (m.revenue - mean) / std
      if (Math.abs(z) >= 1.8) {
        insights.push({
          id: `anom-${m.period}`,
          kind: 'anomaly',
          text: `Unusual ${z > 0 ? 'spike' : 'drop'} in ${m.label}: $${Math.round(m.revenue).toLocaleString()} (z=${z.toFixed(1)}).`,
        })
      }
    })
  }

  const abc = abcClassify(products)
  const aCount = abc.filter((r) => r.abc === 'A').length
  if (aCount) {
    insights.push({
      id: 'abc',
      kind: 'neutral',
      text: `${aCount} products (class A) generate ~80% of revenue — focus inventory and promos here.`,
    })
  }

  return insights.slice(0, 10)
}

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: 'All Time',
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 Days',
  last30: 'Last 30 Days',
  thisMonth: 'This Month',
  prevMonth: 'Previous Month',
  thisYear: 'This Year',
  custom: 'Custom',
}
