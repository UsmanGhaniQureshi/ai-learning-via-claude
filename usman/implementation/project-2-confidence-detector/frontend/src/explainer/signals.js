/**
 * Single source of truth for "what does this signal measure?"
 *
 * The same definitions feed:
 *   - <SignalInfoTooltip> — the small `?` popover next to each bar
 *   - <HowItWorks>        — the dedicated /how-it-works page
 *
 * Each entry has:
 *   key       matches the signal id used in scoring (voice_steadiness etc.)
 *   label     human-readable name for headers
 *   short     one-sentence definition for the tooltip
 *   detail    longer explanation for the dedicated page
 *   good      what a "good" value means in plain English
 *   limits    known limitations / caveats
 *   anchor    URL anchor for /how-it-works deep-linking
 */
export const SIGNAL_DEFS = {
  voice_steadiness: {
    key: 'voice_steadiness',
    label: 'Voice Steadiness',
    short:
      'How steady your pitch and volume are. Trembling or swinging volume reads as nervousness.',
    detail:
      'Computed from the standard deviation of your pitch (in Hz) and the variation of your loudness (RMS) across each 3-second chunk. A steady speaker keeps both fairly constant; nervous speakers tend to either tremor (rapid pitch wobble) or swing loud-soft as they catch their breath.',
    good: 'Above 70 = solid. Above 85 = professional. Below 50 = audible nervousness in the audio.',
    limits:
      'A naturally expressive speaker who deliberately varies their delivery may score lower here than a deadpan reader — that\'s a known limitation. We\'re measuring "steady", not "engaging".',
    anchor: 'voice-steadiness',
    weight_pct: 24,
  },

  eye_contact: {
    key: 'eye_contact',
    label: 'Eye Contact',
    short:
      'Percentage of time your eyes are pointed at the camera (after subtracting your personal resting position).',
    detail:
      'During the first 3 seconds of recording (the "calibration window") we record your resting eye position from MediaPipe blendshapes. After that, eye contact is measured as DEVIATION from your own baseline — not against an absolute threshold. This means glasses, monitor-below-camera setups, or individual anatomy don\'t bias the score against you.',
    good: 'Above 70% = good camera presence. Below 50% = you\'re looking away most of the time (notes, second screen, the floor).',
    limits:
      'If you look at notes BELOW your camera, that\'s registered as "looking away" — there\'s no way for the model to tell whether you\'re reading from your hands or scrolling Twitter. We measure where your eyes point, not your intent.',
    anchor: 'eye-contact',
    weight_pct: 24,
  },

  speech_pace: {
    key: 'speech_pace',
    label: 'Speech Pace',
    short:
      'Words per minute, computed as transcribed words ÷ voiced seconds × 60.',
    detail:
      'Optimal range is approximately 120–170 WPM. Rates outside this range score lower, though natural variation across accents and languages is expected. The curve peaks at 150 WPM and falls off smoothly on either side. Silent chunks (where you weren\'t speaking) are excluded from the average — pauses don\'t drag your pace score down.',
    good: '120–170 WPM = top scores. Outside that = the rate isn\'t serving the listener — but accent / language variation is expected.',
    limits:
      'Cultural and linguistic norms differ — many speakers operate at 170–200 WPM as their natural conversational pace. Use this as a relative benchmark over your own sessions, not an absolute pass/fail.',
    anchor: 'speech-pace',
    weight_pct: 20,
  },

  filler_words: {
    key: 'filler_words',
    label: 'Filler Words',
    short:
      'Rate of "um", "uh", "like", "you know" per minute. Lower is better.',
    detail:
      'Counts both lexical fillers (Whisper transcribed "um" / "uh" / "like" / "you know" / "i mean") and acoustic non-lexical fillers (an "ahh" Whisper missed, detected from raw audio). Per voiced minute. The score is 100 when the rate is zero, dropping by tier (100 → 90 → 75 → 55 → 30 → 10) as fillers per minute climb.',
    good: 'Zero fillers = 100. Under 2 per minute = 90. Under 5 per minute = 75 — most casual speech sits here.',
    limits:
      'We deliberately removed "so", "right", "okay", "well", "actually", "basically", "literally", "kind of", "sort of" from the filler list because they\'re legitimate discourse markers — penalising "So the key point is…" is wrong.',
    anchor: 'filler-words',
    weight_pct: 20,
  },

  vocal_variety: {
    key: 'vocal_variety',
    label: 'Vocal Variety',
    short:
      'Pitch range across the session. Higher = more expressive; very low = monotone.',
    detail:
      'Measured as the standard deviation of your pitch (in Hz) across each chunk, then averaged over the session. Below 5 Hz means you\'re basically reading at one note (monotone, hard to listen to). 15-50 Hz is normal expressive speech. Above 50 Hz is animated / theatrical delivery.',
    good: 'Pitch SD 15-50 Hz = animated and engaging. Below 5 Hz = monotone, audience switches off.',
    limits:
      'Tonal-language speakers (Mandarin, Vietnamese, Cantonese, etc.) speaking English often have higher pitch variation as a residual habit, which makes their vocal_variety scores look great even when they don\'t feel particularly expressive — fair to them, but not directly comparable across language backgrounds.',
    anchor: 'vocal-variety',
    weight_pct: 12,
  },

  voice_trembling: {
    key: 'voice_trembling',
    label: 'Voice Trembling',
    short:
      'Detects when your voice is shivering or wavering — period-to-period jitter and amplitude shimmer over short rolling windows.',
    detail:
      'Splits each 3-second chunk into rolling 200ms windows and measures jitter (cycle-to-cycle pitch period instability, %) and shimmer (cycle-to-cycle amplitude instability, %). Praat\'s "outside normal" thresholds are 1.04% jitter / 3.81% shimmer — when either is exceeded AND the combined instability score is above 0.35, the chunk is flagged as trembling. A trembling chunk costs the headline confidence score 10–20 points depending on severity.',
    good: '90–100 = rock-steady voice. Below 60 = audible shivering / wavering, the strongest acoustic nervousness signal we measure.',
    limits:
      'Microphone noise can inflate shimmer slightly on cheap headsets. The penalty is only applied when BOTH jitter/shimmer exceed Praat thresholds and the combined instability score is above 0.35, which keeps single-window glitches from dragging the score down.',
    anchor: 'voice-trembling',
    weight_pct: 0,
  },

  expression: {
    key: 'expression',
    label: 'Expression',
    short:
      'Display-only signal. Identifies your dominant expression (neutral, focused, happy, etc.) but does NOT count toward your overall score.',
    detail:
      'Classifies each face frame into one of {happy, speaking, focused, neutral, surprised, sad, angry} using MediaPipe blendshapes. We deliberately excluded this from the scoring sum because the mapping (happy → 90, neutral → 60, sad → 30) is arbitrary and culturally biased — two people of equal objective confidence can score 30 points apart based on whether they happen to smile vs hold a neutral face.',
    good: 'Stays as informational reading, not "good" or "bad". Look at your dominant expression to understand how a viewer perceives you, but don\'t treat it as a pass/fail signal.',
    limits:
      'The blendshape classifier has no "I\'m not sure" class — it always picks the closest label, even when none fits well. Treat low-confidence frames with skepticism.',
    anchor: 'expression',
    weight_pct: 0,
  },
}

