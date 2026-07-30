import { useEffect, useState } from 'react'
import { CloudDownload, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { fetchCloverStatus, syncClover, type CloverStatus } from '@/services/cloverApi'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

type Props = {
  onSynced: () => Promise<void> | void
}

function defaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 90)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
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
      await onSynced()
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
              Last sync: {new Date(status.cache.syncedAt).toLocaleString()} ·{' '}
              {status.cache.lineCount.toLocaleString()} lines
            </p>
          )}

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
        </>
      )}

      {message && <p className="mt-2 text-[11px] text-success">{message}</p>}
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  )
}
