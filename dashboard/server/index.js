import dotenv from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import express from 'express'
import cors from 'cors'
import {
  cloverConfigured,
  readCache,
  readCatalogCache,
  syncCloverSales,
  ensureTodaySales,
  ensureCatalog,
  cachedTestConnection,
  localDayKey,
} from './clover.js'
import { dayBoundsInZone, dayKeyInZone } from './timezone.js'

const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const PORT = Number(process.env.PORT || 8787)

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, cloverConfigured: cloverConfigured() })
})

app.get('/api/clover/status', async (_req, res) => {
  const cache = readCache()
  const catalog = readCatalogCache()
  const configured = cloverConfigured()
  const dayKey = localDayKey()
  let merchant = null
  let error = null
  if (configured) {
    try {
      merchant = await cachedTestConnection()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
  res.json({
    configured,
    merchant,
    error,
    todayCached: Boolean(cache?.cachedDays?.includes(dayKey)),
    dayKey,
    catalogCached: Boolean(catalog?.categories?.length),
    cache: cache
      ? {
          syncedAt: cache.syncedAt,
          lineCount: cache.lineCount,
          orderCount: cache.orderCount,
          startMs: cache.startMs,
          endMs: cache.endMs,
          store: cache.store,
          cachedDays: cache.cachedDays ?? [],
        }
      : null,
  })
})

/** Ensure catalog exists (fetch once), return categories + products. */
app.get('/api/clover/catalog', async (req, res) => {
  try {
    if (!cloverConfigured()) {
      res.status(400).json({ error: 'Clover is not configured.' })
      return
    }
    const force = req.query.force === '1'
    const catalog = await ensureCatalog({ force })
    res.json({
      fetchedAt: catalog.fetchedAt,
      fromCache: catalog.fromCache,
      categories: catalog.categories,
      productsByCategory: catalog.productsByCategory,
      products: catalog.products,
      itemCount: catalog.itemCount,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

/**
 * App bootstrap: ensure today's sales are cached, ensure catalog exists,
 * return sales lines (all cached days, typically at least today).
 * Runs sequentially to respect Clover rate limits. Falls back to cache on 429.
 */
app.post('/api/clover/bootstrap', async (_req, res) => {
  try {
    if (!cloverConfigured()) {
      res.status(400).json({
        error:
          'Missing CLOVER_MERCHANT_ID or CLOVER_API_TOKEN. Add them to .env (local) or Render env vars.',
      })
      return
    }

    let rateLimited = false
    let catalog
    try {
      catalog = await ensureCatalog()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const cachedCat = readCatalogCache()
      if (cachedCat?.categories?.length) {
        catalog = { ...cachedCat, fromCache: true }
        rateLimited = /429/.test(msg)
      } else {
        throw e
      }
    }

    let sales
    try {
      sales = await ensureTodaySales()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const cache = readCache()
      if (cache?.lines?.length) {
        const dayKey = localDayKey()
        sales = {
          ...cache,
          fromCache: true,
          dayKey,
          todayLineCount: cache.lines.filter((l) => l.orderDate === dayKey).length,
        }
        rateLimited = rateLimited || /429/.test(msg)
      } else {
        throw e
      }
    }

    res.json({
      ok: true,
      fromCache: sales.fromCache,
      dayKey: sales.dayKey,
      todayLineCount: sales.todayLineCount,
      syncedAt: sales.syncedAt,
      orderCount: sales.orderCount,
      lineCount: sales.lineCount,
      lines: sales.lines,
      rateLimited: rateLimited || undefined,
      catalog: {
        fromCache: catalog.fromCache,
        categories: catalog.categories,
        productsByCategory: catalog.productsByCategory,
        itemCount: catalog.itemCount,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/api/clover/sales', (_req, res) => {
  const cache = readCache()
  if (!cache?.lines) {
    res.status(404).json({ error: 'No Clover sync cache yet.' })
    return
  }
  res.json(cache)
})

app.post('/api/clover/sync', async (req, res) => {
  try {
    if (!cloverConfigured()) {
      res.status(400).json({
        error:
          'Missing CLOVER_MERCHANT_ID or CLOVER_API_TOKEN. Add them to .env (local) or Render env vars.',
      })
      return
    }

    const endKey = String(req.body?.endDate || dayKeyInZone()).slice(0, 10)
    const startKey = String(
      req.body?.startDate ||
        dayKeyInZone(new Date(dayBoundsInZone(endKey).start.getTime() - 90 * 86400000)),
    ).slice(0, 10)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endKey)) {
      res.status(400).json({ error: 'Invalid startDate or endDate' })
      return
    }
    if (startKey > endKey) {
      res.status(400).json({ error: 'startDate must be before endDate' })
      return
    }

    const { start } = dayBoundsInZone(startKey)
    const { end } = dayBoundsInZone(endKey)
    const maxSpan = 370 * 86400000
    if (end.getTime() - start.getTime() > maxSpan) {
      res.status(400).json({ error: 'Sync range cannot exceed ~1 year. Split into smaller ranges.' })
      return
    }

    const result = await syncCloverSales({
      startMs: start.getTime(),
      endMs: Math.min(end.getTime(), Date.now()),
    })

    res.json({
      ok: true,
      syncedAt: result.syncedAt,
      orderCount: result.orderCount,
      lineCount: result.lineCount,
      skippedOpen: result.skippedOpen,
      startMs: result.startMs,
      endMs: result.endMs,
      cachedDays: result.cachedDays,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'

if (isProd) {
  if (!fs.existsSync(distDir)) {
    console.warn(`[warn] dist/ missing at ${distDir} — UI will not load`)
  } else {
    console.log(`[info] serving static from ${distDir}`)
  }
  app.use(express.static(distDir))
  // Express 5: bare "*" is invalid and crashes startup — use a middleware fallback
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next(err)
    })
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sales API listening on 0.0.0.0:${PORT} (${isProd ? 'production' : 'dev'})`)
  console.log(`Clover configured: ${cloverConfigured()}`)
  console.log(`RENDER=${process.env.RENDER ?? ''} NODE_ENV=${process.env.NODE_ENV ?? ''}`)
})
