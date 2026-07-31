import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { DashboardFilters, DataCapabilities, SalesLine } from '@/types/sales'
import { loadAllSalesData } from '@/services/discover'
import { fetchCloverSalesCache, syncClover, type CloverCatalog } from '@/services/cloverApi'
import {
  aggregateByPeriod,
  aggregateCategories,
  aggregateProducts,
  buildInsights,
  computeKpis,
  dataExtent,
  filterLines,
  priorComparisonLines,
  resolveDateRange,
} from '@/utils/analytics'
import { rangeFullyCached } from '@/utils/timezone'

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
  /** Fetching a past date range from Clover so the filter can show data. */
  rangeLoading: boolean
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
  cachedDays: string[]
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
  const [rangeLoading, setRangeLoading] = useState(false)
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
  const [cachedDays, setCachedDays] = useState<string[]>([])
  const rangeFetchKey = useRef<string | null>(null)

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
      const days =
        data.cachedDays?.length
          ? data.cachedDays
          : [...new Set(data.lines.map((l) => l.orderDate))].sort()
      setCachedDays(days)
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

  /**
   * Date presets only filtered local cache before — past ranges looked empty.
   * When the selected window has days not yet cached, pull them from Clover.
   */
  useEffect(() => {
    if (loading) return
    if (source !== 'clover' && source !== 'mixed') return
    if (filters.datePreset === 'all') return
    if (filters.datePreset === 'custom' && (!filters.customStart || !filters.customEnd)) return

    const { start, end } = resolveDateRange(filters, extent.min, extent.max)
    if (!start || !end || start > end) return

    if (rangeFullyCached(start, end, cachedDays)) {
      rangeFetchKey.current = `${start}:${end}`
      return
    }

    const key = `${start}:${end}`
    let cancelled = false
    const delay = filters.datePreset === 'custom' ? 450 : 80
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return
        rangeFetchKey.current = key
        setRangeLoading(true)
        setError(null)
        try {
          await syncClover(start, end)
          if (cancelled) return
          const cache = await fetchCloverSalesCache()
          if (cancelled) return
          setLines(cache.lines)
          setCachedDays(
            cache.cachedDays.length
              ? cache.cachedDays
              : [...new Set(cache.lines.map((l) => l.orderDate))].sort(),
          )
          setCapabilities(detectCaps(cache.lines))
          setFromCache(false)
          setSource(cache.lines.length ? 'clover' : 'empty')
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e))
            rangeFetchKey.current = null
          }
        } finally {
          if (!cancelled) setRangeLoading(false)
        }
      })()
    }, delay)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    loading,
    source,
    filters.datePreset,
    filters.customStart,
    filters.customEnd,
    extent.min,
    extent.max,
    cachedDays,
  ])

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
      if (patch.categories) {
        if (!patch.categories.length) {
          // keep products
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
    rangeLoading,
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
    cachedDays,
    options,
    derived,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function detectCaps(lines: SalesLine[]): DataCapabilities {
  if (!lines.length) {
    return {
      hasHourly: false,
      hasDaily: false,
      hasCustomers: false,
      hasPayments: false,
      hasOrderIds: false,
      hasMultiStore: false,
      grain: 'monthly',
    }
  }
  const hasCustomers = lines.some((l) => Boolean(l.customer))
  const hasPayments = lines.some((l) => Boolean(l.paymentMethod))
  const hasOrderIds = lines.some((l) => Boolean(l.orderId))
  const stores = new Set(lines.map((l) => l.store))
  return {
    hasHourly: false,
    hasDaily: true,
    hasCustomers,
    hasPayments,
    hasOrderIds,
    hasMultiStore: stores.size > 1,
    grain: hasOrderIds ? 'transaction' : 'daily',
  }
}

export function useSales() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSales requires SalesProvider')
  return ctx
}
