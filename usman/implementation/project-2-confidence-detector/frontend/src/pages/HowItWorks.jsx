import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SIGNAL_DEFS, GLOSSARY, FAQ } from '../explainer/signals'

export default function HowItWorks() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0 })
      return
    }
    const id = location.hash.slice(1)
    requestAnimationFrame(() => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash])

  const signals = Object.values(SIGNAL_DEFS)

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-sm text-text-muted mb-6">
        <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
        {' / '}
        <span className="text-text-secondary">How it Works</span>
      </p>

      <h2 className="mb-1">How is this calculated?</h2>
      <p className="text-text-secondary text-sm mb-6">
        Plain-English breakdown of every signal the app shows you.
        Look here whenever you wonder &quot;why did I score X?&quot;.
      </p>

      {/* TOC */}
      <nav className="glass-card p-4 mb-6">
        <strong className="block mb-2 text-text-primary">On this page</strong>
        <ul className="space-y-1 pl-4 list-disc text-sm">
          <li><a href="#overall-score" className="text-text-accent hover:underline">Overall score</a></li>
          {signals.map((s) => (
            <li key={s.key}>
              <a href={`#${s.anchor}`} className="text-text-accent hover:underline">
                {s.label}{' '}
                <span className="text-text-muted">
                  ({s.weight_pct > 0 ? `${s.weight_pct}% of total` : 'display only'})
                </span>
              </a>
            </li>
          ))}
          <li><a href="#glossary" className="text-text-accent hover:underline">Glossary</a></li>
          <li><a href="#faq" className="text-text-accent hover:underline">FAQ</a></li>
        </ul>
      </nav>

      <Section id="overall-score" title="Overall score">
        <p>
          The headline 0-100 number on every report is a weighted combination of <strong>five</strong> signals (Voice Steadiness, Eye Contact, Speech Pace, Filler Words, Vocal Variety). Expression is computed and shown but <strong>does NOT</strong> contribute to the total — its underlying mapping is arbitrary and culturally biased.
        </p>
        <p>The current weights are:</p>
        <table className="w-full text-sm my-3">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-2 px-2 font-semibold">Signal</th>
              <th className="py-2 px-2 font-semibold text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {signals.filter((s) => s.weight_pct > 0).map((s) => (
              <tr key={s.key} className="border-b border-border/40">
                <td className="py-2 px-2">
                  <a href={`#${s.anchor}`} className="text-text-accent hover:underline">{s.label}</a>
                </td>
                <td className="py-2 px-2 text-right">{s.weight_pct}%</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 px-2"><em>Total</em></td>
              <td className="py-2 px-2 text-right">100%</td>
            </tr>
          </tbody>
        </table>
        <p>
          Each per-chunk score (every 3 seconds of recording) gets one number; the report you see averages those across the session. Silent chunks are excluded from speech-pace specifically so a long pause doesn&apos;t drag your pace down.
        </p>
        <div className="bg-[rgba(6,182,212,0.1)] border border-[rgba(6,182,212,0.3)] rounded-md p-3 text-sm">
          <strong className="text-cyan">Honest caveat:</strong> these weights are reasonable defaults pulled from presentation-coaching literature, NOT empirically fit against a labelled dataset of confident vs un-confident speakers. Use the score as a self-comparison tool over your own sessions.
        </div>
      </Section>

      {signals.map((s) => (
        <Section
          key={s.key}
          id={s.anchor}
          title={s.label}
          subtitle={s.weight_pct > 0 ? `${s.weight_pct}% of total score` : 'Display only — not in score'}
        >
          <h4 className="text-text-primary text-base font-semibold mt-3 mb-1">What it measures</h4>
          <p>{s.detail}</p>
          <h4 className="text-text-primary text-base font-semibold mt-3 mb-1">What good looks like</h4>
          <p>{s.good}</p>
          <h4 className="text-text-primary text-base font-semibold mt-3 mb-1">Known limitations</h4>
          <p className="opacity-85">{s.limits}</p>
        </Section>
      ))}

      <Section id="glossary" title="Glossary">
        <dl className="space-y-3">
          {GLOSSARY.map(({ term, body }) => (
            <div key={term}>
              <dt className="font-semibold text-text-primary">{term}</dt>
              <dd className="text-text-secondary">{body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="faq" title="FAQ">
        {FAQ.map(({ q, a }) => (
          <div key={q} className="mb-4">
            <div className="font-semibold text-text-primary mb-1">{q}</div>
            <div className="text-text-secondary">{a}</div>
          </div>
        ))}
      </Section>

      <div className="mt-8 text-center">
        <Link to="/" className="btn btn-primary">← Back to the app</Link>
      </div>
    </div>
  )
}

function Section({ id, title, subtitle, children }) {
  return (
    <section
      id={id}
      className="mt-8 pb-6 border-b border-border space-y-2 text-text-secondary scroll-mt-20"
    >
      <h3 className="text-text-primary">{title}</h3>
      {subtitle && (
        <div className="text-sm text-text-muted">{subtitle}</div>
      )}
      {children}
    </section>
  )
}
