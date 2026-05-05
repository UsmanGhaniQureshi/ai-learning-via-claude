import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'

/**
 * CalibrationStatusBadge — discoverability surface for Personal Setup.
 *
 * Two render variants chosen by the `variant` prop:
 *
 *   variant="prominent"  → first-time visitor (no calibration AND no
 *                          sessions yet). A loud welcome card with
 *                          a clear CTA + "Skip for now" link. This is
 *                          how a brand-new user learns that
 *                          calibration exists.
 *
 *   variant="quiet"      → user has done sessions but never finished
 *                          calibration. A small dismissible single-line
 *                          nudge — does not compete with page content.
 *
 * Each instance fetches /api/calibration/status independently and
 * decides whether to render based on (is_complete, session_count,
 * skip flag, dismiss flag). Both variants return null for
 * already-calibrated users — steady-state Home shows nothing.
 */
export default function CalibrationStatusBadge({ variant = 'quiet' }) {
  const [status, setStatus] = useState(null)
  const [skipped, setSkipped] = useState(() => {
    try { return localStorage.getItem('cd_calib_skipped') === '1' }
    catch { return false }
  })
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('cd_calib_nudge_dismissed') === '1' }
    catch { return false }
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(`${API_BASE}/api/calibration/status`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setStatus(data)
      } catch { /* ignore */ }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Calibration done → never render either variant.
  if (!status || status.is_complete) return null

  const sessionCount = status.session_count ?? 0
  const isFirstTimer = sessionCount === 0

  if (variant === 'prominent') {
    // Only render the loud card for true first-timers who have not
    // explicitly opted to skip. Once they skip OR they record a
    // session, this variant disappears.
    if (!isFirstTimer || skipped) return null

    return (
      <div className="rounded-lg border border-border-accent bg-accent-soft/60 p-5 sm:p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-text-accent text-2xl shrink-0 leading-none">✦</span>
            <div className="min-w-0">
              <h3 className="text-text-primary font-display font-extrabold text-lg sm:text-xl m-0">
                Start here — a 4-minute personal setup
              </h3>
              <p className="text-text-secondary text-sm mt-1 leading-relaxed">
                Teaches the app how <em>you</em> naturally speak and look,
                so every score from now on is tuned to you — not a generic
                standard. One-time only.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 sm:flex-col sm:items-end">
            <Link to="/calibration" className="btn btn-primary whitespace-nowrap">
              Set up now →
            </Link>
            <button
              type="button"
              onClick={() => {
                setSkipped(true)
                try { localStorage.setItem('cd_calib_skipped', '1') } catch { /* ignore */ }
              }}
              className="text-xs text-text-muted hover:text-text-secondary underline whitespace-nowrap"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    )
  }

  // variant="quiet" — only for users who have at least one session
  // already. First-timers should never see the quiet variant; they
  // should see the prominent one (or have skipped it).
  if (isFirstTimer) return null
  if (dismissed) return null

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-elevated/40 px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-text-accent text-base shrink-0">✦</span>
        <div className="text-sm text-text-secondary truncate">
          <span className="text-text-primary font-medium">Personalize your scores.</span>
          {' '}A 4-minute one-time setup tailors every result to your own style.
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/calibration"
          className="text-sm text-text-accent font-semibold hover:underline whitespace-nowrap"
        >
          Set up →
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true)
            try { localStorage.setItem('cd_calib_nudge_dismissed', '1') } catch { /* ignore */ }
          }}
          className="text-text-muted hover:text-text-secondary text-lg leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-elevated"
        >
          ×
        </button>
      </div>
    </div>
  )
}
