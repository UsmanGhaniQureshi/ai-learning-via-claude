# Audit fixes — what shipped

Seven-task audit batch addressing test coverage gaps, language handling,
personalisation, progress visibility, async pipeline, signed media URLs,
and access-control test coverage. Run with:

```sh
make test                                  # full pytest suite (18 tests)
cd backend && alembic upgrade head         # apply the new migration
cd frontend && npm run build               # production frontend bundle
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
