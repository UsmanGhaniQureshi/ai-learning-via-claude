import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  STATUS_BADGE,
  STATUS_DOT_BG,
  STATUS_LABEL,
  STATUS_FILL_WIDTH,
  NUDGE_BY_SIGNAL as NUDGES,
  ENCOURAGEMENT_NUDGES as ENCOURAGEMENT,
} from './hudStatus'

/**
 * LiveHUD — overlay-on-camera coaching surface for live practice.
 *
 * Reads:
 *   - liveHud         per-chunk { rolling_total, detection, voice_pitch,
 *                                 noise_level, speech_pace, worst_signal,
 *                                 worst_status } from the WS payload
 *   - elapsedSeconds  number — used by the top bar timer
 *   - cameraLabel     string — e.g. "FaceTime HD Camera"
 *   - density         "full" | "minimal" | "hidden" — controls what's drawn
 *   - onDensityChange (next) => void — picker callback
 *
 * Three rules from the spec:
 *   1. Only ONE nudge line at the bottom — updates only when the
 *      worst signal CHANGES, not on every chunk.
 *   2. Signal cards animate (brief flash) when their status changes.
 *   3. No streaming text feed — keep eyes on the camera.
 *
 * Status maps + nudge strings live in `./hudStatus.js` so the
 * ResultHUD (playback overlay) can reuse them verbatim.
 */

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function pickNudge(liveHud, elapsedSeconds) {
  if (!liveHud) return 'Stay relaxed — scoring will start in a few seconds.'
  const { worst_signal, worst_status } = liveHud
  // If the worst signal is itself "good" or "excellent" then
  // EVERY signal is at least good. Rotate encouragement instead.
  if (!worst_signal || worst_status === 'good' || worst_status === 'excellent') {
    const idx = Math.floor(elapsedSeconds / 12) % ENCOURAGEMENT.length
    return ENCOURAGEMENT[idx]
  }
  if (worst_status === 'poor') return NUDGES[worst_signal] || 'Stay focused'
  // "fair" → use the same wording but softer (still actionable).
  return NUDGES[worst_signal] || 'Stay focused'
}

/**
 * Card with a status badge + thin progress strip. Briefly flashes
 * when the status changes between chunks — implemented via a key
 * change forcing the inner element to remount, which restarts the
 * Tailwind `animate-fade-up` animation declared in tailwind.config.
 */
