import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { API_BASE, apiFetch, mediaUrl } from '../config'

/**
 * Library page — lists every Media row for the current user with
 * search / sort / filter on top of the pagination from Phase 3.
 *
 * Filter state lives in the URL via `useSearchParams`, so:
 *   - The browser back button works through filter changes.
 *   - A filtered Library is bookmarkable / shareable (within the same
 *     user account — the auth gate still applies).
 *   - A reload preserves the user's choices.
 *
 * URL params honoured:
 *   q          search text
 *   sort       created_desc | created_asc | score_desc | score_asc |
 *              duration_desc | duration_asc
 *   date_from  ISO yyyy-mm-dd
 *   date_to    ISO yyyy-mm-dd
 *   min_score, max_score   integer 0-100
 *   tag        exact tag string
 *
 * Backend hands back a *filtered* total so the "N of M" label always
 * reflects what the user actually sees.
 */
const KIND_LABEL = {
  session: 'Live session',
  upload: 'Uploaded video',
  analyzer_audio: 'Analyzer audio',
}

const PAGE_SIZE = 20

const SORT_LABELS = {
  created_desc:  'Newest first',
  created_asc:   'Oldest first',
  score_desc:    'Highest score',
  score_asc:     'Lowest score',
  duration_desc: 'Longest first',
  duration_asc:  'Shortest first',
}

// Build the API query string from the filter state. Skips empty
// values so the URL stays minimal.
function buildQuery(state, extra = {}) {
  const params = new URLSearchParams()
  if (state.q) params.set('q', state.q)
  if (state.sort && state.sort !== 'created_desc') params.set('sort', state.sort)
  if (state.date_from) params.set('date_from', state.date_from)
  if (state.date_to) params.set('date_to', state.date_to)
  if (state.min_score !== '' && state.min_score != null) params.set('min_score', state.min_score)
  if (state.max_score !== '' && state.max_score != null) params.set('max_score', state.max_score)
  if (state.tag) params.set('tag', state.tag)
  for (const [k, v] of Object.entries(extra)) {
    if (v != null) params.set(k, v)
  }
  return params.toString()
}

// Active = anything other than the defaults (sort: newest-first, no
// other filters). Drives the visibility of the Clear button.
function isAnyFilterActive(state) {
  return Boolean(
    state.q ||
    (state.sort && state.sort !== 'created_desc') ||
    state.date_from ||
    state.date_to ||
    state.min_score !== '' ||
    state.max_score !== '' ||
    state.tag,
  )
}

// Read URL params -> normalized state object.
function stateFromParams(sp) {
  return {
    q: sp.get('q') || '',
    sort: sp.get('sort') || 'created_desc',
    date_from: sp.get('date_from') || '',
    date_to: sp.get('date_to') || '',
    min_score: sp.get('min_score') ?? '',
    max_score: sp.get('max_score') ?? '',
    tag: sp.get('tag') || '',
  }
}

