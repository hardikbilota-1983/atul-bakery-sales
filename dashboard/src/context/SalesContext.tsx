import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { DashboardFilters, DataCapabilities, SalesLine } from '@/types/sales'
import { loadAllSalesData } from '@/services/discover'
import {
  aggregateByPeriod,
  aggregateCategories,
  aggregateProducts,
  buildInsights,
  computeKpis,
  currentGrowthLines,
  dataExtent,
  filterLines,
  previousPeriodLines,
} from '@/utils/analytics'

const defaultFilters: DashboardFilters = {
  datePreset: 'all',
  customStart: null,
  customEnd: null,
  products: [],
  categories: [],
  stores: [],
  paymentMethods: [],
  customers: [],
  search: '',
}

type SalesCtx = {
  loading: boolean
  error: string | null
  files: string[]
  lines: SalesLine[]
  filtered: SalesLine[]
  filters: DashboardFilters
  setFilters: (patch: Partial<DashboardFilters>) => void
  resetFilters: () => void
  capabilities: DataCapabilities
  reload: (extra?: File[]) => Promise<void>
  extent: { min: string; max: string }
  source: 'clover' | 'csv' | 'mixed' | 'empty'
  options: {
    products: string[]
    categories: string[]
    stores: string[]
    paymentMethods: string[]
    customers: string[]
  }
  derived: ReturnType<typeof buildDerived>
}

function buildDerived(all: SalesLine[], filtered: SalesLine[]) {
  const prev = previousPeriodLines(all, filtered)
  const growthCurrent = currentGrowthLines(all, filtered)
  const productsFull = aggregateProducts(filtered)
  const withGrowth = aggregateProducts(growthCurrent, prev)
  const growthMap = new Map(withGrowth.map((p) => [p.productName, p.growthPct]))
  const products = productsFull.map((p) => ({
    ...p,
    growthPct: growthMap.get(p.productName) ?? null,
  }))
  const categories = aggregateCategories(filtered)
  const monthly = aggregateByPeriod(filtered, 'monthly')
  const base = computeKpis(filtered, [])
  const growth = computeKpis(growthCurrent, prev)
  const kpis = {
    ...base,
    revenueGrowthPct: growth.revenueGrowthPct,
    quantityGrowthPct: growth.quantityGrowthPct,
  }
  const insights = buildInsights(filtered, kpis, products, categories, monthly)
  return { products, categories, monthly, kpis, insights, prev }
}

const Ctx = createContext<SalesCtx | null>(null)

export function SalesProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<SalesLine[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [capabilities, setCapabilities] = useState<DataCapabilities>({
    hasHourly: false,
    hasDaily: false,
    hasCustomers: false,
    hasPayments: false,
    hasOrderIds: false,
    hasMultiStore: false,
    grain: 'monthly',
  })
  const [filters, setFiltersState] = useState<DashboardFilters>(defaultFilters)
  const [source, setSource] = useState<'clover' | 'csv' | 'mixed' | 'empty'>('empty')

  const reload = useCallback(async (extra?: File[]) => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadAllSalesData(extra)
      setLines(data.lines)
      setFiles(data.files)
      setCapabilities(data.capabilities)
      setSource(data.source)
      if (data.errors.length && !data.lines.length) {
        setError(data.errors.join('; '))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const extent = useMemo(() => dataExtent(lines), [lines])
  const filtered = useMemo(
    () => filterLines(lines, filters, extent.min, extent.max),
    [lines, filters, extent],
  )

  const options = useMemo(() => {
    const products = [...new Set(lines.map((l) => l.productName))].sort()
    const categories = [...new Set(lines.map((l) => l.category))].sort()
    const stores = [...new Set(lines.map((l) => l.store))].sort()
    const paymentMethods = [
      ...new Set(lines.map((l) => l.paymentMethod).filter(Boolean) as string[]),
    ].sort()
    const customers = [
      ...new Set(lines.map((l) => l.customer).filter(Boolean) as string[]),
    ].sort()
    return { products, categories, stores, paymentMethods, customers }
  }, [lines])

  const derived = useMemo(() => buildDerived(lines, filtered), [lines, filtered])

  const setFilters = useCallback((patch: Partial<DashboardFilters>) => {
    setFiltersState((f) => ({ ...f, ...patch }))
  }, [])

  const resetFilters = useCallback(() => setFiltersState(defaultFilters), [])

  const value: SalesCtx = {
    loading,
    error,
    files,
    lines,
    filtered,
    filters,
    setFilters,
    resetFilters,
    capabilities,
    reload,
    extent,
    source,
    options,
    derived,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSales() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSales requires SalesProvider')
  return ctx
}
