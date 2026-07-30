import { Search, RotateCcw, Upload, X } from 'lucide-react'
import { useSales } from '@/context/SalesContext'
import { DATE_PRESET_LABELS } from '@/utils/analytics'
import type { DatePreset } from '@/types/sales'
import { Button } from '@/components/ui/Button'
import { CloverSyncPanel } from '@/components/CloverSyncPanel'
import { cn } from '@/lib/utils'

function MultiSelect({
  label,
  options,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className={cn('space-y-1.5', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-muted">{label}</label>
        {value.length > 0 && (
          <button
            type="button"
            className="text-[10px] text-accent"
            onClick={() => onChange([])}
            disabled={disabled}
          >
            Clear
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
      <select
        multiple
        disabled={disabled}
        className="h-24 w-full rounded-xl border border-border bg-white/40 px-2 py-1.5 text-xs text-ink outline-none focus:ring-2 focus:ring-accent/30 dark:bg-black/20"
        value={value}
        onChange={(e) =>
          onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
        }
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

export function FilterSidebar({ onClose }: { onClose?: () => void }) {
  const {
    filters,
    setFilters,
    resetFilters,
    options,
    capabilities,
    reload,
    extent,
    fromCache,
    dayKey,
    catalog,
  } = useSales()

  return (
    <aside className="glass flex h-full flex-col rounded-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Filters</h2>
          <p className="text-[11px] text-muted">
            {fromCache ? 'Cached' : 'Live'} · {dayKey ?? extent.min}
            {extent.min !== extent.max ? ` → ${extent.max}` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={resetFilters} title="Reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
          {onClose && (
            <Button size="icon" variant="ghost" onClick={onClose} className="lg:hidden">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          placeholder="Search products…"
          className="h-10 w-full rounded-xl border border-border bg-white/40 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent/30 dark:bg-black/20"
        />
      </div>

      <div className="mb-4">
        <CloverSyncPanel onSynced={() => reload()} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Date Range
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilters({ datePreset: p })}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-left text-[11px] transition',
                  filters.datePreset === p
                    ? 'bg-accent text-white'
                    : 'bg-black/5 text-ink hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10',
                )}
              >
                {DATE_PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          {filters.datePreset === 'custom' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="date"
                className="h-9 rounded-lg border border-border bg-transparent px-2 text-xs"
                value={filters.customStart ?? ''}
                onChange={(e) => setFilters({ customStart: e.target.value })}
              />
              <input
                type="date"
                className="h-9 rounded-lg border border-border bg-transparent px-2 text-xs"
                value={filters.customEnd ?? ''}
                onChange={(e) => setFilters({ customEnd: e.target.value })}
              />
            </div>
          )}
        </div>

        <MultiSelect
          label="Category"
          options={options.categories}
          value={filters.categories}
          onChange={(categories) => setFilters({ categories })}
          hint={
            catalog
              ? `${catalog.itemCount} products in catalog`
              : undefined
          }
        />
        <MultiSelect
          label="Product"
          options={options.products}
          value={filters.products}
          onChange={(products) => setFilters({ products })}
          hint={
            filters.categories.length
              ? `Showing products in ${filters.categories.length} categor${filters.categories.length === 1 ? 'y' : 'ies'}`
              : 'Select categories to narrow products'
          }
        />
        <MultiSelect
          label="Store"
          options={options.stores}
          value={filters.stores}
          onChange={(stores) => setFilters({ stores })}
        />
        <MultiSelect
          label="Payment Method"
          options={options.paymentMethods}
          value={filters.paymentMethods}
          onChange={(paymentMethods) => setFilters({ paymentMethods })}
          disabled={!capabilities.hasPayments}
          hint={!capabilities.hasPayments ? 'Available after Clover sync' : undefined}
        />
        <MultiSelect
          label="Customer"
          options={options.customers}
          value={filters.customers}
          onChange={(customers) => setFilters({ customers })}
          disabled={!capabilities.hasCustomers}
          hint={!capabilities.hasCustomers ? 'Only when customers are on orders' : undefined}
        />

        <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted hover:border-accent/40">
          <span className="inline-flex items-center gap-2 font-medium text-ink">
            <Upload className="h-4 w-4 text-accent" />
            Optional CSV upload
          </span>
          <span className="text-[10px]">CSV is not loaded by default — upload only if needed.</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.json,.jsonl"
            multiple
            className="text-[11px]"
            onChange={(e) => {
              const list = e.target.files
              if (list?.length) void reload(Array.from(list))
            }}
          />
        </label>
      </div>
    </aside>
  )
}
