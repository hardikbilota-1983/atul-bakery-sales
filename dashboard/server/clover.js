/**
 * Clover Orders API → SalesLine[] aggregator.
 * Amounts from Clover are in cents.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const CACHE_PATH = path.join(__dirname, 'cache', 'clover-sales.json')

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

/** Paginate any Clover list endpoint that returns { elements }. */
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
  if (!Number.isFinite(d.getTime())) return new Date().toISOString().slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

/**
 * Sync paid orders in [startMs, endMs] and map to SalesLine rows (one row per line item).
 */
export async function syncCloverSales({ startMs, endMs }) {
  const { store } = config()

  // Build category map from inventory (faster than expanding every line)
  const categoryByItemId = new Map()
  try {
    const categories = await fetchAll('/categories', { expand: 'items' }, { limit: 100 })
    for (const cat of categories) {
      for (const item of cat.items?.elements ?? []) {
        if (item?.id && !categoryByItemId.has(item.id)) {
          categoryByItemId.set(item.id, cat.name || 'Uncategorized')
        }
      }
    }
  } catch {
    // Category map is optional — fall back to line item expand
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

  for (const order of orders) {
    const payments = order.payments?.elements ?? []
    // Match Items Report: paid / partially paid / refunded — skip purely open carts
    if (!payments.length && String(order.state || '').toLowerCase() === 'open') {
      skippedOpen++
      continue
    }

    const orderDate = toISODate(order.createdTime || order.clientCreatedTime)
    const paymentMethod = paymentMethodFromOrder(order)
    const customer =
      order.customers?.elements?.[0]?.firstName ||
      order.customers?.elements?.[0]?.lastName ||
      undefined

    for (const li of order.lineItems?.elements ?? []) {
      // Skip modifier-only rows that Clover sometimes nests separately — mods are on parent
      const qty = Number(li.unitQty ?? 1) || 1
      const gross = centsToDollars(li.price) * qty
      const discountCents = (li.discounts?.elements ?? []).reduce(
        (s, d) => s + Number(d.amount ?? 0),
        0,
      )
      // Clover discount amounts on line items are typically negative cents
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
        profit: revenue + modAmount, // COGS unknown from Orders API
        avgUnitPrice: qty ? (revenue + modAmount) / qty : revenue + modAmount,
        pctNetSales: 0,
        sourceFile: 'clover-api',
        store,
        paymentMethod,
        customer: customer ? String(customer) : undefined,
        orderId: order.id ? String(order.id) : undefined,
      })
    }
  }

  const payload = {
    syncedAt: new Date().toISOString(),
    startMs,
    endMs,
    orderCount: orders.length,
    lineCount: lines.length,
    skippedOpen,
    store,
    lines,
  }
  writeCache(payload)
  return payload
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
