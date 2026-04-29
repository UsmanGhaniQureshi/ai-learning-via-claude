import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { API_BASE, apiFetch, mediaUrl } from '../config'

const KIND_LABEL = {
  session: 'Live Practice',
  upload: 'Video Upload',
  analyzer_audio: 'Audio Upload',
}

const PAGE_SIZE = 20

const SORT_LABELS = {
  created_desc: 'Newest first',
  created_asc: 'Oldest first',
  score_desc: 'Highest score',
  score_asc: 'Lowest score',
  duration_desc: 'Longest first',
  duration_asc: 'Shortest first',
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
  for (const [key, value] of Object.entries(extra)) {
    if (value != null) params.set(key, value)
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
    state.tag
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
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load sessions')
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
    } catch (err) {
      setError(err.message || 'Failed to load more')
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
      'Delete this recording permanently? The report, media, and all chunk scores will be removed. This cannot be undone.'
    )
    if (!ok) return

    setDeletingId(id)
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      setSessions((prev) => prev.filter((session) => session.session_id !== id))
      setTotal((value) => Math.max(0, value - 1))
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'toast-danger')
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

  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined) return '-'
    const minutes = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return `${minutes}:${String(sec).padStart(2, '0')}`
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
            Past recordings and analysis runs.
            {total > 0 && (
              <span className="text-text-muted ml-2">
                ({sessions.length} of {total})
              </span>
            )}
          </p>
        </div>
        <Link to="/live" className="btn btn-primary btn-sm">+ New Session</Link>
      </div>

      <div className="flex gap-2 flex-wrap items-center mb-4">
        <input
          type="search"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          placeholder="Search title, topic, tags..."
          className="input flex-1 min-w-[240px]"
        />
        <select
          value={filters.sort}
          onChange={(e) => updateFilter('sort', e.target.value)}
          className="input w-auto"
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowFilters((value) => !value)}
          className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
        >
          {showFilters ? 'Hide filters' : 'Filters'}
          {anyFilters && !showFilters && (
            <span className="text-text-accent ml-1">*</span>
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
              type="number"
              min={0}
              max={100}
              step={1}
              value={filters.min_score}
              onChange={(e) => updateFilter('min_score', e.target.value)}
              placeholder="0"
              className="input"
            />
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Max score</div>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
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
          <p className="text-text-primary">Loading sessions...</p>
        </div>
      ) : sessions.length === 0 ? (
        anyFilters ? (
          <div className="text-center py-16">
            <p className="text-text-secondary">No recordings match your filters.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
            <div className="w-16 h-16 rounded-xl bg-accent-soft border border-border-accent flex items-center justify-center text-3xl">
              O
            </div>
            <h3 className="text-text-primary">No sessions yet</h3>
            <p className="text-text-secondary text-sm max-w-xs">
              Start your first practice session to see your results here.
            </p>
            <Link to="/live" className="btn btn-primary mt-2">Start Practicing</Link>
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sessions.map((session) => (
              <LibraryCard
                key={session.session_id}
                recording={session}
                onDelete={() => deleteSession(session.session_id)}
                deleting={deletingId === session.session_id}
                formatDate={formatDate}
                formatDuration={formatDuration}
                onTagClick={(tag) => updateFilter('tag', tag)}
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
                {loadingMore ? 'Loading...' : `Load more (${total - sessions.length} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LibraryCard({ recording, onDelete, deleting, formatDate, formatDuration, onTagClick }) {
  const [showPreview, setShowPreview] = useState(false)
  const status = getRecordingStatus(recording)
  const previewUrl = recording.video_url || recording.audio_url || null
  const previewType = recording.video_url ? 'video' : recording.audio_url ? 'audio' : null
  const canPreview = Boolean(previewUrl) && status.key !== 'processing' && status.key !== 'failed'

  return (
    <div className={`history-card ${status.cardClass}`}>
      {recording.shared_by && (
        <div className="badge badge-accent mb-2">
          Shared by {recording.shared_by.name || recording.shared_by.email}
        </div>
      )}

      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <span className="badge badge-muted">{KIND_LABEL[recording.kind] || recording.kind}</span>
          <span className={status.badgeClass}>{status.label}</span>
        </div>
        {recording.score != null && status.key === 'completed' ? (
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-display font-bold leading-none text-text-primary">
              {recording.score}
            </p>
            <p className="text-xs text-text-muted">{recording.grade || 'Score'}</p>
          </div>
        ) : (
          <span className="badge badge-muted flex-shrink-0">{formatDuration(recording.duration_s)}</span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">
          {recording.title || recording.original_name || 'Untitled recording'}
        </p>
        {recording.topic && (
          <p className="mt-1 text-xs text-text-secondary">Topic: {recording.topic}</p>
        )}
        <p className="mt-1 text-xs text-text-muted">
          {formatDate(recording.started_at)} · {formatDuration(recording.duration_s)}
        </p>
      </div>

      {status.note && (
        <p className="mt-3 text-xs leading-relaxed text-text-secondary">
          {status.note}
        </p>
      )}

      {recording.tags && recording.tags.length > 0 && (
        <div className="mt-3 flex gap-1 flex-wrap">
          {recording.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className="badge badge-muted hover:badge-accent transition-colors"
              title={`Filter by tag: ${tag}`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {showPreview && canPreview && (
        <div className="history-preview">
          {previewType === 'video' ? (
            <video
              src={mediaUrl(previewUrl)}
              controls
              preload="metadata"
              playsInline
              className="w-full rounded-md bg-black"
            />
          ) : (
            <audio
              src={mediaUrl(previewUrl)}
              controls
              preload="metadata"
              className="w-full"
            />
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/result/${recording.session_id}`} className="btn btn-secondary btn-sm">
            View Result
          </Link>
          {canPreview && (
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              className="btn btn-ghost btn-sm"
            >
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
          )}
        </div>

        {recording.is_owner && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="btn btn-danger btn-sm disabled:opacity-50"
            title="Delete permanently"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  )
}

function getRecordingStatus(recording) {
  const note = recording.status_message || recording.processing_error || null

  if (recording.processing_status === 'pending' || recording.processing_status === 'processing') {
    return {
      key: 'processing',
      label: 'Processing',
      badgeClass: 'badge badge-warning',
      cardClass: 'is-processing',
      note: 'Analysis is still running. Open the result to follow progress.',
    }
  }

  if (recording.unscoreable) {
    return {
      key: 'unscoreable',
      label: 'Unscoreable',
      badgeClass: 'badge badge-warning',
      cardClass: 'is-unscoreable',
      note,
    }
  }

  if (recording.processing_status === 'failed') {
    return {
      key: 'failed',
      label: 'Failed',
      badgeClass: 'badge badge-danger',
      cardClass: 'is-failed',
      note,
    }
  }

  return {
    key: 'completed',
    label: 'Completed',
    badgeClass: 'badge badge-success',
    cardClass: '',
    note: null,
  }
}
