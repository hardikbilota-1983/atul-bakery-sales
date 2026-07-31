import { useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  Minus,
  CalendarRange,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn, formatCurrency, formatNumber, formatPct } from '@/lib/utils'
import {
  aggregateByWeekAndCategory,
  aggregateByWeekAndItem,
  calendarWeeksInMonth,
  focusMonthKey,
  thisVsLastWeekScorecard,
  WEEKLY_BRAND_PRESETS,
} from '@/utils/analytics'
import type {
  CalendarWeek,
  CategoryWeekRow,
  DashboardFilters,
  ItemWeekRow,
  SalesLine,
  WeekScorecard,
} from '@/types/sales'
import { format, parseISO } from 'date-fns'

function money(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function moneyExact(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n)
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted">
        <Minus className="h-3 w-3" /> —
      </span>
    )
  }
  const up = pct > 0
  const flat = pct === 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium',
        flat && 'text-muted',
        up && 'text-success',
        !up && !flat && 'text-danger',
      )}
    >
      <Icon className="h-3 w-3" />
      {formatPct(pct)}
    </span>
  )
}

function Scorecard({ scorecard }: { scorecard: WeekScorecard }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          This week vs last week
        </p>
        <p className="text-[11px] text-muted">
          {scorecard.thisWeek.rangeLabel} vs {scorecard.lastWeek.rangeLabel}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {scorecard.metrics.map((m) => (
          <div
            key={m.key}
            className="rounded-xl border border-border bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.03]"
          >
            <p className="text-[11px] uppercase tracking-wide text-muted">{m.label}</p>
            <p className="mt-0.5 font-display text-lg font-semibold text-ink">
              {m.format === 'currency' ? money(m.thisValue) : formatNumber(m.thisValue)}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <DeltaBadge pct={m.deltaPct} />
              <span className="text-[10px] text-muted">
                was{' '}
                {m.format === 'currency' ? money(m.lastValue) : formatNumber(m.lastValue)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const CHART_COLORS = [
  'var(--accent)',
  '#0d9488',
  '#ca8a04',
  '#db2777',
  '#6366f1',
  '#ea580c',
  '#0891b2',
  '#65a30d',
]

function WeekCategoryChart({
  weeks,
  rows,
}: {
  weeks: CalendarWeek[]
  rows: CategoryWeekRow[]
}) {
  const topRows = rows.slice(0, 6)
  const data = weeks.map((w) => {
    const point: Record<string, string | number> = {
      week: w.label,
      range: w.rangeLabel,
    }
    for (const row of topRows) {
      const cell = row.cells.find((c) => c.weekId === w.id)
      point[row.key] = cell?.revenue ?? 0
    }
    return point
  })

  if (!topRows.length) return null

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="var(--muted)" />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--muted)"
            tickFormatter={(v) => formatCurrency(Number(v), true)}
          />
          <Tooltip
            formatter={(value, name) => [moneyExact(Number(value ?? 0)), String(name)]}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { week?: string; range?: string } | undefined
              return p?.range ? `${p.week} (${p.range})` : String(p?.week ?? '')
            }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {topRows.map((row, i) => (
            <Bar
              key={row.key}
              dataKey={row.key}
              name={row.label.replace(/^PCE - |^AB - |^H - /, '')}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function WeekGridTable({
  weeks,
  rows,
  selectedKey,
  onSelect,
  emptyLabel,
}: {
  weeks: CalendarWeek[]
  rows: (CategoryWeekRow | ItemWeekRow)[]
  selectedKey?: string | null
  onSelect?: (key: string) => void
  emptyLabel: string
}) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="sticky left-0 bg-[var(--surface)] px-2 py-2 font-medium">Name</th>
            {weeks.map((w) => (
              <th key={w.id} className="px-2 py-2 text-right font-medium">
                <div>{w.label}</div>
                <div className="font-normal text-[10px] opacity-80">{w.rangeLabel}</div>
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = selectedKey === row.key
            return (
              <tr
                key={row.key}
                className={cn(
                  'border-b border-border/60 transition',
                  onSelect && 'cursor-pointer hover:bg-accent/5',
                  active && 'bg-accent/10',
                )}
                onClick={() => onSelect?.(row.key)}
              >
                <td className="sticky left-0 bg-[var(--surface)] px-2 py-2 font-medium text-ink">
                  <span className="line-clamp-2" title={row.label}>
                    {row.label}
                  </span>
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.weekId} className="px-2 py-2 text-right align-top">
                    <div className="tabular-nums text-ink">{moneyExact(cell.revenue)}</div>
                    <div className="text-[10px] text-muted">
                      {formatNumber(cell.quantity, 1)} sold
                    </div>
                    <DeltaBadge pct={cell.wowPct} />
                  </td>
                ))}
                <td className="px-2 py-2 text-right align-top font-semibold tabular-nums text-ink">
                  {money(row.totalRevenue)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type Props = {
  lines: SalesLine[]
  filters: DashboardFilters
  dataMin: string
  dataMax: string
}

export function WeeklyPerformance({ lines, filters, dataMin, dataMax }: Props) {
  const [presetId, setPresetId] = useState('watch')
  const [drillCategory, setDrillCategory] = useState<string | null>(null)

  const monthKey = useMemo(
    () => focusMonthKey(filters, dataMin, dataMax),
    [filters, dataMin, dataMax],
  )
  const monthLabel = useMemo(() => {
    try {
      return format(parseISO(`${monthKey}-01`), 'MMMM yyyy')
    } catch {
      return monthKey
    }
  }, [monthKey])

  const weeks = useMemo(() => calendarWeeksInMonth(monthKey), [monthKey])
  const preset =
    WEEKLY_BRAND_PRESETS.find((p) => p.id === presetId) ?? WEEKLY_BRAND_PRESETS[0]

  const scorecard = useMemo(() => thisVsLastWeekScorecard(lines), [lines])

  const categoryRows = useMemo(
    () => aggregateByWeekAndCategory(lines, weeks, preset.categories),
    [lines, weeks, preset.categories],
  )

  const itemRows = useMemo(() => {
    if (!drillCategory) return []
    return aggregateByWeekAndItem(lines, weeks, drillCategory, 8)
  }, [lines, weeks, drillCategory])

  return (
    <section className="glass rounded-2xl p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <CalendarRange className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Weekly Performance</h2>
            <p className="text-[11px] text-muted">
              Calendar weeks in {monthLabel} · Mon–Sun (Eastern). Select This Month in filters for
              full coverage.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WEEKLY_BRAND_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPresetId(p.id)
                setDrillCategory(null)
              }}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-[11px] transition',
                presetId === p.id
                  ? 'bg-accent text-white'
                  : 'bg-black/5 text-ink hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Scorecard scorecard={scorecard} />

      <div className="mt-5 border-t border-border pt-4">
        {drillCategory ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-accent hover:bg-accent/10"
              onClick={() => setDrillCategory(null)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Categories
            </button>
            <h3 className="text-sm font-semibold text-ink">Top items · {drillCategory}</h3>
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Categories by week · {preset.label}</h3>
            <p className="text-[11px] text-muted">Click a row to see top items</p>
          </div>
        )}

        {!drillCategory && <WeekCategoryChart weeks={weeks} rows={categoryRows} />}

        <div className={cn(!drillCategory && categoryRows.length > 0 && 'mt-4')}>
          {drillCategory ? (
            <WeekGridTable
              weeks={weeks}
              rows={itemRows}
              emptyLabel="No item sales in this category for these weeks."
            />
          ) : (
            <WeekGridTable
              weeks={weeks}
              rows={categoryRows}
              selectedKey={drillCategory}
              onSelect={(key) => setDrillCategory(key)}
              emptyLabel="No watched-category sales in this month yet. Choose This Month and wait for Clover sync."
            />
          )}
        </div>
      </div>
    </section>
  )
}
