import useLiveSession from '../hooks/useLiveSession'
import ScoreGauge from '../components/ScoreGauge'
import SignalBars from '../components/SignalBars'
import FeedbackTips from '../components/FeedbackTips'
import SessionGraph from '../components/SessionGraph'
import SessionReport from '../components/SessionReport'

function formatDuration(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function LiveSession() {
  const {
    sessionState, videoRef, scores, transcript, tips, report, error,
    scoreHistory, duration, faceScores, videoUrl, remoteVideoUrl,
    startSession, stopSession, resetSession,
  } = useLiveSession()

  const previewUrl = videoUrl || remoteVideoUrl

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

  const handleDownloadReport = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session_report_${report.session_id || 'unknown'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyTranscript = () => {
    if (!report?.transcript) return
    const text = report.transcript
      .map((w) => (w.is_filler ? `(${w.word})` : w.word))
      .join(' ')
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="live-session-container">
      <h2>Live Practice Session</h2>
      <p className="subtitle">
        AI-powered feedback on your eye contact, voice, and speech
      </p>

      {error && <div className="session-error">{error}</div>}

      {/* IDLE STATE — Start button */}
      {sessionState === 'idle' && (
        <div className="session-idle">
          <div className="idle-info">
            <p className="info-large">Ready to start your practice session?</p>
            <p className="info-small">
              We'll need access to your camera and microphone. Everything is
              analyzed locally — your video never leaves this page (audio is
              sent only for speech analysis).
            </p>
          </div>
          <button className="start-session-btn" onClick={startSession}>
            <span className="start-icon">&#x25B6;</span>
            Start Session
          </button>
        </div>
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
          {/* Status bar */}
          <div className="session-status-bar">
            <div className="status-left">
              <span className="rec-indicator">
                <span className="rec-dot"></span> REC
              </span>
              <span className="session-duration">{formatDuration(duration)}</span>
            </div>
            <div className="status-right">
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

      {/* REPORT STATE — Post-session analysis */}
      {sessionState === 'report' && report && (
        <div className="session-report-wrap">
          {previewUrl && (
            <video
              src={previewUrl}
              controls
              playsInline
              className="processed-video"
              style={{ width: '100%', marginBottom: 16, borderRadius: 8 }}
            />
          )}
          <SessionReport
            report={report}
            onDownloadJSON={handleDownloadReport}
            onCopyTranscript={handleCopyTranscript}
          />
          <button className="start-session-btn" onClick={resetSession}>
            Start New Session
          </button>
        </div>
      )}
    </div>
  )
}
