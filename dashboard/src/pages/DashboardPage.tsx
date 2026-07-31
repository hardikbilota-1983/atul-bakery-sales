import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
  Receipt,
  Menu,
  Moon,
  Sun,
  Download,
  GitCompare,
  RefreshCw,
  UtensilsCrossed,
  Soup,
  IceCream2,
  LogOut,
} from 'lucide-react'
import { useSales } from '@/context/SalesContext'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { FilterSidebar } from '@/components/FilterSidebar'
import { KpiCard } from '@/components/KpiCard'
import { CategoryGroupCard, Top3SellersCard } from '@/components/GroupKpiCards'
import { DataTable } from '@/components/DataTable'
import { AbcTable, ProductRankCards } from '@/components/ProductCards'
import {
  CategoryDonut,
  CumulativeRevenueChart,
  ForecastChart,
  MonthlyComparisonChart,
  ParetoChart,
  ProductBarChart,
  RevenueTrendChart,
  RevenueTreemap,
  SeasonalityHeatmap,
} from '@/components/charts/Charts'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatNumber } from '@/lib/utils'
import {
  abcClassify,
  categoryGroupRevenue,
  HARVYS_ICE_CREAM_CATEGORIES,
  PCE_CHENNAI_CATEGORIES,
  PCE_PUNJAB_CATEGORIES,
  topProductsByRevenue,
  topSellersByWatchCategories,
} from '@/utils/analytics'
import { exportCsv, exportElementPdf, exportElementPng, exportExcel } from '@/utils/export'
import { ProductCompare } from '@/components/ProductCompare'
import { InsightsSidePanel, useInsightsOpen } from '@/components/InsightsSidePanel'
import { WeeklyPerformance } from '@/components/WeeklyPerformance'
import { HelpTip } from '@/components/ui/HelpTip'

