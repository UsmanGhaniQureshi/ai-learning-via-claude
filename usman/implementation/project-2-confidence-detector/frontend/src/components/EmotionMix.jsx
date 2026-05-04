/**
 * EmotionMix — multi-label emotion result rendered as a stacked bar
 * + legend.
 *
 * Reads `report.emotion` (session-level) or any per-chunk
 * `chunk.emotion` shape:
 *   { mix: { nervous: 0.6, confident: 0.3, excited: 0.1, ... }, dominant, dominant_pct }
 *
 * The mix sums to 1.0 by construction. We render every label that
 * has at least 3% weight; everything below that is grouped into
 * "other" so the bar doesn't become a sliver-fest. Colour mapping is
 * fixed across the app so the same emotion always reads the same
 * colour.
 */
const COLOR_BY_LABEL = {
  nervous: 'bg-rose-500',
  confident: 'bg-emerald-500',
  excited: 'bg-amber-500',
  calm: 'bg-sky-500',
  hesitant: 'bg-fuchsia-500',
  monotone: 'bg-slate-500',
  // New labels — Tailwind-only palette so no theme colours change.
  // angry uses red-600 (deeper than nervous's rose-500) to keep the
  // two visually distinguishable on the stacked bar.
  engaged: 'bg-teal-500',
  bored: 'bg-zinc-500',
  angry: 'bg-red-600',
  sad: 'bg-indigo-500',
  other: 'bg-slate-400',
}

const TEXT_BY_LABEL = {
  nervous: 'text-rose-500',
  confident: 'text-emerald-500',
  excited: 'text-amber-500',
  calm: 'text-sky-500',
  hesitant: 'text-fuchsia-500',
  monotone: 'text-slate-500',
  engaged: 'text-teal-500',
  bored: 'text-zinc-500',
  angry: 'text-red-600',
  sad: 'text-indigo-500',
  other: 'text-slate-400',
}

function pctOf(v) {
  return Math.max(0, Math.min(100, Math.round((v || 0) * 100)))
}

export default function EmotionMix({ emotion, compact = false }) {
  if (!emotion || !emotion.mix) {
    return (
      <div className="text-sm text-text-muted italic">
        Emotion mix unavailable — no audio captured.
      </div>
    )
  }
  const entries = Object.entries(emotion.mix)
    .map(([label, weight]) => ({ label, weight: Number(weight) || 0 }))
    .sort((a, b) => b.weight - a.weight)

  // Group anything below 3% into a single "other" bucket so a long
  // tail doesn't crowd the legend.
  const visible = []
  let other = 0
  for (const e of entries) {
    if (e.weight >= 0.03) visible.push(e)
    else other += e.weight
  }
  if (other > 0) visible.push({ label: 'other', weight: other })

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-text-primary">
            Emotion Mix
          </span>
          {emotion.dominant && (
            <span className="text-xs text-text-muted">
              dominant:{' '}
              <span className={`font-semibold ${TEXT_BY_LABEL[emotion.dominant] || ''}`}>
                {emotion.dominant} ({emotion.dominant_pct ?? pctOf(emotion.mix[emotion.dominant])}%)
              </span>
            </span>
          )}
        </div>
      )}

      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden bg-elevated flex">
        {visible.map(({ label, weight }) => (
          <div
            key={label}
            className={`h-full ${COLOR_BY_LABEL[label] || 'bg-slate-400'} transition-all duration-500`}
            style={{ width: `${pctOf(weight)}%` }}
            title={`${label}: ${pctOf(weight)}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {visible.map(({ label, weight }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${COLOR_BY_LABEL[label] || 'bg-slate-400'}`} />
            <span className="text-text-secondary">
              <span className="font-semibold text-text-primary">{pctOf(weight)}%</span>{' '}
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
