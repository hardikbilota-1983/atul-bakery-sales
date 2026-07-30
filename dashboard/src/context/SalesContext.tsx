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
import type { CloverCatalog } from '@/services/cloverApi'
import {
  aggregateByPeriod,
  aggregateCategories,
  aggregateProducts,
  buildInsights,
  computeKpis,
  dataExtent,
  filterLines,
  priorComparisonLines,
} from '@/utils/analytics'

const defaultFilters: DashboardFilters = {
  datePreset: 'today',
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
  catalog: CloverCatalog | null
  fromCache: boolean
  dayKey: string | null
  options: {
    products: string[]
    categories: string[]
    stores: string[]
    paymentMethods: string[]
    customers: string[]
  }
  derived: ReturnType<typeof buildDerived>
}

function buildDerived(
  all: SalesLine[],
  filtered: SalesLine[],
  filters: DashboardFilters,
  dataMin: string,
  dataMax: string,
) {
  const { lines: prev, priorSameTime } = priorComparisonLines(
    all,
    filtered,
    filters,
    dataMin,
    dataMax,
  )
  const productsFull = aggregateProducts(filtered, prev)
  const products = productsFull
  const categories = aggregateCategories(filtered)
  const monthly = aggregateByPeriod(filtered, 'monthly')
  const kpis = computeKpis(filtered, prev, { priorSameTime })
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
  const [catalog, setCatalog] = useState<CloverCatalog | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [dayKey, setDayKey] = useState<string | null>(null)

  const reload = useCallback(async (extra?: File[]) => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadAllSalesData(extra)
      setLines(data.lines)
      setFiles(data.files)
      setCapabilities(data.capabilities)
      setSource(data.source)
      setCatalog(data.catalog)
      setFromCache(Boolean(data.fromCache))
      setDayKey(data.dayKey ?? null)
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
    const categories =
      catalog?.categories?.length
        ? catalog.categories
        : [...new Set(lines.map((l) => l.category))].sort()

    let products: string[]
    if (filters.categories.length && catalog?.productsByCategory) {
      const set = new Set<string>()
      for (const cat of filters.categories) {
        for (const name of catalog.productsByCategory[cat] ?? []) set.add(name)
      }
      products = [...set].sort((a, b) => a.localeCompare(b))
    } else if (filters.categories.length) {
      products = [
        ...new Set(
          lines
            .filter((l) => filters.categories.includes(l.category))
            .map((l) => l.productName),
        ),
      ].sort()
    } else if (catalog?.productsByCategory) {
      products = [
        ...new Set(Object.values(catalog.productsByCategory).flat()),
      ].sort((a, b) => a.localeCompare(b))
    } else {
      products = [...new Set(lines.map((l) => l.productName))].sort()
    }

    const stores = [...new Set(lines.map((l) => l.store))].sort()
    const paymentMethods = [
      ...new Set(lines.map((l) => l.paymentMethod).filter(Boolean) as string[]),
    ].sort()
    const customers = [
      ...new Set(lines.map((l) => l.customer).filter(Boolean) as string[]),
    ].sort()
    return { products, categories, stores, paymentMethods, customers }
  }, [lines, catalog, filters.categories])

  const derived = useMemo(
    () => buildDerived(lines, filtered, filters, extent.min, extent.max),
    [lines, filtered, filters, extent],
  )

  const setFilters = useCallback((patch: Partial<DashboardFilters>) => {
    setFiltersState((f) => {
      const next = { ...f, ...patch }
      // Drop product picks that are outside the newly selected categories
      if (patch.categories) {
        if (!patch.categories.length) {
          // keep products as-is when clearing categories
        } else {
          const allowed = new Set<string>()
          const byCat = catalog?.productsByCategory
          if (byCat) {
            for (const cat of patch.categories) {
              for (const name of byCat[cat] ?? []) allowed.add(name)
            }
          } else {
            for (const l of lines) {
              if (patch.categories.includes(l.category)) allowed.add(l.productName)
            }
          }
          next.products = (patch.products ?? f.products).filter((p) => allowed.has(p))
        }
      }
      return next
    })
  }, [catalog, lines])

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
    catalog,
    fromCache,
    dayKey,
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
