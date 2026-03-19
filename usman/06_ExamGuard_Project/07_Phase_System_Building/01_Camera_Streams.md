# Camera Streams — Reading Live Video from Real Cameras

## What Is This?

So far, you have been working with saved images and video files. Click "run," and the model processes a file on your computer.

But ExamGuard needs to read LIVE video from REAL cameras hanging on the walls of exam halls.

**Camera streaming** means connecting to physical cameras over a network and reading their video feed in real-time using Python.

---

## How Cameras Send Video Over a Network

### The Protocol: RTSP

**RTSP (Real Time Streaming Protocol)** is how IP cameras share their video over a network. Think of it like a web address, but for video:

```
Web page:  http://google.com
Video feed: rtsp://192.168.1.10:554/stream1
```

Every IP camera has an RTSP URL. When you connect to it, you get a live video stream.

### How It Works Step by Step

```
Physical camera on wall
    ↓
Camera connects to network (WiFi or Ethernet cable)
    ↓
Camera gets an IP address (like 192.168.1.10)
    ↓
Camera streams video on port 554 (RTSP default)
    ↓
Your Python code connects to rtsp://192.168.1.10:554/stream
    ↓
OpenCV reads frames from the stream
    ↓
Your AI model processes each frame
```

### Types of Cameras

```
Type             | Price   | Quality | Use Case
─────────────────────────────────────────────────
USB Webcam       | $20-50  | OK      | Testing, development
IP Camera        | $50-200 | Good    | Small deployment
PTZ Camera       | $200+   | Great   | Large halls (pan/tilt/zoom)
Phone as Camera  | Free    | OK      | Testing! (use IP Webcam app)
```

---

## WHY ExamGuard Needs This

### From Development to Reality

```
Development:   model.predict("exam_photo.jpg")     ← Saved file
Production:    model.predict(live_camera_frame)     ← Real-time stream

The model is the SAME. The input source changes.
```

### Multi-Camera Setup

```
Exam Hall Layout:

  Camera 1 (front-left)          Camera 2 (front-right)
      📷                              📷
      ↓                               ↓
  [Student] [Student] [Student] [Student] [Student]
  [Student] [Student] [Student] [Student] [Student]
  [Student] [Student] [Student] [Student] [Student]
  [Student] [Student] [Student] [Student] [Student]
      ↑                               ↑
      📷                              📷
  Camera 3 (back-left)           Camera 4 (back-right)

Each camera covers a section of the hall.
Python reads ALL four streams simultaneously.
```

---

## Reading Camera Streams with Python

### Method 1: USB Webcam (Easiest — Start Here)

```python
import cv2

# Open webcam (0 = first camera, 1 = second camera)
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("ERROR: Cannot open camera!")
    exit()

while True:
    ret, frame = cap.read()  # Read one frame

    if not ret:
        print("ERROR: Cannot read frame!")
        break

    # Display the frame
    cv2.imshow("Webcam Feed", frame)

    # Press 'q' to quit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

### Method 2: IP Camera via RTSP

```python
import cv2

# RTSP URL of your IP camera
# Format varies by camera brand:
# Hikvision:  rtsp://username:password@192.168.1.10:554/Streaming/Channels/101
# Dahua:      rtsp://username:password@192.168.1.10:554/cam/realmonitor?channel=1
# Generic:    rtsp://192.168.1.10:554/stream1

rtsp_url = "rtsp://admin:password123@192.168.1.10:554/stream1"

cap = cv2.VideoCapture(rtsp_url)

if not cap.isOpened():
    print("ERROR: Cannot connect to camera!")
    print("Check: Is the camera on? Is the URL correct? Are you on the same network?")
    exit()

