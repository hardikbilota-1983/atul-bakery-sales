import * as Tooltip from '@radix-ui/react-tooltip'
import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Wrap the app once so hover tips share delay behavior. */
export function HelpTipProvider({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={200} skipDelayDuration={120}>
      {children}
    </Tooltip.Provider>
  )
}

type HelpTipProps = {
  /** Action-oriented helper text shown on hover/focus. */
  content: string
  /** Optional short title above the body. */
  title?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Wrap children (e.g. a button or label). */
  children?: React.ReactNode
  /** Show a ? icon trigger instead of wrapping children. */
  icon?: boolean
  className?: string
}

/**
 * Hover/focus helper for dashboard controls.
 * Prefer action-oriented copy: what this is + exact next step.
 */
export function HelpTip({
  content,
  title,
  side = 'top',
  align = 'center',
  children,
  icon = false,
  className,
}: HelpTipProps) {
  const trigger = icon ? (
    <button
      type="button"
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        className,
      )}
      aria-label={title ? `Help: ${title}` : 'Help'}
    >
      <CircleHelp className="h-3.5 w-3.5" />
    </button>
  ) : (
    children
  )

  if (!trigger) return null

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          className="z-50 max-w-[17rem] rounded-xl border border-border bg-[var(--surface)] px-3 py-2 text-xs leading-snug text-ink shadow-lg"
        >
          {title && <p className="mb-0.5 font-semibold text-ink">{title}</p>}
          <p className="text-[var(--muted)]">{content}</p>
          <Tooltip.Arrow className="fill-[var(--surface)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/** Label row with optional help icon — use for section headings. */
export function HelpLabel({
  children,
  help,
  helpTitle,
  className,
}: {
  children: React.ReactNode
  help: string
  helpTitle?: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {children}
      <HelpTip content={help} title={helpTitle} icon side="right" />
    </span>
  )
}
