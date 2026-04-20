# Confidence Detector — Audit Report

### Repo map

- **Root**: [usman/implementation/project-2-confidence-detector/](usman/implementation/project-2-confidence-detector/)
- **Backend**: [backend/](usman/implementation/project-2-confidence-detector/backend/) — **FastAPI** (`uvicorn`, [main.py](usman/implementation/project-2-confidence-detector/backend/main.py)). Entry points:
  - `POST /api/upload` — offline video analysis
  - `POST /api/analyze-audio` — standalone speech analyzer
  - `POST /api/session/upload-video` — saves a session's video blob to disk
  - `GET /api/recordings` — lists `*_audio.wav` files only
  - `GET /api/report/{session_id}` — returns saved JSON report
  - `GET /api/video/{filename}` — serves files from `uploads/` (NOT `recordings/`)
  - `WebSocket /ws/session/{session_id}` — live audio + face scores in, scored chunks + final report out
- **Frontend**: [frontend/](usman/implementation/project-2-confidence-detector/frontend/) — **React + Vite**, three modes from [App.jsx](usman/implementation/project-2-confidence-detector/frontend/src/App.jsx):
  - `live` → [pages/LiveSession.jsx](usman/implementation/project-2-confidence-detector/frontend/src/pages/LiveSession.jsx) using [hooks/useLiveSession.js](usman/implementation/project-2-confidence-detector/frontend/src/hooks/useLiveSession.js)
  - `upload` → inline in `App.jsx`
  - `analyzer` → [pages/Analyzer.jsx](usman/implementation/project-2-confidence-detector/frontend/src/pages/Analyzer.jsx)
- **How they talk**:
  - WebSocket binary `Float32` PCM (3‑sec chunks, 16 kHz) for live audio
  - WebSocket text JSON (`type:"face"`, `type:"stop_session"`)
  - REST multipart for uploads
- **Where media is stored**: backend disk only — `backend/recordings/` for live sessions (`{session_id}_audio.wav`, `{session_id}_video.webm`, `{session_id}_report.json`) and `backend/uploads/` for the offline upload mode. Both are git‑ignored ([backend/.gitignore](usman/implementation/project-2-confidence-detector/backend/.gitignore)). **Neither directory is mounted as a static route**, and there is no GET endpoint that returns a recorded session video.

---

### Issue A — Live transcript hallucinates "thank you / thanks for watching"

