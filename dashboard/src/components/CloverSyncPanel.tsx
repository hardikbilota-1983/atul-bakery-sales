import { useEffect, useState } from 'react'
import { CloudDownload, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { fetchCloverStatus, syncClover, type CloverStatus } from '@/services/cloverApi'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { dayKeyInZone, MERCHANT_TZ } from '@/utils/timezone'

type SyncRange = { start: string; end: string }

type Props = {
  /** Called after a successful Clover pull. Receives the fetch range so the dashboard can filter to it. */
  onSynced: (range: SyncRange) => Promise<void> | void
}

function defaultRange(): SyncRange {
  const end = dayKeyInZone(new Date(), MERCHANT_TZ)
  const endNoon = new Date(`${end}T12:00:00`)
  const start = dayKeyInZone(new Date(endNoon.getTime() - 6 * 86400000), MERCHANT_TZ)
  return { start, end }
}

export function CloverSyncPanel({ onSynced }: Props) {
  const [status, setStatus] = useState<CloverStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const range = defaultRange()
  const [startDate, setStartDate] = useState(range.start)
  const [endDate, setEndDate] = useState(range.end)

  const refreshStatus = async () => {
    try {
      const s = await fetchCloverStatus()
      setStatus(s)
      setError(s.error)
    } catch {
      setStatus(null)
      setError('API server offline. Run npm run dev (starts web + Clover API).')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  const onSync = async () => {
    setSyncing(true)
    setMessage(null)
    setError(null)
    try {
      const result = await syncClover(startDate, endDate)
      setMessage(
        `Synced ${result.orderCount.toLocaleString()} orders → ${result.lineCount.toLocaleString()} line items`,
      )
      await refreshStatus()
      await onSynced({ start: startDate, end: endDate })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-accent/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CloudDownload className="h-4 w-4 text-accent" />
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">Clover Sync</p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => void refreshStatus()} title="Refresh status">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {loading ? (
        <p className="text-[11px] text-muted">Checking connection…</p>
      ) : !status?.configured ? (
        <p className="text-[11px] leading-relaxed text-muted">
          Add <code className="text-ink">CLOVER_MERCHANT_ID</code> and{' '}
          <code className="text-ink">CLOVER_API_TOKEN</code> to{' '}
          <code className="text-ink">dashboard/.env</code> (see .env.example), then restart the
          server.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-muted">
            {status.merchant?.name ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3 w-3" />
                Connected · {status.merchant.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warning">
                <AlertCircle className="h-3 w-3" />
                Credentials set{status.error ? ` · ${status.error}` : ''}
              </span>
            )}
          </p>

          {status.cache && (
            <p className="mb-2 text-[11px] text-muted">
              {status.todayCached
                ? `Today (${status.dayKey}) cached · `
                : `Today not cached yet · `}
              {status.cache.lineCount.toLocaleString()} lines total
              {status.catalogCached ? ' · Catalog ready' : ''}
            </p>
          )}

          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
            Fetch range (pull from Clover)
          </p>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="text-[10px] text-muted">
              From
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-0.5 h-8 w-full rounded-lg border border-border bg-white/50 px-2 text-xs dark:bg-black/20"
              />
            </label>
            <label className="text-[10px] text-muted">
              To
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-0.5 h-8 w-full rounded-lg border border-border bg-white/50 px-2 text-xs dark:bg-black/20"
              />
            </label>
          </div>

          <Button size="sm" className="w-full" disabled={syncing} onClick={() => void onSync()}>
            {syncing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…
              </>
            ) : (
              <>
                <CloudDownload className="h-3.5 w-3.5" /> Fetch from Clover
              </>
            )}
          </Button>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
            Changing dates alone does nothing — click Fetch. After sync, the dashboard filter updates
            to this range. Prefer shorter ranges (e.g. Today or Last 7 Days) to avoid Clover rate
            limits; long ranges sync in weekly chunks and may take a few minutes.
          </p>
        </>
      )}

      {message && <p className="mt-2 text-[11px] text-success">{message}</p>}
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  )
}
