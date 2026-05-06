# 9. Multi-Model Systems — "How to Build a Real AI System"

> **Real AI systems are NOT one model. They're multiple models connected by regular code.**

---

## The Hospital Analogy

A hospital isn't one doctor doing everything. It's:

```
ONE hospital building
  → X-ray department (uses images, has its own machine)
  → Blood lab (uses blood samples, has its own equipment)
  → Pharmacy (uses prescription text, has its own system)
  → Reception (uses face/ID, has its own camera)

Different departments, different data, different tools.
But ONE patient walks through ALL of them.
Connected by the patient's FILE (medical record).
```

AI systems work exactly the same way.

---

## The Architecture: Modules + Connector

Every multi-model system has 2 parts:

```
1. MODULES: Individual ML models, each solving ONE specific task
2. CONNECTOR: Regular code (Python if/else) that ties all outputs together
```

### ExamGuard Architecture

```
ONE system: "ExamGuard"
  │
  ├── Module 1: Phone Detector
  │   Data: exam room camera frames (images)
  │   Model: YOLO (pre-trained)
  │   Output: "phone detected" / "no phone" + confidence %
  │   Runs: every camera frame (30 fps)
  │
  ├── Module 2: Gaze Tracker
  │   Data: student face close-up (video)
  │   Model: MediaPipe Face Mesh (pre-trained)
  │   Output: "looking left/right/down/at neighbor" + duration
  │   Runs: every camera frame
  │
  ├── Module 3: Unusual Behavior Detector
  │   Data: full body video of student
  │   Model: Autoencoder (trained on normal exam behavior)
  │   Output: anomaly score 0-100 (higher = more unusual)
  │   Runs: every 5 seconds
  │
  ├── Module 4: Identity Verifier
  │   Data: face photo vs student ID card
  │   Model: Face Recognition CNN
  │   Output: "match" / "mismatch" + confidence %
  │   Runs: once at start of exam
  │
  ├── Module 5: Alert Decision
  │   Data: outputs from modules 1-4 (NOT raw images)
  │   Model: RL (or rule-based for v1)
  │   Output: "alert now" / "keep watching" / "flag for review"
  │   Runs: whenever any module flags something
  │
  └── CONNECTOR: Dashboard for invigilator
      → Camera grid + alert panel + evidence clips
      → Regular Python code — NOT ML
```

---

## Key Rules for Multi-Model Systems

### Rule 1: Different Models = Different Data

Each model gets ONLY the data it needs:

| Module | Gets THIS data | Does NOT need |
|:---|:---|:---|
| Phone Detector | Camera images of desks | Student names, marks, text |
| Gaze Tracker | Face video close-up | Desk images, full room view |
| Unusual Behavior | Full body video clip | Face close-ups, phone images |
| Identity Verifier | Face photo + ID card photo | Exam footage, behavior data |
| Alert Decision | Scores from modules 1-4 | Any raw images/video |

### Rule 2: Each Module is Trained SEPARATELY

```
Phone Detector:    trained on phone images (Roboflow dataset + your photos)
Gaze Tracker:      pre-trained by Google (MediaPipe) — no training needed
Unusual Behavior:  trained on YOUR normal exam footage
Identity Verifier: trained on face datasets + your student photos
Alert Decision:    trained in simulation with reward/penalty system
```

They NEVER see each other's training data. They're independent.

### Rule 3: The Connector is Regular Code (NOT ML)

```python
# This is the connector — just regular Python
for each camera_frame:
    phone_result = phone_detector.check(frame)
    gaze_result = gaze_tracker.check(frame)
    behavior_score = behavior_monitor.check(frame)

    # Combine results
    if phone_result.confidence > 80:
        alert_level = "HIGH"
    elif gaze_result.looking_at_neighbor > 30_seconds:
        alert_level = "MEDIUM"
    elif behavior_score > 70:
        alert_level = "LOW"
    else:
        alert_level = "NONE"

    if alert_level != "NONE":
        dashboard.show_alert(camera_id, alert_level, evidence)
```

### Rule 4: Build ONE Module at a Time

**NEVER build all modules at once.** Build, test, deploy one → then add the next:

```
Phase 1 (Week 1-2):
  Module 1 only → Phone Detector with YOLO
  Test it → works? → Deploy v0.1

Phase 2 (Week 3-4):
  Add Module 2 → Gaze Tracker with MediaPipe
  Now 2 modules running together → Deploy v0.2

Phase 3 (Week 5-6):
  Add Module 3 → Unusual Behavior Detector
  3 modules → Deploy v0.3

Phase 4 (Week 7-8):
  Add Module 4 → Identity Verifier
  4 modules → Deploy v0.4

Phase 5 (Week 9-12):
  Add Module 5 → RL Alert System connecting all 4
  Complete system → Deploy v1.0
```

---

## How Modules TALK to Each Other

Modules don't directly talk to each other. They talk through the **connector:**

```
Camera Frame
    ↓
┌─────────────────────────────────────────┐
│ Module 1: Phone Detector                │
│ Input: camera frame                     │
│ Output: {detected: true, confidence: 87}│
└─────────────────────────────────────────┘
    ↓ output passes to connector
┌─────────────────────────────────────────┐
│ Module 2: Gaze Tracker                  │
│ Input: same camera frame                │
│ Output: {direction: "left", duration: 25}│
└─────────────────────────────────────────┘
    ↓ output passes to connector
┌─────────────────────────────────────────┐
│ Module 3: Behavior Monitor              │
│ Input: last 30 frames                   │
│ Output: {anomaly_score: 72}             │
└─────────────────────────────────────────┘
    ↓ all outputs go to connector
┌─────────────────────────────────────────┐
│ CONNECTOR (regular Python code)         │
│ Input: results from modules 1, 2, 3    │
│ Logic: if phone>80 OR gaze>30s → alert │
│ Output: alert / no alert               │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ DASHBOARD (web page)                    │
│ Shows: camera grid + alerts + evidence  │
└─────────────────────────────────────────┘
```

