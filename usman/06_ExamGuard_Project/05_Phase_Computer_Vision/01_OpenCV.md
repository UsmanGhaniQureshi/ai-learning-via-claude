# OpenCV — The Foundation of Computer Vision

## What Is This?

**OpenCV** (Open Source Computer Vision Library) is THE Python library for working with images and video. If you want to read a camera feed, draw a box around a detected face, resize an image, or convert colors — you use OpenCV.

Think of it this way:
- PyTorch = the brain (makes decisions about what it sees)
- OpenCV = the eyes and hands (reads images, draws results, processes frames)

Every computer vision project in the world uses OpenCV. It has been around since 2000, it is free, and it works on every platform.

---

## WHY OpenCV Is Essential for ExamGuard

**Every single camera frame passes through OpenCV before any AI model ever sees it.**

Here is the ExamGuard frame processing pipeline:

```
Camera captures frame
        |
        v
[OpenCV reads the frame]              ← cv2.VideoCapture()
        |
        v
[OpenCV resizes it]                    ← cv2.resize()
        |
        v
[OpenCV converts color if needed]     ← cv2.cvtColor()
        |
        v
[PyTorch/YOLO processes it]           ← AI model
        |
        v
[OpenCV draws detection boxes]        ← cv2.rectangle()
        |
        v
[OpenCV adds text labels]             ← cv2.putText()
        |
        v
[OpenCV saves/displays result]        ← cv2.imwrite() / cv2.imshow()
```

Without OpenCV, you cannot:
- Read camera feeds
- Process video frames
- Draw bounding boxes around detected cheaters
- Save evidence clips
- Display the monitoring dashboard

**OpenCV is like learning to drive before you can race.** You need it for everything.

---

## What You Need to Learn

### 1. Reading Images

```python
import cv2

# Read an image from file
image = cv2.imread('exam_frame.jpg')

# Check what you got
print(type(image))          # <class 'numpy.ndarray'>
print(image.shape)          # (1080, 1920, 3) → height, width, 3 color channels
print(image.dtype)          # uint8 → pixel values 0-255

# Display the image
cv2.imshow('Exam Frame', image)
cv2.waitKey(0)              # Wait for any key press
cv2.destroyAllWindows()
```

**ExamGuard connection:** Every saved evidence frame is loaded this way for review.

### 2. Reading Video (Camera Feed)

```python
import cv2

# Read from webcam (0 = default camera)
cap = cv2.VideoCapture(0)

# Read from video file
# cap = cv2.VideoCapture('exam_recording.mp4')

# Read from network camera (RTSP stream)
# cap = cv2.VideoCapture('rtsp://192.168.1.100:554/stream')

while True:
    ret, frame = cap.read()    # ret = success?, frame = the image

    if not ret:
        break

    # Display the frame
    cv2.imshow('Live Feed', frame)

    # Press 'q' to quit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

**ExamGuard connection:** This is literally how ExamGuard reads each exam hall camera. Replace `0` with an RTSP URL and you are reading a real security camera.

### 3. Drawing Rectangles (Bounding Boxes)

```python
import cv2

image = cv2.imread('exam_frame.jpg')

# Draw a red rectangle around a detected student
# Parameters: image, top-left corner, bottom-right corner, color (BGR), thickness
cv2.rectangle(image, (100, 50), (300, 400), (0, 0, 255), 2)

# Draw a green rectangle for "normal" student
cv2.rectangle(image, (400, 50), (600, 400), (0, 255, 0), 2)

cv2.imshow('Detections', image)
cv2.waitKey(0)
```

**ExamGuard connection:** Every detected cheater gets a red box. Every normal student gets a green box. Every detected phone/chit gets a yellow box with label.

### 4. Adding Text Labels

```python
import cv2

image = cv2.imread('exam_frame.jpg')

# Add text above the bounding box
cv2.putText(image, 'CHEATING 87%', (100, 45),
            cv2.FONT_HERSHEY_SIMPLEX,   # Font
            0.8,                          # Font size
            (0, 0, 255),                  # Red color (BGR)
            2)                            # Thickness

cv2.putText(image, 'Normal', (400, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 0),                  # Green color
            2)

cv2.imshow('Labeled', image)
cv2.waitKey(0)
```

### 5. Resizing Images

```python
import cv2

image = cv2.imread('exam_frame.jpg')   # Original: 1920x1080

# Resize to specific dimensions (what AI models need)
resized = cv2.resize(image, (224, 224))

# Resize by percentage
half = cv2.resize(image, None, fx=0.5, fy=0.5)   # 50% of original

print(f"Original: {image.shape}")     # (1080, 1920, 3)
print(f"Resized: {resized.shape}")    # (224, 224, 3)
print(f"Half: {half.shape}")          # (540, 960, 3)
```

**ExamGuard connection:** Camera captures at 1920x1080, but CNN needs 224x224. OpenCV does the resizing.

### 6. Color Conversion

```python
import cv2

image = cv2.imread('exam_frame.jpg')   # Loaded in BGR (OpenCV default)

# Convert to RGB (what PyTorch/matplotlib expect)
rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

# Convert to grayscale (for some models, faster processing)
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

