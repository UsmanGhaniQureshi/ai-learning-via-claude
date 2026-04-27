import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { API_BASE, apiFetch, getAuthToken, setAuthToken } from '../config'

/**
 * AuthContext — single source of truth for "who is the current user".
 *
 * Lifecycle:
 *   - On app boot, if a token exists in localStorage, call /api/auth/me
 *     to validate it and load the user. A failed call clears the token
 *     and leaves the app in the logged-out state.
 *   - login() / register() take credentials, store the returned token,
 *     and set the user.
 *   - logout() clears the token and the user.
 *
 * Consumers use the useAuth() hook. The provider keeps re-renders to
 * a minimum by memoising the value object.
 */
const AuthCtx = createContext({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // `loading` is true only on the very first render while we wait for
  // /me to come back. After that we know whether the user is logged in
  // or not, and login/register set user synchronously after the
  // response lands.
  const [loading, setLoading] = useState(true)

  // Boot-time: if we have a token, try to resolve it to a user.
  useEffect(() => {
    let cancelled = false
    async function boot() {
      const token = getAuthToken()
      if (!token) {
        if (!cancelled) setLoading(false)
        return
      }
      try {
        const res = await apiFetch(`${API_BASE}/api/auth/me`)
        if (res.ok) {
          const me = await res.json()
          if (!cancelled) setUser(me)
        } else {
          // Invalid / expired token — clear it.
          setAuthToken(null)
        }
      } catch {
        // Network fail — leave the token alone so a retry might
        // succeed next time. Treat as logged-out for now.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `Login failed (HTTP ${res.status})`)
    }
    const data = await res.json()
    setAuthToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (email, name, password) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      // Pydantic validation errors come back as an array; surface the
      // first one cleanly so the form can show "Invalid email" etc.
      let msg = err.detail
      if (Array.isArray(msg) && msg[0]?.msg) msg = msg[0].msg
      throw new Error(msg || `Register failed (HTTP ${res.status})`)
    }
    const data = await res.json()
    setAuthToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    setAuthToken(null)
    setUser(null)
    // Hard reload to clear any in-memory state from other components
    // (libraries holding stale data, in-flight requests, etc.). Cheap
    // and 100% reliable.
    window.location.href = '/login'
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  )
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  return useContext(AuthCtx)
}
