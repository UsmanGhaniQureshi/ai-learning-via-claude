import { useCallback, useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import useLiveSession from '../hooks/useLiveSession'
import ScoreGauge from '../components/ScoreGauge'
import SignalBars from '../components/SignalBars'
import FeedbackTips from '../components/FeedbackTips'
import SessionGraph from '../components/SessionGraph'
import PracticeSetup from '../components/PracticeSetup'
import CountdownOverlay from '../components/CountdownOverlay'
import PracticeTimer from '../components/PracticeTimer'
import PermissionScreen from '../components/PermissionScreen'
import RecordingReview from '../components/RecordingReview'
import BackgroundPicker from '../components/BackgroundPicker'
import LiveHUD from '../components/LiveHUD'
import EmotionMix from '../components/EmotionMix'
import AnalyzingProgress from '../components/AnalyzingProgress'
import { API_BASE, apiFetch } from '../config'
import { pollMediaStatus } from '../utils/mediaStatus'
import { languageDisplayName } from '../utils/language'

function formatDuration(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function isPermissionError(msg) {
  if (!msg) return false
  return /camera|microphone|permission|denied|NotAllowed|NotFound|getUserMedia/i.test(msg)
}

export default function LiveSession() {
  const {
    sessionState, scores, transcript, tips, error,
    connectionStatus, unsupportedLanguage, backpressure, calibrating,
    noSpeechDetected,
    scoreHistory, duration,
    activeCameraLabel, liveHud, emotion,
    videoBlob, videoUrl,
    bgMode, setBgMode, segmenterReady, segmenterError,
    setPreviewCanvas,
    startSession, stopSession, discardReview,
  } = useLiveSession()

  const navigate = useNavigate()

  const [setup, setSetup] = useState(null)
  const [showCountdown, setShowCountdown] = useState(false)
  const [recStartedAt, setRecStartedAt] = useState(null)
  const [permissionDismissed, setPermissionDismissed] = useState(false)
  // HUD density (Step 3F): "full" / "minimal" / "hidden". Persisted
  // across sessions so a user who prefers "Hidden" doesn't have to
  // re-pick on every recording.
  const [hudDensity, setHudDensityState] = useState(() => {
    try {
      const saved = localStorage.getItem('cd_hud_density')
      return ['full', 'minimal', 'hidden'].includes(saved) ? saved : 'full'
    } catch {
      return 'full'
    }
  })
  const setHudDensity = useCallback((next) => {
    setHudDensityState(next)
    try { localStorage.setItem('cd_hud_density', next) } catch { /* ignore */ }
  }, [])

  // Review-screen flags driven from the parent to RecordingReview.
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeStatus, setAnalyzeStatus] = useState(null)
  const [analyzeProgress, setAnalyzeProgress] = useState(null)
  const [analyzeError, setAnalyzeError] = useState(null)

  useEffect(() => {
    if (sessionState === 'active' && !recStartedAt) {
      setRecStartedAt(Date.now())
    }
    if (sessionState === 'idle') {
      setRecStartedAt(null)
      setAnalyzing(false)
      setAnalyzeStatus(null)
      setAnalyzeError(null)
    }
  }, [sessionState, recStartedAt])

  const handleTimeUp = useCallback(() => {
    if (sessionState === 'active') {
      stopSession().catch(() => {})
    }
  }, [sessionState, stopSession])

  function handleSetupComplete(s) {
    setSetup(s)
    setShowCountdown(true)
  }

  function handleCountdownComplete() {
    setShowCountdown(false)
    // Pass topic info to the hook so it can ship a session_meta WS
    // message for the backend's llm_coach. Without this the coach
    // path short-circuits to "skipped".
    startSession(setup)
  }

  // Analyze handler — submits the locally-recorded blob to /api/upload
  // along with optional trim windows and the title/body the user
  // confirmed in RecordingReview. The upload pipeline runs Whisper on
  // the FULL audio in one pass, which is significantly more accurate
  // than per-3s-chunk live transcription. Polls media status, then
  // routes to /result/:id.
  async function handleAnalyze({ title, body, trimSegments }) {
    if (!videoBlob) {
      setAnalyzeError('Recording not ready yet. Hold on a moment and try again.')
      return
    }
    setAnalyzeError(null)
    setAnalyzing(true)
    setAnalyzeStatus('Uploading recording…')

    const filename = `live_${Date.now().toString(36)}.webm`
    const formData = new FormData()
    formData.append('file', videoBlob, filename)
    if (trimSegments) {
      formData.append('trim_segments', JSON.stringify(trimSegments))
    }
    if (title) {
      formData.append('prompt_title', title)
      formData.append('prompt_body', body || '')
    }

    try {
      const res = await apiFetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (!data.media_id) throw new Error('Server did not return a media id')

      setAnalyzeStatus('Analyzing video — face, speech, and confidence…')
      const final = await pollMediaStatus(data.media_id, {
        onProgress: (s, payload) => {
          if (s === 'pending') setAnalyzeStatus('Queued — waiting for a worker…')
          if (s === 'processing') setAnalyzeStatus('Analyzing video — face, speech, and confidence…')
          if (payload?.progress != null) setAnalyzeProgress(payload.progress)
        },
      })
      if (final.status === 'completed') {
        navigate(`/result/${data.media_id}`)
      } else {
        throw new Error(final.error || 'Processing failed.')
      }
    } catch (e) {
      setAnalyzeError(e.message || 'Cannot connect to backend.')
      setAnalyzing(false)
      setAnalyzeStatus(null)
    }
  }

  const barScores = scores
    ? {
        voiceSteadiness: scores.voice_steadiness ?? 50,
        eyeContact: scores.eye_contact ?? 50,
        speechPace: scores.speech_pace ?? 50,
        fillerWords: scores.filler_words ?? 50,
        vocalVariety: scores.vocal_variety ?? 50,
        voiceTrembling: scores.voice_trembling ?? null,
        expression: scores.expression ?? 50,
      }
    : null

  // Use the same rolling-4-chunk value the LiveHUD shows so the
  // side-panel gauge and the on-camera number stay in lockstep.
  // Falls back to the per-chunk total (and finally 50) on the first
  // chunk before the rolling buffer is populated.
  const totalScore = liveHud?.rolling_total ?? scores?.total ?? 50

  // Pick the single most relevant tip for the always-visible "Live Tip" card.
  const currentTip = (tips && tips.length > 0)
    ? tips[0]
    : 'Stay relaxed. Your scores update every few seconds.'

  // Pick a single banner to show.
  // Priority: connection > unsupported > no-speech > backpressure > calibrating.
  // No-speech outranks calibrating because if the user genuinely isn't
  // speaking, the calibration message is misleading.
  let banner = null
  if (connectionStatus === 'lost') {
    banner = { cls: 'toast-danger', text: 'Connection lost. Saving what was captured so far…' }
  } else if (unsupportedLanguage) {
    banner = { cls: 'toast-danger', text: `We detected ${languageDisplayName(unsupportedLanguage)}. The app currently supports English only — stop and try again in English.` }
  } else if (noSpeechDetected) {
    banner = { cls: 'toast-warning', text: "We don't hear you yet — check your mic and start speaking. Scores will resume once we pick up audio." }
  } else if (backpressure) {
    banner = { cls: 'toast-info', text: 'Server catching up… (a chunk was dropped — keep speaking)' }
  } else if (calibrating) {
    banner = { cls: 'toast-info', text: 'Calibrating face baseline… expression scores will pick up in about 10 s. Sit naturally and look at the camera.' }
  }

  // Permission denied → render PermissionScreen instead of the setup form.
  const showPermission =
    sessionState === 'idle' && error && isPermissionError(error) && !permissionDismissed

  return (
    <div>
      {/* Breadcrumb */}
      <p className="text-sm text-text-muted mb-6">
        <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
        {' / '}
        <span className="text-text-secondary">Live Practice</span>
      </p>

      {/* IDLE — permission-denied path */}
      {showPermission && (
        <PermissionScreen
          error={error}
          onRetry={() => setPermissionDismissed(true)}
        />
      )}

      {/* IDLE — practice setup picker */}
      {sessionState === 'idle' && !showCountdown && !showPermission && (
        <>
          {error && !isPermissionError(error) && (
            <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-6">
              {error}
            </div>
          )}
          <PracticeSetup onStart={handleSetupComplete} />
        </>
      )}

      {/* COUNTDOWN OVERLAY */}
      {showCountdown && (
        <CountdownOverlay
          onComplete={handleCountdownComplete}
          topicTitle={setup?.promptTitle}
        />
      )}

      {/* STARTING — Requesting permissions */}
      {sessionState === 'starting' && (
        <div className="glass-card p-12 text-center max-w-md mx-auto space-y-3">
          <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-primary">Requesting camera and microphone access…</p>
          <p className="text-text-muted text-sm">Please allow access in the browser prompt</p>
        </div>
      )}

      {/* ACTIVE / STOPPING */}
      {(sessionState === 'active' || sessionState === 'stopping') && (
        <div className="space-y-4">
          {banner && (
            <div className={`toast ${banner.cls}`}>{banner.text}</div>
          )}

          {/* Topic + timer row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {setup?.promptTitle ? (
              <span className="badge badge-accent">📍 {setup.promptTitle}</span>
            ) : <span />}
            {!setup?.durationMin && (
              <span className="text-text-muted text-sm tabular-nums">{formatDuration(duration)}</span>
            )}
          </div>

          {/* Practice timer (if duration set) */}
          {setup?.durationMin && (
            <PracticeTimer
              targetMin={setup.durationMin}
              startedAtMs={recStartedAt}
              onTimeUp={handleTimeUp}
            />
          )}

          {/* Main 2-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            {/* Camera feed — rendered as a <canvas> the segmentation
                pipeline paints to directly, instead of a <video>
                bound to the captureStream output. The previous video
                approach added ~50-150 ms of perceived lag because
                browsers buffer captureStream frames before feeding
                them to a video element for smooth playback. The
                canvas-direct path shows each frame the moment the
                rAF tick paints it. CSS-mirror via scale-x-[-1] for
                the selfie-view (the captureStream content stays
                un-mirrored so the recorded webm shows the user as
                others see them, same as before). */}
            <div className="glass-card overflow-hidden relative aspect-[4/3]">
              <canvas
                ref={setPreviewCanvas}
                width={640}
                height={480}
                className="w-full h-full object-cover scale-x-[-1] bg-black"
              />
              {/* Step 3 (Live HUD): overlay-on-camera coaching surface.
                  Owns the REC indicator, elapsed timer, active camera
                  name, detection light, signal cards, density picker,
                  and the single-line coaching nudge. The old hand-
                  rolled REC/face/gesture badges that lived directly
                  in the camera card were removed when this was added.
                  Background picker still mounts BELOW the HUD so it
                  remains reachable in the bottom-centre. */}
              <LiveHUD
                liveHud={liveHud}
                elapsedSeconds={duration}
                cameraLabel={activeCameraLabel}
                density={hudDensity}
                onDensityChange={setHudDensity}
              />
              {/* Background picker stays where it was. The HUD's
                  pointer-events-none wrapper means clicks fall
                  through to this picker. We mount it bottom-centre,
                  away from the bottom-3 nudge line and the bottom-3
                  density picker, so the three don't overlap. */}
              <div className="absolute bottom-14 left-3 right-3 flex justify-center pointer-events-none">
                <div className="pointer-events-auto max-w-full">
                  <BackgroundPicker
                    mode={bgMode}
                    onChange={setBgMode}
                    segmenterReady={segmenterReady}
                    segmenterError={segmenterError}
                  />
                </div>
              </div>
            </div>

            {/* Score panel */}
            <div className="flex flex-col gap-4">
              <div className="glass-card p-5 flex flex-col items-center gap-2">
                <ScoreGauge score={totalScore} size={160} />
                <p className="text-text-accent text-sm font-semibold uppercase tracking-wider">
                  Confidence
                </p>
              </div>

              {/* Live tip card */}
              <div className="glass-card p-4 flex-1 border-l-2 border-accent">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Live Tip
                </p>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {currentTip}
                </p>
              </div>
            </div>
          </div>

          {/* Live transcript — always visible while a session is
              active so the user can SEE what the backend is hearing
              instead of having to hunt for it inside a collapsed
              drawer. Renders the placeholder copy below until the
              first real chunk arrives, so an empty session is
              obviously empty (helps debug a quiet mic). */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Live Transcript
              </p>
              {transcript && (
                <span className="text-[10px] text-text-muted">
                  Updates every ~3 s
                </span>
              )}
            </div>
            <div className="bg-page/60 border border-border rounded-md p-3 text-sm text-text-secondary leading-relaxed max-h-56 overflow-y-auto min-h-[3.5rem]">
              {transcript || (
                <span className="italic text-text-muted">
                  Listening… your words will appear here a few seconds after you start speaking.
                </span>
              )}
            </div>
          </div>

          {/* Expandable drawer for the rest of the per-signal detail */}
          <details className="glass-card group">
            <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-text-secondary flex items-center gap-2 select-none">
              <span className="transition-transform group-open:rotate-180">▾</span>
              <span>Signal Details</span>
            </summary>
            <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
              {barScores && <SignalBars scores={barScores} />}
              {emotion?.mix && (
                <div className="border border-border rounded-md px-3 py-2 bg-elevated/50">
                  <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
                    Live emotion mix
                  </p>
                  <EmotionMix emotion={emotion} compact />
                </div>
              )}
              <p className="text-xs italic opacity-75 border border-border rounded-md px-3 py-2 bg-elevated/50">
                Baseline comparison unlocks after 3 sessions. Your post-session report will show how this run compares once you have enough history.
              </p>
              {tips && tips.length > 1 && <FeedbackTips tips={tips.slice(1)} />}
              {scoreHistory.length > 2 && (
                <SessionGraph history={scoreHistory} />
              )}
            </div>
          </details>

          {/* Stop button */}
          <button
            onClick={stopSession}
            disabled={sessionState === 'stopping'}
            className="btn btn-danger btn-full btn-lg mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sessionState === 'stopping' ? 'Stopping…' : '■ Stop Session'}
          </button>
        </div>
      )}

      {/* REVIEW — shared preview + trim + title + analyze. */}
      {sessionState === 'review' && !analyzing && (
        <RecordingReview
          mediaSrc={videoUrl}
          mediaKind="video"
          mediaBytes={videoBlob?.size}
          initialTitle={setup?.promptTitle || ''}
          initialBody={setup?.promptBody || ''}
          submitting={false}
          error={analyzeError}
          onAnalyze={handleAnalyze}
          onDiscard={discardReview}
        />
      )}

      {/* ANALYZING — uploading + waiting for the upload pipeline */}
      {sessionState === 'review' && analyzing && (
        <AnalyzingProgress
          statusText={analyzeStatus || 'Analyzing recording…'}
          pct={analyzeProgress}
          hint="Running face + speech analysis on the full clip — typically 30–90 seconds."
        />
      )}

      {/* STOPPING — brief flicker while the recorder hands us the blob.
          Almost always invisible (~100 ms); kept for the slow-flush
          edge case so the screen never goes blank between Stop and Review. */}
      {sessionState === 'stopping' && (
        <div className="glass-card p-12 text-center max-w-md mx-auto space-y-3">
          <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-primary">Finalising recording…</p>
        </div>
      )}
    </div>
  )
}
