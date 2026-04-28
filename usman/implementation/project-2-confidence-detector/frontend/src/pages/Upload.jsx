import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'
import { pollMediaStatus } from '../utils/mediaStatus'
import { fmtSecs } from '../utils/timeStr'
import TrimSegmentsEditor, { validateSegments } from '../components/TrimSegmentsEditor'

/**
 * Upload — three-step flow:
 *   1. Pick a video file → preview it locally via blob: URL.
 *   2. Optionally add one OR MORE trim segments. Each row is
 *      independent; the kept segments play back-to-back in the
 *      order added. Overlaps are NOT merged — duplicate seconds
 *      replay, which matches the explicit composer.
 *   3. Submit → POST /api/upload (returns 202 + media_id), then poll
 *      GET /api/media/{id}/status until completed/failed.
 *
 * "Use full clip" defaults to ON so a user who just wants to analyze
 * the whole thing keeps the one-click flow.
 */
export default function Upload() {
  const [pickedFile, setPickedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [useFull, setUseFull] = useState(true)
  const [segments, setSegments] = useState([{ start: '', end: '' }])
  const [uploading, setUploading] = useState(false)
  const [statusText, setStatusText] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const videoRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleFilePick(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadError(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPickedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setPreviewDuration(0)
    setUseFull(true)
    setSegments([{ start: '', end: '' }])
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPickedFile(null)
    setPreviewUrl(null)
    setPreviewDuration(0)
    setUseFull(true)
    setSegments([{ start: '', end: '' }])
    setUploadError(null)
  }

  async function handleSubmit() {
    if (!pickedFile) return
    setUploadError(null)

    let segmentsPayload = null
    if (!useFull) {
      const v = validateSegments(segments, previewDuration)
      if (!v.ok) {
        setUploadError(v.error)
        return
      }
      segmentsPayload = v.segments
    }

    setUploading(true)
    setStatusText('Uploading file…')
    const formData = new FormData()
    formData.append('file', pickedFile)
    if (segmentsPayload) {
      formData.append('trim_segments', JSON.stringify(segmentsPayload))
    }
    try {
      const res = await apiFetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        setUploadError(err.error || `Upload failed (HTTP ${res.status})`)
        setUploading(false)
        return
      }
      const data = await res.json()
      if (!data.media_id) {
        setUploadError('Server did not return a media id')
        setUploading(false)
        return
      }
      setStatusText('Analyzing video — face, speech, and confidence…')
      const final = await pollMediaStatus(data.media_id, {
        onProgress: (s) => {
          if (s === 'pending') setStatusText('Queued — waiting for a worker…')
          if (s === 'processing') setStatusText('Analyzing video — face, speech, and confidence…')
        },
      })
      if (final.status === 'completed') {
        navigate(`/result/${data.media_id}`)
      } else {
        setUploadError(final.error || 'Processing failed.')
        setUploading(false)
      }
    } catch (err) {
      setUploadError(err.message || 'Cannot connect to backend.')
      setUploading(false)
    }
  }

  return (
    <div className="section">
      <h2>Analyze a Presentation Recording</h2>
      <p className="subtitle">Upload a video — get face + speech + confidence analysis</p>

      {uploadError && <div className="session-error">{uploadError}</div>}

      {!pickedFile && !uploading && (
        <label className="upload-area">
          <span className="upload-icon">&#x1F4C1;</span>
          <span>Click to select video</span>
          <span className="small">.mp4, .avi, .mov (max 500MB)</span>
          <input type="file" accept="video/*" onChange={handleFilePick} hidden />
        </label>
      )}

      {pickedFile && !uploading && (
        <div className="upload-preview" style={{ marginTop: 16 }}>
          <video
            ref={videoRef}
            src={previewUrl}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => setPreviewDuration(e.currentTarget.duration || 0)}
            style={{ width: '100%', maxHeight: 360, borderRadius: 8, background: '#000' }}
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
            Use full clip (default — analyze the whole video)
          </label>

          {!useFull && (
            <TrimSegmentsEditor
              segments={segments}
              onChange={setSegments}
              previewDuration={previewDuration}
              getCurrentTime={() => videoRef.current?.currentTime ?? 0}
            />
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={handleSubmit}>Analyze</button>
            <button onClick={reset} className="secondary">Pick a different file</button>
          </div>
        </div>
      )}

      {uploading && (
        <div className="processing">
          <div className="spinner"></div>
          <p>{statusText || 'Processing video…'}</p>
          <p className="small">This may take a moment for longer videos.</p>
        </div>
      )}
    </div>
  )
}
