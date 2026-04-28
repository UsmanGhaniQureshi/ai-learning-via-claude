import { Link } from 'react-router-dom'
import { SIGNAL_DEFS } from '../explainer/signals'

export default function ScoreBreakdownPanel({
  avgScore,
  signalAverages,
  signalReasons,
  signalBaselineAdjusted,
  userBaseline,
  baselineNote,
}) {
  if (!signalAverages) return null

  const scored = Object.values(SIGNAL_DEFS).filter((s) => s.weight_pct > 0)
  const expression = SIGNAL_DEFS.expression

  let weightedSum = 0
  let weightTotal = 0
  const rows = scored.map((def) => {
    const raw = signalAverages[def.key]
    const available = raw !== null && raw !== undefined
    const score = available ? Math.round(Number(raw)) : null
    if (available) {
      weightedSum += score * (def.weight_pct / 100)
      weightTotal += def.weight_pct / 100
    }
    return { def, score, available }
  })
  const renormScale = weightTotal > 0 ? 1 / weightTotal : 1
  const rowsWithContribs = rows.map((r) => {
    const renormalizedWeight = r.available
      ? (r.def.weight_pct / 100) * renormScale
      : 0
    return {
      ...r,
      renormalizedPct: Math.round(renormalizedWeight * 1000) / 10,
      contribution: r.available ? r.score * renormalizedWeight : 0,
    }
  })
  const skippedCount = rows.filter((r) => !r.available).length
  const computedTotal = weightTotal > 0
    ? Math.round((weightedSum / weightTotal) * 10) / 10
    : null
  const headline = avgScore == null ? null : Math.round(Number(avgScore))
  const gap = (computedTotal != null && headline != null)
    ? Math.abs(headline - computedTotal)
    : 0

  return (
    <div className="glass-card p-5">
      <details>
        <summary className="cursor-pointer text-base font-semibold text-text-primary py-1 select-none">
          How was this computed?
        </summary>

        <div className="mt-4 space-y-3 text-sm text-text-secondary">
          <p>
            Your overall score is a weighted blend of five signals.
            Expression is shown but <strong className="text-text-primary">does not count toward the total</strong> — its mapping (happy → 90, neutral → 60, sad → 30) is arbitrary and culturally biased.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="py-2 px-2 font-semibold">Signal</th>
                  <th className="py-2 px-2 font-semibold text-right">Score</th>
                  <th className="py-2 px-2 font-semibold text-right">Weight</th>
                  <th className="py-2 px-2 font-semibold text-right">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithContribs.map(({ def, score, available, renormalizedPct, contribution }) => (
                  <tr key={def.key} className={`border-b border-border/40 ${available ? '' : 'opacity-50'}`}>
                    <td className="py-2 px-2">{def.label}</td>
                    <td className="py-2 px-2 text-right">
                      {available ? score : <em>N/A</em>}
                    </td>
                    <td className="py-2 px-2 text-right text-text-muted">
                      {available ? `× ${renormalizedPct}%` : '—'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {available ? contribution.toFixed(1) : <em>skipped</em>}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="py-2 px-2 font-semibold text-text-primary">
                    Sum (renormalized weighted average)
                  </td>
                  <td className="py-2 px-2 text-right font-semibold text-text-primary">
                    {computedTotal != null ? computedTotal.toFixed(1) : 'N/A'}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-2 px-2 font-semibold text-text-primary">
                    Headline score (rounded)
                  </td>
                  <td className="py-2 px-2 text-right font-semibold text-text-primary">
                    {headline != null ? headline : 'N/A'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {skippedCount > 0 && (
            <p className="text-xs italic opacity-75">
              {skippedCount === 1 ? '1 signal was' : `${skippedCount} signals were`} skipped because no data was available (audio-only clip, no face detected, or non-English speech). The remaining weights were renormalized so they still sum to 100%.
            </p>
          )}

          {gap > 1.5 && (
            <p className="text-xs italic opacity-75">
              The {gap.toFixed(1)}-point gap between the row sum and the headline comes from per-chunk averaging — each 3-s chunk gets its own weighted score, then those are averaged across the session.
            </p>
          )}

          {signalReasons && (
            <>
              <h4 className="text-text-primary text-base font-semibold mt-4 mb-2">What fed each signal</h4>
              <ul className="space-y-1.5 pl-4 list-disc">
                {scored.map((def) => (
                  <li key={def.key}>
                    <strong className="text-text-primary">{def.label} {Math.round(signalAverages[def.key] ?? 0)}</strong>
                    {signalReasons[def.key] ? ` — ${signalReasons[def.key]}` : null}
                  </li>
                ))}
                {expression && signalAverages.expression != null && (
                  <li>
                    <strong className="text-text-primary">{expression.label} {Math.round(signalAverages.expression)}</strong>
                    {' '}— display only, not in the total
                    {signalReasons?.expression ? ` (${signalReasons.expression})` : null}
                  </li>
                )}
              </ul>
            </>
          )}

          {signalBaselineAdjusted && userBaseline?.ready && (
            <>
              <h4 className="text-text-primary text-base font-semibold mt-4 mb-2">How you compared to your last sessions</h4>
              <p className="text-text-secondary">
                Your previous sessions establish a personal baseline. Each adjusted score is a z-score anchored at 50, so 50 is &quot;your average&quot;, 65 is &quot;one standard deviation better&quot;, 35 is &quot;one worse&quot;. Needs at least 3 prior sessions; the current count is{' '}
                <strong className="text-text-primary">{userBaseline.n_sessions}</strong>.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px] mt-2">
                  <thead>
                    <tr className="text-left text-text-muted border-b border-border">
                      <th className="py-2 px-2 font-semibold">Signal</th>
                      <th className="py-2 px-2 font-semibold text-right">This session</th>
                      <th className="py-2 px-2 font-semibold text-right">Your mean ± std</th>
                      <th className="py-2 px-2 font-semibold text-right">Adjusted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(signalBaselineAdjusted).map(([key, adj]) => {
                      const def = SIGNAL_DEFS[key]
                      const stats = userBaseline[key]
                      if (!def || !stats) return null
                      return (
                        <tr key={key} className="border-b border-border/40">
                          <td className="py-2 px-2">{def.label}</td>
                          <td className="py-2 px-2 text-right">
                            {Math.round(signalAverages[key] ?? 0)}
                          </td>
                          <td className="py-2 px-2 text-right text-text-muted">
                            {Math.round(stats.mean)} ± {Math.round(stats.std)}
                          </td>
                          <td className="py-2 px-2 text-right font-semibold text-text-primary">
                            {Math.round(adj)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {baselineNote && !signalBaselineAdjusted && (
            <p className="text-xs italic opacity-75">{baselineNote}</p>
          )}

          <p className="mt-4">
            For the full per-signal thresholds, the math behind each curve, and known limitations:{' '}
            <Link to="/how-it-works" className="text-text-accent hover:underline">Read the explainer →</Link>
          </p>
        </div>
      </details>
    </div>
  )
}
