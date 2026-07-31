import { useMemo, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { LogIn, Moon, Sun } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/Button'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3l-.7.5-2.4 1.9C5.1 19.4 8.3 21.6 12 21.6c2.4 0 4.4-.8 5.9-2.1l-3.1-2.4c-.8.6-1.9.9-2.8.9-2.2 0-4-1.5-4.7-3.5z"
      />
      <path
        fill="#4A90E2"
        d="M3.5 7.3C2.9 8.5 2.5 9.8 2.5 11.2s.4 2.7 1 3.9c0 .1 3.1-2.4 3.1-2.4-.2-.5-.3-1.1-.3-1.5 0-.5.1-1 .3-1.5L3.5 7.3z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.4c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.4 2.6 14.4 1.8 12 1.8 8.3 1.8 5.1 4 3.5 7.3l3.1 2.4C7.9 6.9 9.8 5.4 12 5.4z"
      />
    </svg>
  )
}

export function LoginPage() {
  const { user, loading, login, googleEnabled, configured } = useAuth()
  const { theme, toggle } = useTheme()
  const [params] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const oauthError = useMemo(() => {
    const raw = params.get('error')
    return raw ? decodeURIComponent(raw) : null
  }, [params])

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <Button size="icon" variant="ghost" onClick={toggle} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </div>

      <div className="glass w-full max-w-md rounded-3xl p-8 shadow-[var(--shadow)]">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Atul Bakery · Hillside
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Sign in</h1>
          <p className="mt-2 text-sm text-muted">
            Sales analytics is private. Sign in to continue.
          </p>
        </div>

        {(error || oauthError) && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error || oauthError}
          </div>
        )}

        {!configured && !loading && (
          <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Auth is not configured on the server yet. Set <code>AUTH_USERS</code> and/or Google
            OAuth env vars.
          </div>
        )}

        <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Username</span>
            <input
              autoComplete="username"
              className="h-11 w-full rounded-xl border border-border bg-black/[0.03] px-3 text-ink outline-none ring-accent/30 focus:ring-2 dark:bg-white/[0.04]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="h-11 w-full rounded-xl border border-border bg-black/[0.03] px-3 text-ink outline-none ring-accent/30 focus:ring-2 dark:bg-white/[0.04]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <Button className="w-full" size="lg" type="submit" disabled={submitting || loading}>
            <LogIn className="h-4 w-4" />
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {googleEnabled && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button className="w-full" size="lg" variant="secondary" asChild>
              <a href="/api/auth/google">
                <GoogleIcon className="h-5 w-5" />
                Continue with Google
              </a>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
