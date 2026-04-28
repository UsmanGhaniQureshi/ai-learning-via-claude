import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { API_BASE, apiFetch, wsUrl } from '../config'
import ScoreGauge from '../components/ScoreGauge'
import SignalBars from '../components/SignalBars'
import PracticeSetup from '../components/PracticeSetup'
import CountdownOverlay from '../components/CountdownOverlay'
import PracticeTimer from '../components/PracticeTimer'
import { languageDisplayName } from '../utils/language'

/**
 * LiveAnalyzer — real-time audio analyzer.
 *
 * Same server pipeline as Live Practice, minus face. Opens a WebSocket
 * with ?kind=analyzer_audio so the backend persists as source_kind
 * 'analyzer_audio' and uses /api/analyzer/:id/audio for playback.
 */
export default function LiveAnalyzer() {
  const [state, setState] = useState('idle')
  const [scores, setScores] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(null)

  const navigate = useNavigate()

  const mediaStreamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const processorRef = useRef(null)
  const wsRef = useRef(null)
  const audioBufferRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const mediaIdRef = useRef(null)
  const durationTimerRef = useRef(null)
  const startedAtRef = useRef(null)
  const reportReceivedRef = useRef(false)
  const lastTranscriptRef = useRef('')
  const userStopRef = useRef(false)
  const [connectionLost, setConnectionLost] = useState(false)
  const [unsupportedLanguage, setUnsupportedLanguage] = useState(null)
  const [setup, setSetup] = useState(null)
  const [showCountdown, setShowCountdown] = useState(false)
  const [recStartedAt, setRecStartedAt] = useState(null)
  const [uploadWarning, setUploadWarning] = useState(null)

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      try { processorRef.current.disconnect() } catch {}
      processorRef.current = null
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close() } catch {}
      audioCtxRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
    audioBufferRef.current = []
  }, [])

  useEffect(() => cleanup, [cleanup])

  const resample = (input, inRate, outRate = 16000) => {
    if (inRate === outRate) return new Float32Array(input)
    const ratio = inRate / outRate
    const outLen = Math.floor(input.length / ratio)
    const out = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) {
      const src = i * ratio
      const idx = Math.floor(src)
      const frac = src - idx
      out[i] = input[idx] * (1 - frac) + (input[idx + 1] || 0) * frac
    }
    return out
  }

  const flushAudioBuffer = (force = false) => {
    const CHUNK = 16000 * 3
    while (audioBufferRef.current.length >= CHUNK) {
      const chunk = new Float32Array(audioBufferRef.current.splice(0, CHUNK))
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try { wsRef.current.send(chunk.buffer) } catch {}
      }
    }
    if (force) audioBufferRef.current = []
  }

  const start = async () => {
    setError(null)
    setConnectionLost(false)
    // Bug fix: was `setLanguageWarning(null)` — that setter doesn't exist
    // (state was renamed). The old call threw a ReferenceError on every
    // Start click and the page never advanced past 'idle'.
    setUnsupportedLanguage(null)
    setUploadWarning(null)
    userStopRef.current = false
    setState('starting')
    setScores(null)
    setTranscript('')
    setDuration(0)
    lastTranscriptRef.current = ''
    reportReceivedRef.current = false

    const mediaId = `analyzer_${Date.now().toString(36)}`
    mediaIdRef.current = mediaId

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      })
    } catch (e) {
      setError('Microphone access denied.')
      setState('idle')
      return
    }
    mediaStreamRef.current = stream

    const ws = new WebSocket(wsUrl(`/ws/session/${mediaId}?kind=analyzer_audio`))
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onmessage = (event) => {
      let data
      try { data = JSON.parse(event.data) } catch { return }
      if (data.type === 'error') {
        setError(data.message || 'Backend error')
        return
      }
      if (data.type === 'language_unsupported' && data.language) {
        setUnsupportedLanguage(data.language)
        return
      }
      if (data.type === 'session_ended') {
        reportReceivedRef.current = true
        return
      }
      if (data.scores) setScores(data.scores)
      if (data.transcript_text && data.transcript_text.trim()) {
        const t = data.transcript_text.trim()
        const normalised = t.toLowerCase().replace(/[.,!?]+$/g, '').trim()
        if (normalised && normalised !== lastTranscriptRef.current) {
          lastTranscriptRef.current = normalised
          setTranscript((prev) => (prev + ' ' + t).trim())
        }
      }
    }
    ws.onerror = () => setError('WebSocket connection failed')
    ws.onclose = () => {
      if (userStopRef.current) return
      setConnectionLost(true)
      setError('Connection lost during the session. Saving what was captured so far…')
      setTimeout(() => { stop().catch(() => {}) }, 50)
    }

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WebSocket timeout')), 5000)
      ws.addEventListener('open', () => { clearTimeout(t); resolve() }, { once: true })
      ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('WebSocket error')) }, { once: true })
    }).catch((e) => {
      setError(e.message)
      cleanup()
      setState('idle')
    })

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 })
    recordedChunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data)
    }
    recorder.start(1000)
    mediaRecorderRef.current = recorder

    let ctx
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
    } catch {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
    }
    audioCtxRef.current = ctx
    const inputRate = ctx.sampleRate
    const source = ctx.createMediaStreamSource(stream)

    await ctx.audioWorklet.addModule('/audioProcessor.worklet.js')
    const processor = new AudioWorkletNode(ctx, 'audio-processor')
    processorRef.current = processor
    processor.port.onmessage = (event) => {
      if (!event.data || event.data.type !== 'frame') return
      const frame = event.data.data
      const resampled = resample(frame, inputRate, 16000)
      for (let i = 0; i < resampled.length; i++) {
        audioBufferRef.current.push(resampled[i])
      }
      flushAudioBuffer(false)
    }
    source.connect(processor)

    startedAtRef.current = Date.now()
    setRecStartedAt(startedAtRef.current)
    durationTimerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)

    setState('active')
  }

  function handleSetupComplete(s) {
    setSetup(s)
    setShowCountdown(true)
  }
  function handleCountdownComplete() {
    setShowCountdown(false)
    start()
  }
  const handleTimeUp = useCallback(() => {
    if (state === 'active') {
      stop().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const stop = async () => {
    if (state !== 'active') return
    userStopRef.current = true
    setState('stopping')

    if (processorRef.current) {
      try { processorRef.current.disconnect() } catch {}
    }
    if (audioCtxRef.current) {
      try { await audioCtxRef.current.close() } catch {}
      audioCtxRef.current = null
    }
    flushAudioBuffer(true)

    const recorder = mediaRecorderRef.current
    let audioBlob = null
    if (recorder && recorder.state !== 'inactive') {
      audioBlob = await new Promise((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
        }
        recorder.stop()
      })
    }

    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'stop_session' })) } catch {}
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 15000)
        const check = setInterval(() => {
          if (reportReceivedRef.current) {
            clearInterval(check)
            clearTimeout(timer)
            resolve()
          }
        }, 100)
      })
    }

    if (audioBlob) {
      try {
        const form = new FormData()
        form.append('audio', audioBlob, `${mediaIdRef.current}.webm`)
        form.append('session_id', mediaIdRef.current)
        await apiFetch(`${API_BASE}/api/session/upload-audio`, {
          method: 'POST',
          body: form,
        })
      } catch (e) {
        setUploadWarning(`Audio upload failed: ${e.message || e}. Your session was scored, but playback may be unavailable.`)
      }
    }

    cleanup()
    navigate(`/result/${mediaIdRef.current}`, { replace: true })
  }

  const totalScore = scores?.total ?? 0
  const barScores = scores
    ? {
        voiceSteadiness: scores.voice_steadiness ?? 50,
        eyeContact: 50,
        speechPace: scores.speech_pace ?? 50,
        fillerWords: scores.filler_words ?? 50,
        vocalVariety: scores.vocal_variety ?? 50,
        expression: 50,
      }
    : null
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  let banner = null
  if (connectionLost) {
    banner = { cls: 'toast-danger', text: 'Connection lost. Saving what was captured so far…' }
  } else if (unsupportedLanguage) {
    banner = { cls: 'toast-danger', text: `We detected ${languageDisplayName(unsupportedLanguage)}. The app currently supports English only — stop and try again in English.` }
  }

  return (
    <div>
      <p className="text-sm text-text-muted mb-6">
        <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
        {' / '}
        <Link to="/analyzer" className="hover:text-text-accent transition-colors">Speech Analyzer</Link>
        {' / '}
        <span className="text-text-secondary">Live Mic</span>
      </p>

      {error && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-4">
          {error}
        </div>
      )}
      {uploadWarning && (
        <div className="bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-warning text-sm rounded-md px-4 py-2 mb-4">
          {uploadWarning}
        </div>
      )}

      {state === 'idle' && !showCountdown && (
        <PracticeSetup onStart={handleSetupComplete} ctaLabel="Start recording" />
      )}

      {showCountdown && (
        <CountdownOverlay onComplete={handleCountdownComplete} topicTitle={setup?.promptTitle} />
      )}

      {state === 'starting' && (
        <div className="glass-card p-12 text-center max-w-md mx-auto space-y-3">
          <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-primary">Requesting microphone access…</p>
        </div>
      )}

      {(state === 'active' || state === 'stopping') && (
        <div className="space-y-4">
          {banner && <div className={`toast ${banner.cls}`}>{banner.text}</div>}

          <div className="flex items-center justify-between flex-wrap gap-3">
            {setup?.promptTitle ? (
              <span className="badge badge-accent">📍 {setup.promptTitle}</span>
            ) : <span />}
            {!setup?.durationMin && (
              <span className="text-text-muted text-sm tabular-nums">{fmt(duration)}</span>
            )}
          </div>

          {setup?.durationMin && (
            <PracticeTimer
              targetMin={setup.durationMin}
              startedAtMs={recStartedAt}
              onTimeUp={handleTimeUp}
            />
          )}

          <div className="glass-card p-6 flex flex-col items-center gap-3">
            <div className="flex items-center gap-1.5 bg-[rgba(0,0,0,0.4)] backdrop-blur-xs px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
              <span className="text-white text-xs font-medium">REC</span>
            </div>
            <ScoreGauge score={totalScore} size={180} label="Confidence" />
          </div>

          <details className="glass-card group">
            <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-text-secondary flex items-center gap-2 select-none">
              <span className="transition-transform group-open:rotate-180">▾</span>
              <span>Signal Details</span>
            </summary>
            <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
              {barScores && <SignalBars scores={barScores} faceUnavailable />}
              {transcript && (
                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Live Transcript
                  </p>
                  <div className="bg-page/60 border border-border rounded-md p-3 text-sm text-text-secondary leading-relaxed max-h-56 overflow-y-auto">
                    {transcript}
                  </div>
                </div>
              )}
            </div>
          </details>

          <button
            onClick={stop}
            disabled={state === 'stopping'}
            className="btn btn-danger btn-full btn-lg mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state === 'stopping' ? 'Finalising…' : '■ Stop Recording'}
          </button>
        </div>
      )}
    </div>
  )
}
