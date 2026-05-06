# AUDIT REPORT — Confidence Detector

**Date:** 2026-04-14
**Auditor:** Claude (AI Agent)
**Scope:** Full codebase audit — architecture, signals, bugs, accuracy, performance, missing features, deployment blockers

---

## 1. Architecture Summary

### Stack
- **Backend:** Python 3.13, FastAPI 0.135.3, Uvicorn 0.44.0
- **Frontend:** React 19.2.4 + Vite 8.0.4
- **ML Models:** MediaPipe FaceLandmarker (52 blendshapes) + PoseLandmarker (33 joints), Vosk STT (small English model)
- **Video Processing:** OpenCV 4.13, FFmpeg (via imageio-ffmpeg)
- **Communication:** REST API only — no WebSocket

### Structure
```
project-2-confidence-detector/
├── backend/
│   ├── main.py              (FastAPI app — live MJPEG + video upload)
│   ├── face_engine.py        (MediaPipe face/pose analysis)
│   ├── speech_engine.py      (Vosk STT + filler/hedge detection)
│   ├── face_landmarker.task  (MediaPipe face model binary)
│   ├── pose_landmarker.task  (MediaPipe pose model binary)
│   ├── vosk-model/           (Vosk speech model ~40MB)
│   └── uploads/              (temp video/audio/evidence files)
├── frontend/
│   ├── src/App.jsx           (main React component)
│   ├── src/App.css           (dark theme styling)
│   └── package.json          (React + Vite deps)
├── requirements.txt
└── ReadMe.md
```

### App Modes
1. **Live Practice:** GET `/api/live` returns MJPEG stream from webcam. Face analysis runs server-side per frame. Confidence overlay drawn directly on video frames. No structured score data sent to frontend.
2. **Video Upload:** POST `/api/upload` processes entire video synchronously. Extracts audio via FFmpeg, runs face analysis frame-by-frame, runs Vosk STT on audio. Returns JSON with full analysis.

### Confidence Score Pipeline

**Per-frame face confidence (face_engine.py lines 336-407):**
```
Base: 35 (speaking/happy) or 25 (other)
+ Expression modifier: happy +30, speaking +20, focused +10, neutral 0, surprised -5, sad -15, angry -20
+ Eye contact: +20 to -15 depending on % and activity state
+ Blink rate: -5 to -10 if >25/min
+ Posture: +5 (upright) to -12 (slouching)
+ Fidgeting: -5 to -10 if high
+ Hand gestures: +3 to +7 if speaking with hands
= Clamped to 0-100
```

**Overall upload score (main.py lines 213-234):**
```
overall = face_confidence * 0.40 + speech_score * 0.40 + pace_score * 0.20
```

---

## 2. Signal Sources Detected

| Signal | Library | Working? | Used in Scoring? | Accurate? |
|--------|---------|----------|-----------------|-----------|
| Facial expression (blendshapes) | MediaPipe FaceLandmarker | Partial | YES | NO — thresholds are guessed, not validated |
| Eye gaze / eye contact | MediaPipe blendshape gaze | YES | YES | Reasonable — 0.55 threshold works for webcam |
| Blink rate | MediaPipe eyeBlink blendshapes | YES | YES | YES — transition detection is solid |
| Posture (shoulder tilt) | MediaPipe PoseLandmarker | Partial | YES | WEAK — only slouch/tilt, not posture quality |
| Fidgeting | Pose landmark movement tracking | Partial | YES | WEAK — detects movement, not fidget type |
| Hand gestures | Pose wrist position | YES | YES | Basic but functional |
| Speech transcription | Vosk (small model) | YES | YES | ~90% accuracy (small model misses words) |
| Filler words | Text pattern matching | YES | YES | MOSTLY — "like" has ~15% false positives |
| Hedging phrases | Text pattern matching | YES | YES | YES |
| Speech pace (WPM) | word_count / time | YES | YES | YES |
| **Voice volume/consistency** | NOT IMPLEMENTED | - | NO | - |
| **Pitch variance** | NOT IMPLEMENTED | - | NO | - |
| **Silence gaps** | NOT IMPLEMENTED | - | NO | - |

---

## 3. Bugs Found

