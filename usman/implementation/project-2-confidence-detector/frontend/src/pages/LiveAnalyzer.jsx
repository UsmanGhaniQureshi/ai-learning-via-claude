import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
 *
 * Flow:
 *   1. User clicks Start Recording.
 *   2. getUserMedia({ audio }) — no video permission needed.
 *   3. Open WS /ws/session/:id?kind=analyzer_audio.
 *   4. Web Audio graph: MediaStreamSource -> ScriptProcessor -> 16kHz
 *      Float32 chunks pushed into a 3-sec buffer. Whole buffer is sent
 *      as binary over WS whenever it fills. Server returns per-chunk
 *      scores + transcript — driving the live gauge + transcript.
 *   5. In parallel, MediaRecorder captures a full audio blob we upload
 *      at stop time so /result/:id has something to play back.
 *   6. On stop: flush any partial buffer, send stop_session, upload the
 *      recorded blob, await session_ended, navigate to /result/:id.
 */
export default function LiveAnalyzer() {
  const [state, setState] = useState('idle') // idle | starting | active | stopping
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
  // English-only enforcement signal sent by the backend's
  // multilingual probe in audio_pipeline. When set to a language
  // code the WS handler stops broadcasting per-chunk scores and we
  // render a banner asking the user to switch to English.
  const [unsupportedLanguage, setUnsupportedLanguage] = useState(null)
  // Pre-session setup (topic + duration) and countdown overlay state.
  // Same pattern as LiveSession.jsx — see that file for the rationale.
  const [setup, setSetup] = useState(null)
  const [showCountdown, setShowCountdown] = useState(false)
  const [recStartedAt, setRecStartedAt] = useState(null)

  // ── Cleanup — always safe to call ──────────────────────────────────
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

  // Linear resample browser-native → 16 kHz.
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

  // Send whole 3-sec chunks. DON'T zero-pad the tail — the live session
  // pipeline treats silence-padded chunks as real input and hallucinates.
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

  // ── Start ──────────────────────────────────────────────────────────
  const start = async () => {
    setError(null)
    setConnectionLost(false)
    setLanguageWarning(null)
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
      // Audio constraints OFF — see useLiveSession.js for the
      // accuracy rationale. Live audio must reach the backend with
      // the same prosody the upload path sees.
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

    // Open WS with ?kind=analyzer_audio
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
      if (userStopRef.current) return // normal termination
      setConnectionLost(true)
      setError(
        'Connection lost during the session. Saving what was captured so far…'
      )
      // Route through the normal stop flow so the partial report lands
      // in the DB and the UI transitions to /result.
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

    // MediaRecorder for the eventual playback blob.
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

    // Web Audio graph — capture Float32 PCM, resample to 16 kHz.
    let ctx
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
    } catch {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
    }
    audioCtxRef.current = ctx
    const inputRate = ctx.sampleRate
    const source = ctx.createMediaStreamSource(stream)

    // AudioWorkletNode runs on the audio rendering thread — UI
    // re-renders (transitions, big state updates) can't drop audio
    // frames here, unlike ScriptProcessorNode which shared the main
    // thread and was officially deprecated.
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

  // Pre-session flow: setup → countdown → start. The setup form is the
  // same component LiveSession uses; the analyser just doesn't render
  // the gesture badge afterwards.
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
    // Note: stop is a function declared below this — JS hoisting makes
    // the reference resolvable at call time even though it's not yet
    // defined when this useCallback is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // ── Stop ───────────────────────────────────────────────────────────
  const stop = async () => {
    if (state !== 'active') return
    userStopRef.current = true
    setState('stopping')

    // Stop audio capture.
    if (processorRef.current) {
      try { processorRef.current.disconnect() } catch {}
    }
    if (audioCtxRef.current) {
      try { await audioCtxRef.current.close() } catch {}
      audioCtxRef.current = null
    }
    flushAudioBuffer(true)

    // Collect MediaRecorder blob.
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

    // Ask server to finalize, then wait for session_ended or 15s timeout.
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

    // Upload the audio blob for playback.
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
        console.warn('audio upload failed', e)
      }
    }

    cleanup()
    navigate(`/result/${mediaIdRef.current}`, { replace: true })
  }

  const totalScore = scores?.total ?? 0
  const barScores = scores
    ? {
        voiceSteadiness: scores.voice_steadiness ?? 50,
        eyeContact: 50, // N/A for audio-only, render neutral
        speechPace: scores.speech_pace ?? 50,
        fillerWords: scores.filler_words ?? 50,
        vocalVariety: scores.vocal_variety ?? 50,
        expression: 50,
      }
    : null
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="live-session-container">
      <h2>Live Audio Analyzer</h2>
      <p className="subtitle">
        Speak into the mic — scores and transcript update in real time. No
        camera needed.
      </p>

      {error && <div className="session-error">{error}</div>}

      {state === 'idle' && !showCountdown && (
        <PracticeSetup onStart={handleSetupComplete} ctaLabel="Start recording" />
      )}

      {showCountdown && (
        <CountdownOverlay onComplete={handleCountdownComplete} />
      )}

      {state === 'starting' && (
        <div className="session-starting">
          <div className="spinner"></div>
          <p>Requesting microphone access…</p>
        </div>
      )}

      {(state === 'active' || state === 'stopping') && (
        <div className="session-active">
          {connectionLost && (
            <div
              className="session-error"
              style={{
                background: '#4a1f1f',
                border: '1px solid #8a3333',
                color: '#ff9b9b',
                marginBottom: 12,
              }}
            >
              <strong>Connection lost.</strong> Saving what was captured
              so far — we'll redirect you to the report in a moment.
            </div>
          )}
          {unsupportedLanguage && (
            <div
              style={{
                background: '#4a1f1f',
                border: '1px solid #8a3333',
                color: '#ff9b9b',
                padding: '12px 14px',
                borderRadius: 6,
                marginBottom: 12,
                fontSize: '0.95em',
              }}
            >
              <strong>We detected {languageDisplayName(unsupportedLanguage)}.</strong>{' '}
              The app currently supports English only. Stop and try
              again in English — score updates have been paused for
              this session.
            </div>
          )}

          {setup?.promptTitle && (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                background: '#1a1a22',
                borderLeft: '3px solid #4a90e2',
                borderRadius: 4,
                fontSize: '0.92rem',
              }}
            >
              <div style={{ opacity: 0.7, fontSize: '0.78rem', marginBottom: 2 }}>
                Topic
              </div>
              <div><strong>{setup.promptTitle}</strong></div>
            </div>
          )}

          {setup?.durationMin && (
            <div style={{ marginBottom: 12 }}>
              <PracticeTimer
                targetMin={setup.durationMin}
                startedAtMs={recStartedAt}
                onTimeUp={handleTimeUp}
              />
            </div>
          )}

          <div className="session-status-bar">
            <div className="status-left">
              <span className="rec-indicator">
                <span className="rec-dot"></span> REC
              </span>
              {!setup && (
                <span className="session-duration">{fmt(duration)}</span>
              )}
            </div>
          </div>

          <div className="session-score-panel" style={{ margin: '0 auto' }}>
            <ScoreGauge score={totalScore} label="Confidence" size={180} />
          </div>

          {/* LiveAnalyzer is audio-only — face signals never apply. */}
          {barScores && <SignalBars scores={barScores} faceUnavailable={true} />}

          {transcript && (
            <div className="live-transcript">
              <h4>Live Transcript</h4>
              <div className="transcript-box">{transcript}</div>
            </div>
          )}

          <button
            className="stop-session-btn"
            onClick={stop}
            disabled={state === 'stopping'}
          >
            {state === 'stopping' ? 'Finalising…' : 'Stop Recording'}
          </button>
        </div>
      )}
    </div>
  )
}
