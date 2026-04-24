import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'

/**
 * Upload — pick a video, POST /api/upload, navigate to /result/:id when done.
 *
 * Previously this lived as an inline block in App.jsx and showed the full
 * results view on the same page. Now the result has its own URL so we just
 * redirect there on success.
 */
export default function Upload() {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const navigate = useNavigate()

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    const formData = new FormData()
    formData.append('file', file)
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
      navigate(`/result/${data.media_id}`)
    } catch (err) {
      setUploadError('Cannot connect to backend.')
      setUploading(false)
    }
  }

  return (
    <div className="section">
      <h2>Analyze a Presentation Recording</h2>
      <p className="subtitle">Upload a video — get face + speech + confidence analysis</p>

      {uploadError && <div className="session-error">{uploadError}</div>}

      {!uploading && (
        <label className="upload-area">
          <span className="upload-icon">&#x1F4C1;</span>
          <span>Click to select video</span>
          <span className="small">.mp4, .avi, .mov (max 500MB)</span>
          <input type="file" accept="video/*" onChange={handleUpload} hidden />
        </label>
      )}

      {uploading && (
        <div className="processing">
          <div className="spinner"></div>
          <p>Processing video — analyzing face expressions and speech…</p>
          <p className="small">This may take a moment for longer videos.</p>
        </div>
      )}
    </div>
  )
}