export function DashboardPage() {
  const {
    loading,
    rangeLoading,
    error,
    lines,
    filtered,
    filters,
    extent,
    derived,
    capabilities,
    reload,
    source,
  } = useSales()
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [panelOpen, setPanelOpen] = useInsightsOpen(true)
  const exportRef = useRef<HTMLDivElement>(null)
  const { kpis, products, categories, monthly, insights } = derived

  const abc = useMemo(() => abcClassify(products), [products])
  const categoryLeaders = useMemo(() => topSellersByWatchCategories(filtered), [filtered])
  const top3 = useMemo(() => topProductsByRevenue(filtered, 3), [filtered])
  const chennai = useMemo(
    () => categoryGroupRevenue(filtered, PCE_CHENNAI_CATEGORIES),
    [filtered],
  )
  const punjab = useMemo(
    () => categoryGroupRevenue(filtered, PCE_PUNJAB_CATEGORIES),
    [filtered],
  )
  const harvys = useMemo(
    () => categoryGroupRevenue(filtered, HARVYS_ICE_CREAM_CATEGORIES),
    [filtered],
  )
  const top = products.slice(0, 6)
  const bottom = [...products].reverse().slice(0, 6)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="glass max-w-md rounded-2xl p-8 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="font-display text-lg font-semibold">Loading sales reports…</p>
          <p className="mt-1 text-sm text-muted">Auto-detecting Clover Items Reports</p>
        </div>
      </div>
    )
  }

  if (error && !filtered.length) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="glass max-w-lg rounded-2xl p-8 text-center">
          <p className="font-display text-lg font-semibold text-danger">Could not load data</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <Button className="mt-4" onClick={() => void reload()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1800px] gap-4 p-3 md:p-5">
      <div className="hidden w-72 shrink-0 lg:block">
        <div className="sticky top-5 h-[calc(100vh-2.5rem)]">
          <FilterSidebar />
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close filters"
          />
          <div className="absolute bottom-0 left-0 top-0 w-[min(100%,20rem)] p-3">
            <FilterSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 space-y-4 pb-10">
        <header className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                Atul Bakery · Hillside
              </p>
              <h1 className="font-display text-xl font-semibold text-ink md:text-2xl">
                Sales Analytics
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
              Grain: {capabilities.grain}
            </span>
            <span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-muted dark:bg-white/5">
              Source: {source}
            </span>
            <Button size="sm" variant="secondary" onClick={() => setShowCompare((v) => !v)}>
              <GitCompare className="h-4 w-4" /> Compare
            </Button>
            <details className="relative">
              <summary className="list-none">
                <Button size="sm" variant="secondary" asChild>
                  <span>
                    <Download className="h-4 w-4" /> Export
                  </span>
                </Button>
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-border bg-[var(--surface)] p-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={() => exportCsv(filtered)}
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={() => exportExcel(filtered)}
                >
                  Excel
                </button>
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={() => {
                    if (exportRef.current) void exportElementPng(exportRef.current)
                  }}
                >
                  PNG
                </button>
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={() => {
                    if (exportRef.current) void exportElementPdf(exportRef.current)
                  }}
                >
                  PDF
                </button>
              </div>
            </details>
            <Button size="icon" variant="ghost" onClick={toggle} title="Toggle theme">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              title={user?.displayName || 'Sign out'}
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
            <HelpTip
              title="Top Sellers panel"
              content="Shows or hides the right panel with top 3 items in each watched food category for the current filters."
            >
              <Button
                size="sm"
                variant={panelOpen ? 'secondary' : 'outline'}
                className="hidden lg:inline-flex"
                onClick={() => setPanelOpen(!panelOpen)}
              >
                Top Sellers
              </Button>
            </HelpTip>
            <Link to="/compare">
              <Button size="sm" variant="outline">
                Full compare
              </Button>
            </Link>
          </div>
        </header>

        <div ref={exportRef} className="space-y-4">
          {rangeLoading && (
            <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-accent">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Loading selected date range from Clover… dashboard will update when ready.
            </div>
          )}
          {error && (
            <div className="glass rounded-2xl border border-danger/30 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Net Sales"
              value={kpis.totalRevenue}
              format={(n) => formatCurrency(n)}
              icon={DollarSign}
              growth={kpis.revenueGrowthPct}
              spark={kpis.sparkRevenue}
              priorLabel={kpis.priorSameTime ? 'vs prior (same time)' : 'vs prior'}
              help="Total paid sales in the current date filter. Change the date filter on the left to compare another day or period."
              delay={0}
            />
            <KpiCard
              title="Paid Orders"
              value={kpis.paidOrders}
              format={(n) => formatNumber(n)}
              icon={Receipt}
              growth={kpis.paidOrdersGrowthPct}
              spark={kpis.sparkOrders}
              priorLabel={kpis.priorSameTime ? 'vs prior (same time)' : 'vs prior'}
              help="Count of unique paid Clover orders. Open tickets with no payment are excluded."
              delay={0.05}
            />
            <KpiCard
              title="Average Order Size"
              value={kpis.averageOrderSize}
              format={(n) => formatCurrency(n)}
              icon={ShoppingCart}
              growth={kpis.averageOrderSizeGrowthPct}
              spark={kpis.sparkAov}
              priorLabel={kpis.priorSameTime ? 'vs prior (same time)' : 'vs prior'}
              help="Net sales ÷ paid orders. Use this to see if ticket size is rising or falling vs the prior period."
              delay={0.1}
            />
            <KpiCard
              title="Items Sold"
              value={kpis.totalQuantity}
              format={(n) => formatNumber(n)}
              icon={Package}
              growth={kpis.quantityGrowthPct}
              spark={kpis.sparkQuantity}
              priorLabel={kpis.priorSameTime ? 'vs prior (same time)' : 'vs prior'}
              help="Total quantity of line items sold in the selected date range."
              delay={0.15}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Top3SellersCard
              title="Top 3 Highest Selling"
              items={top3.items}
              totalRevenue={top3.totalRevenue}
              icon={TrendingUp}
              delay={0.2}
            />
            <CategoryGroupCard
              title="PCE - Chennai"
              group={chennai}
              icon={UtensilsCrossed}
              delay={0.25}
              help="Combined revenue for Dosas, Idli, South Indian snacks, and Specialty Dosas. Lines below show each category."
            />
            <CategoryGroupCard
              title="PCE - Punjab"
              group={punjab}
              icon={Soup}
              delay={0.3}
              help="Combined revenue for Chaaps, Momos, and Wraps. Lines below show each category."
            />
            <CategoryGroupCard
              title="Harvy's Icecream"
              group={harvys}
              icon={IceCream2}
              delay={0.35}
              help="Combined revenue for Deluxe, Shakes, Premium, and Traditional ice cream. Lines below show each category."
            />
          </div>

          <WeeklyPerformance
            lines={lines}
            filters={filters}
            dataMin={extent.min}
            dataMax={extent.max}
          />

          {showCompare && <ProductCompare products={products} />}

          <div className="grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <RevenueTrendChart lines={filtered} />
            </div>
            <div className="xl:col-span-2">
              <CategoryDonut categories={categories} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ProductBarChart products={products} />
            <MonthlyComparisonChart lines={filtered} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ParetoChart products={products} />
            <ForecastChart monthly={monthly} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <CumulativeRevenueChart monthly={monthly} />
            <RevenueTreemap categories={categories} />
          </div>

          <SeasonalityHeatmap lines={filtered} />

          <ProductRankCards title="Top Performing Products" products={top} tone="top" />
          <ProductRankCards title="Bottom Performing Products" products={bottom} tone="bottom" />

          <AbcTable rows={abc} />

          <DataTable lines={filtered} />
        </div>
      </main>

      <InsightsSidePanel
        insights={insights}
        categoryLeaders={categoryLeaders}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  )
}
