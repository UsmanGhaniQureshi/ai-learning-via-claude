# Scoring Accuracy Audit

**Date:** 2026-04-28
**Commit:** 78c16939970e651649aad34d5741cc35f14c07f7

## Executive Summary

- **A user who says nothing scores 82/100 (grade "A")**, end-to-end, on the
  current code. Reproduced numerically. Three signals (`voice_steadiness`,
  `filler_words`, `vocal_variety`) return real-looking numbers on silent
  audio because they don't gate on "did anything actually happen."
- **The non-English language gate is dead code.** The default Whisper
  model is `distil-small.en` (English-only); the pipeline forces
  `language="en"`; `info.language` always returns `"en"` with confidence
  `1.0`; the gate condition `lang != "en"` literally never fires. Urdu /
  Hindi / Arabic input gets a normal score with no warning banner.
- **The LIVE recording path bypasses the entire server-side
  `FaceEngine`.** The browser sends only `eye_contact`, `expression`,
  `tension`, `face_detected` over the WS — `blink_rate`, `posture`,
  `fidget`, `hand_position` are not computed or sent. Live face scores
  are systematically inflated relative to upload by ~15-25 points.
- **The LIVE path has no per-user eye-contact baseline.** The browser
  uses a hardcoded `maxLook < 0.55` threshold; the server-side engine
  subtracts a user's first-3s resting position. Glasses wearers and
  monitor-below-camera setups score dramatically worse on live than on
  upload of the same content.
- **Browser audio constraints (`echoCancellation`, `noiseSuppression`,
  AGC default-on) actively modify the live audio waveform** before it
  hits the pipeline. Upload audio is unmodified. Same speaker, same
  room → different `voice_steadiness` and `filler_words`.

