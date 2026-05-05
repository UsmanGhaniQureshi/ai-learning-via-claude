import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'

/**
 * RequireCalibration — gate practice surfaces (/live, /upload,
 * /analyzer) on having completed Personal Setup OR having at least
 * one prior session OR having explicitly opted to skip.
 *
 *   is_complete=true                       → render children
 *   is_complete=false AND has sessions     → render children
 *                                            (CalibrationStatusBadge
 *                                            shows the quiet nudge)
 *   is_complete=false AND no sessions AND
 *     skipped flag set                     → render children
 *                                            (skipped users get
 *                                            general scoring until
 *                                            they finish setup)
 *   is_complete=false AND no sessions AND
 *     not skipped                          → redirect to /calibration
 *
 * Polls /api/calibration/status once on mount. While loading shows
 * the standard spinner. On network failure, falls through to render
 * children — calibration is enhancement, not a hard auth gate.
 */
export default function RequireCalibration({ children }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(`${API_BASE}/api/calibration/status`)
        if (!res.ok) {
          // Network/auth error — be permissive, the page itself
          // will handle it.
          if (!cancelled) setStatus({ is_complete: true })
        } else {
          const data = await res.json()
          if (!cancelled) setStatus(data)
        }
      } catch {
        if (!cancelled) setStatus({ is_complete: true })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="processing">
        <div className="spinner"></div>
        <p>Loading…</p>
      </div>
    )
  }

  if (!status?.is_complete && (status?.session_count ?? 0) === 0) {
    let skipped = false
    try { skipped = localStorage.getItem('cd_calib_skipped') === '1' }
    catch { /* ignore — treat as not skipped */ }
    if (!skipped) {
      return <Navigate to="/calibration" replace />
    }
  }

  return children
}
