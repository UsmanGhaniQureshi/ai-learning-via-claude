# ExamGuard v0.1 — AI Exam Monitoring System

> **Goal:** Detect cheating behavior in exam videos (uploaded or live) through a web app.

## Build Order

| # | Module | What It Does | Status |
|---|--------|-------------|--------|
| 01 | Phone Detection | Detect phones on desks using YOLO | Done |
| 02 | Behavior Detection | Head direction, eye gaze, body turning, talking | Done |
| 03 | Web App | Upload video or live feed — see cheating alerts in browser | Done |

## v0.1 Features

```
User opens website (http://localhost:5173) — 2 options:

OPTION A: Upload recorded exam video
  - System processes every frame using YOLO + MediaPipe
  - Per-student verdict cards: "Student 1: CLEAN" / "Student 2: CHEATING DETECTED"
  - Processed video with detection overlays (circles, labels, score bars)
  - Alert timeline: "00:45 — Student 2: SUSPICIOUS (score 52)"
  - Evidence screenshots for each suspicious event

OPTION B: Live webcam feed
  - Real-time detection with overlays on MJPEG stream
  - Each student gets colored circle: green/yellow/orange/red
  - Camera auto-releases when you leave the page
```

## Architecture

```
+--------------------------------------+
|           REACT FRONTEND             |
|  (Vite + React, dark theme)          |
|                                      |
|  Live Camera  |  Upload Video        |
|  MJPEG stream |  Per-student cards   |
|               |  Processed video     |
|               |  Alert timeline      |
+---------------+----------------------+
               |  HTTP
+--------------------------------------+
|         FASTAPI BACKEND              |
|  /api/live      - webcam stream      |
|  /api/stop-live - release camera     |
|  /api/upload    - process video      |
|  /api/video/    - serve processed    |
|  /api/evidence/ - serve screenshots  |
+--------------------------------------+
               |
+--------------------------------------+
|         DETECTION ENGINE             |
|                                      |
|  Step 1: YOLO finds all people       |
|  Step 2: Crop each person            |
|  Step 3: MediaPipe per crop:         |
|    - Head Direction (Face Landmarker)|
|    - Eye Gaze (Iris Tracking)        |
|    - Body Turning (Pose Landmarker)  |
|    - Talking (Mouth Cycle Counting)  |
|                                      |
|  Scoring: Head=35 Eyes=30            |
|           Body=15 Talking=20 = 100   |
|                                      |
|  Verdicts:                           |
|    0-20  ALL CLEAR (green)           |
|   20-40  MILD WARNING (yellow)       |
|   40-65  SUSPICIOUS (orange)         |
|   65-100 HIGH ALERT (red)            |
+--------------------------------------+
```

## Tech Stack

| Tool | Purpose |
|------|---------|
| Python 3.13 | Main language |
| YOLO (ultralytics) | Person + phone detection |
| MediaPipe | Face landmarks, iris, pose tracking |
| FastAPI | Backend web server |
| React + Vite | Frontend UI |
| OpenCV | Video processing |
| imageio-ffmpeg | Video format conversion for browser playback |

## Project Structure

```
project-1-exam-guard/
  examguard_env/          # Python virtual environment
  requirements.txt        # Python dependencies
  01_phone_detection/     # Module 01 — notebooks + READMEs
  02_behavior_detection/  # Module 02 — notebooks + READMEs
  examguard/              # Module 03 — Web App
    backend/
      main.py             # FastAPI server
      detector.py         # YOLO + MediaPipe detection engine
      yolov8n.pt          # YOLO model
      uploads/            # Uploaded + processed videos
    frontend/
      src/App.jsx         # React app (live + upload modes)
      src/App.css         # Dark theme styles
```

## How to Run

**Terminal 1 — Backend:**
```bash
cd usman/implementation/project-1-exam-guard
examguard_env\Scripts\activate
cd examguard/backend
python main.py
# Server runs at http://localhost:8000
```

**Terminal 2 — Frontend:**
```bash
cd usman/implementation/project-1-exam-guard/examguard/frontend
npm run dev
# App runs at http://localhost:5173
```

Open **http://localhost:5173** in your browser.
