import { useEffect, useRef, useState, useMemo } from 'react'
import { API_BASE } from '../config'

/**
 * PlaybackReview — Poised-style synchronised playback.
 *
 * Plays the server's overlay video and, as it plays, surfaces:
 *   - The face confidence / expression / eye contact at the current moment
 *     (nearest face_timeline entry, which runs every ~2 s).
 *   - The speech score + any fillers at the current moment
 *     (nearest speech_timeline entry, one per 3 s chunk).
 *   - A word-by-word transcript with the active word highlighted.
 *     Clicking a word jumps the video to that word's start time.
 *
 * All data comes from the /api/upload response (face_timeline +
 * speech_timeline.words with absolute timestamps).
 */
export default function PlaybackReview({ processedVideo, faceTimeline, speechTimeline }) {
  const videoRef = useRef(null)
  const transcriptContainerRef = useRef(null)
  const activeWordRef = useRef(null)
  const [currentFace, setCurrentFace] = useState(null)
  const [currentSpeech, setCurrentSpeech] = useState(null)
  const [currentWordIdx, setCurrentWordIdx] = useState(-1)

  // Flatten all words with absolute timestamps once, not per timeupdate.
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

      // Nearest face_timeline entry at or before t
      let fEntry = null
      for (const e of faceTimeline || []) {
        if (e.timestamp <= t) fEntry = e
        else break
      }
      setCurrentFace(fEntry)

      // Nearest speech_timeline entry at or before t
      let sEntry = null
      for (const e of speechTimeline || []) {
        if (e.timestamp <= t) sEntry = e
        else break
      }
      setCurrentSpeech(sEntry)

      // Active word — linear scan is fine, typical sessions have <1k words
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

  // Keep the active word in view without jumping the whole page
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

  const handleWordClick = (word) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = word.start_ms / 1000
    videoRef.current.play().catch(() => {})
  }

  if (!processedVideo) return null

  return (
    <div className="playback-review">
      <h3>Playback Review</h3>
      <p className="pb-subtitle">
        Play the video — scores and transcript sync to the current moment.
        Click any word to jump there.
      </p>

      <div className="pb-grid">
        <div className="pb-video-wrap">
          <video
            ref={videoRef}
            src={`${API_BASE}/api/video/${processedVideo}`}
            controls
            playsInline
            className="processed-video"
            style={{ width: '100%', borderRadius: 8 }}
          />
        </div>

        <div className="pb-live-panel">
          <div className="pb-live-card">
            <div className="pb-live-label">Face</div>
            <div
              className="pb-live-value"
              style={{ color: scoreColor(currentFace?.face_confidence) }}
            >
              {currentFace?.face_confidence ?? '—'}
            </div>
            <div className="pb-live-meta">
              {currentFace?.expression || '—'}
              {currentFace?.eye_contact_pct != null && (
                <> · Eye {currentFace.eye_contact_pct}%</>
              )}
            </div>
          </div>

          <div className="pb-live-card">
            <div className="pb-live-label">Speech</div>
            <div
              className="pb-live-value"
              style={{ color: scoreColor(currentSpeech?.speech_score) }}
            >
              {currentSpeech?.speech_score ?? '—'}
            </div>
            <div className="pb-live-meta">
              {currentSpeech?.fillers?.length > 0
                ? `Fillers: ${currentSpeech.fillers.join(', ')}`
                : 'No fillers in this chunk'}
            </div>
          </div>
        </div>
      </div>

      {allWords.length > 0 && (
        <div className="pb-transcript">
          <div className="pb-transcript-label">Transcript</div>
          <div className="pb-transcript-text" ref={transcriptContainerRef}>
            {allWords.map((w, i) => {
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
}
