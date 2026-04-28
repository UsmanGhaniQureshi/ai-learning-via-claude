# Technical Audit — Project-2 (Confidence Detector)

> Date: 2026-04-27 · Commit: `5d7eece` · Branch: `learn/usman`
> Scope: `usman/implementation/project-2-confidence-detector/` (referred to throughout as `project-2`).
> Method: code-review-graph MCP (architecture / flows) + parallel Explore agents on backend, frontend, and cross-cutting concerns. All paths and line numbers cited from current head.

---

## 1. Stack & Architecture

**Frontend**
- React **19.2.4**, Vite **8.0.4**, JS only (no TypeScript).
- State: pure `useState` + Context API (`src/auth/AuthContext.jsx`). No Redux/Zustand/Jotai.
- Routing: `react-router-dom` **v7.14.2**, URL-based, protected routes via `<RequireAuth>` (`src/App.jsx:79-106`).
- Browser ML: `@mediapipe/tasks-vision 0.10.21` (face + pose, GPU delegate, runs on the main thread).
- Target platforms: modern browsers (Vite default, no `browserslist` config). Web only.

**Backend**
- FastAPI on Uvicorn, single `main.py` (~2 668 lines, 29 endpoints).
- Python ≥3.10 (`README.md:24`). Started via `python main.py` → port 8000 (`main.py:212`).
- ORM: **SQLAlchemy 2.0** + **psycopg3** + **Alembic** migrations (`backend/db.py`, `backend/migrations/`).
- Auth: **bcrypt + JWT** (`backend/auth.py`), 30-day TTL.
- Rate limiting: `slowapi`, default 120/min/IP, 10/hr on uploads, 20/hr on login.
- Logging: structured JSON (`backend/log_config.py`).
- Models pre-loaded at startup; `/health` only flips ready=true once models loaded **and** DB reachable.

**ML / Inference (all local, no cloud APIs)**
- ASR: **faster-whisper** `distil-small.en` default; env-overridable to `tiny.en/base.en/small.en/medium/large-v3` (`audio_pipeline.py:73`).
- VAD: **Silero VAD** via `torch.hub` (`audio_pipeline.py:17-32`).
- Pitch: **librosa PYIN** (`audio_pipeline.py:200-240`).
- Face/pose: **MediaPipe Tasks** — `face_landmarker.task` (3.6 MB, 52 blendshapes) + `pose_landmarker.task` (5.6 MB, 33 landmarks). Backend uses Python bindings (`backend/face_engine.py`); frontend uses `@mediapipe/tasks-vision` for the **live** path.
- GPU: optional via `WHISPER_DEVICE=cuda` and `torch.cuda.is_available()` check (`audio_pipeline.py:81`). Default CPU/int8.

**Data Stores**
- **PostgreSQL** (single instance). Tables: `users`, `media`, `media_segments`, `comments`. Schema covers metadata, JSONB report cache, JSONB tags + shared_with arrays, FK cascades. Pool: size 20, overflow 20, recycle 1 800 s (`db.py`).
- **Filesystem blob storage**: `backend/uploads/`, `backend/recordings/`. No S3/GCS.
- **No Redis / cache layer.**

**Realtime layer**
- **WebSocket** at `/ws/session/{session_id}` for live practice (binary audio + JSON face frames + JSON control).
- **HTTP fallback** at `GET /api/report/{session_id}` if the socket dies before the report arrives (`useLiveSession.js:172-185`).
- No WebRTC, no SSE, no polling.

---

## 2. Multimodal Pipelines

