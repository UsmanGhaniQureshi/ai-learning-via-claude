import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

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
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <Link to="/" className="font-display text-3xl font-extrabold tracking-[-0.04em]">
          cd<span className="text-accent">.</span>
        </Link>
      </div>

      <div className="glass-card p-8">
        <h2 className="mb-1">Sign in</h2>
        <p className="text-text-secondary text-sm mb-6">Welcome back. Sign in to access your library.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Email</div>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Password</div>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </label>
          {error && (
            <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary btn-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-text-secondary text-center">
          New here?{' '}
          <Link to="/register" className="text-text-accent hover:underline">
            Create an account
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
