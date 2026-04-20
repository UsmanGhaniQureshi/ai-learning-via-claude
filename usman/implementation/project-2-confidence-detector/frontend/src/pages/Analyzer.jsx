import { useState, useRef } from 'react'
import SessionReport from '../components/SessionReport'
import { AnalyzerRecorder } from '../components/AnalyzerRecorder'

const API = 'http://localhost:8000'

/**
 * Standalone Speech Analyzer page.
 * No camera needed. Upload audio or record directly.
 * Route: /analyzer
 */
export default function Analyzer() {
  const [mode, setMode] = useState(null) // null | 'uploading' | 'recording' | 'analyzing' | 'done'
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const recorderRef = useRef(null)
  const timerRef = useRef(null)

  // ── File Upload ───────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setMode('analyzing')
    setError(null)
    setReport(null)

    const formData = new FormData()
    formData.append('audio_file', file)
    formData.append('session_label', file.name)

    try {
      const res = await fetch(`${API}/api/analyze-audio`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Analysis failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setReport(data)
      setMode('done')
    } catch (err) {
      setError(err.message)
      setMode(null)
    }
  }

  // ── Recording ─────────────────────────────────────────────
  const startRecording = async () => {
    setError(null)
    try {
      const recorder = new AnalyzerRecorder()
      await recorder.start()
      recorderRef.current = recorder
      setMode('recording')
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    } catch (err) {
      setError('Microphone access denied. Please allow microphone access.')
    }
  }

  const stopRecording = async () => {
    clearInterval(timerRef.current)
    const recorder = recorderRef.current
    if (!recorder) return
    setMode('analyzing')

    const blob = await recorder.stop()
    if (!blob) {
      setError('Recording failed')
      setMode(null)
      return
    }

    try {
      const data = await recorder.analyze(blob, 'recording')
      setReport(data)
      setMode('done')
    } catch (err) {
      setError(err.message)
      setMode(null)
    }
  }

  // ── Report actions ────────────────────────────────────────
  const handleDownloadJSON = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `speech_report_${report.session_id || 'unknown'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyTranscript = () => {
    if (!report?.transcript) return
    const text = report.transcript
      .map(w => w.is_filler ? `(${w.word})` : w.word)
      .join(' ')
    navigator.clipboard.writeText(text)
  }

  const resetAnalyzer = () => {
    setMode(null)
    setReport(null)
    setError(null)
    setRecordingTime(0)
  }

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="analyzer-page">
      <div className="analyzer-header">
        <h2>Speech Analyzer</h2>
        <p>Test your speech — no camera needed</p>
      </div>

      {error && <div className="analyzer-error">{error}</div>}

      {/* Input Mode Selection */}
      {!mode && (
        <div className="analyzer-input">
          <label className="upload-area">
            <span className="upload-icon">&#x1F4C1;</span>
            <span>Upload audio file</span>
            <span className="small">WAV / MP3 / M4A / WebM / OGG</span>
            <input type="file" accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg" onChange={handleFileUpload} hidden />
          </label>

          <div className="analyzer-divider">or</div>

          <button className="record-btn" onClick={startRecording}>
            <span className="record-dot"></span>
            Record Now
          </button>
        </div>
      )}

      {/* Recording State */}
      {mode === 'recording' && (
        <div className="analyzer-recording">
          <div className="recording-indicator">
            <span className="recording-pulse"></span>
            Recording... {formatTime(recordingTime)}
          </div>
          <button className="stop-btn" onClick={stopRecording}>
            Stop Recording
          </button>
        </div>
      )}

      {/* Analyzing State */}
      {mode === 'analyzing' && (
        <div className="processing">
          <div className="spinner"></div>
          <p>Analyzing speech...</p>
          <p className="small">Running VAD, pitch analysis, transcription, and scoring</p>
        </div>
      )}

      {/* Report */}
      {mode === 'done' && report && (
        <>
          <SessionReport
            report={report}
            onDownloadJSON={handleDownloadJSON}
            onCopyTranscript={handleCopyTranscript}
          />
          <button className="upload-another" onClick={resetAnalyzer}>
            Analyze Another
          </button>
        </>
      )}
    </div>
  )
}
