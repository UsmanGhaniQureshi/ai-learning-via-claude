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
          <li>
            <a href="#emotion-mix" className="text-text-accent hover:underline">
              Emotion mix{' '}
              <span className="text-text-muted">(display only — 10 labels)</span>
            </a>
          </li>
          {signals.map((s) => {
            const tag =
              s.key === 'voice_trembling'
                ? '−10 to −20 penalty'
                : s.weight_pct > 0
                  ? `${s.weight_pct}% of total`
                  : 'display only'
            return (
              <li key={s.key}>
                <a href={`#${s.anchor}`} className="text-text-accent hover:underline">
                  {s.label} <span className="text-text-muted">({tag})</span>
                </a>
              </li>
            )
          })}
          <li><a href="#glossary" className="text-text-accent hover:underline">Glossary</a></li>
          <li><a href="#faq" className="text-text-accent hover:underline">FAQ</a></li>
        </ul>
      </nav>

      <Section id="overall-score" title="Overall score">
        <p>
          The headline 0-100 number on every report is a weighted combination of <strong>five</strong> signals (Voice Steadiness, Eye Contact, Speech Pace, Filler Words, Vocal Variety), then a fixed <strong>Voice Trembling</strong> penalty is subtracted when applicable. Expression and Emotion Mix are shown for awareness but <strong>do NOT</strong> contribute directly to the total.
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
            <tr className="border-b border-border/40">
              <td className="py-2 px-2">
                <a href="#voice-trembling" className="text-text-accent hover:underline">Voice Trembling penalty</a>
              </td>
              <td className="py-2 px-2 text-right">−10 to −20</td>
            </tr>
            <tr>
              <td className="py-2 px-2"><em>Total</em></td>
              <td className="py-2 px-2 text-right">100% − penalty</td>
            </tr>
          </tbody>
        </table>
        <p>
          Each per-chunk score (every 3 seconds of recording) gets one number; the report you see averages those across the session. Silent chunks are excluded from speech-pace specifically so a long pause doesn&apos;t drag your pace down.
        </p>
        <p>
          <strong className="text-text-primary">How the trembling penalty works:</strong> per chunk we measure period-to-period pitch jitter and amplitude shimmer in 200&nbsp;ms windows. When jitter exceeds 1.04% or shimmer exceeds 3.81% (Praat&apos;s outside-normal thresholds) <em>and</em> the combined instability score is above 0.35, the chunk is flagged. The flag costs 10 points at threshold severity, scaling up to 20 at severe shivering. Steady chunks pay nothing.
        </p>
        <div className="bg-[rgba(6,182,212,0.1)] border border-[rgba(6,182,212,0.3)] rounded-md p-3 text-sm">
          <strong className="text-cyan">Honest caveat:</strong> these weights are reasonable defaults pulled from presentation-coaching literature, NOT empirically fit against a labelled dataset of confident vs un-confident speakers. Use the score as a self-comparison tool over your own sessions.
        </div>
      </Section>

      <Section id="emotion-mix" title="Emotion mix">
        <p>
          Alongside the score, the report shows an <strong>emotion mix</strong> — a probability distribution over 10 labels that always sums to 100%. It answers &quot;how did the speaker actually sound?&quot; rather than &quot;how high did they score?&quot;.
        </p>
        <p>
          The detector combines <strong>lexical signals</strong> (filler density, hedge phrases, assertive phrases, declarative structures, generic-filler tokens, repetition rate, excited / angry / sad / engaged token density) with <strong>prosodic signals</strong> (pitch mean and SD, speech rate, RMS, RMS variation, pitch tremor, jitter %, shimmer %). Each of the 10 labels accumulates a raw score, then a softmax (temperature 2.0) converts those into the visible mix. Runner-ups are kept visible — a typical chunk reads as something like &quot;55% nervous, 20% hesitant, 12% confident, …&quot; rather than collapsing to one label.
        </p>
        <p>The 10 labels:</p>
        <table className="w-full text-sm my-3">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-2 px-2 font-semibold">Label</th>
              <th className="py-2 px-2 font-semibold">Strongest evidence</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['confident', 'Assertive phrases, low fillers, WPM near 145, steady pitch, varied delivery.'],
              ['nervous', 'Fillers, hedges, raised pitch, tremor / jitter / shimmer.'],
              ['engaged', 'Audience-direct verbs (imagine / picture / look), good variety, centred WPM, audible energy variation.'],
              ['disconnected', 'BOTH low pitch SD AND low RMS AND slow / zero WPM. Gated — flat pitch with normal energy is "flat", not disconnected.'],
              ['authoritative', 'Declarative structures ("we will", "the answer is"), assertive tokens, audible RMS, pitch SD 15-25 Hz, WPM 120-150, low fillers / jitter / shimmer.'],
              ['hesitant', 'Many fillers + hedges + slow WPM + repetition.'],
              ['excited', 'Excited tokens, fast WPM, high pitch SD, loud variable energy.'],
              ['flat', 'Pitch SD < 10 Hz. Energy and rate can be anywhere — "uninflected" delivery, not necessarily quiet or slow.'],
              ['sad', 'Subdued tokens (unfortunately / sorry / wish), low pitch mean, slow WPM, quiet energy.'],
              ['angry', 'Sharp negatives (wrong / never / ridiculous), loud RMS, raised pitch, fast WPM. Penalised when energy is low.'],
            ].map(([label, evidence]) => (
              <tr key={label} className="border-b border-border/40">
                <td className="py-2 px-2 font-semibold text-text-primary">{label}</td>
                <td className="py-2 px-2">{evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4 className="text-text-primary text-base font-semibold mt-3 mb-1">What good looks like</h4>
        <p>This isn&apos;t a pass/fail signal — it&apos;s diagnostic. A teacher delivering a lesson should land near &quot;engaged&quot; and &quot;authoritative&quot;; a sales pitch might want some &quot;excited&quot; in the mix; an apology should read sad-not-angry. Use it to confirm your delivery matched your intent.</p>
        <h4 className="text-text-primary text-base font-semibold mt-3 mb-1">Known limitations</h4>
        <p className="opacity-85">The token lists are English-only and intentionally small to avoid false positives. The prosodic mappings (pitch arousal, WPM ramp) are coarse and not per-speaker calibrated. Treat percentages as relative weights, not ground-truth probabilities.</p>
      </Section>

      {signals.map((s) => {
        const subtitle =
          s.key === 'voice_trembling'
            ? 'Fixed −10 to −20 penalty applied to the headline'
            : s.weight_pct > 0
              ? `${s.weight_pct}% of total score`
              : 'Display only — not in score'
        return (
          <Section
            key={s.key}
            id={s.anchor}
            title={s.label}
            subtitle={subtitle}
          >
            <h4 className="text-text-primary text-base font-semibold mt-3 mb-1">What it measures</h4>
            <p>{s.detail}</p>
            <h4 className="text-text-primary text-base font-semibold mt-3 mb-1">What good looks like</h4>
            <p>{s.good}</p>
            <h4 className="text-text-primary text-base font-semibold mt-3 mb-1">Known limitations</h4>
            <p className="opacity-85">{s.limits}</p>
          </Section>
        )
      })}

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
