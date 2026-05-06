/**
 * TranscriptView — displays full transcript with filler words highlighted.
 */
export default function TranscriptView({ words = [] }) {
  if (!words || words.length === 0) {
    return <div className="text-text-muted text-sm italic">No transcript available</div>
  }

  return (
    <div className="bg-page/60 border border-border rounded-md p-3 max-h-72 overflow-y-auto">
      <div className="text-sm text-text-secondary leading-relaxed">
        {words.map((w, i) => (
          <span
            key={i}
            className={
              w.is_filler
                ? 'text-warning bg-[rgba(245,158,11,0.15)] px-1 py-0.5 rounded font-semibold'
                : ''
            }
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
