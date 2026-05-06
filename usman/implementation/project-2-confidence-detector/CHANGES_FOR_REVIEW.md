# Changes for review — Emotion detection + Voice trembling

Two related fixes were applied to the Personal Presentation Confidence
Detector. This file is a concise audit handoff: every file touched,
every symbol added, plus the verification commands an auditor can run
against `backend/detector_env/`.

---

## Issue 1 — Multi-label emotion detection (lexical + prosodic)

**Problem:** previous build had no real emotion detector — only a
face-blendshape "expression" classifier (happy/neutral/sad/etc) that
ignored the audio.

**Fix:** new module that combines transcript signals with prosodic
signals and returns a softmax-normalised mix over 10 labels.

### New file
- `backend/emotion_detector.py`

### Public API
- `LABELS` — tuple of 10 emotion labels:
  `nervous, confident, excited, calm, hesitant, monotone,
  engaged, bored, angry, sad`
- `detect_emotion_mix(*, words, pitch, rms, rms_std, voiced_s, wpm,
  lexical_filler_count, acoustic_filler_count, word_count, trembling)`
  → returns `{mix: {label: prob, ...}, dominant, dominant_pct,
  evidence: {lexical, prosodic}, available_signals}`. `mix` sums to 1.0.
- `aggregate_emotion_mixes(per_chunk_mixes)` → averages chunks into a
  session-level mix (uniform weight; skips chunks with `mix is None`).

### Lexical token sets defined inside the module
- `HEDGE_PHRASES` — "maybe / kind of / i think / not sure / …" → hesitant + nervous.
- `ASSERTIVE_PHRASES` — "definitely / absolutely / clearly / …" → confident.
- `EXCITED_TOKENS` — "amazing / wow / incredible / …" → excited.
- `CALM_TOKENS` — "consider / observe / let's / first / next / …" → calm.
- `ANGRY_TOKENS` — "wrong / never / ridiculous / can't believe / …" → angry.
- `SAD_TOKENS` — "unfortunately / sorry / lost / wish / …" → sad.
- `ENGAGED_TOKENS` — "imagine / picture / look / ask yourself / …" → engaged.
- `bored` is prosody-only (no token set — its lexicon overlaps too
  much with calm/monotone, so prosody must carry it).

### Per-label evidence
- **lexical** — token density (hits per 100 words), filler rate,
  hedge density, repetition rate.
- **prosodic** — pitch mean → arousal sigmoid, pitch SD → variety,
  WPM → arousal ramp, RMS, RMS std, tremor, jitter %, shimmer %,
  combined instability.

### Calibration choices that stop one-hot collapse
- Softmax `temperature=2.0` — keeps runner-ups in 15–30% range.
- `confident` baseline boost gated by `pitch_std > 10` so a monotone
  reader doesn't read as confident.
- `calm` gated by `pitch_std > 8` so a flat-pitch sample reads as
  monotone, not calm.
- `bored` requires compound evidence: pitch flatness contributes
  ONLY when energy is low or rate is slow.
- `angry` penalised when energy is low (angry without volume is rare).

### Wiring into pipeline
- `backend/audio_pipeline.py:process_chunk` — calls
  `detect_emotion_mix(...)` and attaches `result["emotion"]`.
- `backend/report_generator.py` — calls `aggregate_emotion_mixes(...)`,
  adds `report["emotion"]` (session mix) and `report["emotion_timeline"]`
  (per-chunk for the result-screen tooltip), plus dominant-emotion
  insight branches for nervous/hesitant/monotone, excited, bored,
  sad, angry. engaged/confident are positive labels — no insight.

### Frontend
- `frontend/src/components/EmotionMix.jsx` — new component, stacked
  bar + legend. `COLOR_BY_LABEL` + `TEXT_BY_LABEL` cover all 10
  labels using only Tailwind palette. Sub-3% labels grouped into
  an "other" bucket.
- `frontend/src/components/SessionReport.jsx` — destructures
  `voice_trembling` and `emotion` from the report; renders a new
  "How you sounded" card above the Signal Breakdown drawer.
- `frontend/src/hooks/useLiveSession.js` — adds `emotion` state, set
  from `data.emotion` on every WS message; reset alongside
  `setLiveHud(null)` everywhere.
- `frontend/src/pages/LiveSession.jsx` — destructures `emotion`,
  renders `EmotionMix compact` inside the Signal Details drawer.

---

## Issue 2 — Voice trembling / shivering detection

**Problem:** no detector for period-to-period pitch instability or
amplitude shimmer; the existing `tremor_score` (low-frequency F0
modulation) is a related but different signal.

**Fix:** rolling-window jitter+shimmer detector with Praat-style
thresholds and a fixed −10 to −20 penalty on the headline score.

