import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import type { AbcRow, ProductAgg } from '@/types/sales'
import { formatCurrency, formatNumber, formatPct, cn } from '@/lib/utils'

export function ProductRankCards({
  title,
  products,
  tone,
}: {
  title: string
  products: ProductAgg[]
  tone: 'top' | 'bottom'
}) {
  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <h3 className="mb-4 font-display text-base font-semibold text-ink">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((p, i) => (
          <motion.div
            key={p.productName}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Link
              to={`/product/${encodeURIComponent(p.productName)}`}
              className="block rounded-xl border border-border bg-white/30 p-3 transition hover:border-accent/40 hover:bg-accent/5 dark:bg-black/20"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{p.productName}</p>
                  <p className="text-[11px] text-muted">{p.category}</p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    tone === 'top'
                      ? 'bg-success/15 text-success'
                      : 'bg-danger/15 text-danger',
                  )}
                >
                  #{i + 1}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted">Revenue</p>
                  <p className="font-semibold">{formatCurrency(p.revenue, true)}</p>
                </div>
                <div>
                  <p className="text-muted">Qty</p>
                  <p className="font-semibold">{formatNumber(p.quantity)}</p>
                </div>
                <div>
                  <p className="text-muted">Growth</p>
                  <p className="font-semibold">{formatPct(p.growthPct)}</p>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
        {!products.length && (
          <p className="col-span-full py-8 text-center text-sm text-muted">No products</p>
        )}
      </div>
    </div>
  )
}

export function AbcTable({ rows }: { rows: AbcRow[] }) {
  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <h3 className="mb-1 font-display text-base font-semibold text-ink">ABC Classification</h3>
      <p className="mb-4 text-xs text-muted">
        A ≈ top 80% revenue · B ≈ next 15% · C ≈ remaining 5%
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase text-muted dark:bg-white/[0.03]">
            <tr>
              <th className="px-3 py-2 text-left">Class</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Cum %</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 40).map((r) => (
              <tr key={r.productName} className="border-t border-border/70">
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white',
                      r.abc === 'A' && 'bg-success',
                      r.abc === 'B' && 'bg-warning',
                      r.abc === 'C' && 'bg-muted',
                    )}
                  >
                    {r.abc}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Link
                    className="text-accent hover:underline"
                    to={`/product/${encodeURIComponent(r.productName)}`}
                  >
                    {r.productName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">{formatCurrency(r.revenue)}</td>
                <td className="px-3 py-2 text-right">{r.cumulativePct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function InsightsPanel({
  insights,
}: {
  insights: { id: string; kind: string; text: string }[]
}) {
  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <h3 className="mb-3 font-display text-base font-semibold text-ink">AI Insights</h3>
      <ul className="space-y-2">
        {insights.map((ins) => (
          <li
            key={ins.id}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm',
              ins.kind === 'positive' && 'border-success/30 bg-success/10',
              ins.kind === 'negative' && 'border-danger/30 bg-danger/10',
              ins.kind === 'anomaly' && 'border-warning/30 bg-warning/10',
              ins.kind === 'neutral' && 'border-border bg-black/[0.02] dark:bg-white/[0.03]',
            )}
          >
            {ins.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
