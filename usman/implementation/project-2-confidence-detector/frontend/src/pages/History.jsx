import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'

/**
 * Library page — lists every Media row: live sessions, uploaded videos,
 * and analyzer audio runs. Source of truth: GET /api/recordings.
 *
 * Pagination: backend returns { items, total, limit, offset }. We fetch
 * the first page on mount and append subsequent pages when the user
 * clicks "Load more". `total` drives whether the button stays visible.
 */
const KIND_LABEL = {
  session: 'Live session',
  upload: 'Uploaded video',
  analyzer_audio: 'Analyzer audio',
}

const PAGE_SIZE = 20

export default function History() {
  const [sessions, setSessions] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(
          `${API_BASE}/api/recordings?limit=${PAGE_SIZE}&offset=0`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          // Accept both shapes: new paginated { items, total } and
          // legacy bare array (in case a client hits an older backend).
          if (Array.isArray(data)) {
            setSessions(data)
            setTotal(data.length)
          } else {
            setSessions(data.items || [])
            setTotal(data.total || 0)
          }
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load sessions')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const res = await apiFetch(
        `${API_BASE}/api/recordings?limit=${PAGE_SIZE}&offset=${sessions.length}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const next = Array.isArray(data) ? data : (data.items || [])
      setSessions((prev) => [...prev, ...next])
      if (!Array.isArray(data) && typeof data.total === 'number') {
        setTotal(data.total)
      }
    } catch (e) {
      setError(e.message || 'Failed to load more')
    } finally {
      setLoadingMore(false)
    }
  }

  async function deleteSession(id) {
    // Confirm before a destructive action. window.confirm is plain but
    // enough for a personal tool — we don't want to build a modal just
    // for this. Cancel is a no-op; proceed fires DELETE /api/media/:id.
    const ok = window.confirm(
      'Delete this recording permanently? The report, video/audio, and all chunk scores will be removed. This cannot be undone.'
    )
    if (!ok) return
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      // Optimistic local update so the card disappears immediately.
      setSessions((prev) => prev.filter((s) => s.session_id !== id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (e) {
      alert(`Delete failed: ${e.message}`)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return 'Unknown date'
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }
  const formatDuration = (s) => {
    if (s === null || s === undefined) return '—'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="processing">
        <div className="spinner"></div>
        <p>Loading sessions…</p>
      </div>
    )
  }

  if (error) {
    return <div className="session-error">Failed to load sessions: {error}</div>
  }

  if (sessions.length === 0) {
    return (
      <div className="section">
        <h2>Library</h2>
        <p className="subtitle">No sessions yet.</p>
      </div>
    )
  }

  const hasMore = sessions.length < total

  return (
    <div className="section history-page">
      <h2>Library</h2>
      <p className="subtitle">
        Past recording sessions, newest first.
        {total > 0 && (
          <span style={{ opacity: 0.7, marginLeft: 8 }}>
            ({sessions.length} of {total})
          </span>
        )}
      </p>

      <div className="history-grid">
        {sessions.map((s) => (
          <div key={s.session_id} className="history-card">
            <div className="history-card-header">
              <strong>{formatDate(s.started_at)}</strong>
              <span className="history-kind">{KIND_LABEL[s.kind] || s.kind}</span>
              <span>Duration: {formatDuration(s.duration_s)}</span>
              <span>Score: {s.score ?? '—'}</span>
              {s.original_name && (
                <span title={s.original_name} className="history-name">{s.original_name}</span>
              )}
            </div>

            {s.video_url ? (
              <video
                src={`${API_BASE}${s.video_url}`}
                controls
                preload="metadata"
                playsInline
                className="processed-video"
                style={{ width: '100%', borderRadius: 8, marginTop: 8 }}
              />
            ) : s.audio_url ? (
              <audio
                src={`${API_BASE}${s.audio_url}`}
                controls
                preload="metadata"
                style={{ width: '100%', marginTop: 8 }}
              />
            ) : (
              <div className="history-no-video">
                {s.has_video === false && s.has_audio === false
                  ? 'media missing'
                  : 'no playable file'}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Link
                to={`/result/${s.session_id}`}
                className="report-btn"
                style={{ flex: 1, textAlign: 'center' }}
              >
                View Result →
              </Link>
              <button
                onClick={() => deleteSession(s.session_id)}
                type="button"
                title="Delete permanently"
                style={{
                  background: 'transparent',
                  border: '1px solid #6a1b1b',
                  color: '#ff7a7a',
                  padding: '8px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="report-btn"
          >
            {loadingMore ? 'Loading…' : `Load more (${total - sessions.length} left)`}
          </button>
        </div>
      )}
    </div>
  )
}
