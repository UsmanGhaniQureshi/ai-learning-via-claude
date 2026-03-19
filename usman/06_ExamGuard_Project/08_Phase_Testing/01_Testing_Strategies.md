# Testing Strategies — Making Sure ExamGuard Actually Works

## What Is This?

You have built all the pieces: camera reading, AI models, dashboard, database, API. Everything works in your development environment.

But does it REALLY work?

```
"Works on my laptop" ≠ "Works in a real exam hall"
"Works on test images" ≠ "Works on live video"
"Works with 1 camera" ≠ "Works with 20 cameras"
"Works for 5 minutes" ≠ "Works for 3 hours straight"
```

**Testing** means systematically verifying that ExamGuard works correctly, reliably, and consistently before putting it in front of real students.

---

## WHY This Matters More Than Anything

### The Stakes Are REAL

```
If Netflix recommends a bad movie → User is slightly annoyed
If Google Maps shows wrong direction → User takes a longer route
If ExamGuard falsely accuses a student → Student's academic career could be RUINED
If ExamGuard misses real cheating → Exam integrity is compromised
```

**One false accusation can destroy trust in the entire system.**

This is why testing is not optional — it is the MOST important phase.

---

## Four Levels of Testing

### Level 1: Unit Tests — Test Each Piece Alone

Test each model and component independently.

```
Test YOLO: Does it detect phones correctly?
  - Show 100 images WITH phones → Should detect 95+
  - Show 100 images WITHOUT phones → Should detect 0 (or very few)

Test Gaze Tracker: Does it track gaze correctly?
  - Show face looking left → Should report "looking left"
  - Show face looking at paper → Should report "looking down"

Test Autoencoder: Does it flag anomalies?
  - Show 100 normal clips → Should flag < 5
  - Show 100 abnormal clips → Should flag 90+

Test API: Does each endpoint work?
  - POST /api/alerts → Should create alert
  - GET /api/alerts → Should return list
  - GET /api/health → Should return "healthy"
```

```python
# Example unit test for YOLO detection
import pytest
from ultralytics import YOLO

model = YOLO("examguard_phone_model.pt")

def test_detects_phones():
    """Phone on desk should be detected."""
    results = model("test_images/phone_on_desk.jpg")
    classes = [model.names[int(c)] for c in results[0].boxes.cls]
    assert "phone" in classes, "Failed to detect phone!"

def test_no_false_detection():
    """Empty desk should NOT trigger detection."""
    results = model("test_images/empty_desk.jpg")
    classes = [model.names[int(c)] for c in results[0].boxes.cls]
    assert "phone" not in classes, "False detection on empty desk!"

def test_detection_confidence():
    """Phone detection should have high confidence."""
    results = model("test_images/phone_on_desk.jpg")
    for box in results[0].boxes:
        if model.names[int(box.cls)] == "phone":
            assert float(box.conf) > 0.7, f"Low confidence: {float(box.conf)}"
```

### Level 2: Integration Tests — Test Pieces Together

Test how components work TOGETHER.

```
Test: Camera → AI Pipeline
  - Read frame from camera
  - Pass to YOLO
  - Pass detections to CNN
  - Check output makes sense

Test: AI → Database
  - AI detects something
  - Alert should appear in database
  - Dashboard should show the alert

Test: Full Alert Flow
  - AI detects phone
  - Alert created via API
  - Dashboard shows alert
  - Invigilator clicks "confirm"
  - Database updated
  - Evidence clip saved
```

```python
def test_full_alert_flow():
    """Test the complete flow from detection to dashboard."""

    # Step 1: Simulate AI detection
    detection = {
        "camera_id": 3,
        "alert_type": "phone_detected",
        "seat": "C2",
        "confidence": 0.92,
        "priority": "high"
    }

    # Step 2: Send to API
    response = requests.post("http://localhost:8000/api/alerts", json=detection)
    assert response.status_code == 200
    alert_id = response.json()["id"]

    # Step 3: Check it appears in alerts list
    response = requests.get("http://localhost:8000/api/alerts")
    alerts = response.json()
    assert any(a["id"] == alert_id for a in alerts)

    # Step 4: Confirm the alert
    response = requests.post(f"http://localhost:8000/api/alerts/{alert_id}/confirm")
    assert response.status_code == 200

    # Step 5: Check status updated
    response = requests.get(f"http://localhost:8000/api/alerts/{alert_id}")
    assert response.json()["status"] == "confirmed"

    print("Full alert flow: PASSED!")
```

### Level 3: System Tests — Test the Full System

Run the ENTIRE system end-to-end with realistic conditions.

```
Setup: 4 cameras in a room, 10 "students" (friends acting)
Test scenarios:
  1. Normal behavior for 10 minutes → Should generate 0 alerts
  2. One person uses phone → Should generate high-priority alert
  3. Two people looking at each other → Should generate medium alert
  4. Person stretching/yawning → Should NOT generate alert
  5. Camera disconnects → System should handle gracefully
  6. Run for 2 hours straight → Should not crash or slow down
```

### Level 4: UAT (User Acceptance Testing) — Real Users Test

Let actual invigilators use the system and give feedback.

```
Invite 3-5 invigilators to test:
- Can they understand the dashboard?
- Is the alert notification clear?
- Can they confirm/dismiss alerts easily?
- Do they trust the system's accuracy?
- What features are missing?
- What is confusing?

Their feedback is GOLD — they are the actual users.
```