- **Side**: both
- **File(s)**:
  - [backend/audio_pipeline.py:237-289](usman/implementation/project-2-confidence-detector/backend/audio_pipeline.py#L237-L289) (`transcribe_chunk`)
  - [backend/audio_pipeline.py:358-369](usman/implementation/project-2-confidence-detector/backend/audio_pipeline.py#L358-L369) (`has_meaningful_speech` gate)
  - [frontend/src/hooks/useLiveSession.js:171-192](usman/implementation/project-2-confidence-detector/frontend/src/hooks/useLiveSession.js#L171-L192) (`flushAudioBuffer` zero‑pads partial chunks)
  - [frontend/src/hooks/useLiveSession.js:260-268](usman/implementation/project-2-confidence-detector/frontend/src/hooks/useLiveSession.js#L260-L268) (transcript dedup)
- **Symptom**: The live transcript shows phrases like "thank you" / "thanks for watching" while the user is silent or only making background noise.
- **Root cause (offending code verbatim)**:

  Whisper params — defaults are still permissive enough to hallucinate stock phrases on near‑silent audio:
  ```python
  segments, info = whisper.transcribe(
      audio, language="en",
      word_timestamps=True,
      condition_on_previous_text=False,
      vad_filter=True,
      vad_parameters={"min_silence_duration_ms": 500, "threshold": 0.5},
      no_speech_threshold=0.6,
      log_prob_threshold=-1.0,
      compression_ratio_threshold=2.4,
      temperature=0.0,
  )
  ```

  Chunk‑level gate is far too loose:
  ```python
  has_meaningful_speech = voiced_s >= 0.4 and rms_energy > 0.005
  ```

  Frontend pads short audio buffers with **zeros** (digital silence), creating ~3 s of silence Whisper is then asked to transcribe:
  ```js
  const padded = chunk.length < CHUNK_SIZE
    ? (() => {
        const p = new Float32Array(CHUNK_SIZE)
        p.set(chunk)
        return p
      })()
    : chunk
  ```

  Frontend dedup only catches identical tail strings, so distinct hallucinations (`"thank you"` then `"thanks for watching"`) both pass:
  ```js
  if (prev.endsWith(newText)) return prev
  return (prev + ' ' + newText).trim()
  ```

- **Why it fails**:
  - `no_speech_threshold=0.6` is the faster‑whisper default — well-known to leak the "thanks for watching", "thank you for watching" YouTube‑training‑set hallucinations. Empirical fix usually needs `0.7-0.85`.
  - `log_prob_threshold=-1.0` is also default; hallucinations on silence frequently score above this.
  - There is **no `initial_prompt`** — leaving it empty makes the model lean on its priors (i.e. video closing phrases).
  - `voiced_s >= 0.4` over a 3‑second chunk plus `rms_energy > 0.005` is below the noise floor of most webcams. Keyboard taps, breathing and HVAC easily clear it, and once the gate opens, padded silence is sent into Whisper.
  - Padding the rest of the chunk with literal zeros guarantees that `vad_filter` inside Whisper passes the front of the audio and is then asked to caption ~2.7 s of silence — the exact pathological input that causes the canned phrases.
  - The frontend dedup is structural, not semantic, so it does not suppress the recurring hallucination set.

- **Blast radius**: Hallucinated text inflates `total_words`, distorts `speech_pace` / `wpm`, throws off `filler_words` ratios, and contaminates the final report transcript and `pace.avg_wpm`.
- **Severity**: **Critical** (the most user‑visible defect; destroys trust and pollutes downstream scoring).
- **Fix direction**: Tighten Whisper hallucination guards (raise `no_speech_threshold` to ~0.8, lower `log_prob_threshold` to ~‑0.7, add an empty/anchor `initial_prompt`), strengthen the chunk gate (e.g. `voiced_s >= 0.8 s` and `rms > 0.01`), stop sending zero‑padded chunks (drop or hold them instead), and filter known hallucination phrases server‑side before emitting to the client.

---

### Issue B — Session recording produces no playable preview

- **Side**: both
- **File(s)**:
  - [frontend/src/components/VideoRecorder.js:1-68](usman/implementation/project-2-confidence-detector/frontend/src/components/VideoRecorder.js#L1-L68)
  - [frontend/src/hooks/useLiveSession.js:92-104](usman/implementation/project-2-confidence-detector/frontend/src/hooks/useLiveSession.js#L92-L104) (blob is uploaded then dropped)
  - [frontend/src/pages/LiveSession.jsx:166-178](usman/implementation/project-2-confidence-detector/frontend/src/pages/LiveSession.jsx#L166-L178) (post‑session UI = `SessionReport` only)
  - [frontend/src/components/SessionReport.jsx](usman/implementation/project-2-confidence-detector/frontend/src/components/SessionReport.jsx) (no `<video>` element anywhere)
  - [backend/main.py:491-501](usman/implementation/project-2-confidence-detector/backend/main.py#L491-L501) (`upload_session_video` saves to disk only)
- **Symptom**: After the user stops a session, no playback of the just‑recorded video appears anywhere; only the scored report renders.
- **Root cause (offending code verbatim)**:

  Recorder is awaited, uploaded, then the in‑memory blob is forgotten:
  ```js
  if (recorderRef.current) {
    try {
      const blob = await recorderRef.current.stop()
      if (blob && sessionIdRef.current) {
        recorderRef.current.blob = blob
        await recorderRef.current.uploadToServer(sessionIdRef.current)
      }
    } catch (e) { /* upload failure non-critical */ }
    recorderRef.current = null
  }
  ```

  The only post‑session render is the report (note: nothing referencing `videoRef`, `blob`, `URL.createObjectURL`, or a remote `/api/video/...` URL):
  ```jsx
  {sessionState === 'report' && report && (
    <div className="session-report-wrap">
      <SessionReport ... />
      <button className="start-session-btn" onClick={resetSession}>
        Start New Session
      </button>
    </div>
  )}
  ```

  Backend saves the file but exposes **no GET endpoint** for it:
  ```python
  @app.post("/api/session/upload-video")
  async def upload_session_video(...):
      path = RECORDINGS_DIR / f"{session_id}_video.webm"
      with open(path, "wb") as f:
          shutil.copyfileobj(video.file, f)
      ...
      return {"status": "saved", "path": str(path), "size_mb": size_mb}
  ```

  Note also: `recorderRef.current = null` runs on every `stopSession`, and `useLiveSession.js` returns no `videoBlob` / `videoUrl` to the page.

- **Why it fails**:
  - The blob is created correctly inside `SessionVideoRecorder.stop()`, but `useLiveSession` neither stores it in React state nor exposes it through the hook's return value, so `LiveSession.jsx` cannot render `<video src={URL.createObjectURL(blob)} />`.
  - The hook nulls `recorderRef.current` immediately after upload, killing any later access to `recorder.blob`.
  - On the backend, `/api/session/upload-video` returns the absolute disk `path` (`str(path)`) — meaningless to the browser. There is no `app.mount("/recordings", StaticFiles(...))` and no `GET /api/recordings/{session_id}/video` route, so even the URL path returned cannot be loaded.
  - `SessionReport` renders no media element. In offline upload mode (`App.jsx:201-208`) playback works via `${API_BASE}/api/video/${results.processed_video}` — that pattern was never replicated for sessions.

- **Blast radius**: User cannot verify what was recorded; perceived data loss; makes Issue C (history) impossible because nothing reusable is exposed even if a list view existed.
- **Severity**: **Critical**.
- **Fix direction**: Keep the blob in hook state, render a `<video>` from `URL.createObjectURL(blob)` in the report view as immediate preview, and add a `GET /api/recordings/{session_id}/video` (FastAPI `FileResponse` with `media_type="video/webm"`) so the same URL works after refresh / from the history view.

---

### Issue C — No history / past recordings view

- **Side**: both
- **File(s)**:
  - [frontend/src/App.jsx:61-92](usman/implementation/project-2-confidence-detector/frontend/src/App.jsx#L61-L92) — only three modes: `live`, `upload`, `analyzer`. No `history`/`library` route.
  - [frontend/src/pages/](usman/implementation/project-2-confidence-detector/frontend/src/pages/) — only `LiveSession.jsx` and `Analyzer.jsx`. No `History.jsx` / `Library.jsx`.
  - [backend/session_recorder.py:56-69](usman/implementation/project-2-confidence-detector/backend/session_recorder.py#L56-L69) — `list_recordings` only globs audio.
  - [backend/main.py:504-507](usman/implementation/project-2-confidence-detector/backend/main.py#L504-L507) — `/api/recordings` exists but isn't called from anywhere.
- **Symptom**: User cannot revisit past sessions. There is no library UI and the one backend list endpoint is unreachable from the frontend and incomplete server‑side.
- **Root cause (offending code verbatim)**:

  Server‑side listing only knows about audio files:
  ```python
  @staticmethod
  def list_recordings():
      """List all recorded sessions."""
      recordings = []
      for f in RECORDINGS_DIR.glob("*_audio.wav"):
          session_id = f.stem.replace("_audio", "")
          size_mb = round(f.stat().st_size / 1e6, 2)
          recordings.append({
              "session_id": session_id,
              "filename": f.name,
              "path": str(f),
              "size_mb": size_mb,
          })
      return sorted(recordings, key=lambda x: x['filename'], reverse=True)
  ```

  Frontend mode set:
  ```jsx
  <button className="mode-btn" onClick={() => setMode('live')}> ... </button>
  <button className="mode-btn" onClick={() => setMode('upload')}> ... </button>
  <button className="mode-btn" onClick={() => { setMode('analyzer'); window.location.hash = '#/analyzer' }}> ... </button>
  ```

  Search confirms `/api/recordings` is referenced **0 times** in [frontend/](usman/implementation/project-2-confidence-detector/frontend/) (only `/api/report/${sessionId}` appears, used for the in‑flight fallback in `useLiveSession.js:127`).

- **Why it fails**:
  - No UI surface at all: there is no "Library" card in the mode picker, no `<Route>` / hash route handler, no `<History />` component.
  - Even if it existed, the server response only describes audio files (no `video_url`, no `report_url`, no playback URL). `path` is a disk path, not browser‑addressable.
  - Recordings directory is not statically served and there is no per‑session video GET.
  - `session_id` format is `session_${Date.now()}` (`useLiveSession.js:221`), so listings would be unsortable by the human-friendly date unless the backend parses it.

- **Blast radius**: A core user flow is missing. Without preview (B) **and** no history, the only way to get value out of any session is the live in‑page report which is also lost on refresh.
- **Severity**: **Critical**.
- **Fix direction**: Extend `SessionAudioRecorder.list_recordings` (or add a sibling `list_sessions`) to enumerate `*_video.webm` and `*_report.json`, return per‑session `{session_id, started_at, duration_s, audio_url, video_url, report_url, score}`; add `GET /api/recordings/{session_id}/video` and `/audio`; add a "Library" mode + `History.jsx` page that calls `GET /api/recordings` and renders cards with `<video>` + score.

---

### Issue D — End‑to‑end flow is dead

- **Side**: both
- **File(s)**: composite — see A, B, C above.
- **Symptom**: `start → record A/V → stop → preview → revisit later` never completes successfully.
- **Root cause**: No single bug; this is the cumulative effect:
  1. Live audio→Whisper path produces hallucinated transcripts during the session (Issue A), so the live experience already feels broken.
  2. The recorded blob never reaches a `<video>` element after stop (Issue B), so the user has no proof the session was captured.
  3. There is no library view and no GET route for stored videos (Issue C), so even if (B) is patched the user cannot return to past sessions.
- **Why it fails**: The recording pipeline is wired only through to "save on disk" — neither preview nor retrieval is implemented end‑to‑end. The transcript pipeline emits noise during silence, undermining the live UI.
- **Blast radius**: The whole "confidence checker" value proposition.
- **Severity**: **Critical**.
- **Fix direction**: Resolve A, B, C in the order defined in **Recommended fix order** below; D resolves automatically.

---

### Collateral findings

- **Mic feedback risk via AudioContext destination**
  - File: [frontend/src/hooks/useLiveSession.js:317-318](usman/implementation/project-2-confidence-detector/frontend/src/hooks/useLiveSession.js#L317-L318)
  - Code: `source.connect(processor); processor.connect(audioCtx.destination)`
  - Why: routing the captured stream to `audioCtx.destination` plays it out of the user's speakers; without headphones this becomes a feedback loop and degrades transcription accuracy (the bug also reinforces Issue A).
  - Severity: High.
  - Fix direction: connect the processor to a dummy `GainNode` with gain 0, or omit the destination connection entirely — `ScriptProcessor` only needs a downstream node to keep `onaudioprocess` ticking, but on Worklet/modern Chrome this is unnecessary.

- **Deprecated ScriptProcessorNode used; AudioWorklet exists but is unused**
  - File: [frontend/src/hooks/useLiveSession.js:304](usman/implementation/project-2-confidence-detector/frontend/src/hooks/useLiveSession.js#L304), unused worklet at [frontend/public/audioProcessor.worklet.js](usman/implementation/project-2-confidence-detector/frontend/public/audioProcessor.worklet.js)
  - Why: `ScriptProcessorNode` runs on the main thread and is officially deprecated; under load it drops audio frames, which corrupts chunks fed to Whisper.
  - Severity: Medium.
  - Fix direction: switch live capture to the existing `audio-processor` worklet.

- **Recording duration is approximate, drifts on every session**
  - File: [backend/session_recorder.py:49](usman/implementation/project-2-confidence-detector/backend/session_recorder.py#L49)
  - Code: `duration_s = (self._chunk_count * 3)`
  - Why: assumes every chunk was exactly 3 s; the final force‑flushed chunk is always counted as 3 s and a fast stop counts the partial chunk fully. Reported `duration_s` in the report disagrees with WAV file duration.
  - Severity: Medium.
  - Fix direction: compute duration from `_wav.getnframes()/sr` after close.

- **No size/MIME validation on session video upload**
  - File: [backend/main.py:491-501](usman/implementation/project-2-confidence-detector/backend/main.py#L491-L501)
  - Why: `upload_session_video` streams an unbounded body straight to disk; the offline `/api/upload` enforces 500 MB but this endpoint does not. Browser-side recordings can balloon to >1 GB.
  - Severity: Medium.
  - Fix direction: replicate the streamed‑with‑limit pattern from `/api/upload`.

- **`SessionReport` shows nothing if `recording` URL is added but never wired**
  - File: [frontend/src/components/SessionReport.jsx:14-19](usman/implementation/project-2-confidence-detector/frontend/src/components/SessionReport.jsx#L14-L19)
  - Why: destructures `note` and `session_id` but ignores `report.recording` (set in `main.py:367`). Even if backend exposed a URL, the report view would not render it.
  - Severity: Medium (compounds Issue B).
  - Fix direction: read `report.recording.video_url` (after backend exposes it) and render a `<video>`.

- **Dead WebSocket hook still in repo** — **RESOLVED (cleanup pass)**
  - File: ~~[frontend/src/hooks/useWebSocket.js](usman/implementation/project-2-confidence-detector/frontend/src/hooks/useWebSocket.js)~~ — file deleted.
  - Code: `const WS_URL = 'ws://localhost:8000/ws/live'`
  - Why: hard‑coded URL, points to a `/ws/live` route that no longer exists in the backend; risk of someone re‑importing this hook and breaking behaviour silently.
  - Severity: Low.
  - Fix applied: deleted `useWebSocket.js` and `useAudioCapture.js`.

- **`/api/upload` filename is taken straight from the user**
  - File: [backend/main.py:117-131](usman/implementation/project-2-confidence-detector/backend/main.py#L117-L131)
  - Code: `filepath = os.path.join(UPLOAD_DIR, file.filename)`
  - Why: enables path traversal (`../../...`) writes inside `UPLOAD_DIR` and beyond. Also enables overwrite/collision.
  - Severity: High (security).
  - Fix direction: sanitise to a UUID + safe extension before writing.

- **Stale state when starting a new session after stop**
  - File: [frontend/src/hooks/useLiveSession.js:194-205](usman/implementation/project-2-confidence-detector/frontend/src/hooks/useLiveSession.js#L194-L205)
  - Why: `audioBufferRef.current = []` is reset, but `audioCtxRef.current`, `audioProcessorRef.current`, and `wsRef.current` are not nulled if a previous run errored mid‑startup; the next start can attach a `MediaStreamSource` to a closed context.
  - Severity: Medium.
  - Fix direction: fully null all refs in `resetSession` and on the catch‑branch of `startSession`.

- **`speech_engine.py` is loaded at import‑time but unused by live sessions** — **RESOLVED (cleanup pass)**
  - File: ~~[backend/speech_engine.py](usman/implementation/project-2-confidence-detector/backend/speech_engine.py)~~ — file deleted.
  - Why: instantiates a Vosk `Model` at process start (slow, large), only used by the offline `/api/upload` path; live path uses `AudioPipeline`.
  - Severity: Low.
  - Fix applied: after the Whisper swap removed the only caller, deleted `speech_engine.py`, `audio_analyzer.py` (its only consumer), the eager `speech_engine = SpeechEngine()` global from `main.py`, and the `vosk` line from `requirements.txt`. `HEDGING_PHRASES` was inlined into `main.py`.

- **CORS wide open in default config**
  - File: [backend/main.py:50, 53](usman/implementation/project-2-confidence-detector/backend/main.py#L50)
  - Code: `CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')`
  - Severity: Medium (production concern, not blocking the bug list).

- **No surfacing of upload failure to the user**
  - File: [frontend/src/hooks/useLiveSession.js:101](usman/implementation/project-2-confidence-detector/frontend/src/hooks/useLiveSession.js#L101)
  - Code: `} catch (e) { /* upload failure non-critical */ }`
  - Why: the very thing the user wants (their recording saved) silently fails. Reinforces Issue B.
  - Severity: Medium.
  - Fix direction: surface upload errors in `error` state.

- **MediaRecorder MIME type fallback excludes Safari**
  - File: [frontend/src/components/VideoRecorder.js:15-17](usman/implementation/project-2-confidence-detector/frontend/src/components/VideoRecorder.js#L15-L17)
  - Why: only checks `video/webm;codecs=vp9,opus` then bare `video/webm`; Safari does not support webm at all, so `MediaRecorder` throws and recording never starts.
  - Severity: Medium (browser coverage).
  - Fix direction: add an MP4 (`video/mp4;codecs=avc1`) fallback or feature-gate the live mode on browsers without webm.

- **`SessionAudioRecorder.close()` doesn't tolerate missing recordings**
  - File: [backend/session_recorder.py:43-54](usman/implementation/project-2-confidence-detector/backend/session_recorder.py#L43-L54)
  - Why: returns a payload with the local disk `audio_path`; that string ends up inside the report as `report["recording"].audio_path` (server FS path) — the frontend can't load it. Same root cause that breaks Issue B/C history playback.
  - Severity: Medium.
  - Fix direction: return URL paths (`/api/recordings/{session_id}/audio`) once the GET endpoints exist.

---

### Recommended fix order

1. **Issue B — recording preview (in‑memory blob path).** This is the smallest, highest‑signal fix. Surface the recorded `Blob` from `useLiveSession` and render a `<video src={URL.createObjectURL(blob)} />` inside the post‑session UI. The user immediately sees that capture works, which restores trust and gives a real artefact to test against. No backend changes required.
2. **Backend persistence + retrieval (foundation for B's full path and for C).** Add `GET /api/recordings/{session_id}/video` (and `/audio`), have `upload_session_video` return a browser URL, and have `report["recording"]` carry the same URL. After this step, the in‑memory preview from step 1 keeps working and a remote URL is also available for refresh / external sharing.
3. **Issue C — history view.** Extend `SessionAudioRecorder.list_recordings` to enumerate video + report files and return URLs from step 2; add a "Library" mode in `App.jsx` and a `History.jsx` page that lists sessions and renders `<video>` + score per row. C cannot deliver value before steps 1 and 2 — without the GET endpoints there is nothing to render.
4. **Issue A — transcript hallucination.** Can be done in parallel with 1–3 since it's isolated to `audio_pipeline.py` + `useLiveSession.js`, but should not block the recording flow. Tighten Whisper params (`no_speech_threshold`, `log_prob_threshold`, `initial_prompt`), strengthen `has_meaningful_speech`, stop zero‑padding partial chunks, and add a server‑side hallucination phrase blacklist before emitting `transcript_text`.
5. **Issue D — end‑to‑end flow.** Resolved by completing 1–4. After that, run the verification flow below.

### Verification (post‑fix, not part of this audit)

- Run backend: `python backend/main.py` and frontend: `cd frontend && npm run dev`.
- Live mode: start a session, speak for ~30 s, then sit silent for 30 s — confirm transcript stays empty during silence (no "thank you").
- Stop session: confirm the just‑recorded video plays back inline in the report.
- Refresh the page, open Library: confirm the same session shows in the list and plays from the server URL.
- Hit `GET /api/recordings` and `GET /api/recordings/{id}/video` directly to confirm payload shape and `Content-Type: video/webm`.

---

## Post‑audit cleanup applied

Status update — these changes have already been made in the codebase:

### Removed (dead code)

| Path | Reason |
|---|---|
| `frontend/src/hooks/useWebSocket.js` | Hard-coded `ws://localhost:8000/ws/live` URL pointing to a route that no longer exists. Zero importers. |
| `frontend/src/hooks/useAudioCapture.js` | Superseded by inline audio capture inside `useLiveSession.js`. Zero importers. |
| `backend/speech_engine.py` | Last caller (`/api/upload`) was migrated to `AudioPipeline`. The only constant still needed (`HEDGING_PHRASES`) was inlined in `main.py`. |
| `backend/audio_analyzer.py` | Only used by `speech_engine.py`. Removed in the same pass. |
| `vosk` line in `requirements.txt` | Vosk is no longer imported anywhere. The `backend/vosk-model/` directory remains on disk (gitignored, ~50 MB) — delete it manually if you want the disk space. |
| `from speech_engine import SpeechEngine` and `speech_engine = SpeechEngine()` global in `main.py` | Resolved the eager Vosk model load at backend startup (saves ~5–30 s startup time). |

### Edits to existing files

- `backend/main.py` — dropped the dead imports and global, inlined `HEDGING_PHRASES`, updated stale comment that referenced `SpeechEngine`.
- `frontend/public/audioProcessor.worklet.js` — header comment updated to reference `useLiveSession.js` instead of the deleted `useAudioCapture.js`.

### Still deferred (collateral, not yet addressed)

- Path traversal in `/api/upload` ([main.py](usman/implementation/project-2-confidence-detector/backend/main.py) — `file.filename` written directly).
- Size cap on `POST /api/analyze-audio`.
- AudioWorklet swap for live capture (`audioProcessor.worklet.js` exists but `useLiveSession.js` still uses `ScriptProcessorNode`).
- Safari `MediaRecorder` MIME fallback (no MP4 path).
- CORS wide‑open default.
- Old root‑level docs (`AUDIT_REPORT.md`, `CHANGES_MADE.md`, `IMPLEMENTATION_PLAN.md`, `AGENT_TASK*.md`, `ReadMe.md`) reference the deleted modules. They were preserved per request — refresh manually if you want them current.