function SignalCard({ label, status, accentSubLabel }) {
  const display = status ? STATUS_LABEL[status] : '—'
  const badgeClass = status ? STATUS_BADGE[status] : 'badge-muted'
  const dotClass = status ? STATUS_DOT_BG[status] : 'bg-white/40'
  return (
    // Higher contrast for camera-overlay readability:
    //   - pill bg goes /70 → /80 (bg-black gives a near-uniform dark
    //     surface even when the underlying video is bright skin tones)
    //   - label text: text-text-muted (#475569 dark grey) → text-white/80
    //     (legible on top of any video frame, not dependent on the
    //     darkness of the pill bleed-through)
    <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-md p-2.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          // `key` flip on status change forces a remount → re-runs
          // the fade-up animation, giving the brief flash spec'd in
          // Step 3G. Cheap, no JS animation library needed.
          key={`${label}-${status || 'none'}`}
          className={`badge ${badgeClass} animate-fade-up font-semibold`}
        >
          {display}
        </span>
        {accentSubLabel && (
          <span className="text-[10px] text-white/60">{accentSubLabel}</span>
        )}
      </div>
      {/* Thin progress bar — fills proportional to status tier. */}
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full ${dotClass} transition-all duration-500`}
          style={{ width: STATUS_FILL_WIDTH[status] || '0%' }}
        />
      </div>
    </div>
  )
}

// Performance: memoised so the HUD only re-renders when its own
// props change — most importantly liveHud (per WS chunk, ~3 s) and
// elapsedSeconds (per second, for the timer pill). Without memo,
// LiveSession's setScores / setEmotion / setTranscript / setScoreHistory
// each force the whole HUD to re-paint even though none of those
// values feed it.
function LiveHUD({
  liveHud,
  elapsedSeconds = 0,
  cameraLabel = '',
  density = 'full',
  onDensityChange,
}) {
  // Track the previous worst_signal so the nudge line only changes
  // when the WORST signal changes, not on every chunk (Step 3G).
  const lastWorstRef = useRef(null)
  const [nudge, setNudge] = useState(() => pickNudge(liveHud, elapsedSeconds))

  useEffect(() => {
    const nextWorst = liveHud?.worst_signal || null
    const nextStatus = liveHud?.worst_status || null
    // Update the line ONLY when:
    //   (a) the worst-signal name changed, or
    //   (b) the status crossed in/out of "all good" territory.
    const wasAllGood = lastWorstRef.current?.status === 'good' || lastWorstRef.current?.status === 'excellent'
    const isAllGood = nextStatus === 'good' || nextStatus === 'excellent'
    if (
      lastWorstRef.current?.signal !== nextWorst ||
      wasAllGood !== isAllGood
    ) {
      setNudge(pickNudge(liveHud, elapsedSeconds))
      lastWorstRef.current = { signal: nextWorst, status: nextStatus }
    }
  }, [liveHud, elapsedSeconds])

  // Rotate the encouragement message during all-good stretches even
  // when the underlying signal hasn't changed. Cheap effect; only
  // refreshes the nudge text when the rotation index changes.
  const rotationIdx = Math.floor(elapsedSeconds / 12)
  useEffect(() => {
    const status = lastWorstRef.current?.status
    if (status === 'good' || status === 'excellent' || !lastWorstRef.current?.signal) {
      setNudge(pickNudge(liveHud, elapsedSeconds))
    }
    // We only want to fire when rotationIdx changes — the dependency
    // list is exactly that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationIdx])

  const rolling = liveHud?.rolling_total
  const detection = liveHud?.detection
  const cameraText = cameraLabel || 'Default camera'

  // Density pill picker — bottom-right of the camera card.
  const densityPicker = useMemo(() => (
    <div className="flex items-center gap-1 bg-black/80 backdrop-blur-sm border border-white/10 rounded-full p-0.5">
      {[
        { id: 'full', label: 'Signals on' },
        { id: 'minimal', label: 'Minimal' },
        { id: 'hidden', label: 'Hidden' },
      ].map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onDensityChange?.(opt.id)}
          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full transition-colors ${
            density === opt.id
              ? 'bg-accent text-white'
              : 'text-white/70 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ), [density, onDensityChange])

  return (
    // Pointer-events-none on the wrapper so the user can still click
    // through to underlying elements (BackgroundPicker, etc.). Each
    // interactive child opts back in via pointer-events-auto.
    //
    // Readability rationale (Apr 2026 fix): every overlay pill uses
    // bg-black/80 with backdrop-blur-sm and white-with-alpha text so
    // labels stay legible regardless of what's behind them on the
    // camera feed. Pure-Tailwind palette, no new colours introduced.
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar — ALWAYS visible, regardless of density */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 bg-black/80 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
          <span className="text-white text-xs font-semibold tracking-wide">REC</span>
          <span className="text-white/85 text-xs tabular-nums font-medium">
            {formatTimer(elapsedSeconds)}
          </span>
        </div>
        <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1 max-w-[220px] truncate text-white/90 text-xs font-medium">
          {cameraText}
        </div>
      </div>

      {density === 'full' && (
        <>
          {/* Left side — confidence + detection light */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-none">
            <div className="bg-black/85 backdrop-blur-sm border border-white/10 rounded-md px-4 py-3 text-center min-w-[110px]">
              <div className="text-[10px] font-semibold text-white/75 uppercase tracking-wider">
                Confidence
              </div>
              <div
                className="text-4xl font-display font-extrabold text-white tabular-nums leading-tight"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
              >
                {rolling != null ? rolling : '—'}
              </div>
              <div className="text-[10px] text-white/60">
                rolling, last 4 chunks
              </div>
            </div>
            <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-md px-3 py-2 flex items-center gap-2">
              <span
                key={`det-${detection || 'none'}`}
                className={`w-3 h-3 rounded-full ${
                  detection ? STATUS_DOT_BG[detection] : 'bg-white/40'
                } animate-fade-up`}
              />
              <span className="text-xs text-white/90 font-medium">
                {detection ? `Detection: ${STATUS_LABEL[detection]}` : 'Detection: —'}
              </span>
            </div>
          </div>

          {/* Right side — 4 signal cards stacked */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 w-[180px] pointer-events-none">
            <SignalCard label="Detection" status={liveHud?.detection} />
            <SignalCard label="Voice Pitch" status={liveHud?.voice_pitch} />
            <SignalCard label="Noise Level" status={liveHud?.noise_level} />
            <SignalCard label="Speech Pace" status={liveHud?.speech_pace} />
          </div>
        </>
      )}

      {/* Density picker — visible on full + minimal so the user can
          always reach Hidden / restore from Hidden via top-bar click. */}
      <div className="absolute bottom-3 right-3 pointer-events-auto">
        {densityPicker}
      </div>

      {/* Bottom nudge line — full + minimal both show it */}
      {density !== 'hidden' && (
        <div className="absolute bottom-3 left-3 right-[200px] pointer-events-none">
          <div className="bg-black/85 backdrop-blur-sm border border-border-accent rounded-md px-4 py-2 max-w-md mx-auto">
            <p
              key={`nudge-${nudge}`}
              className="text-sm text-white text-center font-medium animate-fade-up"
            >
              {nudge}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(LiveHUD)
