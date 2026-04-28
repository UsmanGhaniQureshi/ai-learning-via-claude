import { useEffect, useRef, useMemo, useState } from 'react'

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

  const wordsInWindow = useMemo(() => {
    const startMs = startTime * 1000
    const endMs = endTime * 1000
    return (words || []).filter(
      (w) => w.start_ms >= startMs && w.start_ms < endMs
    )
  }, [words, startTime, endTime])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

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
      v.play().catch(() => {})
    }

    const onTimeUpdate = () => {
      if (hasSeekedRef.current && v.currentTime >= endTime) {
        v.pause()
        setPausedAtEnd(true)
      }
    }

    v.addEventListener('loadeddata', seekAndPlay)
    v.addEventListener('canplay', seekAndPlay)
    v.addEventListener('timeupdate', onTimeUpdate)

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
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-up"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-card w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-page/60">
          <div className="flex items-center gap-3 flex-wrap text-text-primary">
            <strong>{fmt(startTime)} – {fmt(endTime)}</strong>
            {expression && <span className="badge badge-muted">{expression}</span>}
            {score != null && <span className="badge badge-accent">Score {score}</span>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted hover:text-text-primary text-2xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 p-5 overflow-auto">
          <div className="bg-black rounded-md overflow-hidden relative">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              preload="auto"
              className="w-full block"
            />
            {pausedAtEnd && (
              <button
                onClick={handleReplay}
                className="absolute right-3 bottom-14 btn btn-primary btn-sm"
              >
                ↻ Replay this window
              </button>
            )}
          </div>

          <div className="bg-page/60 border border-border rounded-md p-4 min-h-[180px]">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
              Words in this {duration}s window
            </p>
            {wordsInWindow.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 text-text-secondary text-sm leading-relaxed">
                {wordsInWindow.map((w, i) => (
                  <span
                    key={i}
                    className={`px-1.5 py-0.5 rounded ${
                      w.is_filler
                        ? 'bg-[rgba(245,158,11,0.15)] text-warning italic'
                        : 'bg-elevated'
                    }`}
                    title={`${(w.start_ms / 1000).toFixed(2)}s`}
                  >
                    {w.word}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-text-muted text-sm italic">No transcribed words in this window.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
