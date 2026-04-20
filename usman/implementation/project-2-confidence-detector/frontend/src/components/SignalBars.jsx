/**
 * Horizontal bar display for each sub-score signal.
 * Each bar shows label, numeric value, and colored fill bar.
 */
const SIGNALS = [
  { key: 'voiceSteadiness', label: 'Voice Steadiness', weight: '22%' },
  { key: 'eyeContact', label: 'Eye Contact', weight: '22%' },
  { key: 'speechPace', label: 'Speech Pace', weight: '18%' },
  { key: 'fillerWords', label: 'Filler Words', weight: '18%' },
  { key: 'vocalVariety', label: 'Vocal Variety', weight: '12%' },
  { key: 'expression', label: 'Expression', weight: '8%' },
]

function barColor(val) {
  if (val >= 71) return '#00c853'
  if (val >= 41) return '#ffd600'
  return '#ff1744'
}

export default function SignalBars({ scores = {} }) {
  return (
    <div className="signal-bars">
      {SIGNALS.map(({ key, label, weight }) => {
        const value = scores[key] ?? 50
        return (
          <div key={key} className="signal-row">
            <div className="signal-label">
              <span>{label}</span>
              <span className="signal-weight">({weight})</span>
            </div>
            <div className="signal-bar-bg">
              <div
                className="signal-bar-fill"
                style={{
                  width: `${value}%`,
                  backgroundColor: barColor(value),
                  transition: 'width 0.5s ease, background-color 0.3s ease',
                }}
              />
            </div>
            <div className="signal-value" style={{ color: barColor(value) }}>
              {Math.round(value)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
