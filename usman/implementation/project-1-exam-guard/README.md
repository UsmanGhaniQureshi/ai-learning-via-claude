# ExamGuard v0.1 — Implementation

> **Goal:** Detect cheating behavior in exam videos (uploaded or live) through a web app.

## Build Order

| # | Module | What It Does | Status |
|---|--------|-------------|--------|
| 01 | Phone Detection | Detect phones on desks using YOLO | ✅ Done |
| 02 | Behavior Detection | Head direction, eye gaze, body turning, talking | 🔄 In Progress |
| 03 | Web App | Upload video or live feed → see cheating alerts in browser | ⏳ Next |

## v0.1 Scope

```
User opens website → 2 options:

OPTION A: Upload recorded exam video
  → System processes video
  → Shows timeline: "0:45 — Looking at neighbor's paper"
  → Shows timeline: "1:23 — Head turned away 15 seconds"
  → Shows timeline: "2:10 — Phone detected on desk"
  → Can click any timestamp → see the frame with detection box

OPTION B: Connect live webcam/camera
  → Real-time detection in browser
  → Alerts pop up as they happen
  → Everything logged with timestamps
```

## Architecture

```
┌──────────────────────────────────────┐
│           WEB BROWSER                │
│  Upload video  |  Live camera feed   │
│  Results + timestamps + evidence     │
└──────────────┬───────────────────────┘
               │
┌──────────────┴───────────────────────┐
│         FLASK WEB SERVER             │
│  Receives video → sends to detectors │
│  Returns results → shows on page     │
└──────────────┬───────────────────────┘
               │
┌──────────────┴───────────────────────┐
│         DETECTION MODULES            │
│                                      │
│  📱 Phone Detector (YOLO)            │
│  👀 Head Direction (MediaPipe Face)  │
│  👁️ Eye Gaze (MediaPipe Iris)       │
│  🔄 Body Turning (MediaPipe Pose)    │
│  🗣️ Talking Detection (Audio)       │
│                                      │
│  Each runs independently on frames   │
│  Results combined → alert decision   │
└──────────────────────────────────────┘
```

## Tech Stack

| Tool | Purpose |
|------|---------|
| Python | Main language |
| YOLO (ultralytics) | Phone detection |
| MediaPipe | Face, eyes, pose tracking |
| Flask | Web server |
| HTML/CSS/JS | Web interface |
| OpenCV | Video processing |
