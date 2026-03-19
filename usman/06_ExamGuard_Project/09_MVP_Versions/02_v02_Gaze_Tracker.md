# Version 0.2 — Gaze Tracker

## BUILD THIS AFTER: Phase 5 (Object Detection & Classification)

## What This Version Does

Single camera. Tracks where each student is looking. Alerts if a student stares at a neighbor's paper for too long.

```
Camera → Detect faces → Track eye direction → Measure duration → Alert if too long
```

This adds BEHAVIORAL detection to ExamGuard. v0.1 detected OBJECTS (phones). v0.2 detects BEHAVIOR (looking at neighbors).

---

## Why Gaze Tracking

```
Most common cheating method: Looking at a neighbor's paper
How an invigilator catches it: Sees a student staring sideways for too long
ExamGuard v0.2 does the same thing, but never blinks or gets distracted
```

A quick glance (0.5 seconds) → normal, everyone does it.
A sustained stare (10+ seconds) at someone's paper → suspicious.
Repeated stares (5 times in 10 minutes) → very suspicious.

---

## Tech Stack

```
Component          Technology              Purpose
─────────────────────────────────────────────────────────
Camera input       OpenCV                  Read webcam or IP camera
Face detection     MediaPipe Face Mesh     Find face and 468 face landmarks
Eye detection      MediaPipe (built-in)    Locate eyes precisely
Gaze calculation   Custom math             Calculate where eyes point
Time tracking      Python                  Measure gaze duration
Alert              Print + save evidence   Show alert when threshold exceeded
```

---

## How Gaze Tracking Works

### The Pipeline

```
Frame from camera
    ↓
MediaPipe Face Mesh → finds 468 points on face
    ↓
Extract eye landmarks (6 points per eye)
    ↓
Calculate iris position relative to eye corners
    ↓
Determine gaze direction: LEFT, RIGHT, CENTER, UP, DOWN
    ↓
Track duration: "Looking LEFT for 8.3 seconds..."
    ↓
If LEFT > 10 seconds → ALERT
```

### The Math (Simplified)

```
Eye landmarks:

  Left corner (P1) ←─── eye ───→ Right corner (P2)
                    (iris center)

Ratio = distance(iris, left_corner) / distance(left_corner, right_corner)

If ratio < 0.35 → Looking LEFT  (eyes shifted to the left)
If ratio > 0.65 → Looking RIGHT (eyes shifted to the right)
If 0.35-0.65    → Looking CENTER (straight ahead)
```

---

## Step-by-Step Build Guide

### Step 1: Install MediaPipe

```bash
pip install mediapipe opencv-python numpy
```

### Step 2: Detect Face and Eye Landmarks

```python
import cv2
import mediapipe as mp
import numpy as np

# Initialize MediaPipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=5,          # Track up to 5 faces
    refine_landmarks=True,     # Include iris landmarks
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Convert to RGB (MediaPipe needs RGB)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # Detect face landmarks
    results = face_mesh.process(rgb_frame)

    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            # There are 468 landmarks on the face
            # Draw them (for debugging)
            h, w = frame.shape[:2]
            for lm in face_landmarks.landmark:
                x, y = int(lm.x * w), int(lm.y * h)
                cv2.circle(frame, (x, y), 1, (0, 255, 0), -1)

    cv2.imshow("Face Mesh", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
```

### Step 3: Calculate Gaze Direction

