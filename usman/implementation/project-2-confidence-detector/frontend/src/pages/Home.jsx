import { Link } from 'react-router-dom'
import ProgressChart from '../components/ProgressChart'
import CalibrationStatusBadge from '../components/CalibrationStatusBadge'

const MODES = [
  {
    path: '/live',
    icon: '🎥',
    title: 'Live Practice',
    description: 'Record yourself on a topic. Scored live on confidence, pace, and eye contact.',
  },
  {
    path: '/upload',
    icon: '📁',
    title: 'Analyze a Video',
    description: 'Upload a video recording and get a full confidence breakdown.',
  },
  {
    path: '/analyzer',
    icon: '🎤',
    title: 'Audio-Only Practice',
    description: 'Practice without a camera. Scored on voice, filler words, and pace.',
  },
  {
    path: '/library',
    icon: '📚',
    title: 'Session Library',
    description: 'Browse past sessions, compare scores, and track your progress.',
  },
]

export default function Home() {
  return (
    <>
      {/* First-timer onboarding banner — only renders for users who
          have not calibrated AND have no sessions yet AND have not
          explicitly skipped. Disappears entirely once any of those
          conditions flips. This is THE place a brand-new user
          discovers the personal-setup flow. */}
      <CalibrationStatusBadge variant="prominent" />

      {/* Hero */}
      <section className="text-center py-20 space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1
          rounded-full bg-accent-soft border border-border-accent
          text-text-accent text-xs font-semibold mb-4">
          ✦ AI-Powered Confidence Coaching
        </div>
        <h1 className="text-5xl font-extrabold font-display
          tracking-tight max-w-2xl mx-auto">
          Speak with{' '}
          <span className="text-transparent bg-clip-text
            bg-gradient-to-r from-accent-bright to-cyan">
            Confidence
          </span>
        </h1>
        <p className="text-text-secondary text-lg max-w-xl mx-auto">
          Real-time AI coaching on your voice, face, and presence.
          Know exactly what to improve.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
          <Link to="/live" className="btn btn-primary btn-lg">
            Start Practicing →
          </Link>
          <Link to="/how-it-works" className="btn btn-secondary btn-lg">
            How it Works
          </Link>
        </div>
      </section>

      {/* Mode cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {MODES.map((mode) => (
          <Link
            to={mode.path}
            key={mode.path}
            className="glass-card p-6 group cursor-pointer
              hover:-translate-y-1 hover:shadow-accent
              transition-all duration-200"
          >
            <div className="text-2xl mb-4">{mode.icon}</div>
            <h3 className="text-text-primary mb-2">{mode.title}</h3>
            <p className="text-text-secondary text-sm leading-relaxed mb-4">
              {mode.description}
            </p>
            <span className="text-accent text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
              Open <span>→</span>
            </span>
          </Link>
        ))}
      </section>

      {/* Quiet calibration nudge for users who already have sessions
          but never finished personal setup. Returns null for
          first-timers (they see the prominent banner above the hero)
          and for users who completed setup. Dismissible. */}
      <section className="mt-8">
        <CalibrationStatusBadge variant="quiet" />
      </section>

      {/* Progress strip */}
      <section className="mt-12">
        <div className="text-xs uppercase tracking-wider text-text-muted mb-3">
          Last 5 sessions
        </div>
        <ProgressChart limit={5} compact />
      </section>
    </>
  )
}
