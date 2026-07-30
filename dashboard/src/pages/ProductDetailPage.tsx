import { Link, useParams } from 'react-router-dom'
import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowLeft } from 'lucide-react'
import { useSales } from '@/context/SalesContext'
import { aggregateByPeriod, aggregateProducts } from '@/utils/analytics'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

export function ProductDetailPage() {
  const { name = '' } = useParams()
  const productName = decodeURIComponent(name)
  const { filtered, lines } = useSales()

  const productLines = useMemo(
    () => filtered.filter((l) => l.productName === productName),
    [filtered, productName],
  )

  const monthly = useMemo(() => aggregateByPeriod(productLines, 'monthly'), [productLines])
  const allProducts = useMemo(() => aggregateProducts(filtered), [filtered])
  const agg = allProducts.find((p) => p.productName === productName)
  const catProducts = allProducts.filter((p) => p.category === agg?.category)
  const catRank = catProducts.findIndex((p) => p.productName === productName) + 1
  const totalRev = filtered.reduce((s, l) => s + l.revenue, 0) || 1

  // Full history for this product (ignore filters date for trend context)
  const history = useMemo(
    () => aggregateByPeriod(
      lines.filter((l) => l.productName === productName),
      'monthly',
    ),
    [lines, productName],
  )

  if (!agg && !productLines.length) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Link to="/">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <div className="glass mt-4 rounded-2xl p-8 text-center">
          <p className="font-display text-lg">Product not found in current filters</p>
        </div>
      </div>
    )
  }

  const revenue = productLines.reduce((s, l) => s + l.revenue, 0)
  const qty = productLines.reduce((s, l) => s + l.quantity, 0)
  const profit = productLines.reduce((s, l) => s + l.profit, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Button>
        </Link>
        <Link to="/compare">
          <Button variant="secondary">Compare products</Button>
        </Link>
      </div>

      <header className="glass rounded-2xl p-5">
        <p className="text-xs uppercase tracking-wide text-accent">{agg?.category ?? '—'}</p>
        <h1 className="font-display text-2xl font-semibold text-ink md:text-3xl">{productName}</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Revenue" value={formatCurrency(revenue)} />
          <Stat label="Quantity" value={formatNumber(qty)} />
          <Stat label="Orders (lines)" value={formatNumber(productLines.length)} />
          <Stat label="Avg price" value={formatCurrency(qty ? revenue / qty : 0)} />
          <Stat label="Contribution" value={`${((revenue / totalRev) * 100).toFixed(1)}%`} />
        </div>
        <p className="mt-3 text-sm text-muted">
          Category rank: #{catRank || '—'} of {catProducts.length} · Profit{' '}
          {formatCurrency(profit)}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-2xl p-4">
          <h3 className="mb-3 font-display font-semibold">Monthly trend (filtered)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Area dataKey="revenue" stroke="#0d9488" fill="#0d948833" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <h3 className="mb-3 font-display font-semibold">Full history</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="revenue" fill="#0369a1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <h3 className="mb-3 font-display font-semibold">Quantity by month</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <Tooltip />
              <Bar dataKey="quantity" fill="#db2777" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white/30 p-3 dark:bg-black/20">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="font-semibold text-ink">{value}</p>
    </div>
  )
}
