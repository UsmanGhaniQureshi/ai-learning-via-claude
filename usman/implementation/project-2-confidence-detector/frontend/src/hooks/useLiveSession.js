import { useState, useRef, useCallback, useEffect } from 'react'
import { API_BASE, apiFetch, mediaUrl, wsUrl } from '../config'
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
  // 'connected' | 'lost' — surfaced as a banner in LiveSession. Flips
  // to 'lost' when the WS closes unexpectedly while the session is
  // still active; stays 'connected' during normal user-triggered stop.
  const [connectionStatus, setConnectionStatus] = useState('connected')
  // null when the input is English (or not yet probed). Set to the
  // detected language code (e.g. "hi", "es") once the backend's
  // multilingual probe (in audio_pipeline.AudioPipeline) decides
  // the input isn't English. The product is English-only — when
  // this fires we render a clear banner and the live score gauge
  // stops updating (the WS handler stops broadcasting too).
  const [unsupportedLanguage, setUnsupportedLanguage] = useState(null)

  // Transient flag set when the backend's bounded queue dropped a
  // chunk because Whisper inference fell behind. Auto-clears after
  // a few seconds. The UI shows a tiny "Server catching up..."
  // indicator while it's true. Doesn't change session state.
  const [backpressure, setBackpressure] = useState(false)
  const backpressureTimerRef = useRef(null)

  // Server-side FaceEngine calibration state. The backend collects
  // 90 frames of blendshapes (~13 s at 6.7 Hz) to establish a
  // per-user expression baseline, then signals "calibrated". The UI
  // shows a "Calibrating…" badge until then so the user understands
  // why the gauge isn't yet reflecting their expression.
  const [calibrating, setCalibrating] = useState(false)

  // "We don't hear you yet" detector. After Batch-5 the backend's
  // SignalScorer.aggregate() returns total=null when every audio
  // signal is None — i.e. silent chunks no longer produce a fake
  // face-only headline. We count consecutive null-total chunks here;
  // 5 in a row (~15 s at 3-s chunk cadence) flips noSpeechDetected so
  // LiveSession.jsx can surface a banner. Resets to 0 on any non-null
  // total or when the session leaves 'active'.
  const [noSpeechDetected, setNoSpeechDetected] = useState(false)
  const silentChunkCountRef = useRef(0)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const reportRef = useRef(null)
  // Tracks whether the user clicked Stop. Without this we can't
  // distinguish an intentional WS close (user pressed Stop) from a
  // network drop, and we'd try to "recover" from the normal
  // termination path.
  const userStopRef = useRef(false)
  // Ref to the latest stopSession function. Needed because the ws
  // onclose handler is installed inside startSession (which is
  // useCallback-memoized with [] deps), so its closure captures
  // stopSession from the first render — a stale one whose sessionState
  // is still 'idle'. Reading through a ref gets us the live version.
  const stopSessionRef = useRef(null)

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
    // Mark as user-initiated so the onclose handler knows this is a
    // normal termination and doesn't trigger the "connection lost"
    // recovery path. Must be set BEFORE we touch the WS below.
    userStopRef.current = true
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

    // Flush remaining audio buffer (final partial chunk dropped on
    // force=true). flushAudioBuffer is async now (OfflineAudioContext);
    // we await so the close-out is deterministic.
    try { await flushAudioBuffer(true) } catch (e) { /* ignore */ }

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
        const res = await apiFetch(`${API_BASE}/api/report/${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          if (data && !data.error) {
            setReport(data)
            if (data.recording?.video_url) {
              setRemoteVideoUrl(mediaUrl(data.recording.video_url))
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

  // Keep the ref pointing at the most recent stopSession so the
  // onclose handler in startSession can call the live version.
  useEffect(() => {
    stopSessionRef.current = stopSession
  }, [stopSession])

  // High-quality resampler via OfflineAudioContext.
  //
  // Replaces the previous in-JS linear-interpolation pass, which
  // aliased high frequencies and attenuated pitch variance — the
  // direct cause of live `vocal_variety` scoring lower than upload
  // for the same audio. OfflineAudioContext uses the browser's
  // built-in (high-quality, windowed-sinc) sample-rate converter,
  // matching what ffmpeg's `-ar 16000` produces on the upload side.
  //
  // Async, so we batch — call once per 3-second chunk, not once per
  // worklet frame. ~3 ms per call on Chrome desktop; negligible.
  async function resampleViaOfflineCtx(input, inputRate, outputRate = 16000) {
    if (inputRate === outputRate) return new Float32Array(input)
    const outLength = Math.floor(input.length * outputRate / inputRate)
    const offlineCtx = new OfflineAudioContext(1, outLength, outputRate)
    const buffer = offlineCtx.createBuffer(1, input.length, inputRate)
    buffer.getChannelData(0).set(input)
    const src = offlineCtx.createBufferSource()
    src.buffer = buffer
    src.connect(offlineCtx.destination)
    src.start(0)
    const rendered = await offlineCtx.startRendering()
    return rendered.getChannelData(0)
  }

  // Native-rate buffer flush. We accumulate audio at the AudioWorklet's
  // native sample rate (typically 44.1 / 48 kHz) and only resample when
  // we have a full 3-second chunk worth — keeps the OfflineAudioContext
  // call rate at ~0.33 Hz instead of 100+ Hz.
  //
  // NEVER zero-pad a partial chunk — padding silence into Whisper is
  // the direct cause of the "thank you for watching" hallucinations.
  // On force=true (session stopping), drop the leftover partial rather
  // than send silence.
  async function flushAudioBuffer(force = false) {
    const inputRate = audioCtxRef.current?.sampleRate || 16000
    const NATIVE_CHUNK = inputRate * 3   // 3 seconds at native rate
    while (audioBufferRef.current.length >= NATIVE_CHUNK) {
      const nativeChunk = new Float32Array(
        audioBufferRef.current.splice(0, NATIVE_CHUNK)
      )
      let chunk16k
      try {
        chunk16k = inputRate === 16000
          ? nativeChunk
          : await resampleViaOfflineCtx(nativeChunk, inputRate, 16000)
      } catch (e) {
        // OfflineAudioContext can throw on Safari quirks. Skip the
        // chunk rather than send garbage; the next one usually works.
        continue
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(chunk16k.buffer)
        } catch (e) { /* ignore */ }
      }
    }
    if (force) {
      audioBufferRef.current = []
    }
  }

  // setupMeta: { promptTitle, promptBody, durationMin } from PracticeSetup.
  // Forwarded to the backend over WS as a `session_meta` message right
  // after the connection opens, so report_generator → llm_coach knows
  // which topic to coach against. Optional — null/undefined means free
  // practice and the LLM coaching path short-circuits to "skipped".
  const startSession = useCallback(async (setupMeta = null) => {
    setError(null)
    setConnectionStatus('connected')
    setUnsupportedLanguage(null)
    setBackpressure(false)
    setCalibrating(false)
    setNoSpeechDetected(false)
    silentChunkCountRef.current = 0
    if (backpressureTimerRef.current) {
      clearTimeout(backpressureTimerRef.current)
      backpressureTimerRef.current = null
    }
    userStopRef.current = false
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
      // 1. Request camera + mic.
      //
      // Audio constraints: echoCancellation + noiseSuppression +
      // autoGainControl are all explicitly OFF. The browser's WebRTC
      // audio pipeline modifies the waveform when these are on:
      //   - AGC flattens RMS variance → fake-stable voice_steadiness
      //   - noiseSuppression strips breath sounds → undercounts the
      //     acoustic-filler detector
      //   - echoCancellation + AGC together mean the LIVE session
      //     scores ~10 points higher than uploading the same audio
      //
      // The trade-off: users on speakerphone or in noisy rooms will
      // get a worse transcript. The honest scoring is worth more
      // than the convenience for those cases. A user with a headset
      // mic in a quiet room gets the same numbers from live + upload.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      streamRef.current = stream
      setMediaStream(stream) // Triggers useEffect to attach once <video> mounts

      // 3. Generate session ID + open WebSocket
      const sessionId = `session_${Date.now()}`
      sessionIdRef.current = sessionId
      const ws = new WebSocket(wsUrl(`/ws/session/${sessionId}`))
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

          // One-shot English-only enforcement — fired by
          // main.py:session_ws when the multilingual probe in
          // AudioPipeline decides the first voiced chunk isn't
          // English. After this the WS handler stops broadcasting
          // per-chunk score updates (the numbers would be
          // misleading), so the gauge naturally freezes. The UI
          // renders a banner asking the user to stop and switch to
          // English.
          if (data.type === 'language_unsupported' && data.language) {
            setUnsupportedLanguage(data.language)
            return
          }

          // Backpressure: server's bounded queue dropped a chunk
          // because Whisper inference fell behind. Surface a brief
          // indicator and auto-clear — there's nothing the user can
          // do, but seeing "Server catching up..." beats silently
          // losing 3 s of audio with no feedback.
          if (data.type === 'backpressure') {
            setBackpressure(true)
            if (backpressureTimerRef.current) {
              clearTimeout(backpressureTimerRef.current)
            }
            backpressureTimerRef.current = setTimeout(() => {
              setBackpressure(false)
              backpressureTimerRef.current = null
            }, 2500)
            return
          }

          // FaceEngine calibration state from the backend (Batch 4).
          // Fired one-shot at the start of calibration and once
          // again when it completes; UI renders a "Calibrating…"
          // badge in between so the user knows why the gauge looks
          // muted for the first ~13 s.
          if (data.type === 'calibrating') {
            setCalibrating(true)
            return
          }
          if (data.type === 'calibrated') {
            setCalibrating(false)
            return
          }

          // Final report message
          if (data.type === 'session_ended' && data.report) {
            reportRef.current = data.report
            setReport(data.report)
            if (data.report.recording?.video_url) {
              setRemoteVideoUrl(mediaUrl(data.report.recording.video_url))
            }
            setSessionState('report')
            return
          }

          // Score update per chunk
          if (data.scores) {
            setScores(data.scores)
            if (data.scores.total != null) {
              // Real audio arrived → reset the silence counter and
              // clear the "we don't hear you" banner if it was up.
              silentChunkCountRef.current = 0
              setNoSpeechDetected(false)
              setScoreHistory((prev) => [
                ...prev,
                {
                  time: sessionStartRef.current
                    ? (Date.now() - sessionStartRef.current) / 1000
                    : 0,
                  score: data.scores.total,
                },
              ])
            } else {
              // total=null means every audio signal was None for this
              // chunk (Batch-5 fix). Count consecutive nulls; flip the
              // banner once we hit 5 in a row (~15 s).
              silentChunkCountRef.current += 1
              if (silentChunkCountRef.current >= 5) {
                setNoSpeechDetected(true)
              }
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

      // Handle unexpected disconnect (Wi-Fi blip, tab suspended, server
      // restart). We DON'T attempt a live reconnect with the same
      // session_id because the backend pipeline's in-memory snapshots
      // are lost the moment its WS handler exits — a silent resume
      // would splice a new pipeline's output into the user's report
      // timeline in confusing ways. Instead: tell the user clearly,
      // stop local capture, and fall back to fetching whatever the
      // backend already persisted via HTTP — the stopSession() flow
      // already handles that HTTP fallback.
      ws.onclose = () => {
        if (userStopRef.current) return // normal termination
        // Unexpected: mark the UI and short-circuit into the normal
        // stop path so the user lands on /result with whatever data
        // got saved before the drop.
        setConnectionStatus('lost')
        setError(
          'Connection lost during the session. Saving what was captured up to that point…'
        )
        // Defer the stop slightly so React gets to paint the banner
        // before the HTTP fallback begins — otherwise the user sees
        // the UI freeze for a second with no explanation.
        setTimeout(() => {
          const stop = stopSessionRef.current
          if (stop) stop().catch(() => {})
        }, 50)
      }

      // Wait for WS to open
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 5000)
        ws.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
        ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket error')) }, { once: true })
      })

      // Once the socket is open, ship the practice topic so the
      // backend can hand it to llm_coach at finalize time. Sent ONCE;
      // subsequent messages would just overwrite (no-op in normal
      // flow). Free-practice sessions skip this and the coaching
      // path short-circuits to "skipped".
      if (setupMeta?.promptTitle) {
        try {
          ws.send(JSON.stringify({
            type: 'session_meta',
            prompt_title: setupMeta.promptTitle,
            prompt_body: setupMeta.promptBody || '',
          }))
        } catch (e) { /* ignore — coaching just won't fire */ }
      }

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

      // Load the AudioWorklet once per context. The worklet runs on the
      // audio thread so UI re-renders, transitions, and heavy DOM work
      // can't drop audio frames — unlike the old ScriptProcessorNode,
      // which ran on the main thread.
      await audioCtx.audioWorklet.addModule('/audioProcessor.worklet.js')
      const processor = new AudioWorkletNode(audioCtx, 'audio-processor')
      audioProcessorRef.current = processor

      processor.port.onmessage = (event) => {
        if (!event.data || event.data.type !== 'frame') return
        const frame = event.data.data // Float32Array at inputRate
        // Push raw native-rate samples; flushAudioBuffer batches
        // the resample to whole 3-s chunks via OfflineAudioContext.
        for (let i = 0; i < frame.length; i++) {
          audioBufferRef.current.push(frame[i])
        }
        // Fire-and-forget: the async resample MUST NOT block the
        // worklet message pump or we drop frames. If a flush errors
        // it's logged inside the function and the next frame retries.
        flushAudioBuffer(false).catch(() => {})
      }

      // AudioWorkletNode's process() fires even without a downstream
      // connection, so we don't need the old mute-sink plumbing. Just
      // tap the source into the worklet and let its port deliver frames.
      source.connect(processor)

      // 6. Start browser face detection
      setFaceActive(true)

      // 7. Send face data to backend.
      //
      // Cadence: 150 ms (matches MediaPipe detection rate in
      // useFaceDetection). The bump from 500 ms is necessary for
      // calibration — the server-side FaceEngine needs 90 frames
      // to establish a baseline; at 150 ms that's ~13.5 s, at the
      // old 500 ms it would have been 45 s of "calibrating" before
      // any real scoring kicked in.
      //
      // Payload shape: raw landmarks + blendshapes (Batch 4). The
      // backend runs the canonical FaceEngine on these so live and
      // upload paths produce comparable scores. We still also send
      // the legacy 4-field `scores` block as a fallback in case the
      // backend hasn't been redeployed — that path stays readable
      // by older WS handlers.
      faceIntervalRef.current = setInterval(() => {
        if (!(wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) return
        const fs = faceScoresRef.current
        const raw = fs?._rawFaceRef?.current
        const payload = {
          type: 'face',
          scores: {
            eye_contact: fs.eye_contact,
            expression: fs.expression,
            tension: fs.tension,
            face_detected: fs.face_detected,
          },
        }
        if (raw && raw.landmarks && raw.blendshapes) {
          payload.landmarks = raw.landmarks
          payload.blendshapes = raw.blendshapes
          payload.timestamp = raw.timestamp
        }
        try {
          wsRef.current.send(JSON.stringify(payload))
        } catch (e) { /* ignore */ }
      }, 150)

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
    connectionStatus,
    unsupportedLanguage,
    backpressure,
    calibrating,
    noSpeechDetected,
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
