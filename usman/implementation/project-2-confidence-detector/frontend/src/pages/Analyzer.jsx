import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'
import { pollMediaStatus } from '../utils/mediaStatus'
import RecordingReview from '../components/RecordingReview'
import AnalyzingProgress from '../components/AnalyzingProgress'
import LiveAnalyzer from './LiveAnalyzer'

const TABS = ['Upload Audio', 'Live Mic']

export default function Analyzer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('mode') === 'live' ? 'Live Mic' : TABS[0]
  const [activeTab, setActiveTab] = useState(requestedTab)
  const [error, setError] = useState(null)
  const [pickedFile, setPickedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [statusText, setStatusText] = useState(null)
  const [progress, setProgress] = useState(null)
  const [uploading, setUploading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setActiveTab(requestedTab)
  }, [requestedTab])

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
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPickedFile(null)
    setPreviewUrl(null)
    setError(null)
  }

  async function handleAnalyze({ title, body, trimSegments }) {
    if (!pickedFile) return
    setError(null)
    setUploading(true)
    setStatusText('Uploading file…')

    const formData = new FormData()
    formData.append('audio_file', pickedFile)
    formData.append('session_label', title || pickedFile.name)
    if (trimSegments) {
      formData.append('trim_segments', JSON.stringify(trimSegments))
    }
    if (title) {
      formData.append('prompt_title', title)
      formData.append('prompt_body', body || '')
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
        onProgress: (s, payload) => {
          if (s === 'pending') setStatusText('Queued — waiting for a worker…')
          if (s === 'processing') setStatusText('Analyzing speech…')
          if (payload?.progress != null) setProgress(payload.progress)
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

  function handleTabChange(tab) {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams)
    if (tab === 'Live Mic') next.set('mode', 'live')
    else next.delete('mode')
    setSearchParams(next, { replace: true })
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
              onClick={() => handleTabChange(tab)}
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
            onClick={() => handleTabChange(tab)}
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
        <RecordingReview
          mediaSrc={previewUrl}
          mediaKind="audio"
          mediaBytes={pickedFile.size}
          submitting={false}
          error={error}
          onAnalyze={handleAnalyze}
          onDiscard={reset}
        />
      )}

      {uploading && (
        <AnalyzingProgress
          statusText={statusText || 'Analyzing speech…'}
          pct={progress}
          hint="Running VAD, pitch analysis, transcription, and scoring."
        />
      )}
    </div>
  )
}