export const GLOSSARY = [
  {
    term: 'WPM',
    body: 'Words per minute. Computed as transcribed words ÷ voiced seconds × 60. Voiced seconds excludes silence, so a session with long pauses doesn\'t artificially deflate the rate.',
  },
  {
    term: 'Filler word',
    body: 'A word like "um", "uh", "like", "you know", "i mean" — placeholder sounds that don\'t carry meaning. Some discourse markers ("so", "right", "well") look similar but serve a real function and are NOT counted as fillers in this app.',
  },
  {
    term: 'Blendshape',
    body: 'A facial muscle activation value in [0, 1] reported by MediaPipe — e.g. eyeBlinkLeft = 0.85 means the left eye is 85% closed. We combine multiple blendshapes to derive eye contact, expression, and tension.',
  },
  {
    term: 'VAD',
    body: 'Voice Activity Detection. A small neural network (Silero VAD) that decides which fragments of audio contain actual speech vs silence/noise/breathing. Speech analysis only runs on detected speech regions.',
  },
  {
    term: 'Pitch SD',
    body: 'Standard deviation of pitch (in Hz) across a chunk. Low SD = monotone delivery; high SD = expressive, varied delivery. Computed via PYIN, which is robust to background noise.',
  },
  {
    term: '± value',
    body: 'Standard error of the per-chunk score across the whole session. A small ± means the signal was steady; a large ± means it swung a lot and the average hides the variation. NOT a measure of model accuracy.',
  },
  {
    term: 'Calibration window',
    body: 'The first ~3 seconds of any session. We record your resting eye position and facial baseline so the rest of the session is scored against YOUR neutral, not a global one.',
  },
]

