/**
 * CoachingPanel — Gemini-generated coaching for a finished practice
 * session. Mounts ONLY when `coaching_status === "ready"` (the panel
 * itself short-circuits otherwise so callers don't need to gate).
 *
 * Three always-visible blocks per spec:
 *   1. Acknowledgement (topic_ack)        — top, accent-left-border
 *   2. Result (english.grade + confidence.grade side-by-side)
 *   3. Improvements (english + confidence improvements, warning color,
 *      never hidden / never collapsed)
 *
 * Plus wins (success), filler note, weakest signal, and the
 * next-session action item.
 *
 * Status semantics:
 *   "ready"   — render the panel
 *   "skipped" — practice without a topic, off-topic transcript, or no
 *               GEMINI_API_KEY → render nothing (rule-based
 *               insights/action_items in SessionReport take over)
 *   "failed"  — LLM call errored → render nothing
 *   undefined — old report → render nothing (graceful)
 */

const GRADE_BADGE = {
  A: 'bg-[rgba(16,185,129,0.15)] text-success border-[rgba(16,185,129,0.4)]',
  B: 'bg-[rgba(6,182,212,0.15)] text-cyan border-[rgba(6,182,212,0.4)]',
  C: 'bg-[rgba(245,158,11,0.15)] text-warning border-[rgba(245,158,11,0.4)]',
  D: 'bg-[rgba(239,68,68,0.15)] text-danger border-[rgba(239,68,68,0.4)]',
}

function gradeClass(grade) {
  const g = (grade || '').toString().trim().toUpperCase().slice(0, 1)
  return GRADE_BADGE[g] || 'bg-elevated text-text-muted border-border'
}

export default function CoachingPanel({ coaching, status }) {
  if (status !== 'ready' || !coaching) return null

  const ack = coaching.topic_ack
  const en = coaching.english || {}
  const cf = coaching.confidence || {}
  const next = coaching.next_session

  const enImprovements = Array.isArray(en.improvements) ? en.improvements : []
  const cfImprovements = Array.isArray(cf.improvements) ? cf.improvements : []
  const enWins = Array.isArray(en.wins) ? en.wins : []
  const cfWins = Array.isArray(cf.wins) ? cf.wins : []

  return (
    <div className="space-y-4">
      {/* 1. ACKNOWLEDGEMENT — distinct accent-left-border block */}
      {ack && (
        <div className="glass-card p-5 border-l-4 border-l-accent">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
            ✦ Coach Note
          </p>
          <p className="text-base text-text-primary leading-relaxed">{ack}</p>
        </div>
      )}

      {/* 2. RESULT — English grade + Confidence grade side-by-side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              English
            </p>
            {en.grade && (
              <span className={`badge border ${gradeClass(en.grade)}`}>
                {String(en.grade).toUpperCase()}
              </span>
            )}
          </div>
          {en.summary && (
            <p className="text-sm text-text-secondary leading-relaxed">{en.summary}</p>
          )}
          {en.filler_note && (
            <p className="text-xs text-text-muted mt-3 pt-3 border-t border-border italic">
              {en.filler_note}
            </p>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Confidence
            </p>
            {cf.grade && (
              <span className={`badge border ${gradeClass(cf.grade)}`}>
                {String(cf.grade).toUpperCase()}
              </span>
            )}
          </div>
          {cf.summary && (
            <p className="text-sm text-text-secondary leading-relaxed">{cf.summary}</p>
          )}
          {cf.weakest_signal && (
            <p className="text-xs text-text-muted mt-3 pt-3 border-t border-border italic">
              Weakest signal: <strong className="text-text-secondary">{cf.weakest_signal}</strong>
            </p>
          )}
        </div>
      </div>

      {/* 3. IMPROVEMENTS — warning color, ALWAYS rendered (never hidden).
          Even when the LLM returned empty arrays we keep the section so
          the user knows the model considered it. Empty side renders a
          quiet placeholder instead of being silently dropped. */}
      <div className="glass-card p-5 border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)]">
        <p className="text-xs font-semibold text-warning uppercase tracking-wider mb-3">
          ↗ What to Improve
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">English</p>
            {enImprovements.length > 0 ? (
              <ul className="space-y-1.5">
                {enImprovements.map((imp, i) => (
                  <li key={i} className="text-sm text-text-secondary flex gap-2 leading-relaxed">
                    <span className="text-warning mt-0.5">·</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted italic">
                No specific English improvements flagged for this session.
              </p>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">Confidence</p>
            {cfImprovements.length > 0 ? (
              <ul className="space-y-1.5">
                {cfImprovements.map((imp, i) => (
                  <li key={i} className="text-sm text-text-secondary flex gap-2 leading-relaxed">
                    <span className="text-warning mt-0.5">·</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted italic">
                No specific confidence improvements flagged for this session.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* WINS — also always-rendered for symmetry with Improvements. */}
      <div className="glass-card p-5 border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.04)]">
        <p className="text-xs font-semibold text-success uppercase tracking-wider mb-3">
          ✅ What Went Well
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">English</p>
            {enWins.length > 0 ? (
              <ul className="space-y-1.5">
                {enWins.map((w, i) => (
                  <li key={i} className="text-sm text-text-secondary flex gap-2 leading-relaxed">
                    <span className="text-success mt-0.5">·</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted italic">
                No specific English strengths flagged.
              </p>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">Confidence</p>
            {cfWins.length > 0 ? (
              <ul className="space-y-1.5">
                {cfWins.map((w, i) => (
                  <li key={i} className="text-sm text-text-secondary flex gap-2 leading-relaxed">
                    <span className="text-success mt-0.5">·</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted italic">
                No specific confidence strengths flagged.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* NEXT SESSION — cyan callout */}
      {next && (
        <div className="glass-card p-5 border border-[rgba(6,182,212,0.3)] bg-[rgba(6,182,212,0.05)]">
          <p className="text-xs font-semibold text-cyan uppercase tracking-wider mb-2">
            🎯 Focus for Next Practice
          </p>
          <p className="text-sm text-text-primary leading-relaxed">{next}</p>
        </div>
      )}
    </div>
  )
}
