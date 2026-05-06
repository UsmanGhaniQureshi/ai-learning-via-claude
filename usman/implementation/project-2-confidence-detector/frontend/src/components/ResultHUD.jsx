import { useMemo } from 'react'
import {
  STATUS_BADGE,
  STATUS_DOT_BG,
  STATUS_LABEL,
  STATUS_FILL_WIDTH,
  NUDGE_BY_SIGNAL,
  ENCOURAGEMENT_NUDGES,
} from './hudStatus'

/**
 * ResultHUD — read-only twin of LiveHUD for the result-screen video.
 *
 * Reads from the persisted `live_hud_timeline` array (one entry per
 * processed chunk, each stamped with `t_s` = chunk index × 3 s) plus
 * the playback element's current time, and renders the same overlay
 * style the user saw during recording. No REC pulse, no camera
 * label — those make sense only during a live capture.
 *
 * Props:
 *   liveHudTimeline   array | null
 *                     entries shape: { t_s, rolling_total, detection,
 *                       voice_pitch, noise_level, speech_pace,
 *                       worst_signal, worst_status }
 *                     Older recordings (made before the timeline was
 *                     persisted) pass `null`; the HUD then renders
 *                     placeholder cards rather than crash.
 *   currentTime       number — video.currentTime in seconds
 *   density           "full" | "minimal" | "hidden"
 *   onDensityChange   (next) => void
 *   durationS         number | null — total length, used in the timer
 *                                     pill on the top-left
 *
 * Status maps + nudge strings live in `./hudStatus.js`, shared with
 * LiveHUD so visuals stay in lockstep.
 */

function formatTimer(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Linear scan picks the latest entry whose `t_s` is at or before
// `currentTime`. Same pattern PlaybackReview.jsx uses for face/speech
// timelines. Returns null if the timeline is empty / null.
function pickHudEntry(timeline, currentTime) {
  if (!Array.isArray(timeline) || timeline.length === 0) return null
  const t = currentTime || 0
  let chosen = null
  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i]
    if (!entry) continue
    if ((entry.t_s ?? 0) <= t) {
      chosen = entry
    } else {
      break
    }
  }
  return chosen ?? timeline.find((e) => e) ?? null
}

function pickNudge(entry, currentTime) {
  if (!entry) {
    return 'Press play to replay your statuses.'
  }
  const { worst_signal: worst, worst_status: status } = entry
  if (!worst || status === 'good' || status === 'excellent') {
    const idx = Math.floor((currentTime || 0) / 12) % ENCOURAGEMENT_NUDGES.length
    return ENCOURAGEMENT_NUDGES[idx]
  }
  return NUDGE_BY_SIGNAL[worst] || 'Stay focused'
}

function SignalCard({ label, status }) {
  const display = status ? STATUS_LABEL[status] : '—'
  const badgeClass = status ? STATUS_BADGE[status] : 'badge-muted'
  const dotClass = status ? STATUS_DOT_BG[status] : 'bg-white/40'
  return (
    <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-md p-2.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          // Re-key on status change so the existing `animate-fade-up`
          // restarts and the badge briefly flashes — same UX cue
          // LiveHUD uses for chunk-to-chunk transitions.
          key={`${label}-${status || 'none'}`}
          className={`badge ${badgeClass} animate-fade-up font-semibold`}
        >
          {display}
        </span>
      </div>
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full ${dotClass} transition-all duration-500`}
          style={{ width: STATUS_FILL_WIDTH[status] || '0%' }}
        />
      </div>
    </div>
  )
}

export default function ResultHUD({
  liveHudTimeline,
  currentTime = 0,
  density = 'full',
  onDensityChange,
  durationS = null,
}) {
  const entry = useMemo(
    () => pickHudEntry(liveHudTimeline, currentTime),
    [liveHudTimeline, currentTime],
  )
  const nudge = pickNudge(entry, currentTime)
  const rolling = entry?.rolling_total ?? null
  const detection = entry?.detection ?? null

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

  // No data at all — render the toggle + a tiny "no overlay data"
  // pill so the user knows this recording predates the persisted
  // timeline. Doesn't break the page layout.
  if (!Array.isArray(liveHudTimeline) || liveHudTimeline.length === 0) {
    return (
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-3 right-3 pointer-events-auto">
          {densityPicker}
        </div>
        {density !== 'hidden' && (
          <div className="absolute bottom-3 left-3 right-[200px] pointer-events-none">
            <div className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-md px-4 py-2 max-w-md mx-auto">
              <p className="text-xs text-white/70 text-center italic">
                Per-moment overlay data isn’t available for this recording.
              </p>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    // Pointer-events-none on the wrapper so the user's clicks fall
    // through to the underlying <video controls>. Each interactive
    // child opts back in via pointer-events-auto.
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar — always visible */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 bg-black/80 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-white text-xs font-semibold tracking-wide">
            REPLAY
          </span>
          <span className="text-white/85 text-xs tabular-nums font-medium">
            {formatTimer(currentTime)}
            {durationS != null && (
              <span className="text-white/60"> / {formatTimer(durationS)}</span>
            )}
          </span>
        </div>
      </div>

      {density === 'full' && (
        <>
          {/* Left side — rolling confidence + detection light */}
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
                {detection
                  ? `Detection: ${STATUS_LABEL[detection]}`
                  : 'Detection: —'}
              </span>
            </div>
          </div>

          {/* Right side — 4 signal cards */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 w-[180px] pointer-events-none">
            <SignalCard label="Detection" status={entry?.detection} />
            <SignalCard label="Voice Pitch" status={entry?.voice_pitch} />
            <SignalCard label="Noise Level" status={entry?.noise_level} />
            <SignalCard label="Speech Pace" status={entry?.speech_pace} />
          </div>
        </>
      )}

      {/* Density picker — bottom-right, always reachable. */}
      <div className="absolute bottom-3 right-3 pointer-events-auto">
        {densityPicker}
      </div>

      {/* Bottom nudge line. Hidden when density='hidden'. */}
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
