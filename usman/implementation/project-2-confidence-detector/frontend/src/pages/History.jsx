import { useEffect, useState } from 'react'
import SessionReport from '../components/SessionReport'
import { API_BASE } from '../config'

/**
 * Library page — lists past sessions and lets the user replay any of them.
 * Source of truth: GET /api/recordings (returns the schema produced by
 * SessionAudioRecorder.list_recordings).
 */
export default function History() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [expandedReport, setExpandedReport] = useState(null)
  const [reportError, setReportError] = useState(null)

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

  const handleExpand = async (session) => {
    if (expandedId === session.session_id) {
      setExpandedId(null)
      setExpandedReport(null)
      setReportError(null)
      return
    }
    setExpandedId(session.session_id)
    setExpandedReport(null)
    setReportError(null)
    if (!session.has_report) return
    try {
      const res = await fetch(`${API_BASE}${session.report_url}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setExpandedReport(data)
    } catch (e) {
      setReportError(e.message || 'Failed to load report')
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

  return (
    <div className="section history-page">
      <h2>Library</h2>
      <p className="subtitle">Past recording sessions, newest first.</p>

      <div className="history-grid">
        {sessions.map((s) => {
          const isOpen = expandedId === s.session_id
          return (
            <div key={s.session_id} className="history-card">
              <div className="history-card-header">
                <strong>{formatDate(s.started_at)}</strong>
                <span>Duration: {formatDuration(s.duration_s)}</span>
                <span>Score: {s.score ?? '—'}</span>
              </div>

              {s.has_video ? (
                <video
                  src={`${API_BASE}${s.video_url}`}
                  controls
                  preload="metadata"
                  playsInline
                  className="processed-video"
                  style={{ width: '100%', borderRadius: 8, marginTop: 8 }}
                />
              ) : (
                <div className="history-no-video" style={{
                  padding: 16,
                  background: '#222',
                  color: '#888',
                  borderRadius: 8,
                  marginTop: 8,
                  textAlign: 'center',
                }}>video missing</div>
              )}

              <button
                className="report-btn"
                style={{ marginTop: 8 }}
                onClick={() => handleExpand(s)}
              >
                {isOpen ? 'Hide report' : 'Show report'}
              </button>

              {isOpen && expandedReport && (
                <SessionReport report={expandedReport} showRecording={false} />
              )}
              {isOpen && !expandedReport && s.has_report && !reportError && (
                <p>Loading report…</p>
              )}
              {isOpen && !s.has_report && (
                <p>No report saved for this session.</p>
              )}
              {isOpen && reportError && (
                <p className="session-error">Failed to load report: {reportError}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
