import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'
import { pollMediaStatus } from '../utils/mediaStatus'
import { fmtSecs } from '../utils/timeStr'
import TrimSegmentsEditor, { validateSegments } from '../components/TrimSegmentsEditor'
import LiveAnalyzer from './LiveAnalyzer'

/**
 * Standalone Speech Analyzer page.
 *
 * Two entry points:
 *   - Upload an audio file → preview + optional trim → batch process
 *     → navigate to /result/:id.
 *   - Record live → WebSocket real-time scores + transcript →
 *     navigate to /result/:id (rendered by the LiveAnalyzer
 *     sub-component; mounts in place when the user picks "Record
 *     Live").
 *
 * Trim semantics match Upload.jsx: optional list of [start,end]
 * segments concatenated server-side BEFORE analysis runs, so scores
 * + transcript only reflect the kept windows.
 *
 * Route: /analyzer
 */
export default function Analyzer() {
  const [mode, setMode] = useState('idle') // idle | preview | uploading | live
  const [error, setError] = useState(null)
  const [pickedFile, setPickedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [useFull, setUseFull] = useState(true)
  const [segments, setSegments] = useState([{ start: '', end: '' }])
  const [statusText, setStatusText] = useState(null)
  const audioRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleFilePick(e) {
    const file = e.target.files[0]
    if (!file) return
    setError(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPickedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setPreviewDuration(0)
    setUseFull(true)
    setSegments([{ start: '', end: '' }])
    setMode('preview')
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPickedFile(null)
    setPreviewUrl(null)
    setPreviewDuration(0)
    setUseFull(true)
    setSegments([{ start: '', end: '' }])
    setError(null)
    setMode('idle')
  }

  async function handleSubmit() {
    if (!pickedFile) return
    setError(null)

    let segmentsPayload = null
    if (!useFull) {
      const v = validateSegments(segments, previewDuration)
      if (!v.ok) {
        setError(v.error)
        return
      }
      segmentsPayload = v.segments
    }

    setMode('uploading')
    setStatusText('Uploading file…')
    const formData = new FormData()
    formData.append('audio_file', pickedFile)
    formData.append('session_label', pickedFile.name)
    if (segmentsPayload) {
      formData.append('trim_segments', JSON.stringify(segmentsPayload))
    }

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
      setStatusText('Analyzing speech…')
      const final = await pollMediaStatus(data.media_id, {
        onProgress: (s) => {
          if (s === 'pending') setStatusText('Queued — waiting for a worker…')
          if (s === 'processing') setStatusText('Analyzing speech…')
        },
      })
      if (final.status === 'completed') {
        navigate(`/result/${data.media_id}`)
      } else {
        throw new Error(final.error || 'Analysis failed.')
      }
    } catch (err) {
      setError(err.message)
      // Drop back to the preview screen so the user can adjust the
      // trim window and retry without re-picking the file.
      setMode('preview')
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

      {mode === 'idle' && (
        <div className="analyzer-input">
          <label className="upload-area">
            <span className="upload-icon">&#x1F4C1;</span>
            <span>Upload audio file</span>
            <span className="small">WAV / MP3 / M4A / WebM / OGG</span>
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg"
              onChange={handleFilePick}
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

      {mode === 'preview' && pickedFile && (
        <div className="analyzer-preview" style={{ marginTop: 16 }}>
          <audio
            ref={audioRef}
            src={previewUrl}
            controls
            preload="metadata"
            onLoadedMetadata={(e) => setPreviewDuration(e.currentTarget.duration || 0)}
            style={{ width: '100%' }}
          />

          <div style={{ marginTop: 10, fontSize: '0.85em', opacity: 0.8 }}>
            <strong>{pickedFile.name}</strong>
            {previewDuration > 0 && <> &middot; {fmtSecs(previewDuration)}</>}
          </div>

          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginTop: 12, fontSize: '0.92em',
            }}
          >
            <input
              type="checkbox"
              checked={useFull}
              onChange={(e) => setUseFull(e.target.checked)}
            />
            Use full clip (default — analyze the whole audio)
          </label>

          {!useFull && (
            <TrimSegmentsEditor
              segments={segments}
              onChange={setSegments}
              previewDuration={previewDuration}
              getCurrentTime={() => audioRef.current?.currentTime ?? 0}
            />
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={handleSubmit}>Analyze</button>
            <button onClick={reset} className="secondary">Pick a different file</button>
          </div>
        </div>
      )}

      {mode === 'uploading' && (
        <div className="processing">
          <div className="spinner"></div>
          <p>{statusText || 'Analyzing speech…'}</p>
          <p className="small">Running VAD, pitch analysis, transcription, and scoring.</p>
        </div>
      )}
    </div>
  )
}
