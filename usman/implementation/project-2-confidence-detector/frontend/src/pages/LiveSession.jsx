import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useLiveSession from '../hooks/useLiveSession'
import ScoreGauge from '../components/ScoreGauge'
import SignalBars from '../components/SignalBars'
import FeedbackTips from '../components/FeedbackTips'
import SessionGraph from '../components/SessionGraph'
import PracticeSetup from '../components/PracticeSetup'
import CountdownOverlay from '../components/CountdownOverlay'
import PracticeTimer from '../components/PracticeTimer'
import { languageDisplayName } from '../utils/language'

function formatDuration(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Maps a hand_position label to a colour + short user-facing message.
// Used by the live gesture badge during recording.
function gestureBadge(label) {
  switch (label) {
    case 'gesturing':
      return { color: '#00c853', text: '✋ Hands gesturing' }
    case 'mid-level':
      return { color: '#4a90e2', text: '✋ Hands mid-level' }
    case 'low/resting':
      return { color: '#aaa', text: '✋ Hands resting' }
    case 'not visible':
      return { color: '#ffb84d', text: '✋ Hands not visible' }
    default:
      return null
  }
}

export default function LiveSession() {
  const {
    sessionState, videoRef, scores, transcript, tips, report, error,
    connectionStatus, unsupportedLanguage, backpressure, calibrating,
    scoreHistory, duration, faceScores,
    startSession, stopSession,
  } = useLiveSession()

  const navigate = useNavigate()
  const navigatedRef = useRef(false)

  // Two new local UI states layered on top of useLiveSession's state:
  //   showCountdown   — full-screen 3-2-1 overlay before WS opens
  //   setup           — { promptTitle, promptBody, durationMin }
  // We keep these LOCAL because they're pure pre-roll UX; the existing
  // hook's state machine (idle / starting / active / stopping / report)
  // already represents the actual session lifecycle once we hit Start.
  const [setup, setSetup] = useState(null)
  const [showCountdown, setShowCountdown] = useState(false)
  const [recStartedAt, setRecStartedAt] = useState(null)

  // Once the report arrives, redirect to /result/:id.
  useEffect(() => {
    if (sessionState === 'report' && report?.session_id && !navigatedRef.current) {
      navigatedRef.current = true
      navigate(`/result/${report.session_id}`, { replace: true })
    }
  }, [sessionState, report, navigate])

  // Capture the wall-clock moment recording actually starts so the
  // PracticeTimer can drive its own clock independent of the hook's
  // duration counter (which can lag by 1 s on first render).
  useEffect(() => {
    if (sessionState === 'active' && !recStartedAt) {
      setRecStartedAt(Date.now())
    }
    if (sessionState === 'idle') {
      setRecStartedAt(null)
    }
  }, [sessionState, recStartedAt])

  // Timer reached zero → auto-stop. We guard with a ref-equivalent to
  // avoid double-calling stopSession (timer fires once, but defensive).
  const handleTimeUp = useCallback(() => {
    if (sessionState === 'active') {
      stopSession().catch(() => {})
    }
  }, [sessionState, stopSession])

  // Setup → countdown → real start. Splitting these means the user sees
  // the camera permission prompt during the countdown, which makes the
  // 3-second wait useful instead of dead.
  function handleSetupComplete(s) {
    setSetup(s)
    setShowCountdown(true)
  }

  function handleCountdownComplete() {
    setShowCountdown(false)
    startSession()
  }

  // Map backend session scores to SignalBars format
  const barScores = scores
    ? {
        voiceSteadiness: scores.voice_steadiness ?? 50,
        eyeContact: scores.eye_contact ?? faceScores.eye_contact,
        speechPace: scores.speech_pace ?? 50,
        fillerWords: scores.filler_words ?? 50,
        vocalVariety: scores.vocal_variety ?? 50,
        expression: scores.expression ?? faceScores.expression,
      }
    : null

  const totalScore = scores?.total ?? 50
  const gesture = gestureBadge(faceScores.hand_position)

  return (
    <div className="live-session-container">
      <h2>Live Practice Session</h2>
      <p className="subtitle">
        AI-powered feedback on your eye contact, voice, and speech
      </p>

      {error && <div className="session-error">{error}</div>}

      {/* IDLE STATE — show the practice-setup picker */}
      {sessionState === 'idle' && !showCountdown && (
        <PracticeSetup onStart={handleSetupComplete} />
      )}

      {/* COUNTDOWN OVERLAY — shows before camera permission resolves */}
      {showCountdown && (
        <CountdownOverlay onComplete={handleCountdownComplete} />
      )}

      {/* STARTING STATE — Requesting permissions */}
      {sessionState === 'starting' && (
        <div className="session-starting">
          <div className="spinner"></div>
          <p>Requesting camera and microphone access…</p>
          <p className="small">Please allow access in the browser prompt</p>
        </div>
      )}

      {/* ACTIVE STATE — Live session in progress */}
      {(sessionState === 'active' || sessionState === 'stopping') && (
        <div className="session-active">
          {connectionStatus === 'lost' && (
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

          {backpressure && (
            <div
              style={{
                background: '#2a2a35',
                color: '#cfe1ff',
                padding: '6px 12px',
                borderRadius: 4,
                marginBottom: 8,
                fontSize: '0.82em',
                opacity: 0.85,
              }}
            >
              Server catching up… (a chunk was dropped — keep speaking)
            </div>
          )}

          {calibrating && (
            <div
              style={{
                background: '#1a2438',
                color: '#cfe1ff',
                padding: '6px 12px',
                borderRadius: 4,
                marginBottom: 8,
                fontSize: '0.82em',
              }}
            >
              Calibrating face baseline… expression scores will pick up in
              about 10 s. Sit naturally and look at the camera.
            </div>
          )}

          {/* Topic banner — what the user is practising */}
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

          {/* Practice timer — elapsed/remaining + bar + auto-stop */}
          {setup?.durationMin && (
            <div style={{ marginBottom: 12 }}>
              <PracticeTimer
                targetMin={setup.durationMin}
                startedAtMs={recStartedAt}
                onTimeUp={handleTimeUp}
              />
            </div>
          )}

          {/* Status bar */}
          <div className="session-status-bar">
            <div className="status-left">
              <span className="rec-indicator">
                <span className="rec-dot"></span> REC
              </span>
              {!setup && (
                <span className="session-duration">{formatDuration(duration)}</span>
              )}
            </div>
            <div className="status-right" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {gesture && (
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: gesture.color,
                    fontWeight: 500,
                  }}
                >
                  {gesture.text}
                </span>
              )}
              {faceScores.face_detected ? (
                <span className="face-status ok">&#x2713; Face detected</span>
              ) : (
                <span className="face-status warn">&#x26A0; No face</span>
              )}
            </div>
          </div>

          {/* Video + Score */}
          <div className="session-main">
            <div className="session-video-wrap">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="session-video"
              />
            </div>
            <div className="session-score-panel">
              <ScoreGauge
                score={totalScore}
                label="Confidence"
                size={180}
              />
            </div>
          </div>

          {/* Signal Bars */}
          {barScores && <SignalBars scores={barScores} />}

          {/* Feedback Tips */}
          {tips && tips.length > 0 && <FeedbackTips tips={tips} />}

          {/* Live Transcript */}
          {transcript && (
            <div className="live-transcript">
              <h4>Live Transcript</h4>
              <div className="transcript-box">{transcript}</div>
            </div>
          )}

          {/* Score Graph */}
          {scoreHistory.length > 2 && <SessionGraph history={scoreHistory} />}

          {/* Stop button */}
          <button
            className="stop-session-btn"
            onClick={stopSession}
            disabled={sessionState === 'stopping'}
          >
            {sessionState === 'stopping' ? 'Stopping…' : 'Stop Session'}
          </button>
        </div>
      )}

      {/* STOPPING STATE — shown briefly if stop triggered from elsewhere */}
      {sessionState === 'stopping' && !scores && (
        <div className="session-starting">
          <div className="spinner"></div>
          <p>Generating session report…</p>
        </div>
      )}

      {/* REPORT STATE — navigation handled by useEffect above; render a
          brief loader while the redirect to /result/:id happens. */}
      {sessionState === 'report' && (
        <div className="session-starting">
          <div className="spinner"></div>
          <p>Opening your session report…</p>
        </div>
      )}
    </div>
  )
}
