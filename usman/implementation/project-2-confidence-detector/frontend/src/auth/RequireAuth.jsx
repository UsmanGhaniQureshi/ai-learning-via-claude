import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * RequireAuth — wraps any element that should only render for logged-in
 * users. Redirects to /login with a `?next=` so the user lands back
 * where they came from after signing in.
 *
 * While the initial /me probe is in flight (`loading` true), shows a
 * tiny spinner instead of redirecting — otherwise a hard refresh on
 * a protected page would briefly flash the login screen even for an
 * authenticated user.
 */
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="processing">
        <div className="spinner"></div>
        <p>Loading…</p>
      </div>
    )
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return children
}
