import { Link } from 'react-router-dom'
import { SIGNAL_DEFS } from '../explainer/signals'

/**
 * ScoreBreakdownPanel — collapsible "How was this computed?" section
 * on the Result page.
 *
 * Plugs the user's actual numbers into the actual formulas so they can
 * verify the score without leaving the page. Key bits:
 *   1. Weighted-sum table: signal × weight = contribution → total.
 *      Explicitly notes that the headline is averaged at chunk level
 *      so a small gap (~1-3 points) between the table sum and the
 *      headline is normal — silent chunks treat speech_pace as
 *      neutral 50 in the per-chunk aggregate but are excluded from
 *      the per-signal session average.
 *   2. Per-signal one-liners pulled from `signal_reasons` (computed
 *      server-side in report_generator.py — has the raw numbers like
 *      "pitch SD 12.3 Hz" or "avg 145 WPM").
 *   3. Baseline-adjusted scores (when present): shows the z-score
 *      formula with the user's actual mean/std.
 *   4. A "full explainer" link to /how-it-works for thresholds and
 *      methodology.
 *
 * Default-collapsed via <details>: most users don't want the math but
 * the few who DO can self-serve without an extra page-load.
 */
export default function ScoreBreakdownPanel({
  avgScore,
  signalAverages,
  signalReasons,
  signalBaselineAdjusted,
  userBaseline,
  baselineNote,
}) {
  if (!signalAverages) return null

  // SIGNAL_DEFS already has weight_pct as the source of truth.
  // Filter scored signals (weight_pct > 0) for the contribution table.
  const scored = Object.values(SIGNAL_DEFS).filter((s) => s.weight_pct > 0)
  const expression = SIGNAL_DEFS.expression

  let sumContribs = 0
  const rows = scored.map((def) => {
    const score = Number(signalAverages[def.key] ?? 0)
    const weight = def.weight_pct / 100
    const contribution = score * weight
    sumContribs += contribution
    return { def, score: Math.round(score), weight, contribution }
  })

  const computedTotal = Math.round(sumContribs * 10) / 10  // one decimal
  const headline = Math.round(Number(avgScore ?? 0))
  const gap = Math.abs(headline - sumContribs)

  return (
    <div className="report-section">
      <details>
        <summary
          style={{
            cursor: 'pointer',
            fontSize: '1.05em',
            fontWeight: 600,
            padding: '4px 0',
          }}
        >
          How was this computed?
        </summary>

        <div style={{ marginTop: 12 }}>
          <p style={{ marginTop: 0, opacity: 0.85, fontSize: '0.92em' }}>
            Your overall score is a weighted blend of five signals.
            Expression is shown but{' '}
            <strong>does not count toward the total</strong> — its
            mapping (happy → 90, neutral → 60, sad → 30) is arbitrary
            and culturally biased, so including it would penalise
            people for not smiling.
          </p>

          {/* ── Weighted contribution table ── */}
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Signal</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Score</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Weight</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Contribution</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ def, score, weight, contribution }) => (
                <tr key={def.key}>
                  <td style={tdStyle}>{def.label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{score}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', opacity: 0.7 }}>
                    × {def.weight_pct}%
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {contribution.toFixed(1)}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdStyle, fontWeight: 600 }} colSpan={3}>
                  Sum (weighted average of your signals)
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'right' }}>
                  {computedTotal.toFixed(1)}
                </td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontWeight: 600 }} colSpan={3}>
                  Headline score (rounded, computed per chunk)
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'right' }}>
                  {headline}
                </td>
              </tr>
            </tbody>
          </table>

          {gap > 0.5 && (
            <p style={footnoteStyle}>
              The headline is averaged at the chunk level (every 3 s of
              recording), where silent moments treat Speech Pace as
              neutral 50 instead of being excluded. That handling is
              the source of the {gap.toFixed(1)}-point gap with the
              row sum above.
            </p>
          )}

          {/* ── Per-signal explanations from signal_reasons ── */}
          {signalReasons && (
            <>
              <h4 style={subHeading}>What fed each signal</h4>
              <ul style={{ margin: '4px 0 12px 0', paddingLeft: 18, lineHeight: 1.6 }}>
                {scored.map((def) => (
                  <li key={def.key}>
                    <strong>{def.label} {Math.round(signalAverages[def.key] ?? 0)}</strong>
                    {signalReasons[def.key] ? ` — ${signalReasons[def.key]}` : null}
                  </li>
                ))}
                {expression && signalAverages.expression != null && (
                  <li>
                    <strong>{expression.label} {Math.round(signalAverages.expression)}</strong>
                    {' '}— display only, not in the total
                    {signalReasons?.expression ? ` (${signalReasons.expression})` : null}
                  </li>
                )}
              </ul>
            </>
          )}

          {/* ── Baseline-adjusted scores (Task 3) ── */}
          {signalBaselineAdjusted && userBaseline?.ready && (
            <>
              <h4 style={subHeading}>How you compared to your last sessions</h4>
              <p style={{ margin: '0 0 8px 0', opacity: 0.85, fontSize: '0.92em' }}>
                Your previous sessions establish a personal baseline.
                Each adjusted score is a z-score anchored at 50, so 50
                is "your average", 65 is "one standard deviation
                better", 35 is "one worse", and so on. Needs at least 3
                prior sessions; the current count is{' '}
                <strong>{userBaseline.n_sessions}</strong>.
              </p>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Signal</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>This session</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Your mean ± std</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Adjusted</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(signalBaselineAdjusted).map(([key, adj]) => {
                    const def = SIGNAL_DEFS[key]
                    const stats = userBaseline[key]
                    if (!def || !stats) return null
                    return (
                      <tr key={key}>
                        <td style={tdStyle}>{def.label}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {Math.round(signalAverages[key] ?? 0)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', opacity: 0.8 }}>
                          {Math.round(stats.mean)} ± {Math.round(stats.std)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                          {Math.round(adj)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}

          {baselineNote && !signalBaselineAdjusted && (
            <p style={footnoteStyle}>{baselineNote}</p>
          )}

          <p style={{ marginTop: 12, fontSize: '0.92em' }}>
            For the full per-signal thresholds, the math behind each
            curve, and known limitations:{' '}
            <Link to="/how-it-works" style={{ color: '#8ab4f8' }}>
              Read the explainer →
            </Link>
          </p>
        </div>
      </details>
    </div>
  )
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 6,
  marginBottom: 8,
  fontSize: '0.92em',
}
const thStyle = {
  textAlign: 'left',
  padding: '5px 8px',
  borderBottom: '1px solid #2a2a35',
  opacity: 0.75,
  fontWeight: 600,
}
const tdStyle = {
  padding: '5px 8px',
  borderBottom: '1px solid #1a1a22',
}
const subHeading = {
  fontSize: '0.95em',
  margin: '14px 0 6px 0',
  color: '#fff',
}
const footnoteStyle = {
  fontSize: '0.85em',
  opacity: 0.75,
  margin: '6px 0 4px 0',
  fontStyle: 'italic',
}
