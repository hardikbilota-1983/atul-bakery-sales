/**
 * Clover Orders API → SalesLine[] aggregator.
 * Amounts from Clover are in cents.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const CACHE_PATH = path.join(__dirname, 'cache', 'clover-sales.json')
export const CATALOG_PATH = path.join(__dirname, 'cache', 'clover-catalog.json')

function config() {
  const merchantId = process.env.CLOVER_MERCHANT_ID?.trim()
  const token = process.env.CLOVER_API_TOKEN?.trim()
  const baseUrl = (process.env.CLOVER_BASE_URL || 'https://api.clover.com').replace(/\/$/, '')
  const store = process.env.CLOVER_STORE_NAME?.trim() || 'Hillside'
  return { merchantId, token, baseUrl, store }
}

export function cloverConfigured() {
  const { merchantId, token } = config()
  return Boolean(merchantId && token)
}

export function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeCache(payload) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2))
}

export function readCatalogCache() {
  try {
    if (!fs.existsSync(CATALOG_PATH)) return null
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeCatalogCache(payload) {
  fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true })
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(payload, null, 2))
}

/** Local calendar day key YYYY-MM-DD */
export function localDayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayBounds() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start, end, dayKey: localDayKey(start) }
}

async function cloverGet(apiPath, query = {}) {
  const { merchantId, token, baseUrl } = config()
  if (!merchantId || !token) {
    throw new Error('Clover is not configured. Set CLOVER_MERCHANT_ID and CLOVER_API_TOKEN.')
  }

  const url = new URL(`${baseUrl}/v3/merchants/${merchantId}${apiPath}`)
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)))
    else if (v != null) url.searchParams.set(k, String(v))
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Clover API ${res.status}: ${body.slice(0, 300) || res.statusText}`)
  }
  return res.json()
}

async function fetchAll(apiPath, query = {}, { limit = 100, maxPages = 200 } = {}) {
  const all = []
  let offset = 0
  for (let page = 0; page < maxPages; page++) {
    const data = await cloverGet(apiPath, { ...query, limit, offset })
    const batch = data.elements ?? []
    all.push(...batch)
    if (batch.length < limit) break
    offset += limit
  }
  return all
}

function centsToDollars(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return 0
  return Number(cents) / 100
}

function toISODate(ms) {
  const d = new Date(Number(ms))
  if (!Number.isFinite(d.getTime())) return localDayKey()
  return localDayKey(d)
}

function categoryFromItem(item) {
  const cats = item?.categories?.elements
  if (cats?.length) return String(cats[0].name || 'Uncategorized')
  return 'Uncategorized'
}

function paymentMethodFromOrder(order) {
  const pays = order.payments?.elements
  if (!pays?.length) return undefined
  const t = pays[0].tender?.label || pays[0].tender?.labelKey || pays[0].cardTransaction?.cardType
  return t ? String(t) : undefined
}

async function buildCategoryMap() {
  const categoryByItemId = new Map()
  const categories = await fetchAll('/categories', { expand: 'items' }, { limit: 100 })
  for (const cat of categories) {
    for (const item of cat.items?.elements ?? []) {
      if (item?.id && !categoryByItemId.has(item.id)) {
        categoryByItemId.set(item.id, cat.name || 'Uncategorized')
      }
    }
  }
  return { categories, categoryByItemId }
}

/**
 * Fetch inventory categories + products once; subsequent callers hit disk cache.
 */
export async function ensureCatalog({ force = false } = {}) {
  if (!force) {
    const cached = readCatalogCache()
    if (cached?.categories?.length) {
      const categoryByItemId = new Map()
      for (const p of cached.products ?? []) {
        if (p.id) categoryByItemId.set(p.id, p.category)
      }
      return { ...cached, fromCache: true, categoryByItemId }
    }
  }

  const { categories, categoryByItemId } = await buildCategoryMap()
  const productsByCategory = {}
  const products = []
  const categoryNames = []

  for (const cat of categories) {
    const catName = String(cat.name || 'Uncategorized').trim() || 'Uncategorized'
    categoryNames.push(catName)
    const names = []
    for (const item of cat.items?.elements ?? []) {
      const name = String(item.name || '').trim()
      if (!name) continue
      names.push(name)
      products.push({ name, category: catName, id: item.id })
    }
    productsByCategory[catName] = [...new Set(names)].sort((a, b) => a.localeCompare(b))
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    categories: [...new Set(categoryNames)].sort((a, b) => a.localeCompare(b)),
    productsByCategory,
    products,
    itemCount: products.length,
  }
  writeCatalogCache(payload)
  const categoryByItemIdOut = new Map()
  for (const p of products) {
    if (p.id) categoryByItemIdOut.set(p.id, p.category)
  }
  return { ...payload, fromCache: false, categoryByItemId: categoryByItemIdOut }
}

/**
 * Sync paid orders in [startMs, endMs] and map to SalesLine rows.
 * Merges into existing cache by replacing lines for overlapping calendar days.
 */
export async function syncCloverSales({ startMs, endMs }) {
  const { store } = config()

  let categoryByItemId = new Map()
  try {
    const catalog = await ensureCatalog()
    if (catalog.categoryByItemId) {
      categoryByItemId = catalog.categoryByItemId
    } else if (catalog.products) {
      for (const p of catalog.products) {
        if (p.id) categoryByItemId.set(p.id, p.category)
      }
    }
  } catch {
    // optional
  }

  const filters = [`createdTime>=${startMs}`, `createdTime<=${endMs}`]
  const orders = await fetchAll(
    '/orders',
    {
      filter: filters,
      expand: 'lineItems,lineItems.modifications,lineItems.discounts,payments,payments.tender',
    },
    { limit: 100 },
  )

  const lines = []
  let skippedOpen = 0
  const touchedDays = new Set()

  for (const order of orders) {
    const payments = order.payments?.elements ?? []
    if (!payments.length && String(order.state || '').toLowerCase() === 'open') {
      skippedOpen++
      continue
    }

    const orderDate = toISODate(order.createdTime || order.clientCreatedTime)
    const createdTimeMs = Number(order.createdTime || order.clientCreatedTime) || undefined
    touchedDays.add(orderDate)
    const paymentMethod = paymentMethodFromOrder(order)
    const customer =
      order.customers?.elements?.[0]?.firstName ||
      order.customers?.elements?.[0]?.lastName ||
      undefined

    for (const li of order.lineItems?.elements ?? []) {
      const qty = Number(li.unitQty ?? 1) || 1
      const gross = centsToDollars(li.price) * qty
      const discountCents = (li.discounts?.elements ?? []).reduce(
        (s, d) => s + Number(d.amount ?? 0),
        0,
      )
      const discounts = Math.abs(centsToDollars(discountCents))
      const revenue = Math.max(0, gross - discounts)
      const itemId = li.item?.id
      const category =
        (itemId && categoryByItemId.get(itemId)) ||
        categoryFromItem(li.item) ||
        'Uncategorized'

      const modAmount = (li.modifications?.elements ?? []).reduce(
        (s, m) => s + centsToDollars(m.amount ?? 0),
        0,
      )

      lines.push({
        orderDate,
        periodEnd: orderDate,
        productName: String(li.name || 'Unknown').trim() || 'Unknown',
        category: String(category),
        quantity: qty,
        revenue: revenue + modAmount,
        grossSales: gross + modAmount,
        discounts,
        refunds: 0,
        refundedQty: 0,
        cogs: 0,
        profit: revenue + modAmount,
        avgUnitPrice: qty ? (revenue + modAmount) / qty : revenue + modAmount,
        pctNetSales: 0,
        sourceFile: 'clover-api',
        store,
        paymentMethod,
        customer: customer ? String(customer) : undefined,
        orderId: order.id ? String(order.id) : undefined,
        createdTimeMs,
      })
    }
  }

  // Always mark requested calendar days even if zero sales
  const cursor = new Date(startMs)
  const end = new Date(endMs)
  while (cursor <= end) {
    touchedDays.add(localDayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const existing = readCache()
  const prevLines = existing?.lines ?? []
  const kept = prevLines.filter((l) => !touchedDays.has(l.orderDate))
  const mergedLines = [...kept, ...lines]
  const cachedDays = [
    ...new Set([...(existing?.cachedDays ?? []), ...touchedDays]),
  ].sort()

  const payload = {
    syncedAt: new Date().toISOString(),
    startMs,
    endMs,
    orderCount: orders.length,
    lineCount: mergedLines.length,
    skippedOpen,
    store,
    cachedDays,
    lines: mergedLines,
  }
  writeCache(payload)
  return payload
}

/**
 * On app load: return today's sales from disk if already fetched today;
 * otherwise pull today from Clover once and cache.
 */
export async function ensureTodaySales() {
  const { start, end, dayKey } = todayBounds()
  const cache = readCache()
  if (cache?.cachedDays?.includes(dayKey)) {
    return {
      ...cache,
      fromCache: true,
      dayKey,
      todayLineCount: (cache.lines ?? []).filter((l) => l.orderDate === dayKey).length,
    }
  }

  const result = await syncCloverSales({
    startMs: start.getTime(),
    endMs: end.getTime(),
  })
  return {
    ...result,
    fromCache: false,
    dayKey,
    todayLineCount: (result.lines ?? []).filter((l) => l.orderDate === dayKey).length,
  }
}

export async function testConnection() {
  const { merchantId } = config()
  const merchant = await cloverGet('')
  return {
    ok: true,
    merchantId,
    name: merchant.name || merchant.id,
    address: merchant.address,
  }
}