---

## Metrics to Track

### The Four Numbers That Matter

```
                    AI says: Cheating    AI says: Normal
                    ─────────────────    ───────────────
Actually Cheating:  TRUE POSITIVE (TP)   FALSE NEGATIVE (FN)
                    "Correct catch"      "MISSED cheating" ←WORST

Actually Normal:    FALSE POSITIVE (FP)  TRUE NEGATIVE (TN)
                    "False alarm"        "Correct silence"
```

### Key Metrics

```python
# After testing with labeled data:

TP = 45   # Correctly caught cheating
FP = 8    # False alarms (said cheating, was normal)
FN = 5    # Missed cheating (said normal, was cheating)
TN = 942  # Correctly ignored normal behavior

# Metric 1: Precision — "When it alerts, how often is it right?"
precision = TP / (TP + FP)  # 45 / 53 = 84.9%
# "85% of alerts are real" — good enough for human to investigate

# Metric 2: Recall — "Of all cheating, how much did it catch?"
recall = TP / (TP + FN)  # 45 / 50 = 90.0%
# "Catches 90% of cheating" — 10% slips through

# Metric 3: False Alarm Rate
false_alarm_rate = FP / (FP + TN)  # 8 / 950 = 0.84%
# "Only 0.84% of normal behavior triggers false alarm"

# Metric 4: F1 Score (balance of precision and recall)
f1 = 2 * (precision * recall) / (precision + recall)
# 2 * (0.849 * 0.900) / (0.849 + 0.900) = 87.4%
```

### Target Numbers for ExamGuard

```
Metric              Target      Why
──────────────────────────────────────────────────────
Recall              > 90%       Must catch most cheating
Precision           > 80%       Most alerts should be real
False alarm rate    < 2%        Do not cry wolf too often
Processing speed    < 33ms      Real-time (30 fps)
System uptime       > 99.9%     Cannot go down during exam
Alert latency       < 3 sec     Alert within 3 seconds of event
```

---

## Test Data: What You Need

### Creating a Test Dataset

```
You need labeled video clips:

NORMAL clips (500+):
  - Student writing normally
  - Student thinking (looking up)
  - Student stretching
  - Student drinking water
  - Student flipping pages
  - Student erasing
  - Student asking invigilator a question (hand raised)

CHEATING clips (200+):
  - Using phone (under desk, on desk, in lap)
  - Looking at neighbor's paper (quick glance, sustained stare)
  - Passing notes
  - Using hidden notes (on hand, in pencil case, on desk)
  - Whispering to neighbor
  - Copying from another student

EDGE CASES (100+):
  - Student with disability (different posture)
  - Left-handed student
  - Student wearing glasses (gaze detection challenge)
  - Student wearing hijab/hat
  - Very fidgety student
  - Student who looks around a lot (anxious)
```

### How to Create Test Data

```
Option 1: Act it out yourself
  - Set up camera
  - Act out normal and cheating behaviors
  - Label each clip

Option 2: Ask friends to help
  - Set up a mock exam
  - Some act normal, some act suspicious
  - Record and label

Option 3: Use existing datasets
  - Search for "exam proctoring dataset" on Kaggle
  - UCF Crime Detection dataset (similar concept)
  - Custom dataset from your own recordings
```

---

## Automated Testing Pipeline

```python
"""
Run this before EVERY deployment to verify everything works.
"""

import subprocess
import requests
import time

def run_tests():
    results = []

    # Test 1: API is responding
    try:
        r = requests.get("http://localhost:8000/health", timeout=5)
        results.append(("API Health", r.status_code == 200))
    except:
        results.append(("API Health", False))

    # Test 2: Model loads and predicts
    try:
        with open("test_image.jpg", "rb") as f:
            r = requests.post("http://localhost:8000/api/process",
                            files={"file": f}, timeout=10)
        results.append(("Model Prediction", r.status_code == 200))
    except:
        results.append(("Model Prediction", False))

    # Test 3: Database connection
    try:
        r = requests.get("http://localhost:8000/api/alerts", timeout=5)
        results.append(("Database", r.status_code == 200))
    except:
        results.append(("Database", False))

    # Test 4: Processing speed
    try:
        start = time.time()
        with open("test_image.jpg", "rb") as f:
            r = requests.post("http://localhost:8000/api/process",
                            files={"file": f}, timeout=10)
        elapsed = time.time() - start
        results.append(("Speed (<1s)", elapsed < 1.0))
    except:
        results.append(("Speed", False))

    # Print results
    print("\n=== ExamGuard Test Results ===")
    all_passed = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {status}: {name}")
        if not passed:
            all_passed = False

    print(f"\n{'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    return all_passed

if __name__ == "__main__":
    run_tests()
```

---

## Key Takeaways

1. **Test at every level** — unit, integration, system, user acceptance
2. **Recall is king** — missing cheating is worse than false alarms
3. **Target: >90% recall, >80% precision, <2% false alarm rate**
4. **Create a proper test dataset** — labeled clips of normal and cheating behavior
5. **Automate testing** — run tests before every deployment
6. **Involve real users** — invigilators' feedback is essential
7. **Test for hours, not minutes** — systems that work for 5 minutes can fail after 2 hours
