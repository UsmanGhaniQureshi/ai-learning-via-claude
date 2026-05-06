import { parseTimeStr, fmtSecs } from '../utils/timeStr'

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
    <div className="bg-page/60 border border-border rounded-md p-3 mt-2">
      <p className="text-xs text-text-muted mb-3">
        Trim segments (analysis only runs on these, played in order). Format: <code className="bg-elevated px-1.5 py-0.5 rounded">MM:SS</code> or seconds. Combined min 3 s.
      </p>

      <div className="space-y-2">
        {segments.map((seg, idx) => (
          <div key={idx} className="flex items-center gap-2 flex-wrap">
            <span className="w-6 text-text-muted text-xs">#{idx + 1}</span>
            <input
              type="text"
              placeholder="0:00"
              value={seg.start}
              onChange={(e) => update(idx, 'start', e.target.value)}
              className="input"
              style={{ width: 90 }}
            />
            <button
              type="button"
              onClick={() => captureCurrent(idx, 'start')}
              title="Use current playback time as start"
              className="btn btn-secondary btn-sm"
            >
              Use
            </button>
            <span className="text-text-muted">→</span>
            <input
              type="text"
              placeholder={previewDuration ? fmtSecs(previewDuration) : 'M:SS'}
              value={seg.end}
              onChange={(e) => update(idx, 'end', e.target.value)}
              className="input"
              style={{ width: 90 }}
            />
            <button
              type="button"
              onClick={() => captureCurrent(idx, 'end')}
              title="Use current playback time as end"
              className="btn btn-secondary btn-sm"
            >
              Use
            </button>
            <button
              type="button"
              onClick={() => remove(idx)}
              title="Remove this segment"
              className="ml-auto text-text-muted hover:text-danger transition-colors text-base"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          onClick={add}
          disabled={segments.length >= maxSegments}
          className="btn btn-secondary btn-sm disabled:opacity-50"
        >
          + Add segment
        </button>
        <span className="text-xs text-text-muted">
          Combined: <strong className="text-text-primary">{fmtSecs(totalKept)}</strong>
        </span>
      </div>
    </div>
  )
}

export function validateSegments(segments, previewDuration) {
  const parsed = []
  for (let i = 0; i < segments.length; i++) {
    const { start, end } = segments[i]
    if (!start && !end) continue
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
