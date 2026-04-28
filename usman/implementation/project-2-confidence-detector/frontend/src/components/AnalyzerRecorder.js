/**
 * AnalyzerRecorder — audio-only recorder for the /analyzer page.
 * No camera permission needed. Completely independent of live session.
 */
import { API_BASE, apiFetch } from '../config'

const API = API_BASE

export class AnalyzerRecorder {
  constructor() {
    this.mediaRecorder = null
    this.chunks = []
    this.stream = null
  }

  async start() {
    // Request audio only — no camera permission needed
    // Audio constraints OFF for accuracy parity with the upload
    // path — see useLiveSession.js for the full rationale.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })

    this.chunks = []

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      audioBitsPerSecond: 64_000,
    })

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }

    this.mediaRecorder.start(1000)
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null)
        return
      }
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' })
        // Release mic
        if (this.stream) {
          this.stream.getTracks().forEach(t => t.stop())
          this.stream = null
        }
        resolve(blob)
      }
      this.mediaRecorder.stop()
    })
  }

  async analyze(blob, label = 'recording') {
    const formData = new FormData()
    formData.append('audio_file', blob, `${label}.webm`)
    formData.append('session_label', label)

    const res = await apiFetch(`${API}/api/analyze-audio`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) throw new Error(`Analysis failed: ${res.status}`)
    return res.json()
  }
}
