import { Link } from 'react-router-dom'

/**
 * CalibrationComplete — final screen of Personal Setup. Shows a few
 * non-technical highlights from the just-computed baseline plus the
 * baseline-confidence badge. CTA → /live (Start Practising).
 *
 * Expects the response payload from POST /api/calibration/complete
 * as `summary`:
 *   {
 *     complete, baseline_summary: { wpm, pitch_std, ... },
 *     baseline_confidence, camera_anxiety_detected,
 *     reliable_signals, provisional_signals
 *   }
 */
export default function CalibrationComplete({ summary }) {
  const wpm = summary?.baseline_summary?.wpm
  const pitchStd = summary?.baseline_summary?.pitch_std
  const steady = summary?.baseline_summary?.voice_steadiness
  const conf = summary?.baseline_confidence ?? 0
  const confLabel = conf >= 0.75 ? 'High' : conf >= 0.5 ? 'Medium' : 'Low'
  const confColor = conf >= 0.75
    ? 'text-success'
    : conf >= 0.5 ? 'text-warning' : 'text-danger'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto rounded-full bg-success flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-extrabold leading-tight">
          Your personal profile is ready.
        </h1>
        <p className="text-text-secondary">
          From now on, every score you get is measured against your own style.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Highlight
          label="Your natural speaking pace"
          value={wpm != null ? `${Math.round(wpm)} WPM` : '—'}
          tone={describePace(wpm)}
        />
        <Highlight
          label="Your vocal variety"
          value={pitchStd != null ? describePitchVariety(pitchStd) : '—'}
        />
        <Highlight
          label="Your voice steadiness"
          value={steady != null ? describeSteadiness(steady) : '—'}
        />
      </div>

      <div className="glass-card p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider">
            Profile confidence
          </div>
          <div className={`text-2xl font-display font-extrabold ${confColor}`}>
            {confLabel}
          </div>
        </div>
        <div className="text-xs text-text-secondary text-right max-w-[60%]">
          {confLabel === 'High'
            ? "Your readings were consistent across recordings — your baseline is solid."
            : confLabel === 'Medium'
              ? "Some variability between recordings. Scoring will tighten as you complete more sessions."
              : "Your recordings varied a lot. Scoring blends with universal thresholds until we have more data from real sessions."}
        </div>
      </div>

      {summary?.camera_anxiety_detected && (
        <div className="rounded-md p-4 bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.4)]">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">
              Camera Effect Detected
            </span>
            <span className="text-sm font-bold text-warning">Calibrated</span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            We noticed your voice changes slightly when the camera is on
            vs off. We will factor this in when scoring your live video sessions.
          </p>
        </div>
      )}

      {Array.isArray(summary?.provisional_signals) && summary.provisional_signals.length > 0 && (
        <div className="text-xs text-text-muted bg-elevated/30 border border-border rounded-md p-3">
          <strong className="text-text-secondary">Note:</strong>{' '}
          {summary.provisional_signals.length} signal(s) are
          provisional and will blend with universal thresholds until
          you have completed several practice sessions.
        </div>
      )}

      <div className="flex justify-end">
        <Link to="/live" className="btn btn-primary btn-lg">
          Start Practising →
        </Link>
      </div>
    </div>
  )
}

function Highlight({ label, value, tone }) {
  return (
    <div className="glass-card p-4 space-y-1">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-xl font-display font-bold text-text-primary">
        {value}
      </div>
      {tone && <div className="text-xs text-text-secondary">{tone}</div>}
    </div>
  )
}

function describePace(wpm) {
  if (wpm == null) return null
  if (wpm < 110) return 'on the steady side'
  if (wpm > 170) return 'on the brisk side'
  return 'right in the natural range'
}

function describePitchVariety(pitchStd) {
  if (pitchStd < 10) return 'naturally narrow range'
  if (pitchStd < 25) return 'naturally moderate range'
  return 'naturally expressive range'
}

function describeSteadiness(score) {
  if (score >= 80) return 'very consistent'
  if (score >= 60) return 'mostly consistent'
  return 'variable — that is normal'
}