**Voice / Audio.** Browser captures via `getUserMedia({audio: true, ...})` then routes through an `AudioWorkletNode` (`/audioProcessor.worklet.js`) that resamples to **16 kHz mono Float32 PCM**. Chunks of ~3 s are sent as binary WebSocket frames to the backend. Backend runs Silero VAD to discard silent windows (`audio_pipeline.py:17-32`); voiced audio with ≥0.8 s of speech and RMS > 0.012 is fed to faster-whisper (`audio_pipeline.py:384`). Whisper output passes through a hallucination blacklist (`thank you, subscribe, music, [music], applause` etc., `audio_pipeline.py:119-141`). Prosody features extracted: **pitch** (mean Hz, std Hz, range, tremor via 4-12 Hz Butterworth), **RMS energy** (per-frame, std → voice steadiness), **WPM** (words / voiced_s × 60), **pauses** (VAD gaps > 2 s flagged in report). **No jitter/shimmer** computed (PYIN-only). Filler detection is **dual**: lexical regex on the transcript (`um, uh, erm, ah, er, uhm, hmm, mm, like, you know, i mean`) **plus** an acoustic detector (`detect_filler_sounds_acoustic`, `audio_pipeline.py:150-196`) that finds voiced segments with low spectral centroid and moderate RMS, catching `ahh`/`umm` Whisper drops. Libraries: `faster-whisper`, `silero-vad`, `librosa`, `scipy`, `numpy`, `torch`.

**Face.** Two paths run the *same* MediaPipe models in different runtimes:
- **Live path** — `useFaceDetection.js` runs MediaPipe in the browser at ~6-7 Hz (`setInterval` ~150 ms); returns `eye_contact, expression, tension, face_detected, hand_position`. Sent to backend every 500 ms as JSON.
- **Upload path** — `backend/face_engine.py` runs MediaPipe in Python on every decoded frame.

Per-user **baseline calibration** is done over the first 90 frames (~3 s @ 30 fps) and all 7 expression classes (happy/speaking/focused/neutral/calibrating/surprised/sad/angry) are detected as **deviations** from the user's baseline blendshapes (`face_engine.py:122-194`). Eye contact derives from `eyeLookDown/Up/In/Out` blendshapes against baseline, threshold 0.40, 30-frame rolling average. Blink rate computed via `eyeBlinkLeft/Right` 0.3→0.5 transitions, 60 s rolling window. **No head-pose yaw/pitch/roll** (would need 3D landmark regression — MediaPipe only gives 2D blendshapes).

