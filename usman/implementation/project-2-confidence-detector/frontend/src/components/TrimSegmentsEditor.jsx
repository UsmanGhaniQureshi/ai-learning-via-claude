import { parseTimeStr, fmtSecs } from '../utils/timeStr'

/**
 * Multi-segment trim composer.
 *
 * Renders a list of {start, end} rows the user can edit, plus an
 * "Add segment" button and a live combined-duration readout. The
 * parent owns the state and the media element (so the "Use" buttons
 * can pull `getCurrentTime()` from whatever is being previewed —
 * <video> on Upload, <audio> on Analyzer).
 *
 * Validation (combined duration min, end > start, max segments) is
 * deliberately split: this editor checks per-row sanity so the user
 * gets immediate feedback in the totals readout, but the *submit*
 * validation lives in the parent so it can show a single error
 * message in its existing error slot rather than scattering errors
 * inline.
 */
export default function TrimSegmentsEditor({
  segments,
  onChange,
  previewDuration,
  getCurrentTime,
  maxSegments = 20,
}) {
  function update(idx, key, value) {
    onChange(segments.map((s, i) => (i === idx ? { ...s, [key]: value } : s)))
  }
  function add() {
    if (segments.length >= maxSegments) return
    onChange([...segments, { start: '', end: '' }])
  }
  function remove(idx) {
    onChange(
      segments.length === 1
        ? [{ start: '', end: '' }]
        : segments.filter((_, i) => i !== idx),
    )
  }
  function captureCurrent(idx, key) {
    if (!getCurrentTime) return
    const t = getCurrentTime()
    if (Number.isFinite(t)) update(idx, key, fmtSecs(t))
  }

  const totalKept = segments.reduce((acc, { start, end }) => {
    const s = parseTimeStr(start)
    const e = parseTimeStr(end)
    return s !== null && e !== null && e > s ? acc + (e - s) : acc
  }, 0)

  return (
    <div
      style={{
        marginTop: 10, padding: 12,
        background: '#1a1a22', borderRadius: 6,
        border: '1px solid #2a2a35',
      }}
    >
      <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 8 }}>
        Trim segments (analysis only runs on these, played in order).
        Format: <code>MM:SS</code> or seconds. Combined min 3 s.
      </div>

      {segments.map((seg, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex', gap: 6, alignItems: 'center',
            marginBottom: 6, flexWrap: 'wrap',
          }}
        >
          <span style={{ width: 20, opacity: 0.6, fontSize: '0.85em' }}>
            #{idx + 1}
          </span>
          <input
            type="text"
            placeholder="0:00"
            value={seg.start}
            onChange={(e) => update(idx, 'start', e.target.value)}
            style={{ width: 80, padding: '4px 8px', borderRadius: 4 }}
          />
          <button
            type="button"
            onClick={() => captureCurrent(idx, 'start')}
            title="Use current playback time as start"
            style={{ fontSize: '0.72em', padding: '3px 6px' }}
          >
            Use
          </button>
          <span style={{ opacity: 0.5 }}>→</span>
          <input
            type="text"
            placeholder={previewDuration ? fmtSecs(previewDuration) : 'M:SS'}
            value={seg.end}
            onChange={(e) => update(idx, 'end', e.target.value)}
            style={{ width: 80, padding: '4px 8px', borderRadius: 4 }}
          />
          <button
            type="button"
            onClick={() => captureCurrent(idx, 'end')}
            title="Use current playback time as end"
            style={{ fontSize: '0.72em', padding: '3px 6px' }}
          >
            Use
          </button>
          <button
            type="button"
            onClick={() => remove(idx)}
            title="Remove this segment"
            style={{
              fontSize: '0.85em', padding: '3px 8px',
              marginLeft: 'auto', background: 'transparent',
              border: '1px solid #444', borderRadius: 4,
              color: '#aaa', cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      ))}

      <div
        style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginTop: 8,
        }}
      >
        <button
          type="button"
          onClick={add}
          disabled={segments.length >= maxSegments}
          style={{ fontSize: '0.82em', padding: '4px 10px' }}
        >
          + Add segment
        </button>
        <span style={{ fontSize: '0.82em', opacity: 0.7 }}>
          Combined: <strong>{fmtSecs(totalKept)}</strong>
        </span>
      </div>
    </div>
  )
}

/**
 * Shared submit-time validator. Parses the segment list and returns
 * either `{ ok: true, segments: [[s,e], ...] }` or
 * `{ ok: false, error: 'message' }`. Mirrors the backend's
 * `_parse_trim_segments` so the user gets a 4xx-equivalent error
 * client-side without a round trip.
 */
export function validateSegments(segments, previewDuration) {
  const parsed = []
  for (let i = 0; i < segments.length; i++) {
    const { start, end } = segments[i]
    if (!start && !end) continue   // skip blank rows silently
    const s = parseTimeStr(start)
    const e = parseTimeStr(end)
    if (s === null || e === null) {
      return { ok: false, error: `Segment ${i + 1}: times must be MM:SS or seconds (e.g. 0:30 or 30).` }
    }
    if (e <= s) {
      return { ok: false, error: `Segment ${i + 1}: end must be greater than start.` }
    }
    if (previewDuration > 0 && e > previewDuration + 0.5) {
      return { ok: false, error: `Segment ${i + 1}: end exceeds clip length (${fmtSecs(previewDuration)}).` }
    }
    parsed.push([s, e])
  }
  if (parsed.length === 0) {
    return { ok: false, error: 'Add at least one trim segment, or tick "Use full clip".' }
  }
  const total = parsed.reduce((acc, [s, e]) => acc + (e - s), 0)
  if (total < 3) {
    return { ok: false, error: 'Combined trim duration must be at least 3 seconds.' }
  }
  return { ok: true, segments: parsed }
}
