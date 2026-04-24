import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, WS_BASE } from '../config'
import ScoreGauge from '../components/ScoreGauge'
import SignalBars from '../components/SignalBars'

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
  const muteSinkRef = useRef(null)
  const wsRef = useRef(null)
  const audioBufferRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const mediaIdRef = useRef(null)
  const durationTimerRef = useRef(null)
  const startedAtRef = useRef(null)
  const reportReceivedRef = useRef(false)
  const lastTranscriptRef = useRef('')

  // ── Cleanup — always safe to call ──────────────────────────────────
  const cleanup = useCallback(() => {
    if (processorRef.current) {
      try { processorRef.current.disconnect() } catch {}
      processorRef.current = null
    }
    if (muteSinkRef.current) {
      try { muteSinkRef.current.disconnect() } catch {}
      muteSinkRef.current = null
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
          echoCancellation: true,
          noiseSuppression: true,
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
    const ws = new WebSocket(`${WS_BASE}/ws/session/${mediaId}?kind=analyzer_audio`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onmessage = (event) => {
      let data
      try { data = JSON.parse(event.data) } catch { return }
      if (data.type === 'error') {
        setError(data.message || 'Backend error')
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
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      const resampled = resample(input, inputRate, 16000)
      for (let i = 0; i < resampled.length; i++) {
        audioBufferRef.current.push(resampled[i])
      }
      flushAudioBuffer(false)
    }
    // Muted GainNode downstream so ScriptProcessor runs without mic feedback.
    const muteSink = ctx.createGain()
    muteSink.gain.value = 0
    muteSinkRef.current = muteSink
    source.connect(processor)
    processor.connect(muteSink)
    muteSink.connect(ctx.destination)

    startedAtRef.current = Date.now()
    durationTimerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)

    setState('active')
  }

  // ── Stop ───────────────────────────────────────────────────────────
  const stop = async () => {
    if (state !== 'active') return
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
        await fetch(`${API_BASE}/api/session/upload-audio`, {
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

      {state === 'idle' && (
        <div className="session-idle">
          <div className="idle-info">
            <p className="info-large">Ready to start?</p>
            <p className="info-small">
              We'll ask for microphone access. Audio is streamed for
              analysis and also saved for you to play back afterwards.
            </p>
          </div>
          <button className="start-session-btn" onClick={start}>
            <span className="start-icon">&#x25B6;</span>
            Start Recording
          </button>
        </div>
      )}

      {state === 'starting' && (
        <div className="session-starting">
          <div className="spinner"></div>
          <p>Requesting microphone access…</p>
        </div>
      )}

      {(state === 'active' || state === 'stopping') && (
        <div className="session-active">
          <div className="session-status-bar">
            <div className="status-left">
              <span className="rec-indicator">
                <span className="rec-dot"></span> REC
              </span>
              <span className="session-duration">{fmt(duration)}</span>
            </div>
          </div>

          <div className="session-score-panel" style={{ margin: '0 auto' }}>
            <ScoreGauge score={totalScore} label="Confidence" size={180} />
          </div>

          {barScores && <SignalBars scores={barScores} />}

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
