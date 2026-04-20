import { useState, useEffect } from 'react'
import './App.css'
import { API_BASE } from './config'
import ScoreGauge from './components/ScoreGauge'
import SignalBars from './components/SignalBars'
import FeedbackTips from './components/FeedbackTips'
import PlaybackReview from './components/PlaybackReview'
import LiveSession from './pages/LiveSession'
import Analyzer from './pages/Analyzer'
import History from './pages/History'

function App() {
  const [mode, setMode] = useState(() => {
    if (window.location.hash === '#/analyzer') return 'analyzer'
    return null
  })
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState(null)

  // Revoke the blob URL whenever it changes or on unmount — avoids leaks.
  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl)
    }
  }, [uploadPreviewUrl])

  const handleBack = () => {
    setMode(null)
    setResults(null)
    setUploadPreviewUrl(null)
    window.location.hash = ''
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setResults(null)
    // Show the local blob while the backend processes — swapping to the
    // server's overlay video only when results arrive. Assigning a fresh
    // URL here triggers the useEffect cleanup for any previous one.
    setUploadPreviewUrl(URL.createObjectURL(file))
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        alert(err.error || 'Upload failed')
        setUploadPreviewUrl(null)
        setUploading(false)
        return
      }
      const data = await res.json()
      setResults(data)
      // Server has the overlay version now — drop the raw blob.
      setUploadPreviewUrl(null)
    } catch (err) {
      alert('Cannot connect to backend.')
      setUploadPreviewUrl(null)
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
        <h1>Confidence Detector</h1>
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
          <button className="mode-btn" onClick={() => setMode('history')}>
            <span className="icon">&#x1F4DA;</span>
            <h3>Library</h3>
            <p>Browse and replay past sessions</p>
          </button>
        </div>
      )}

      {mode && (
        <button className="back-btn" onClick={handleBack}>
          &larr; Back
        </button>
      )}

      {/* == ANALYZER MODE == */}
      {mode === 'analyzer' && <Analyzer />}

      {/* == LIVE MODE == */}
      {mode === 'live' && <LiveSession />}

      {/* == HISTORY MODE == */}
      {mode === 'history' && <History />}

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
              {uploadPreviewUrl && (
                <video
                  src={uploadPreviewUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  className="processed-video"
                  style={{ width: '100%', marginBottom: 16, borderRadius: 8 }}
                />
              )}
              <div className="spinner"></div>
              <p>Processing video — analyzing face expressions and speech...</p>
              <p className="small">This may take a moment for longer videos. Unmute the preview to hear your audio.</p>
            </div>
          )}

          {results && (
            <div className="results">
              {results.no_face_detected && (
                <div className="session-error">
                  No face was detected in this video. Face-based scores
                  (eye contact, expression) defaulted to neutral and may not
                  reflect the speaker.
                </div>
              )}
              {results.audio_extraction_error && (
                <div className="session-error">
                  Audio could not be extracted: {results.audio_extraction_error}
                </div>
              )}
              {results.video_encode_error && (
                <div className="session-error">
                  Video re-encode failed: {results.video_encode_error}
                </div>
              )}
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

              {/* Score Breakdown Cards */}
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
                  {results.speech_summary.filler_words && results.speech_summary.filler_words.length > 0 && (
                    <div className="filler-list">
                      <span className="filler-label">Fillers found: </span>
                      {[...new Set(results.speech_summary.filler_words)].map((w, i) => (
                        <span key={i} className="filler-tag">{w} ({results.speech_summary.filler_words.filter(x => x === w).length})</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Synced playback: video + live score + word-level transcript */}
              {results.processed_video && (
                <PlaybackReview
                  processedVideo={results.processed_video}
                  faceTimeline={results.face_timeline}
                  speechTimeline={results.speech_timeline}
                />
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
                        <img src={`${API_BASE}/api/evidence/${entry.evidence_frame}`} alt={`Frame at ${entry.time_display}`} className="evidence" />
                      )}
                    </div>
                  ))}
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
