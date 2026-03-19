# ExamGuard System Architecture

## What is System Architecture?

System architecture is the **blueprint** of how all the parts of a system connect together. Just like a building has a blueprint showing where walls, doors, and wires go, ExamGuard has an architecture showing how cameras, AI models, and dashboards connect.

Before writing a single line of code, you need to understand the big picture.

---

## Hardware Setup

### Exam Hall Cameras

```
+-----------------------------------------------------------+
|                     EXAM HALL                              |
|                                                            |
|   [CAM 1]          [CAM 2]          [CAM 3]               |
|   (Front-Left)     (Front-Center)   (Front-Right)          |
|                                                            |
|   Student Student Student Student Student Student          |
|   Student Student Student Student Student Student          |
|   Student Student Student Student Student Student          |
|   Student Student Student Student Student Student          |
|   Student Student Student Student Student Student          |
|                                                            |
|           [CAM 4]              [CAM 5]                     |
|           (Back-Left)          (Back-Right)                 |
+-----------------------------------------------------------+
```

**Why 5 cameras per hall?**
- 3 front cameras: Cover the faces and upper body of students (gaze detection needs to see eyes)
- 2 back cameras: Cover the desks and hands (object detection needs to see what's on the desk)
- Overlapping coverage ensures no blind spots

### Control Room

```
+------------------------------------------+
|              CONTROL ROOM                 |
|                                          |
|   [Processing Server]  [Dashboard PC]    |
|   - GPU for AI         - Alert screen    |
|   - Receives feeds     - Video clips     |
|   - Runs models        - Statistics      |
|                                          |
|   [Invigilator 1]     [Invigilator 2]   |
|   Watching alerts      Patrolling hall   |
|                                          |
+------------------------------------------+
```

---

## Software Architecture: The 5 Layers

ExamGuard's software is organized into 5 layers, like floors of a building. Each layer has a specific job, and data flows from Layer 1 down to Layer 5.

```
+=======================================================+
|  LAYER 5: OUTPUT                                       |
|  Dashboard, Alerts, Reports                            |
+=======================================================+
                        ^
                        |
+=======================================================+
|  LAYER 4: DECISION                                     |
|  Reinforcement Learning Agent                          |
|  "Should I alert or wait?"                             |
+=======================================================+
                        ^
                        |
+=======================================================+
|  LAYER 3: ANALYSIS                                     |
|  Behavior Patterns + Anomaly Detection                 |
|  "Is this behavior suspicious?"                        |
+=======================================================+
                        ^
                        |
+=======================================================+
|  LAYER 2: DETECTION                                    |
|  YOLO (objects) + CNN (gaze/faces)                     |
|  "What do I see in this frame?"                        |
+=======================================================+
                        ^
                        |
+=======================================================+
|  LAYER 1: VIDEO INPUT                                  |
|  Camera feeds, Frame extraction                        |
|  "Capture video from all cameras"                      |
+=======================================================+
```

---

## Layer-by-Layer Explanation

### Layer 1: Video Input

**What it does:** Captures live video from all cameras and converts it into individual frames (images) that AI can process.

**Think of it like:** Your eyes - they take in raw light and send images to your brain.

**Technical details:**
- Each camera produces 30 frames per second (fps)
- Each frame is an image (e.g., 1920x1080 pixels)
- Frames are stored as NumPy arrays (matrices of numbers)
- Multiple camera feeds are handled simultaneously

**ExamGuard specifics:**
- 5 cameras per hall, each at 30 fps = 150 frames per second per hall
- Smart FPS: Only process 5-10 fps normally, jump to 30 fps when something looks suspicious
- Frames are resized to 416x416 or 640x640 for the AI models

```
Camera Feed → Decode Video → Extract Frames → Resize → Send to Layer 2
```

---

### Layer 2: Detection (YOLO + CNN)

**What it does:** Looks at each frame and identifies WHAT is in it. This layer answers: "What objects and people do I see?"

**Think of it like:** Your brain recognizing faces, objects, and body positions in a photo.

**Models used:**

| Model | Job | Output |
|---|---|---|
| **YOLOv8** | Find objects (phones, chits, books) | Bounding boxes + labels |
| **CNN (face)** | Detect and locate faces | Face positions |
| **CNN (gaze)** | Determine eye/head direction | Gaze angle (left, right, down, etc.) |
| **Pose Estimator** | Detect body posture | Skeleton points (shoulders, elbows, wrists) |

**ExamGuard specifics:**
- YOLO scans each frame for prohibited items (phone, paper chit, earpiece)
- Face CNN locates every student's face and tracks their gaze direction
- Pose estimation sees if someone is leaning toward a neighbor

```
Frame → YOLO (find objects) → CNN (analyze faces/gaze) → Pose (body position) → Send to Layer 3
```

---

### Layer 3: Analysis (Behavior + Anomaly)

**What it does:** Takes the detections from Layer 2 and asks: "Is this behavior suspicious?" This layer looks at PATTERNS over time, not just single frames.

**Think of it like:** The difference between seeing someone look left once (normal) vs. looking left 15 times in 2 minutes (suspicious).

**Models used:**

| Model | Job | How |
|---|---|---|
| **CNN + LSTM** | Analyze behavior sequences | Watches patterns over 30-60 seconds |
| **Autoencoder** | Find anomalies | Learns what "normal" looks like, flags anything different |
| **K-Means Clustering** | Group similar behaviors | Finds patterns in student movements |

**ExamGuard specifics:**
- LSTM (Long Short-Term Memory) remembers what happened in previous frames
- A single head turn = normal. Repeated head turns toward same student = suspicious
- Autoencoder learns "normal exam behavior" and flags anything it hasn't seen before
- K-Means groups students by behavior patterns (cluster of students all looking same direction?)

```
Detections over time → LSTM (sequence patterns) → Autoencoder (anomaly check) → Suspicion score → Send to Layer 4
```

---

### Layer 4: Decision (Reinforcement Learning)

**What it does:** Decides WHETHER and WHEN to alert the invigilator. Not every suspicious detection should trigger an alert.

**Think of it like:** A smart filter that learns from feedback. If it sends too many false alarms, invigilators start ignoring alerts. If it misses real cheating, it's useless.

**Model used:**
- **Deep Q-Network (DQN)** or **PPO** - Reinforcement Learning agent

**The balance:**
```
Too many alerts (false alarms) → Invigilator ignores all alerts → System becomes useless
Too few alerts (missed cheating) → Cheating goes undetected → System is useless

GOAL: Just the right amount of HIGH-QUALITY alerts
```

**ExamGuard specifics:**
- The RL agent receives a "suspicion score" from Layer 3
- It decides: Alert now? Wait for more evidence? Ignore?
- It learns from invigilator feedback (was the alert helpful or not?)
- Over time, it gets better at knowing when to alert

```
Suspicion score → RL Agent (alert decision) → If yes → Send to Layer 5
```

---

### Layer 5: Output (Dashboard + Alerts)

**What it does:** Shows everything to the invigilator in a clear, easy-to-use interface.

**Think of it like:** The screen and speakers in a car - they show you the information from all the sensors.

**Components:**

| Component | What It Shows |
|---|---|
| **Live Dashboard** | All camera feeds with colored overlays (green = normal, yellow = watch, red = alert) |
| **Alert Panel** | New alerts with video clips, confidence level, and description |
| **History Log** | All alerts from the current exam session |
| **Statistics** | How many alerts, which areas are most active, patterns |
| **Feedback Buttons** | "Correct alert" / "False alarm" (trains the RL agent) |

```
Alert data → Dashboard (visual display) → Invigilator sees and acts → Feedback → Back to Layer 4
```

---

## Complete Data Flow Diagram

Here's how data flows through the entire system from start to finish:

```
[Camera 1] [Camera 2] [Camera 3] [Camera 4] [Camera 5]
     |          |          |          |          |
     +----------+----------+----------+----------+
                           |
                    LAYER 1: VIDEO INPUT
                    - Extract frames
                    - Resize to 640x640
                    - Smart FPS selection
                           |
                    LAYER 2: DETECTION
                    - YOLO: "Phone detected!" (85% confidence)
                    - CNN: "Face looking left" (72% confidence)
                    - Pose: "Leaning toward neighbor"
                           |
                    LAYER 3: ANALYSIS
                    - LSTM: "Looking left 8 times in 2 min"
                    - Autoencoder: "Unusual stillness detected"
                    - Suspicion score: 0.78 / 1.00
                           |
                    LAYER 4: DECISION
                    - RL Agent: "Score 0.78 > threshold 0.70"
                    - Decision: SEND ALERT
                           |
                    LAYER 5: OUTPUT
                    +----------------------------------+
                    | ALERT: Row 3, Seat 7             |
                    | Behavior: Repeated gaze left     |
                    | Confidence: 78%                  |
                    | [View Clip] [Dismiss] [Confirm]  |
                    +----------------------------------+
                           |
                    INVIGILATOR DECIDES
                    - Clicks "Confirm" → walks to check
                    - Feedback sent to Layer 4 for learning
```

---

## Why This Architecture?

**Why layers?**
- Each layer has ONE clear job
- You can improve one layer without breaking others
- Easy to test each part separately
- Easy to understand and explain

**Why these specific models?**
- YOLO is the fastest object detector (real-time!)
- CNN is the standard for image analysis
- LSTM handles sequences (video = sequence of frames)
- Autoencoder is perfect for "find the unusual thing"
- RL learns from feedback (gets better over time)

**Why not one big model?**
- One model can't do everything well
- Separate models = each specialized for its task
- If one model fails, others still work
- Easier to train and debug

---

## What You'll Build

You won't build all 5 layers at once. Here's the order:

1. **Phase 1:** Foundation knowledge (DONE)
2. **Phase 2:** Python + Libraries (build tools)
3. **Phase 3:** Core ML (learn to train models)
4. **Phase 4:** Computer Vision + YOLO (Layer 2)
5. **Phase 5:** Deep Learning + LSTM (Layer 3)
6. **Phase 6:** Reinforcement Learning (Layer 4)
7. **Phase 7:** Integration (connect all layers)

Each phase builds on the previous one. By the end, you'll have the complete system.