export default function History() {
  const [sp, setSp] = useSearchParams()
  const filters = useMemo(() => stateFromParams(sp), [sp])

  const [sessions, setSessions] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  // Debounce the text-search input — typing into `q` shouldn't fire
  // an HTTP request on every keystroke. The other filter controls
  // commit immediately on change.
  const [qDraft, setQDraft] = useState(filters.q)
  // Whenever `qDraft` changes, schedule a 350 ms commit to URL state.
  // Cancel pending timer on every keystroke so only the final pause
  // triggers a fetch.
  const debounceRef = useRef(null)
  useEffect(() => {
    if (qDraft === filters.q) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(sp)
      if (qDraft) next.set('q', qDraft)
      else next.delete('q')
      setSp(next, { replace: true })
    }, 350)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft])

  // Sync the draft back when URL changes from elsewhere (back button,
  // Clear filters), so the input value stays in sync with reality.
  useEffect(() => {
    setQDraft(filters.q)
  }, [filters.q])

  // Load page 1 whenever filters change.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const qs = buildQuery(filters, { limit: PAGE_SIZE, offset: 0 })
        const res = await apiFetch(`${API_BASE}/api/recordings?${qs}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        if (Array.isArray(data)) {
          setSessions(data)
          setTotal(data.length)
        } else {
          setSessions(data.items || [])
          setTotal(data.total || 0)
        }
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load sessions')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [filters])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const qs = buildQuery(filters, { limit: PAGE_SIZE, offset: sessions.length })
      const res = await apiFetch(`${API_BASE}/api/recordings?${qs}`)
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
    const ok = window.confirm(
      'Delete this recording permanently? The report, video/audio, and all chunk scores will be removed. This cannot be undone.'
    )
    if (!ok) return
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      setSessions((prev) => prev.filter((s) => s.session_id !== id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (e) {
      alert(`Delete failed: ${e.message}`)
    }
  }

  // Update one filter and reset the URL. We replace= on q (debounced
  // typing) but push= on explicit changes so back-button works.
  const updateFilter = useCallback((key, value, { replace = false } = {}) => {
    const next = new URLSearchParams(sp)
    if (value === '' || value == null) next.delete(key)
    else next.set(key, value)
    setSp(next, { replace })
  }, [sp, setSp])

  function clearAll() {
    setSp(new URLSearchParams(), { replace: false })
    setQDraft('')
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

  const anyFilters = isAnyFilterActive(filters)
  const hasMore = sessions.length < total

  return (
    <div className="section history-page">
      <h2>Library</h2>
      <p className="subtitle">
        Past recording sessions.
        {total > 0 && (
          <span style={{ opacity: 0.7, marginLeft: 8 }}>
            ({sessions.length} of {total})
          </span>
        )}
      </p>

      {/* ── Search + Sort bar ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <input
          type="search"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          placeholder="Search title, topic, tags…"
          style={{
            flex: '1 1 240px',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #444',
            background: '#1c1c24',
            color: '#eee',
            fontSize: '0.95rem',
          }}
        />
        <select
          value={filters.sort}
          onChange={(e) => updateFilter('sort', e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #444',
            background: '#1c1c24',
            color: '#eee',
            fontSize: '0.9rem',
          }}
        >
          {Object.entries(SORT_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #444',
            background: showFilters ? '#2a3850' : '#1c1c24',
            color: '#eee',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          {showFilters ? 'Hide filters' : 'Filters'}
          {anyFilters && !showFilters && (
            <span style={{ color: '#4a90e2', marginLeft: 4 }}>•</span>
          )}
        </button>
        {anyFilters && (
          <button
            type="button"
            onClick={clearAll}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #555',
              background: 'transparent',
              color: '#ccc',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Filter panel ──────────────────────────────────────────── */}
      {showFilters && (
        <div
          style={{
            background: '#161620',
            border: '1px solid #2a2a35',
            borderRadius: 8,
            padding: 14,
            marginBottom: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          <label>
            <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 4 }}>From date</div>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => updateFilter('date_from', e.target.value)}
              style={panelInput}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 4 }}>To date</div>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => updateFilter('date_to', e.target.value)}
              style={panelInput}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 4 }}>Min score</div>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={filters.min_score}
              onChange={(e) => updateFilter('min_score', e.target.value)}
              placeholder="0"
              style={panelInput}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 4 }}>Max score</div>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={filters.max_score}
              onChange={(e) => updateFilter('max_score', e.target.value)}
              placeholder="100"
              style={panelInput}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 4 }}>Exact tag</div>
            <input
              type="text"
              value={filters.tag}
              onChange={(e) => updateFilter('tag', e.target.value.trim().toLowerCase())}
              placeholder="e.g. interview"
              style={panelInput}
            />
          </label>
        </div>
      )}

      {error && <div className="session-error">Failed to load: {error}</div>}

      {loading ? (
        <div className="processing">
          <div className="spinner"></div>
          <p>Loading sessions…</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="section">
          <p className="subtitle">
            {anyFilters
              ? 'No recordings match your filters.'
              : 'No sessions yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="history-grid">
            {sessions.map((s) => (
              <div key={s.session_id} className="history-card">
                {/* Shared-by badge — recipient view only. Renders
                    above the title so it's the first thing scanned. */}
                {s.shared_by && (
                  <div
                    style={{
                      display: 'inline-block',
                      background: '#2a3850',
                      color: '#cfe1ff',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: '0.7rem',
                      marginBottom: 6,
                    }}
                  >
                    Shared by {s.shared_by.name || s.shared_by.email}
                  </div>
                )}
                {/* Title (or fall back to original filename / "Untitled") */}
                <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 4 }}>
                  {s.title || s.original_name || 'Untitled recording'}
                </div>
                {s.topic && (
                  <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 6 }}>
                    Topic: {s.topic}
                  </div>
                )}
                <div className="history-card-header">
                  <strong>{formatDate(s.started_at)}</strong>
                  <span className="history-kind">{KIND_LABEL[s.kind] || s.kind}</span>
                  <span>Duration: {formatDuration(s.duration_s)}</span>
                  <span>Score: {s.score ?? '—'}</span>
                </div>
                {s.tags && s.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {s.tags.map((t) => (
                      <span
                        key={t}
                        onClick={() => updateFilter('tag', t)}
                        style={{
                          background: '#2a3850',
                          color: '#cfe1ff',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                        }}
                        title={`Filter by tag: ${t}`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {s.video_url ? (
                  <video
                    src={mediaUrl(s.video_url)}
                    controls
                    preload="metadata"
                    playsInline
                    className="processed-video"
                    style={{ width: '100%', borderRadius: 8, marginTop: 8 }}
                  />
                ) : s.audio_url ? (
                  <audio
                    src={mediaUrl(s.audio_url)}
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
                  {/* Delete is owner-only — backend enforces this
                      anyway, but hiding the button avoids the
                      confused-error UX on shared rows. */}
                  {!s.shared_by && (
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
                  )}
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
        </>
      )}
    </div>
  )
}

const panelInput = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid #444',
  background: '#1c1c24',
  color: '#eee',
  fontSize: '0.9rem',
}
