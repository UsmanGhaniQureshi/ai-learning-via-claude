import { Link } from 'react-router-dom'
import { SIGNAL_DEFS } from '../explainer/signals'

export default function ScoreBreakdownPanel({
  avgScore,
  signalAverages,
  signalReasons,
  signalBaselineAdjusted,
  userBaseline,
  baselineNote,
  hiddenSignals = [],
}) {
  if (!signalAverages) return null

  const hidden = new Set(hiddenSignals)
  const scored = Object.values(SIGNAL_DEFS).filter(
    (signal) => signal.weight_pct > 0 && !hidden.has(signal.key)
  )
  const expression = SIGNAL_DEFS.expression
  const showExpression = (
    expression &&
    !hidden.has(expression.key) &&
    signalAverages.expression != null
  )

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
  const rowsWithContribs = rows.map((row) => {
    const renormalizedWeight = row.available
      ? (row.def.weight_pct / 100) * renormScale
      : 0
    return {
      ...row,
      renormalizedPct: Math.round(renormalizedWeight * 1000) / 10,
      contribution: row.available ? row.score * renormalizedWeight : 0,
    }
  })

  const skippedCount = rows.filter((row) => !row.available).length
  const computedTotal = weightTotal > 0
    ? Math.round((weightedSum / weightTotal) * 10) / 10
    : null
  const headline = avgScore == null ? null : Math.round(Number(avgScore))
  const gap = (
    computedTotal != null &&
    headline != null
  ) ? Math.abs(headline - computedTotal) : 0

  return (
    <div className="glass-card p-5">
      <details>
        <summary className="cursor-pointer text-base font-semibold text-text-primary py-1 select-none">
          How was this computed?
        </summary>

        <div className="mt-4 space-y-3 text-sm text-text-secondary">
          <p>
            Your overall score is a weighted blend of the measured signals.
            Expression is shown for awareness but <strong className="text-text-primary">does not count toward the total</strong>.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-2 font-semibold">Signal</th>
                  <th className="px-2 py-2 text-right font-semibold">Score</th>
                  <th className="px-2 py-2 text-right font-semibold">Weight</th>
                  <th className="px-2 py-2 text-right font-semibold">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithContribs.map(({ def, score, available, renormalizedPct, contribution }) => (
                  <tr
                    key={def.key}
                    className={`border-b border-border/40 ${available ? '' : 'opacity-50'}`}
                  >
                    <td className="px-2 py-2">{def.label}</td>
                    <td className="px-2 py-2 text-right">
                      {available ? score : <em>N/A</em>}
                    </td>
                    <td className="px-2 py-2 text-right text-text-muted">
                      {available ? `x ${renormalizedPct}%` : '-'}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {available ? contribution.toFixed(1) : <em>skipped</em>}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="px-2 py-2 font-semibold text-text-primary">
                    Sum (renormalized weighted average)
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-text-primary">
                    {computedTotal != null ? computedTotal.toFixed(1) : 'N/A'}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-2 py-2 font-semibold text-text-primary">
                    Headline score (rounded)
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-text-primary">
                    {headline != null ? headline : 'N/A'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {skippedCount > 0 && (
            <p className="text-xs italic opacity-75">
              {skippedCount === 1 ? '1 signal was' : `${skippedCount} signals were`} skipped because no data was available.
              The remaining weights were renormalized so they still sum to 100%.
            </p>
          )}

          {gap > 1.5 && (
            <p className="text-xs italic opacity-75">
              The {gap.toFixed(1)} point gap between the row sum and the headline comes from per-chunk averaging.
            </p>
          )}

          {signalReasons && (
            <>
              <h4 className="mt-4 mb-2 text-base font-semibold text-text-primary">What fed each signal</h4>
              <ul className="list-disc space-y-1.5 pl-4">
                {scored.map((def) => (
                  <li key={def.key}>
                    <strong className="text-text-primary">
                      {def.label} {Math.round(signalAverages[def.key] ?? 0)}
                    </strong>
                    {signalReasons[def.key] ? ` - ${signalReasons[def.key]}` : null}
                  </li>
                ))}
                {showExpression && (
                  <li>
                    <strong className="text-text-primary">
                      {expression.label} {Math.round(signalAverages.expression)}
                    </strong>
                    {' '}display only, not in the total
                    {signalReasons?.expression ? ` (${signalReasons.expression})` : null}
                  </li>
                )}
              </ul>
            </>
          )}

          {signalBaselineAdjusted && userBaseline?.ready && (
            <>
              <h4 className="mt-4 mb-2 text-base font-semibold text-text-primary">How you compared to your last sessions</h4>
              <p className="text-text-secondary">
                Your previous sessions establish a personal baseline. Each adjusted score is a z-score anchored at 50, so 50 is your average, 65 is one standard deviation better, and 35 is one worse.
                Needs at least 3 prior sessions; the current count is{' '}
                <strong className="text-text-primary">{userBaseline.n_sessions}</strong>.
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-muted">
                      <th className="px-2 py-2 font-semibold">Signal</th>
                      <th className="px-2 py-2 text-right font-semibold">This session</th>
                      <th className="px-2 py-2 text-right font-semibold">Your mean +/- std</th>
                      <th className="px-2 py-2 text-right font-semibold">Adjusted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(signalBaselineAdjusted).map(([key, adjusted]) => {
                      const def = SIGNAL_DEFS[key]
                      const stats = userBaseline[key]
                      if (!def || !stats || hidden.has(key)) return null
                      return (
                        <tr key={key} className="border-b border-border/40">
                          <td className="px-2 py-2">{def.label}</td>
                          <td className="px-2 py-2 text-right">
                            {Math.round(signalAverages[key] ?? 0)}
                          </td>
                          <td className="px-2 py-2 text-right text-text-muted">
                            {Math.round(stats.mean)} +/- {Math.round(stats.std)}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-text-primary">
                            {Math.round(adjusted)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!signalBaselineAdjusted && (
            <p className="text-xs italic opacity-75 border border-border rounded-md px-3 py-2 bg-elevated/50">
              {baselineNote
                || `Baseline comparison unlocks after 3 sessions (you have ${userBaseline?.n_sessions ?? 0}).`}
            </p>
          )}

          <p className="mt-4">
            For the full per-signal thresholds, the math behind each curve, and known limitations:{' '}
            <Link to="/how-it-works" className="text-text-accent hover:underline">Read the explainer</Link>
          </p>
        </div>
      </details>
    </div>
  )
}