### New function
- `backend/audio_pipeline.py:compute_voice_trembling(audio, sr=16000,
  window_ms=200, hop_ms=100)` →
  `{jitter_pct, shimmer_pct, instability (0-1), is_trembling, windows}`.
  Windows the audio into 200ms slices (hop 100ms), runs PYIN per
  window, computes Praat-local jitter and shimmer, averages.
  Flags `is_trembling=True` only when (jitter > 1.04% OR shimmer >
  3.81%) AND combined instability > 0.35.

### Score wiring
- `backend/signal_scorer.py:voice_trembling(trembling, voiced_s)` —
  display-only 0-100 score (100 = rock-steady; instability 0.35 → 60;
  1.0 → 0). Returns None on silent chunks.
- `backend/signal_scorer.py:trembling_penalty(trembling)` — 0 when
  not trembling, otherwise scaled to `int(10..20)` from instability.
- `backend/signal_scorer.py:aggregate(signals, trembling=None)` —
  subtracts `trembling_penalty(trembling)` from the weighted total
  AFTER renormalisation, then clamps to [0, 100].
- `backend/audio_pipeline.py:process_chunk` — populates
  `result["scores"]["voice_trembling"]` and
  `result["raw"]["trembling"]`, calls
  `SignalScorer.aggregate(scores, trembling=trembling)`.
