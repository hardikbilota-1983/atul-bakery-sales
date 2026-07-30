import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ProductAgg } from '@/types/sales'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

export function ProductCompare({ products }: { products: ProductAgg[] }) {
  const [selected, setSelected] = useState<string[]>(() =>
    products.slice(0, 3).map((p) => p.productName),
  )

  const rows = useMemo(
    () => products.filter((p) => selected.includes(p.productName)),
    [products, selected],
  )

  const chartData = rows.map((p) => ({
    name: p.productName.length > 16 ? p.productName.slice(0, 14) + '…' : p.productName,
    revenue: p.revenue,
    quantity: p.quantity,
    profit: p.profit,
    orders: p.orders,
  }))

  const toggle = (name: string) => {
    setSelected((s) =>
      s.includes(name) ? s.filter((x) => x !== name) : s.length >= 6 ? s : [...s, name],
    )
  }

  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <h3 className="font-display text-base font-semibold text-ink">Product Comparison</h3>
      <p className="mb-3 text-xs text-muted">Select up to 6 products</p>
      <div className="mb-4 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {products.slice(0, 40).map((p) => {
          const on = selected.includes(p.productName)
          return (
            <Button
              key={p.productName}
              size="sm"
              variant={on ? 'default' : 'ghost'}
              onClick={() => toggle(p.productName)}
            >
              {p.productName}
            </Button>
          )
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Legend />
              <Bar dataKey="revenue" fill="#0d9488" name="Revenue" radius={[6, 6, 0, 0]} />
              <Bar dataKey="profit" fill="#0369a1" name="Profit" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase text-muted dark:bg-white/[0.03]">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Profit</th>
                <th className="px-3 py-2 text-right">Growth</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.productName} className="border-t border-border/70">
                  <td className="px-3 py-2">{p.productName}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(p.revenue)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(p.quantity)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(p.orders)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(p.profit)}</td>
                  <td className="px-3 py-2 text-right">
                    {p.growthPct == null ? '—' : `${p.growthPct.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="quantity" stroke="#db2777" name="Quantity" />
            <Line type="monotone" dataKey="orders" stroke="#7c3aed" name="Orders" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
