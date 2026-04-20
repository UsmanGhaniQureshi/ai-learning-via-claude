import { useState, useRef, useCallback, useEffect } from 'react'
import { WS_BASE, API_BASE } from '../config'
import { SessionVideoRecorder } from '../components/VideoRecorder'
import useFaceDetection from './useFaceDetection'

// Defence-in-depth: even if the backend slips a Whisper hallucination
// through, never paint these into the live transcript.
const TRANSCRIPT_BLACKLIST = new Set([
  'thank you', 'thanks', 'thanks for watching',
  'thank you for watching', 'thank you so much',
  'please subscribe', 'bye', 'bye bye', 'you', '.',
])

function normaliseTranscript(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?]+$/g, '').trim()
}

/**
 * Orchestrates a full live practice session.
 *
 * Session states: 'idle' | 'starting' | 'active' | 'stopping' | 'report'
 *
 * On startSession():
 *   - Request camera + mic
 *   - Show local <video> (smooth, instant — no server round-trip)
 *   - Open WebSocket to /ws/session/{id}
 *   - Start audio capture: send 3s Float32 PCM chunks over WS
 *   - Start browser face detection (MediaPipe JS)
 *   - Send face scores as JSON over WS every 500ms
 *   - Start video recording to blob
 *
 * On stopSession():
 *   - Stop all capture
 *   - Upload video recording to /api/session/upload-video
 *   - Close WS; server generates + sends report
 *   - Transition to 'report' state
 */
