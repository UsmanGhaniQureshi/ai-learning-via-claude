import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../config'

/**
 * Library page — lists every Media row: live sessions, uploaded videos,
 * and analyzer audio runs. Source of truth: GET /api/recordings.
 */
const KIND_LABEL = {
  session: 'Live session',
  upload: 'Uploaded video',
  analyzer_audio: 'Analyzer audio',
}

export default function History() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/recordings`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setSessions(Array.isArray(data) ? data : [])
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

  return (
    <div className="section history-page">
      <h2>Library</h2>
      <p className="subtitle">Past recording sessions, newest first.</p>

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

            <Link
              to={`/result/${s.session_id}`}
              className="report-btn"
              style={{ marginTop: 8, display: 'inline-block', textAlign: 'center' }}
            >
              View Result →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
