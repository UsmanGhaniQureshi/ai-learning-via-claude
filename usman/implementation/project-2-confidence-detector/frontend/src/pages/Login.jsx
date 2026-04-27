import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/**
 * Login — email + password form.
 *
 * Honours an optional `?next=` query param so RequireAuth's redirect
 * sends the user back to where they were after login. Defaults to /.
 */
export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const next = new URLSearchParams(location.search).get('next') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
      setBusy(false)
    }
  }

  return (
    <div className="section" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h2>Sign in</h2>
      <p className="subtitle">Welcome back. Sign in to access your library.</p>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        <label>
          <div style={{ marginBottom: 4 }}>Email</div>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label>
          <div style={{ marginBottom: 4 }}>Password</div>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        {error && (
          <div className="session-error" style={{ marginTop: 4 }}>{error}</div>
        )}
        <button
          type="submit"
          className="report-btn"
          disabled={busy}
          style={{ marginTop: 8 }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p style={{ marginTop: 20, opacity: 0.85 }}>
        New here? <Link to="/register">Create an account</Link>.
      </p>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid #444',
  background: '#1c1c24',
  color: '#eee',
  fontSize: '1rem',
}