# Convert to HSV (for color-based detection)
hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
```

**Important:** OpenCV loads images in BGR (Blue, Green, Red), not RGB. This trips up every beginner. Always convert to RGB before passing to PyTorch.

### 7. Saving Frames (Evidence)

```python
import cv2
from datetime import datetime

image = cv2.imread('exam_frame.jpg')

# Save a single frame
cv2.imwrite('evidence_frame.jpg', image)

# Save with timestamp (for ExamGuard evidence logs)
timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
filename = f'evidence/cheating_{timestamp}.jpg'
cv2.imwrite(filename, image)
# Saves as: evidence/cheating_20260319_102345.jpg
```

**ExamGuard connection:** When cheating is detected, the system saves the frame with timestamp as evidence.

---

## ExamGuard OpenCV Pipeline — Complete Example

```python
import cv2
import numpy as np
from datetime import datetime

# Read from exam hall camera
cap = cv2.VideoCapture('rtsp://192.168.1.100:554/stream')

# Get video properties
fps = cap.get(cv2.CAP_PROP_FPS)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f"Camera: {width}x{height} at {fps} FPS")

frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1

    # Skip frames for performance (process every 3rd frame)
    if frame_count % 3 != 0:
        continue

    # Resize for AI model
    model_input = cv2.resize(frame, (224, 224))
    model_input_rgb = cv2.cvtColor(model_input, cv2.COLOR_BGR2RGB)

    # --- HERE IS WHERE YOU PLUG IN YOUR AI MODEL ---
    # prediction = model.predict(model_input_rgb)
    # For now, simulate a detection:
    is_cheating = frame_count % 100 < 10  # Fake detection every 100 frames

    if is_cheating:
        # Draw red box and label
        cv2.rectangle(frame, (200, 100), (500, 450), (0, 0, 255), 3)
        cv2.putText(frame, 'CHEATING DETECTED', (200, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

        # Save evidence
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        cv2.imwrite(f'evidence/cheating_{timestamp}.jpg', frame)

    # Add timestamp overlay
    time_text = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cv2.putText(frame, time_text, (10, height - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    # Display
    cv2.imshow('ExamGuard - Hall A', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

---

## Mini Project: Motion Detection in Video

**Goal:** Read a video file and detect frames where something moves. This is the simplest form of surveillance and teaches you the core OpenCV skills.

```python
import cv2
import numpy as np

# Read video (use webcam with 0, or a video file)
cap = cv2.VideoCapture(0)

# Read first frame as the "background"
ret, prev_frame = cap.read()
prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
prev_gray = cv2.GaussianBlur(prev_gray, (21, 21), 0)

motion_detected_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Convert current frame to grayscale and blur
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (21, 21), 0)

    # Calculate difference between current and previous frame
    diff = cv2.absdiff(prev_gray, gray)

    # Threshold: if difference > 25, it is motion
    thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)[1]

    # Dilate to fill gaps
    thresh = cv2.dilate(thresh, None, iterations=2)

    # Find contours (moving regions)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL,
                                    cv2.CHAIN_APPROX_SIMPLE)

    motion_in_frame = False

    for contour in contours:
        # Ignore tiny movements (noise)
        if cv2.contourArea(contour) < 5000:
            continue

        motion_in_frame = True

        # Draw box around motion
        x, y, w, h = cv2.boundingRect(contour)
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

    if motion_in_frame:
        motion_detected_count += 1
        cv2.putText(frame, f'MOTION DETECTED ({motion_detected_count})',
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

    # Show result
    cv2.imshow('Motion Detection', frame)
    cv2.imshow('Threshold', thresh)

    # Update previous frame
    prev_gray = gray.copy()

    if cv2.waitKey(30) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print(f"Total frames with motion: {motion_detected_count}")
```

### What You Will Learn:
- Reading video frame by frame
- Converting between color and grayscale
- Image subtraction (finding differences between frames)
- Thresholding (converting gray differences to black/white)
- Finding and drawing contours
- Real-time display with OpenCV

### Connection to ExamGuard:
This is a primitive version of what ExamGuard does. Instead of just detecting "motion," ExamGuard uses AI to determine "that motion is a student passing a chit." But the OpenCV frame reading, processing, and display pipeline is identical.

---

## Key OpenCV Functions for ExamGuard

| Function | What It Does | ExamGuard Use |
|----------|-------------|---------------|
| `cv2.VideoCapture()` | Read camera feed | Read exam hall cameras |
| `cv2.imread()` | Read image file | Load saved evidence |
| `cv2.resize()` | Resize image | Prep frames for AI model |
| `cv2.cvtColor()` | Convert colors | BGR to RGB for PyTorch |
| `cv2.rectangle()` | Draw box | Mark detected cheaters |
| `cv2.putText()` | Add text | Label detections with confidence |
| `cv2.imwrite()` | Save image | Save evidence frames |
| `cv2.imshow()` | Display image | Monitoring dashboard |
| `cv2.GaussianBlur()` | Blur image | Reduce noise before processing |

---

## Key Takeaway

OpenCV is the first thing you use and the last thing you use in any computer vision pipeline. It reads the camera, it preprocesses for the AI model, it draws the results, and it saves the evidence. You cannot build ExamGuard without it. Learn these basics well — you will use them in every single lesson from here on.
