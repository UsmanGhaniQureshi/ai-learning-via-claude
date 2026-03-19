# YOLO — Real-Time Object Detection for ExamGuard

## What Is This?

**YOLO** stands for **You Only Look Once**. It is an object detection model that can look at an image and instantly find all the objects in it — drawing boxes around each one with a label and confidence percentage.

Unlike image classification (which says "this image contains a phone"), object detection says **"there is a phone at position (x=340, y=220), size 50x80 pixels, confidence 94%."**

YOLO is special because it is **fast enough for real-time video** — it can process 30+ frames per second. Most other object detection models are too slow for live camera feeds.

---

## WHY YOLO Is THE Model for ExamGuard

ExamGuard needs to detect **specific objects** in exam halls in real time:

```
Camera frame from Exam Hall A
        |
        v
      YOLO
        |
        v
Detected objects:
  - Phone (94% confidence) at Row 3, Seat 5
  - Chit/paper slip (82% confidence) at Row 2, Seat 8
  - Earpiece (71% confidence) at Row 5, Seat 3
  - Person (99% confidence) x 30 students
```

Without YOLO, ExamGuard cannot tell you WHAT was detected or WHERE it is. YOLO gives both.

### What ExamGuard Uses YOLO to Detect:

| Object | Why It Matters | Confidence Threshold |
|--------|---------------|---------------------|
| Mobile phone | #1 cheating tool | 85%+ |
| Paper chit/slip | Passing answers | 75%+ |
| Earpiece/earbud | Receiving answers from outside | 70%+ |
| Smartwatch | Can display answers | 80%+ |
| Extra paper | Unauthorized notes | 70%+ |
| Person (student) | Track who is where | 90%+ |

---

## How YOLO Works

### The Key Insight: Look Once

Older models (like R-CNN) look at an image thousands of times, checking different regions one by one. YOLO looks at the entire image **once** and predicts all objects simultaneously.

```
Old approach (R-CNN):
  Image → Check region 1 → Check region 2 → ... → Check region 2000
  Result: 5-7 FPS (too slow for real-time)

YOLO approach:
  Image → Look at everything at once → All detections
  Result: 30-100+ FPS (real-time!)
```

### Step by Step:

```
1. DIVIDE: Split image into a grid (e.g., 13x13)

2. PREDICT: Each grid cell predicts:
   - Bounding boxes (where are objects?)
   - Confidence scores (how sure are we?)
   - Class probabilities (what is it?)

3. FILTER: Remove low-confidence predictions

4. NMS (Non-Max Suppression): If multiple boxes overlap on the same object,
   keep only the best one

5. OUTPUT: Final list of detected objects with positions and labels
```

### Visual Example:

```
Input frame:
+---+---+---+---+---+
|   |   |   |   |   |
+---+---+---+---+---+
|   | P |   |   |   |    P = Phone detected here
+---+---+---+---+---+
|   |   |   | C |   |    C = Chit detected here
+---+---+---+---+---+

Output:
  Object 1: "phone", confidence: 94%, box: (120, 80, 170, 160)
  Object 2: "chit", confidence: 82%, box: (290, 180, 340, 220)
```

---

## YOLO Versions — Which to Use

| Version | Year | Speed | Accuracy | Recommendation |
|---------|------|-------|----------|----------------|
| YOLOv5 | 2020 | Fast | Great | Good, well-documented |
| YOLOv7 | 2022 | Fast | Better | Advanced users |
| YOLOv8 | 2023 | Fast | Best | **USE THIS — latest and easiest** |
| YOLOv9 | 2024 | Fast | Excellent | Newest, less tutorials available |

**Use YOLOv8 (by Ultralytics).** It is the easiest to use, has the best documentation, and is actively maintained.

```bash
# Install YOLOv8
pip install ultralytics
```

---

## Using Pre-Trained YOLO (Out of the Box)

YOLOv8 comes pre-trained on the **COCO dataset** — 80 common objects including person, phone, book, etc.

```python
from ultralytics import YOLO
import cv2

# Load pre-trained YOLOv8 model
model = YOLO('yolov8n.pt')  # 'n' = nano (smallest, fastest)
                              # Options: yolov8n, yolov8s, yolov8m, yolov8l, yolov8x

# Detect objects in an image
results = model('exam_frame.jpg')

# Print detections
for result in results:
    for box in result.boxes:
        class_name = result.names[int(box.cls)]
        confidence = float(box.conf)
        x1, y1, x2, y2 = map(int, box.xyxy[0])

        print(f"Detected: {class_name} ({confidence:.1%}) at ({x1},{y1})-({x2},{y2})")

# Example output:
# Detected: person (97.3%) at (50,20)-(200,450)
# Detected: cell phone (89.1%) at (340,220)-(390,300)
# Detected: person (96.8%) at (250,20)-(400,450)

# Save image with drawn boxes
results[0].save('exam_frame_detected.jpg')
```

That is it. Five lines of code to detect objects in an image.

---

## YOLO on Live Video (Real-Time)

```python
from ultralytics import YOLO
import cv2

model = YOLO('yolov8n.pt')

# Open webcam (or RTSP stream for real cameras)
cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Run YOLO on this frame
    results = model(frame, verbose=False)

    # Draw results on frame
    annotated_frame = results[0].plot()

    # Display
    cv2.imshow('YOLO Detection', annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

**That is real-time object detection in 15 lines of code.** This is the power of YOLO.

---

## Training YOLO on Custom Data (ExamGuard Objects)

Pre-trained YOLO knows "cell phone" and "person" but does NOT know "chit," "earpiece," or "cheating behavior." You need to train it on your own data.

### Step 1: Collect and Label Data

You need images of exam-specific objects with bounding box annotations.

```
Tools for labeling:
- LabelImg (desktop app, free)
- Roboflow (web app, free tier available)
- CVAT (web app, free, open source)