while True:
    ret, frame = cap.read()

    if not ret:
        print("Connection lost! Trying to reconnect...")
        cap.release()
        cap = cv2.VideoCapture(rtsp_url)
        continue

    cv2.imshow("IP Camera Feed", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

### Method 3: Phone as Camera (Free for Testing)

```
Step 1: Install "IP Webcam" app on your Android phone
        (or "EpocCam" for iPhone)

Step 2: Open the app → Start Server

Step 3: It shows a URL like: http://192.168.1.5:8080

Step 4: In Python:
```

```python
import cv2

# Use the URL from the phone app
phone_url = "http://192.168.1.5:8080/video"

cap = cv2.VideoCapture(phone_url)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    cv2.imshow("Phone Camera", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

---

## Handling Multiple Cameras

### Reading 4 Cameras at Once

```python
import cv2
import threading
from queue import Queue

class CameraStream:
    """Read camera in a separate thread so it does not block."""

    def __init__(self, source, name):
        self.name = name
        self.cap = cv2.VideoCapture(source)
        self.frame = None
        self.running = True

        # Start reading in background thread
        self.thread = threading.Thread(target=self._read_frames, daemon=True)
        self.thread.start()

    def _read_frames(self):
        while self.running:
            ret, frame = self.cap.read()
            if ret:
                self.frame = frame
            else:
                print(f"{self.name}: Connection lost! Reconnecting...")
                self.cap.release()
                self.cap = cv2.VideoCapture(self.source)

    def get_frame(self):
        return self.frame

    def stop(self):
        self.running = False
        self.cap.release()


# Create 4 camera streams
cameras = [
    CameraStream("rtsp://192.168.1.10:554/stream1", "Front-Left"),
    CameraStream("rtsp://192.168.1.11:554/stream1", "Front-Right"),
    CameraStream("rtsp://192.168.1.12:554/stream1", "Back-Left"),
    CameraStream("rtsp://192.168.1.13:554/stream1", "Back-Right"),
]

while True:
    for i, cam in enumerate(cameras):
        frame = cam.get_frame()
        if frame is not None:
            # Resize for display
            small = cv2.resize(frame, (640, 480))
            cv2.imshow(f"Camera {i}: {cam.name}", small)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Clean up
for cam in cameras:
    cam.stop()
cv2.destroyAllWindows()
```

### Grid Display (All Cameras in One Window)

```python
import numpy as np

def create_camera_grid(frames, grid_size=(2, 2), cell_size=(640, 480)):
    """Arrange multiple camera feeds in a grid."""
    rows, cols = grid_size
    h, w = cell_size

    # Create blank grid
    grid = np.zeros((rows * h, cols * w, 3), dtype=np.uint8)

    for i, frame in enumerate(frames):
        if frame is None:
            continue
        row = i // cols
        col = i % cols
        resized = cv2.resize(frame, (w, h))
        grid[row*h:(row+1)*h, col*w:(col+1)*w] = resized

    return grid

# Use it:
while True:
    frames = [cam.get_frame() for cam in cameras]
    grid = create_camera_grid(frames)
    cv2.imshow("ExamGuard - All Cameras", grid)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break
```

---

## Handling Common Problems

### Problem 1: Camera Disconnects
```python
import time

def robust_camera_read(rtsp_url, max_retries=5):
    """Camera reader that automatically reconnects."""
    cap = cv2.VideoCapture(rtsp_url)
    retry_count = 0

    while True:
        ret, frame = cap.read()

        if ret:
            retry_count = 0  # Reset on success
            yield frame
        else:
            retry_count += 1
            print(f"Read failed. Retry {retry_count}/{max_retries}")

            if retry_count >= max_retries:
                print("Reconnecting...")
                cap.release()
                time.sleep(2)  # Wait before reconnecting
                cap = cv2.VideoCapture(rtsp_url)
                retry_count = 0

# Use it:
for frame in robust_camera_read("rtsp://192.168.1.10:554/stream1"):
    result = model.predict(frame)
```

### Problem 2: High Latency (Delay)
```python
# RTSP streams can buffer frames, causing delay
# Solution: Always grab the LATEST frame, skip old ones

cap = cv2.VideoCapture(rtsp_url)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize buffer

# Or: grab multiple times, only process the last one
for _ in range(5):  # Skip 5 buffered frames
    cap.grab()
ret, frame = cap.retrieve()  # Get only the latest
```

### Problem 3: Resolution and FPS Settings
```python
cap = cv2.VideoCapture(rtsp_url)

# Set resolution
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

# Check actual values (camera may not support your request)
actual_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
actual_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
actual_fps = cap.get(cv2.CAP_PROP_FPS)

print(f"Resolution: {actual_width}x{actual_height}")
print(f"FPS: {actual_fps}")
```

---

## What You Need to Learn

1. **RTSP protocol basics** — how cameras stream video over networks
2. **OpenCV VideoCapture** — the Python tool to read streams
3. **Threading** — reading cameras without blocking your main program
4. **Error handling** — cameras disconnect, network drops, buffers fill up
5. **Multiple cameras** — reading and displaying several feeds at once

---

## Mini Project: Phone Camera to AI Pipeline

### Goal
Turn your phone into an IP camera, read the stream in Python, run YOLO on it, and display results.

### Steps

**Step 1: Setup Phone as Camera**
- Install "IP Webcam" app on Android phone
- Connect phone to same WiFi as your computer
- Open app, tap "Start Server"
- Note the URL shown (e.g., http://192.168.1.5:8080)

**Step 2: Read and Display**
```python
import cv2

url = "http://192.168.1.5:8080/video"  # Your phone's URL
cap = cv2.VideoCapture(url)

while True:
    ret, frame = cap.read()
    if not ret:
        print("Cannot read frame!")
        break

    cv2.imshow("Phone Camera", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

**Step 3: Add YOLO Detection**
```python
from ultralytics import YOLO
import cv2

model = YOLO("yolov8n.pt")
url = "http://192.168.1.5:8080/video"
cap = cv2.VideoCapture(url)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Run YOLO on each frame
    results = model(frame, verbose=False)

    # Draw results on frame
    annotated = results[0].plot()

    # Show
    cv2.imshow("ExamGuard - Live Detection", annotated)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

**Step 4: Add FPS Counter**
```python
import time

fps_start = time.time()
frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    results = model(frame, verbose=False)
    annotated = results[0].plot()

    # Calculate FPS
    frame_count += 1
    elapsed = time.time() - fps_start
    fps = frame_count / elapsed

    cv2.putText(annotated, f"FPS: {fps:.1f}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    cv2.imshow("ExamGuard - Live Detection", annotated)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break
```

### What You Will Learn
- How to connect to a real camera stream
- How to run AI models on live video
- How to handle real-world issues (latency, disconnects)
- The foundation for ExamGuard's camera system

---

## Key Takeaways

1. **RTSP is the standard protocol** for IP cameras — every camera speaks it
2. **OpenCV VideoCapture works with URLs** — same code for webcam, IP camera, or phone
3. **Use threading** — never read cameras on the main thread (it blocks everything)
4. **Handle disconnects gracefully** — cameras WILL disconnect during a 3-hour exam
5. **Start with your phone** — free, easy, and teaches you everything you need
