# Python Basics

## What is Python?

Python is a **programming language** - a way to write instructions that a computer can follow. It's the language you'll use to build ExamGuard and virtually every AI/ML project in the world.

Python is popular for AI because:
- It's readable (looks almost like English)
- It has thousands of ready-made libraries for AI, data, and math
- It's the standard language used by Google, Meta, OpenAI, and every major AI lab

---

## Why Python Matters for ExamGuard

**Every single line of ExamGuard will be written in Python.**

- YOLO object detection? Python.
- CNN for gaze tracking? Python.
- LSTM for behavior analysis? Python.
- Autoencoder for anomaly detection? Python.
- RL agent for alert decisions? Python.
- Dashboard? Python (with a web framework).
- Data processing? Python.
- Model training? Python.

There is no ExamGuard without Python. It's not optional - it's the foundation of everything.

---

## What to Learn

### 1. Variables (Storing Information)

Variables hold data that your program uses.

```python
# ExamGuard examples:
student_count = 100
camera_count = 5
confidence_threshold = 0.75
is_cheating = False
student_name = "Ahmed"
```

**ExamGuard connection:** You'll store detection results, confidence scores, camera IDs, and alert statuses in variables.

### 2. Data Types

| Type | What It Stores | Example | ExamGuard Use |
|---|---|---|---|
| `int` | Whole numbers | `camera_id = 3` | Camera numbers, student counts |
| `float` | Decimal numbers | `confidence = 0.87` | Model confidence scores |
| `str` | Text | `alert = "Phone detected"` | Alert messages |
| `bool` | True/False | `is_suspicious = True` | Decision flags |

### 3. Lists (Collections of Items)

```python
# List of camera feeds
cameras = ["cam_1", "cam_2", "cam_3", "cam_4", "cam_5"]

# List of detection scores
scores = [0.45, 0.87, 0.23, 0.91, 0.12]

# Access items
first_camera = cameras[0]    # "cam_1"
highest_score = max(scores)  # 0.91
```

**ExamGuard connection:** Store lists of camera feeds, detection results, alert histories.

### 4. Dictionaries (Key-Value Pairs)

```python
# An alert as a dictionary
alert = {
    "student_location": "Row 3, Seat 7",
    "behavior": "Phone detected",
    "confidence": 0.89,
    "camera": "cam_2",
    "timestamp": "10:23:45"
}

# Access values
print(alert["behavior"])     # "Phone detected"
print(alert["confidence"])   # 0.89
```

**ExamGuard connection:** Every alert, every detection result, every student record will be stored as a dictionary.

### 5. If/Else (Making Decisions)

```python
confidence = 0.87
threshold = 0.75

if confidence >= threshold:
    print("ALERT: Suspicious behavior detected!")
    send_alert_to_invigilator()
elif confidence >= 0.50:
    print("WATCH: Monitoring this student closely")
    increase_camera_fps()
else:
    print("NORMAL: No action needed")
```

**ExamGuard connection:** The entire alert system is based on if/else decisions - when to alert, what severity, when to ignore.

### 6. Loops (Repeating Actions)

```python
# Process frames from all cameras
cameras = ["cam_1", "cam_2", "cam_3", "cam_4", "cam_5"]

for camera in cameras:
    frame = get_frame(camera)
    detections = run_yolo(frame)
    if detections:
        analyze_behavior(detections)
```

**ExamGuard connection:** You'll loop through camera feeds, loop through video frames, loop through detection results, loop through training data.

### 7. Functions (Reusable Blocks of Code)

```python
def check_for_phone(frame):
    """Run YOLO on a frame to detect phones."""
    detections = yolo_model.predict(frame)
    phones = [d for d in detections if d.label == "phone"]
    return phones

def should_alert(confidence, threshold=0.75):
    """Decide whether to send an alert."""
    return confidence >= threshold

# Use the functions
frame = get_camera_frame("cam_1")
phones = check_for_phone(frame)
if phones and should_alert(phones[0].confidence):
    send_alert("Phone detected!")
```

