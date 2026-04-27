import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { API_BASE, mediaUrl } from '../config'

/**
 * AudioPlaybackReview — Poised-style synchronised playback for audio-only
 * analyses. Audio analog of PlaybackReview.
 *
 * Expects `report` to have:
 *   recording.audio_url      — served via /api/analyzer/{id}/audio
 *   timeline                 — [{ t_s, speech_pace, filler_words, total, ... }]
 *                              (from generate_post_session_report)
 *   transcript               — [{ word, start_ms, is_filler }]
 *
 * As the <audio> plays, this component:
 *   - Finds the nearest timeline entry at or before currentTime and drives
 *     a "live score" panel from it (speech pace / filler-words / total).
 *   - Finds the active word (start_ms ≤ currentTime*1000 ≤ next.start_ms)
 *     and highlights it. Clicking any word jumps the audio to that moment.
 *
 * forwardRef exposes:
 *   - getCurrentTime()        → seconds (float). Used by the comments
 *                               composer's "Set start/end at current"
 *                               buttons.
 *   - seekAndPlay(start, end?) → seek to `start` and play. If `end`
 *                               is provided AND > start, attach a
 *                               timeupdate listener that auto-pauses
 *                               at `end` and removes itself, so the
 *                               playback respects the comment's range.
 */
const AudioPlaybackReview = forwardRef(function AudioPlaybackReview({ report }, ref) {
  const audioRef = useRef(null)
  const transcriptContainerRef = useRef(null)
  const activeWordRef = useRef(null)
  const [currentSegment, setCurrentSegment] = useState(null)
  const [currentWordIdx, setCurrentWordIdx] = useState(-1)

  // Imperative handle so parent (Result.jsx) can plumb the audio
  // element through to CommentsThread without lifting state.
  useImperativeHandle(ref, () => ({
    getCurrentTime() {
      return audioRef.current?.currentTime || 0
    },
    seekAndPlay(startS, endS) {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = Math.max(0, Number(startS) || 0)
      audio.play().catch(() => { /* autoplay blocked, ignore */ })
      if (endS != null && Number(endS) > Number(startS)) {
        // Attach a one-shot listener that pauses at the range end
        // and removes itself. We also clear it on the next call to
        // seekAndPlay (via a ref) so range comments don't stack
        // pause-handlers on top of each other.
        if (audio._cdRangePauseHandler) {
          audio.removeEventListener('timeupdate', audio._cdRangePauseHandler)
        }
        const handler = () => {
          if (audio.currentTime >= Number(endS)) {
            audio.pause()
            audio.removeEventListener('timeupdate', handler)
            audio._cdRangePauseHandler = null
          }
        }
        audio._cdRangePauseHandler = handler
        audio.addEventListener('timeupdate', handler)
      }
    },
  }), [])

  const rawAudioUrl = report?.recording?.audio_url
  // mediaUrl prefixes API_BASE for relative paths AND appends the
  // current JWT as ?token=, since <audio src=...> can't send the
  // Authorization header. Absolute URLs and data:/blob: pass through.
  const audioUrl = rawAudioUrl ? mediaUrl(rawAudioUrl) : null
  const timeline = useMemo(() => report?.timeline || [], [report])

  // Prefer speech_timeline.words — each chunk there is built server-side
  // with ABSOLUTE timestamps (start_ms includes the chunk offset). Fall
  // back to report.transcript if speech_timeline isn't present. Avoids the
  // old bug where report.transcript kept per-chunk (0-3000ms) offsets.
  const words = useMemo(() => {
    if (Array.isArray(report?.speech_timeline)) {
      const absolute = report.speech_timeline.flatMap((s) => s.words || [])
      if (absolute.length > 0) return absolute
    }
    return report?.transcript || []
  }, [report])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      const t = audio.currentTime
      const tMs = t * 1000

      // Nearest timeline entry at or before t (linear scan — timelines are
      // bounded at ~chunk-count ≤ a few hundred for a long recording).
      let seg = null
      for (const e of timeline) {
        if (e.t_s <= t) seg = e
        else break
      }
      setCurrentSegment(seg)

      // Active word
      let idx = -1
      for (let i = 0; i < words.length; i++) {
        const w = words[i]
        const start = w.start_ms ?? 0
        const next = words[i + 1]
        const end = next ? next.start_ms : start + 500
        if (start <= tMs && tMs < end) {
          idx = i
          break
        }
        if (start > tMs) break
      }
      setCurrentWordIdx(idx)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    return () => audio.removeEventListener('timeupdate', onTimeUpdate)
  }, [timeline, words])

  // Keep the highlighted word visible
  useEffect(() => {
    if (activeWordRef.current && transcriptContainerRef.current) {
      const container = transcriptContainerRef.current
      const el = activeWordRef.current
      const cRect = container.getBoundingClientRect()
      const eRect = el.getBoundingClientRect()
      if (eRect.top < cRect.top || eRect.bottom > cRect.bottom) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }, [currentWordIdx])

  const scoreColor = (s) => {
    if (s == null) return '#888'
    return s >= 71 ? '#00c853' : s >= 41 ? '#ffd600' : '#ff1744'
  }

  const handleWordClick = (w) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = (w.start_ms || 0) / 1000
    audio.play().catch(() => {})
  }

  if (!audioUrl) return null

  return (
    <div className="playback-review">
      <h3>Playback Review</h3>
      <p className="pb-subtitle">
        Play the audio — scores and transcript sync to the current moment.
        Click any word to jump there.
      </p>

      <div className="pb-grid">
        <div className="pb-video-wrap">
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            preload="auto"
            style={{ width: '100%' }}
          />
        </div>

        <div className="pb-live-panel">
          <div className="pb-live-card">
            <div className="pb-live-label">Total</div>
            <div
              className="pb-live-value"
              style={{ color: scoreColor(currentSegment?.total) }}
            >
              {currentSegment?.total ?? '—'}
            </div>
            <div className="pb-live-meta">
              {currentSegment
                ? `@ ${currentSegment.t_s}s`
                : 'press play to see live scores'}
            </div>
          </div>

          <div className="pb-live-card">
            <div className="pb-live-label">Speech pace</div>
            <div
              className="pb-live-value"
              style={{ color: scoreColor(currentSegment?.speech_pace) }}
            >
              {currentSegment?.speech_pace ?? '—'}
            </div>
            <div className="pb-live-meta">
              Fillers score: {currentSegment?.filler_words ?? '—'}
            </div>
          </div>
        </div>
      </div>

      {words.length > 0 && (
        <div className="pb-transcript">
          <div className="pb-transcript-label">Transcript</div>
          <div className="pb-transcript-text" ref={transcriptContainerRef}>
            {words.map((w, i) => {
              const isActive = i === currentWordIdx
              return (
                <span
                  key={i}
                  ref={isActive ? activeWordRef : null}
                  className={
                    'pb-word' +
                    (isActive ? ' pb-word-active' : '') +
                    (w.is_filler ? ' pb-word-filler' : '')
                  }
                  onClick={() => handleWordClick(w)}
                >
                  {w.word}{' '}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})

export default AudioPlaybackReview
