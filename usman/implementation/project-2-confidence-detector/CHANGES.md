# Audit fixes — what shipped

Seven-task audit batch addressing test coverage gaps, language handling,
personalisation, progress visibility, async pipeline, signed media URLs,
and access-control test coverage. Run with:

```sh
make test                                  # full pytest suite (38 tests)
cd backend && alembic upgrade head         # apply the new migration
cd frontend && npm run build               # production frontend bundle
```

---

## Scoring-accuracy audit — Batch 4: unified face engine (architectural)

The remaining live/upload divergence — live face scores ~15-25
points off because the browser computed 4 fields (`eye_contact`,
`expression`, `tension`, `face_detected`) using its own simplified
logic while the upload pipeline ran the full server-side
`FaceEngine` with 7+ baseline-aware fields. Batch 4 makes the
backend the single source of truth.

### B4.1 — `FaceEngine.process_landmarks_from_browser`

[face_engine.py](backend/face_engine.py)

- New entry point that accepts JSON-shaped landmarks `[{x,y,z}, ...]`
  and blendshapes `[{categoryName, score}, ...]` — exactly what
  the browser MediaPipe API produces. Wraps them in tiny
  `_LandmarkShim` / `_BlendshapeShim` classes so every existing
  `_detect_expression` / `_detect_eye_contact` / `_detect_blink` /
  `_detect_tension` method works unchanged.
- Extracted the post-detection scoring body of `process_frame`
  into `_compute_signals(fl, blendshapes, pose_landmarks, w, h, ts)`
  so both upload (server-side MediaPipe) and live (browser
  MediaPipe over WS) call the same scoring code.
- `FaceEngine(load_mp_models=False)` — new flag for the live path,
  skips MediaPipe model loading entirely (~80 MB + ~1.5 s saved
  per session).

### B4.2 — Browser sends raw landmarks; backend runs FaceEngine

[useFaceDetection.js](frontend/src/hooks/useFaceDetection.js)
- New `_rawFaceRef` ref carrying the latest `{landmarks, blendshapes,
  timestamp}` from MediaPipe. Updated on every detection tick;
  exposed alongside the existing `faceScores` state object.

[useLiveSession.js](frontend/src/hooks/useLiveSession.js)
- WS face-message payload now includes `landmarks` + `blendshapes`
  + `timestamp` from the ref. Legacy 4-field `scores` block kept
  alongside as a fallback for any tab that hasn't refreshed.
- Send cadence bumped 500 ms → 150 ms (matches MediaPipe detection
  rate). Necessary for calibration: the server engine collects 90
  frames for baseline → at 150 ms that's ~13.5 s; the old 500 ms
  would have meant 45 s of "calibrating" before scoring kicked in.

[main.py session_ws](backend/main.py)
- Per-session `live_face_engine = FaceEngine(load_mp_models=False)`.
- Face messages: when `landmarks` + `blendshapes` are present,
  call `process_landmarks_from_browser`. Result drives the same
  `latest_browser_face` dict the audio chunk-level scoring code
  already consumes — full baseline-aware eye contact, blink rate,
  expression deviation, tension, and eye-contact threshold come
  through.
