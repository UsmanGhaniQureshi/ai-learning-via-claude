---
name: ExamGuard Project Status
description: Complete status of AI/ML learning journey and ExamGuard implementation — what's done, what's in progress, what's next
type: project
---

## Student: Usman — AI/ML Beginner Learning Journey

### Learning Materials (ALL COMPLETE)
- `usman/01_Foundations/` — 11 topics (AI, ML types, models, math) with MD + DOCX + PPT + PDF
- `usman/02_Problem_and_Data/` — 10 topics (problem decomposition, 3 questions, data collection/validation/cleaning/augmentation/labeling, pretrained models, pipeline, multi-model systems)
- `usman/03_Model_Selection/` — 12 cases with flowcharts, WHY/WHY NOT for each model
- `usman/03_Deep_Dives/` — Individual model files (Supervised/Unsupervised/RL)
- `usman/06_ExamGuard_Project/` — 9 phases project blueprint (untouched docs)
- `usman/AI_ML_Quiz_QnA.md` — All quiz Q&A with student's raw answers
- `usman/AI_ML_Revision_Notes.md` — Main study notes

### Implementation
Location: `usman/implementation/`

**Virtual Environment:** `usman/implementation/examguard_env/` (Python 3.13, ultralytics, opencv, mediapipe, jupyter, fastapi, imageio-ffmpeg installed)

**Kernel registered:** "ExamGuard (Python 3.13)" for Jupyter in VS Code

**Module 01 — Phone Detection (DONE)**
- `01_phone_detection/02_test_yolo/` — YOLO detects phones
- `01_phone_detection/03_live_webcam/` — Live webcam with frame skipping for FPS
- `01_phone_detection/04_phone_only_filter/` — Filter only phones with threshold
- `01_phone_detection/05_alert_system/` — Beep + evidence screenshots

**Module 02 — Behavior Detection (DONE)**
- `02_behavior_detection/01_head_direction/` — MediaPipe Face Landmarker (new tasks API, NOT mp.solutions). Model file: `face_landmarker.task`. Works with cv2.flip for mirror.
- `02_behavior_detection/02_eye_gaze/` — Iris tracking with ROLLING auto-calibration (no user action needed, median of last 300 readings). GAZE_THRESHOLD=0.12 works.
- `02_behavior_detection/03_body_turning/` — Combined head+eyes+body. Pose model: `pose_landmarker.task`. Scoring: Head=70, Eyes=60, Body=50 (capped at 100). Alert levels: Clear<25, Mild<45, Suspicious<65, High>=65.
- `02_behavior_detection/04_talking_detection/` — Mouth cycle counting (not just open/close). 3+ cycles in 2 seconds = talking. Catches talking, ignores yawns.
- `02_behavior_detection/05_combine_all/` — All 4 detectors combined. Scoring: Head=35, Eyes=30, Body=15, Talking=20 = 100 max.

**Module 03 — Web App (TESTED, WORKING)**
- `03_web_app/backend/main.py` — FastAPI server with:
  - `/api/live` — Live webcam MJPEG stream (async generator, releases camera on disconnect)
  - `/api/stop-live` — Explicit camera release endpoint (called by frontend on exit)
  - `/api/upload` — Video file upload, processes all frames, saves processed video with overlays
  - `/api/video/{filename}` — Serve processed video for browser playback
  - `/api/evidence/{filename}` — Serve evidence screenshots
  - Per-student summary in upload response (CLEAN vs CHEATING DETECTED per student)
  - ffmpeg conversion via imageio-ffmpeg (bundled, no system install needed)
- `03_web_app/backend/detector.py` — ExamGuardDetector class:
  - **YOLO → Crop → MediaPipe pipeline**: YOLO finds people first, then crops each person and runs MediaPipe on the crop. This fixes distant/small face detection in classroom videos.
  - Fallback to direct full-frame MediaPipe if YOLO finds no people (webcam close-up)
  - Stable student tracking across frames using position proximity
  - Pose-to-face matching by proximity (not array index)
  - Dynamic face circle radius based on actual face size
  - All 4 detectors: head direction, eye gaze, body turning, talking detection
- `03_web_app/frontend/` — React+Vite app with:
  - Home: Live Camera / Upload Video buttons
  - Live mode: MJPEG stream, auto-releases camera on Back/close/tab close
  - Upload mode: file upload → spinner → per-student verdict cards (CLEAN/CHEATING) → processed video player → alert timeline → evidence screenshots
  - Dark theme CSS

### How to Run
```
Terminal 1 (Backend):
  cd "d:\AI Learning\usman\implementation"
  examguard_env\Scripts\activate
  cd 03_web_app/backend
  python main.py
  → http://localhost:8000

Terminal 2 (Frontend):
  cd "d:\AI Learning\usman\implementation\03_web_app\frontend"
  npm run dev
  → http://localhost:5173
```

### Known Issues & Lessons Learned
- MediaPipe FaceLandmarker CANNOT detect small/distant faces in wide-angle video — must use YOLO to crop people first, then run MediaPipe on each crop
- MediaPipe uses NEW tasks API (mp.tasks), NOT old mp.solutions API (mp.solutions removed in 0.10.33)
- Eye gaze needs rolling calibration (HISTORY_SIZE=300, MIN_READINGS=30) — hardcoded 0.5 center doesn't work
- Webcam mirror: always use cv2.flip(frame, 1)
- Camera stays open bug: sync generators don't get cancelled on client disconnect — use async generators with await asyncio.sleep() + try/finally
- OpenCV mp4v codec not playable in browsers — must convert via ffmpeg to h264
- ffmpeg `2>/dev/null` doesn't work on Windows — use subprocess with DEVNULL instead of os.system
- Masked faces (surgical masks) significantly reduce face detection accuracy

### What's Next
1. Full end-to-end testing with real exam-like video
2. Talking detection may need tuning for video upload mode
3. Consider: recording a test video with multiple people doing suspicious actions
4. Future: deploy to local network for real exam hall testing
