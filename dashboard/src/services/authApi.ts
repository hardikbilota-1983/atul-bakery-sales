export type AuthUser = {
  id: string
  username: string | null
  email: string | null
  displayName: string
  provider: 'local' | 'google' | string
}

export type AuthStatus = {
  configured: boolean
  googleEnabled: boolean
  authenticated: boolean
  user: AuthUser | null
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status', { credentials: 'include' })
  if (!res.ok) throw new Error(`Auth status ${res.status}`)
  return parseJson<AuthStatus>(res)
}

export async function loginWithPassword(username: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const json = await parseJson<{ ok?: boolean; user?: AuthUser; error?: string }>(res)
  if (!res.ok) throw new Error(json.error || `Login failed (${res.status})`)
  if (!json.user) throw new Error('Login failed.')
  return json.user
}

export async function logout(): Promise<void> {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    let message = `Logout failed (${res.status})`
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      /* ignore body parse errors */
    }
    throw new Error(message)
  }
}
