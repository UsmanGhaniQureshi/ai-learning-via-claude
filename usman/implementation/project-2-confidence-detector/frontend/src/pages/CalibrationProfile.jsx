import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'

/**
 * /calibration/profile — read-only view of the user's stored
 * personal baseline. Shows in plain English what was captured,
 * which signals are reliable vs provisional, and offers a
 * "Reset and Redo Setup" path with confirm.
 */
export default function CalibrationProfilePage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(`${API_BASE}/api/calibration/status`)
        if (!res.ok) {
          setStatus({ is_complete: false })
          return
        }
        const data = await res.json()
        if (!cancelled) setStatus(data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="text-center py-12 text-text-muted">Loading…</div>
  }

  if (!status?.is_complete) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-2xl font-display font-extrabold">
          No personal profile yet
        </h2>
        <p className="text-text-secondary">
          You have not completed Personal Setup yet.
        </p>
        <Link to="/calibration" className="btn btn-primary">
          Set Up Now
        </Link>
      </div>
    )
  }

  const conf = status.baseline_confidence ?? 0
  const confLabel = conf >= 0.75 ? 'High' : conf >= 0.5 ? 'Medium' : 'Low'

  async function resetSetup() {
    if (!window.confirm(
      'This will erase your current profile and start a fresh ~4-minute Personal Setup. Continue?',
    )) return
    setResetting(true)
    try {
      const res = await apiFetch(`${API_BASE}/api/calibration/start`, {
        method: 'POST',
      })
      if (!res.ok) {
        setResetting(false)
        return
      }
      navigate('/calibration', { replace: true })
    } catch {
      setResetting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-3xl font-display font-extrabold">
          Your Personal Profile
        </h2>
        <span className="text-sm text-text-muted">
          v{status.calibration_version} · {status.session_count} session
          {status.session_count === 1 ? '' : 's'} since setup
        </span>
      </div>

      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-text-muted uppercase tracking-wider">
              Profile confidence
            </div>
            <div className="text-2xl font-display font-extrabold text-text-primary">
              {confLabel}
            </div>
          </div>
          <div className="text-xs text-text-secondary text-right max-w-[60%]">
            {confLabel === 'High'
              ? "Readings were consistent across calibration recordings."
              : confLabel === 'Medium'
                ? "Some variability — scoring tightens as you add sessions."
                : "Recordings varied a lot — scoring blends with universal thresholds for now."}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <ProfileSection title="Captured emotions">
          {(status.emotions_captured ?? []).length} of {status.target_emotions ?? '—'} expressions captured
        </ProfileSection>
        <ProfileSection title="Voice recordings">
          {status.voice_recordings_done ?? 0} camera-on,
          {' '}{status.audio_recordings_done ?? 0} camera-off
        </ProfileSection>
      </div>

      <div className="bg-elevated/50 border border-border rounded-md p-4 text-sm text-text-secondary">
        <strong className="text-text-primary">How blending works:</strong>{' '}
        for the first 3 sessions after setup, scoring uses your
        calibration baseline directly. After that, it gradually drifts
        toward your recent session averages — so the more you practise,
        the more your profile reflects your current style.
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-border">
        <Link to="/" className="text-sm text-text-secondary hover:underline">
          ← Back to dashboard
        </Link>
        <button
          type="button"
          onClick={resetSetup}
          disabled={resetting}
          className="btn btn-danger btn-sm disabled:opacity-50"
        >
          {resetting ? 'Resetting…' : 'Reset and Redo Setup'}
        </button>
      </div>
    </div>
  )
}

function ProfileSection({ title, children }) {
  return (
    <div className="glass-card p-4 space-y-1">
      <div className="text-xs text-text-muted">{title}</div>
      <div className="text-sm text-text-primary">{children}</div>
    </div>
  )
}
