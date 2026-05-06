# Version 0.1 — Phone Detector

## BUILD THIS AFTER: Phase 5 (Object Detection & Classification)

## What This Version Does

One camera. One job. Detect phones on desks during an exam.

That is it. No gaze tracking, no behavior analysis, no fancy dashboard. Just:

```
Camera → See phone → Print alert
```

This is your FIRST working product. It is simple, but it is REAL and USEFUL.

---

## Why Start Here

```
Complex system with everything:  6 months to build, many things can fail
Phone detector only:             1-2 weeks to build, works immediately

A simple working product >> A complex unfinished product
```

A phone detector ALONE is useful because:
- Phones are the #1 cheating tool
- Easy to detect (phones have a distinct shape)
- Clear evidence (the phone is either there or not)
- Low false alarm rate (not much looks like a phone on a desk)

---

## Tech Stack

```
Component          Technology           Purpose
─────────────────────────────────────────────────
Camera input       OpenCV               Read webcam or IP camera
Object detection   YOLOv8 (fine-tuned)  Detect phones on desks
Alert              Print to terminal    Show alert when phone detected
```

No database. No dashboard. No API. Just the basics.

---

## Step-by-Step Build Guide

### Step 1: Collect Training Data (2-3 days)

You need photos of phones on desks. About 500 images.

```
What to photograph:
- Phone face-up on desk (various angles)
- Phone face-down on desk
- Phone partially hidden under paper
- Phone in hand near desk
- Phone in pencil case (open)
- Empty desks (no phone) — for negative examples!

Vary the conditions:
- Different phone brands/sizes/colors
- Different desk colors and materials
- Different lighting (bright, dim, natural, artificial)
- Different camera angles (overhead, side, corner)

How to collect:
1. Take photos yourself: Put phone on desk, take photo from camera position
2. Ask friends: Different phones, different settings
3. Online: Search "phone on desk" on Google Images (supplement only)
```

**Quick collection method:**
```python
import cv2
import os
import time

# Use webcam to collect training images
cap = cv2.VideoCapture(0)
output_dir = "training_data/phone_on_desk"
os.makedirs(output_dir, exist_ok=True)

count = 0
print("Press 's' to save frame, 'q' to quit")
print("Place phone on desk in different positions and press 's'")

while True:
    ret, frame = cap.read()
    cv2.imshow("Collector", frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('s'):
        count += 1
        filename = f"{output_dir}/phone_{count:04d}.jpg"
        cv2.imwrite(filename, frame)
        print(f"Saved: {filename}")
    elif key == ord('q'):
        break

cap.release()
print(f"Total images saved: {count}")
```

### Step 2: Label the Data (1-2 days)

Use a labeling tool to draw boxes around phones in each image.

```
Tool: LabelImg (free, simple)
  pip install labelImg
  labelImg

Or: Roboflow (web-based, free for small datasets)
  Go to roboflow.com, upload images, label online

For each image:
  1. Open image
  2. Draw a box around the phone
  3. Label it "phone"
  4. Save
  5. Repeat 500 times (yes, it is tedious but essential!)
```

### Step 3: Fine-Tune YOLOv8 (1 day)

```python
from ultralytics import YOLO

# Start with pre-trained YOLOv8 nano (already knows many objects)
model = YOLO("yolov8n.pt")

# Fine-tune on your phone dataset
# Your dataset should be in YOLO format:
# dataset/
#   train/
#     images/    (80% of your photos)
#     labels/    (matching label files)
#   val/
#     images/    (20% of your photos)
#     labels/    (matching label files)

results = model.train(
    data="dataset/data.yaml",    # Path to dataset config
    epochs=50,                    # Train for 50 rounds
    imgsz=640,                    # Image size
    batch=16,                     # Batch size
    name="phone_detector"         # Name for this training run
)

# data.yaml should contain:
# train: dataset/train/images
# val: dataset/val/images
# nc: 1           # number of classes
# names: ['phone'] # class names
```

### Step 4: Test the Model (1 hour)

```python
from ultralytics import YOLO
import cv2

# Load your fine-tuned model
model = YOLO("runs/detect/phone_detector/weights/best.pt")

# Test on some images
results = model("test_images/", save=True)

# Check results
for r in results:
    for box in r.boxes:
        print(f"Detected: {model.names[int(box.cls)]}, "
              f"Confidence: {float(box.conf):.2f}")
```

### Step 5: Build the Live Detector (1 day)

```python
"""
ExamGuard v0.1 — Phone Detector
Run this to monitor a camera for phones on desks.
"""

import cv2
from ultralytics import YOLO
from datetime import datetime

# Load model
model = YOLO("runs/detect/phone_detector/weights/best.pt")

# Connect to camera (0 = webcam, or use RTSP URL)
cap = cv2.VideoCapture(0)

# Settings
CONFIDENCE_THRESHOLD = 0.7  # Only alert if > 70% confident
ALERT_COOLDOWN = 10         # Seconds between repeated alerts

last_alert_time = 0

print("=" * 50)
print("ExamGuard v0.1 — Phone Detector")
print("=" * 50)
print("Monitoring started. Press 'q' to quit.")
print()

while True:
    ret, frame = cap.read()
    if not ret:
        print("Camera error!")
        break

    # Run detection
    results = model(frame, verbose=False)

    # Check for phones
    phone_detected = False
    for box in results[0].boxes:
        class_name = model.names[int(box.cls)]
        confidence = float(box.conf)

        if class_name == "phone" and confidence > CONFIDENCE_THRESHOLD:
            phone_detected = True

            # Draw box on frame
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
            cv2.putText(frame, f"PHONE {confidence:.0%}",
                       (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX,
                       0.9, (0, 0, 255), 2)

    # Alert logic
    current_time = datetime.now().timestamp()
    if phone_detected and (current_time - last_alert_time) > ALERT_COOLDOWN:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] *** ALERT: Phone detected! "
              f"Confidence: {confidence:.0%} ***")

        # Save evidence screenshot
        evidence_name = f"evidence/phone_{datetime.now().strftime('%H%M%S')}.jpg"
        cv2.imwrite(evidence_name, frame)
        print(f"           Evidence saved: {evidence_name}")

        last_alert_time = current_time

    # Show status on frame
    status = "PHONE DETECTED!" if phone_detected else "Monitoring..."
    color = (0, 0, 255) if phone_detected else (0, 255, 0)
    cv2.putText(frame, status, (10, 30),
               cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)

    # Display
    cv2.imshow("ExamGuard v0.1 - Phone Detector", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("\nMonitoring ended.")
```

---

## Success Criteria

```
Metric                       Target
─────────────────────────────────────
Detect phone on desk         > 90% of the time
False alarm rate             < 5% (non-phone objects flagged)
Detection time               < 2 seconds after phone appears
Works with webcam            Yes
Saves evidence screenshot    Yes
```

---

## What You Will Learn Building This

1. The full ML pipeline: data collection → labeling → training → deployment
2. How to fine-tune a pre-trained model on custom data
3. How to run AI on live camera feed
4. How to handle confidence thresholds
5. How to save evidence
6. The foundation for EVERYTHING that comes after

---

## Limitations (What v0.1 Cannot Do)

```
Cannot detect: Gaze direction, body posture, passing notes,
               hidden earpieces, coded signals, whispering

Cannot do:     Multi-camera, dashboard, database, real-time alerts

These will be added in later versions!
```

---

## After You Build This

Congratulations! You have a working AI product. It is simple but REAL.

Show it to people. Get feedback. Then move on to v0.2 (Gaze Tracker).

Each version adds a new capability, building on what you already have.
