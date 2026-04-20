/**
 * Displays 1-3 contextual feedback tips based on lowest-scoring signals.
 * Tips appear/disappear with CSS fade transitions.
 */
export default function FeedbackTips({ tips = [] }) {
  if (!tips || tips.length === 0) return null

  return (
    <div className="feedback-tips">
      <h4>Live Feedback</h4>
      <ul>
        {tips.map((tip, i) => (
          <li key={i} className="tip-item">
            <span className="tip-icon">{getTipIcon(tip)}</span>
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
