# Version 0.3 — Behavior Monitor

## BUILD THIS AFTER: Phase 6 (Advanced ML)

## What This Version Does

Single camera. Combines EVERYTHING from v0.1 and v0.2 plus body posture analysis and anomaly detection. For the first time, the system understands BEHAVIOR, not just objects or gaze.

```
Camera → YOLO (objects) + Gaze (eyes) + Pose (body) + Autoencoder (anomaly)
    ↓
Confidence scoring: Low / Medium / High
    ↓
Smart alert with evidence
```

This is the first version that feels like a REAL exam monitoring system.

---

## What Makes v0.3 Different

```
v0.1: "I see a phone"                → One signal
v0.2: "Student looking sideways"     → One signal
v0.3: "Student looking sideways AND  → Multiple signals COMBINED
       leaning toward neighbor AND
       hands not writing AND
       this behavior is unusual for
       this student"
       → CONFIDENCE: HIGH
```

The power is in COMBINING multiple signals. Each signal alone might be innocent. Together they tell a story.

---

## Tech Stack

```
Component           Technology              Purpose
───────────────────────────────────────────────────────────────
Camera input        OpenCV                  Read camera feed
Object detection    YOLOv8 (fine-tuned)     Detect phones, notes, objects
Gaze tracking       MediaPipe Face Mesh     Where are eyes looking
Body pose           MediaPipe Pose          Body posture and movement
Anomaly detection   Autoencoder             Unusual behavior detection
Scoring engine      Custom Python           Combine signals into score
Alert system        Print + evidence save   Alert on high confidence
```

---

## The Confidence Scoring System

### How It Works

Each detection method gives a score. Scores are combined into an overall confidence level.

```python
class ConfidenceScorer:
    """
    Combine multiple signals into a single confidence score.
    """

    def __init__(self):
        # Weights: how much each signal matters
        self.weights = {
            'phone_detected': 0.40,        # Strong evidence
            'gaze_at_neighbor': 0.25,       # Medium evidence
            'body_leaning': 0.15,           # Supporting evidence
            'hands_not_writing': 0.10,      # Minor signal
            'anomaly_score': 0.10,          # Background check
        }

        # Thresholds for alert levels
        self.thresholds = {
            'low': 0.3,
            'medium': 0.5,
            'high': 0.7,
        }

    def calculate(self, signals):
        """
        signals = {
            'phone_detected': 0.0 or confidence,
            'gaze_at_neighbor': 0.0 to 1.0 (based on duration),
            'body_leaning': 0.0 to 1.0 (based on angle),
            'hands_not_writing': 0.0 or 1.0,
            'anomaly_score': 0.0 to 1.0
        }
        """
        total = 0
        for signal, value in signals.items():
            weight = self.weights.get(signal, 0)
            total += weight * value

        # Determine alert level
        if total >= self.thresholds['high']:
            level = "HIGH"
        elif total >= self.thresholds['medium']:
            level = "MEDIUM"
        elif total >= self.thresholds['low']:
            level = "LOW"
        else:
            level = "NONE"

        return total, level
```

### Examples

```
Scenario 1: Student stretching
  phone_detected: 0.0
  gaze_at_neighbor: 0.0
  body_leaning: 0.3 (leaning back, not toward neighbor)
  hands_not_writing: 1.0 (hands up stretching)
  anomaly_score: 0.1
  TOTAL: 0.0 + 0.0 + 0.045 + 0.1 + 0.01 = 0.155
  LEVEL: NONE ← Correct! Just stretching.

Scenario 2: Quick glance at neighbor
  phone_detected: 0.0
  gaze_at_neighbor: 0.3 (brief, < 3 seconds)
  body_leaning: 0.0
  hands_not_writing: 0.0 (still writing)
  anomaly_score: 0.1
  TOTAL: 0.0 + 0.075 + 0.0 + 0.0 + 0.01 = 0.085
  LEVEL: NONE ← Correct! Just a quick glance.

Scenario 3: Sustained gaze + leaning
  phone_detected: 0.0
  gaze_at_neighbor: 0.8 (8+ seconds)
  body_leaning: 0.7 (leaning toward neighbor)
  hands_not_writing: 1.0
  anomaly_score: 0.5
  TOTAL: 0.0 + 0.2 + 0.105 + 0.1 + 0.05 = 0.455
  LEVEL: MEDIUM ← Suspicious, worth watching

Scenario 4: Phone + gaze + leaning (everything)
  phone_detected: 0.9
  gaze_at_neighbor: 0.8
  body_leaning: 0.6
  hands_not_writing: 1.0
  anomaly_score: 0.7
  TOTAL: 0.36 + 0.2 + 0.09 + 0.1 + 0.07 = 0.82
  LEVEL: HIGH ← Very likely cheating!
```

