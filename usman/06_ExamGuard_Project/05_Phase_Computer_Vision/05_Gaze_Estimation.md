# Gaze Estimation — Detecting Where Students Are Looking

## What Is This?

Gaze estimation detects **where a person's eyes are looking** — their gaze direction. It answers the question: "Is this student looking at their own paper, at their neighbor's paper, at their phone, or at the ceiling?"

```
What the camera sees:          What gaze estimation tells you:

  [student's face]              Gaze direction: 35 degrees left
                                Translation: Looking at neighbor's paper
                                Duration: 8 seconds
                                Status: SUSPICIOUS
```

This is one of the most powerful signals for cheating detection because eye movement is the hardest thing for students to fake.

---

## WHY This Is CRITICAL for ExamGuard

**Eyes do not lie.** A student can keep their body still and their head mostly forward, but if their eyes keep darting to the neighbor's paper, they are copying.

### The Gaze Rules for Exam Monitoring:

```
Looking at own paper         → NORMAL   (expected behavior)
Looking at question paper    → NORMAL   (reading questions)
Looking up (thinking)        → NORMAL   (recalling information)
Looking at neighbor briefly  → NORMAL   (everyone glances sometimes)

Looking at neighbor > 5 sec  → SUSPICIOUS (might be copying)
Looking at lap (phone?)      → SUSPICIOUS (hidden device?)
Repeated glances at neighbor → SUSPICIOUS (pattern of copying)

Looking at neighbor > 5 sec
  + body leaning toward them → CHEATING  (high confidence)
Looking at lap + hand under desk → CHEATING (phone use)
```

### ExamGuard Gaze System:

```
Camera frame → Detect face → Find eye landmarks → Calculate gaze direction
                                                          |
                                                          v
                                              Map gaze to zones:
                                              +--------+--------+
                                              | LEFT   | RIGHT  |
                                              |NEIGHBOR| NEIGHBOR|
                                              +--------+--------+
                                              |  OWN   |  OWN   |
                                              | PAPER  | PAPER  |
                                              +--------+--------+
                                              |  LAP   |  LAP   |
                                              | (phone)| (phone)|
                                              +--------+--------+
                                                          |
                                                          v
                                              Track over time:
                                              "Left neighbor zone: 12 sec in last minute"
                                                          |
                                                          v
                                              FLAG: Sustained gaze at neighbor
```

---

## How Gaze Estimation Works

### Step 1: Detect the Face
Use face detection (from the previous lesson) to find the face in the frame.

### Step 2: Find Eye Landmarks
Locate the specific points around each eye — corners, pupils, iris.

```
Eye landmarks (6 points per eye):
    1---2---3
    |       |
    6---5---4

Iris/Pupil: Center point
```

### Step 3: Calculate Gaze Direction

```
Method 1: Pupil position relative to eye corners

Left eye:
  +--[  *  ]--+     Pupil centered = looking forward
  +--[*     ]--+    Pupil left = looking left
  +--[     *]--+    Pupil right = looking right
  +--[  *  ]--+     Pupil low = looking down
                     Pupil high = looking up

Method 2: Head pose + eye direction combined
  Head angle + Iris position = True gaze direction
```

### Step 4: Map to Zones
Convert the gaze angle to a meaningful zone (own paper, neighbor, etc.)

### Step 5: Track Over Time
A single glance means nothing. Sustained or repeated gaze at a neighbor = suspicious.

---

## Models and Libraries for Gaze Estimation

| Tool | Description | Best For |
|------|-------------|----------|
| **MediaPipe Face Mesh** | 468 face landmarks including detailed eye points | Start here — easiest |
| GazeML | Research model for precise gaze | High accuracy needed |
| L2CS-Net | Appearance-based gaze estimation | Works with any camera angle |
| OpenFace | Academic tool, very accurate | Research |
| RT-Gene | Real-time gaze estimation | Production systems |

**Recommendation:** Start with **MediaPipe Face Mesh** for eye landmarks. It is free, fast, and gives you 468 face points including detailed iris tracking.

---

## Gaze Estimation with MediaPipe

