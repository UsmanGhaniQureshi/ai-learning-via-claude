import { useEffect, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

/**
 * ShareModal — owner-only modal for granting/revoking read+comment
 * access to a Media row by email.
 *
 * Lifecycle:
 *   - Mounts: loads the existing share list via GET /shares
 *   - Add: POST /share with an email; backend looks up the user.
 *     If the email isn't registered we surface that clearly so the
 *     owner can ask their friend to sign up first.
 *   - Revoke: DELETE /share/{user_id}; updates locally on success.
 *   - Close: parent unmounts.
 *
 * Render-as-a-modal — full-screen dim overlay, click outside or the
 * close button to dismiss.
 */
export default function ShareModal({ mediaId, onClose }) {
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState(null) // success message after add

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/api/media/${mediaId}/shares`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setShares(Array.isArray(data) ? data : [])
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message)
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [mediaId])

  async function addShare(e) {
    e.preventDefault()
    setError(null)
    setHint(null)
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setBusy(true)
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${mediaId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setShares(body.shared_with || [])
      setHint(`Shared with ${trimmed}.`)
      setEmail('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(userId, userEmail) {
    if (!window.confirm(`Revoke access for ${userEmail}?`)) return
    try {
      const res = await apiFetch(
        `${API_BASE}/api/media/${mediaId}/share/${userId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      setShares((prev) => prev.filter((u) => u.id !== userId))
    } catch (e) {
      alert(`Could not revoke: ${e.message}`)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1c1c24',
          border: '1px solid #2a2a35',
          borderRadius: 10,
          padding: 20,
          width: '100%',
          maxWidth: 460,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Share this recording</h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#aaa',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: '0.88em', opacity: 0.8, marginTop: 0 }}>
          Grant another user read + comment access by their account
          email. They keep no editing or deletion rights — only you can
          rename, trim, or remove the recording.
        </p>

        <form onSubmit={addShare} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            type="email"
            placeholder="friend@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={busy}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #444',
              background: '#0f0f18',
              color: '#eee',
              fontSize: '0.95rem',
            }}
          />
          <button type="submit" className="report-btn" disabled={busy}>
            {busy ? 'Sharing…' : 'Share'}
          </button>
        </form>

        {error && <div className="session-error" style={{ marginBottom: 10 }}>{error}</div>}
        {hint && (
          <div style={{
            marginBottom: 10,
            padding: '6px 10px',
            background: '#1f3a1f',
            border: '1px solid #2c5a2c',
            color: '#9ee0a0',
            borderRadius: 6,
            fontSize: '0.85em',
          }}>
            {hint}
          </div>
        )}

        <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 6 }}>
          Currently shared with:
        </div>
        {loading ? (
          <div style={{ opacity: 0.6, fontSize: '0.85em' }}>Loading…</div>
        ) : shares.length === 0 ? (
          <div style={{ opacity: 0.6, fontSize: '0.85em', fontStyle: 'italic' }}>
            Nobody yet — only you can see this recording.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shares.map((u) => (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: '#0f0f18',
                  border: '1px solid #2a2a35',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: '0.9em' }}>
                  <div><strong>{u.name}</strong></div>
                  <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{u.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(u.id, u.email)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #6a1b1b',
                    color: '#ff7a7a',
                    padding: '4px 10px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: '0.8em',
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
