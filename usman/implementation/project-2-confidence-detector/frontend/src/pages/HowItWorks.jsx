import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SIGNAL_DEFS, GLOSSARY, FAQ } from '../explainer/signals'

/**
 * HowItWorks — the dedicated explainer page.
 *
 * Long-form, scannable. Sections:
 *   - Overall score: weighting, why expression is excluded
 *   - One section per signal (definition / how / good / limits)
 *   - Glossary
 *   - FAQ
 *
 * Each signal section has an id matching SIGNAL_DEFS[k].anchor so the
 * tooltips' "Read more →" link can deep-link to it. We honour the
 * URL hash on mount + when it changes by scrolling the corresponding
 * element into view — React Router doesn't do this by default.
 */
export default function HowItWorks() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0 })
      return
    }
    const id = location.hash.slice(1)
    // Defer one tick so the DOM has the section mounted by the time
    // we try to scroll to it (especially on first load).
    requestAnimationFrame(() => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash])

  const signals = Object.values(SIGNAL_DEFS)

  return (
    <div className="section" style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2>How is this calculated?</h2>
      <p className="subtitle">
        Plain-English breakdown of every signal the app shows you.
        Look here whenever you wonder "why did I score X?".
      </p>

      {/* ── Table of contents ────────────────────────────────────── */}
      <nav
        style={{
          background: '#161620',
          border: '1px solid #2a2a35',
          borderRadius: 8,
          padding: 14,
          marginTop: 16,
          marginBottom: 24,
        }}
      >
        <strong style={{ display: 'block', marginBottom: 6 }}>On this page</strong>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li><a href="#overall-score" style={anchorLinkStyle}>Overall score</a></li>
          {signals.map((s) => (
            <li key={s.key}>
              <a href={`#${s.anchor}`} style={anchorLinkStyle}>
                {s.label}{' '}
                <span style={{ opacity: 0.55, fontSize: '0.82em' }}>
                  ({s.weight_pct > 0 ? `${s.weight_pct}% of total` : 'display only'})
                </span>
              </a>
            </li>
          ))}
          <li><a href="#glossary" style={anchorLinkStyle}>Glossary</a></li>
          <li><a href="#faq" style={anchorLinkStyle}>FAQ</a></li>
        </ul>
      </nav>

      {/* ── Overall ──────────────────────────────────────────────── */}
      <Section id="overall-score" title="Overall score">
        <p>
          The headline 0-100 number on every report is a weighted
          combination of <strong>five</strong> signals (Voice
          Steadiness, Eye Contact, Speech Pace, Filler Words, Vocal
          Variety). Expression is computed and shown but{' '}
          <strong>does NOT</strong> contribute to the total — its
          underlying mapping is arbitrary and culturally biased, so
          including it would penalise people for keeping a neutral
          face.
        </p>
        <p>The current weights are:</p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Signal</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {signals.filter((s) => s.weight_pct > 0).map((s) => (
              <tr key={s.key}>
                <td style={tdStyle}>
                  <a href={`#${s.anchor}`} style={anchorLinkStyle}>{s.label}</a>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{s.weight_pct}%</td>
              </tr>
            ))}
            <tr>
              <td style={tdStyle}><em>Total</em></td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>100%</td>
            </tr>
          </tbody>
        </table>
        <p>
          Each per-chunk score (every 3 seconds of recording) gets one
          number; the report you see averages those across the session.
          Silent chunks are excluded from speech-pace specifically so
          a long pause doesn't drag your pace down.
        </p>
        <p style={{ background: '#1a2438', padding: 10, borderRadius: 6, fontSize: '0.9em' }}>
          <strong>Honest caveat:</strong> these weights are reasonable
          defaults pulled from presentation-coaching literature, NOT
          empirically fit against a labelled dataset of confident vs
          un-confident speakers. Use the score as a self-comparison
          tool over your own sessions, not as an absolute number to
          rank yourself against other people.
        </p>
      </Section>

      {/* ── Per-signal sections ──────────────────────────────────── */}
      {signals.map((s) => (
        <Section
          key={s.key}
          id={s.anchor}
          title={s.label}
          subtitle={s.weight_pct > 0 ? `${s.weight_pct}% of total score` : 'Display only — not in score'}
        >
          <h4 style={subHeading}>What it measures</h4>
          <p>{s.detail}</p>
          <h4 style={subHeading}>What good looks like</h4>
          <p>{s.good}</p>
          <h4 style={subHeading}>Known limitations</h4>
          <p style={{ opacity: 0.85 }}>{s.limits}</p>
        </Section>
      ))}

      {/* ── Glossary ─────────────────────────────────────────────── */}
      <Section id="glossary" title="Glossary">
        <dl style={{ margin: 0 }}>
          {GLOSSARY.map(({ term, body }) => (
            <div key={term} style={{ marginBottom: 14 }}>
              <dt style={{ fontWeight: 600, color: '#fff' }}>{term}</dt>
              <dd style={{ margin: '2px 0 0 0', opacity: 0.88 }}>{body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <Section id="faq" title="FAQ">
        {FAQ.map(({ q, a }) => (
          <div key={q} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>
              {q}
            </div>
            <div style={{ opacity: 0.88 }}>{a}</div>
          </div>
        ))}
      </Section>

      <div style={{ marginTop: 32, textAlign: 'center' }}>
        <Link to="/" className="report-btn">← Back to the app</Link>
      </div>
    </div>
  )
}

function Section({ id, title, subtitle, children }) {
  return (
    <section
      id={id}
      style={{
        scrollMarginTop: 80,
        marginTop: 32,
        paddingBottom: 16,
        borderBottom: '1px solid #2a2a35',
      }}
    >
      <h3 style={{ margin: '0 0 4px 0' }}>{title}</h3>
      {subtitle && (
        <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 12 }}>{subtitle}</div>
      )}
      {children}
    </section>
  )
}

const anchorLinkStyle = {
  color: '#8ab4f8',
  textDecoration: 'none',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 8,
  marginBottom: 12,
  fontSize: '0.95em',
}
const thStyle = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid #2a2a35',
  opacity: 0.8,
  fontWeight: 600,
}
const tdStyle = {
  padding: '6px 8px',
  borderBottom: '1px solid #1a1a22',
}
const subHeading = {
  fontSize: '0.95em',
  margin: '14px 0 4px 0',
  color: '#fff',
}
