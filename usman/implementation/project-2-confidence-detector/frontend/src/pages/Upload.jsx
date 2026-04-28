import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'
import { pollMediaStatus } from '../utils/mediaStatus'
import { fmtSecs } from '../utils/timeStr'
import TrimSegmentsEditor, { validateSegments } from '../components/TrimSegmentsEditor'
import TopicSelector from '../components/TopicSelector'

export default function Upload() {
  const [pickedFile, setPickedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [useFull, setUseFull] = useState(true)
  const [segments, setSegments] = useState([{ start: '', end: '' }])
  const [uploading, setUploading] = useState(false)
  const [statusText, setStatusText] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  // Topic info from <TopicSelector>; null = no topic, no LLM coaching.
  const [topicMeta, setTopicMeta] = useState(null)
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function pickFile(file) {
    if (!file) return
    setUploadError(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPickedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setPreviewDuration(0)
    setUseFull(true)
    setSegments([{ start: '', end: '' }])
  }

  function handleFilePick(e) {
    pickFile(e.target.files[0])
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setUploadError('Please drop a video file (MP4, MOV, WebM).')
      return
    }
    pickFile(file)
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
    if (topicMeta?.promptTitle) {
      formData.append('prompt_title', topicMeta.promptTitle)
      formData.append('prompt_body', topicMeta.promptBody || '')
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

      {uploadError && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-4">
          {uploadError}
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
        <div className="space-y-4">
          <video
            ref={videoRef}
            src={previewUrl}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => setPreviewDuration(e.currentTarget.duration || 0)}
            className="w-full max-h-[360px] rounded-md bg-black"
          />

          <p className="text-sm text-text-secondary">
            <strong className="text-text-primary">{pickedFile.name}</strong>
            {previewDuration > 0 && <> · {fmtSecs(previewDuration)}</>}
          </p>

          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={useFull}
              onChange={(e) => setUseFull(e.target.checked)}
              className="accent-accent"
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

          <TopicSelector value={topicMeta} onChange={setTopicMeta} />

          <div className="flex gap-3">
            <button onClick={handleSubmit} className="btn btn-primary">Analyze</button>
            <button onClick={reset} className="btn btn-secondary">Pick a different file</button>
          </div>
        </div>
      )}

      {uploading && (
        <div className="glass-card p-12 text-center max-w-md mx-auto space-y-3">
          <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-primary">{statusText || 'Processing video…'}</p>
          <p className="text-text-muted text-sm">This may take a moment for longer videos.</p>
        </div>
      )}
    </div>
  )
}
