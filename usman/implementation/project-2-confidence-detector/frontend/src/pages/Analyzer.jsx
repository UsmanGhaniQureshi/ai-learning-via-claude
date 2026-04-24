import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'
import LiveAnalyzer from './LiveAnalyzer'

/**
 * Standalone Speech Analyzer page.
 *
 * Two entry points:
 *   - Upload an audio file → batch process → navigate to /result/:id.
 *   - Record live → WebSocket real-time scores + transcript → navigate to
 *     /result/:id (rendered by the LiveAnalyzer sub-component; mounts in
 *     place when the user picks "Record Live").
 *
 * Route: /analyzer
 */
export default function Analyzer() {
  const [mode, setMode] = useState(null) // null | 'uploading' | 'live'
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setMode('uploading')
    setError(null)

    const formData = new FormData()
    formData.append('audio_file', file)
    formData.append('session_label', file.name)

    try {
      const res = await apiFetch(`${API_BASE}/api/analyze-audio`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Analysis failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (!data.media_id) {
        throw new Error('Server did not return a media id')
      }
      navigate(`/result/${data.media_id}`)
    } catch (err) {
      setError(err.message)
      setMode(null)
    }
  }

  // Live mode mounts its own component with the full WS flow.
  if (mode === 'live') return <LiveAnalyzer />

  return (
    <div className="analyzer-page">
      <div className="analyzer-header">
        <h2>Speech Analyzer</h2>
        <p>Test your speech — no camera needed</p>
      </div>

      {error && <div className="analyzer-error">{error}</div>}

      {mode === null && (
        <div className="analyzer-input">
          <label className="upload-area">
            <span className="upload-icon">&#x1F4C1;</span>
            <span>Upload audio file</span>
            <span className="small">WAV / MP3 / M4A / WebM / OGG</span>
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg"
              onChange={handleFileUpload}
              hidden
            />
          </label>

          <div className="analyzer-divider">or</div>

          <button className="record-btn" onClick={() => setMode('live')}>
            <span className="record-dot"></span>
            Record Live (real-time scores)
          </button>
        </div>
      )}

      {mode === 'uploading' && (
        <div className="processing">
          <div className="spinner"></div>
          <p>Analyzing speech…</p>
          <p className="small">Running VAD, pitch analysis, transcription, and scoring.</p>
        </div>
      )}
    </div>
  )
}
