import { useEffect, useRef, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

/**
 * TrimPanel — dual-handle range slider for trimming the playback
 * file's start and end. Calls the backend's /trim endpoint with
 * { start_s, end_s } and re-loads the page on success.
 *
 * The contract from the backend is "cut-only" — scores reflect the
 * original recording, NOT the trimmed segment. We surface that
 * caveat explicitly so users aren't misled.
 *
 * Implementation note on the dual slider: HTML range inputs only
 * have one handle, so we stack two of them and use CSS pointer-events
 * to keep both reachable. Each is constrained relative to the other
 * to prevent crossover.
 */
export default function TrimPanel({ mediaId, durationS, onTrimmed }) {
  const total = Math.max(3, Math.floor(durationS || 0))
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(total)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const initRef = useRef(false)

  // When durationS arrives or changes, reset handles to span the full clip.
  useEffect(() => {
    if (!initRef.current && durationS) {
      initRef.current = true
      setStart(0)
      setEnd(Math.floor(durationS))
    }
  }, [durationS])

  // Keep the handles in valid order. When the user drags start past
  // end (or vice versa) we clamp rather than allow crossing — UX wins
  // over the few px of slider real-estate this loses.
  function onStartChange(v) {
    const x = Math.max(0, Math.min(v, end - 3))
    setStart(x)
  }
  function onEndChange(v) {
    const x = Math.min(total, Math.max(v, start + 3))
    setEnd(x)
  }

  const trimmedLen = end - start
  const willChange = start > 0 || end < total

  async function applyTrim() {
    setError(null)
    if (!willChange) return
    if (!confirmed) {
      setConfirmed(true)
      return
    }
    setBusy(true)
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${mediaId}/trim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_s: start, end_s: end }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      onTrimmed?.(data)
    } catch (e) {
      setError(e.message)
      setBusy(false)
      setConfirmed(false)
    }
  }

  function reset() {
    setStart(0)
    setEnd(total)
    setConfirmed(false)
  }

  if (total < 3) return null

  return (
    <div
      style={{
        background: '#161620',
        border: '1px solid #2a2a35',
        borderRadius: 8,
        padding: 14,
        marginTop: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>Trim playback</strong>
        <span style={{ fontSize: '0.78em', opacity: 0.7 }}>
          {fmt(start)} → {fmt(end)} &nbsp;·&nbsp; {fmt(trimmedLen)} kept
        </span>
      </div>

      {/* Two stacked sliders — simpler than a dual-overlay range and
          works without custom CSS for the thumbs. Visually shows the
          retained range on a separate progress bar above. */}
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            position: 'relative',
            height: 6,
            background: '#2a2a35',
            borderRadius: 3,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${(start / total) * 100}%`,
              right: `${100 - (end / total) * 100}%`,
              height: '100%',
              background: '#4a90e2',
              borderRadius: 3,
            }}
          />
        </div>

        <label style={{ display: 'block', fontSize: '0.85em', marginBottom: 4 }}>
          Start: {fmt(start)}
        </label>
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={start}
          onChange={(e) => onStartChange(Number(e.target.value))}
          aria-label="Trim start"
          disabled={busy}
          style={{ width: '100%' }}
        />

        <label style={{ display: 'block', fontSize: '0.85em', marginTop: 8, marginBottom: 4 }}>
          End: {fmt(end)}
        </label>
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={end}
          onChange={(e) => onEndChange(Number(e.target.value))}
          aria-label="Trim end"
          disabled={busy}
          style={{ width: '100%' }}
        />
      </div>

      <div
        style={{
          fontSize: '0.78em',
          opacity: 0.65,
          marginTop: 6,
          fontStyle: 'italic',
        }}
      >
        Note: trimming cuts the playback file. The scores you see were
        computed from the original recording — they're not recomputed
        for the trimmed segment.
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={applyTrim}
          disabled={busy || !willChange}
          className="report-btn"
        >
          {busy ? 'Trimming…' : confirmed ? 'Confirm trim' : 'Apply trim'}
        </button>
        {(willChange || confirmed) && (
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            style={{
              background: 'transparent',
              border: '1px solid #555',
              color: '#ccc',
              padding: '6px 14px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        )}
      </div>

      {confirmed && !busy && !error && (
        <div style={{ marginTop: 8, fontSize: '0.85em', color: '#ffb84d' }}>
          Click "Confirm trim" again to apply. This rewrites the file
          on the server.
        </div>
      )}
      {error && (
        <div className="session-error" style={{ marginTop: 10 }}>
          Trim failed: {error}
        </div>
      )}
    </div>
  )
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
