import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchAuthStatus,
  loginWithPassword,
  logout as apiLogout,
  type AuthUser,
} from '@/services/authApi'

type AuthCtx = {
  loading: boolean
  user: AuthUser | null
  googleEnabled: boolean
  configured: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [configured, setConfigured] = useState(false)

  const refresh = useCallback(async () => {
    const status = await fetchAuthStatus()
    setConfigured(status.configured)
    setGoogleEnabled(status.googleEnabled)
    setUser(status.authenticated ? status.user : null)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refresh()
      } catch {
        if (!cancelled) {
          setUser(null)
          setConfigured(false)
          setGoogleEnabled(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const login = useCallback(
    async (username: string, password: string) => {
      const next = await loginWithPassword(username, password)
      setUser(next)
      setConfigured(true)
    },
    [],
  )

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ loading, user, googleEnabled, configured, login, logout, refresh }),
    [loading, user, googleEnabled, configured, login, logout, refresh],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