---

## Step-by-Step Build Guide

### Step 1: Body Pose Detection with MediaPipe

```python
import cv2
import mediapipe as mp
import numpy as np

mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

def analyze_body_pose(frame):
    """Detect body posture and calculate lean angle."""
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(rgb)

    if not results.pose_landmarks:
        return 0, "UNKNOWN"

    lm = results.pose_landmarks.landmark
    h, w = frame.shape[:2]

    # Key points
    left_shoulder = np.array([lm[11].x * w, lm[11].y * h])
    right_shoulder = np.array([lm[12].x * w, lm[12].y * h])
    nose = np.array([lm[0].x * w, lm[0].y * h])

    # Shoulder midpoint
    shoulder_mid = (left_shoulder + right_shoulder) / 2

    # Lean angle: how far nose is from shoulder midpoint (horizontally)
    lean_offset = nose[0] - shoulder_mid[0]

    # Normalize: positive = leaning right, negative = leaning left
    shoulder_width = np.linalg.norm(left_shoulder - right_shoulder)
    if shoulder_width == 0:
        return 0, "UNKNOWN"

    lean_ratio = lean_offset / shoulder_width

    # Determine lean direction
    if lean_ratio < -0.3:
        direction = "LEANING_LEFT"
    elif lean_ratio > 0.3:
        direction = "LEANING_RIGHT"
    else:
        direction = "UPRIGHT"

    lean_score = min(abs(lean_ratio) / 0.5, 1.0)  # 0 to 1

    return lean_score, direction
```

### Step 2: Hand Activity Detection

```python
def analyze_hand_activity(pose_landmarks, frame_shape):
    """Check if hands are in writing position."""
    if not pose_landmarks:
        return True  # Assume writing if cannot detect

    lm = pose_landmarks.landmark
    h, w = frame_shape[:2]

    # Wrist positions
    left_wrist = np.array([lm[15].x * w, lm[15].y * h])
    right_wrist = np.array([lm[16].x * w, lm[16].y * h])

    # Hip position (desk level reference)
    left_hip = np.array([lm[23].x * w, lm[23].y * h])
    right_hip = np.array([lm[24].x * w, lm[24].y * h])
    hip_level = (left_hip[1] + right_hip[1]) / 2

    # If wrists are near hip level → writing position
    # If wrists are higher → not writing (reaching, gesturing, etc.)
    left_writing = left_wrist[1] > hip_level * 0.7
    right_writing = right_wrist[1] > hip_level * 0.7

    is_writing = left_writing or right_writing
    return is_writing
```

### Step 3: Autoencoder for Anomaly Detection

```python
import torch
import torch.nn as nn

class BehaviorAutoencoder(nn.Module):
    """Learns normal behavior, flags unusual patterns."""

    def __init__(self, input_dim=20):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 8),   # Compress to just 8 numbers
        )
        self.decoder = nn.Sequential(
            nn.Linear(8, 32),
            nn.ReLU(),
            nn.Linear(32, 64),
            nn.ReLU(),
            nn.Linear(64, input_dim),
        )

    def forward(self, x):
        encoded = self.encoder(x)
        decoded = self.decoder(encoded)
        return decoded

def extract_behavior_features(gaze_dir, lean_score, lean_dir, is_writing,
                               phone_detected, phone_conf):
    """Convert all signals into a feature vector for the autoencoder."""
    features = [
        1.0 if gaze_dir == "LEFT" else 0.0,
        1.0 if gaze_dir == "RIGHT" else 0.0,
        1.0 if gaze_dir == "CENTER" else 0.0,
        lean_score,
        1.0 if lean_dir == "LEANING_LEFT" else 0.0,
        1.0 if lean_dir == "LEANING_RIGHT" else 0.0,
        1.0 if lean_dir == "UPRIGHT" else 0.0,
        1.0 if is_writing else 0.0,
        phone_conf if phone_detected else 0.0,
        # Add more features as needed to reach input_dim
    ]
    # Pad to input_dim
    while len(features) < 20:
        features.append(0.0)

    return torch.tensor(features, dtype=torch.float32)

def get_anomaly_score(autoencoder, features):
    """Higher score = more unusual behavior."""
    autoencoder.eval()
    with torch.no_grad():
        reconstructed = autoencoder(features.unsqueeze(0))
        error = torch.mean((features - reconstructed.squeeze()) ** 2).item()
    return min(error / 0.5, 1.0)  # Normalize to 0-1
```

