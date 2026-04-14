import { useState, useEffect } from 'react'
import './App.css'

const API = 'http://localhost:8000'

function App() {
  const [mode, setMode] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState(null)

  const stopCamera = () => {
    fetch(`${API}/api/stop-live`).catch(() => {})
  }

  useEffect(() => {
    if (mode !== 'live') return
    const handleUnload = () => stopCamera()
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      stopCamera()
    }
  }, [mode])

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setResults(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData })
      const data = await res.json()
      setResults(data)
    } catch (err) {
      alert('Cannot connect to backend. Run: python main.py')
    }
    setUploading(false)
  }

  const scoreColor = (s) => {
    if (s === null || s === undefined) return '#888'
    return s >= 70 ? '#00c853' : s >= 40 ? '#ffd600' : '#ff1744'
  }

  const scoreLabel = (s) => {
    if (s === null || s === undefined) return 'N/A'
    if (s >= 85) return 'Highly Confident'
    if (s >= 70) return 'Confident'
    if (s >= 50) return 'Moderate'
    if (s >= 25) return 'Developing'
    return 'Low Confidence'
  }

  return (
    <div className="app">
      <header>
        <h1>Confidence Detector v0.1</h1>
        <p>AI Presentation Coaching — Real-time Feedback</p>
      </header>

      {!mode && (
        <div className="mode-select">
          <button className="mode-btn" onClick={() => setMode('live')}>
            <span className="icon">🎥</span>
            <h3>Live Practice</h3>
            <p>Real-time confidence detection via webcam</p>
          </button>
          <button className="mode-btn" onClick={() => setMode('upload')}>
            <span className="icon">📁</span>
            <h3>Analyze Recording</h3>
            <p>Upload a presentation video for analysis</p>
          </button>
        </div>
      )}

      {mode && (
        <button className="back-btn" onClick={() => { setMode(null); setResults(null) }}>
          ← Back
        </button>
      )}

      {/* ── LIVE MODE ── */}
      {mode === 'live' && (
        <div className="section">
          <h2>Live Practice Session</h2>
          <p className="subtitle">Present in front of your camera — see confidence feedback in real-time</p>
          <div className="video-box">
            <img src={`${API}/api/live`} alt="Live feed" />
          </div>
          <div className="legend">
            <span className="legend-item"><span className="dot green"></span> Confident (70+)</span>
            <span className="legend-item"><span className="dot yellow"></span> Moderate (40-70)</span>
            <span className="legend-item"><span className="dot red"></span> Low (&lt;40)</span>
          </div>
        </div>
      )}

      {/* ── UPLOAD MODE ── */}
      {mode === 'upload' && (
        <div className="section">
          <h2>Analyze a Presentation Recording</h2>
          <p className="subtitle">Upload a video — get face + speech + confidence analysis</p>

          {!results && !uploading && (
            <label className="upload-area">
              <span className="upload-icon">📁</span>
              <span>Click to select video</span>
              <span className="small">.mp4, .avi, .mov</span>
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
              {/* Overall Score — labeled as estimated */}
              <div className="overall-score" style={{ borderColor: scoreColor(results.overall_confidence) }}>
                <div className="score-number" style={{ color: scoreColor(results.overall_confidence) }}>
                  {results.overall_confidence}
                </div>
                <div className="score-label">{scoreLabel(results.overall_confidence)}</div>
                <div className="score-subtitle">Estimated Confidence Score</div>
                <div className="score-note">Based on face signals + speech patterns. Uses heuristic weights — treat as a relative guide, not absolute measurement.</div>
              </div>

              {/* Score Breakdown */}
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
                  </div>
                  {results.speech_summary.filler_words.length > 0 && (
                    <div className="filler-list">
                      <span className="filler-label">Fillers found: </span>
                      {[...new Set(results.speech_summary.filler_words)].map((w, i) => (
                        <span key={i} className="filler-tag">{w} ({results.speech_summary.filler_words.filter(x => x === w).length})</span>
                      ))}
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
                      <div className="speech-text">
                        {entry.text}
                      </div>
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
