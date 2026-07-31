import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CategoryTopItem } from '@/types/sales'
import type { CategoryGroupBreakdown } from '@/utils/analytics'
import { HelpLabel } from '@/components/ui/HelpTip'

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

/** Top 3 highest-selling products — total + per-item name/revenue. */
export function Top3SellersCard({
  title,
  items,
  totalRevenue,
  icon: Icon,
  delay = 0,
  help = 'Combined revenue of your 3 best-selling items in the current date filter. Change the date filter to compare another period.',
}: {
  title: string
  items: CategoryTopItem[]
  totalRevenue: number
  icon: LucideIcon
  delay?: number
  help?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="glass glass-hover rounded-2xl p-4 md:p-5"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            <HelpLabel help={help} helpTitle={title}>
              {title}
            </HelpLabel>
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink md:text-[1.65rem]">
            {money(totalRevenue)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">Combined revenue · top {items.length || 3}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
        {!items.length && (
          <li className="text-[11px] text-muted">No product sales in this range.</li>
        )}
        {items.map((item, idx) => (
          <li key={item.productName} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-ink" title={item.productName}>
              <span className="mr-1.5 font-semibold text-accent">{idx + 1}.</span>
              {item.productName}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-ink">
              {moneyExact(item.revenue)}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

/** Brand / region group: headline total + per-category revenue lines. */
export function CategoryGroupCard({
  title,
  group,
  icon: Icon,
  delay = 0,
  accentClass = 'bg-accent/10 text-accent',
  help,
}: {
  title: string
  group: CategoryGroupBreakdown
  icon: LucideIcon
  delay?: number
  accentClass?: string
  help?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="glass glass-hover rounded-2xl p-4 md:p-5"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {help ? (
              <HelpLabel help={help} helpTitle={title}>
                {title}
              </HelpLabel>
            ) : (
              title
            )}
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink md:text-[1.65rem]">
            {money(group.totalRevenue)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {group.categories.length} categor{group.categories.length === 1 ? 'y' : 'ies'} combined
          </p>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            accentClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
        {group.categories.map((c) => (
          <li key={c.category} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-ink" title={c.category}>
              {c.label}
            </span>
            <span
              className={cn(
                'shrink-0 font-medium tabular-nums',
                c.revenue > 0 ? 'text-ink' : 'text-muted',
              )}
            >
              {moneyExact(c.revenue)}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}
