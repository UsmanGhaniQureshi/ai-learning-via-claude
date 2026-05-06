import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { mediaUrl } from '../config'

const AudioPlaybackReview = forwardRef(function AudioPlaybackReview({ report }, ref) {
  const audioRef = useRef(null)
  const transcriptContainerRef = useRef(null)
  const activeWordRef = useRef(null)
  const [currentSegment, setCurrentSegment] = useState(null)
  const [currentWordIdx, setCurrentWordIdx] = useState(-1)

  useImperativeHandle(ref, () => ({
    getCurrentTime() {
      return audioRef.current?.currentTime || 0
    },
    seekAndPlay(startS, endS) {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = Math.max(0, Number(startS) || 0)
      audio.play().catch(() => {})
      if (endS != null && Number(endS) > Number(startS)) {
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
  const audioUrl = rawAudioUrl ? mediaUrl(rawAudioUrl) : null
  const timeline = useMemo(() => report?.timeline || [], [report])

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

      let seg = null
      for (const e of timeline) {
        if (e.t_s <= t) seg = e
        else break
      }
      setCurrentSegment(seg)

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

  const colorClass = (s) => {
    if (s == null) return 'text-text-muted'
    return s >= 71 ? 'text-success' : s >= 41 ? 'text-warning' : 'text-danger'
  }

  const handleWordClick = (w) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = (w.start_ms || 0) / 1000
    audio.play().catch(() => {})
  }

  if (!audioUrl) return null

  return (
    <div className="glass-card p-5 my-6">
      <h3 className="mb-1">Playback Review</h3>
      <p className="text-text-secondary text-sm mb-4">
        Play the audio — scores and transcript sync to the current moment. Click any word to jump there.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
        <div>
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            preload="auto"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="bg-page/60 border border-border rounded-md p-3">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Total</p>
            <p className={`text-3xl font-display font-bold leading-none ${colorClass(currentSegment?.total)}`}>
              {currentSegment?.total ?? '—'}
            </p>
            <p className="text-text-secondary text-xs mt-1">
              {currentSegment ? `@ ${currentSegment.t_s}s` : 'press play to see live scores'}
            </p>
          </div>

          <div className="bg-page/60 border border-border rounded-md p-3">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Speech pace</p>
            <p className={`text-3xl font-display font-bold leading-none ${colorClass(currentSegment?.speech_pace)}`}>
              {currentSegment?.speech_pace ?? '—'}
            </p>
            <p className="text-text-secondary text-xs mt-1">
              Fillers score: {currentSegment?.filler_words ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {words.length > 0 && (
        <div className="bg-page/60 border border-border rounded-md p-4 mt-4">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Transcript</p>
          <div ref={transcriptContainerRef} className="max-h-44 overflow-y-auto leading-relaxed text-text-secondary text-sm">
            {words.map((w, i) => {
              const isActive = i === currentWordIdx
              const cls = [
                'cursor-pointer px-1 py-0.5 rounded transition-colors',
                isActive ? 'bg-accent text-white' : 'hover:bg-elevated hover:text-text-primary',
                w.is_filler ? 'text-warning italic' : '',
                isActive && w.is_filler ? 'bg-warning text-white' : '',
              ].join(' ')
              return (
                <span
                  key={i}
                  ref={isActive ? activeWordRef : null}
                  className={cls}
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
