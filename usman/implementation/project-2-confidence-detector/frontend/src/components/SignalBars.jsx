/**
 * Horizontal bar display for each sub-score signal.
 * Each bar shows label, numeric value, and colored fill bar.
 *
 * `faceUnavailable`: when true, the face-dependent signals (eye contact,
 * expression) show N/A instead of a synthesised default — otherwise a
 * blank wall reads as "moderate 50" which is misleading.
 */
const SIGNALS = [
  { key: 'voiceSteadiness', label: 'Voice Steadiness', weight: '24%', face: false },
  { key: 'eyeContact', label: 'Eye Contact', weight: '24%', face: true },
  { key: 'speechPace', label: 'Speech Pace', weight: '20%', face: false },
  { key: 'fillerWords', label: 'Filler Words', weight: '20%', face: false },
  { key: 'vocalVariety', label: 'Vocal Variety', weight: '12%', face: false },
  { key: 'expression', label: 'Expression', weight: 'display-only', face: true },
]

function barColor(val) {
  if (val >= 71) return '#00c853'
  if (val >= 41) return '#ffd600'
  return '#ff1744'
}

export default function SignalBars({ scores = {}, faceUnavailable = false }) {
  return (
    <div className="signal-bars">
      {SIGNALS.map(({ key, label, weight, face }) => {
        const hide = face && faceUnavailable
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
                  width: hide ? '0%' : `${value}%`,
                  backgroundColor: hide ? '#444' : barColor(value),
                  transition: 'width 0.5s ease, background-color 0.3s ease',
                }}
              />
            </div>
            <div
              className="signal-value"
              style={{ color: hide ? '#888' : barColor(value) }}
              title={hide ? 'No face detected — this signal is unavailable.' : undefined}
            >
              {hide ? 'N/A' : Math.round(value)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