---

## Folder Structure of a Real Multi-Model Project

```
ExamGuard/
├── models/
│   ├── phone_detector/
│   │   ├── model.pt              ← trained YOLO model file
│   │   ├── training_data/        ← phone images used to train
│   │   └── test_results.txt      ← accuracy report
│   │
│   ├── gaze_tracker/
│   │   └── config.yaml           ← MediaPipe settings (pre-trained, no training data)
│   │
│   ├── behavior_monitor/
│   │   ├── model.pt              ← trained Autoencoder
│   │   ├── normal_clips/         ← normal behavior video clips
│   │   └── threshold.txt         ← anomaly score threshold
│   │
│   ├── face_verifier/
│   │   ├── model.pt              ← face recognition model
│   │   └── student_photos/       ← registered student faces
│   │
│   └── alert_system/
│       ├── model.pt              ← RL model (or rules.json for v1)
│       └── reward_config.json    ← reward/penalty definitions
│
├── src/
│   ├── pipeline.py               ← CONNECTOR — runs all models
│   ├── camera.py                 ← reads camera feeds
│   ├── dashboard.py              ← web UI for invigilator
│   └── database.py               ← stores alerts and evidence
│
├── data/
│   ├── raw/                      ← original collected data
│   ├── cleaned/                  ← after cleaning
│   ├── augmented/                ← after augmentation
│   └── labeled/                  ← after labeling
│
└── tests/
    ├── test_phone_detector.py    ← test each module separately
    ├── test_gaze_tracker.py
    └── test_full_pipeline.py     ← test all modules together
```

---

## Real Examples of Multi-Model Systems

### Self-Driving Car

```
Module 1: Object Detector (YOLO)     → "Car ahead, pedestrian on left"
Module 2: Lane Detector (CNN)         → "Car is in lane, lanes curve right"
Module 3: Traffic Sign Reader (CNN)   → "Speed limit 60 km/h"
Module 4: Depth Estimator (Stereo)    → "Car ahead is 15 meters away"
Module 5: Path Planner (RL)           → "Slow down, change lane left, accelerate"
CONNECTOR: Car control system         → sends brake/steer/accelerate commands
```

### Netflix

```
Module 1: Content Classifier (NLP)    → "This movie is action + comedy + English"
Module 2: User Profiler (Clustering)  → "User likes action, watches at night"
Module 3: Rating Predictor (Regression) → "User will rate this movie 4.2/5"
Module 4: Thumbnail Selector (CNN)    → "This thumbnail will get more clicks"
Module 5: Engagement Optimizer (RL)   → "Show this movie NOW for max watch time"
CONNECTOR: Recommendation engine      → displays personalized homepage
```

### Clothing Store Return Reducer

```
Module 1: Size Recommender (Classification) → "Recommend size M"
Module 2: Color Checker (CNN)                → "Website color matches real product"
Module 3: Feedback Analyzer (NLP)            → "Return reason: quality complaint"
Module 4: Customer Grouper (Clustering)      → "Try-and-return customer type"
Module 5: Fraud Detector (Anomaly)           → "This return looks suspicious"
CONNECTOR: Dashboard for operations team     → shows return analytics + actions
```

---

## V1 Shortcut: Start with Rules, Add ML Later

You don't need ML for EVERY module in v1. Use simple rules first:

```
ExamGuard v0.1 (Week 1):
  Module 1: YOLO phone detector (ML — pre-trained, works immediately)
  Module 2: — not built yet —
  Module 3: — not built yet —
  Alert: IF phone_confidence > 80% THEN alert (simple rule, not RL)

ExamGuard v0.2 (Week 3):
  Module 1: YOLO phone detector (ML)
  Module 2: MediaPipe gaze tracker (ML — pre-trained)
  Alert: IF phone > 80% OR gaze_sideways > 30 seconds THEN alert (still simple rules)

ExamGuard v1.0 (Month 3):
  All 5 modules running
  Alert: RL model balancing all inputs (replaces simple rules)
```

**Simple rules → test → gather data → replace with ML when you have enough data and understanding.**

---

## Common Mistakes

| Mistake | Why It's Wrong | What to Do |
|:---|:---|:---|
| Build all modules at once | Too complex, can't debug | Build ONE at a time, test, then add next |
| Use one model for everything | One model can't do detection + tracking + alerting | Each task = separate model |
| Skip the connector | Models give outputs but nothing uses them | Connector is the BRAIN tying everything together |
| Use ML where rules work | Phone confidence > 80% = alert is a RULE not ML | Use ML only when patterns are too complex for rules |
| Train all models on same data | Phone detector needs phone images, not behavior video | Each model gets its OWN relevant data |

---

## Mini Summary

- Real AI systems = multiple independent models + regular code connecting them
- Each model has its own data, its own training, its own job
- The connector (pipeline) is regular Python, not ML
- Build one module at a time — never all at once
- Start with pre-trained models + simple rules → add complexity later
- The system grows: v0.1 (1 module) → v0.2 (2 modules) → v1.0 (all modules)

> 📝 *See [ExamGuard Project](../06_ExamGuard_Project/) for the full implementation plan*
