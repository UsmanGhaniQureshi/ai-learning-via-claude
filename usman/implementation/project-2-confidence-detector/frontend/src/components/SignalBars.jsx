import SignalInfoTooltip from './SignalInfoTooltip'

const SIGNALS = [
  { key: 'voiceSteadiness', signalDef: 'voice_steadiness', label: 'Voice Steadiness', weight: '24%', face: false },
  { key: 'eyeContact',     signalDef: 'eye_contact',      label: 'Eye Contact',      weight: '24%', face: true  },
  { key: 'speechPace',     signalDef: 'speech_pace',      label: 'Speech Pace',      weight: '20%', face: false },
  { key: 'fillerWords',    signalDef: 'filler_words',     label: 'Filler Words',     weight: '20%', face: false },
  { key: 'vocalVariety',   signalDef: 'vocal_variety',    label: 'Vocal Variety',    weight: '12%', face: false },
  // Voice trembling: jitter + shimmer detector. Weight tag reads
  // "−10 to −20" because it isn't part of the weighted average — it
  // applies a fixed penalty to the headline number when the speaker's
  // voice is actively shivering. Renders alongside the other audio
  // bars so the user can see WHY the headline dropped.
  { key: 'voiceTrembling', signalDef: 'voice_trembling',  label: 'Voice Trembling',  weight: '−10 to −20', face: false },
  { key: 'expression',     signalDef: 'expression',       label: 'Expression',       weight: 'display', face: true },
]

function fillClass(v) {
  if (v >= 75) return 'bg-gradient-to-r from-success to-cyan'
  if (v >= 50) return 'bg-gradient-to-r from-warning to-amber-400'
  return 'bg-gradient-to-r from-danger to-orange-500'
}

export default function SignalBars({
  scores = {},
  faceUnavailable = false,
  omitFaceSignals = false,
}) {
  return (
    <div className="space-y-4">
      {SIGNALS
        .filter(({ face }) => !(omitFaceSignals && face))
        .map(({ key, signalDef, label, weight, face }) => {
        const raw = scores[key]
        const noData = raw === null || raw === undefined
        const faceMissing = face && faceUnavailable
        const hide = noData || faceMissing
        const value = noData ? 0 : Number(raw)
        return (
          <div key={key} className={`space-y-1.5 ${hide ? 'opacity-40' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-text-primary">
                  {label}
                </span>
                {!hide && <SignalInfoTooltip signal={signalDef} />}
                <span className="text-xs text-text-muted">({weight})</span>
              </div>
              <span className="text-sm font-bold font-display tabular-nums text-text-primary">
                {hide ? '—' : Math.round(value)}
              </span>
            </div>
            <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
              {!hide && (
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${fillClass(value)}`}
                  style={{ width: `${value}%` }}
                />
              )}
            </div>
            {hide && (
              <p className="text-xs text-text-muted">
                {faceMissing ? 'No face detected - unavailable' : 'Not measured'}
              </p>
            )}
          </div>
        )
        })}
    </div>
  )
}