```python
# Key landmark indices for eyes:
# Left eye:  [33, 160, 158, 133, 153, 144]  (corners and edges)
# Right eye: [362, 385, 387, 263, 373, 380]
# Left iris:  [468, 469, 470, 471, 472]
# Right iris: [473, 474, 475, 476, 477]

LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
LEFT_IRIS = [468, 469, 470, 471, 472]
RIGHT_IRIS = [473, 474, 475, 476, 477]

def get_gaze_direction(landmarks, frame_shape):
    """Calculate where the person is looking."""
    h, w = frame_shape[:2]

    # Get iris center (average of iris landmarks)
    left_iris_x = np.mean([landmarks[i].x for i in LEFT_IRIS]) * w
    right_iris_x = np.mean([landmarks[i].x for i in RIGHT_IRIS]) * w

    # Get eye corner positions
    left_eye_left = landmarks[33].x * w    # Left corner of left eye
    left_eye_right = landmarks[133].x * w  # Right corner of left eye
    right_eye_left = landmarks[362].x * w
    right_eye_right = landmarks[263].x * w

    # Calculate ratio for left eye
    left_eye_width = left_eye_right - left_eye_left
    if left_eye_width == 0:
        return "UNKNOWN"
    left_ratio = (left_iris_x - left_eye_left) / left_eye_width

    # Calculate ratio for right eye
    right_eye_width = right_eye_right - right_eye_left
    if right_eye_width == 0:
        return "UNKNOWN"
    right_ratio = (right_iris_x - right_eye_left) / right_eye_width

    # Average both eyes
    avg_ratio = (left_ratio + right_ratio) / 2

    # Determine direction
    if avg_ratio < 0.35:
        return "LEFT"
    elif avg_ratio > 0.65:
        return "RIGHT"
    else:
        return "CENTER"
```

### Step 4: Track Duration and Alert

```python
import time
from collections import defaultdict

# Track gaze for each detected face
gaze_tracker = defaultdict(lambda: {
    'direction': 'CENTER',
    'start_time': time.time(),
    'total_left': 0,
    'total_right': 0,
    'alert_count': 0
})

GAZE_ALERT_THRESHOLD = 10  # Seconds of sustained side-gaze

def update_gaze(face_id, direction):
    """Track how long someone looks in each direction."""
    tracker = gaze_tracker[face_id]
    current_time = time.time()

    if direction != tracker['direction']:
        # Direction changed — calculate duration of previous gaze
        duration = current_time - tracker['start_time']

        if tracker['direction'] == 'LEFT':
            tracker['total_left'] += duration
        elif tracker['direction'] == 'RIGHT':
            tracker['total_right'] += duration

        # Reset timer for new direction
        tracker['direction'] = direction
        tracker['start_time'] = current_time
    else:
        # Same direction — check if threshold exceeded
        duration = current_time - tracker['start_time']

        if direction in ['LEFT', 'RIGHT'] and duration > GAZE_ALERT_THRESHOLD:
            return True, duration  # ALERT!

    return False, 0
```

### Step 5: Complete v0.2 System