**ExamGuard connection:** You'll write functions for every step: processing frames, running models, making decisions, sending alerts.

### 8. Classes (Organizing Complex Code)

```python
class ExamCamera:
    def __init__(self, camera_id, location):
        self.camera_id = camera_id
        self.location = location
        self.fps = 10  # default fps
        self.is_active = True

    def get_frame(self):
        """Capture a frame from this camera."""
        # ... capture logic ...
        pass

    def increase_fps(self):
        """Switch to high FPS mode for suspicious activity."""
        self.fps = 30

# Create camera objects
cam1 = ExamCamera("cam_1", "Front-Left")
cam2 = ExamCamera("cam_2", "Front-Center")
```

**ExamGuard connection:** Each camera, each model, each alert will be organized as a class. This keeps the code clean and manageable.

---

## Mini Project: Exam Score Classifier

Build this simple program to practice ALL the basics:

```python
"""
Mini Project: Exam Score Classifier
Practice: variables, input, if/else, functions, lists, loops
"""

def classify_score(score):
    """Classify a score as pass, fail, or distinction."""
    if score >= 80:
        return "Distinction"
    elif score >= 50:
        return "Pass"
    else:
        return "Fail"

def calculate_statistics(scores):
    """Calculate basic stats for a list of scores."""
    average = sum(scores) / len(scores)
    highest = max(scores)
    lowest = min(scores)
    return average, highest, lowest

# Main program
scores = []

print("=== Exam Score Classifier ===")
print("Enter scores (type 'done' to finish):")

while True:
    user_input = input("Score: ")
    if user_input.lower() == "done":
        break
    score = int(user_input)
    result = classify_score(score)
    scores.append(score)
    print(f"  → {score}: {result}")

if scores:
    avg, high, low = calculate_statistics(scores)
    print(f"\n--- Statistics ---")
    print(f"Students: {len(scores)}")
    print(f"Average: {avg:.1f}")
    print(f"Highest: {high}")
    print(f"Lowest: {low}")

    # Count results
    distinctions = sum(1 for s in scores if s >= 80)
    passes = sum(1 for s in scores if 50 <= s < 80)
    fails = sum(1 for s in scores if s < 50)
    print(f"Distinctions: {distinctions}")
    print(f"Passes: {passes}")
    print(f"Fails: {fails}")
```

### Why this mini project?

It practices the SAME patterns you'll use in ExamGuard:
- **Variables** → storing scores = storing detection confidence
- **Functions** → classify_score = classify behavior
- **If/else** → score thresholds = confidence thresholds
- **Lists** → list of scores = list of detections
- **Loops** → process each score = process each frame
- **Statistics** → analyze scores = analyze model performance

---

## Key Python Concepts for ExamGuard

| Python Concept | ExamGuard Use |
|---|---|
| Variables | Store confidence scores, camera IDs, thresholds |
| Lists | Collections of frames, detections, alerts |
| Dictionaries | Alert data, student records, model configurations |
| If/else | Alert decisions, severity levels |
| For loops | Process each frame, each camera, each detection |
| While loops | Continuous monitoring loop |
| Functions | Each processing step is a function |
| Classes | Camera objects, model wrappers, alert managers |
| File I/O | Save/load model weights, log alerts |
| Error handling | What if a camera disconnects? Handle it gracefully |

---

## How Much Python Do You Need?

```
To START ExamGuard:     Basic Python (variables, loops, functions)    ~2-3 weeks
To BUILD models:        Intermediate Python (classes, libraries)       ~2-3 weeks
To COMPLETE ExamGuard:  Comfortable Python (debugging, optimization)   Ongoing
```

You don't need to be a Python expert to start. Learn the basics, then learn more as you need it. The best way to learn Python is by USING it on real projects.
