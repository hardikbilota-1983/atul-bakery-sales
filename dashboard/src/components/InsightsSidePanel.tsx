import { useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

export function InsightsSidePanel({
  insights,
  open,
  onOpenChange,
}: {
  insights: { id: string; kind: string; text: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <>
      {/* Collapsed tab */}
      {!open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="glass fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 rounded-l-2xl rounded-r-none px-2 py-4 text-accent shadow-lg lg:flex"
          title="Open AI Insights"
        >
          <span className="flex flex-col items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ writingMode: 'vertical-rl' }}
            >
              AI Insights
            </span>
            <ChevronLeft className="h-4 w-4" />
          </span>
        </button>
      )}

      {/* Desktop panel */}
      <aside
        className={cn(
          'sticky top-5 hidden h-[calc(100vh-2.5rem)] shrink-0 transition-all duration-300 lg:block',
          open ? 'w-80' : 'w-0 overflow-hidden',
        )}
      >
        {open && (
          <div className="glass flex h-full flex-col rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <h2 className="font-display text-base font-semibold text-ink">AI Insights</h2>
              </div>
              <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} title="Collapse">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <ul className="flex-1 space-y-2 overflow-y-auto pr-1">
              {insights.map((ins) => (
                <li
                  key={ins.id}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm leading-snug',
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
              {!insights.length && (
                <li className="py-8 text-center text-sm text-muted">No insights yet.</li>
              )}
            </ul>
          </div>
        )}
      </aside>

      {/* Mobile: bottom sheet style toggle */}
      <div className="fixed bottom-4 right-4 z-30 lg:hidden">
        <Button
          size="sm"
          variant={open ? 'secondary' : 'default'}
          onClick={() => onOpenChange(!open)}
        >
          <Sparkles className="h-4 w-4" />
          Insights
        </Button>
      </div>
      {open && (
        <div className="fixed inset-x-3 bottom-16 z-30 max-h-[50vh] overflow-y-auto rounded-2xl lg:hidden">
          <div className="glass p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display font-semibold">AI Insights</h2>
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
            <ul className="space-y-2">
              {insights.map((ins) => (
                <li
                  key={ins.id}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm',
                    ins.kind === 'positive' && 'border-success/30 bg-success/10',
                    ins.kind === 'negative' && 'border-danger/30 bg-danger/10',
                    ins.kind === 'anomaly' && 'border-warning/30 bg-warning/10',
                    ins.kind === 'neutral' && 'border-border bg-black/[0.02]',
                  )}
                >
                  {ins.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}

/** Hook-friendly default open state for desktop */
export function useInsightsOpen(defaultOpen = true) {
  return useState(defaultOpen)
}
