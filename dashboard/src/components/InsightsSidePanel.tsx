import { useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles, Trophy } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { HelpLabel, HelpTip } from '@/components/ui/HelpTip'
import type { CategoryTopSellers } from '@/types/sales'

function money(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n)
}

export function InsightsSidePanel({
  insights,
  categoryLeaders,
  open,
  onOpenChange,
}: {
  insights: { id: string; kind: string; text: string }[]
  categoryLeaders: CategoryTopSellers[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="glass fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 rounded-l-2xl rounded-r-none px-2 py-4 text-accent shadow-lg lg:flex"
          title="Open category top sellers"
        >
          <span className="flex flex-col items-center gap-2">
            <Trophy className="h-4 w-4" />
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ writingMode: 'vertical-rl' }}
            >
              Top Sellers
            </span>
            <ChevronLeft className="h-4 w-4" />
          </span>
        </button>
      )}

      <aside
        className={cn(
          'sticky top-5 hidden h-[calc(100vh-2.5rem)] shrink-0 transition-all duration-300 lg:block',
          open ? 'w-[22rem]' : 'w-0 overflow-hidden',
        )}
      >
        {open && (
          <div className="glass flex h-full flex-col rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-accent" />
                <h2 className="font-display text-base font-semibold text-ink">
                  <HelpLabel
                    helpTitle="Top Sellers"
                    help="Top 3 items by revenue in each watched category for the current date filter. Empty categories are hidden. Change the date filter to refresh."
                  >
                    Top Sellers
                  </HelpLabel>
                </h2>
              </div>
              <HelpTip title="Hide panel" content="Collapse this panel. Re-open anytime from the Top Sellers button or the right-edge tab.">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  aria-label="Hide panel"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </HelpTip>
            </div>
            <p className="mb-3 text-[11px] text-muted">
              Top 3 by revenue in each watched category (current filters). Empty categories are hidden.
            </p>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {!categoryLeaders.length && (
                <p className="rounded-xl border border-border px-3 py-6 text-center text-sm text-muted">
                  No sales in watched categories for this date range.
                </p>
              )}

              {categoryLeaders.map((block) => (
                <section
                  key={block.category}
                  className="rounded-xl border border-border bg-black/[0.02] p-3 dark:bg-white/[0.03]"
                >
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
                    {block.category}
                  </h3>
                  <ol className="space-y-2">
                    {block.items.map((item, idx) => (
                      <li key={item.productName} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ink" title={item.productName}>
                            {item.productName}
                          </p>
                          <p className="text-[11px] text-muted">
                            {formatNumber(item.quantity, 1)} sold · {money(item.revenue)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}

              {insights.length > 0 && (
                <section className="pt-2">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      AI Insights
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {insights.map((ins) => (
                      <li
                        key={ins.id}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-xs leading-snug',
                          ins.kind === 'positive' && 'border-success/30 bg-success/10',
                          ins.kind === 'negative' && 'border-danger/30 bg-danger/10',
                          ins.kind === 'anomaly' && 'border-warning/30 bg-warning/10',
                          ins.kind === 'neutral' &&
                            'border-border bg-black/[0.02] dark:bg-white/[0.03]',
                        )}
                      >
                        {ins.text}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </aside>

      <div className="fixed bottom-4 right-4 z-30 lg:hidden">
        <Button
          size="sm"
          variant={open ? 'secondary' : 'default'}
          onClick={() => onOpenChange(!open)}
        >
          <Trophy className="h-4 w-4" />
          Top Sellers
        </Button>
      </div>
      {open && (
        <div className="fixed inset-x-3 bottom-16 z-30 max-h-[60vh] overflow-y-auto rounded-2xl lg:hidden">
          <div className="glass p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display font-semibold">Top Sellers</h2>
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
            <div className="space-y-3">
              {!categoryLeaders.length && (
                <p className="py-4 text-center text-sm text-muted">No sales in watched categories.</p>
              )}
              {categoryLeaders.map((block) => (
                <section key={block.category} className="rounded-xl border border-border p-3">
                  <h3 className="mb-2 text-xs font-semibold text-accent">{block.category}</h3>
                  <ol className="space-y-2">
                    {block.items.map((item, idx) => (
                      <li key={item.productName} className="text-sm">
                        <span className="font-medium text-ink">
                          {idx + 1}. {item.productName}
                        </span>
                        <span className="block text-[11px] text-muted">
                          {formatNumber(item.quantity, 1)} sold · {money(item.revenue)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function useInsightsOpen(defaultOpen = true) {
  return useState(defaultOpen)
}