```python
"""
ExamGuard v0.2 — Gaze Tracker
Monitors where students look and alerts on sustained sideways gaze.
"""

import cv2
import mediapipe as mp
import numpy as np
import time
from datetime import datetime
import os

# Setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=5,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

LEFT_IRIS = [468, 469, 470, 471, 472]
RIGHT_IRIS = [473, 474, 475, 476, 477]

cap = cv2.VideoCapture(0)
os.makedirs("evidence", exist_ok=True)

# Per-face tracking
face_gaze_start = {}  # face_index → time when side-gaze started
ALERT_THRESHOLD = 10  # seconds

print("=" * 50)
print("ExamGuard v0.2 — Gaze Tracker")
print("=" * 50)
print(f"Alert threshold: {ALERT_THRESHOLD} seconds of sustained side-gaze")
print("Monitoring started. Press 'q' to quit.\n")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)
    h, w = frame.shape[:2]

    if results.multi_face_landmarks:
        for face_idx, face_lm in enumerate(results.multi_face_landmarks):
            lm = face_lm.landmark

            # Calculate gaze direction
            left_iris_x = np.mean([lm[i].x for i in LEFT_IRIS]) * w
            left_eye_left = lm[33].x * w
            left_eye_right = lm[133].x * w
            right_iris_x = np.mean([lm[i].x for i in RIGHT_IRIS]) * w
            right_eye_left = lm[362].x * w
            right_eye_right = lm[263].x * w

            left_width = left_eye_right - left_eye_left
            right_width = right_eye_right - right_eye_left

            if left_width > 0 and right_width > 0:
                left_ratio = (left_iris_x - left_eye_left) / left_width
                right_ratio = (right_iris_x - right_eye_left) / right_width
                avg_ratio = (left_ratio + right_ratio) / 2

                if avg_ratio < 0.35:
                    direction = "LEFT"
                elif avg_ratio > 0.65:
                    direction = "RIGHT"
                else:
                    direction = "CENTER"

                # Track duration
                looking_sideways = direction in ["LEFT", "RIGHT"]

                if looking_sideways:
                    if face_idx not in face_gaze_start:
                        face_gaze_start[face_idx] = time.time()

                    duration = time.time() - face_gaze_start[face_idx]

                    # Draw info
                    nose = lm[1]
                    cx, cy = int(nose.x * w), int(nose.y * h)

                    color = (0, 255, 255) if duration < ALERT_THRESHOLD else (0, 0, 255)
                    cv2.putText(frame, f"Looking {direction}: {duration:.1f}s",
                               (cx - 80, cy - 40), cv2.FONT_HERSHEY_SIMPLEX,
                               0.6, color, 2)

                    # ALERT if threshold exceeded
                    if duration > ALERT_THRESHOLD:
                        timestamp = datetime.now().strftime("%H:%M:%S")
                        print(f"[{timestamp}] *** ALERT: Face {face_idx} looking "
                              f"{direction} for {duration:.1f}s ***")

                        evidence_name = f"evidence/gaze_{datetime.now().strftime('%H%M%S')}.jpg"
                        cv2.imwrite(evidence_name, frame)

                        # Draw red box around face
                        face_x = [int(lm[i].x * w) for i in range(468)]
                        face_y = [int(lm[i].y * h) for i in range(468)]
                        cv2.rectangle(frame,
                                     (min(face_x)-10, min(face_y)-10),
                                     (max(face_x)+10, max(face_y)+10),
                                     (0, 0, 255), 3)
                else:
                    # Looking center — reset timer
                    if face_idx in face_gaze_start:
                        del face_gaze_start[face_idx]

                    nose = lm[1]
                    cx, cy = int(nose.x * w), int(nose.y * h)
                    cv2.putText(frame, "Looking: CENTER",
                               (cx - 60, cy - 40), cv2.FONT_HERSHEY_SIMPLEX,
                               0.6, (0, 255, 0), 2)

    # Status bar
    cv2.putText(frame, "ExamGuard v0.2 - Gaze Tracker", (10, 30),
               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    cv2.imshow("ExamGuard v0.2", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

---

## Success Criteria

```
Metric                           Target
──────────────────────────────────────────
Detect gaze direction            > 85% accuracy
Sustained side-gaze alert        Triggers after 10 seconds
False alarm rate                 < 10%
Works with multiple faces        Up to 5 faces simultaneously
Saves evidence screenshot        Yes
```

---

## Known Limitations

```
- Accuracy drops with glasses (reflections confuse iris detection)
- Does not work well if face is too far from camera
- Cannot tell the difference between looking at neighbor vs looking at wall
- Head rotation can confuse gaze vs head direction
- These will be improved in later versions with more sophisticated models
```

---

## What You Will Learn

1. MediaPipe face mesh and landmark detection
2. Eye and iris tracking with computer vision
3. Geometric calculations for gaze direction
4. Time-based event tracking (duration monitoring)
5. Building on top of existing CV libraries

---

## Next: Combine v0.1 + v0.2 into v0.3

After building this, you have TWO detection capabilities:
- Phone detection (v0.1)
- Gaze tracking (v0.2)

Version 0.3 will COMBINE these with body posture and anomaly detection into a unified behavior monitor.