**Gesture / Body.** Pose comes from `pose_landmarker.task`. Posture from shoulders+hips: **shoulder tilt** (>0.30 rad → tilted), **slouching** (torso/shoulder ratio < 1.1). Returns `posture ∈ {upright, tilted, slouching, unknown}`. **Fidgeting** = jerk-detection over 10 frames on shoulder positions only (wrist deliberately excluded so hand-gesturing isn't penalised, `face_engine.py:372-378`); fidget_score 0-100. **Hand position** is detected (`gesturing/mid-level/low/not visible`) and shown as a UI badge (`LiveSession.jsx:198-207`) but **not scored** into the aggregate. No actual hand-gesture *classification* (no thumbs-up vs pointing); just position class.

**Fusion / Scoring.** Pure **rule-based weighted average**, no learned fusion (`scoring_engine.py:14-20`):

```
total = voice_steadiness × 0.24
      + eye_contact      × 0.24
      + speech_pace      × 0.20
      + filler_words     × 0.20
      + vocal_variety    × 0.12      (sum = 1.00)
```

Expression class score is computed and shown but **deliberately excluded** from the aggregate (its old 0.08 weight was redistributed). Range 0-100. Smoothing: rolling deque of 4 entries (~2 s at 500 ms updates). Grading band A+/A/B/C/D/F mapped from `score_avg` (`report_generator.py`). **No calibration** against ground-truth labels — the weights and per-signal score curves are author-set; `PRODUCTION_AUDIT.md:39-57` explicitly flags every threshold as "guessed".

---

## 3. Data Flow — One Live Session

1. **User clicks Start** on `/live` (`LiveSession.jsx`). PracticeSetup writes topic + duration into `localStorage`.
2. `useLiveSession` issues `getUserMedia` (video 640×480, audio 16 kHz mono with echo-cancel + noise-suppress).
3. Browser opens `WebSocket(wsUrl + ?token=<JWT>)`; backend validates JWT in the upgrade handler, returns 4401 on failure.
4. Frontend starts `MediaRecorder` (for the WebM video blob, kept locally) and an `AudioWorkletNode` that resamples mic to 16 kHz Float32.
5. **Async loop, 3 channels**:
   - Audio worklet → buffers ~200 ms — when full 3 s collected, sent as **binary** WS frame.
   - `useFaceDetection` runs MediaPipe at ~6-7 Hz, every 500 ms sends JSON `{type: "face", scores: {...}}`.
   - User can hit Stop → JSON `{type: "stop_session"}`.
6. **Backend WS handler** (`main.py /ws/session/{session_id}`):
   - On binary: `SessionAudioRecorder` (background thread) writes raw PCM → `recordings/{session_id}_audio.wav` (lock-protected, never blocks the loop).
   - Same chunk passes to `AudioPipeline.process_chunk` → `{transcript_words, raw, scores}` → `ScoringEngine.update` → JSON pushed back to client.
   - On JSON face: scores merged with audio scores; client side renders gauge + signal bars at next render.
7. **Stop** → `report_generator.generate_post_session_report` aggregates every snapshot into `report_json` (timeline, transcript, fillers, pace, peaks, action_items). Inserted as new `media` row + N `media_segments` rows in one transaction.
8. **Video blob** uploaded separately via `POST /api/session/upload-video` (multipart, 500 MB cap).
9. Frontend either receives `{type: "session_ended", report: {...}}` over WS, **or** falls back to `GET /api/report/{session_id}` after 15 s.
10. Navigate to `/result/:id`; `Result.jsx` renders `SessionReport` + `PlaybackReview` (video synced with timelines) + `CommentsThread`.

**Sync vs async.** Audio analysis and DB writes are async (FastAPI await). The WAV writer runs on a separate thread. Whisper inference is the dominant latency, ~0.8-1.5 s per 3 s chunk on CPU/int8 — **always lags real time** by one chunk, which is the visible UX limit.

**Where latency lives.** (a) Whisper CPU inference. (b) MediaPipe in the browser main thread (~30-60 ms/frame at 480p). (c) Upload path's video re-encode through ffmpeg.

---

## 4. APIs & Endpoints

| Method | Path | Purpose | Auth | Rough payload |
|---|---|---|---|---|
| POST | `/api/auth/register` | Signup | none | <1 KB; 10/hr |
| POST | `/api/auth/login` | JWT issue | none | <1 KB; 20/hr |
| GET | `/api/auth/me` | Current user | JWT | tiny |
| GET | `/api/prompts` | Practice topic library | JWT | ~5 KB |
| POST | `/api/upload` | Video file analysis | JWT | up to 500 MB; 10/hr |
| POST | `/api/analyze-audio` | Audio file analysis | JWT | up to 500 MB; 10/hr |
| POST | `/api/session/upload-video` | Save live-session video blob | JWT | up to 500 MB |
| POST | `/api/session/upload-audio` | Save analyzer live audio | JWT | <50 MB |
| WS | `/ws/session/{session_id}` | Live practice channel | JWT (`?token=`) | binary audio frames + JSON ctrl |
| GET | `/api/recordings` | Library list w/ filters + sort + pagination | JWT | <100 KB; cap 200 |
| GET | `/api/recordings/{id}/video` | Stream live-session video (Range) | JWT | up to 500 MB |
| GET | `/api/recordings/{id}/audio` | Stream live-session audio | JWT | <50 MB |
| GET | `/api/video/{filename}` | Processed upload MP4 | JWT (`?token=`) | up to 500 MB |
| GET | `/api/analyzer/{media_id}/audio` | Analyzer audio playback | JWT (`?token=`) | <50 MB |
| GET | `/api/report/{session_id}` | Full report JSON | JWT | ~50 KB |
| GET | `/api/report/{session_id}/csv` | CSV export of timelines | JWT | small |
| PATCH | `/api/media/{id}` | Edit title/topic/tags | JWT (owner) | <1 KB |
| POST | `/api/media/{id}/discard` | Soft-delete | JWT (owner) | nil |
| POST | `/api/media/{id}/trim` | Async re-encode + re-segment | JWT (owner) | small |
| DELETE | `/api/media/{id}` | Hard-delete + cleanup | JWT (owner) | nil |
| GET | `/api/media/{id}/shares` | List share recipients | JWT (owner) | tiny |
| POST | `/api/media/{id}/share` | Add recipient | JWT (owner) | tiny |
| DELETE | `/api/media/{id}/share/{recipient_id}` | Remove recipient | JWT (owner) | tiny |
| GET | `/api/media/{id}/comments` | Threaded comments (range filter) | JWT | <50 KB |
| POST | `/api/media/{id}/comments` | New comment | JWT | <1 KB |
| PATCH | `/api/comments/{id}` | Edit comment | JWT (author) | <1 KB |
| DELETE | `/api/comments/{id}` | Delete comment | JWT (author) | nil |
| GET | `/` | API status | none | tiny |
| GET | `/health` | Readiness probe | none | tiny |

---

## 5. Storage & Privacy

**What is persisted.** Audio (`{session_id}_audio.wav`), video (`.webm` for live, `.mp4` for processed uploads), evidence frames (JPEGs from upload-path face analysis), full transcripts, per-signal scores (rolling timeline), JSONB `report_json` cache, sharing graph, comments. **No embeddings stored.**

**For how long.** Indefinitely. There is **no TTL, no scheduled cleanup, no archival tier**. Only user-initiated DELETE removes data (`/api/media/{id}` deletes both DB rows and on-disk artifacts).

**PII to third parties.** None. No outbound LLM/ASR/analytics calls in the codebase as of `5d7eece`. Audio and transcripts stay on the host. `IMPLEMENTATION_PLAN.md:79-95` describes a future "Engine 4: Claude API" path but it's unimplemented.

**Encryption.**
- **At rest:** none. Files on disk are plaintext WAV/WebM/MP4. PostgreSQL is plain — no `pgcrypto`, no column encryption.
- **In transit:** depends entirely on the operator. Frontend defaults to `http://localhost:8000` and `ws://`; production HTTPS/WSS is opt-in via `VITE_API_URL=https://...`. **No automatic upgrade or HSTS.**

**Auth-bearing media URLs.** Because `<video>`/`<audio>` tags can't set custom headers, media is fetched with `?token=<JWT>` in the query string (`config.js:99-108`). This means **JWTs leak into server access logs** unless logs are sanitised — not currently sanitised in `log_config.py`.

---

## 6. Auth, Users, Sessions

- Provider: in-house. **bcrypt** (12 rounds) for passwords (`auth.py:45-57`), **PyJWT** for tokens (`auth.py`, 30-day TTL, env `JWT_TTL_DAYS`).
- Default secret: `"dev-only-please-set-JWT_SECRET-in-production"` (`auth.py:37`); startup logs a loud warning if used.
- Storage: localStorage as `cd_jwt_token` (`config.js:29`). Vulnerable to XSS — no httpOnly cookie path.
- Roles: none. Implicit roles are *owner* (created the media), *recipient* (in `shared_with`), *commenter* (can edit own comments only).
- WebSocket auth: `?token=` query string, validated in upgrade handler; 4401 close code on failure.
- Rate limiting: `slowapi`, IP-keyed. Per-endpoint overrides on signup (10/hr), login (20/hr), upload (10/hr).
- CORS: env-driven allowlist; defaults to `http://localhost:5173,3000` and `127.0.0.1:5173`. Wildcard supported but logs a warning (`main.py:231-242`).
- Account lifecycle: register/login/me only. **No account deletion endpoint, no data-export endpoint, no password-reset, no email verification.**

---

## 7. Frontend UX Flows

**Public:** `/login`, `/register`.
**Authed (everything else):**

- `/` — `Home.jsx`, four mode cards: Live Practice, Analyze Recording (upload), Speech Analyzer, Library.
- `/live` — `LiveSession.jsx`: `PracticeSetup` (topic picker + duration slider, fed by `GET /api/prompts`) → `CountdownOverlay` (3-2-1) → active session (live `ScoreGauge` + `SignalBars` + `TranscriptView` + gesture badge + face-detection indicator + `PracticeTimer`) → on stop, navigates to `/result/:id`.
- `/upload` — `Upload.jsx`: drop video → POST → `/result/:id`.
- `/analyzer` — `Analyzer.jsx`: dual-mode (file upload OR `LiveAnalyzer` mic-only flow) → `/result/:id`.
- `/library` — `History.jsx`: paginated, filterable list of past media.
- `/result/:id` — `Result.jsx`: branches on `kind` (live / analyzer_audio / upload). Shows `SessionReport`, `PlaybackReview` (synced video) **or** `AudioPlaybackReview`, `CommentsThread` (with seek-on-click), `MetadataEditor` (title/topic/tags), `TrimPanel`, `ShareModal`. Owner-only actions: trim, discard, delete, share.
- `/how-it-works` — `HowItWorks.jsx` (currently behind RequireAuth — annotated as a design choice in `App.jsx:83-85`).

**Real-time visualisations during a live session.** `ScoreGauge` (animated SVG, red/amber/green), `SignalBars` (6 bars), live `TranscriptView` appended per chunk, video preview, gesture badge ("Hands gesturing" / "mid" / "low" / "not visible"), face-detection presence indicator. **No waveform display, no face-mesh overlay** (the mesh is computed but not drawn).

---

## 8. Performance Profile

- **Capture → first score:** ~1-2 s on CPU/int8 (one Whisper chunk + one VAD gate + scoring). On `cuda + float16` configs, ~300-500 ms.
- **Per chunk thereafter:** ~0.8-1.5 s on CPU/int8. The pipeline is **always one chunk behind real time** — this is structural, not a bug.
- **End-to-end report:** generated synchronously on stop, ~200-500 ms for typical 3-5 min sessions (in-memory aggregation).
- **Client memory:** MediaPipe at ~150-300 MB browser RAM. The live-video MediaRecorder blob accumulates in memory until upload — **a 30 min session = ~1-2 GB blob** (no chunked-upload). Not addressed.
- **Server memory:** faster-whisper distil-small.en ~250-400 MB resident. PYIN/Silero negligible. **Long uploads load whole file into RAM** before streaming — `PRODUCTION_AUDIT.md:59-62` flags this; large uploads can OOM the worker.
- **CPU:** Whisper is the main consumer; one CPU per concurrent session under default settings.
- **Known bottlenecks (per `PRODUCTION_AUDIT.md`):**
  - `upload_video` blocks the event loop (sync work in an async handler).
  - Frontend uses **deprecated `ScriptProcessorNode`** in some paths (Web Audio's old API; should be `AudioWorkletNode`).
  - Rolling 5-second average lags the visible meter.
  - `/api/recordings` has **no DB index** on the columns used in WHERE/ORDER BY (filtering at scale will tank).
  - 8-char `upload_id` (32-bit-ish entropy) — **collision risk** at high volume.

---

## 9. Tests & CI

- **Unit tests: 0.** No `pytest`, `unittest`, `vitest`, or `jest` files anywhere.
- **Integration tests: 0.**
- **ML eval:** **no labelled dataset, no held-out test set, no human-agreement study.** Explicitly acknowledged in `PRODUCTION_AUDIT.md:120`.
- **CI/CD:** **no `.github/workflows/`, no `azure-pipelines.yml`, no `Dockerfile`, no `Makefile`.** Frontend has only ESLint as a quality gate (`package.json:9`).
- **Scorer validation:** none. Weights and thresholds are author-picked; `HOW_IT_WORKS.md` honestly labels their reliability LOW.

---

## 10. Known Issues / TODOs / Tech Debt

Pulled from `PRODUCTION_AUDIT.md`, code comments, and Explore findings. **No `TODO/FIXME/XXX/HACK` markers in source** — all known issues live in the audit doc.

**Critical**
1. Long video upload blocks the FastAPI event loop (`main.py` upload path is sync inside an async handler) — denies other requests on the worker.
2. JWT delivered via `?token=` query string for media URLs → leaks into server access logs (logs not sanitised).
3. `JWT_SECRET` and `DB` defaults are dev-only with loud warnings — relies on operator discipline.
4. Whisper is **English-only** (`distil-small.en`) but the UI doesn't gate by language — non-English speech silently produces garbage transcripts and degrades all downstream scores.
5. Multi-user logic (sharing, comments) shipped 2026-04-27; **no tests, no stress runs**.

**High**
6. Confidence weights and per-signal score curves are hand-picked; no validation. Scoring is **not appropriate for hiring/clinical use** — the README and PRODUCTION_AUDIT both say so.
7. Acoustic filler thresholds, eye-contact 0.40 threshold, expression deviation thresholds — all unvalidated magic numbers.
8. Pitch CV "sweet spot" arbitrary (no human-rated dataset).
9. Whole-file load into RAM on upload → OOM risk on large videos.
10. Rolling 5 s smoothing produces a perceptibly laggy meter.

**Medium**
11. `ScriptProcessorNode` (deprecated) used in some Web Audio paths.
12. Base64 thumbnails inflate response payloads.
13. No pagination/index strategy on `/api/recordings` filter columns.
14. WebSocket disconnect detection on the client is **fallback-only** — no auto-reconnect; user has to refresh.
15. 8-char `upload_id` collision risk at scale.
16. No account-deletion or data-export endpoints (GDPR/CCPA gap).
17. `HowItWorks` is gated behind auth — likely a copy-paste, not deliberate.

---

## 11. Third-Party Dependencies of Note

**Paid APIs: zero.** No outbound calls to OpenAI, Anthropic, Deepgram, AssemblyAI, Hume, or anything else. Confirmed via grep on `anthropic`, `openai`, `deepgram`, `httpx`, `requests.post`, `claude`, `gpt`, `gemini`. The only mention of "openai" is a comment about Whisper's hallucination quirks (`audio_pipeline.py:119`).

The app would **not break offline** beyond first-time model downloads:
- `faster-whisper` model weights pulled from HuggingFace on first load.
- Silero VAD pulled via `torch.hub` from GitHub on first load.
- MediaPipe `.task` files **bundled in repo** under `backend/`.

After first start, the system runs fully self-hosted.

**Paid-equivalent dependencies it currently self-hosts:**
- ASR: Whisper (would otherwise be Deepgram / AssemblyAI / OpenAI Whisper API).
- Face/body: MediaPipe (would otherwise be Hume EVI / Affectiva).

---

## 12. Gaps the Auditor Noticed

Acting as a senior reviewer, blunt:

- **Zero test coverage.** Multi-user code, JWT handling, sharing logic, trim re-encoding — all untested. With sharing/comments live, this is the highest-risk gap.
- **No CI.** Nothing prevents a regression from landing on `main`. ESLint alone is not a quality gate.
- **No validation of the core product claim.** The app says "your confidence is 73." There is no dataset, no human inter-rater agreement, no calibration study. The scoring formula is a series of opinions stacked on each other. Acceptable for a learning project; not acceptable for any external promise.
- **`upload_video` blocking the event loop is the single biggest production risk.** A single 80 MB upload freezes every concurrent user. Trivial fix (move to a thread pool / `BackgroundTasks` or stream-encode), high impact.
- **JWT in query string for media** is a real footgun. Should switch to short-lived signed URLs (HMAC + expiry) or move media behind a backend proxy that injects cookies. Right now any access log dump exposes tokens.
- **No language detection.** Whisper-en will happily transcribe Urdu as gibberish English; the rest of the pipeline scores that gibberish as if it were valid. There should be either (a) a multilingual model selectable from the UI or (b) a language-detect gate that warns the user.
- **Audio pipeline's filler list is anglocentric.** "uhm/like/you know" doesn't generalise. The acoustic detector helps but has its own thresholds.
- **Hand position is detected but not scored.** Either drop it from the UI or wire it into the aggregate. Currently it's a half-feature.
- **Head pose missing.** A confidence app without yaw/pitch/roll is incomplete; "looking at the camera" is currently a blendshape proxy, not a head-pose measurement.
- **No retention / cleanup.** Disk fills, DB grows. Needs at minimum a "discarded > 30 days → purge" job.
- **Browser MediaRecorder blob lives entirely in RAM.** A 30-minute live session OOMs Chrome on a low-end laptop. Needs `MediaRecorder.start(timeslice)` and chunked upload.
- **`useFaceDetection` runs on the main thread.** With MediaPipe + React reconciliation, frame drops are inevitable on weak hardware. Move it to an `OffscreenCanvas` + Worker.
- **No structured analytics.** Can't answer "how many users finish a session" or "which prompts are most used." Important once Practice Mode lands.
- **No LLM coaching anywhere yet.** The result page has the slot for it (`SessionReport.action_items`), but the items are produced by hand-coded heuristics in `scoring_engine.generate_tips`. This is the natural place for the recommendation in §13.

**What's notably good (worth keeping):**
- Path-traversal regex on every user-supplied id (`main.py:74-86`) — clean.
- DB schema with JSONB tags, `content_sha256` dedup, FK cascades — well-designed.
- Per-request `FaceEngine` instantiation (the old shared-singleton bug from `PRODUCTION_AUDIT.md` is fixed at `main.py:701`).
- Hallucination blacklist on Whisper output — pragmatic.
- Practice Mode infrastructure already in place: `prompts.py` (10 topics × 6 categories), `Media.topic` field, `PracticeSetup` UI, `PracticeTimer`, topic banner in live session. The §13 feature is mostly *wiring*, not building from zero.

---

## 13. LLM Recommendation for Practice Mode

### Findings that drive the choice
- **Transcripts are already produced upstream** (faster-whisper, word-level timestamps, hallucination filtering). The LLM does not need audio.
- The structured scores (`signal_averages`, `filler breakdown`, `pace`) are **already JSON-ready** in `report_json`. The LLM will consume *cleaned* numeric features, not raw audio.
- **No paid APIs in use today** → adding one is a deliberate first cost. Project shows **no monetisation signals** (no Stripe, no tier flags). It is a single-developer/learning project. Cost matters.
- **Result-screen UX copy is metric-led with a thin coaching layer** ("Insights", "Action Items"). Tone is data-driven, not therapy-warm. Coaching prose can be competent rather than literary.
- **Latency budget is forgiving.** Tips are shown on the report screen *after* the session ends — a 2-4 s LLM call is fine.
- **Volume is low.** Per session: one transcript (~500-2 000 words) + one structured score blob, called once. Even at 1 000 sessions/month, total tokens stay tiny.

### Primary recommendation: **GPT-5 Mini** ($0.25 / $2.00 per 1M)
- Transcripts are already there → no need to pay for native multimodal (rules out Gemini Flash/Flash-Lite as primary).
- Quality is sufficient for the existing UX copy, which is metric-led; coaching does not need to feel like Claude prose.
- ~4× cheaper than Claude Haiku 4.5 ($1.00 / $5.00). With a typical session of ~2 000 input + ~500 output tokens, **per-session cost ≈ $0.0015**. 1 000 sessions/month = **$1.50**.
- Text-only API → trivial integration.
- Headroom: if reasoning quality on aggregated insights (multi-session trends) becomes the bottleneck, swap to Claude Haiku 4.5 without changing the prompt structure.

### Optional second recommendation: tiered routing
Only worth it if request volume crosses ~10 000 sessions/month or per-tip cost becomes visible. Until then, the engineering complexity is not worth $1-2/month savings.
- **GPT-5 Nano** ($0.05 / $0.40) for deterministic sub-tasks: filler classification refinement, structure extraction (intro/body/conclusion detection), confidence-trigger detection on the transcript.
- **Claude Haiku 4.5** ($1.00 / $5.00) only for the user-facing coaching paragraph if user testing shows GPT-5 Mini's prose feels generic.

**Do not** recommend Gemini Flash/Flash-Lite as primary: their native multimodal advantage is wasted because faster-whisper already runs locally and is more accurate for this domain than Gemini's audio path. Native-multimodal is *only* the right call if the team is willing to drop Whisper.

### Concrete prompt architecture

**File location:** create `backend/llm_coach.py` exposing `generate_coaching_report(report_json, prompt_meta, user_history) -> dict`. Call from `report_generator.generate_post_session_report` (`backend/report_generator.py`) — append the LLM result to `report_json["coaching"]` so the existing `Result.jsx` / `SessionReport.jsx` rendering path can pick it up without a new endpoint.

**Context to pass (per call):**
1. **Topic** — `Media.topic` text + the source `prompts.py` entry (`title`, `body`, `category`, `suggested_min`).
2. **Transcript** — already cleaned (hallucination-filtered) word list. Token-budget cap at ~1 500 words.
3. **Structured signals** — `signal_averages`, `filler_breakdown` (lexical + acoustic counts), `pace` stats, peak/lowest scores, silence gaps.
4. **Prior 3 sessions** on the same topic (when present) — `score_avg`, top weakness, top strength. Pull from `media` rows `WHERE user_id=? AND topic=? ORDER BY created_at DESC LIMIT 3`.

**Output schema (ask for strict JSON):**
```json
{
  "headline": "string ≤120 chars",
  "wins": ["string", "..."],
  "improvements": ["string", "..."],
  "next_session_focus": "string ≤200 chars",
  "transcript_callouts": [{"start_ms": 0, "end_ms": 0, "note": "string"}]
}
```

**Token budget per session:** ~2 000 input + ~500 output ≈ **2 500 tokens**. At GPT-5 Mini pricing → **~$0.0015/session**.

### One-liner: would dropping Whisper for native-multimodal Gemini save money?
**No.** Each 3-min session is ~6 MB of audio at 16 kHz; sent native-multimodal, it costs more than Whisper running locally on the existing CPU and degrades quality on accented English. Keep `faster-whisper`; bolt GPT-5 Mini on top.

---

## How to Verify (read-only)

Re-run on next audit:

```bash
# Path
ls usman/implementation/project-2-confidence-detector

# Endpoint count sanity check
grep -E "@app\.(get|post|patch|delete|websocket)" usman/implementation/project-2-confidence-detector/backend/main.py | wc -l

# Confirm no LLM calls (should still be empty)
grep -RIn -E "anthropic|openai|deepgram|api\.openai|api\.anthropic|generativelanguage" usman/implementation/project-2-confidence-detector/backend

# Confirm tests still absent
find usman/implementation/project-2-confidence-detector -name "test_*.py" -o -name "*.test.js" -o -name "*.spec.js" 2>/dev/null
```

Re-run via MCP graph: `list_flows_tool(sort_by=criticality)` should still surface `App`, `session_ws`, `websocket_live`, `analyze_audio_file`, `upload_video` as the top-5 flows. `get_architecture_overview_tool` should report 2 dominant project-2 communities (`backend-detect`, `components-handle`).
