# Module 03: ExamGuard Web App

## Architecture

```
┌─────────────────────────────────┐
│         REACT FRONTEND          │
│  (Vite + React)                 │
│                                 │
│  ┌──────────┐  ┌──────────┐    │
│  │ Live     │  │ Upload   │    │
│  │ Camera   │  │ Video    │    │
│  │ Feed     │  │ Analysis │    │
│  └──────────┘  └──────────┘    │
│                                 │
│  ┌──────────────────────────┐   │
│  │  Results Dashboard       │   │
│  │  Score bars + Timeline   │   │
│  └──────────────────────────┘   │
└──────────────┬──────────────────┘
               │ HTTP / WebSocket
┌──────────────┴──────────────────┐
│        FASTAPI BACKEND          │
│  (Python)                       │
│                                 │
│  /api/live        → webcam feed │
│  /api/upload      → video file  │
│  /api/results     → get scores  │
│                                 │
│  ┌──────────────────────────┐   │
│  │  Detection Engine        │   │
│  │  Head + Eyes + Body +    │   │
│  │  Talking (same code!)    │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

## Features

### Mode 1: Live Camera
- Browser shows webcam feed with detection overlays
- Real-time score bars and alerts
- Alert log with timestamps

### Mode 2: Upload Video
- Upload recorded exam video (.mp4, .avi, .mov)
- Backend processes entire video
- Returns timeline of suspicious events
- Click any event → see the frame

## Setup

### Backend
```
cd backend
pip install fastapi uvicorn python-multipart
python main.py
```

### Frontend
```
cd frontend
npm install
npm run dev
```