- Pose isn't sent (browser scope), so live `posture / fidget /
  hand_position` stay at engine defaults. Documented as a known
  follow-up — closing it requires the browser to also ship pose
  landmarks (~doubles the WS payload).

### B4.3 — Calibration state surfaced to the UI

`session_ws` sends `{"type":"calibrating"}` once when the engine
enters calibration and `{"type":"calibrated"}` once when it
finishes. `useLiveSession` exposes a new `calibrating` boolean;
`LiveSession.jsx` renders a friendly badge during the first ~13 s:
"Calibrating face baseline… expression scores will pick up in
about 10 s. Sit naturally and look at the camera."

### B4.4 — Source-of-truth shift (4-field path kept as fallback)

The in-browser eye_contact / expression / tension calculations in
`useFaceDetection.js` stay because LiveSession.jsx uses them as a
local fallback for the gauge between audio chunks (every 3 s).
The AUTHORITATIVE source is now the server-side FaceEngine via WS;
the browser's derived numbers are only seen for the brief gap
between WS face messages (150 ms) and the next audio chunk (3 s).

### B4.5 — Tests + verification

New `tests/test_face_engine_live_path.py` (8 cases):
- `_LandmarkShim` and `_BlendshapeShim` accept the browser's JSON
  shape; tolerate camelCase / snake_case / missing fields.
- `FaceEngine(load_mp_models=False)` constructs with `face_lm = None`
  and `pose_lm = None`.
- `process_landmarks_from_browser` returns `'calibrating'` for the
  first ~90 frames and transitions to a real label after both the
  baseline AND the smoothing window have filled.
- Empty input returns `None` cleanly (no crash).
- Pose-derived signals (`posture`, `fidget_score`, `hand_position`)
  stay at defaults when the browser doesn't ship pose landmarks.

All **52** tests pass (44 prior + 8 new). Frontend builds clean.

### Manual verification

After backend restart + browser hard-refresh:
1. Start a live session. Within ~150 ms a "Calibrating face
   baseline…" badge appears under the REC indicator. After ~13 s
   it disappears.
2. Network tab → WS frames: face messages now include
   `landmarks` (478 entries) + `blendshapes` (52 entries) +
   `timestamp`.
3. Same prepared video recorded via live + uploaded should now
   produce face-signal scores within ~5 points of each other (vs
   ±15-25 before this batch).

### Known follow-up (out of scope)

Pose signals (`posture`, `fidget_score`, `hand_position`) are still
upload-only because the browser doesn't ship pose landmarks over
WS. Adding them would double the WS payload (pose has 33 landmarks)
and require running MediaPipe PoseLandmarker on the server side too.
The `hand_position` badge in the live UI still works locally — it's
classified in `useFaceDetection.classifyHandPosition` from
browser-side pose detection.

---

## Scoring-accuracy audit — Batch 3: live/upload accuracy parity (HIGH-impact, low-risk fixes)

The audit's three "ship same-day" fixes that close most of the
live-vs-upload divergence without needing the bigger architectural
refactor (sending raw face landmarks). All three are scoped to the
audio + WS path; the live face engine remains a known follow-up.

### B3.1 — Browser audio constraints turned OFF

`getUserMedia` audio constraints in three call sites
(`useLiveSession.js`, `LiveAnalyzer.jsx`, `AnalyzerRecorder.js`) now
explicitly disable `echoCancellation`, `noiseSuppression`, and
`autoGainControl`. The browser's WebRTC audio stack was actively
modifying the waveform — AGC was flattening RMS variance (fake-stable
voice_steadiness), noiseSuppression was stripping breath sounds (acoustic
filler detector under-counted), and the combination made live sessions
score ~10 points higher than uploading the same audio.

**Trade-off (documented in code comments):** users on speakerphone or
in noisy rooms will get worse Whisper transcripts. Headset users in
quiet rooms get scoring parity with upload. Worth it.

### B3.2 — High-quality OfflineAudioContext resampler

Replaced the in-JS linear-interpolation resampler in
`useLiveSession.js` with `OfflineAudioContext`, which uses the
browser's built-in (high-quality, windowed-sinc) sample-rate
converter — same family as `ffmpeg -ar 16000` on the upload path.

Key restructure: the worklet message handler now pushes raw
native-rate samples into `audioBufferRef`, and `flushAudioBuffer`
batches the resample to whole 3-second chunks (~0.33 Hz call rate
on `OfflineAudioContext` instead of 100+ Hz on the linear-interp
function). Async, fire-and-forget on the worklet edge to avoid
blocking the audio thread.

`stopSession` now `await`s `flushAudioBuffer(true)` for a
deterministic close-out.

Aliasing artifacts gone → live `vocal_variety` matches upload.

### B3.3 — WS backpressure with bounded queue

`session_ws` was previously sequential: `await pipeline.process_chunk`
blocked the receive loop for the full Whisper inference duration
(0.5–2 s on CPU). Chunks piled up in the OS TCP buffer with no flow
control; on slow CPU the kernel silently dropped audio.

Refactored into producer/consumer:
- New `audio_queue: asyncio.Queue(maxsize=2)`.
- New `_audio_consumer` task pulls audio + runs `_process_one_chunk`
  (which does the same per-chunk logic that used to live inline).
- Producer (the WS receive loop) puts audio on the queue. When the
  queue is full it drops the oldest unprocessed chunk and sends
  `{"type":"backpressure"}` to the client.
- On `stop_session`: queue a `None` sentinel, await consumer drain,
  then finalize.
- On disconnect / exception: same drain pattern in `finally`, with a
  15-s timeout + cancel as a hard backstop.

Frontend (`useLiveSession.js`):
- New `backpressure` boolean state, set true on receipt of
  `{type:"backpressure"}`, auto-clears after 2.5 s.
- `LiveSession.jsx` renders a small "Server catching up… (a chunk
  was dropped — keep speaking)" indicator while the flag is true.

No state changes triggered, no re-renders beyond the indicator.

### Manual verification

After restart + hard-refresh, the same audio recorded live + uploaded
should now score within ~5 points per signal (was ±10–20). For a true
A/B you need a virtual-mic loopback (VB-Audio Cable on Windows,
BlackHole on macOS); see SCORING_ACCURACY_AUDIT.md → Failure 3 → "code
citations are static; runtime A/B requires a virtual mic." for the
loopback recipe.

### Tests + build

44/44 tests pass. Frontend builds clean.

The backpressure path doesn't have a unit test — would require mocking
the WS receive iterator + a fake slow Whisper, and the value is mostly
symmetric vs the existing `test_pipeline_regression` which exercises
the same `_process_one_chunk` body via the upload path. Manual smoke:
deliberately slow Whisper by setting `WHISPER_DEVICE=cpu`
`WHISPER_COMPUTE=float32` and running a long live session — backpressure
indicator should flash mid-session.

### Known remaining divergence (deferred — was Batch 4 in audit)

Live face signals are still computed in the browser (4 fields:
`eye_contact`, `expression`, `tension`, `face_detected`) while upload
runs the full server-side `FaceEngine` (7+ fields including blink,
posture, fidget). This single architectural gap accounts for the
remaining ~5–15 point spread on face signals. Out of scope for this
batch — the audit's Batch 4 has the design (browser sends raw
landmarks; server runs `FaceEngine.process_frame` per WS face packet).

---

## Scoring-accuracy audit — Batch 2: English-only, honest

The product is English-only. The previous "language_warning" gate was
dead code — it lived inside the `.en` Whisper model's response which
always reports `language="en"` with confidence 1.0 regardless of
input. A user speaking Hindi got a normal-looking score with no
warning. Batch 2 makes the limitation honest:

- A separate **multilingual** `tiny` whisper model (~75 MB, lazy
  download on first use) is loaded ONLY for language detection on
  the first voiced chunk. It never transcribes; the production
  transcription path stays on `distil-small.en`. ~100 ms latency,
  once per session.
- When the probe says non-English with confidence > 0.6, the session
  is **refused**, not warned. Per-chunk `unsupported_language` flows
  from `audio_pipeline → report_generator → frontend`; every layer
  short-circuits.
- New status: `Media.processing_status="failed"` with
  `processing_error="This recording doesn't appear to be in English…"`.

Backend:
- `audio_pipeline.py` — `get_language_detector()` lazy-loads the tiny
  multilingual model. `AudioPipeline.__init__` adds
  `_language_probed` + `_unsupported_language` instance state.
  `process_chunk` runs the probe on the first voiced chunk and
  emits `unsupported_language` on every result thereafter.
- `report_generator.py` — new `unsupported_language` short-circuit
  takes precedence over `insufficient_speech` (a non-English short
  clip is "fail because not English"). Removes the dead
  `language_warning` majority-vote that could never fire.
- `main.py` — WS handler sends one `{type:"language_unsupported",
  language}` message and stops broadcasting per-chunk score
  updates. Upload + analyzer pipelines short-circuit BEFORE
  `compute_sub_scores` and persist as failed. `_complete_media_processing`
  + `_persist_media_and_segments` honor both `insufficient_speech`
  and `unsupported_language` as unscoreable.

Frontend:
- `useLiveSession.js` — replaces `languageWarning` state +
  `language_warning` handler with `unsupportedLanguage` +
  `language_unsupported` handler.
- `LiveSession.jsx` + `LiveAnalyzer.jsx` — render a clear red banner
  ("We detected `<language>`. The app currently supports English
  only. Stop and try again in English.") when the gate fires.
- `SessionReport.jsx` + `Result.jsx` (UploadResult) — short-circuit
  on `unsupported_language` (the existing Batch 1 explainer card
  with `status_message` does the rendering).
- `SignalBars.jsx` + SessionReport's `ReportSignalBars` — drop the
  `languageWarning` prop and `SPEECH_KEYS` skip-set; per-signal `null`
  handling from Batch 1 already covers everything.

New env var (optional):
- `WHISPER_LANG_DETECTOR_MODEL` — defaults to `tiny`. Override only
  if you want a different multilingual model for the probe.

New model download:
- `~75 MB` for `tiny` multilingual whisper, fetched once on first
  language probe. Cached under faster-whisper's default location
  (e.g. `~/.cache/huggingface/hub`).

Tests:
- New `tests/test_unsupported_language.py` (6 cases): short-circuit
  fires on non-English snapshots, takes precedence over
  insufficient_speech, late-start sessions still detect, English
  sessions are not flagged, audio_pipeline emits the field on every
  result, `reset()` clears the language state.
- All 44 tests pass (28 prior + 10 silent + 6 unsupported).

Manual verification (requires non-English audio sample, e.g. via
gTTS — see SCORING_ACCURACY_AUDIT.md for the recipe):
1. Upload a Hindi/Spanish/Arabic clip → result page shows the
   "doesn't appear to be in English" card. Library row marked Failed.
2. Live session in non-English → red banner appears within ~3 s of
   speaking; gauge stops updating.
3. Silent recording → still hits the insufficient_speech path
   (Batch 1) instead of the unsupported one (probe doesn't run on
   silence).

---

## Scoring-accuracy audit — Batch 1: stop scoring silent users

Critical fix from `SCORING_ACCURACY_AUDIT.md`. Pre-fix reproduction
(silent 30-s WAV through the pipeline) produced **avg_score = 82,
grade A**. After the fix the same input returns
`avg_score = None, grade = None, insufficient_speech = True`.

Backend:
- `signal_scorer.py` — `voice_steadiness`, `filler_words`, and
  `vocal_variety` now accept (and gate on) `voiced_s`. When
  `voiced_s < 0.5` they return `None` instead of fake numbers
  (the old `rate==0 → 100` shortcut for filler_words was the
  silent-speaker bug).
- `audio_pipeline.process_chunk` — passes `voiced_s` into all three
  newly-gated scorers.
- `report_generator.py` — `avg()` returns `None` for empty / all-None
  inputs (was 0, displayed as "0/100"). Added a session-level
  `insufficient_speech` gate: if total voiced seconds < 3.0, return
  a short-circuited report with `avg_score = None, grade = None,
  signal_averages = {all None}, status_message = "Not enough speech
  to score…"`. All downstream insight / action / dip-detection logic
  is now None-safe.
