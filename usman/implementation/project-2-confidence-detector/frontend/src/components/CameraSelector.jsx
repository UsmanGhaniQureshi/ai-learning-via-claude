import { useEffect, useState } from 'react'

/**
 * CameraSelector — pre-session video-input picker.
 *
 * Uses the browser's `navigator.mediaDevices.enumerateDevices()` API.
 * No package needed.
 *
 * Caveat (browser-imposed, not ours): device labels are blank until
 * the user has granted camera permission at least once. To get
 * useful labels we briefly open a dummy MediaStream and immediately
 * stop it — this is the standard workaround. We only do it on first
 * mount, and only if `enumerateDevices()` came back with no labels.
 */

const STORAGE_KEY = 'cd_camera_device_id'

function loadSavedDeviceId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function saveDeviceId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export default function CameraSelector({ deviceId, onChange }) {
  const [devices, setDevices] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function listCameras() {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setError('Camera selection not supported in this browser')
        setLoading(false)
        return
      }
      try {
        let list = await navigator.mediaDevices.enumerateDevices()
        let videos = list.filter((d) => d.kind === 'videoinput')

        // If labels are blank (permission never granted) trigger the
        // permission prompt by opening a temporary stream, then re-
        // enumerate to pick up the labels.
        const allBlank =
          videos.length > 0 && videos.every((d) => !d.label)
        if (allBlank) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            })
            tempStream.getTracks().forEach((t) => t.stop())
            list = await navigator.mediaDevices.enumerateDevices()
            videos = list.filter((d) => d.kind === 'videoinput')
          } catch {
            // Permission denied — labels will stay blank but ids work.
          }
        }

        if (cancelled) return
        setDevices(videos)
        // Auto-pick: respect saved choice if still present;
        // otherwise the first device.
        const saved = loadSavedDeviceId()
        const validSaved = videos.find((d) => d.deviceId === saved)
        const initial = deviceId
          || (validSaved ? validSaved.deviceId : (videos[0]?.deviceId || ''))
        if (initial && initial !== deviceId) onChange(initial)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not list cameras')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    listCameras()
    // Re-enumerate on plug-in / unplug — `devicechange` fires on
    // both. We don't refresh more often than necessary.
    const refresh = () => listCameras()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
    }
  }, [deviceId, onChange])

  function handleChange(e) {
    const next = e.target.value
    saveDeviceId(next)
    onChange(next)
  }

  if (error) {
    return (
      <div className="text-xs text-warning">
        Camera selector unavailable: {error}. The default camera will be used.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-xs text-text-muted">Detecting cameras…</div>
    )
  }

  if (devices.length <= 1) {
    // One camera or none — no need for a dropdown. Render a tiny
    // status line so the user knows we noticed.
    const name = devices[0]?.label || 'Default camera'
    return (
      <div className="text-xs text-text-muted">
        Camera: <span className="text-text-secondary">{name}</span>
      </div>
    )
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
        Camera
      </span>
      <select
        value={deviceId || devices[0].deviceId}
        onChange={handleChange}
        className="bg-card border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-border-focus"
      >
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Camera ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  )
}
