import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import ScoreGauge from './components/ScoreGauge'
import SignalBars from './components/SignalBars'
import FeedbackTips from './components/FeedbackTips'
import SessionGraph from './components/SessionGraph'
import PermissionScreen from './components/PermissionScreen'
import useWebSocket from './hooks/useWebSocket'
import useAudioCapture from './hooks/useAudioCapture'
import { SessionVideoRecorder } from './components/VideoRecorder'
import Analyzer from './pages/Analyzer'

const API = 'http://localhost:8000'

function App() {
  // Hash-based routing: #/analyzer goes to standalone analyzer page
  const [mode, setMode] = useState(() => {
    if (window.location.hash === '#/analyzer') return 'analyzer'
    return null
  })
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [scoreHistory, setScoreHistory] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const sessionStart = useRef(null)
  const videoRecorderRef = useRef(null)

  // WebSocket for live mode
  const { scores, isConnected, transcript, tips, sendAudio } = useWebSocket()

  // Audio capture for live mode — sends chunks to WebSocket
  const { isCapturing, error: audioError, hasPermission } = useAudioCapture(
    sendAudio,
    mode === 'live'
  )

  // Track permission denial
  useEffect(() => {
    if (hasPermission === false) setPermissionDenied(true)
    if (hasPermission === true) setPermissionDenied(false)
  }, [hasPermission])

  // Build score history for graph
  useEffect(() => {
    if (scores && scores.total != null && mode === 'live') {
      if (!sessionStart.current) sessionStart.current = Date.now()
      const elapsed = (Date.now() - sessionStart.current) / 1000
      setScoreHistory(prev => [...prev, { time: elapsed, score: scores.total }])
    }
  }, [scores, mode])

  const stopCamera = () => {
    fetch(`${API}/api/stop-live`).catch(() => {})
  }

  // Start video recording when live mode activates
  const startVideoRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      const recorder = new SessionVideoRecorder()
      await recorder.start(stream)
      videoRecorderRef.current = { recorder, stream }
      setIsRecording(true)
    } catch (e) {
      // Video recording is optional — don't block if it fails
    }
  }, [])

  // Stop video recording and upload
  const stopVideoRecording = useCallback(async () => {
    const ref = videoRecorderRef.current
    if (!ref) return
    setIsRecording(false)
    try {
      const blob = await ref.recorder.stop()
      // Stop the stream tracks
      ref.stream.getTracks().forEach(t => t.stop())
      if (blob) {
        const sessionId = `live_${Date.now()}`
        ref.recorder.blob = blob
        await ref.recorder.uploadToServer(sessionId)
      }
    } catch (e) {
      // Upload failure is non-critical
    }
    videoRecorderRef.current = null
  }, [])

  useEffect(() => {
    if (mode === 'live') {
      startVideoRecording()
    }
    if (mode !== 'live') return
    const handleUnload = () => { stopCamera(); stopVideoRecording() }
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      stopCamera()
      stopVideoRecording()
    }
  }, [mode, startVideoRecording, stopVideoRecording])

  const handleBack = () => {
    stopVideoRecording()
    setMode(null)
    setResults(null)
    setScoreHistory([])
    sessionStart.current = null
    setPermissionDenied(false)
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setResults(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        alert(err.error || 'Upload failed')
        setUploading(false)
        return
      }
      const data = await res.json()
      setResults(data)
    } catch (err) {
      alert('Cannot connect to backend. Run: python main.py')
    }
    setUploading(false)
  }

  const scoreColor = (s) => {
    if (s === null || s === undefined) return '#888'
    return s >= 71 ? '#00c853' : s >= 41 ? '#ffd600' : '#ff1744'
  }

  const scoreLabel = (s) => {
    if (s === null || s === undefined) return 'N/A'
    if (s >= 85) return 'Highly Confident'
    if (s >= 71) return 'Confident'
    if (s >= 50) return 'Moderate'
    if (s >= 25) return 'Developing'
    return 'Low Confidence'
  }

  return (
    <div className="app">
      <header>
        <h1>Confidence Detector v1.0</h1>
        <p>AI Presentation Coaching — Real-time Feedback</p>
      </header>

      {!mode && (
        <div className="mode-select">
          <button className="mode-btn" onClick={() => setMode('live')}>
            <span className="icon">&#x1F3A5;</span>
            <h3>Live Practice</h3>
            <p>Real-time confidence detection via webcam + mic</p>
          </button>
          <button className="mode-btn" onClick={() => setMode('upload')}>
            <span className="icon">&#x1F4C1;</span>
            <h3>Analyze Recording</h3>
            <p>Upload a presentation video for analysis</p>
          </button>
          <button className="mode-btn" onClick={() => { setMode('analyzer'); window.location.hash = '#/analyzer' }}>
            <span className="icon">&#x1F3A4;</span>
            <h3>Speech Analyzer</h3>
            <p>Test your speech — no camera needed</p>
          </button>
        </div>
      )}

      {mode && (
        <button className="back-btn" onClick={() => { handleBack(); window.location.hash = '' }}>
          &larr; Back
        </button>
      )}

      {/* == ANALYZER MODE == */}
      {mode === 'analyzer' && <Analyzer />}

      {/* == LIVE MODE == */}
      {mode === 'live' && (
        <div className="section">
          <h2>Live Practice Session</h2>
          <p className="subtitle">
            Present in front of your camera — see confidence feedback in real-time
            {isConnected && <span className="ws-status connected"> &bull; Connected</span>}
            {!isConnected && <span className="ws-status disconnected"> &bull; Connecting...</span>}
          </p>

          {permissionDenied ? (
            <PermissionScreen
              error={audioError}
              onRetry={() => {
                setPermissionDenied(false)
                setMode(null)
                setTimeout(() => setMode('live'), 100)
              }}
            />
          ) : (
            <>
              {/* Video + Score Gauge side by side */}
              <div className="live-layout">
                <div className="video-box">
                  <img src={`${API}/api/live`} alt="Live feed" />
                </div>
                <div className="live-score-panel">
                  <ScoreGauge
                    score={scores?.total ?? 50}
                    label={scoreLabel(scores?.total)}
                    size={180}
                  />
                  {isCapturing && <div className="mic-indicator">&#x1F3A4; Mic active</div>}
                  {isRecording && <div className="mic-indicator">&#x1F534; Recording</div>}
                </div>
              </div>

              {/* Signal Bars */}
              {scores && <SignalBars scores={scores} />}

              {/* Feedback Tips */}
              <FeedbackTips tips={tips} />

              {/* Live Transcript */}
              {transcript && (
                <div className="live-transcript">
                  <h4>Live Transcript</h4>
                  <div className="transcript-box">{transcript}</div>
                </div>
              )}

              {/* Session Graph */}
              {scoreHistory.length > 2 && <SessionGraph history={scoreHistory} />}

              {/* Legend */}
              <div className="legend">
                <span className="legend-item"><span className="dot green"></span> Confident (71+)</span>
                <span className="legend-item"><span className="dot yellow"></span> Moderate (41-70)</span>
                <span className="legend-item"><span className="dot red"></span> Low (&lt;40)</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* == UPLOAD MODE == */}
      {mode === 'upload' && (
        <div className="section">
          <h2>Analyze a Presentation Recording</h2>
          <p className="subtitle">Upload a video — get face + speech + confidence analysis</p>

          {!results && !uploading && (
            <label className="upload-area">
              <span className="upload-icon">&#x1F4C1;</span>
              <span>Click to select video</span>
              <span className="small">.mp4, .avi, .mov (max 500MB)</span>
              <input type="file" accept="video/*" onChange={handleUpload} hidden />
            </label>
          )}

          {uploading && (
            <div className="processing">
              <div className="spinner"></div>
              <p>Processing video — analyzing face expressions and speech...</p>
              <p className="small">This may take a moment for longer videos</p>
            </div>
          )}

          {results && (
            <div className="results">
              {/* Overall Score Gauge */}
              <div className="upload-score-section">
                <ScoreGauge
                  score={results.overall_confidence}
                  label={scoreLabel(results.overall_confidence)}
                  size={220}
                />
                <div className="score-note">
                  Based on face signals + speech patterns. Uses weighted sub-scores.
                </div>
              </div>

              {/* Sub-Score Signal Bars */}
              {results.sub_scores && <SignalBars scores={results.sub_scores} />}

              {/* Feedback Tips */}
              {results.tips && <FeedbackTips tips={results.tips} />}

              {/* Score Breakdown Cards (legacy) */}
              <div className="score-breakdown">
                <div className="breakdown-card">
                  <strong style={{ color: scoreColor(results.face_confidence) }}>{results.face_confidence}</strong>
                  <span>Face</span>
                </div>
                {results.speech_score !== null && (
                  <div className="breakdown-card">
                    <strong style={{ color: scoreColor(results.speech_score) }}>{results.speech_score}</strong>
                    <span>Speech</span>
                  </div>
                )}
                {results.pace_score !== null && (
                  <div className="breakdown-card">
                    <strong style={{ color: scoreColor(results.pace_score) }}>{results.pace_score}</strong>
                    <span>Pace</span>
                  </div>
                )}
                <div className="breakdown-card">
                  <strong>{Math.floor(results.duration / 60)}:{String(Math.floor(results.duration % 60)).padStart(2, '0')}</strong>
                  <span>Duration</span>
                </div>
              </div>

              {/* Speech Summary */}
              {results.speech_summary && (
                <div className="speech-summary">
                  <h3>Speech Analysis</h3>
                  <div className="speech-stats">
                    <div className="speech-stat">
                      <strong>{results.speech_summary.total_words}</strong>
                      <span>Total Words</span>
                    </div>
                    <div className="speech-stat" style={{ color: results.speech_summary.filler_rate > 5 ? '#ff1744' : '#00c853' }}>
                      <strong>{results.speech_summary.total_fillers}</strong>
                      <span>Fillers ({results.speech_summary.filler_rate}%)</span>
                    </div>
                    <div className="speech-stat" style={{ color: results.speech_summary.total_hedges > 3 ? '#ff6d00' : '#00c853' }}>
                      <strong>{results.speech_summary.total_hedges}</strong>
                      <span>Hedging Phrases</span>
                    </div>
                    <div className="speech-stat">
                      <strong>{results.speech_summary.average_wpm}</strong>
                      <span>Words/Min</span>
                    </div>
                    {results.speech_summary.voice_steadiness != null && (
                      <div className="speech-stat">
                        <strong style={{ color: scoreColor(results.speech_summary.voice_steadiness) }}>
                          {results.speech_summary.voice_steadiness}
                        </strong>
                        <span>Voice Steadiness</span>
                      </div>
                    )}
                  </div>
                  {results.speech_summary.filler_words && results.speech_summary.filler_words.length > 0 && (
                    <div className="filler-list">
                      <span className="filler-label">Fillers found: </span>
                      {[...new Set(results.speech_summary.filler_words)].map((w, i) => (
                        <span key={i} className="filler-tag">{w} ({results.speech_summary.filler_words.filter(x => x === w).length})</span>
                      ))}
                    </div>
                  )}
                  {results.speech_summary.silence_gaps && results.speech_summary.silence_gaps.length > 0 && (
                    <div className="silence-info">
                      <span className="filler-label">Silence gaps (&gt;2s): </span>
                      <span>{results.speech_summary.silence_gap_count} detected</span>
                    </div>
                  )}
                </div>
              )}

              {/* Processed Video */}
              {results.processed_video && (
                <div className="video-result">
                  <h3>Processed Video with Overlays</h3>
                  <video controls width="100%" className="processed-video">
                    <source src={`${API}/api/video/${results.processed_video}`} type="video/mp4" />
                  </video>
                </div>
              )}

              {/* Face Timeline */}
              {results.face_timeline && results.face_timeline.length > 0 && (
                <div className="timeline-section">
                  <h3>Timeline — Confidence Over Time</h3>
                  {results.face_timeline.map((entry, i) => (
                    <div key={i} className="timeline-card" style={{ borderLeft: `4px solid ${scoreColor(entry.face_confidence)}` }}>
                      <div className="timeline-top">
                        <span className="time">{entry.time_display}</span>
                        <span className="expression">{entry.expression}</span>
                        <span className="timeline-score" style={{ color: scoreColor(entry.face_confidence) }}>
                          Face: {entry.face_confidence}/100
                        </span>
                        <span className="eye-contact">Eye: {entry.eye_contact_pct}%</span>
                      </div>
                      {entry.evidence_frame && (
                        <img src={`${API}/api/evidence/${entry.evidence_frame}`} alt={`Frame at ${entry.time_display}`} className="evidence" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Speech Timeline */}
              {results.speech_timeline && results.speech_timeline.length > 0 && (
                <div className="timeline-section">
                  <h3>Speech Timeline — What You Said</h3>
                  {results.speech_timeline.map((entry, i) => (
                    <div key={i} className="speech-card" style={{ borderLeft: `4px solid ${scoreColor(entry.speech_score)}` }}>
                      <div className="speech-top">
                        <span className="time">{Math.floor(entry.timestamp / 60)}:{String(Math.floor(entry.timestamp % 60)).padStart(2, '0')}</span>
                        <span className="timeline-score" style={{ color: scoreColor(entry.speech_score) }}>
                          Speech: {entry.speech_score}/100
                        </span>
                      </div>
                      <div className="speech-text">{entry.text}</div>
                      {entry.fillers.length > 0 && (
                        <div className="speech-issues">
                          Fillers: {entry.fillers.map((f, j) => <span key={j} className="filler-tag">{f}</span>)}
                        </div>
                      )}
                      {entry.hedges.length > 0 && (
                        <div className="speech-issues">
                          Hedging: {entry.hedges.map((h, j) => <span key={j} className="hedge-tag">{h}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Full Transcript */}
              {results.speech_summary && results.speech_summary.full_transcript && (
                <div className="transcript-section">
                  <h3>Full Transcript</h3>
                  <div className="transcript-box">
                    {results.speech_summary.full_transcript}
                  </div>
                </div>
              )}

              <button className="upload-another" onClick={() => setResults(null)}>
                Analyze Another Video
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
