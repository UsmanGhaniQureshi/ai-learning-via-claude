import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'

export default function ProgressChart({
  topic,
  limit = 10,
  compact = false,
  currentSessionId,
}) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const params = new URLSearchParams()
        if (topic) params.set('topic', topic)
        params.set('limit', String(limit))
        const res = await apiFetch(`${API_BASE}/api/progress?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load progress')
      }
    })()
    return () => { cancelled = true }
  }, [topic, limit])

  if (error) {
    return (
      <div className="text-text-muted text-sm">
        Couldn&apos;t load progress: {error}
      </div>
    )
  }
  if (items === null) {
    return <div className="text-text-muted text-sm">Loading progress…</div>
  }
  if (items.length === 0) {
    return (
      <div className="text-text-muted text-sm">
        {topic
          ? `No past "${topic}" sessions yet — practice a few to see your trend.`
          : 'No past sessions yet — your progress will appear here after a few practices.'}
      </div>
    )
  }

  const scores = items.map((it) => Number(it.score_avg ?? 0))
  const W = compact ? 240 : 360
  const H = compact ? 56 : 80
  const PAD = 6
  const minS = 0
  const maxS = 100
  const xAt = (i) =>
    items.length === 1
      ? W / 2
      : PAD + (i * (W - 2 * PAD)) / (items.length - 1)
  const yAt = (s) => H - PAD - ((s - minS) / (maxS - minS)) * (H - 2 * PAD)
  const path = scores.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(s)}`).join(' ')

  const last = scores[scores.length - 1]
  const prev = scores.length > 1 ? scores[scores.length - 2] : null
  const delta = prev != null ? last - prev : null
  const deltaCls =
    delta == null ? 'badge-muted'
    : delta > 0 ? 'badge-success'
    : delta < 0 ? 'badge-danger'
    : 'badge-muted'
  const deltaText =
    delta == null ? 'first tracked session'
    : delta > 0 ? `+${delta} since last session`
    : delta < 0 ? `${delta} since last session`
    : 'same as last session'

  return (
    <div className={compact ? '' : 'glass-card p-4'}>
      {!compact && (
        <div className="flex justify-between items-baseline mb-2">
          <strong className="text-text-primary">Your progress {topic ? `(${topic})` : ''}</strong>
          <span className="text-xs text-text-muted">
            last {items.length} session{items.length === 1 ? '' : 's'}
          </span>
        </div>
      )}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
        <line
          x1={PAD} x2={W - PAD}
          y1={yAt(50)} y2={yAt(50)}
          stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3"
        />
        <path d={path} fill="none" stroke="#7c3aed" strokeWidth={2} />
        {scores.map((s, i) => {
          const isCurrent = currentSessionId && items[i].session_id === currentSessionId
          return (
            <circle
              key={i}
              cx={xAt(i)} cy={yAt(s)} r={isCurrent ? 4 : 3}
              fill={isCurrent ? 'transparent' : '#7c3aed'}
              stroke="#7c3aed"
              strokeWidth={isCurrent ? 2 : 0}
            >
              <title>
                {`Score ${s}${items[i].topic ? ' — ' + items[i].topic : ''}${items[i].created_at ? ' — ' + new Date(items[i].created_at).toLocaleDateString() : ''}`}
              </title>
            </circle>
          )
        })}
      </svg>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className={`badge ${deltaCls}`}>{deltaText}</span>
        {compact && items.length >= 1 && (
          <Link to="/library" className="text-text-accent text-xs hover:underline">
            See all →
          </Link>
        )}
      </div>
    </div>
  )
}
