import { useEffect, useRef, useMemo, useState } from 'react'

/**
 * TimelineModal — plays a single face-timeline window (e.g. 00:10 → 00:12)
 * and shows the transcript words whose absolute start_ms falls inside
 * that window on the right-hand side.
 *
 * Seek timing (the tricky part):
 *   The modal's <video> may already be fully cached by the browser because
 *   PlaybackReview just played the same URL. In that case React's onLoadedData
 *   can fire BEFORE we attach the listener and we'd miss it. So instead of
 *   relying on an event, this component:
 *     1. checks videoRef.current.readyState on mount — if >= 2, seeks NOW.
 *     2. also attaches `loadeddata` for the cold-cache case.
 *     3. re-attempts in `canplay` as a belt-and-braces fallback.
 *   hasSeekedRef guards against re-seeking when multiple events fire.
 *
 * Props:
 *   videoUrl   absolute URL of the processed video
 *   startTime  seconds where the window begins (entry.timestamp)
 *   duration   seconds — window length (default 2s = face-timeline cadence)
 *   words      flat array of { word, start_ms, end_ms, is_filler } (absolute ms)
 *   expression / score  shown in header
 *   onClose    close callback
 */
export default function TimelineModal({
  videoUrl,
  startTime,
  duration = 2,
  words,
  expression,
  score,
  onClose,
}) {
  const videoRef = useRef(null)
  const hasSeekedRef = useRef(false)
  const [pausedAtEnd, setPausedAtEnd] = useState(false)
  const endTime = startTime + duration

  // Words that land inside this window
  const wordsInWindow = useMemo(() => {
    const startMs = startTime * 1000
    const endMs = endTime * 1000
    return (words || []).filter(
      (w) => w.start_ms >= startMs && w.start_ms < endMs
    )
  }, [words, startTime, endTime])

  // ESC to close + lock body scroll while open
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Seek + play — runs on mount, on prop change, and via multiple events
  // so a cached video doesn't slip through the cracks.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    hasSeekedRef.current = false
    setPausedAtEnd(false)

    const seekAndPlay = () => {
      if (hasSeekedRef.current) return
      const dur = isFinite(v.duration) ? v.duration : 0
      const safeStart = Math.max(0, Math.min(startTime, Math.max(0, dur - 0.05) || startTime))
      hasSeekedRef.current = true
      v.currentTime = safeStart
      v.play().catch(() => { /* autoplay policy */ })
    }

    const onTimeUpdate = () => {
      if (hasSeekedRef.current && v.currentTime >= endTime) {
        v.pause()
        setPausedAtEnd(true)
      }
    }

    // Cold path: wait for loadeddata/canplay.
    v.addEventListener('loadeddata', seekAndPlay)
    v.addEventListener('canplay', seekAndPlay)
    v.addEventListener('timeupdate', onTimeUpdate)

    // Warm path: video was cached by PlaybackReview, readyState already high.
    if (v.readyState >= 2) {
      seekAndPlay()
    }

    return () => {
      v.removeEventListener('loadeddata', seekAndPlay)
      v.removeEventListener('canplay', seekAndPlay)
      v.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [startTime, endTime, videoUrl])

  const fmt = (s) => {
    const m = Math.floor(s / 60)
    const ss = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }

  const handleReplay = () => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = startTime
    setPausedAtEnd(false)
    v.play().catch(() => {})
  }

  return (
    <div
      className="tm-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="tm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tm-header">
          <div className="tm-header-info">
            <strong>{fmt(startTime)} – {fmt(endTime)}</strong>
            {expression && <span className="tm-tag">{expression}</span>}
            {score != null && <span className="tm-tag tm-tag-score">Score {score}</span>}
          </div>
          <button className="tm-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="tm-body">
          <div className="tm-video-wrap">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              preload="auto"
              className="tm-video"
            />
            {pausedAtEnd && (
              <button className="tm-replay" onClick={handleReplay}>
                ↻ Replay this window
              </button>
            )}
          </div>

          <div className="tm-words-pane">
            <div className="tm-words-label">
              Words in this {duration}s window
            </div>
            {wordsInWindow.length > 0 ? (
              <div className="tm-words">
                {wordsInWindow.map((w, i) => (
                  <span
                    key={i}
                    className={'tm-word' + (w.is_filler ? ' tm-word-filler' : '')}
                    title={`${(w.start_ms / 1000).toFixed(2)}s`}
                  >
                    {w.word}
                  </span>
                ))}
              </div>
            ) : (
              <p className="tm-empty">No transcribed words in this window.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
