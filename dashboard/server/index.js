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
import {
  buildWeeklyReport,
  isWeeklySendWindow,
  readLastSent,
  writeLastSent,
  reportRecipients,
} from './reports.js'
import { mailConfigured, sendReportEmail } from './mail.js'

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
      cachedDays: sales.cachedDays ?? [],
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

function authorizeCron(req) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return { ok: false, status: 503, error: 'CRON_SECRET is not configured on the server.' }
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const alt = String(req.headers['x-cron-secret'] || '').trim()
  if (token !== secret && alt !== secret) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  return { ok: true }
}

/**
 * Weekly franchisor report: sync Mon–Sun ET, email HTML + CSV via Resend.
 * Query: dryRun=1 (no send), force=1 (skip schedule/window + already-sent guards)
 */
app.post('/api/reports/weekly', async (req, res) => {
  try {
    const auth = authorizeCron(req)
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error })
      return
    }

    const dryRun = req.query.dryRun === '1' || req.body?.dryRun === true
    const force = req.query.force === '1' || req.body?.force === true
    const enabled = String(process.env.REPORT_ENABLED || '').toLowerCase() === 'true'

    if (!enabled && !dryRun) {
      res.status(503).json({
        error: 'Weekly report is disabled. Set REPORT_ENABLED=true (or use dryRun=1).',
      })
      return
    }

    if (!force && !dryRun && !isWeeklySendWindow()) {
      res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'Outside Sunday 23:00+ / Monday <05:00 Eastern send window. Use force=1 to override.',
      })
      return
    }

    const report = await buildWeeklyReport()
    const last = readLastSent()
    if (!force && !dryRun && last?.weekKey === report.week.weekKey) {
      res.status(200).json({
        ok: true,
        skipped: true,
        reason: `Already sent for week ${report.week.weekKey}`,
        weekKey: report.week.weekKey,
        sentAt: last.sentAt,
      })
      return
    }

    if (dryRun) {
      res.json({
        ok: true,
        dryRun: true,
        weekKey: report.week.weekKey,
        periodLabel: report.week.periodLabel,
        store: report.store,
        totalRevenue: report.totalRevenue,
        paidOrders: report.paidOrders,
        totalQuantity: report.totalQuantity,
        lineCount: report.lineCount,
        categories: report.categoryRows,
        topItems: report.topItems,
        recipients: reportRecipients(),
        mailConfigured: mailConfigured(),
        htmlPreview: report.html.slice(0, 2000),
        csvFilename: report.csvFilename,
        csvBytes: Buffer.byteLength(report.csv, 'utf8'),
      })
      return
    }

    if (!mailConfigured()) {
      res.status(503).json({
        error: 'GMAIL_USER (or REPORT_FROM) and GMAIL_APP_PASSWORD are required to send.',
      })
      return
    }
    const to = reportRecipients()
    if (!to.length) {
      res.status(400).json({ error: 'REPORT_TO has no email addresses.' })
      return
    }

    const subject = `Atul Bakery (${report.store}) weekly sales · ${report.week.periodLabel}`
    const mailResult = await sendReportEmail({
      to,
      subject,
      html: report.html,
      attachments: [
        {
          filename: report.csvFilename,
          content: report.csv,
          contentType: 'text/csv',
        },
      ],
    })

    writeLastSent({
      weekKey: report.week.weekKey,
      periodLabel: report.week.periodLabel,
      sentAt: new Date().toISOString(),
      to,
      messageId: mailResult.id,
      totalRevenue: report.totalRevenue,
    })

    res.json({
      ok: true,
      sent: true,
      weekKey: report.week.weekKey,
      periodLabel: report.week.periodLabel,
      to,
      totalRevenue: report.totalRevenue,
      paidOrders: report.paidOrders,
      totalQuantity: report.totalQuantity,
      messageId: mailResult.id,
    })
  } catch (e) {
    console.error('[reports/weekly]', e)
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
