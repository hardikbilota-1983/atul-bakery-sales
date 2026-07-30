import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import type { Plugin } from 'vite'

const rootDir = import.meta.dirname

/** Serve / sync sales CSVs from public/data and the parent Sales folder. */
function salesDataPlugin(): Plugin {
  const publicData = path.resolve(rootDir, 'public/data')
  const parentData = path.resolve(rootDir, '..')

  const isSalesFile = (name: string) =>
    /\.(csv|xlsx|xls|json|jsonl)$/i.test(name) &&
    !name.startsWith('.') &&
    name !== 'package.json' &&
    name !== 'package-lock.json' &&
    name !== 'manifest.json'

  const listFiles = () => {
    const names = new Set<string>()
    for (const dir of [publicData, parentData]) {
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        if (isSalesFile(f)) names.add(f)
      }
    }
    return [...names].sort()
  }

  const resolveFile = (name: string) => {
    const inPublic = path.join(publicData, name)
    if (fs.existsSync(inPublic)) return inPublic
    const inParent = path.join(parentData, name)
    if (fs.existsSync(inParent)) return inParent
    return null
  }

  return {
    name: 'sales-data',
    configureServer(server) {
      server.middlewares.use('/data/manifest.json', (_req, res, next) => {
        // Prefer generated live manifest over a stale public copy
        try {
          const files = listFiles()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ files, base: '/data/' }))
        } catch {
          next()
        }
      })
      server.middlewares.use('/data', (req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (url === '/' || url === '' || url === '/manifest.json') return next()
        const name = decodeURIComponent(url.replace(/^\//, ''))
        if (!isSalesFile(name) || name.includes('..') || name.includes('/') || name.includes('\\')) {
          res.statusCode = 400
          res.end('Invalid file')
          return
        }
        const full = resolveFile(name)
        if (!full) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        const ext = path.extname(name).toLowerCase()
        const type =
          ext === '.csv'
            ? 'text/csv'
            : ext === '.json' || ext === '.jsonl'
              ? 'application/json'
              : 'application/octet-stream'
        res.setHeader('Content-Type', type)
        fs.createReadStream(full).pipe(res)
      })
    },
    closeBundle() {
      const outDir = path.resolve(rootDir, 'dist/data')
      fs.mkdirSync(outDir, { recursive: true })
      const files = listFiles()
      for (const f of files) {
        const src = resolveFile(f)
        if (src) fs.copyFileSync(src, path.join(outDir, f))
      }
      fs.writeFileSync(
        path.join(outDir, 'manifest.json'),
        JSON.stringify({ files, base: '/data/' }),
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), salesDataPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    fs: { allow: [path.resolve(rootDir, '..')] },
  },
})