```python
import mediapipe as mp
import cv2
import numpy as np

mp_face_mesh = mp.solutions.face_mesh
mp_draw = mp.solutions.drawing_utils

# Eye landmark indices in MediaPipe Face Mesh
# Left eye: indices around the left eye
LEFT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]

# Iris landmarks
LEFT_IRIS = [474, 475, 476, 477]
RIGHT_IRIS = [469, 470, 471, 472]

cap = cv2.VideoCapture(0)

with mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,  # Includes iris landmarks
    min_detection_confidence=0.5
) as face_mesh:

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)

        if results.multi_face_landmarks:
            face = results.multi_face_landmarks[0]

            # Get iris centers
            left_iris_pts = [face.landmark[i] for i in LEFT_IRIS]
            right_iris_pts = [face.landmark[i] for i in RIGHT_IRIS]

            left_iris_center = (
                int(np.mean([p.x for p in left_iris_pts]) * w),
                int(np.mean([p.y for p in left_iris_pts]) * h)
            )
            right_iris_center = (
                int(np.mean([p.x for p in right_iris_pts]) * w),
                int(np.mean([p.y for p in right_iris_pts]) * h)
            )

            # Get eye corners for reference
            left_eye_inner = face.landmark[362]
            left_eye_outer = face.landmark[263]
            right_eye_inner = face.landmark[133]
            right_eye_outer = face.landmark[33]

            # Calculate horizontal gaze ratio for left eye
            eye_width = abs(left_eye_outer.x - left_eye_inner.x)
            if eye_width > 0:
                iris_relative_x = (np.mean([p.x for p in left_iris_pts]) - left_eye_inner.x) / eye_width
            else:
                iris_relative_x = 0.5

            # Determine gaze direction
            if iris_relative_x < 0.35:
                gaze = "Looking RIGHT"
                color = (0, 165, 255)
            elif iris_relative_x > 0.65:
                gaze = "Looking LEFT"
                color = (0, 165, 255)
            else:
                gaze = "Looking CENTER"
                color = (0, 255, 0)

            # Draw iris points
            cv2.circle(frame, left_iris_center, 3, (0, 255, 0), -1)
            cv2.circle(frame, right_iris_center, 3, (0, 255, 0), -1)

            # Display gaze direction
            cv2.putText(frame, gaze, (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
            cv2.putText(frame, f'Iris ratio: {iris_relative_x:.2f}', (10, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

        cv2.imshow('Gaze Estimation', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
```

---

## Adding Vertical Gaze (Up/Down)

```python
def get_gaze_direction(face_landmarks, frame_width, frame_height):
    """Calculate both horizontal and vertical gaze direction."""

    # Get iris positions
    left_iris = [face_landmarks.landmark[i] for i in LEFT_IRIS]
    right_iris = [face_landmarks.landmark[i] for i in RIGHT_IRIS]

    # Average iris position
    iris_x = np.mean([p.x for p in left_iris + right_iris])
    iris_y = np.mean([p.y for p in left_iris + right_iris])

    # Eye boundary reference points
    # Top of eye, bottom of eye for vertical reference
    left_eye_top = face_landmarks.landmark[386].y
    left_eye_bottom = face_landmarks.landmark[374].y
    eye_height = abs(left_eye_bottom - left_eye_top)

    # Horizontal reference
    left_eye_inner = face_landmarks.landmark[362].x
    left_eye_outer = face_landmarks.landmark[263].x
    eye_width = abs(left_eye_outer - left_eye_inner)

    # Horizontal ratio (0 = looking right, 1 = looking left)
    h_ratio = (np.mean([p.x for p in left_iris]) - left_eye_inner) / eye_width if eye_width > 0 else 0.5

    # Vertical ratio (0 = looking up, 1 = looking down)
    v_ratio = (np.mean([p.y for p in left_iris]) - left_eye_top) / eye_height if eye_height > 0 else 0.5

    # Map to zones
    if h_ratio < 0.35:
        h_zone = "right"      # Looking right (from their perspective)
    elif h_ratio > 0.65:
        h_zone = "left"       # Looking left
    else:
        h_zone = "center"

    if v_ratio < 0.35:
        v_zone = "up"
    elif v_ratio > 0.65:
        v_zone = "down"
    else:
        v_zone = "center"

    return h_zone, v_zone, h_ratio, v_ratio
```

---

## ExamGuard Gaze Zones

