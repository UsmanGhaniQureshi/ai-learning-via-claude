import SignalInfoTooltip from './SignalInfoTooltip'

/**
 * Horizontal bar display for each sub-score signal.
 * Each bar shows label, numeric value, and colored fill bar.
 *
 * `faceUnavailable`: when true, the face-dependent signals (eye contact,
 * expression) show N/A instead of a synthesised default — otherwise a
 * blank wall reads as "moderate 50" which is misleading.
 *
 * `info` (the camelCase key used here matches SignalBars' API; we map
 * it to the snake_case key SIGNAL_DEFS uses inside SignalInfoTooltip
 * via the `signalDef` field).
 */
const SIGNALS = [
  { key: 'voiceSteadiness', signalDef: 'voice_steadiness', label: 'Voice Steadiness', weight: '24%', face: false },
  { key: 'eyeContact',     signalDef: 'eye_contact',      label: 'Eye Contact',      weight: '24%', face: true },
  { key: 'speechPace',     signalDef: 'speech_pace',      label: 'Speech Pace',      weight: '20%', face: false },
  { key: 'fillerWords',    signalDef: 'filler_words',     label: 'Filler Words',     weight: '20%', face: false },
  { key: 'vocalVariety',   signalDef: 'vocal_variety',    label: 'Vocal Variety',    weight: '12%', face: false },
  { key: 'expression',     signalDef: 'expression',       label: 'Expression',       weight: 'display-only', face: true },
]

function barColor(val) {
  if (val >= 71) return '#00c853'
  if (val >= 41) return '#ffd600'
  return '#ff1744'
}

// Speech-derived signals — skipped (rendered N/A) when the language
// gate fired because the English-trained scorers can't be trusted.
const SPEECH_KEYS = new Set(['speechPace', 'fillerWords'])

export default function SignalBars({ scores = {}, faceUnavailable = false, languageWarning = null }) {
  return (
    <div className="signal-bars">
      {SIGNALS.map(({ key, signalDef, label, weight, face }) => {
        const raw = scores[key]
        const noData = raw === null || raw === undefined
        const faceMissing = face && faceUnavailable
        const langSkipped = languageWarning && SPEECH_KEYS.has(key)
        const hide = noData || faceMissing || langSkipped
        const value = noData ? 0 : Number(raw)
        let title
        if (langSkipped) title = 'Non-English speech — English-trained scorer skipped.'
        else if (faceMissing) title = 'No face detected — this signal is unavailable.'
        else if (noData) title = 'No data available for this signal.'
        return (
          <div key={key} className="signal-row">
            <div className="signal-label">
              <span>{label}<SignalInfoTooltip signal={signalDef} /></span>
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
              title={title}
            >
              {hide ? 'N/A' : Math.round(value)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
