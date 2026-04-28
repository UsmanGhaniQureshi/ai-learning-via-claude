import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'
import { pollMediaStatus } from '../utils/mediaStatus'
import { fmtSecs } from '../utils/timeStr'
import TrimSegmentsEditor, { validateSegments } from '../components/TrimSegmentsEditor'
import TopicSelector from '../components/TopicSelector'
import LiveAnalyzer from './LiveAnalyzer'

const TABS = ['Upload Audio', 'Live Mic']

export default function Analyzer() {
  const [activeTab, setActiveTab] = useState(TABS[0])
  const [error, setError] = useState(null)
  const [pickedFile, setPickedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [useFull, setUseFull] = useState(true)
  const [segments, setSegments] = useState([{ start: '', end: '' }])
  const [statusText, setStatusText] = useState(null)
  const [uploading, setUploading] = useState(false)
  // Topic for LLM coaching; null = no topic.
  const [topicMeta, setTopicMeta] = useState(null)
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
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPickedFile(null)
    setPreviewUrl(null)
    setPreviewDuration(0)
    setUseFull(true)
    setSegments([{ start: '', end: '' }])
    setError(null)
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

    setUploading(true)
    setStatusText('Uploading file…')
    const formData = new FormData()
    formData.append('audio_file', pickedFile)
    formData.append('session_label', pickedFile.name)
    if (segmentsPayload) {
      formData.append('trim_segments', JSON.stringify(segmentsPayload))
    }
    if (topicMeta?.promptTitle) {
      formData.append('prompt_title', topicMeta.promptTitle)
      formData.append('prompt_body', topicMeta.promptBody || '')
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
      setUploading(false)
    }
  }

  if (activeTab === 'Live Mic') {
    return (
      <div>
        <p className="text-sm text-text-muted mb-6">
          <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
          {' / '}
          <span className="text-text-secondary">Speech Analyzer</span>
        </p>
        <div className="flex gap-1 p-1 bg-elevated rounded-md w-fit mb-8">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                activeTab === tab
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <LiveAnalyzer />
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-text-muted mb-6">
        <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
        {' / '}
        <span className="text-text-secondary">Speech Analyzer</span>
      </p>

      <div className="mb-6">
        <h2 className="mb-1">Speech Analyzer</h2>
        <p className="text-text-secondary text-sm">Test your speech — no camera needed</p>
      </div>

      <div className="flex gap-1 p-1 bg-elevated rounded-md w-fit mb-8">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === tab
                ? 'bg-accent text-white shadow-glow'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-4">
          {error}
        </div>
      )}

      {!pickedFile && !uploading && (
        <label
          className="block border-2 border-dashed border-border rounded-xl p-16 text-center cursor-pointer transition-all duration-200 hover:border-border-accent hover:bg-accent-soft group"
        >
          <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-200">🎤</div>
          <p className="font-semibold text-text-primary mb-1">Click to select audio</p>
          <p className="text-sm text-text-muted">WAV / MP3 / M4A / WebM / OGG</p>
          <input
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg"
            onChange={handleFilePick}
            hidden
          />
        </label>
      )}

      {pickedFile && !uploading && (
        <div className="space-y-4">
          <audio
            ref={audioRef}
            src={previewUrl}
            controls
            preload="metadata"
            onLoadedMetadata={(e) => setPreviewDuration(e.currentTarget.duration || 0)}
            className="w-full"
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
          <p className="text-text-primary">{statusText || 'Analyzing speech…'}</p>
          <p className="text-text-muted text-sm">Running VAD, pitch analysis, transcription, and scoring.</p>
        </div>
      )}
    </div>
  )
}