export const FAQ = [
  {
    q: 'Why is my eye contact 50%?',
    a: '50% is the default we show when no face was detected at all (e.g. uploaded a clip with no person on camera). On a real session this would be a real number; if you see 50% on a session with a face, something went wrong with detection.',
  },
  {
    q: 'My pace was 200 WPM. How is it scored?',
    a: 'The sweet spot is 120–170 WPM and the curve falls off smoothly above. At 200 WPM the score is around 86 (out of 100) — perfectly listenable for most audiences, just a touch quick. The curve was widened to be fairer to fast natural speakers; if you want to bring the number down further, intentional pauses between sentences will pull your average toward the centre of the range.',
  },
  {
    q: 'What does the "Shared by X" badge on a recording mean?',
    a: 'Someone else owns that recording and granted you read + comment access. You can leave comments and view the report, but you can\'t edit the title, trim the file, or delete it — those are owner-only actions.',
  },
  {
    q: 'How accurate is the overall score?',
    a: 'The signals it\'s built from are well-defined (Whisper transcripts, MediaPipe landmarks, PYIN pitch). The WEIGHTS are not empirically validated against a labelled dataset — they\'re reasonable defaults pulled from presentation-coaching literature. Use the score as a self-comparison tool over your own sessions, not as an absolute number to compare across people.',
  },
  {
    q: 'My audio was mostly silence and the score is 0. Did I do something wrong?',
    a: 'No — that\'s the system being honest. Silence chunks are excluded from the speech-pace average rather than dragged down to zero, but if the WHOLE session is silent there\'s nothing to score. Re-record with audio that includes actual speech.',
  },
  {
    q: 'Why did my filler count include "so" / "right" / "well"?',
    a: 'It shouldn\'t — we removed those from the filler list because they\'re legitimate discourse markers. If you see one in your filler list, that\'s a bug worth reporting.',
  },
  {
    q: 'My headline score is lower than the per-signal sum. Why?',
    a: 'When voice trembling is detected, a fixed 10–20 point penalty is subtracted AFTER the weighted average is computed. The Score Breakdown panel shows this as a separate "Voice Trembling penalty" row so the gap is explicit. If your voice was steady the entire session, the penalty is 0 and the rounded headline matches the row sum to within ±1 point of rounding noise.',
  },
  {
    q: 'My emotion mix says 55% nervous + 20% confident + 15% hesitant. Which one am I?',
    a: 'All three, weighted. The mix is a probability distribution that always sums to 100% — there is no single "winning" label. Read it as "the dominant tone was nervous, but you also showed real confident moments and some hesitancy". Use it diagnostically: a teacher should land near engaged + calm; an apology should read sad-not-angry; a sales pitch can use some excited.',
  },
  {
    q: 'How is the emotion mix different from the face Expression signal?',
    a: 'Expression looks at your face (MediaPipe blendshapes — happy, sad, neutral, focused, etc.) and is shown for awareness only. Emotion Mix looks at your VOICE and WORDS — pitch, energy, rate, jitter, shimmer, plus filler / hedge / assertive / excited / angry / sad token density. They\'re separate because the face and the voice often disagree (a smiling speaker can sound nervous, a deadpan one can sound confident).',
  },
]
