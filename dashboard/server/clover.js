/**
 * Clover Orders API → SalesLine[] aggregator.
 * Amounts from Clover are in cents.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  dayKeyInZone,
  todayBoundsInZone,
  yesterdayBoundsInZone,
  dayBoundsInZone,
  merchantTimeZone,
} from './timezone.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const CACHE_PATH = path.join(__dirname, 'cache', 'clover-sales.json')
export const CATALOG_PATH = path.join(__dirname, 'cache', 'clover-catalog.json')
/** Bump when day-boundary logic changes so stale UTC caches are discarded. */
export const SALES_CACHE_VERSION = 4

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
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
    if (data.version !== SALES_CACHE_VERSION) {
      console.log(`[clover] discarding sales cache v${data.version} (need v${SALES_CACHE_VERSION})`)
      return null
    }
    return data
  } catch {
    return null
  }
}

function writeCache(payload) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(
    CACHE_PATH,
    JSON.stringify({ ...payload, version: SALES_CACHE_VERSION, timeZone: merchantTimeZone() }, null, 2),
  )
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

/** Merchant-local calendar day key YYYY-MM-DD */
export function localDayKey(d = new Date()) {
  return dayKeyInZone(d)
}

export function todayBounds() {
  return todayBoundsInZone()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Serialize all Clover calls (token concurrent limit is 5; stay at 1). */
let cloverQueue = Promise.resolve()
let lastCloverCallAt = 0
/** Min gap between requests — stay well under 16 req/sec per token. */
const MIN_REQUEST_GAP_MS = 120

function enqueueClover(task) {
  const run = cloverQueue.then(task, task)
  cloverQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function retryAfterMs(res, attempt) {
  const header = res.headers.get('retry-after') || res.headers.get('Retry-After')
  if (header) {
    const sec = Number(header)
    if (Number.isFinite(sec) && sec >= 0) return Math.min(60_000, sec * 1000)
  }
  // Clover guidance: pause 1s, then exponential backoff + jitter
  const base = Math.min(30_000, 1000 * 2 ** attempt)
  return base + Math.floor(Math.random() * 400)
}

async function cloverGet(apiPath, query = {}) {
  return enqueueClover(async () => {
    const { merchantId, token, baseUrl } = config()
    if (!merchantId || !token) {
      throw new Error('Clover is not configured. Set CLOVER_MERCHANT_ID and CLOVER_API_TOKEN.')
    }

    const url = new URL(`${baseUrl}/v3/merchants/${merchantId}${apiPath}`)
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)))
      else if (v != null) url.searchParams.set(k, String(v))
    }

    const maxAttempts = 8
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const waitGap = MIN_REQUEST_GAP_MS - (Date.now() - lastCloverCallAt)
      if (waitGap > 0) await sleep(waitGap)
      lastCloverCallAt = Date.now()

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (res.status === 429) {
        const wait = retryAfterMs(res, attempt)
        console.warn(`[clover] 429 on ${apiPath} — waiting ${wait}ms (attempt ${attempt + 1}/${maxAttempts})`)
        await sleep(wait)
        continue
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Clover API ${res.status}: ${body.slice(0, 300) || res.statusText}`)
      }
      return res.json()
    }

    throw new Error(
      'Clover API 429: Too Many Requests — still rate-limited after retries. Wait a minute and try a smaller date range.',
    )
  })
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

/** In-memory merchant ping cache — status polling must not burn the rate budget. */
let merchantCache = { at: 0, value: null, error: null }
const MERCHANT_CACHE_MS = 10 * 60 * 1000

export async function cachedTestConnection({ force = false } = {}) {
  if (!force && merchantCache.value && Date.now() - merchantCache.at < MERCHANT_CACHE_MS) {
    return merchantCache.value
  }
  try {
    const value = await testConnection()
    merchantCache = { at: Date.now(), value, error: null }
    return value
  } catch (e) {
    merchantCache = {
      at: Date.now(),
      value: merchantCache.value,
      error: e instanceof Error ? e.message : String(e),
    }
    if (merchantCache.value) return merchantCache.value
    throw e
  }
}

function centsToDollars(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return 0
  return Number(cents) / 100
}

function toISODate(ms) {
  const d = new Date(Number(ms))
  if (!Number.isFinite(d.getTime())) return localDayKey()
  return dayKeyInZone(d)
}

function categoryFromItem(item) {
  const cats = item?.categories?.elements
  if (cats?.length) return String(cats[0].name || 'Uncategorized')
  return 'Uncategorized'
}

function paymentMethodFromOrder(order) {
  const pays = successfulPayments(order)
  if (!pays.length) return undefined
  const t = pays[0].tender?.label || pays[0].tender?.labelKey || pays[0].cardTransaction?.cardType
  return t ? String(t) : undefined
}

/** Payments Clover treats as successful / countable toward paid orders. */
function successfulPayments(order) {
  const pays = order.payments?.elements ?? []
  return pays.filter((p) => {
    const result = String(p.result || p.status || '').toUpperCase()
    if (result && result !== 'SUCCESS' && result !== 'PAID') return false
    // Ignore $0 auth-only rows when result missing
    if (!result && Number(p.amount || 0) <= 0) return false
    return true
  })
}

function isPaidOrder(order) {
  return successfulPayments(order).length > 0
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

const WEEK_MS = 7 * 86400000

/**
 * Sync paid orders in [startMs, endMs] and map to SalesLine rows.
 * Long ranges are pulled in weekly chunks to avoid rate-limit bursts / timeouts.
 * Merges into existing cache by replacing lines for overlapping calendar days.
 */
export async function syncCloverSales({ startMs, endMs }) {
  const span = endMs - startMs
  if (span > WEEK_MS) {
    let cursor = startMs
    let last = null
    let paidOrders = 0
    while (cursor <= endMs) {
      const chunkEnd = Math.min(cursor + WEEK_MS - 1, endMs)
      console.log(
        `[clover] sync chunk ${new Date(cursor).toISOString()} → ${new Date(chunkEnd).toISOString()}`,
      )
      last = await syncCloverSalesRange({ startMs: cursor, endMs: chunkEnd })
      paidOrders += last.orderCount || 0
      cursor = chunkEnd + 1
      if (cursor <= endMs) await sleep(400)
    }
    return {
      ...last,
      startMs,
      endMs,
      orderCount: paidOrders,
      lineCount: last?.lineCount ?? 0,
    }
  }
  return syncCloverSalesRange({ startMs, endMs })
}

async function syncCloverSalesRange({ startMs, endMs }) {
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
  let skippedUnpaid = 0
  const touchedDays = new Set()

  for (const order of orders) {
    if (!isPaidOrder(order)) {
      skippedUnpaid++
      continue
    }

    const createdMs = Number(order.createdTime || order.clientCreatedTime)
    const orderDate = toISODate(createdMs)
    const createdTimeMs = Number.isFinite(createdMs) ? createdMs : undefined
    touchedDays.add(orderDate)
    const paymentMethod = paymentMethodFromOrder(order)
    const customer =
      order.customers?.elements?.[0]?.firstName ||
      order.customers?.elements?.[0]?.lastName ||
      undefined

    for (const li of order.lineItems?.elements ?? []) {
      // Skip fully refunded rows
      if (Number(li.refunded || 0) > 0 && Number(li.unitQty || 1) <= Number(li.refunded || 0)) {
        continue
      }
      const qty = Math.max(0, Number(li.unitQty ?? 1) - Number(li.refunded || 0)) || Number(li.unitQty ?? 1) || 1
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
        refundedQty: Number(li.refunded || 0),
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

  // Mark requested calendar days in merchant TZ even if zero sales
  {
    const tz = merchantTimeZone()
    let cursorKey = dayKeyInZone(new Date(startMs), tz)
    const endKey = dayKeyInZone(new Date(endMs), tz)
    while (cursorKey <= endKey) {
      touchedDays.add(cursorKey)
      const { end } = dayBoundsInZone(cursorKey, tz)
      const next = new Date(end.getTime() + 1)
      cursorKey = dayKeyInZone(next, tz)
    }
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
    orderCount: orders.filter(isPaidOrder).length,
    lineCount: mergedLines.length,
    skippedOpen,
    skippedUnpaid,
    store,
    cachedDays,
    lines: mergedLines,
  }
  writeCache(payload)
  return payload
}

/**
 * On app load: ensure today + yesterday (for vs-prior) are cached in merchant TZ.
 * If today's day is already cached, do not hit Clover again.
 */
export async function ensureTodaySales() {
  const today = todayBoundsInZone()
  const yesterday = yesterdayBoundsInZone()
  const cache = readCache()
  const hasToday = cache?.cachedDays?.includes(today.dayKey)
  const hasYesterday = cache?.cachedDays?.includes(yesterday.dayKey)

  if (hasToday && hasYesterday) {
    return {
      ...cache,
      fromCache: true,
      dayKey: today.dayKey,
      todayLineCount: (cache.lines ?? []).filter((l) => l.orderDate === today.dayKey).length,
    }
  }

  if (!hasYesterday && !hasToday) {
    await syncCloverSales({
      startMs: yesterday.start.getTime(),
      endMs: Math.min(today.end.getTime(), Date.now()),
    })
  } else if (!hasYesterday) {
    await syncCloverSales({
      startMs: yesterday.start.getTime(),
      endMs: yesterday.end.getTime(),
    })
  } else if (!hasToday) {
    await syncCloverSales({
      startMs: today.start.getTime(),
      endMs: Math.min(today.end.getTime(), Date.now()),
    })
  }

  const fresh = readCache()
  return {
    ...fresh,
    fromCache: false,
    dayKey: today.dayKey,
    todayLineCount: (fresh?.lines ?? []).filter((l) => l.orderDate === today.dayKey).length,
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
