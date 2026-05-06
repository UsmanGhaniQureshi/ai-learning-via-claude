# CHANGES MADE — Confidence Detector v1.0

## Summary

Complete overhaul: new scoring engine, voice analysis, WebSocket real-time updates, frontend redesign with animated gauge/signal bars/tips/graph, full deployment config.

---

## Files Modified

### backend/main.py
- Added WebSocket endpoint `/ws/live` for real-time score delivery (client sends audio, server sends scores every 500ms)
- Added `/health` endpoint for deployment platforms
- Integrated `ScoringEngine`, `AudioAnalyzer` imports
- Fixed evidence frame re-processing bug (stored frames during main pass instead of re-running process_frame)
- Added file size validation (max 500MB) on upload
- Added `latest_face_result` shared state between MJPEG and WebSocket
- Added `camera_lock` (asyncio.Lock) for thread-safe camera access
- Environment variable support for PORT and CORS_ORIGINS
- Upload response now includes `sub_scores` and `tips`
- Version bumped to 1.0.0

### backend/face_engine.py
- Moved `from collections import Counter` to module-level import (was inside process_frame loop)
- Added `_detect_tension()` method — brow furrow + mouth tension scoring (0-100)
- Added `_detect_face_turned_away()` method — nose offset from face center
- Added try/except around `face_lm.detect()` and `pose_lm.detect()` calls
- Result dict now includes `tension_score` and `face_turned_away` fields

### backend/speech_engine.py
- Fixed WPM calculation bug in `process_audio_file()` — was using `start_time = 0` (epoch), now tracks elapsed time from audio frames
- Integrated `AudioAnalyzer` — each audio chunk analyzed for volume/pitch/silence
- Added try/except around `recognizer.AcceptWaveform()` calls
- `get_summary()` now includes voice_steadiness, volume_consistency, pitch_score, silence_gaps
- `reset()` initializes new file_mode tracking attributes

### frontend/src/App.jsx
- Complete rewrite of live mode: now shows ScoreGauge + SignalBars + FeedbackTips + SessionGraph
- WebSocket integration via `useWebSocket` hook
- Audio capture via `useAudioCapture` hook (browser mic -> WebSocket)
- Permission denied handling with PermissionScreen component
- Score history tracking for session graph
- Upload mode updated to show sub_scores via SignalBars and tips
- Voice steadiness + silence gaps shown in upload results
- Removed unused `useCallback` import

### frontend/src/App.css
- Added styles for: ScoreGauge, SignalBars, FeedbackTips, SessionGraph, PermissionScreen
- Added live-layout (video + gauge side by side)
- Added WebSocket status indicator
- Added mic-indicator
- Added responsive breakpoints (mobile layout at <700px)
- Kept all existing upload mode styles

### ReadMe.md
- Complete rewrite with architecture diagram, scoring formula, local setup, Docker deployment, Render/Railway instructions, environment variables, API endpoints

---

## New Files Created

### Backend
| File | Purpose |
|------|---------|
| `backend/scoring_engine.py` | Weighted scoring formula (6 signals), rolling 5-second average, tip generation |
| `backend/audio_analyzer.py` | Volume RMS consistency, pitch estimation (autocorrelation), silence gap detection |

### Frontend Components
| File | Purpose |
|------|---------|
| `frontend/src/components/ScoreGauge.jsx` | SVG circular gauge (0-100) with animated arc and color coding |
| `frontend/src/components/SignalBars.jsx` | 6 horizontal bars for individual sub-scores |
| `frontend/src/components/FeedbackTips.jsx` | 1-3 contextual tips based on lowest scores |
| `frontend/src/components/SessionGraph.jsx` | Canvas line chart of score over time |
| `frontend/src/components/PermissionScreen.jsx` | Camera/mic permission denied screen |

### Frontend Hooks
| File | Purpose |
|------|---------|
| `frontend/src/hooks/useWebSocket.js` | WebSocket connection with auto-reconnect (exponential backoff) |
| `frontend/src/hooks/useAudioCapture.js` | Browser getUserMedia mic capture, downsample to 16kHz PCM |

### Deployment
| File | Purpose |
|------|---------|
| `Dockerfile` | Backend Docker image (python:3.11-slim + OpenCV + FFmpeg) |
| `frontend/Dockerfile` | Frontend multi-stage build (node:20 + nginx) |
| `frontend/nginx.conf` | Nginx config with API/WebSocket proxy |
| `docker-compose.yml` | Full stack: backend + frontend + model cache volume |
| `render.yaml` | Render.com deployment config (backend + static frontend) |
| `railway.json` | Railway deployment config with health check |
| `.env.example` | Environment variable template |
| `scripts/download_models.sh` | Download MediaPipe + Vosk models if not present |

### Documentation
| File | Purpose |
|------|---------|
| `AUDIT_REPORT.md` | Full codebase audit: architecture, signals, 12 bugs, accuracy issues, deployment blockers |
| `CHANGES_MADE.md` | This file |

---

## Bugs Fixed

1. **Counter import in loop** (face_engine.py:316) — moved to module-level
2. **WPM epoch time bug** (speech_engine.py:95) — `start_time = 0` made WPM calculation use epoch seconds; now tracks audio frame elapsed time
3. **Evidence frame re-processing** (main.py:205-209) — was re-running `process_frame()` which mutated calibration state; now stores frames during main pass
4. **No error handling on detect()** (face_engine.py) — added try/except around MediaPipe detect calls
5. **No error handling on AcceptWaveform()** (speech_engine.py) — added try/except
6. **No file size validation** (main.py) — added 500MB limit on uploads

---

## New Features

1. **WebSocket real-time scores** — `/ws/live` sends score JSON every 500ms
2. **New scoring engine** — 6-signal weighted formula replacing ad-hoc bonuses
3. **Voice analysis** — pitch variance, volume consistency, silence gap detection
4. **Facial tension detection** — brow furrow + mouth tension from blendshapes
5. **Face turned away detection** — nose offset from face center
6. **Animated score gauge** — SVG circular gauge with color transitions
7. **Signal bars** — individual sub-score visualization
8. **Live feedback tips** — contextual advice based on lowest scores
9. **Session graph** — score-over-time canvas chart
10. **Browser audio capture** — mic captured client-side, sent via WebSocket
11. **Auto-reconnect WebSocket** — exponential backoff (1s, 2s, 4s, max 10s)
12. **Permission screen** — clear instructions when camera/mic denied
13. **Health check endpoint** — `/health` for deployment monitoring
14. **Docker deployment** — full stack via docker-compose
15. **Platform configs** — Render.com + Railway deployment ready

---

## How to Deploy

### Local (2 commands)
```bash
cd backend && python main.py    # Terminal 1
cd frontend && npm run dev      # Terminal 2
```

### Docker (1 command)
```bash
docker-compose up --build
```