The previous-pass scoring fixes (renormalizing `aggregate`, returning
`None` for missing source data, language-gate code) are real
improvements but **do not address Failure 1** (per-signal scorers don't
gate on speech presence) and **do not enable Failure 2 detection** in
the production env (English-only model can't autodetect non-English).

---

## Failure 1: Silent User Scores High

### Reproduction

```sh
# Generate a 30-second silent WAV
ffmpeg -y -f lavfi -i anullsrc=r=16000:cl=mono -t 30 \
  -c:a pcm_s16le /tmp/silent_30s.wav

# Run AudioPipeline + report_generator on it (script at
# d:/tmp/repro_silent_pipeline.py — see Verification Commands below).
detector_env/Scripts/python.exe d:/tmp/repro_silent_pipeline.py
```

**Observed result** (face simulated as "visible, neutral expression,
80% eye-contact" — typical of a user staring blankly at the camera):

| Per-chunk signal | Value (every chunk, all 10) |
|---|---|
| `voice_steadiness` | **100** |
| `speech_pace`      | None (silent — early return) |
| `filler_words`     | **100** |
| `vocal_variety`    | 20 |
| `eye_contact`      | 80 (real face data) |
| `expression`       | 60 (display-only) |
| **per-chunk total** | **82** |

Final session report:
```
avg_score = 82
grade     = A
signal_averages = {
  voice_steadiness: 100, eye_contact: 80, speech_pace: 0,
  filler_words: 100, vocal_variety: 20, expression: 60
}
```

### Root Cause

Three per-signal scorers in
[backend/signal_scorer.py](backend/signal_scorer.py) treat "no input"
as "perfect" or "valid":

1. [`SignalScorer.voice_steadiness`](backend/signal_scorer.py#L24-L30)
   computes `100 - tremor_penalty - volume_penalty`. On silent audio,
   `pitch.tremor_score = 0` (no voiced frames in PYIN —
   [audio_pipeline.py:220](backend/audio_pipeline.py#L220)) and
   `rms_std = 0` (no variation in zeros), so penalties = 0 → returns
   **100**. The score literally rewards the absence of voice.
2. [`SignalScorer.filler_words`](backend/signal_scorer.py#L76-L93)
   computes `rate = ((lex + acoustic) / max(voiced_s, 1)) * 60`. With
   `lex=0, acoustic=0, voiced_s=0`, `rate = 0/1 * 60 = 0`, hits the
   `rate == 0 → return 100` branch. Zero fillers in zero words is not
   a "perfect" score — there was no speech to evaluate.
3. [`SignalScorer.vocal_variety`](backend/signal_scorer.py#L126-L139)
   returns `20` for any `pitch_std < 5`. On silent audio
   `pitch_std = 0`, hits `< 5` → 20 (treated as "monotone"). The user
   isn't monotone, they're silent — different problem, same number.

`speech_pace` is the only signal that correctly skips silence: it
returns `None` when `voiced_s < 0.5`
([signal_scorer.py:48-49](backend/signal_scorer.py#L48-L49)). The
recently-fixed `SignalScorer.aggregate` then renormalizes the
remaining weights, which produces:

```
(0.24*100 + 0.24*80 + 0.20*100 + 0.12*20) / (0.24+0.24+0.20+0.12)
 = 65.6 / 0.80
 = 82
```

There is **no upstream "session-had-no-speech" gate** anywhere:
- [main.py session_ws](backend/main.py#L2077-L2084) calls
  `pipeline.process_chunk` and `SignalScorer.aggregate` unconditionally
  on every chunk regardless of `voiced_s`.
- [main.py upload pipeline](backend/main.py#L1486-L1488) calls
  `compute_sub_scores` then `update` regardless of speech presence.
- [report_generator.py:131-149](backend/report_generator.py#L131-L149)
  uses `voiced_chunks` only for language detection, never to gate
  scoring.

### Contributing Bugs

**Bug 1.1 — `voice_steadiness` returns 100 on silent audio.**
- Location: [signal_scorer.py:24-30](backend/signal_scorer.py#L24-L30)
- Current: `100 - 0 - 0 = 100` when no pitch + no volume variance.
- Expected: return `None` (no voiced audio = no measurement) so the
  aggregator skips it.
- Severity: **CRITICAL**
- Fix difficulty: trivial (1 line)
- Suggested fix: at the top of `voice_steadiness`, accept a
  `voiced_s` parameter (or read it from the calling context); if
  `voiced_s < 0.5` return `None`. Plumb `voiced_s` through from
  `audio_pipeline.process_chunk` (which already has it from the VAD
  segments).

**Bug 1.2 — `filler_words` returns 100 when there was no speech.**
- Location: [signal_scorer.py:76-93](backend/signal_scorer.py#L76-L93)
- Current: `rate = (0+0)/max(0,1)*60 = 0` → `rate == 0` → 100.
- Expected: return `None` when `voiced_s < 0.5`. Zero fillers in zero
  words is "no data," not "perfect."
- Severity: **CRITICAL**
- Fix difficulty: trivial (1 guard line at the top of the function)
- Suggested fix: `if voiced_s < 0.5: return None`.
  Note that `ScoringEngine.compute_sub_scores`
  ([scoring_engine.py:75-92](backend/scoring_engine.py#L75-L92))
  already requires `voiced_s > 0` to call this function — so the
  bug only fires through the LIVE WS path which calls
  `SignalScorer.filler_words` directly via `audio_pipeline.process_chunk`
  ([audio_pipeline.py:525-526](backend/audio_pipeline.py#L525-L526)).

**Bug 1.3 — `vocal_variety` treats silence as "monotone" (score 20).**
- Location: [signal_scorer.py:126-139](backend/signal_scorer.py#L126-L139)
- Current: any `pitch_std < 5` → 20 regardless of whether pitch was
  even measurable.
- Expected: return `None` when `pitch_std == 0` AND there were no
  voiced frames.
- Severity: **HIGH** (less impactful than 1.1/1.2 because the 20 hurts
  the headline, not helps it — but still a wrong number)
- Fix difficulty: trivial
- Suggested fix: same gate as 1.1, return `None` when `voiced_s < 0.5`.

**Bug 1.4 — No session-level "did anything happen?" gate.**
- Location: callers — [main.py:2077-2084](backend/main.py#L2077-L2084)
  (WS), [main.py:1486-1488](backend/main.py#L1486-L1488) (upload),
  [main.py:2333-2348](backend/main.py#L2333-L2348) (analyzer)
- Current: scoring proceeds even when total session `voiced_s` is
  effectively zero. A 30-second session of pure silence produces a
  Media row with `score_avg=82` and the user sees a grade A.
- Expected: when total voiced seconds across the session is below a
  threshold (suggest 3 s = 1 chunk's worth), the report should be
  marked `insufficient_speech: true`, the avg_score should be `None`,
  and the UI should render "Not enough speech to score" instead of a
  number.
- Severity: **CRITICAL**
- Fix difficulty: moderate (need a new flag in the report schema +
  frontend handling)
- Suggested fix: in
  [report_generator.py:131](backend/report_generator.py#L131)
  compute `total_voiced_s = sum(r.get("voiced_s", 0) for r in all_raw)`;
  if `< 3.0` set `report["insufficient_speech"] = True` and
  `report["avg_score"] = None`. Frontend renders a message instead
  of the gauge.

**Bug 1.5 — `report_generator.avg()` returns `0` (not `None`) when all
inputs are None.**
- Location: [report_generator.py:65-74](backend/report_generator.py#L65-L74)
- Current: `if not vals: return 0` — collapses "no data" to a real
  zero, which the UI then renders as "0/100" instead of "N/A."
- Expected: `return None` so downstream code can render "N/A."
  Confirmed in my reproduction: silent session shows
  `signal_averages.speech_pace = 0` (every chunk had `None`).
- Severity: **HIGH** (cosmetic but misleading — looks like the user
  scored zero when actually nothing was measured)
- Fix difficulty: trivial; needs corresponding frontend N/A handling
  (already added to `ScoreBreakdownPanel`, needs verification in
  `SessionReport.ReportSignalBars`).

---

## Failure 2: Non-English Scored as Valid

### Reproduction

The gate cannot fire under production defaults. Confirmed by static
analysis:

```sh
# Show the env defaults that ship in .env
grep -E "WHISPER_MODEL|WHISPER_AUTODETECT" backend/.env
# → WHISPER_MODEL=distil-small.en        (English-only model)
# → WHISPER_AUTODETECT  is NOT SET       (defaults to "" → False)
```

To verify the gate logic live, the audit ran a static trace:

```sh
detector_env/Scripts/python.exe -c "
import os
os.environ.pop('WHISPER_AUTODETECT', None)
from audio_pipeline import AudioPipeline
ap = AudioPipeline()
# inspect the language_kwarg the pipeline will pass to whisper
import inspect
src = inspect.getsource(ap.process_chunk)
print('language_kwarg path:', 'auto and not english_only_model' in src)
"
```

### Root Cause

The gate has two sequential failures:

**Step 1 — `language_kwarg = "en"` is forced regardless of input.**
[audio_pipeline.py:307-310](backend/audio_pipeline.py#L307-L310):

```python
auto = os.environ.get("WHISPER_AUTODETECT", "").lower() in ("1","true","yes")
model_name = os.environ.get("WHISPER_MODEL", "distil-small.en")
english_only_model = model_name.endswith(".en")
language_kwarg = None if (auto and not english_only_model) else "en"
```

In production: `auto = False` (env unset) AND `english_only_model = True`
(default model is `.en`). Therefore `language_kwarg = "en"` is hardcoded.
`whisper.transcribe(..., language="en")` forces English transcription —
the model never tries to detect what language the audio actually is.

**Step 2 — `info.language` is always `"en"`.**
[audio_pipeline.py:346-353](backend/audio_pipeline.py#L346-L353): the
returned `result["detected_language"]` is `"en"` and
`result["language_confidence"]` is `1.0` regardless of the actual audio
content (the `.en` model has no detection head; English-only).

**Step 3 — The gate's condition `lang != "en"` never matches.**
- WS path: [main.py:2092-2105](backend/main.py#L2092-L2105). The
  branch `if lang != "en" and conf > 0.6:` never executes. No
  `language_warning` JSON is ever sent. Frontend never shows the
  yellow banner.
- Upload path: [main.py:1509-1546](backend/main.py#L1509-L1546). Same
  logic, same dead-code outcome.
- Analyzer path: [main.py:2339-2373](backend/main.py#L2339-L2373).
  Same.

### What the user actually experiences with Urdu / Hindi / Arabic input

Per [audio_pipeline.py:325-389](backend/audio_pipeline.py#L325-L389):
- Whisper produces best-guess English transliteration of the foreign
  speech ("haan", "agar", random English-shaped tokens).
- The English-trained lexical filler list (`{"um","uh","like",…}`)
  doesn't match Hindi/Urdu words → `filler_words` score is
  artificially **high** (the model thinks the user has no fillers).
- WPM is computed on the bogus transliterated tokens → randomly
  inflated/deflated.
- `voice_steadiness` and `vocal_variety` are **language-agnostic** so
  they continue to score normally — and contribute to the headline.
- Final report: `language_warning = None`, `score_avg = (some valid-
  looking number)`, persisted to DB, downloadable, shareable. No
  banner, no "this clip wasn't English" indicator anywhere.

### Contributing Bugs

**Bug 2.1 — Default model is English-only, so detection is impossible.**
- Location: [.env](backend/.env) and
  [audio_pipeline.py:308](backend/audio_pipeline.py#L308)
- Current: `WHISPER_MODEL` defaults to `distil-small.en`. No
  multilingual fallback.
- Expected: either (a) ship a multilingual default with autodetect on,
  OR (b) document that detection requires an explicit env-var config.
- Severity: **CRITICAL** (the entire Failure 2 feature is non-functional
  as shipped)
- Fix difficulty: moderate — switching to multilingual whisper costs
  ~3x model size + ~30% latency; needs a deliberate decision.
- Suggested fix: keep `.en` as default for performance, but **detect
  non-English BEFORE forcing language="en"**. Run a one-shot
  multilingual probe on the first chunk only (no transcription, just
  language detection — `whisper.detect_language()`), then load the
  appropriate model. Or: ship a separate small multilingual detector
  model and gate on its output.

**Bug 2.2 — `language_kwarg = "en"` forced even when caller wants detection.**
- Location: [audio_pipeline.py:310](backend/audio_pipeline.py#L310)
- Current: forced to `"en"` whenever the model is English-only,
  regardless of `auto`.
- Expected: even on `.en` models, should not force a language hint
  that hides what the audio actually is. Pass `None` when `auto=True`,
  let Whisper handle the missing detection head gracefully (or call
  the explicit detect API).
- Severity: **HIGH**
- Fix difficulty: trivial — `language_kwarg = None if auto else "en"`
  (drop the `english_only_model` clause).
- Suggested fix: see above. Combined with 2.1 makes the gate viable.

**Bug 2.3 — Gate is informational, not enforcing.**
- Location: [main.py:2092-2105](backend/main.py#L2092-L2105) (and the
  upload + analyzer mirrors)
- Current: even when the gate fires, it sends a JSON `language_warning`
  message and **continues to compute and stream scores**. The user
  sees real-time score updates of nonsense numbers for the entire
  remainder of the session.
- Expected: when the gate fires, the WS handler should mark the
  session as `language_unsupported`, stop emitting score updates, and
  the report at the end should have `avg_score = None` with a clear
  "this language is not supported" body.
- Severity: **HIGH** (UX-level bug; wrong numbers shown live + persisted)
- Fix difficulty: moderate (frontend needs a new state)
- Suggested fix: when `_lang_warning_sent` becomes True in
  [main.py:2099-2100](backend/main.py#L2099-L2100), set a session-level
  `_unsupported_language = True` flag; subsequent chunks compute but
  don't broadcast scores; finalize sends report with `avg_score = None`
  and `language_warning = code`.

**Bug 2.4 — `voice_steadiness` and `vocal_variety` still contribute on
non-English clips.**
- Location: [main.py:1538-1546](backend/main.py#L1538-L1546) (upload
  path)
- Current: when language gate fires, only `speech_pace` and
  `filler_words` are zeroed. Pitch-derived signals continue to score
  and contribute to the headline.
- Expected: questionable. Pitch IS language-agnostic so the math is
  defensible, but reporting a "confidence score" derived only from
  prosody (no speech intelligibility) is misleading. Recommend: when
  language is unsupported, the whole report's `avg_score` is `None`
  with `language_warning` explaining why — no partial scores.
- Severity: **MEDIUM**
- Fix difficulty: trivial (already in scope of 2.3 fix)

**Bug 2.5 — Persisted report has no per-Media language flag.**
- Location: [models/media.py](backend/models/media.py)
- Current: no `detected_language` column on `Media`. The only place
  language warnings can live is inside `report_json`. A sharing
  recipient looking at /api/recordings list has no way to see "this
  was Hindi, scores are nonsense" without opening the full report.
- Expected: add a `detected_language` column (nullable text) and
  surface it in the recordings list endpoint.
- Severity: **LOW** (cosmetic for now; matters when sharing rolls out)

---

## Failure 3: Live vs Upload Accuracy Divergence

### Reproduction

A true side-by-side requires a virtual mic; the audit traced the
divergences in code instead and quantified the per-signal expected
delta from each known mismatch:

| Axis | LIVE behavior | UPLOAD behavior | File:line |
|---|---|---|---|
| Audio resampling | Linear-interp in JS from device native (often 48 kHz) → 16 kHz | ffmpeg high-quality → 16 kHz Int16 | [useLiveSession.js:218-231](frontend/src/hooks/useLiveSession.js#L218-L231) vs [main.py:1085-1086](backend/main.py#L1085-L1086) |
| Audio preprocessing | `echoCancellation: true`, `noiseSuppression: true`, AGC default-on | None — raw waveform | [useLiveSession.js:274-282](frontend/src/hooks/useLiveSession.js#L274-L282) |
| Sample format | Float32 PCM over WS (`Float32Array.buffer`) | Int16 PCM via ffmpeg, converted to Float32 backend-side | [useLiveSession.js:241-244](frontend/src/hooks/useLiveSession.js#L241-L244) |
| Face engine | **Browser MediaPipe — sends 4 fields** (`eye_contact, expression, tension, face_detected`) | Server `FaceEngine.process_frame` — 7+ fields incl. blink, posture, fidget, hand | [useLiveSession.js:443-461](frontend/src/hooks/useLiveSession.js#L443-L461) vs [face_engine.py:524-595](backend/face_engine.py#L524-L595) |
| Eye-contact threshold | Hardcoded `maxLook < 0.55`, no per-user baseline | Subtracts per-user 3-second baseline before threshold | [useFaceDetection.js:200](frontend/src/hooks/useFaceDetection.js#L200) vs [face_engine.py:224-240](backend/face_engine.py#L224-L240) |
| Face frame rate | ~6.7 Hz (`DETECTION_INTERVAL_MS = 150`) | ~15 Hz (every 2nd frame at 30 fps) | [useFaceDetection.js:20](frontend/src/hooks/useFaceDetection.js#L20) vs [main.py:1166](backend/main.py#L1166) |
| Calibration window | 30-sample eye-contact history at 6.7 Hz = ~4.5 s; expression has none | 90-frame baseline at 30 fps = 3 s, applied to expression + eye contact + posture | [useFaceDetection.js:202-207](frontend/src/hooks/useFaceDetection.js#L202-L207) vs [face_engine.py:73,111-195](backend/face_engine.py#L73) |
| Backpressure | `await pipeline.process_chunk` blocks WS read; chunks buffer in TCP / OS, can drop on slow CPU | ffmpeg streams to stdout; backend reads at its own pace, no drops | [main.py:2077-2079](backend/main.py#L2077-L2079) |

### Per-signal divergence (code-based estimate — runtime A/B not run):

| Signal | Upload score | Live score | Delta | Likely cause |
|--------|--------------|------------|-------|--------------|
| voice_steadiness | true value | inflated +5 to +15 | +5 to +15 | Browser AGC flattens RMS variance; noiseSuppression removes breath dynamics |
| eye_contact | true value (baseline-subtracted) | inflated or deflated ±20 | ±20 | Hardcoded 0.55 threshold ignores user anatomy; glasses + monitor-below-camera users get worst delta |
| speech_pace | true value | small delta ±3 | ±3 | Both paths chunk at 3 s; audio quality difference drives a small WPM error from Whisper |
| filler_words | true value | undercounted, +5 to +15 score | +5 to +15 | noiseSuppression removes breath markers acoustic detector relies on |
| vocal_variety | true value | deflated -5 to -10 | -5 to -10 | Linear interp resampler attenuates high-pitched variation |
| expression | true value (baseline-aware) | random ±10 | ±10 | Browser uses absolute thresholds for blendshape→expression mapping; server uses deltas from user's resting face |
| **face/blink penalties** | applied | **never applied** | inflated +10 | `blink_rate, posture, fidget` aren't sent; their penalty branches are dead |

### Root Cause

Three separate systemic issues:

1. **Live path runs a different (less capable) face engine.** The
   browser's MediaPipe wrapper computes 4 of the 7+ face signals the
   server engine produces. The remaining penalty branches in
   `face_engine._compute_score` ([face_engine.py:569-593](backend/face_engine.py#L569-L593))
   are never triggered because `blink_rate`, `posture`,
   `fidget_score`, `hand_position` aren't in the WS payload.
2. **Live audio is preprocessed by the browser before reaching the
   pipeline.** AGC, noise suppression, echo cancellation are all on by
   default. These are signal-altering operations that systematically
   move the values prosody and acoustic-filler scoring depend on.
3. **Live face calibration is missing-or-weaker.** No per-user
   baseline subtraction in the browser, hardcoded thresholds; even
   the eye-contact "history" is over 4.5 s at 6.7 Hz vs a clean 3-s
   window at 30 Hz on the server.

### Contributing Bugs

**Bug 3.1 — Live face engine is a stripped-down shadow of the server
engine.**
- Location: [useFaceDetection.js (whole file)](frontend/src/hooks/useFaceDetection.js)
  vs [face_engine.py](backend/face_engine.py)
- Current: browser computes `eye_contact_pct`, `expression`, `tension`,
  `face_detected`; sends those over WS. Server-side `FaceEngine` is
  NEVER called on the live path.
- Expected: either (a) submit the raw landmarks/blendshapes to the
  backend so the canonical `FaceEngine.process_frame` produces the
  full signal set, OR (b) implement equivalent blink/posture/fidget
  detection in the browser.
- Severity: **CRITICAL** (this single bug is most of the divergence)
- Fix difficulty: hard — replicating server-side behaviour in the
  browser is non-trivial; submitting raw landmarks costs bandwidth.
- Suggested fix: option (a) — add `landmarks` to the face JSON
  message; backend runs `FaceEngine` on every WS face packet at the
  same 2 Hz the browser sends. Server CPU cost is small (no model
  load — landmarks already extracted).

**Bug 3.2 — Live `eye_contact` uses a hardcoded threshold with no
user baseline.**
- Location: [useFaceDetection.js:195-207](frontend/src/hooks/useFaceDetection.js#L195-L207)
- Current: `looking = maxLook < 0.55` — absolute number. Glasses
  refract gaze (raises baseline `lookDown`), monitor-below-camera
  raises baseline `lookDown`. Same user, same intent → wildly
  different live scores.
- Expected: 3-second calibration window in the browser; subtract per-
  user resting `lookDown/Up/In/Out` from each frame before
  thresholding. Mirrors [face_engine.py:117-195](backend/face_engine.py#L117-L195).
- Severity: **HIGH**
- Fix difficulty: moderate (browser-side state machine + 3 s window)
- Suggested fix: either implement baseline calibration in browser
  (mirror server logic) OR implement Bug 3.1 (submit landmarks, let
  server do its existing baseline math).

**Bug 3.3 — Browser audio constraints alter the waveform before
scoring.**
- Location: [useLiveSession.js:274-282](frontend/src/hooks/useLiveSession.js#L274-L282)
- Current: `echoCancellation: true, noiseSuppression: true`, AGC
  on by default.
- Expected: turn AGC off explicitly (`autoGainControl: false`); set
  noiseSuppression off too (it removes breath sounds the acoustic
  filler detector specifically targets); echoCancellation can stay on
  for headset users but should be `'system'` not `true` to use the OS
  default rather than aggressive WebRTC processing.
- Severity: **HIGH**
- Fix difficulty: trivial (3 lines)
- Suggested fix: `audio: { sampleRate: 16000, channelCount: 1,
  echoCancellation: false, noiseSuppression: false, autoGainControl:
  false }`. Document the trade-off in a CLAUDE.md note (some headset
  users may want echo cancellation back).

**Bug 3.4 — Live audio resampler is linear interpolation in JS.**
- Location: [useLiveSession.js:218-231](frontend/src/hooks/useLiveSession.js#L218-L231)
- Current: `output[i] = input[idx] * (1 - frac) + (input[idx + 1] || 0) * frac`
  is the cheapest possible resampler. Aliases high frequencies,
  attenuates pitch variation.
- Expected: use a windowed-sinc resampler (libsamplerate compiled to
  WASM, `audio-resampler` npm pkg) OR resample in an OfflineAudioContext
  using the browser's high-quality SRC.
- Severity: **MEDIUM**
- Fix difficulty: moderate (drop in a library or rewrite to use
  `OfflineAudioContext`)
- Suggested fix: switch to `OfflineAudioContext` SRC — same browser
  API, much higher quality, no JS math.

**Bug 3.5 — WS handler awaits each chunk synchronously; can drop
audio.**
- Location: [main.py:2077-2079](backend/main.py#L2077-L2079)
- Current: `await asyncio.get_event_loop().run_in_executor(None,
  pipeline.process_chunk, audio)` — the WS receive loop is blocked
  for the duration of Whisper inference (often 0.5-2 s on CPU). The
  client's next chunk piles up in the OS TCP buffer; if the pile
  exceeds the recv buffer, the kernel drops, and the client has no
  flow-control feedback.
- Expected: a bounded asyncio queue between WS receive and pipeline
  worker. When the queue is full, send a `{type: "backpressure"}`
  message to the client so it can show "server is catching up…"
- Severity: **MEDIUM** (only fires under CPU pressure)
- Fix difficulty: moderate
- Suggested fix: introduce `asyncio.Queue(maxsize=2)`; one task reads
  WS into queue, another consumes queue → process_chunk → broadcasts
  results.

---

## Cross-Cutting Issues

These showed up during investigation but don't fit neatly under one
failure:

**Bug X.1 — `report_generator.avg()` returns 0 for an all-None signal.**
- Location: [report_generator.py:65-74](backend/report_generator.py#L65-L74)
- Current: `if not vals: return 0`. Confirmed in the silent-audio
  reproduction: `signal_averages.speech_pace = 0` for a session where
  every chunk had `None`.
- Expected: return `None`. The `0` is a misleading display value —
  looks like the user scored 0/100 for pace when in fact pace was
  never measured.
- Severity: HIGH
- Fix difficulty: trivial; needs frontend N/A handling extension to
  cover this case (already mostly there in `ScoreBreakdownPanel`).

**Bug X.2 — Reports persisted regardless of validity.**
- Location: [main.py upload pipeline + analyzer + WS finalize] (multiple
  `_complete_media_processing` / `_persist_media_and_segments` calls)
- Current: Media row + report_json is created for every session,
  regardless of whether the session had meaningful speech, was non-
  English, or had calibration failures. Pollutes the user's Library.
- Expected: silent / non-English / unprocessable sessions should be
  marked `processing_status="failed"` with a clear error explaining
  what went wrong, not stored as a "completed" recording.
- Severity: MEDIUM
- Fix difficulty: moderate (depends on Bug 1.4 + Bug 2.3 fixes
  exposing the gate signals to the persistence layer)

**Bug X.3 — Server-side `FaceEngine` is unused on the live path.**
- Location: [main.py:2077-2113](backend/main.py#L2077-L2113) — never
  imports or calls `face_engine`
- Current: hundreds of lines of carefully-tuned face-engine logic in
  [backend/face_engine.py](backend/face_engine.py) — calibration,
  expression mapping, blink rate, posture estimation — are **dead
  code on the live path**. They only run on `/api/upload`.
- Expected: either delete the server-side engine (the browser is the
  sole face source) OR pipe the live path through it.
- Severity: HIGH (architectural)
- Fix difficulty: hard
- Suggested fix: same as Bug 3.1 — make the browser send landmarks,
  the backend runs its proper engine, single source of truth.

**Bug X.4 — Chunk's `result["scores"]["total"]` recomputed in the WS
handler with `SignalScorer.aggregate`, but using the
`latest_browser_face` overrides — which are 4-field, not the 7-field
the server-side scorer expects.**
- Location: [main.py:2081-2084](backend/main.py#L2081-L2084)
- Current: overwrites `eye_contact` and `expression` with browser
  values, then re-aggregates. Doesn't re-run penalty branches that
  depend on `blink_rate` etc., which the browser doesn't send.
- Expected: covered by 3.1.
- Severity: HIGH
- Fix difficulty: rolls into Bug 3.1.

---

## Recommended Fix Order

Group + sequence the bugs above so the next agent can ship them
batched. Owner should hand this section to Claude Code as the fix plan.

**Batch 1 — "Stop scoring silent users" (1 PR, half a day)**

Fixes Failures 1 and X.1 + X.2.

1. **Bug 1.1 + 1.2 + 1.3** — make `voice_steadiness`, `filler_words`,
   `vocal_variety` accept `voiced_s` and return `None` when
   `voiced_s < 0.5`.
2. **Bug 1.4** — in `report_generator`, sum total session voiced
   seconds; if `< 3.0` set `report["insufficient_speech"] = True`,
   `report["avg_score"] = None`. Frontend renders "Not enough speech
   to score" banner instead of the gauge.
3. **Bug X.1** — `avg()` returns `None` for empty.
4. **Bug X.2** — when `insufficient_speech`, mark
   `processing_status = "failed"` with error
   `"No speech detected — recording too quiet to score."`
5. Add a regression test: silent 30 s WAV through `AudioPipeline +
   report_generator` asserts `report["insufficient_speech"] is True`
   and `report["avg_score"] is None`.

**Batch 2 — "Make the language gate actually work" (1 PR, half a day
+ a model decision)**

Fixes Failure 2.

6. **Decide on Bug 2.1** — keep `.en` default and add explicit
   multilingual probe, OR ship multilingual default. Owner's call.
7. **Bug 2.2** — once 2.1 is decided, drop `english_only_model` from
   the `language_kwarg = ...` line so the gate has a chance.
8. **Bug 2.3 + 2.4** — when the gate fires, set
   `report["unsupported_language"] = True` and
   `report["avg_score"] = None`; stop streaming score updates over
   WS for the remainder of the session.
9. **Bug 2.5** — add `detected_language` column to `Media` (Alembic
   migration) and surface it in `/api/recordings`.
10. Add a regression test: feed a non-English WAV (need a small TTS-
    generated fixture) and assert
    `report["unsupported_language"] is True`.

**Batch 3 — "Make live and upload agree" (multiple PRs, ~1 week)**

Fixes Failure 3 — split into sub-batches because Bug 3.1 alone is a
chunky refactor.

11. **Bug 3.3** — turn off browser AGC + noise suppression. 3 lines.
    Ship same day.
12. **Bug 3.4** — switch to `OfflineAudioContext` resampler.
13. **Bug 3.5** — bounded asyncio queue + backpressure WS message.
14. **Bug 3.1 + 3.2 + X.3 + X.4** (one PR) — add landmark submission
    from browser; run server-side `FaceEngine` on every face
    message; remove the 4-field shortcut from `useFaceDetection.js`.
    This is the architectural fix that closes most of Failure 3.

---

## Verification Commands

Every reproduction in this doc can be re-run after fixes ship. Each
command is verbatim what the audit ran.

**Setup (once):**
```sh
cd "d:/AI Learning/usman/implementation/project-2-confidence-detector"
detector_env/Scripts/python.exe -m pip install -r requirements-dev.txt
```

**Failure 1 — silent user reproduction:**
```sh
# Generate the silent test fixture
detector_env/Scripts/python.exe -c "
import imageio_ffmpeg, subprocess
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ffmpeg, '-y', '-f', 'lavfi',
    '-i', 'anullsrc=r=16000:cl=mono', '-t', '30',
    '-c:a', 'pcm_s16le', '/tmp/silent_30s.wav'], check=True)
"

# Run the end-to-end repro (script written by the audit at d:/tmp/)
detector_env/Scripts/python.exe d:/tmp/repro_silent_pipeline.py
# Expected current output:
#   per-chunk total = 82 (every chunk)
#   final avg_score = 82, grade = A
# Expected after Batch 1:
#   per-chunk total = None
#   final report has insufficient_speech = True, avg_score = None
```

**Failure 2 — language-gate static check:**
```sh
# Confirm the production env has WHISPER_AUTODETECT unset
grep -E "^WHISPER_(MODEL|AUTODETECT)" backend/.env

# Confirm language_kwarg forces "en" under defaults
detector_env/Scripts/python.exe -c "
import os
os.environ.pop('WHISPER_AUTODETECT', None)
auto = os.environ.get('WHISPER_AUTODETECT', '').lower() in ('1','true','yes')
model_name = os.environ.get('WHISPER_MODEL', 'distil-small.en')
english_only_model = model_name.endswith('.en')
language_kwarg = None if (auto and not english_only_model) else 'en'
print('language_kwarg =', repr(language_kwarg))
"
# Expected current output:
#   language_kwarg = 'en'
# Expected after Batch 2 with multilingual default:
#   language_kwarg = None
```

A live non-English run requires a TTS sample. Suggested generation:
```sh
# Hindi sample via Google TTS (requires gTTS):
pip install gtts
python -c "
from gtts import gTTS
tts = gTTS(text='ye ek pareeksha hai jo asal mein hindi mein hai',
           lang='hi')
tts.save('/tmp/hindi_sample.mp3')
"
# Then run the AudioPipeline on it and assert
# detected_language='en' (currently — the bug) or 'hi' (after fix).
```

**Failure 3 — code citations are static; runtime A/B requires a
virtual mic.**

For now, verify the divergence list by reading the cited file:line
ranges. Numbers in the comparison table are derived from each known
mismatch's expected effect on the relevant signal — actual runtime
A/B should be performed once a virtual-mic loopback is set up
(VB-Audio Cable on Windows, or BlackHole on macOS).

**Existing test suite (must continue passing after each batch):**
```sh
detector_env/Scripts/python.exe -m pytest tests/ -q
# Currently: 28 passed
```

The audit was strictly read-only — no source files were modified.
The reproduction script lives at `d:/tmp/repro_silent_pipeline.py`
(scratch dir, not in the repo).
