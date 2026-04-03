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

  // Stop camera when leaving live mode or closing tab
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

  const scoreColor = (s) => s < 20 ? '#00c853' : s < 40 ? '#ffd600' : s < 65 ? '#ff6d00' : '#ff1744'

  return (
    <div className="app">
      <header>
        <h1>ExamGuard v0.1</h1>
        <p>AI Exam Monitoring — Multi-Student Cheating Detection</p>
      </header>

      {!mode && (
        <div className="mode-select">
          <button className="mode-btn" onClick={() => setMode('live')}>
            <span className="icon">📹</span>
            <h3>Live Camera</h3>
            <p>Real-time detection via webcam</p>
          </button>
          <button className="mode-btn" onClick={() => setMode('upload')}>
            <span className="icon">📁</span>
            <h3>Upload Video</h3>
            <p>Analyze recorded exam footage</p>
          </button>
        </div>
      )}

      {mode && (
        <button className="back-btn" onClick={() => { setMode(null); setResults(null) }}>
          ← Back
        </button>
      )}

      {mode === 'live' && (
        <div className="section">
          <h2>Live Camera Feed</h2>
          <p className="subtitle">Monitoring all visible students in real-time</p>
          <div className="video-box">
            <img src={`${API}/api/live`} alt="Live feed" />
          </div>
          <p className="hint">Each student gets a colored circle: green=clear, yellow=mild, orange=suspicious, red=alert</p>
        </div>
      )}

      {mode === 'upload' && (
        <div className="section">
          <h2>Upload Exam Video</h2>
          <p className="subtitle">Supports multiple students in same video</p>

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
              <p>Processing video... analyzing each frame for all students.</p>
            </div>
          )}

          {results && (
            <div className="results">
              <div className="stats">
                <div className="stat">
                  <strong>{results.filename}</strong><span>File</span>
                </div>
                <div className="stat">
                  <strong>{Math.floor(results.duration/60)}:{String(Math.floor(results.duration%60)).padStart(2,'0')}</strong>
                  <span>Duration</span>
                </div>
                <div className="stat">
                  <strong>{results.students_detected || '?'}</strong>
                  <span>Students Detected</span>
                </div>
                <div className="stat">
                  <strong>{results.frames_analyzed}</strong><span>Frames Analyzed</span>
                </div>
                <div className="stat" style={{color: results.total_alerts > 0 ? '#ff1744' : '#00c853'}}>
                  <strong>{results.total_alerts}</strong><span>Suspicious Events</span>
                </div>
              </div>

              {/* Per-Student Summary */}
              {results.student_summaries && results.student_summaries.length > 0 && (
                <div className="student-summary-section">
                  <h3>Per-Student Verdict</h3>
                  <div className="student-summary-grid">
                    {results.student_summaries.map((s) => (
                      <div key={s.student_id} className={`student-summary-card ${s.status === 'CLEAN' ? 'clean' : 'cheating'}`}>
                        <div className="student-id">Student {s.student_id}</div>
                        <div className={`student-status ${s.status === 'CLEAN' ? 'status-clean' : 'status-cheating'}`}>
                          {s.status === 'CLEAN' ? 'CLEAN' : 'CHEATING DETECTED'}
                        </div>
                        {s.alert_count > 0 && (
                          <div className="student-details">
                            <span>{s.alert_count} alert{s.alert_count > 1 ? 's' : ''}</span>
                            <span>Peak: {s.max_score}/100</span>
                            <span>{s.worst_verdict}</span>
                          </div>
                        )}
                        <div className="student-score-bar">
                          <div style={{width: `${s.max_score}%`, background: scoreColor(s.max_score)}}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.processed_video && (
                <div className="video-result">
                  <h3>Processed Video — Watch with Detection Overlays</h3>
                  <video controls width="100%" className="processed-video">
                    <source src={`${API}/api/video/${results.processed_video}`} type="video/mp4" />
                    Your browser does not support video playback.
                  </video>
                </div>
              )}

              {results.total_alerts === 0 && (
                <div className="no-alerts">No suspicious activity detected.</div>
              )}

              {results.alerts && results.alerts.length > 0 && (
                <div className="alerts-section">
                  <h3>Suspicious Events Timeline</h3>

                  {results.alerts.map((a, i) => (
                    <div key={i} className="alert-card" style={{borderLeft: `4px solid ${scoreColor(a.score)}`}}>
                      <div className="alert-top">
                        <span className="student-badge" style={{background: scoreColor(a.score)}}>
                          Student {a.student_id}
                        </span>
                        <span className="time">{a.time_display}</span>
                        <span className="verdict" style={{color: scoreColor(a.score)}}>
                          {a.verdict}
                        </span>
                        <span className="score">Score: {a.score}/100</span>
                      </div>
                      <div className="alert-signals">
                        <span>Head: {a.head}</span>
                        <span>Eyes: {a.eyes}</span>
                        <span>Body: {a.body}</span>
                        <span>Mouth: {a.talking}</span>
                      </div>
                      <div className="score-bar">
                        <div style={{width: `${a.score}%`, background: scoreColor(a.score)}}></div>
                      </div>
                      {a.evidence_frame && (
                        <img
                          src={`${API}/api/evidence/${a.evidence_frame}`}
                          alt={`Evidence at ${a.time_display}`}
                          className="evidence"
                        />
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