export default function useLiveSession() {
  const [sessionState, setSessionState] = useState('idle')
  const [scores, setScores] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [tips, setTips] = useState([])
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [scoreHistory, setScoreHistory] = useState([])
  const [duration, setDuration] = useState(0)
  const [mediaStream, setMediaStream] = useState(null)
  const [videoBlob, setVideoBlob] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [remoteVideoUrl, setRemoteVideoUrl] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const reportRef = useRef(null)

  // Attach stream to video element once it's mounted in the DOM
  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream
    }
  }, [mediaStream, sessionState])
  const wsRef = useRef(null)
  const audioCtxRef = useRef(null)
  const audioProcessorRef = useRef(null)
  const audioBufferRef = useRef([])
  const recorderRef = useRef(null)
  const sessionIdRef = useRef(null)
  const sessionStartRef = useRef(null)
  const faceIntervalRef = useRef(null)
  const durationIntervalRef = useRef(null)
  const lastTranscriptAppendRef = useRef('')
  const [faceActive, setFaceActive] = useState(false)

  const faceScores = useFaceDetection(videoRef, faceActive)
  const faceScoresRef = useRef(faceScores)
  useEffect(() => {
    faceScoresRef.current = faceScores
  }, [faceScores])

  const stopSession = useCallback(async () => {
    if (sessionState !== 'active') return
    setSessionState('stopping')

    // Stop face detection + face score broadcasting
    setFaceActive(false)
    if (faceIntervalRef.current) {
      clearInterval(faceIntervalRef.current)
      faceIntervalRef.current = null
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    // Stop audio capture
    if (audioProcessorRef.current) {
      try { audioProcessorRef.current.disconnect() } catch (e) { /* ignore */ }
      audioProcessorRef.current = null
    }
    if (audioCtxRef.current) {
      try { await audioCtxRef.current.close() } catch (e) { /* ignore */ }
      audioCtxRef.current = null
    }

    // Flush remaining audio buffer (final partial chunk)
    flushAudioBuffer(true)

    // Stop video recorder, expose the blob locally for inline preview,
    // then upload (non-blocking). Upload failure does NOT discard the blob —
    // the user must still be able to play back what they just recorded.
    const videoUploadPromise = (async () => {
      if (!recorderRef.current) return
      let blob = null
      try {
        blob = await recorderRef.current.stop()
      } catch (e) {
        setError(`Could not finalize recording: ${e.message || e}`)
        return
      }
      if (!blob) return
      recorderRef.current.blob = blob
      const url = URL.createObjectURL(blob)
      setVideoBlob(blob)
      setVideoUrl(url)
      if (sessionIdRef.current) {
        try {
          await recorderRef.current.uploadToServer(sessionIdRef.current)
        } catch (e) {
          setError(`Recording saved locally — server upload failed: ${e.message || e}`)
        }
      }
    })()

    // Ask server to finalize session and send report.
    // Server responds via WS with {type:'session_ended', report:...} then closes.
    const ws = wsRef.current
    const sessionId = sessionIdRef.current

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'stop_session' }))
      } catch (e) { /* ignore */ }

      // Wait up to 15 seconds for the report to arrive
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 15000)
        const onClose = () => { clearTimeout(timeout); resolve() }
        ws.addEventListener('close', onClose)
      })
    }

    // HTTP fallback: if WS didn't deliver the report, fetch it from disk
    if (!reportRef.current && sessionId) {
      try {
        const res = await fetch(`${API_BASE}/api/report/${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          if (data && !data.error) {
            setReport(data)
            if (data.recording?.video_url) {
              setRemoteVideoUrl(`${API_BASE}${data.recording.video_url}`)
            }
            setSessionState('report')
          }
        }
      } catch (e) { /* fallback failed, leave state */ }
    }

    // If still no report after both attempts, show an error but transition to report anyway
    if (!reportRef.current) {
      setError('Session ended but report could not be retrieved. Check backend logs.')
    }

    wsRef.current = null

    // Stop media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setMediaStream(null)

    // Wait for video upload to finish (non-critical)
    await videoUploadPromise.catch(() => {})
  }, [sessionState])

  // Linear interpolation resampler (browser rate -> 16kHz)
  function resample(input, inputRate, outputRate = 16000) {
    if (inputRate === outputRate) return new Float32Array(input)
    const ratio = inputRate / outputRate
    const outputLength = Math.floor(input.length / ratio)
    const output = new Float32Array(outputLength)
    for (let i = 0; i < outputLength; i++) {
      const srcIdx = i * ratio
      const idx = Math.floor(srcIdx)
      const frac = srcIdx - idx
      output[i] = input[idx] * (1 - frac) + (input[idx + 1] || 0) * frac
    }
    return output
  }

  function flushAudioBuffer(force = false) {
    // audioBufferRef contains samples already resampled to 16kHz.
    // Only send full 3s chunks. NEVER zero-pad a partial chunk —
    // padding silence into Whisper is the direct cause of the
    // "thank you for watching" hallucinations. On force=true (session
    // stopping), drop the leftover partial rather than send silence.
    const CHUNK_SIZE = 16000 * 3 // 3 seconds at 16kHz
    while (audioBufferRef.current.length >= CHUNK_SIZE) {
      const chunk = new Float32Array(audioBufferRef.current.splice(0, CHUNK_SIZE))
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(chunk.buffer)
        } catch (e) { /* ignore */ }
      }
    }
    if (force) {
      audioBufferRef.current = []
    }
  }

  const startSession = useCallback(async () => {
    setError(null)
    setSessionState('starting')
    setScores(null)
    setTranscript('')
    setTips([])
    setReport(null)
    reportRef.current = null
    setScoreHistory([])
    setDuration(0)
    setVideoBlob(null)
    setVideoUrl(null)
    setRemoteVideoUrl(null)
    audioBufferRef.current = []
    lastTranscriptAppendRef.current = ''

    try {
      // 1. Request camera + mic
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream
      setMediaStream(stream) // Triggers useEffect to attach once <video> mounts

      // 3. Generate session ID + open WebSocket
      const sessionId = `session_${Date.now()}`
      sessionIdRef.current = sessionId
      const ws = new WebSocket(`${WS_BASE}/ws/session/${sessionId}`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Backend error (e.g., models still loading)
          if (data.type === 'error') {
            setError(data.message || 'Backend error')
            return
          }

          // Final report message
          if (data.type === 'session_ended' && data.report) {
            reportRef.current = data.report
            setReport(data.report)
            if (data.report.recording?.video_url) {
              setRemoteVideoUrl(`${API_BASE}${data.report.recording.video_url}`)
            }
            setSessionState('report')
            return
          }

          // Score update per chunk
          if (data.scores) {
            setScores(data.scores)
            if (data.scores.total != null) {
              setScoreHistory((prev) => [
                ...prev,
                {
                  time: sessionStartRef.current
                    ? (Date.now() - sessionStartRef.current) / 1000
                    : 0,
                  score: data.scores.total,
                },
              ])
            }
          }
          if (data.transcript_text && data.transcript_text.trim()) {
            const newText = data.transcript_text.trim()
            const normalised = normaliseTranscript(newText)
            // Drop empty/blacklisted/duplicate (against last appended) text.
            // Defence in depth: backend already filters these, but also
            // shielding the UI keeps known hallucinations off-screen even
            // if the model parameters are later relaxed.
            if (
              normalised &&
              !TRANSCRIPT_BLACKLIST.has(normalised) &&
              normalised !== lastTranscriptAppendRef.current
            ) {
              lastTranscriptAppendRef.current = normalised
              setTranscript((prev) => (prev + ' ' + newText).trim())
            }
          }
        } catch (e) {
          // ignore non-JSON
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection failed')
      }

      // Wait for WS to open
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 5000)
        ws.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
        ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket error')) }, { once: true })
      })

      // 4. Start video recorder
      const recorder = new SessionVideoRecorder()
      await recorder.start(stream)
      recorderRef.current = recorder

      // 5. Start audio capture — resample to 16kHz Float32, send 3s chunks
      // Note: requesting sampleRate:16000 in constructor is advisory;
      // most browsers use native rate (44100/48000). We resample in JS.
      let audioCtx
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
        })
      } catch (e) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      }
      const inputRate = audioCtx.sampleRate
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      audioProcessorRef.current = processor

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        // Resample from browser native rate to 16kHz
        const resampled = resample(input, inputRate, 16000)
        for (let i = 0; i < resampled.length; i++) {
          audioBufferRef.current.push(resampled[i])
        }
        flushAudioBuffer(false)
      }

      // Use a muted GainNode sink instead of connecting to audioCtx.destination.
      // ScriptProcessor needs a downstream node to keep onaudioprocess firing,
      // but routing the captured stream to the speakers caused mic feedback
      // (and contaminated the very audio we then transcribe).
      const muteSink = audioCtx.createGain()
      muteSink.gain.value = 0
      source.connect(processor)
      processor.connect(muteSink)
      muteSink.connect(audioCtx.destination)

      // 6. Start browser face detection
      setFaceActive(true)

      // 7. Send face scores every 500ms
      faceIntervalRef.current = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const fs = faceScoresRef.current
          try {
            wsRef.current.send(
              JSON.stringify({
                type: 'face',
                scores: {
                  eye_contact: fs.eye_contact,
                  expression: fs.expression,
                  tension: fs.tension,
                  face_detected: fs.face_detected,
                },
              })
            )
          } catch (e) { /* ignore */ }
        }
      }, 500)

      // 8. Duration timer
      sessionStartRef.current = Date.now()
      durationIntervalRef.current = setInterval(() => {
        if (sessionStartRef.current) {
          setDuration(Math.floor((Date.now() - sessionStartRef.current) / 1000))
        }
      }, 1000)

      setSessionState('active')
    } catch (e) {
      setError(e.message || 'Failed to start session')
      setSessionState('idle')
      // Cleanup any partial state
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      setMediaStream(null)
      if (wsRef.current) {
        try { wsRef.current.close() } catch (err) { /* ignore */ }
        wsRef.current = null
      }
    }
  }, [])

  const resetSession = useCallback(() => {
    setSessionState('idle')
    setScores(null)
    setTranscript('')
    setTips([])
    setReport(null)
    reportRef.current = null
    setError(null)
    setScoreHistory([])
    setDuration(0)
    setVideoBlob(null)
    setVideoUrl(null)
    setRemoteVideoUrl(null)
    sessionIdRef.current = null
    sessionStartRef.current = null
    recorderRef.current = null
    lastTranscriptAppendRef.current = ''
  }, [])

  // Revoke the local blob URL when it changes or on unmount, to prevent leaks.
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (wsRef.current) {
        try { wsRef.current.close() } catch (e) { /* ignore */ }
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close() } catch (e) { /* ignore */ }
      }
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current)
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
    }
  }, [])

  return {
    sessionState,
    videoRef,
    scores,
    transcript,
    tips,
    report,
    error,
    scoreHistory,
    duration,
    faceScores,
    videoBlob,
    videoUrl,
    remoteVideoUrl,
    startSession,
    stopSession,
    resetSession,
  }
}
