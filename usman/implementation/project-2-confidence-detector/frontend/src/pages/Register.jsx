import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/**
 * Register — email + name + password form.
 *
 * Backend constraints (kept in sync intentionally):
 *   - email must be deliverable (RFC + DNS check via email-validator)
 *   - password must be ≤ 72 bytes UTF-8 (bcrypt's hard cap)
 *   - name is required and trimmed
 */
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
    <div className="section" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h2>Create your account</h2>
      <p className="subtitle">A few seconds and you're in.</p>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        <label>
          <div style={{ marginBottom: 4 }}>Name</div>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label>
          <div style={{ marginBottom: 4 }}>Email</div>
          <input
            type="email"
            required
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
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          <div style={{ fontSize: '0.78em', opacity: 0.6, marginTop: 4 }}>
            8+ characters. Stored as a bcrypt hash, never plaintext.
          </div>
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
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p style={{ marginTop: 20, opacity: 0.85 }}>
        Already have an account? <Link to="/login">Sign in</Link>.
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
