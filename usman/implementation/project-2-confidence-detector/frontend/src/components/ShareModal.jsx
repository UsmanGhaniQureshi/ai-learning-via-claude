import { useEffect, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

export default function ShareModal({ mediaId, onClose }) {
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState(null)
  const [revokeError, setRevokeError] = useState(null)

  // Escape-to-close + body scroll lock — copies the pattern from TimelineModal.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

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
    setRevokeError(null)
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
      setRevokeError(`Could not revoke: ${e.message}`)
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] bg-black/65 flex items-center justify-center p-4 animate-fade-up"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-md max-h-[80vh] overflow-auto p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="m-0 text-text-primary">Share this recording</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted hover:text-text-primary text-xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-text-secondary mb-4">
          Grant another user read + comment access by their account email. They keep no editing or deletion rights — only you can rename, trim, or remove the recording.
        </p>

        <form onSubmit={addShare} className="flex gap-2 mb-3">
          <input
            type="email"
            placeholder="friend@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={busy}
            className="input flex-1"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? 'Sharing…' : 'Share'}
          </button>
        </form>

        {error && (
          <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-3 py-2 mb-3">
            {error}
          </div>
        )}
        {revokeError && (
          <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-3 py-2 mb-3">
            {revokeError}
          </div>
        )}
        {hint && (
          <div className="bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-success text-sm rounded-md px-3 py-2 mb-3">
            {hint}
          </div>
        )}

        <div className="text-xs text-text-muted mb-2">Currently shared with:</div>
        {loading ? (
          <div className="text-text-muted text-sm">Loading…</div>
        ) : shares.length === 0 ? (
          <div className="text-text-muted text-sm italic">
            Nobody yet — only you can see this recording.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {shares.map((u) => (
              <div
                key={u.id}
                className="flex justify-between items-center px-3 py-2 bg-page/60 border border-border rounded-md"
              >
                <div className="text-sm">
                  <div className="font-semibold text-text-primary">{u.name}</div>
                  <div className="text-text-muted text-xs">{u.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(u.id, u.email)}
                  className="btn btn-danger btn-sm"
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
