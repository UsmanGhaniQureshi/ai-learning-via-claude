import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'

/**
 * ProgressChart — fetches GET /api/progress and renders:
 *   - a lightweight inline SVG sparkline of `score_avg` over time
 *     (no chart-lib dependency — stays under 80 lines and zero kB
 *     on the wire vs adding chart.js or recharts)
 *   - a delta pill: "+4 since last session" / "-7 since last session"
 *     in green / red (or muted grey when delta is 0)
 *
 * Props:
 *   topic         optional — when set, scopes the chart + delta to
 *                 sessions with that topic (server-side filter).
 *   limit         how many sessions to fetch (default 10).
 *   compact       when true, renders a smaller strip (used on Home).
 *                 false renders a labelled card (used on Result).
 *   currentSessionId  optional — when provided, the entry matching
 *                 it gets a hollow ring marker so the user can spot
 *                 "this session" within the chart.
 *
 * Renders nothing until the data arrives. On error or empty history,
 * shows a quiet "no past sessions yet" placeholder rather than
 * vanishing — silent absence is worse UX than a stub.
 */
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
      <div style={{ opacity: 0.7, fontSize: '0.85em' }}>
        Couldn't load progress: {error}
      </div>
    )
  }
  if (items === null) {
    return <div style={{ opacity: 0.5, fontSize: '0.85em' }}>Loading progress…</div>
  }
  if (items.length === 0) {
    return (
      <div style={{ opacity: 0.6, fontSize: '0.85em' }}>
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

  // Delta pill: this session vs the previous one. The list is
  // oldest-first, so the comparison points are the last two entries.
  const last = scores[scores.length - 1]
  const prev = scores.length > 1 ? scores[scores.length - 2] : null
  const delta = prev != null ? last - prev : null
  const deltaColor =
    delta == null ? '#888'
    : delta > 0 ? '#00c853'
    : delta < 0 ? '#ff7a7a'
    : '#aaa'
  const deltaText =
    delta == null ? 'first tracked session'
    : delta > 0 ? `+${delta} since last session`
    : delta < 0 ? `${delta} since last session`
    : 'same as last session'

  return (
    <div
      style={{
        background: compact ? 'transparent' : '#161620',
        border: compact ? 'none' : '1px solid #2a2a35',
        borderRadius: 8,
        padding: compact ? 0 : 14,
        marginTop: compact ? 0 : 16,
      }}
    >
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <strong>Your progress {topic ? `(${topic})` : ''}</strong>
          <span style={{ fontSize: '0.78em', opacity: 0.6 }}>
            last {items.length} session{items.length === 1 ? '' : 's'}
          </span>
        </div>
      )}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* baseline at score=50 */}
        <line
          x1={PAD} x2={W - PAD}
          y1={yAt(50)} y2={yAt(50)}
          stroke="#2a2a35" strokeDasharray="3 3"
        />
        <path d={path} fill="none" stroke="#4a90e2" strokeWidth={2} />
        {scores.map((s, i) => {
          const isCurrent = currentSessionId && items[i].session_id === currentSessionId
          return (
            <circle
              key={i}
              cx={xAt(i)} cy={yAt(s)} r={isCurrent ? 4 : 3}
              fill={isCurrent ? 'transparent' : '#4a90e2'}
              stroke="#4a90e2"
              strokeWidth={isCurrent ? 2 : 0}
            >
              <title>
                {`Score ${s}${items[i].topic ? ' — ' + items[i].topic : ''}${items[i].created_at ? ' — ' + new Date(items[i].created_at).toLocaleDateString() : ''}`}
              </title>
            </circle>
          )
        })}
      </svg>
      <div
        style={{
          display: 'inline-block',
          marginTop: compact ? 4 : 8,
          padding: '2px 10px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${deltaColor}`,
          color: deltaColor,
          fontSize: compact ? '0.72em' : '0.82em',
        }}
      >
        {deltaText}
      </div>
      {compact && items.length >= 1 && (
        <Link
          to="/library"
          style={{
            marginLeft: 8, fontSize: '0.75em', color: '#8ab4f8',
            textDecoration: 'none',
          }}
        >
          See all →
        </Link>
      )}
    </div>
  )
}