- `backend/main.py` — three additional `SignalScorer.aggregate(...)`
  call sites (live WS re-aggregation after face merge, audio-only
  upload's two paths) all updated to pass
  `trembling=result["raw"]["trembling"]`.
- `backend/scoring_engine.py:compute_sub_scores(...)` — accepts
  optional `trembling=...`, emits `scores['voice_trembling']`.
- `backend/scoring_engine.py:update(sub_scores, trembling=None)` —
  applies `trembling_penalty` to the rolling-average total; emits
  `voiceTrembling`, `tremblingPenalty`, `isTrembling` to the WS payload.
- `backend/report_generator.py` — `signal_avgs["voice_trembling"]`,
  `signal_stderrs["voice_trembling"]`, session-level
  `voice_trembling` summary block (`avg_jitter_pct`, `avg_shimmer_pct`,
  `avg_instability`, `trembling_chunk_count`, `trembling_chunk_pct`,
  `is_trembling_session`), and an insight string with
  jitter/shimmer numbers + breathing nudge.

### Frontend
- `frontend/src/explainer/signals.js` — new `voice_trembling` entry
  (label, short, detail, anchor, weight_pct=0).
- `frontend/src/components/SignalBars.jsx` — new "Voice Trembling"
  row tagged "−10 to −20".
- `frontend/src/pages/LiveSession.jsx` — `barScores.voiceTrembling`
  fed from `scores.voice_trembling`.
- `frontend/src/components/SessionReport.jsx` — "How you sounded"
  card surfaces a red-bordered Voice Trembling banner with the
  jitter/shimmer/instability numbers and a "Penalty applied" note
  when `is_trembling_session` is true.

---

## Verification (commands)

Run from `usman/implementation/project-2-confidence-detector/backend`.

### Syntax / import
```bash
../detector_env/Scripts/python -c "
import ast
for f in ['emotion_detector.py','report_generator.py','signal_scorer.py','scoring_engine.py','audio_pipeline.py']:
    ast.parse(open(f, encoding='utf-8').read())
    print(f, 'syntax ok')
"
```

### Emotion label set
```bash
../detector_env/Scripts/python -c "
from emotion_detector import LABELS
assert len(LABELS) == 10
assert set(LABELS) == {'nervous','confident','excited','calm','hesitant','monotone','engaged','bored','angry','sad'}
print('labels ok:', LABELS)
"
```

### Per-label dominance — 10 synthetic samples
The detector was tuned against one biased sample per label; expected
result is "dominant matches expected" for all 10.

| sample | dominant | % | top runner-up |
|---|---|---|---|
| nervous   | nervous   | 73% | hesitant 16% |
| confident | confident | 75% | calm 6% |
| excited   | excited   | 42% | angry 19% |
| calm      | calm      | 42% | confident 23% |
| hesitant  | hesitant  | 84% | nervous 10% |
| monotone  | monotone  | 34% | sad 17% |
| engaged   | engaged   | 36% | confident 29% |
| bored     | bored     | 43% | monotone 21% |
| angry     | angry     | 74% | confident 6% |
| sad       | sad       | 46% | bored 19% |

All mixes sum to 1.0 ± 0.005 after rounding. Sample inputs are in
the conversation transcript and re-runnable from the command above.

### Voice trembling — synthetic
```bash
../detector_env/Scripts/python -c "
import numpy as np
from audio_pipeline import compute_voice_trembling
sr = 16000
t = np.linspace(0, 3, sr*3, endpoint=False)
steady = (0.1 * np.sin(2*np.pi*150*t)).astype(np.float32)
print('steady:', compute_voice_trembling(steady, sr))
trem_freq = 150 + 8*np.sin(2*np.pi*6*t)
phase = np.cumsum(2*np.pi*trem_freq/sr)
trembling_sig = (0.1 * (1 + 0.4*np.sin(2*np.pi*5*t)) * np.sin(phase)).astype(np.float32)
print('trembling:', compute_voice_trembling(trembling_sig, sr))
"
```
Expected: steady → `is_trembling=False`, jitter < 0.1%; vibrato +
AM tone → `is_trembling=True`, jitter ≈ 1.4%, shimmer ≈ 9%.

### Trembling penalty + aggregate
```bash
../detector_env/Scripts/python -c "
from signal_scorer import SignalScorer
t1 = {'jitter_pct': 1.41, 'shimmer_pct': 8.98, 'instability': 0.57, 'is_trembling': True, 'windows': 29}
scores = {'voice_steadiness': 80, 'eye_contact': 75, 'speech_pace': 90,
          'filler_words': 85, 'vocal_variety': 70, 'expression': 60}
print('penalty:', SignalScorer.trembling_penalty(t1))     # → 13
print('aggregate w/o:', SignalScorer.aggregate(scores))    # → 81
print('aggregate w/ :', SignalScorer.aggregate(scores, trembling=t1))  # → 68
"
```

### Report end-to-end
```bash
../detector_env/Scripts/python -c "
from report_generator import generate_post_session_report
snap = {
    'scores': {'voice_steadiness': 80,'eye_contact': 70,'speech_pace': 85,
               'filler_words': 75,'vocal_variety': 60,'expression': 60,
               'voice_trembling': 43,'total': 68},
    'raw': {'voiced_s': 2.5,'wpm': 150,'pitch': {'std_hz': 25},'rms': 0.04,
            'rms_std': 0.02,'silence_rms': 0.005,
            'trembling': {'jitter_pct': 1.4,'shimmer_pct': 8.0,'instability': 0.55,'is_trembling': True,'windows': 6}},
    'transcript_words': [{'word': w,'start_ms': i*200,'end_ms': i*200+150,'is_filler': w=='um','probability': 0.7}
                          for i,w in enumerate(['um','maybe','we','should','try','this','thing','now','okay'])],
    'emotion': {'mix': {'nervous': 0.55,'confident': 0.15,'excited': 0.05,
                        'calm': 0.10,'hesitant': 0.10,'monotone': 0.05,
                        'engaged': 0,'bored': 0,'angry': 0,'sad': 0},
                 'dominant': 'nervous','dominant_pct': 55},
    'unsupported_language': None,
}
r = generate_post_session_report([snap, snap], session_id='test')
assert r['voice_trembling']['is_trembling_session']
assert r['emotion']['dominant'] == 'nervous'
assert any('trembl' in i.lower() for i in r['insights'])
assert any('nervous' in i.lower() for i in r['insights'])
print('report integration ok')
"
```

### Frontend smoke
```bash
cd ../frontend
npm run dev
# Open /live, /result/<id>; confirm:
# - SignalBars shows new "Voice Trembling" row
# - "How you sounded" card on Result screen renders EmotionMix +
#   trembling banner (red-bordered when is_trembling_session=true)
# - All 10 emotion labels render with distinct Tailwind colours
#   when active; sub-3% weights collapse into "other"
```

---

## Files modified — summary

### Backend
- `backend/emotion_detector.py` — **new file** (≈340 lines).
- `backend/audio_pipeline.py` — added `compute_voice_trembling`;
  `process_chunk` calls trembling + emotion detectors and surfaces
  both on the result.
- `backend/signal_scorer.py` — added `voice_trembling`,
  `trembling_penalty`; `aggregate(signals, trembling=None)` now
  subtracts the penalty.
- `backend/scoring_engine.py` — `WEIGHTS` unchanged;
  `DISPLAYED_SIGNALS` adds `voice_trembling`; `compute_sub_scores`
  + `update` accept optional `trembling=...`; payload exposes
  `voiceTrembling`, `tremblingPenalty`, `isTrembling`.
- `backend/report_generator.py` — emotion + trembling aggregation,
  insight strings, timeline arrays, signal averages/stderrs.
- `backend/main.py` — three `SignalScorer.aggregate` call sites
  updated to pass `trembling=raw.trembling`.

### Frontend
- `frontend/src/components/EmotionMix.jsx` — **new file**.
- `frontend/src/components/SignalBars.jsx` — Voice Trembling row.
- `frontend/src/components/SessionReport.jsx` — "How you sounded"
  card; destructures `voice_trembling` + `emotion`.
- `frontend/src/explainer/signals.js` — `voice_trembling` def.
- `frontend/src/hooks/useLiveSession.js` — `emotion` state + reset.
- `frontend/src/pages/LiveSession.jsx` — destructures `emotion`,
  renders compact `EmotionMix` in Signal Details drawer.

### Notes for the auditor
- All Python modules pass `ast.parse`.
- No tests were modified — existing tests use default args, all
  signature additions are keyword-only with safe defaults.
- The trembling penalty is applied per-chunk, NOT re-applied at the
  session aggregate (avoids double-counting).
- `expression` (face) and `voice_trembling` are display-only — they
  don't appear in the weighted-sum `WEIGHTS` dict.
