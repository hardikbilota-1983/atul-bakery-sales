import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from 'recharts'
import { useMemo, useState } from 'react'
import type { CategoryAgg, PeriodPoint, ProductAgg, TrendGrain } from '@/types/sales'
import {
  aggregateByPeriod,
  movingAverageForecast,
  paretoData,
  yearOverYearMonthly,
} from '@/utils/analytics'
import type { SalesLine } from '@/types/sales'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

const COLORS = [
  '#0d9488',
  '#0369a1',
  '#7c3aed',
  '#db2777',
  '#d97706',
  '#059669',
  '#4f46e5',
  '#0891b2',
  '#ea580c',
  '#65a30d',
]

const tipStyle = {
  background: 'var(--glass)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  backdropFilter: 'blur(12px)',
  color: 'var(--ink)',
  fontSize: 12,
}

function Panel({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

export function RevenueTrendChart({
  lines,
  grain: controlledGrain,
}: {
  lines: SalesLine[]
  grain?: TrendGrain
}) {
  const [grain, setGrain] = useState<TrendGrain>(controlledGrain ?? 'monthly')
  const data = useMemo(() => aggregateByPeriod(lines, grain), [lines, grain])

  return (
    <Panel
      title="Revenue Trend"
      subtitle="Interactive period aggregation"
      actions={
        <div className="flex flex-wrap gap-1">
          {(['daily', 'weekly', 'monthly', 'yearly'] as TrendGrain[]).map((g) => (
            <Button
              key={g}
              size="sm"
              variant={grain === g ? 'default' : 'ghost'}
              onClick={() => setGrain(g)}
              className="capitalize"
            >
              {g}
            </Button>
          ))}
        </div>
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={(v) => formatCurrency(v, true)}
            />
            <Tooltip
              contentStyle={tipStyle}
              formatter={(v) => [formatCurrency(Number(v)), 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#0d9488"
              fill="url(#revFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

export function ProductBarChart({ products }: { products: ProductAgg[] }) {
  const [limit, setLimit] = useState<10 | 20 | 999>(10)
  const data = products.slice(0, limit).map((p) => ({
    name: p.productName.length > 22 ? p.productName.slice(0, 20) + '…' : p.productName,
    full: p.productName,
    revenue: p.revenue,
  }))

  return (
    <Panel
      title="Sales by Product"
      subtitle="Horizontal ranking"
      actions={
        <div className="flex gap-1">
          {([10, 20, 999] as const).map((n) => (
            <Button
              key={n}
              size="sm"
              variant={limit === n ? 'default' : 'ghost'}
              onClick={() => setLimit(n)}
            >
              {n === 999 ? 'All' : `Top ${n}`}
            </Button>
          ))}
        </div>
      }
    >
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={(v) => formatCurrency(v, true)}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: 'var(--muted)', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={tipStyle}
              formatter={(v) => [formatCurrency(Number(v)), 'Revenue']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
            />
            <Bar dataKey="revenue" radius={[0, 8, 8, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

export function CategoryDonut({ categories }: { categories: CategoryAgg[] }) {
  const [mode, setMode] = useState<'revenue' | 'quantity'>('revenue')
  const data = categories.map((c) => ({
    name: c.category,
    value: mode === 'revenue' ? c.revenue : c.quantity,
    revenue: c.revenue,
    quantity: c.quantity,
  }))

  return (
    <Panel
      title="Sales by Category"
      subtitle="Share of mix"
      actions={
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === 'revenue' ? 'default' : 'ghost'}
            onClick={() => setMode('revenue')}
          >
            Revenue
          </Button>
          <Button
            size="sm"
            variant={mode === 'quantity' ? 'default' : 'ghost'}
            onClick={() => setMode('quantity')}
          >
            Qty
          </Button>
        </div>
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tipStyle}
              formatter={(v, _n, item) => {
                const p = item?.payload as { revenue: number; quantity: number; name: string }
                return [
                  mode === 'revenue'
                    ? formatCurrency(Number(v))
                    : formatNumber(Number(v)),
                  p?.name,
                ]
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

export function MonthlyComparisonChart({ lines }: { lines: SalesLine[] }) {
  const data = useMemo(() => yearOverYearMonthly(lines), [lines])
  const hasPrev = data.some((d) => d.previous > 0)

  return (
    <Panel
      title="Monthly Comparison"
      subtitle={
        hasPrev
          ? `Year ${data[0]?.previousYear} vs ${data[0]?.currentYear}`
          : 'Add another year of reports for YoY bars'
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={(v) => formatCurrency(v, true)}
            />
            <Tooltip contentStyle={tipStyle} formatter={(v) => formatCurrency(Number(v))} />
            <Legend />
            {hasPrev && (
              <Bar
                dataKey="previous"
                name={String(data[0]?.previousYear ?? 'Prev')}
                fill="#94a3b8"
                radius={[6, 6, 0, 0]}
              />
            )}
            <Bar
              dataKey="current"
              name={String(data[0]?.currentYear ?? 'Current')}
              fill="#0d9488"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

export function ParetoChart({ products }: { products: ProductAgg[] }) {
  const data = useMemo(() => paretoData(products).slice(0, 25), [products])
  return (
    <Panel title="Pareto Analysis (80/20)" subtitle="Cumulative revenue contribution">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" hide />
            <YAxis
              yAxisId="l"
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={(v) => formatCurrency(v, true)}
            />
            <YAxis
              yAxisId="r"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip contentStyle={tipStyle} />
            <Bar yAxisId="l" dataKey="revenue" fill="#0369a1" radius={[4, 4, 0, 0]} />
            <Line
              yAxisId="r"
              type="monotone"
              dataKey="cumulativePct"
              stroke="#db2777"
              strokeWidth={2}
              dot={false}
              name="Cumulative %"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

export function ForecastChart({ monthly }: { monthly: PeriodPoint[] }) {
  const [ahead, setAhead] = useState(3)
  const data = useMemo(() => movingAverageForecast(monthly, ahead, 3), [monthly, ahead])

  return (
    <Panel
      title="Sales Forecast"
      subtitle="Moving average projection (monthly grain)"
      actions={
        <div className="flex gap-1">
          {[1, 3, 6].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={ahead === n ? 'default' : 'ghost'}
              onClick={() => setAhead(n)}
            >
              +{n} mo
            </Button>
          ))}
        </div>
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={(v) => formatCurrency(v, true)}
            />
            <Tooltip contentStyle={tipStyle} formatter={(v) => formatCurrency(Number(v))} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#0d9488"
              fill="#0d948833"
              strokeWidth={2}
              strokeDasharray={undefined}
              name="Revenue"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Forecast points are labeled F+n. Daily/weekly forecasts need transaction-level exports.
      </p>
    </Panel>
  )
}

export function CumulativeRevenueChart({ monthly }: { monthly: PeriodPoint[] }) {
  const data = useMemo(() => {
    let cum = 0
    return monthly.map((m) => {
      cum += m.revenue
      return { label: m.label, cumulative: cum }
    })
  }, [monthly])

  return (
    <Panel title="Cumulative Revenue" subtitle="Running total across periods">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={(v) => formatCurrency(v, true)}
            />
            <Tooltip contentStyle={tipStyle} formatter={(v) => formatCurrency(Number(v))} />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="#7c3aed"
              fill="#7c3aed33"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

export function RevenueTreemap({ categories }: { categories: CategoryAgg[] }) {
  const data = categories.map((c) => ({
    name: c.category,
    size: c.revenue,
  }))

  return (
    <Panel title="Revenue Distribution" subtitle="Category treemap">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            nameKey="name"
            stroke="var(--surface)"
            fill="#0d9488"
            content={<TreemapContent colors={COLORS} />}
          />
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

function TreemapContent(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  index?: number
  name?: string
  colors: string[]
}) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, name, colors } = props
  if (width < 40 || height < 28) return null
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={colors[index % colors.length]}
        opacity={0.85}
        rx={8}
      />
      <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={600}>
        {name}
      </text>
    </g>
  )
}

export function SeasonalityHeatmap({ lines }: { lines: SalesLine[] }) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const map = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lines) {
      const d = new Date(l.orderDate)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      m.set(key, (m.get(key) ?? 0) + l.revenue)
    }
    return m
  }, [lines])

  const years = [...new Set([...map.keys()].map((k) => Number(k.split('-')[0])))].sort()
  const max = Math.max(1, ...map.values())

  return (
    <Panel title="Seasonality" subtitle="Monthly heatmap by year">
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="mb-2 grid grid-cols-[48px_repeat(12,minmax(0,1fr))] gap-1 text-[10px] text-muted">
            <div />
            {months.map((m) => (
              <div key={m} className="text-center">
                {m}
              </div>
            ))}
          </div>
          {years.map((year) => (
            <div
              key={year}
              className="mb-1 grid grid-cols-[48px_repeat(12,minmax(0,1fr))] gap-1"
            >
              <div className="flex items-center text-xs text-muted">{year}</div>
              {months.map((_, mi) => {
                const v = map.get(`${year}-${mi}`) ?? 0
                const intensity = v / max
                return (
                  <div
                    key={mi}
                    title={`${months[mi]} ${year}: ${formatCurrency(v)}`}
                    className="h-9 rounded-md border border-border"
                    style={{
                      background:
                        v === 0
                          ? 'transparent'
                          : `color-mix(in srgb, var(--accent) ${Math.round(intensity * 90)}%, transparent)`,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Day-of-week / hour heatmaps need Orders exports (not available in monthly Items Reports).
      </p>
    </Panel>
  )
}
