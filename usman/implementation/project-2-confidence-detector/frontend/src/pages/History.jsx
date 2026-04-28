import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'

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
  const [deletingId, setDeletingId] = useState(null)
  const [toast, setToast] = useState(null)

  const [qDraft, setQDraft] = useState(filters.q)
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

  useEffect(() => {
    setQDraft(filters.q)
  }, [filters.q])

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

  function showToast(text, cls = 'toast-warning') {
    setToast({ text, cls })
    setTimeout(() => setToast(null), 4000)
  }

  async function deleteSession(id) {
    const ok = window.confirm(
      'Delete this recording permanently? The report, video/audio, and all chunk scores will be removed. This cannot be undone.'
    )
    if (!ok) return
    setDeletingId(id)
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      setSessions((prev) => prev.filter((s) => s.session_id !== id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (e) {
      showToast(`Delete failed: ${e.message}`, 'toast-danger')
    } finally {
      setDeletingId(null)
    }
  }

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
    <div>
      <p className="text-sm text-text-muted mb-6">
        <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
        {' / '}
        <span className="text-text-secondary">Library</span>
      </p>

      {toast && <div className={`toast ${toast.cls}`}>{toast.text}</div>}

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="mb-1">Library</h2>
          <p className="text-text-secondary text-sm">
            Past recording sessions.
            {total > 0 && (
              <span className="text-text-muted ml-2">
                ({sessions.length} of {total})
              </span>
            )}
          </p>
        </div>
        <Link to="/live" className="btn btn-primary btn-sm">+ New Session</Link>
      </div>

      {/* Search + Sort bar */}
      <div className="flex gap-2 flex-wrap items-center mb-4">
        <input
          type="search"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          placeholder="Search title, topic, tags…"
          className="input flex-1 min-w-[240px]"
        />
        <select
          value={filters.sort}
          onChange={(e) => updateFilter('sort', e.target.value)}
          className="input w-auto"
        >
          {Object.entries(SORT_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
        >
          {showFilters ? 'Hide filters' : 'Filters'}
          {anyFilters && !showFilters && (
            <span className="text-text-accent ml-1">•</span>
          )}
        </button>
        {anyFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="btn btn-secondary btn-sm"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="glass-card p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block">
            <div className="text-xs text-text-muted mb-1">From date</div>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => updateFilter('date_from', e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">To date</div>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => updateFilter('date_to', e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Min score</div>
            <input
              type="number" min={0} max={100} step={1}
              value={filters.min_score}
              onChange={(e) => updateFilter('min_score', e.target.value)}
              placeholder="0"
              className="input"
            />
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Max score</div>
            <input
              type="number" min={0} max={100} step={1}
              value={filters.max_score}
              onChange={(e) => updateFilter('max_score', e.target.value)}
              placeholder="100"
              className="input"
            />
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Exact tag</div>
            <input
              type="text"
              value={filters.tag}
              onChange={(e) => updateFilter('tag', e.target.value.trim().toLowerCase())}
              placeholder="e.g. interview"
              className="input"
            />
          </label>
        </div>
      )}

      {error && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-4">
          Failed to load: {error}
        </div>
      )}

      {loading ? (
        <div className="glass-card p-12 text-center max-w-md mx-auto space-y-3">
          <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-primary">Loading sessions…</p>
        </div>
      ) : sessions.length === 0 ? (
        anyFilters ? (
          <div className="text-center py-16">
            <p className="text-text-secondary">No recordings match your filters.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
            <div className="w-16 h-16 rounded-xl bg-accent-soft border border-border-accent flex items-center justify-center text-3xl">
              ◈
            </div>
            <h3 className="text-text-primary">No sessions yet</h3>
            <p className="text-text-secondary text-sm max-w-xs">
              Start your first practice session to see your results here.
            </p>
            <Link to="/live" className="btn btn-primary mt-2">Start Practicing →</Link>
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sessions.map((s) => (
              <LibraryCard
                key={s.session_id}
                recording={s}
                onDelete={() => deleteSession(s.session_id)}
                deleting={deletingId === s.session_id}
                formatDate={formatDate}
                formatDuration={formatDuration}
                onTagClick={(t) => updateFilter('tag', t)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-primary disabled:opacity-50"
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

function LibraryCard({ recording, onDelete, deleting, formatDate, formatDuration, onTagClick }) {
  const status = recording.processing_status || (recording.score != null ? 'completed' : null)
  const failed = status === 'failed'
  const processing = status === 'pending' || status === 'processing'
  const completed = status === 'completed' || (status == null && recording.score != null)

  return (
    <div className="glass-card p-4 hover:-translate-y-0.5 hover:shadow-accent transition-all duration-200">
      {recording.shared_by && (
        <div className="badge badge-accent mb-2">
          Shared by {recording.shared_by.name || recording.shared_by.email}
        </div>
      )}
      <div className="flex gap-4 items-start">
        {/* Thumbnail / icon */}
        <div className="w-20 h-16 rounded-md bg-elevated flex-shrink-0 flex items-center justify-center text-2xl border border-border overflow-hidden">
          <span>{recording.kind === 'session' ? '🎥' : recording.kind === 'analyzer_audio' ? '🎤' : '📁'}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-sm text-text-primary truncate">
              {recording.title || recording.original_name || 'Untitled recording'}
            </p>
            {failed ? (
              <span className="badge badge-danger flex-shrink-0">Failed</span>
            ) : processing ? (
              <span className="badge badge-warning flex-shrink-0">Processing</span>
            ) : completed && recording.score != null ? (
              <span className="badge badge-accent flex-shrink-0">{recording.score}</span>
            ) : (
              <span className="badge badge-muted flex-shrink-0">—</span>
            )}
          </div>
          {recording.topic && (
            <p className="text-xs text-text-muted mt-0.5 truncate">Topic: {recording.topic}</p>
          )}
          <p className="text-xs text-text-muted mt-0.5">
            {formatDate(recording.started_at)} · {KIND_LABEL[recording.kind] || recording.kind} · {formatDuration(recording.duration_s)}
          </p>
        </div>
      </div>

      {recording.tags && recording.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-3">
          {recording.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTagClick(t)}
              className="badge badge-muted hover:badge-accent transition-colors"
              title={`Filter by tag: ${t}`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <Link
          to={`/result/${recording.session_id}`}
          className="btn btn-secondary btn-sm"
        >
          View →
        </Link>
        {!recording.shared_by && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="btn btn-danger btn-sm disabled:opacity-50"
            title="Delete permanently"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  )
}
