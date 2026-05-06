/**
 * SessionVideoRecorder — records video+audio from a MediaStream.
 * Reuses the SAME stream used for live camera feed.
 */
import { API_BASE, apiFetch } from '../config'

export class SessionVideoRecorder {
  constructor() {
    this.mediaRecorder = null
    this.chunks = []
    this.blob = null
  }

  async start(stream) {
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm'

    this.chunks = []
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 500_000,
      audioBitsPerSecond: 64_000,
    })

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }

    this.mediaRecorder.start(1000) // chunk every 1s
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null)
        return
      }
      this.mediaRecorder.onstop = () => {
        this.blob = new Blob(this.chunks, { type: 'video/webm' })
        resolve(this.blob)
      }
      this.mediaRecorder.stop()
    })
  }

  async uploadToServer(sessionId) {
    if (!this.blob) return null
    const formData = new FormData()
    formData.append('video', this.blob, `${sessionId}_video.webm`)
    formData.append('session_id', sessionId)
    const res = await apiFetch(`${API_BASE}/api/session/upload-video`, {
      method: 'POST',
      body: formData,
    })
    return res.json()
  }

  downloadLocally(sessionId) {
    if (!this.blob) return
    const url = URL.createObjectURL(this.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session_${sessionId}.webm`
    a.click()
    URL.revokeObjectURL(url)
  }
}
