import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { cn, formatPct } from '@/lib/utils'
import { HelpLabel } from '@/components/ui/HelpTip'

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { stiffness: 80, damping: 20 })
  const display = useTransform(spring, (v) => format(v))

  useEffect(() => {
    mv.set(value)
  }, [value, mv])

  return <motion.span>{display}</motion.span>
}

type Props = {
  title: string
  value: number
  format: (n: number) => string
  icon: LucideIcon
  growth?: number | null
  spark?: number[]
  subtitle?: string
  delay?: number
  /** e.g. "vs prior" or "vs prior (same time)" */
  priorLabel?: string
  /** Hover helper explaining the metric and what to do next. */
  help?: string
}

export function KpiCard({
  title,
  value,
  format,
  icon: Icon,
  growth,
  spark = [],
  subtitle,
  delay = 0,
  priorLabel = 'vs prior',
  help,
}: Props) {
  const TrendIcon =
    growth == null || growth === 0 ? Minus : growth > 0 ? ArrowUpRight : ArrowDownRight
  const trendColor =
    growth == null || growth === 0
      ? 'text-muted'
      : growth > 0
        ? 'text-success'
        : 'text-danger'

  const sparkData = spark.map((v, i) => ({ i, v }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="glass glass-hover rounded-2xl p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
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
          <p className="mt-1 truncate font-display text-2xl font-semibold text-ink md:text-[1.65rem]">
            {subtitle ? (
              <span title={subtitle}>{subtitle}</span>
            ) : (
              <AnimatedNumber value={value} format={format} />
            )}
          </p>
          <div className={cn('mt-2 inline-flex items-center gap-1 text-xs font-medium', trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span>{formatPct(growth ?? null)}</span>
            <span className="text-muted font-normal">{priorLabel}</span>
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {sparkData.length > 1 && (
        <div className="mt-3 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={`spark-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="var(--accent)"
                fill={`url(#spark-${title})`}
                strokeWidth={1.5}
                isAnimationActive
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}
