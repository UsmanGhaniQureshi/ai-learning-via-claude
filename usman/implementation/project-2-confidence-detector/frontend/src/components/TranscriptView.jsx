/**
 * TranscriptView — displays full transcript with filler words highlighted in red.
 * words: array of { word, start_ms, is_filler }
 */
export default function TranscriptView({ words = [] }) {
  if (!words || words.length === 0) {
    return <div className="transcript-empty">No transcript available</div>
  }

  return (
    <div className="transcript-view">
      <div className="transcript-text">
        {words.map((w, i) => (
          <span
            key={i}
            className={w.is_filler ? 'word-filler' : 'word-normal'}
            title={w.is_filler ? `Filler word at ${formatMs(w.start_ms)}` : undefined}
          >
            {w.word}{' '}
          </span>
        ))}
      </div>
    </div>
  )
}

function formatMs(ms) {
  if (!ms) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