```python
def map_gaze_to_exam_zone(h_zone, v_zone):
    """
    Map gaze direction to meaningful exam zones.

    Zones (from student's perspective sitting at desk):
      UP + CENTER    = Looking at board/ceiling (thinking or reading board)
      CENTER + CENTER = Looking at own paper (normal)
      DOWN + CENTER  = Looking at own lap (possible phone)
      LEFT + CENTER  = Looking at left neighbor (possible copying)
      RIGHT + CENTER = Looking at right neighbor (possible copying)
      DOWN + LEFT    = Looking at left neighbor's paper on desk
      DOWN + RIGHT   = Looking at right neighbor's paper on desk
    """

    zone_map = {
        ('center', 'center'): ('own_paper', 'NORMAL'),
        ('center', 'down'):   ('own_paper', 'NORMAL'),
        ('center', 'up'):     ('thinking', 'NORMAL'),
        ('left', 'center'):   ('left_neighbor', 'WATCH'),
        ('right', 'center'):  ('right_neighbor', 'WATCH'),
        ('left', 'down'):     ('left_desk', 'SUSPICIOUS'),
        ('right', 'down'):    ('right_desk', 'SUSPICIOUS'),
        ('left', 'up'):       ('left_wall', 'NORMAL'),
        ('right', 'up'):      ('right_wall', 'NORMAL'),
    }

    return zone_map.get((h_zone, v_zone), ('unknown', 'WATCH'))
```

---

## Tracking Gaze Over Time — The Key to Catching Cheaters

A single glance at a neighbor means nothing. Tracking patterns is everything.

```python
from collections import deque
import time

class GazeTracker:
    def __init__(self, window_seconds=60, fps=30):
        self.history = deque(maxlen=window_seconds * fps)
        self.fps = fps

    def add_gaze(self, zone, status):
        self.history.append({
            'zone': zone,
            'status': status,
            'time': time.time()
        })

    def analyze(self):
        """Analyze gaze patterns over the last minute."""
        if len(self.history) < self.fps * 5:  # Need at least 5 seconds of data
            return "NORMAL", "Insufficient data"

        # Count time spent in each zone (last 60 seconds)
        zone_counts = {}
        for entry in self.history:
            zone = entry['zone']
            zone_counts[zone] = zone_counts.get(zone, 0) + 1

        total = len(self.history)

        # Calculate percentages
        neighbor_time = (
            zone_counts.get('left_neighbor', 0) +
            zone_counts.get('right_neighbor', 0) +
            zone_counts.get('left_desk', 0) +
            zone_counts.get('right_desk', 0)
        )
        neighbor_pct = neighbor_time / total * 100

        own_paper_time = zone_counts.get('own_paper', 0)
        own_paper_pct = own_paper_time / total * 100

        # Decision rules
        if neighbor_pct > 30:
            return "CHEATING", f"Looking at neighbor {neighbor_pct:.0f}% of last minute"
        elif neighbor_pct > 15:
            return "SUSPICIOUS", f"Looking at neighbor {neighbor_pct:.0f}% of last minute"
        elif own_paper_pct < 40:
            return "SUSPICIOUS", f"Looking at own paper only {own_paper_pct:.0f}% of time"
        else:
            return "NORMAL", f"Own paper: {own_paper_pct:.0f}%, Neighbor: {neighbor_pct:.0f}%"

# Usage
tracker = GazeTracker()

# In your main loop:
# h_zone, v_zone, _, _ = get_gaze_direction(face_landmarks, w, h)
# zone, status = map_gaze_to_exam_zone(h_zone, v_zone)
# tracker.add_gaze(zone, status)
# alert_level, reason = tracker.analyze()
```

---

## Challenges and Limitations

| Challenge | Description | Mitigation |
|-----------|-------------|------------|
| Camera angle | Works best with front-facing cameras | Install cameras at eye level |
| Distance | Accuracy drops beyond 2-3 meters | Use higher resolution cameras |
| Glasses | Reflections can confuse iris detection | Use models trained on glasses-wearing faces |
| Low light | Pupil detection is harder in dim lighting | Ensure adequate hall lighting |
| Fast eye movement | Quick saccades may be missed | Higher FPS cameras (60fps) |
| Multiple students | Need to track each student separately | Combine with face detection for per-student tracking |

**ExamGuard design decision:** Place cameras close to students (every 2 rows) and use 60fps where possible for gaze accuracy.

---

## Mini Project: Simple Gaze Tracker

**Goal:** Build a real-time gaze tracker that shows "Looking Left / Right / Center" and displays how long you have been looking in each direction.

