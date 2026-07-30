export type SalesLine = {
  orderDate: string // ISO date (period start)
  periodEnd: string // ISO date
  productName: string
  category: string
  quantity: number
  revenue: number // Net Sales
  grossSales: number
  discounts: number
  refunds: number
  refundedQty: number
  cogs: number
  profit: number
  avgUnitPrice: number
  pctNetSales: number
  sourceFile: string
  store: string
  paymentMethod?: string
  customer?: string
  orderId?: string
}

export type SalesModifier = {
  productName: string
  category: string
  modifierName: string
  sold: number
  amount: number
  orderDate: string
  sourceFile: string
}

export type DatePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'prevMonth'
  | 'thisYear'
  | 'custom'

export type TrendGrain = 'daily' | 'weekly' | 'monthly' | 'yearly'

export type ProductAgg = {
  productName: string
  category: string
  revenue: number
  quantity: number
  profit: number
  orders: number
  avgPrice: number
  contributionPct: number
  growthPct: number | null
}

export type CategoryAgg = {
  category: string
  revenue: number
  quantity: number
  profit: number
  productCount: number
  contributionPct: number
}

export type PeriodPoint = {
  period: string
  label: string
  revenue: number
  quantity: number
  profit: number
  orders: number
}

export type KpiBundle = {
  totalRevenue: number
  totalOrders: number
  totalQuantity: number
  averageOrderValue: number
  totalProfit: number
  profitMarginPct: number
  highestItem: string
  lowestItem: string
  productCount: number
  categoryCount: number
  revenueGrowthPct: number | null
  quantityGrowthPct: number | null
  sparkRevenue: number[]
  sparkQuantity: number[]
  sparkOrders: number[]
  sparkAov: number[]
}

export type AbcClass = 'A' | 'B' | 'C'

export type AbcRow = ProductAgg & { abc: AbcClass; cumulativePct: number }

export type Insight = {
  id: string
  kind: 'positive' | 'negative' | 'neutral' | 'anomaly'
  text: string
}

export type DashboardFilters = {
  datePreset: DatePreset
  customStart: string | null
  customEnd: string | null
  products: string[]
  categories: string[]
  stores: string[]
  paymentMethods: string[]
  customers: string[]
  search: string
}

export type DataCapabilities = {
  hasHourly: boolean
  hasDaily: boolean
  hasCustomers: boolean
  hasPayments: boolean
  hasOrderIds: boolean
  hasMultiStore: boolean
  grain: 'monthly' | 'daily' | 'transaction'
}