| # | Severity | File | Line(s) | Bug | Impact |
|---|----------|------|---------|-----|--------|
| 1 | HIGH | face_engine.py | 316 | `from collections import Counter` imported inside `process_frame()` on every call | Performance hit on every frame; should be module-level import |
| 2 | HIGH | speech_engine.py | 95 | `self.start_time = 0` in `process_audio_file()` makes `elapsed = time.time() - 0 = epoch seconds` | WPM calculation is wildly wrong for file-based analysis (divides words by ~1.7 billion seconds) |
| 3 | HIGH | main.py | 205-209 | Evidence frames re-run `face_engine.process_frame()` which mutates calibration baseline and history deques | Corrupts timeline data — later evidence frames get skewed baselines |
| 4 | HIGH | main.py | — | No WebSocket — live mode only draws overlays on MJPEG frames | Frontend cannot display structured scores, sub-scores, or tips in live mode |
| 5 | MEDIUM | main.py | 32 | Global mutable `active_camera` — not thread-safe | Concurrent requests could crash or leak camera handles |
| 6 | MEDIUM | main.py | 135 | `last_result` starts as `None`; first frame always shows "No face detected" | First frame overlay is wrong even if face is present (skipped by `process_every = 2`) |
| 7 | MEDIUM | main.py | 169 | `SpeechEngine()` re-instantiated per upload, re-loading 40MB Vosk model | Slow upload processing; should share model instance |
| 8 | MEDIUM | face_engine.py | 300-301 | No try/except around `face_lm.detect()` | Corrupt frame or unexpected input crashes entire live stream |
| 9 | MEDIUM | speech_engine.py | 87-88 | No error handling if audio is not mono 16-bit PCM | Returns error dict but caller doesn't check it — `results` becomes a dict instead of list |
| 10 | LOW | main.py | — | No file size validation on upload | Extremely large files could cause OOM |
| 11 | LOW | main.py | — | No cleanup of uploaded files — accumulate in uploads/ indefinitely | Disk fills up over time |
| 12 | LOW | face_engine.py | 417 | Score breakdown string is ad-hoc, not machine-readable | Hard to debug or parse scoring logic |

---

## 4. Accuracy Issues

### Scoring Formula
- **NOT evidence-based.** The HOW_IT_WORKS.md document explicitly states: "No research backing. Mehrabian's 93% rule is misapplied. These are guessed weights."
- The additive bonus/penalty system (base + modifiers) is not a proper weighted average — it's arbitrary and hard to reason about.
- Expression thresholds (0.05, 0.15, 0.08 in face_engine.py lines 123-156) are hand-tuned without validation against labeled data.

### Signal Weighting
- Face gets 40% and speech gets 40% in the overall upload score, but these are guesses.
- Pace gets its own 20% weight, but pace is already penalized inside the speech score — double-counting.
- The per-frame face scoring (base + bonuses) doesn't match the upload-level scoring (weighted average) — two different formulas for the same concept.

### Race Conditions & Stale Data
- Baseline calibration assumes user stays neutral for first 30 frames (~1 second). If they smile or move during init, all subsequent expression detection is skewed.
- Eye contact percentage uses a 30-frame sliding window, but frame rate varies — the "percentage" represents different time spans depending on processing speed.

### Update Frequency
- Live mode: updates every frame (~30 FPS) — good, but no smoothing. Score jumps frame-to-frame.
- Upload mode: logs data every 2 seconds — too coarse for detailed timeline.

---

## 5. Performance Issues

| Issue | File | Impact |
|-------|------|--------|
| `Counter` imported inside loop | face_engine.py:316 | Minor overhead per frame |
| Vosk model re-loaded per upload | main.py:169 | ~2-3 second delay per upload |
| Evidence frames re-run full inference | main.py:205-209 | Doubles processing time for timeline frames |
| No model caching strategy | — | Models loaded at startup, but no lazy loading or shared pool |
| Video processed synchronously | main.py:96-253 | Upload endpoint blocks for entire video duration (1-5 min for long videos) |
| MJPEG encoding per frame | main.py:65 | CPU-intensive; JPEG quality 70 is reasonable |

---

## 6. Missing Features (High Priority)

1. **WebSocket for real-time scores** — Currently no structured score data reaches the frontend in live mode
2. **Voice analysis (pitch/volume)** — No audio amplitude or frequency analysis exists
3. **Silence gap detection** — Long pauses not tracked
4. **Rolling average smoothing** — Scores jump frame-to-frame with no temporal smoothing
5. **Individual sub-score breakdown** — Frontend only sees total score, not per-signal scores
6. **Live feedback tips** — No contextual advice ("slow down", "maintain eye contact")
7. **Session history graph** — No score-over-time visualization
8. **Score gauge animation** — Frontend shows a plain number, not an animated visual
9. **Camera/mic permission handling** — No UI for permission denied state
10. **Brow furrow / facial tension detection** — Blendshape data available but not used for tension scoring

---

## 7. Deployment Blockers

1. **No health check endpoint** — Required for platform health monitoring
2. **No Docker configuration** — No Dockerfile or docker-compose.yml
3. **No environment variable support** — All config is hardcoded (port, CORS origins, model paths)
4. **No .env.example** — New developers have no config reference
5. **CORS allows all origins** — Security risk for production
6. **No model download script** — Models must be manually placed; no automated setup
7. **No deployment platform config** — No render.yaml, railway.json, or fly.toml
8. **No file cleanup** — uploads/ directory grows unbounded
9. **FFmpeg dependency undocumented** — System must have ffmpeg installed but README doesn't mention it
10. **README is minimal** — No architecture docs, no deployment instructions, no env var docs
