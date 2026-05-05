import { useEffect, useRef, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

/**
 * VoiceCapture — Part 2 (camera ON) and Part 3 (camera OFF) of
 * Personal Setup. Drives N × 60-second recordings (one per key in
 * `voicePrompts`), posts each to /api/calibration/voice with `mode`
 * set accordingly, and advances on quality-pass.
 *
 * Props:
 *   mode          "video" | "audio"
 *   voicePrompts  { 0: { title, text }, ... } — prompt count derived
 *                  from this object's keys, not hard-coded
 *   onComplete    () => void
 *
 * State machine per prompt: prompt → countdown → recording → uploading
 * → success → next prompt OR onComplete after the final success.
 */
export default function VoiceCapture({ mode, voicePrompts, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [phase, setPhase] = useState('prompt')
  const [errorReason, setErrorReason] = useState(null)
  const [countdown, setCountdown] = useState(3)
  const [progress, setProgress] = useState(0)
  const [stream, setStream] = useState(null)
  const [audioLevel, setAudioLevel] = useState(0)

  const videoRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recTimerRef = useRef(null)
  const analyserRef = useRef(null)
  const audioCtxRef = useRef(null)

  const promptKeys = Object.keys(voicePrompts || {})
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  const currentKey = promptKeys[stepIndex]
  const currentPrompt = currentKey != null ? voicePrompts?.[currentKey] : null

  // Acquire mic (always) and camera (video mode only) once on mount.
  useEffect(() => {
    let cancelled = false
    let s = null
    async function go() {
      try {
        const constraints = {
          audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
          video: mode === 'video'
            ? { width: 640, height: 480, frameRate: 30 }
            : false,
        }
        s = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        setStream(s)
        if (videoRef.current && mode === 'video') {
          videoRef.current.srcObject = s
        }
        // Audio level meter — used to confirm the mic is picking
        // anything up. Visualised as a wave for audio mode and as a
        // small pulse pip for video mode.
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        audioCtxRef.current = audioCtx
        const src = audioCtx.createMediaStreamSource(s)
        const an = audioCtx.createAnalyser()
        an.fftSize = 256
        src.connect(an)
        analyserRef.current = an
      } catch (e) {
        const which = mode === 'video' ? 'camera and microphone' : 'microphone'
        setErrorReason(`Could not access ${which}. Allow access and reload.`)
        setPhase('failed')
      }
    }
    go()
    return () => {
      cancelled = true
      if (s) s.getTracks().forEach((t) => t.stop())
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close() } catch { /* ignore */ }
      }
    }
  }, [mode])

  // Audio meter loop — runs while phase != failed/uploading.
  useEffect(() => {
    if (!analyserRef.current) return
    let raf
    const data = new Uint8Array(analyserRef.current.fftSize)
    function tick() {
      analyserRef.current.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      setAudioLevel(Math.min(1, Math.sqrt(sum / data.length) * 3))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stream])

  useEffect(() => {
    if (!currentPrompt || !stream) return

    if (phase === 'prompt') {
      // 6 s reading time before countdown — voice prompts are
      // longer than emotion prompts so users need a beat.
      const t = setTimeout(() => {
        setCountdown(3)
        setPhase('countdown')
      }, 6000)
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
      try {
        chunksRef.current = []
        // For audio mode, only the audio track. For video mode, the
        // whole stream (video + audio). Both produce webm.
        const recordStream = mode === 'audio'
          ? new MediaStream(stream.getAudioTracks())
          : stream
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? (mode === 'video' ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus')
          : (mode === 'video' ? 'video/webm' : 'audio/webm')
        const rec = new MediaRecorder(recordStream, { mimeType: mime })
        recorderRef.current = rec
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
        }
        rec.onstop = () => uploadCapture()
        rec.start()

        const startedAt = Date.now()
        recTimerRef.current = setInterval(() => {
          const elapsed = (Date.now() - startedAt) / 1000
          setProgress(Math.min(1, elapsed / 60))
          if (elapsed >= 60) {
            clearInterval(recTimerRef.current)
            recTimerRef.current = null
            try { rec.stop() } catch { /* ignore */ }
          }
        }, 200)
      } catch (e) {
        setErrorReason(`Recording failed to start: ${e.message || e}`)
        setPhase('failed')
      }
      return () => {
        if (recTimerRef.current) clearInterval(recTimerRef.current)
      }
    }
  }, [phase, countdown, currentPrompt, stream, mode])

  async function uploadCapture() {
    setPhase('uploading')
    const blob = new Blob(chunksRef.current, {
      type: mode === 'video' ? 'video/webm' : 'audio/webm',
    })
    const fd = new FormData()
    fd.append('file', blob, `voice_${mode}_${currentKey}.webm`)
    fd.append('mode', mode)
    fd.append('prompt_index', String(currentKey))
    try {
      const res = await apiFetch(
        `${API_BASE}/api/calibration/voice`,
        { method: 'POST', body: fd },
      )
      const data = await res.json()
      if (!res.ok) {
        setErrorReason(data?.error || `Server returned ${res.status}.`)
        setPhase('failed')
        return
      }
      if (data.quality_ok) {
        // Hold on success — let the user keep this take or redo it.
        // The backend dedupes by (mode, prompt_index) so a retake
        // cleanly replaces the prior recording.
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
    setProgress(0)
    setPhase('prompt')
  }

  function continueToNext() {
    if (stepIndex + 1 >= promptKeys.length) {
      onComplete?.()
    } else {
      setStepIndex(stepIndex + 1)
      setPhase('prompt')
      setProgress(0)
    }
  }

  if (!currentPrompt) {
    return <div className="text-center py-12">Loading prompts…</div>
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">
          Recording {stepIndex + 1} of {promptKeys.length} — {mode === 'video' ? 'camera on' : 'camera off'}
        </span>
        <div className="h-1.5 bg-elevated rounded-full overflow-hidden w-40">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${promptKeys.length > 0 ? (stepIndex / promptKeys.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-display font-extrabold">
          {currentPrompt.title}
        </h2>
        <p className="text-text-secondary leading-relaxed">
          {currentPrompt.text}
        </p>
      </div>

      <div className="relative aspect-video bg-black rounded-md overflow-hidden border border-border">
        {mode === 'video' ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-soft/40 to-transparent">
            <div className="flex items-center gap-1.5">
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-accent rounded-full transition-all"
                  style={{
                    height: `${4 + audioLevel * 60 * (0.4 + Math.sin((Date.now() / 80) + i) * 0.6)}px`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {phase === 'recording' && (
          <>
            <span className="absolute top-3 left-3 flex items-center gap-2 bg-black/80 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
              <span className="text-white text-xs font-semibold">REC</span>
              <span className="text-white/85 text-xs tabular-nums">
                {Math.max(0, Math.round(60 - progress * 60))}s
              </span>
            </span>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${progress * 100}%` }}
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
            <span className="text-white text-sm">Analysing your voice…</span>
          </div>
        )}
        {phase === 'success' && (
          // Small corner badge — does not obscure the live preview /
          // audio-meter while the user reads the Keep / Retake panel.
          <span className="absolute top-3 right-3 flex items-center gap-1.5 bg-success/95 text-white px-2.5 py-1 rounded-full shadow-lg">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xs font-semibold">Captured</span>
          </span>
        )}
      </div>

      {phase === 'prompt' && (
        <div className="bg-elevated/50 border border-border rounded-md p-3 text-xs text-text-secondary">
          Read the prompt above. Recording starts in 6 seconds.
        </div>
      )}
      {phase === 'recording' && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-md p-3 text-xs text-text-primary flex items-center gap-3">
          <div className="flex-1">
            Speak naturally for the full 60 seconds. Take your time.
          </div>
          <div className="h-1 w-20 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-success transition-all"
              style={{ width: `${audioLevel * 100}%` }}
            />
          </div>
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
        <div className="bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.3)] rounded-md p-4 space-y-3">
          <p className="text-sm text-text-primary">
            Captured. Happy with this take, or want to redo it?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={continueToNext}
              className="btn btn-primary btn-sm flex-1"
            >
              {stepIndex + 1 >= promptKeys.length ? 'Finish part →' : 'Keep & continue →'}
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
  )
}
