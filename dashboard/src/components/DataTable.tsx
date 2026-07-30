import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { SalesLine } from '@/types/sales'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

type Col = keyof Pick<
  SalesLine,
  | 'orderDate'
  | 'productName'
  | 'category'
  | 'quantity'
  | 'revenue'
  | 'profit'
  | 'discounts'
  | 'avgUnitPrice'
  | 'store'
>

const ALL_COLS: { key: Col; label: string }[] = [
  { key: 'orderDate', label: 'Date' },
  { key: 'productName', label: 'Product' },
  { key: 'category', label: 'Category' },
  { key: 'quantity', label: 'Qty' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'profit', label: 'Profit' },
  { key: 'discounts', label: 'Discounts' },
  { key: 'avgUnitPrice', label: 'Avg Price' },
  { key: 'store', label: 'Store' },
]

export function DataTable({ lines }: { lines: SalesLine[] }) {
  const [sortKey, setSortKey] = useState<Col>('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState<Record<Col, boolean>>(() =>
    Object.fromEntries(ALL_COLS.map((c) => [c.key, true])) as Record<Col, boolean>,
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = lines
    if (q) {
      rows = rows.filter(
        (r) =>
          r.productName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.store.toLowerCase().includes(q),
      )
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
    return rows
  }, [lines, query, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const cols = ALL_COLS.filter((c) => visible[c.key])

  const toggleSort = (key: Col) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const renderCell = (row: SalesLine, key: Col) => {
    const v = row[key]
    if (key === 'revenue' || key === 'profit' || key === 'discounts' || key === 'avgUnitPrice') {
      return formatCurrency(Number(v))
    }
    if (key === 'quantity') return formatNumber(Number(v))
    return String(v)
  }

  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">Sales Data</h3>
          <p className="text-xs text-muted">{filtered.length.toLocaleString()} rows</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="Filter table…"
            className="h-9 rounded-xl border border-border bg-white/40 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30 dark:bg-black/20"
          />
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-xl border border-border px-3 py-2 text-xs">
              Columns
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-border bg-[var(--surface)] p-2 shadow-lg">
              {ALL_COLS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 px-1 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={visible[c.key]}
                    onChange={(e) =>
                      setVisible((v) => ({ ...v, [c.key]: e.target.checked }))
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </details>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-muted dark:bg-white/[0.03]">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="px-3 py-2.5 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-ink"
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                    {sortKey !== c.key ? (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    ) : sortDir === 'asc' ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={`${row.productName}-${row.orderDate}-${i}`}
                className={cn(
                  'border-t border-border/70 transition hover:bg-accent/5',
                  i % 2 === 1 && 'bg-black/[0.015] dark:bg-white/[0.015]',
                )}
              >
                {cols.map((c) => (
                  <td key={c.key} className="max-w-[220px] truncate px-3 py-2 text-ink">
                    {renderCell(row, c.key)}
                  </td>
                ))}
              </tr>
            ))}
            {!pageRows.length && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-10 text-center text-muted">
                  No rows match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Rows per page</span>
          <select
            className="rounded-lg border border-border bg-transparent px-2 py-1"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(0)
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </Button>
          <span className="text-xs text-muted">
            {page + 1} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