For each image, you draw boxes and label them:
  Image: exam_frame_001.jpg
    Box 1: "phone" at (340, 220, 390, 300)
    Box 2: "chit" at (150, 180, 200, 210)
    Box 3: "student" at (50, 20, 200, 450)
```

### Step 2: Organize Data

```
dataset/
  train/
    images/
      frame_001.jpg
      frame_002.jpg
      ...
    labels/
      frame_001.txt    (YOLO format: class_id x_center y_center width height)
      frame_002.txt
  val/
    images/
    labels/

data.yaml:
  train: dataset/train/images
  val: dataset/val/images
  nc: 5  # number of classes
  names: ['student', 'phone', 'chit', 'earpiece', 'smartwatch']
```

### Step 3: Train

```python
from ultralytics import YOLO

# Start from pre-trained model (transfer learning!)
model = YOLO('yolov8n.pt')

# Train on your custom dataset
results = model.train(
    data='data.yaml',
    epochs=50,
    imgsz=640,
    batch=16,
    name='examguard_detector'
)

# That is it! The model now detects your custom objects.
```

### Step 4: Use Your Trained Model

```python
# Load your custom-trained model
model = YOLO('runs/detect/examguard_detector/weights/best.pt')

# Detect exam-specific objects
results = model('exam_frame.jpg')

# Output:
# Detected: phone (94.2%) at (340,220)-(390,300)
# Detected: chit (82.5%) at (150,180)-(200,210)
# Detected: earpiece (71.3%) at (480,50)-(510,80)
```

---

## Why YOLO Over Other Object Detection Models?

| Model | FPS | Use Case | ExamGuard Verdict |
|-------|-----|----------|-------------------|
| **YOLO** | **30-100+** | **Real-time detection** | **USE THIS** |
| Faster R-CNN | 5-7 | Accurate but slow | Too slow for live feeds |
| SSD | 20-40 | Mobile devices | Decent but YOLO is better |
| RetinaNet | 5-10 | High accuracy needed | Too slow for 4+ cameras |
| DETR (Transformer) | 3-5 | Research | Way too slow |

**For ExamGuard processing 4 cameras at 30 FPS = 120 frames/second, only YOLO is fast enough.**

---

## ExamGuard YOLO Pipeline

```python
from ultralytics import YOLO
import cv2
from datetime import datetime

# Load custom-trained ExamGuard model
model = YOLO('examguard_detector.pt')

# Connect to exam hall camera
cap = cv2.VideoCapture('rtsp://192.168.1.100:554/stream')

# Define alert thresholds
ALERT_THRESHOLDS = {
    'phone': 0.85,
    'chit': 0.75,
    'earpiece': 0.70,
    'smartwatch': 0.80
}

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Run detection
    results = model(frame, verbose=False)

    for result in results:
        for box in result.boxes:
            class_name = result.names[int(box.cls)]
            confidence = float(box.conf)
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            # Check if this detection should trigger an alert
            if class_name in ALERT_THRESHOLDS:
                if confidence >= ALERT_THRESHOLDS[class_name]:
                    # ALERT!
                    print(f"ALERT: {class_name} detected ({confidence:.1%})")

                    # Draw red box
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                    cv2.putText(frame, f'{class_name} {confidence:.0%}',
                                (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX,
                                0.8, (0, 0, 255), 2)

                    # Save evidence
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                    cv2.imwrite(f'evidence/{class_name}_{timestamp}.jpg', frame)

    cv2.imshow('ExamGuard', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

---

## Mini Project: Webcam Object Detection with Pre-Trained YOLO

**Goal:** Use pre-trained YOLO to detect objects through your webcam in real time.

```python
from ultralytics import YOLO
import cv2

# Load pre-trained YOLOv8
model = YOLO('yolov8n.pt')  # Downloads automatically first time (~6MB)

# Open webcam
cap = cv2.VideoCapture(0)

print("Press 'q' to quit")
print("Try holding up: phone, book, cup, bottle, etc.")

frame_count = 0
detection_log = []

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1

    # Run YOLO detection
    results = model(frame, verbose=False, conf=0.5)  # Only show >50% confidence

    # Log detections
    for result in results:
        for box in result.boxes:
            name = result.names[int(box.cls)]
            conf = float(box.conf)
            detection_log.append(f"Frame {frame_count}: {name} ({conf:.1%})")

    # Draw results
    annotated = results[0].plot()

    # Add FPS counter
    cv2.putText(annotated, f'Frame: {frame_count}',
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    cv2.imshow('YOLO Webcam Detection', annotated)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

# Print detection summary
print(f"\nProcessed {frame_count} frames")
print(f"Total detections: {len(detection_log)}")
print("\nLast 10 detections:")
for d in detection_log[-10:]:
    print(f"  {d}")
```

### What to Try:
1. Hold up your phone — YOLO should detect "cell phone"
2. Hold up a book — "book"
3. Wave a pen — might detect it, might not (small objects are harder)
4. Show multiple objects — YOLO detects them all simultaneously
5. Move objects around — watch the boxes follow in real time

### What You Will Learn:
- How to use YOLO with just a few lines of code
- Real-time object detection on live video
- How confidence scores work
- How fast YOLO processes frames
- The foundation for ExamGuard's object detection system

---

## Key Takeaway

YOLO is ExamGuard's eyes for detecting prohibited items. It processes 30+ frames per second, detects multiple objects simultaneously, and can be fine-tuned to recognize exam-specific items like chits and earpieces. Combined with OpenCV for reading camera feeds, YOLO forms the core of ExamGuard's real-time monitoring capability.