```python
import mediapipe as mp
import cv2
import numpy as np
import time
from collections import defaultdict

mp_face_mesh = mp.solutions.face_mesh

LEFT_IRIS = [474, 475, 476, 477]
RIGHT_IRIS = [469, 470, 471, 472]

cap = cv2.VideoCapture(0)

# Track time in each direction
gaze_time = defaultdict(float)
last_gaze = None
last_time = time.time()

with mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5
) as face_mesh:

    print("Gaze Tracker Running — Press 'q' to quit and see stats")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)

        current_gaze = "No face"

        if results.multi_face_landmarks:
            face = results.multi_face_landmarks[0]

            # Get iris positions
            left_iris = [face.landmark[i] for i in LEFT_IRIS]

            # Get eye boundary
            left_inner = face.landmark[362].x
            left_outer = face.landmark[263].x
            eye_width = abs(left_outer - left_inner)

            if eye_width > 0:
                iris_x = np.mean([p.x for p in left_iris])
                ratio = (iris_x - left_inner) / eye_width

                # Vertical
                eye_top = face.landmark[386].y
                eye_bottom = face.landmark[374].y
                eye_h = abs(eye_bottom - eye_top)
                if eye_h > 0:
                    iris_y = np.mean([p.y for p in left_iris])
                    v_ratio = (iris_y - eye_top) / eye_h
                else:
                    v_ratio = 0.5

                # Determine direction
                if ratio < 0.38:
                    h_dir = "RIGHT"
                elif ratio > 0.62:
                    h_dir = "LEFT"
                else:
                    h_dir = "CENTER"

                if v_ratio < 0.38:
                    v_dir = "UP"
                elif v_ratio > 0.62:
                    v_dir = "DOWN"
                else:
                    v_dir = "CENTER"

                current_gaze = f"{h_dir} {v_dir}"

                # Draw iris markers
                for iris_list in [LEFT_IRIS, RIGHT_IRIS]:
                    pts = [(int(face.landmark[i].x * w), int(face.landmark[i].y * h))
                           for i in iris_list]
                    center = (int(np.mean([p[0] for p in pts])),
                              int(np.mean([p[1] for p in pts])))
                    cv2.circle(frame, center, 4, (0, 255, 0), -1)

                # Color based on direction
                if h_dir == "CENTER" and v_dir in ["CENTER", "DOWN"]:
                    color = (0, 255, 0)      # Green — looking at paper
                elif h_dir != "CENTER":
                    color = (0, 0, 255)      # Red — looking sideways
                else:
                    color = (0, 165, 255)    # Orange — looking up

                cv2.putText(frame, f'Gaze: {current_gaze}', (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)

        # Track time
        now = time.time()
        if last_gaze:
            gaze_time[last_gaze] += (now - last_time)
        last_gaze = current_gaze
        last_time = now

        # Display time stats
        total_time = sum(gaze_time.values()) or 1
        y_pos = 70
        for direction, seconds in sorted(gaze_time.items(), key=lambda x: -x[1]):
            pct = seconds / total_time * 100
            text = f'{direction}: {seconds:.1f}s ({pct:.0f}%)'
            cv2.putText(frame, text, (10, y_pos),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            y_pos += 25

        cv2.imshow('Gaze Tracker', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()

# Final report
print("\n" + "=" * 40)
print("GAZE TRACKING REPORT")
print("=" * 40)
total = sum(gaze_time.values())
for direction, seconds in sorted(gaze_time.items(), key=lambda x: -x[1]):
    pct = seconds / total * 100 if total > 0 else 0
    print(f"  {direction:>20}: {seconds:6.1f}s ({pct:5.1f}%)")
print(f"\n  Total tracked time: {total:.1f}s")
```

### What to Try:
1. Look at your screen (center) — should show green "CENTER"
2. Look to the left — should show red "LEFT"
3. Look to the right — should show red "RIGHT"
4. Look up — should show orange "UP"
5. Look down at your keyboard — should show "DOWN"
6. After a minute, quit and check the time distribution report

### What You Will Learn:
- How iris tracking works with MediaPipe
- Mapping eye positions to gaze directions
- Tracking gaze distribution over time
- The exact logic ExamGuard uses to flag suspicious eye movements

---

## Key Takeaway

Gaze estimation is one of ExamGuard's most powerful cheating signals. A student can keep their body still and head forward, but their eyes reveal where their attention is. By tracking gaze patterns over time — not just single glances — ExamGuard can distinguish between normal brief eye movements and sustained copying behavior with high confidence. Combined with pose estimation and face detection, gaze estimation completes ExamGuard's ability to understand exactly what each student is doing at every moment.
