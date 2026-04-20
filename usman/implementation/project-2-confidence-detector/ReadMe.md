# Confidence Detector v1.0

AI-powered presentation confidence analysis. Get real-time feedback on your eye contact, voice, speech, facial expression, and posture while practicing presentations.

## What It Does

- **Live Practice:** Webcam + microphone analysis with real-time confidence scoring via WebSocket
- **Video Upload:** Upload a recorded presentation for full analysis with speech transcription
- **6 Signal Sources:** Eye contact, voice steadiness, speech pace, filler words, facial tension, posture
- **Weighted Scoring:** Evidence-based formula with rolling 5-second average
- **Live Feedback:** Contextual tips like "Maintain eye contact" and "Reduce filler words"

## Architecture

```
Browser (React + Vite)
  |
  |--- GET /api/live -------> MJPEG video stream (OpenCV frames with overlays)
  |--- WS  /ws/live -------> WebSocket: sends mic audio, receives score JSON every 500ms
  |--- POST /api/upload ----> Synchronous video analysis, returns full JSON report
  |
FastAPI Backend (Python)
  |
  |--- FaceEngine ---------> MediaPipe FaceLandmarker (52 blendshapes) + PoseLandmarker
  |--- SpeechEngine -------> Vosk STT (filler words, hedges, WPM)
  |--- AudioAnalyzer ------> NumPy (pitch via autocorrelation, volume RMS, silence gaps)
  |--- ScoringEngine ------> Weighted formula with rolling average
```

## Scoring Formula

```
Confidence (0-100) =
  Eye Contact Score      x 0.25 +
  Voice Steadiness Score x 0.25 +
  Speech Pace Score      x 0.20 +
  Filler Word Score      x 0.15 +
  Facial Tension Score   x 0.10 +
  Posture Score          x 0.05
```

Each sub-score is 0-100. Smoothed with a 5-second rolling average. Updates every 500ms.

## Run Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- FFmpeg installed and in PATH

### Backend
```bash
cd backend
pip install -r ../requirements.txt
python main.py
# API at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# UI at http://localhost:5173
```

### First Run
Models (MediaPipe + Vosk) are included in the repo. If missing, run:
```bash
bash scripts/download_models.sh backend/
```

## Deploy with Docker

```bash
cp .env.example .env
docker-compose up --build
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
```

## Deploy on Render

1. Push repo to GitHub
2. Connect repo on render.com
3. Render auto-detects `render.yaml` and creates both services
4. Set environment variables in Render dashboard if needed

## Deploy on Railway

1. Push repo to GitHub
2. Connect repo on railway.app
3. Railway auto-detects `railway.json`
4. Deploy frontend separately as a static site from `frontend/`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Backend server port |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `MEDIAPIPE_FACE_MODEL` | `./face_landmarker.task` | Path to face model |
| `MEDIAPIPE_POSE_MODEL` | `./pose_landmarker.task` | Path to pose model |
| `VOSK_MODEL_PATH` | `./vosk-model` | Path to Vosk speech model |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API status |
| GET | `/health` | Health check (for deployment platforms) |
| GET | `/api/live` | MJPEG webcam stream |
| GET | `/api/stop-live` | Release webcam |
| WS | `/ws/live` | WebSocket: send audio, receive scores |
| POST | `/api/upload` | Upload video for analysis |
| GET | `/api/video/{name}` | Serve processed video |
| GET | `/api/evidence/{name}` | Serve evidence frame |

## Tech Stack

- **Backend:** Python, FastAPI, MediaPipe, Vosk, OpenCV, NumPy
- **Frontend:** React 19, Vite 8
- **Models:** MediaPipe FaceLandmarker + PoseLandmarker, Vosk small-en-us
- **All free and open-source — no paid APIs**
