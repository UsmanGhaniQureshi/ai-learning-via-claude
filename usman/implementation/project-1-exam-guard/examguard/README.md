# ExamGuard Web App

## Architecture

```
+-------------------------------+
|       REACT FRONTEND          |
|  (Vite + React)               |
|                               |
|  +----------+  +----------+  |
|  | Live     |  | Upload   |  |
|  | Camera   |  | Video    |  |
|  | (MJPEG)  |  | Analysis |  |
|  +----------+  +----------+  |
|                               |
|  +-------------------------+  |
|  | Per-Student Verdicts    |  |
|  | Processed Video Player  |  |
|  | Alert Timeline          |  |
|  | Evidence Screenshots    |  |
|  +-------------------------+  |
+---------------+---------------+
                | HTTP
+---------------+---------------+
|       FASTAPI BACKEND         |
|                               |
|  /api/live          MJPEG stream (async, auto-releases camera)
|  /api/stop-live     Release camera explicitly
|  /api/upload        Upload + process video
|  /api/video/{name}  Serve processed video
|  /api/evidence/{name} Serve evidence screenshots
|                               |
|  +-------------------------+  |
|  | Detection Engine        |  |
|  |                         |  |
|  | 1. YOLO finds people    |  |
|  | 2. Crop each person     |  |
|  | 3. MediaPipe per crop:  |  |
|  |    Head + Eyes + Body +  |  |
|  |    Talking detection    |  |
|  | 4. Stable student IDs   |  |
|  |    across frames        |  |
|  +-------------------------+  |
+-------------------------------+
```

## Features

### Mode 1: Live Camera
- MJPEG stream with real-time detection overlays
- Each student gets a colored circle + label + score bar
- Camera auto-releases on page exit (async generator + `/api/stop-live`)
- Works with close-up webcam (direct MediaPipe) and classroom views (YOLO + crop)

### Mode 2: Upload Video
- Upload .mp4, .avi, .mov files
- Backend processes all frames with YOLO + MediaPipe
- Returns:
  - Per-student verdict cards (CLEAN / CHEATING DETECTED)
  - Processed video with overlays (converted to h264 via ffmpeg for browser playback)
  - Alert timeline with timestamps, scores, and signals
  - Evidence screenshots for each suspicious event

### Multi-Student Support
- YOLO detects all people in frame
- Each person gets a stable ID tracked across frames (position-based proximity matching)
- Independent eye calibration and talking cycle counting per student
- Per-student summary in upload results

## Setup

### Backend
```bash
# From project root (project-1-exam-guard/)
examguard_env\Scripts\activate
cd examguard/backend
python main.py
# Runs at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Frontend
```bash
cd examguard/frontend
npm install    # first time only
npm run dev
# Runs at http://localhost:5173
```

## Key Files

| File | What It Does |
|------|-------------|
| `backend/main.py` | FastAPI server — live stream, video upload, file serving |
| `backend/detector.py` | ExamGuardDetector — YOLO + MediaPipe pipeline, student tracking, overlays |
| `backend/yolov8n.pt` | YOLO model for person detection |
| `frontend/src/App.jsx` | React UI — home screen, live mode, upload mode with results |
| `frontend/src/App.css` | Dark theme styling |
