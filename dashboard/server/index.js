import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import express from 'express'
import cors from 'cors'
import {
  cloverConfigured,
  readCache,
  syncCloverSales,
  testConnection,
} from './clover.js'

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
  const configured = cloverConfigured()
  let merchant = null
  let error = null
  if (configured) {
    try {
      merchant = await testConnection()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
  res.json({
    configured,
    merchant,
    error,
    cache: cache
      ? {
          syncedAt: cache.syncedAt,
          lineCount: cache.lineCount,
          orderCount: cache.orderCount,
          startMs: cache.startMs,
          endMs: cache.endMs,
          store: cache.store,
        }
      : null,
  })
})

app.get('/api/clover/sales', (_req, res) => {
  const cache = readCache()
  if (!cache?.lines) {
    res.status(404).json({ error: 'No Clover sync cache yet. Run Sync first.' })
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

    const end = req.body?.endDate ? new Date(req.body.endDate) : new Date()
    const start = req.body?.startDate
      ? new Date(req.body.startDate)
      : new Date(end.getTime() - 90 * 86400000)

    // Inclusive end of day
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      res.status(400).json({ error: 'Invalid startDate or endDate' })
      return
    }
    if (start > end) {
      res.status(400).json({ error: 'startDate must be before endDate' })
      return
    }

    // Guardrail: max ~1 year per sync to avoid timeouts
    const maxSpan = 370 * 86400000
    if (end.getTime() - start.getTime() > maxSpan) {
      res.status(400).json({ error: 'Sync range cannot exceed ~1 year. Split into smaller ranges.' })
      return
    }

    const result = await syncCloverSales({
      startMs: start.getTime(),
      endMs: end.getTime(),
    })

    res.json({
      ok: true,
      syncedAt: result.syncedAt,
      orderCount: result.orderCount,
      lineCount: result.lineCount,
      skippedOpen: result.skippedOpen,
      startMs: result.startMs,
      endMs: result.endMs,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

const isProd = process.env.NODE_ENV === 'production'

// Production: serve Vite build
if (isProd) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Sales API listening on http://127.0.0.1:${PORT} (${isProd ? 'production' : 'dev'})`)
  console.log(`Clover configured: ${cloverConfigured()}`)
})
