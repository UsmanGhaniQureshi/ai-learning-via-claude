import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      await register(email, name, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Registration failed')
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
        <h2 className="mb-1">Create your account</h2>
        <p className="text-text-secondary text-sm mb-6">A few seconds and you&apos;re in.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Name</div>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Email</div>
            <input
              type="email"
              required
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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
            <p className="text-xs text-text-muted mt-1">8+ characters. Stored as a bcrypt hash, never plaintext.</p>
          </label>
          {error && (
            <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary btn-full">
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-text-secondary text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-text-accent hover:underline">Sign in</Link>
          .
        </p>
      </div>
    </div>
  )
}
