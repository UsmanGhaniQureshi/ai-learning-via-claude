import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'
import { pollMediaStatus } from '../utils/mediaStatus'
import RecordingReview from '../components/RecordingReview'
import AnalyzingProgress from '../components/AnalyzingProgress'

/**
 * Upload — drop / pick a video file → unified RecordingReview step
 * (preview + trim + optional title + analyze) → /api/upload → poll →
 * /result/:id. Same review component every other recording mode uses,
 * so the trim and title UX is identical across the four entry points.
 */
/**
 * Derive a human-readable stage label from the categorical status
 * + the `progress` percentage (0..100) the backend pushes via the
 * /api/media/{id}/progress-stream SSE endpoint. Mapping below is
 * chosen to match the actual pipeline phases in
 * `_run_upload_pipeline_sync`:
 * phases in `_run_upload_pipeline_sync`):
 *
 *   pending                               → "Queued — waiting for a worker…"
 *   processing, pct < 5                   → "Extracting audio…"
 *   processing, 5 ≤ pct < 95              → "Transcribing speech and analysing video…"
 *   processing, pct ≥ 95                  → "Analysing confidence signals…"
 *   processing, frames known but no work  → "Generating report…"
 *   completed / failed                    → handled by the caller
 *
 * The 5/95 split corresponds to the bracket inside which both the
 * audio worker (Whisper / PYIN / fillers) and the video frame loop
 * (MediaPipe at 5 fps) are active in parallel; the tail-end
 * "Generating report…" covers the post-loop aggregation + DB write.
 */
function deriveStageText(status, data) {
  if (status === 'pending') return 'Queued — waiting for a worker…'
  if (status !== 'processing') return null
  // `progress` is now computed server-side and persisted on the
  // Media row, so all uvicorn workers see the same value. NULL
  // means "frame loop hasn't started yet" — typically still
  // extracting audio.
  const pct = data?.progress
  if (pct == null) return 'Extracting audio…'
  if (pct < 5) return 'Extracting audio…'
  if (pct < 95) return 'Transcribing speech and analysing video…'
  return 'Analysing confidence signals…'
}

function progressPct(data) {
  const pct = data?.progress
  if (pct == null) return null
  return Math.max(0, Math.min(100, Math.round(pct)))
}

export default function Upload() {
  const [pickedFile, setPickedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [statusText, setStatusText] = useState(null)
  const [progress, setProgress] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [pickError, setPickError] = useState(null)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function pickFile(file) {
    if (!file) return
    setPickError(null)
    setUploadError(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPickedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function handleFilePick(e) {
    pickFile(e.target.files[0])
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setPickError('Please drop a video file (MP4, MOV, WebM).')
      return
    }
    pickFile(file)
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPickedFile(null)
    setPreviewUrl(null)
    setUploadError(null)
    setPickError(null)
  }

  async function handleAnalyze({ title, body, trimSegments }) {
    if (!pickedFile) return
    setUploadError(null)
    setUploading(true)
    setStatusText('Uploading file…')

    const formData = new FormData()
    formData.append('file', pickedFile)
    if (trimSegments) {
      formData.append('trim_segments', JSON.stringify(trimSegments))
    }
    if (title) {
      formData.append('prompt_title', title)
      formData.append('prompt_body', body || '')
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
      setStatusText('Extracting audio…')
      setProgress(0)
      const final = await pollMediaStatus(data.media_id, {
        onProgress: (s, payload) => {
          // SSE pushes a fresh state event every time the backend
          // bumps Media.processing_progress (throttled to ~2 %
          // steps), so the bar moves smoothly without polling.
          const stage = deriveStageText(s, payload)
          if (stage) setStatusText(stage)
          const pct = progressPct(payload)
          if (pct !== null) setProgress(pct)
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
    <div>
      <p className="text-sm text-text-muted mb-6">
        <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
        {' / '}
        <span className="text-text-secondary">Analyze a Video</span>
      </p>

      <div className="mb-6">
        <h2 className="mb-1">Analyze a Presentation Recording</h2>
        <p className="text-text-secondary text-sm">Upload a video — get face + speech + confidence analysis</p>
      </div>

      {pickError && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-4">
          {pickError}
        </div>
      )}

      {!pickedFile && !uploading && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-16 text-center cursor-pointer transition-all duration-200 hover:border-border-accent hover:bg-accent-soft group"
        >
          <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-200">📁</div>
          <p className="font-semibold text-text-primary mb-1">Drop your video here</p>
          <p className="text-sm text-text-muted">or click to browse</p>
          <p className="text-xs text-text-muted mt-3">MP4, MOV, WebM · max 500MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFilePick}
            hidden
          />
        </div>
      )}

      {pickedFile && !uploading && (
        <RecordingReview
          mediaSrc={previewUrl}
          mediaKind="video"
          mediaBytes={pickedFile.size}
          submitting={false}
          error={uploadError}
          onAnalyze={handleAnalyze}
          onDiscard={reset}
        />
      )}

      {uploading && (
        <AnalyzingProgress
          statusText={statusText || 'Processing video…'}
          pct={progress}
          hint="This may take a moment for longer videos."
        />
      )}
    </div>
  )
}