### Step 4: Complete v0.3 System

```python
"""
ExamGuard v0.3 — Behavior Monitor
Combines phone detection + gaze tracking + body pose + anomaly detection.
Multi-signal confidence scoring.
"""

import cv2
import mediapipe as mp
import numpy as np
from ultralytics import YOLO
from datetime import datetime
import time
import os

# Initialize all models
yolo_model = YOLO("phone_detector_model.pt")
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=5, refine_landmarks=True)
mp_pose = mp.solutions.pose
pose_detector = mp_pose.Pose()

# Initialize scorer
scorer = ConfidenceScorer()  # From above

# Camera
cap = cv2.VideoCapture(0)
os.makedirs("evidence", exist_ok=True)

# Gaze tracking state
gaze_start_times = {}

print("=" * 50)
print("ExamGuard v0.3 — Behavior Monitor")
print("=" * 50)
print("Multi-signal monitoring active.\n")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # ─── Signal 1: Phone Detection (YOLO) ───
    yolo_results = yolo_model(frame, verbose=False)
    phone_detected = False
    phone_conf = 0.0
    for box in yolo_results[0].boxes:
        if yolo_model.names[int(box.cls)] == "phone" and float(box.conf) > 0.6:
            phone_detected = True
            phone_conf = float(box.conf)
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

    # ─── Signal 2: Gaze Direction (MediaPipe Face Mesh) ───
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    face_results = face_mesh.process(rgb)
    gaze_score = 0.0
    gaze_dir = "UNKNOWN"

    if face_results.multi_face_landmarks:
        for idx, face_lm in enumerate(face_results.multi_face_landmarks):
            gaze_dir = calculate_gaze(face_lm.landmark, frame.shape)

            if gaze_dir in ["LEFT", "RIGHT"]:
                if idx not in gaze_start_times:
                    gaze_start_times[idx] = time.time()
                duration = time.time() - gaze_start_times[idx]
                gaze_score = min(duration / 15.0, 1.0)  # Max at 15 seconds
            else:
                gaze_start_times.pop(idx, None)
                gaze_score = 0.0

    # ─── Signal 3: Body Pose (MediaPipe Pose) ───
    pose_results = pose_detector.process(rgb)
    lean_score = 0.0
    is_writing = True

    if pose_results.pose_landmarks:
        lean_score, lean_dir = analyze_body_pose(frame)
        is_writing = analyze_hand_activity(pose_results.pose_landmarks, frame.shape)

    # ─── Signal 4: Anomaly Score (Autoencoder) ───
    # (Use 0.0 if autoencoder not trained yet)
    anomaly_score = 0.0

    # ─── Combine All Signals ───
    signals = {
        'phone_detected': phone_conf if phone_detected else 0.0,
        'gaze_at_neighbor': gaze_score,
        'body_leaning': lean_score,
        'hands_not_writing': 0.0 if is_writing else 1.0,
        'anomaly_score': anomaly_score,
    }

    total_score, alert_level = scorer.calculate(signals)

    # ─── Display ───
    colors = {"NONE": (0, 255, 0), "LOW": (0, 255, 255),
              "MEDIUM": (0, 165, 255), "HIGH": (0, 0, 255)}
    color = colors.get(alert_level, (255, 255, 255))

    # Status bar
    cv2.putText(frame, f"ExamGuard v0.3 | Score: {total_score:.2f} | {alert_level}",
               (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

    # Signal details
    y_pos = 60
    for signal, value in signals.items():
        text = f"{signal}: {value:.2f}"
        cv2.putText(frame, text, (10, y_pos),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        y_pos += 20

    # Alert
    if alert_level in ["MEDIUM", "HIGH"]:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {alert_level} ALERT | Score: {total_score:.2f} | "
              f"Signals: {signals}")
        evidence = f"evidence/behavior_{datetime.now().strftime('%H%M%S')}.jpg"
        cv2.imwrite(evidence, frame)

    cv2.imshow("ExamGuard v0.3 - Behavior Monitor", frame)
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
Multi-signal detection           All 4 signals working
Confidence scoring               Correct level for test scenarios
False alarm rate                 < 8% (lower than v0.1 and v0.2)
Detection of combined behaviors  > 85%
Processing speed                 > 15 fps on GPU
```

---

## What Comes Next

v0.3 works on ONE camera with ONE student (or a few). The next version (v1.0) adds:
- Multiple cameras (4-5)
- A real dashboard for the invigilator
- Database storage
- API for communication
- This is the jump from prototype to PRODUCT.
