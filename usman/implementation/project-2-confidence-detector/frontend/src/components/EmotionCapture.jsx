import { useEffect, useRef, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

/**
 * EmotionCapture — Part 1 of Personal Setup.
 *
 * Renders N emotion captures back-to-back using the per-user
 * shuffled order returned by /api/calibration/start. For each:
 *   1. Show the emotion name + recall-prompt for 5 s
 *   2. Show a 3-2-1 countdown
 *   3. Record 10 s of webcam video
 *   4. POST to /api/calibration/emotion/{label}
 *   5. On quality_ok=true → green tick → auto-advance
 *      On quality_ok=false → show reason + Try Again
 *
 * Props:
 *   emotionOrder    string[]                  — emotion labels (count
 *                                               derived from backend
 *                                               EMOTION_PROMPTS)
 *   emotionPrompts  Record<string, string>    — full prompt copy
 *   onComplete      () => void                — fired after all N
 */
export default function EmotionCapture({ emotionOrder, emotionPrompts, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [phase, setPhase] = useState('prompt') // prompt | countdown | recording | uploading | success | failed
  const [errorReason, setErrorReason] = useState(null)
  const [countdown, setCountdown] = useState(3)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [stream, setStream] = useState(null)

  const videoRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recTimerRef = useRef(null)

  const currentEmotion = emotionOrder?.[stepIndex] ?? null
  const currentPrompt = currentEmotion ? emotionPrompts?.[currentEmotion] : null

  // Acquire the camera once on mount; reuse the same stream across
  // all captures so the user doesn't see a permission re-prompt.
  useEffect(() => {
    let cancelled = false
    let s = null
    async function go() {
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: 30 },
          audio: false,
        })
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        setStream(s)
        if (videoRef.current) {
          videoRef.current.srcObject = s
        }
      } catch (e) {
        setErrorReason('Camera permission was denied. Please allow camera access and reload.')
        setPhase('failed')
      }
    }
    go()
    return () => {
      cancelled = true
      if (s) s.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Bind the stream to the <video> element on every phase change so
  // the preview survives the conditional rendering of overlay states.
  useEffect(() => {
    if (videoRef.current && stream && !videoRef.current.srcObject) {
      videoRef.current.srcObject = stream
    }
  }, [phase, stream])

  // Phase machine.
  useEffect(() => {
    if (!currentEmotion || !stream) return

    if (phase === 'prompt') {
      // Auto-advance to countdown after 5 s reading time.
      const t = setTimeout(() => {
        setCountdown(3)
        setPhase('countdown')
      }, 5000)
      return () => clearTimeout(t)
    }

    if (phase === 'countdown') {
      if (countdown <= 0) {
        setPhase('recording')
        return
      }
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
      return () => clearTimeout(t)
    }

    if (phase === 'recording') {
      // Start MediaRecorder, record exactly 10 s, then stop.
      try {
        chunksRef.current = []
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
          ? 'video/webm;codecs=vp8'
          : 'video/webm'
        const rec = new MediaRecorder(stream, { mimeType: mime })
        recorderRef.current = rec
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
        }
        rec.onstop = () => uploadCapture()
        rec.start()

        const startedAt = Date.now()
        recTimerRef.current = setInterval(() => {
          const elapsed = (Date.now() - startedAt) / 1000
          setRecordingProgress(Math.min(1, elapsed / 10))
          if (elapsed >= 10) {
            clearInterval(recTimerRef.current)
            recTimerRef.current = null
            try { rec.stop() } catch { /* ignore */ }
          }
        }, 100)
      } catch (e) {
        setErrorReason(`Recording failed to start: ${e.message || e}`)
        setPhase('failed')
      }
      return () => {
        if (recTimerRef.current) clearInterval(recTimerRef.current)
      }
    }
  }, [phase, countdown, currentEmotion, stream])

  async function uploadCapture() {
    setPhase('uploading')
    const blob = new Blob(chunksRef.current, { type: 'video/webm' })
    const fd = new FormData()
    fd.append('file', blob, `${currentEmotion}.webm`)
    try {
      const res = await apiFetch(
        `${API_BASE}/api/calibration/emotion/${currentEmotion}`,
        { method: 'POST', body: fd },
      )
      const data = await res.json()
      if (!res.ok) {
        setErrorReason(data?.error || `Server returned ${res.status}.`)
        setPhase('failed')
        return
      }
      if (data.quality_ok) {
        // Hold on success — let the user choose to keep or retake.
        // The backend overwrites by label on re-POST, so a retake is
        // a clean replacement.
        setPhase('success')
      } else {
        setErrorReason(data.reason || 'Quality check failed.')
        setPhase('failed')
      }
    } catch (e) {
      setErrorReason(`Upload failed: ${e.message || e}`)
      setPhase('failed')
    }
  }

  function retry() {
    setErrorReason(null)
    setRecordingProgress(0)
    setPhase('prompt')
  }

  function continueToNext() {
    if (stepIndex + 1 >= emotionOrder.length) {
      onComplete?.()
    } else {
      setStepIndex(stepIndex + 1)
      setPhase('prompt')
      setRecordingProgress(0)
    }
  }

  if (!currentEmotion) {
    return <div className="text-center py-12">Loading emotions…</div>
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">
          Expression {stepIndex + 1} of {emotionOrder.length}
        </span>
        <div className="h-1.5 bg-elevated rounded-full overflow-hidden w-40">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${((stepIndex) / emotionOrder.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-3xl sm:text-4xl font-display font-extrabold capitalize">
          {currentEmotion}
        </h2>
        <p className="text-text-secondary leading-relaxed max-w-2xl mx-auto">
          {currentPrompt}
        </p>
      </div>

      <div className="grid sm:grid-cols-[2fr_1fr] gap-5 items-start">
        <div className="relative aspect-video bg-black rounded-md overflow-hidden border border-border">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          {phase === 'recording' && (
            <>
              <span className="absolute top-3 left-3 flex items-center gap-2 bg-black/80 px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                <span className="text-white text-xs font-semibold">REC</span>
              </span>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${recordingProgress * 100}%` }}
                />
              </div>
            </>
          )}
          {phase === 'countdown' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="text-9xl font-display font-extrabold text-white animate-pulse">
                {countdown}
              </div>
            </div>
          )}
          {phase === 'uploading' && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-white text-sm">Analysing…</span>
            </div>
          )}
          {phase === 'success' && (
            // Small corner badge — does not obscure the live preview
            // while the user reads the Keep / Retake panel.
            <span className="absolute top-3 right-3 flex items-center gap-1.5 bg-success/95 text-white px-2.5 py-1 rounded-full shadow-lg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-xs font-semibold">Captured</span>
            </span>
          )}
        </div>

        <div className="space-y-3">
          {phase === 'prompt' && (
            <div className="bg-elevated/50 border border-border rounded-md p-3 text-xs text-text-secondary">
              Read the prompt above. Recording starts in 5 seconds.
            </div>
          )}
          {phase === 'countdown' && (
            <div className="bg-accent-soft border border-border-accent rounded-md p-3 text-xs text-text-primary">
              Get ready — recording in {countdown}…
            </div>
          )}
          {phase === 'recording' && (
            <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-md p-3 text-xs text-text-primary">
              Recording. Hold the feeling for {Math.max(0, Math.round(10 - recordingProgress * 10))} more seconds.
            </div>
          )}
          {phase === 'failed' && (
            <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-md p-3 space-y-3">
              <p className="text-sm text-text-primary">{errorReason}</p>
              <button type="button" onClick={retry} className="btn btn-secondary btn-sm">
                Try Again
              </button>
            </div>
          )}
          {phase === 'success' && (
            <div className="bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.3)] rounded-md p-3 space-y-3">
              <p className="text-sm text-text-primary">
                Captured. Happy with this one, or want another take?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={continueToNext}
                  className="btn btn-primary btn-sm flex-1"
                >
                  {stepIndex + 1 >= emotionOrder.length ? 'Finish part →' : 'Keep & continue →'}
                </button>
                <button
                  type="button"
                  onClick={retry}
                  className="btn btn-secondary btn-sm"
                >
                  Retake
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