- `main.py` — upload pipeline mirrors the same `total_voiced_s < 3`
  gate (it doesn't go through `report_generator`). Both
  `_complete_media_processing` and `_persist_media_and_segments`
  read `report_json.insufficient_speech` and persist the row as
  `processing_status = "failed"` with the `status_message` as the
  error text — so the user sees WHY in their library instead of
  navigating to a fake report.

Frontend:
- `SessionReport.jsx` and `Result.jsx` (UploadResult) — both render a
  centered "We couldn't score this recording" card with the
  `status_message` and a Try Again link when `insufficient_speech`
  fires (or `avg_score` is null). Replaces the gauge + signal bars
  entirely; nothing misleading shown.

Tests:
- New `tests/test_silent_session.py` with 10 cases: per-signal `None`
  gates, full-pipeline silent-session short-circuit, voiced-session
  pass-through, `avg()` returns `None` semantics. The existing
  regression test (`test_pipeline_regression.py`) and
  sharing/comments/scoring-fix suites all still pass — 38/38 green.

Manual verification:
```sh
ffmpeg -y -f lavfi -i anullsrc=r=16000:cl=mono -t 30 \
  -c:a pcm_s16le /tmp/silent_30s.wav
detector_env/Scripts/python.exe d:/tmp/repro_silent_pipeline.py
# Expected: every chunk's audio signals = None;
#           final report avg_score = None, grade = None,
#           insufficient_speech = True.
```

---

## Task 1 — Pipeline regression test

**What:** A baseline-driven test that pins the audio pipeline's signal
outputs against a fixture WAV (30 s extracted from a known recording).

- `tests/conftest.py` — adds backend/ to `sys.path`, sets
  `WHISPER_AUTODETECT=1`, `KMP_DUPLICATE_LIB_OK=TRUE`.
- `tests/fixtures/sample_30s.wav` — 16 kHz mono PCM, 960 KB.
- `tests/fixtures/sample_30s_baseline.json` — expected scores per signal.
- `tests/test_pipeline_regression.py` — compares
  `voice_steadiness / speech_pace / filler_words / vocal_variety` against
  the baseline with ±5 tolerance. First run with `BOOTSTRAP_BASELINE=1`
  writes the baseline JSON.
- `requirements-dev.txt`, `Makefile` (`make test`, `make install-dev`).

**Why:** Without this, the next refactor of `AudioPipeline` could shift
scores by 20+ points and pass code review unnoticed.

---

## Task 2 — Whisper language detection gate

**What:** When the model autodetects a non-English language with high
confidence over the first two chunks, the WS sends a one-shot
`{type:"language_warning", detected:"<code>"}` and the UI shows a
yellow banner ("Confidence scoring currently supports English only;
results may be inaccurate.").

- `backend/audio_pipeline.py` — `process_chunk` returns
  `detected_language` + `language_confidence`.
- `backend/main.py` (session_ws) — language-gate state machine
  (`_lang_chunks_seen`, `_lang_non_en_count`, sends warning once at
  threshold).
- `frontend/src/utils/language.js` — `languageDisplayName(code)` via
  `Intl.DisplayNames`.
- `frontend/src/hooks/useLiveSession.js` — exposes `languageWarning`.
- `frontend/src/pages/LiveSession.jsx` + `LiveAnalyzer.jsx` — banner.

**Why:** Whisper transcribes any language but the rest of the scoring
pipeline (filler-word lexicon, hedge phrases, pace bands) only makes
sense for English. We warn rather than block so a Spanish-speaking user
who wants raw timing data can still see it.

---

## Task 3 — Per-user baseline subtraction

**What:** Every report now includes `signal_baseline_adjusted` — z-scored
against the calling user's last 5 finished sessions (anchored at 50,
clamped 0–100, std floored at 1.0). When the user has < 3 prior
sessions, the field is omitted and a `baseline_note` explains why.

- `backend/main.py` — `_fetch_user_baseline(user_id, exclude_media_id)`
  reads from `Media.report_json IS NOT NULL` rows.
- `backend/report_generator.py` — `generate_post_session_report()` now
  accepts `user_baseline` and emits the adjusted block + note.
- Threaded into both finalize sites: WS session_ws and
  `_run_analyzer_pipeline_sync`.

**Why:** A 65 in voice_steadiness means very different things for
different speakers. The adjusted score answers "are *you* improving?"
rather than "where are you against an absolute scale?". Additive
field — the original `signal_averages` is untouched, so any client
that ignores `signal_baseline_adjusted` keeps working.

---

## Task 4 — Session comparison view

**What:** New `GET /api/progress?topic=&limit=` endpoint returns a
chronological list of finished sessions with `score_avg` + per-signal
averages. Frontend renders a sparkline + delta pill ("+4 since last
session") via a single component reused on Home and SessionReport.

- `backend/main.py` — `/api/progress` handler, owner-scoped, optional
  topic filter.
- `frontend/src/components/ProgressChart.jsx` — inline SVG sparkline,
  delta pill (green/red/grey), hollow ring marker for the current
  session, "no past sessions" placeholder.
- `frontend/src/pages/Home.jsx` — compact "Last 5 sessions" strip.
- `frontend/src/components/SessionReport.jsx` — full card scoped to
  this session's topic when set.

**Why:** Practising users want to see whether they're improving without
clicking through ten reports. The sparkline plus the explicit "+/-N
since last session" answers the question at a glance.

---

## Task 5 — Async upload pipeline

**What:** `/api/upload` and `/api/analyze-audio` used to do all 30–120 s
of ffmpeg + face + speech work inline on the FastAPI event loop,
blocking the worker. They now return `202 + {media_id, status:"pending"}`
immediately and run the heavy work in a `BackgroundTasks` job; the
client polls `GET /api/media/{id}/status` until the row flips to
`completed` (or `failed` with an error string).

- New migration `b3f7a8c2e591_add_media_processing_status` —
  `processing_status` (default `'completed'` for back-compat with
  legacy rows) + `processing_error` text column + index.
- `backend/models/media.py` — adds the columns.
- `backend/main.py`:
  - `_create_pending_media_row` — pre-insert in `pending` state.
  - `_set_media_status` — advance through `pending → processing →
    completed/failed`.
  - `_complete_media_processing` — fills in produced fields + writes
    segments + flips to `completed`.
  - `_run_upload_pipeline_sync` / `_run_analyzer_pipeline_sync` —
    BackgroundTask bodies. Wrap-all `try/except` flips to `failed`
    with `str(e)` on any uncaught exception.
  - `GET /api/media/{id}/status` endpoint, owner-or-shared scoped.
- `frontend/src/utils/mediaStatus.js` — `pollMediaStatus(media_id)`
  with backoff (1.2 s × 6, then 3 s; 12-min hard cap).
- `frontend/src/pages/Upload.jsx` + `Analyzer.jsx` — poll + render
  per-status text + show the server-supplied error on `failed`.

**Why:** Before this, a single in-flight upload pinned the worker for
the full processing duration. Health checks, other API calls, and
even cancel attempts all queued behind it. Now the heavy work happens
off-loop and the user sees a live status string instead of a frozen
spinner of unknown length.

---

## Task 6 — HMAC-signed media URLs

**What:** Replaced `?token=<JWT>` on media URLs (a 30-day capability
that ended up in browser history, server access logs, and pasted into
chat) with `?sig=<hmac>&exp=<unix>&uid=<id>`. The HMAC binds path +
uid + exp so a sig issued for one path/user can't be replayed against
another. Default TTL = 1 h.

- `backend/signed_urls.py` — `sign_media_url(path, user_id, ttl=3600)`
  + `verify_media_signature(path, sig, exp, uid)`.
- `backend/auth.py` — `get_current_user_for_media` now accepts
  `Authorization: Bearer …` (cURL/desktop) OR `?sig=&exp=&uid=`
  (browser media tags). `?token=<JWT>` no longer accepted on media
  endpoints (WebSocket auth still uses it — different threat model).
- `backend/main.py` + `backend/session_recorder.py` — every emission
  site for `video_url` / `audio_url` (live finalize, analyzer finalize,
  session upload-video/audio, recordings list, report endpoint) wraps
  the path through `sign_media_url(path, user_id)`. The report
  endpoint re-signs in-place because URLs stored in `report_json` are
  signed at write time and may be expired or owner-bound when a
  recipient opens the report.
- `backend/log_config.py` — JsonFormatter scrubs `?sig=`, `?token=`,
  `?uid=` query params via regex on every emitted message + `extra`
  string + traceback. Prevents capability leak via uvicorn.access.
- `frontend/src/config.js` — `mediaUrl()` is now a thin
  path-to-absolute-URL prepender (no more JWT munging).

**New env var:** `MEDIA_URL_SECRET` — random 32+ byte string. Falls
back to `JWT_SECRET` with a one-time WARNING log line if unset, so
operators can defer the rotation but get nudged.

---

## Task 7 — Sharing + comments tests

**What:** `tests/test_sharing_and_comments.py` — 17 cases against
real `app` via `TestClient`, with a `world` fixture that creates an
owner + recipient + outsider + a Media row and cleans up via FK
cascade.

Coverage:
- Owner can share / can revoke / can't share with self / can't share
  with unknown email (404).
- Non-owner can't share. Recipient can't reshare.
- Recipient sees the media in `/api/recordings`.
- Recipient can read the report (after share); outsider gets 404
  (not 403 — un-enumerable id design).
- Owner / recipient / outsider posting comments (recipient only after
  share; outsider always 404).
- Author-only edit; media-owner can delete any comment for moderation.
- Ranged-comment validation (`t_end_s` requires `t_s`; `t_end_s` must
  be > `t_s`).
- Deleting media cascades comments.
- Comment list visible to recipient.

`limiter.enabled = False` at test-module load disables slowapi rate
caps for the suite (production unaffected — only mutates the in-process
limiter the TestClient is talking to).

---

## Manual verification checklist

Before deploying, exercise these in a browser:

1. **Live session** with WHISPER_AUTODETECT=1 and a non-English clip
   → yellow language banner appears within ~6 s.
2. **Upload a video** → page shows "Uploading…" then "Analyzing…",
   then redirects to `/result/:id`. Open browser DevTools → Network
   tab and confirm the polled URL is `/api/media/{id}/status` and
   the row reaches `completed` before redirect.
3. **Report page** → "Your progress" card appears with a sparkline.
   The dot for THIS session shows as a hollow ring. Delta pill
   reflects the score vs the previous session.
4. **Home page** → "Last 5 sessions" strip renders below the mode
   cards. Click "See all →" lands on /library.
5. **Right-click the saved video → Copy URL**. The URL contains
   `?sig=&exp=&uid=`. Open in a new tab while logged in → plays.
   Wait > 1 hour and try again → 401 (URL expired).
6. **Owner shares with another account** → recipient sees the
   recording in their library; can comment; cannot share or delete.
7. **`make test`** → all 18 tests pass.

---

## Files touched (summary)

Backend:
- `backend/audio_pipeline.py` — language fields in chunk output.
- `backend/auth.py` — signed-URL auth path on media endpoint.
- `backend/log_config.py` — secret-query redaction.
- `backend/main.py` — async pipeline split, `/api/progress`,
  `/api/media/{id}/status`, signed URLs threaded through emission
  sites, language-warning state machine, baseline helper, report
  endpoint re-signs URLs for caller.
- `backend/models/media.py` — `processing_status`, `processing_error`.
- `backend/report_generator.py` — `user_baseline` parameter +
  `signal_baseline_adjusted` block.
- `backend/session_recorder.py` — signs URLs in recordings list.
- `backend/signed_urls.py` — new.
- `backend/migrations/versions/b3f7a8c2e591_add_media_processing_status.py` — new.

Frontend:
- `frontend/src/components/ProgressChart.jsx` — new.
- `frontend/src/components/SessionReport.jsx` — Your Progress card.
- `frontend/src/config.js` — drops JWT-in-URL.
- `frontend/src/hooks/useLiveSession.js` — `languageWarning`.
- `frontend/src/pages/Home.jsx` — Last 5 sessions strip.
- `frontend/src/pages/LiveAnalyzer.jsx` + `LiveSession.jsx` — language
  banner.
- `frontend/src/pages/Upload.jsx` + `Analyzer.jsx` — poll status.
- `frontend/src/utils/language.js` — new.
- `frontend/src/utils/mediaStatus.js` — new.

Tests:
- `tests/conftest.py`, `tests/test_pipeline_regression.py`,
  `tests/fixtures/sample_30s.wav`,
  `tests/fixtures/sample_30s_baseline.json` — Task 1.
- `tests/test_sharing_and_comments.py` — Task 7.
- `requirements-dev.txt`, `Makefile` — supporting infra.
