/**
 * Displays 1-3 contextual feedback tips.
 */
export default function FeedbackTips({ tips = [] }) {
  if (!tips || tips.length === 0) return null

  return (
    <div className="glass-card p-4 border-l-2 border-accent">
      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Live Feedback
      </h4>
      <ul className="space-y-2">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-base">{getTipIcon(tip)}</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function getTipIcon(tip) {
  const t = tip.toLowerCase()
  if (t.includes('eye') || t.includes('camera')) return '\u{1F441}'
  if (t.includes('voice') || t.includes('volume') || t.includes('pitch')) return '\u{1F3A4}'
  if (t.includes('speed') || t.includes('pace') || t.includes('slow')) return '\u{23F1}'
  if (t.includes('filler')) return '\u{1F4AC}'
  if (t.includes('face') || t.includes('smile') || t.includes('relax')) return '\u{1F60A}'
  if (t.includes('posture') || t.includes('fidget') || t.includes('straight')) return '\u{1F9D8}'
  if (t.includes('great') || t.includes('confidence')) return '\u{2B50}'
  return '\u{1F4A1}'
}
