/**
 * CalibrationWelcome — first screen of the Personal Setup flow.
 *
 * Sets the tone: warm, non-clinical, "teach the app about you".
 * Tells the user what to expect (3 short parts, ~4 mins) and that
 * it happens once. Two CTAs:
 *   - Begin → starts Part 1
 *   - Skip for now → bookmarks intent and bounces home; the user can
 *                    return any time via the Profile page in the
 *                    header.
 *
 * Renders inside the /calibration page; receives `onStart` and
 * `onSkip` to advance / exit. Resume-from-abandoned state lives in
 * the parent (CalibrationPage) — this welcome is shown only on
 * fresh starts.
 */
export default function CalibrationWelcome({ onStart, onSkip }) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-display font-extrabold leading-tight">
          Let&apos;s learn how you naturally speak and look.
        </h1>
        <p className="text-text-secondary text-lg">
          A quick <strong className="text-text-primary">~4-minute</strong>{' '}
          setup means every score you get will be based on{' '}
          <strong className="text-text-primary">you</strong> — not a
          generic standard. It only happens once.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <PartCard
          number="1"
          title="Expressions"
          duration="~1 min"
          description="5 emotional moments, 10 seconds each. We watch your face."
        />
        <PartCard
          number="2"
          title="Speaking with camera"
          duration="~1 min"
          description="One short prompt, 60 seconds. Camera on."
        />
        <PartCard
          number="3"
          title="Speaking without camera"
          duration="~1 min"
          description="Same prompt, camera off. Helps us spot camera anxiety."
        />
      </div>

      <div className="bg-elevated/50 border border-border rounded-md p-4 text-sm text-text-secondary space-y-2">
        <p>
          <strong className="text-text-primary">A few things to know:</strong>
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>This is not a test — we are learning your style, not scoring it.</li>
          <li>You can redo any part if a recording does not come out right.</li>
          <li>Find a quiet, well-lit spot before you start.</li>
          <li>Speak naturally. Imagine you are talking to a friend.</li>
        </ul>
      </div>

      <div className="bg-accent-soft/40 border border-border-accent rounded-md p-4 text-sm text-text-secondary space-y-1">
        <p>
          <strong className="text-text-primary">Not in the mood right now?</strong>
        </p>
        <p>
          You can skip and use general scoring instead. Reports will show{' '}
          <em>&ldquo;general baseline&rdquo;</em> until you complete setup.
          You can return any time from the <strong className="text-text-primary">Profile</strong>{' '}
          link in the top-right.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="btn btn-secondary"
          >
            Skip for now
          </button>
        )}
        <button
          type="button"
          onClick={onStart}
          className="btn btn-primary btn-lg"
        >
          Let&apos;s Begin →
        </button>
      </div>
    </div>
  )
}

function PartCard({ number, title, duration, description }) {
  return (
    <div className="glass-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-display font-extrabold text-accent">
          {number}
        </span>
        <span className="text-xs text-text-muted">{duration}</span>
      </div>
      <h3 className="text-base font-semibold text-text-primary m-0">
        {title}
      </h3>
      <p className="text-xs text-text-secondary leading-relaxed">
        {description}
      </p>
    </div>
  )
}
