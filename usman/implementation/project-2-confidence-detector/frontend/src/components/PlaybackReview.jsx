import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import { mediaUrl } from '../config'

const PlaybackReview = forwardRef(function PlaybackReview(
  { processedVideo, processedVideoUrl, faceTimeline, speechTimeline },
  ref,
) {
  const videoRef = useRef(null)
  const rootRef = useRef(null)
  const transcriptContainerRef = useRef(null)
  const activeWordRef = useRef(null)

  useImperativeHandle(ref, () => ({
    seekTo(seconds) {
      const video = videoRef.current
      if (!video) return
      video.currentTime = Math.max(0, seconds)
      video.play().catch(() => {})
      if (rootRef.current) {
        rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    getCurrentTime() {
      return videoRef.current?.currentTime || 0
    },
    seekAndPlay(startS, endS) {
      const video = videoRef.current
      if (!video) return
      video.currentTime = Math.max(0, Number(startS) || 0)
      video.play().catch(() => {})
      if (rootRef.current) {
        rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      if (endS != null && Number(endS) > Number(startS)) {
        if (video._cdRangePauseHandler) {
          video.removeEventListener('timeupdate', video._cdRangePauseHandler)
        }
        const handler = () => {
          if (video.currentTime >= Number(endS)) {
            video.pause()
            video.removeEventListener('timeupdate', handler)
            video._cdRangePauseHandler = null
          }
        }
        video._cdRangePauseHandler = handler
        video.addEventListener('timeupdate', handler)
      }
    },
  }), [])
  const [currentFace, setCurrentFace] = useState(null)
  const [currentSpeech, setCurrentSpeech] = useState(null)
  const [currentWordIdx, setCurrentWordIdx] = useState(-1)

  const allWords = useMemo(
    () => (speechTimeline || []).flatMap((s) => s.words || []),
    [speechTimeline]
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => {
      const t = video.currentTime
      const tMs = t * 1000

      let fEntry = null
      for (const e of faceTimeline || []) {
        if (e.timestamp <= t) fEntry = e
        else break
      }
      setCurrentFace(fEntry)

      let sEntry = null
      for (const e of speechTimeline || []) {
        if (e.timestamp <= t) sEntry = e
        else break
      }
      setCurrentSpeech(sEntry)

      let idx = -1
      for (let i = 0; i < allWords.length; i++) {
        const w = allWords[i]
        if (w.start_ms <= tMs && tMs <= w.end_ms) {
          idx = i
          break
        }
        if (w.start_ms > tMs) break
      }
      setCurrentWordIdx(idx)
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [faceTimeline, speechTimeline, allWords])

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

  const handleWordClick = (word) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = word.start_ms / 1000
    videoRef.current.play().catch(() => {})
  }

  if (!processedVideo) return null

  return (
    <div ref={rootRef} className="glass-card p-5 my-6">
      <h3 className="mb-1">Playback Review</h3>
      <p className="text-text-secondary text-sm mb-4">
        Play the video — scores and transcript sync to the current moment. Click any word to jump there.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
        <div>
          <video
            key={processedVideoUrl || processedVideo}
            ref={videoRef}
            src={processedVideoUrl || mediaUrl(`/api/video/${processedVideo}`)}
            controls
            playsInline
            preload="auto"
            className="w-full rounded-md bg-black"
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="bg-page/60 border border-border rounded-md p-3">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Face</p>
            <p className={`text-3xl font-display font-bold leading-none ${colorClass(currentFace?.face_confidence)}`}>
              {currentFace?.face_confidence ?? '—'}
            </p>
            <p className="text-text-secondary text-xs mt-1">
              {currentFace?.expression || '—'}
              {currentFace?.eye_contact_pct != null && (
                <> · Eye {currentFace.eye_contact_pct}%</>
              )}
            </p>
          </div>

          <div className="bg-page/60 border border-border rounded-md p-3">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Speech</p>
            <p className={`text-3xl font-display font-bold leading-none ${colorClass(currentSpeech?.speech_score)}`}>
              {currentSpeech?.speech_score ?? '—'}
            </p>
            <p className="text-text-secondary text-xs mt-1">
              {currentSpeech?.fillers?.length > 0
                ? `Fillers: ${currentSpeech.fillers.join(', ')}`
                : 'No fillers in this chunk'}
            </p>
          </div>
        </div>
      </div>

      {allWords.length > 0 && (
        <div className="bg-page/60 border border-border rounded-md p-4 mt-4">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Transcript</p>
          <div ref={transcriptContainerRef} className="max-h-44 overflow-y-auto leading-relaxed text-text-secondary text-sm">
            {allWords.map((w, i) => {
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

export default PlaybackReview
