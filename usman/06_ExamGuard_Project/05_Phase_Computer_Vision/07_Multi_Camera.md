# Multi-Camera Systems — Handling 4+ Cameras Per Hall

## What Is This?

Multi-camera processing means reading, processing, and coordinating video feeds from **multiple cameras simultaneously**. A single camera gives you one angle. Multiple cameras give you complete coverage — no blind spots, multiple perspectives on the same student.

```
Exam Hall A:

  Camera 1 (front-left)        Camera 2 (front-right)
       \                            /
        \                          /
         v                        v
  +----------------------------------+
  |  [s1] [s2] [s3] [s4] [s5] [s6]  |
  |  [s7] [s8] [s9] [s10][s11][s12] |
  |  [s13][s14][s15][s16][s17][s18] |
  |  [s19][s20][s21][s22][s23][s24] |
  |  [s25][s26][s27][s28][s29][s30] |
  +----------------------------------+
        ^                        ^
       /                          \
      /                            \
  Camera 3 (back-left)         Camera 4 (back-right)

4 cameras × 30 FPS = 120 frames/second to process
```

---

## WHY ExamGuard Needs Multiple Cameras

### Single Camera Problems:

```
Problem 1: Blind spots
  Camera at front → Cannot see students in back row clearly
  Camera at back → Cannot see front students' desk surfaces

Problem 2: Occlusion
  Student in row 2 blocks view of student in row 3
  Cannot see hands under desks from any single angle

Problem 3: Angle limitations
  Front camera → Good for gaze detection (seeing eyes)
  Side camera → Good for body pose (seeing hands reaching)
  One angle cannot capture everything
```

### Multi-Camera Solution:

```
Camera 1 (front-left):  Covers rows 1-3, good for faces/gaze
Camera 2 (front-right): Covers rows 1-3, different angle
Camera 3 (back-left):   Covers rows 3-5, sees desk surfaces
Camera 4 (back-right):  Covers rows 3-5, catches passing items

Combined: Full coverage, multiple angles, no blind spots
```

### ExamGuard Scale:

| Deployment | Cameras | FPS Each | Total FPS |
|-----------|---------|----------|-----------|
| 1 hall (30 students) | 4 | 30 | 120 |
| 5 halls (150 students) | 20 | 30 | 600 |
| Full exam (10 halls, 300 students) | 40 | 30 | 1,200 |
| University-wide (50 halls) | 200 | 30 | 6,000 |

---

## RTSP Streams — How Cameras Send Video Over Network

Security cameras and IP cameras use **RTSP (Real-Time Streaming Protocol)** to send video over the network. Instead of USB cables, cameras stream over WiFi or Ethernet.

```
IP Camera → Network (WiFi/Ethernet) → RTSP URL → Your Python code

RTSP URL format:
  rtsp://username:password@camera_ip:port/stream_path

Examples:
  rtsp://admin:password@192.168.1.100:554/stream1
  rtsp://admin:admin123@192.168.1.101:554/cam/realmonitor?channel=1
```

```python
import cv2

# Connect to an IP camera via RTSP
cap = cv2.VideoCapture('rtsp://admin:password@192.168.1.100:554/stream1')

if not cap.isOpened():
    print("ERROR: Cannot connect to camera!")
else:
    print("Connected to camera successfully")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Lost connection!")
            break

        cv2.imshow('IP Camera', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
```

---

## Multi-Threaded Camera Reading

The most important architecture decision: **each camera gets its own thread**.

If you read cameras one by one (sequentially), you can only process one camera at a time:

```
Sequential (WRONG):
  Read Cam1 → Process Cam1 → Read Cam2 → Process Cam2 → Read Cam3 → ...
  Time: 4 cameras × 50ms each = 200ms per cycle = 5 FPS (terrible)

Multi-threaded (CORRECT):
  Thread 1: Read Cam1 → Process Cam1 → Read Cam1 → ...
  Thread 2: Read Cam2 → Process Cam2 → Read Cam2 → ...
  Thread 3: Read Cam3 → Process Cam3 → Read Cam3 → ...
  Thread 4: Read Cam4 → Process Cam4 → Read Cam4 → ...
  Time: All cameras process simultaneously = 20+ FPS each
```

```python
import cv2
import threading
import queue
import time

class CameraStream:
    """Handles a single camera in its own thread."""

    def __init__(self, source, name, max_queue=30):
        self.source = source
        self.name = name
        self.cap = cv2.VideoCapture(source)
        self.frame_queue = queue.Queue(maxsize=max_queue)
        self.running = True
        self.frames_read = 0
        self.connected = self.cap.isOpened()

        if self.connected:
            self.thread = threading.Thread(target=self._read_loop, daemon=True)
            self.thread.start()
            print(f"[{name}] Connected and streaming")
        else:
            print(f"[{name}] FAILED to connect to {source}")

    def _read_loop(self):
        """Continuously read frames in background thread."""
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                print(f"[{self.name}] Lost connection!")
                self.connected = False
                break

            self.frames_read += 1

            # Drop old frames if queue is full (always keep latest)
            if self.frame_queue.full():
                try:
                    self.frame_queue.get_nowait()
                except queue.Empty:
                    pass

            self.frame_queue.put(frame)

    def get_frame(self):
        """Get the latest frame (non-blocking)."""
        try:
            return self.frame_queue.get_nowait()
        except queue.Empty:
            return None

    def stop(self):
        self.running = False
        self.cap.release()


class MultiCameraManager:
    """Manages multiple camera streams."""

    def __init__(self):
        self.cameras = {}

    def add_camera(self, source, name):
        """Add a camera stream."""
        cam = CameraStream(source, name)
        self.cameras[name] = cam
        return cam

    def get_all_frames(self):
        """Get latest frame from each camera."""
        frames = {}
        for name, cam in self.cameras.items():
            frame = cam.get_frame()
            if frame is not None:
                frames[name] = frame
        return frames

    def stop_all(self):
        """Stop all camera streams."""
        for cam in self.cameras.values():
            cam.stop()

    def status(self):
        """Print status of all cameras."""
        for name, cam in self.cameras.items():
            status = "CONNECTED" if cam.connected else "DISCONNECTED"
            print(f"  [{name}] {status} | Frames read: {cam.frames_read}")
```

---

## Using Multi-Camera Manager

```python
import cv2
import numpy as np

# Create manager
manager = MultiCameraManager()

# Add cameras (use webcam indices for testing, RTSP URLs for real cameras)
manager.add_camera(0, 'Cam-Front-Left')
# manager.add_camera(1, 'Cam-Front-Right')           # Second USB camera
# manager.add_camera('rtsp://...', 'Cam-Back-Left')   # IP camera
# manager.add_camera('rtsp://...', 'Cam-Back-Right')  # IP camera

# For testing with single webcam, use video files:
# manager.add_camera('video1.mp4', 'Cam-Front-Left')
# manager.add_camera('video2.mp4', 'Cam-Back-Right')

time.sleep(1)  # Give cameras time to initialize

while True:
    frames = manager.get_all_frames()

    if not frames:
        continue

    # Display all camera feeds in a grid
    display_frames = []
    for name, frame in frames.items():
        # Resize for display
        small = cv2.resize(frame, (640, 480))
        cv2.putText(small, name, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        display_frames.append(small)

    # Arrange in 2x2 grid
    if len(display_frames) >= 2:
        row1 = np.hstack(display_frames[:2])
        if len(display_frames) >= 4:
            row2 = np.hstack(display_frames[2:4])
            grid = np.vstack([row1, row2])
        else:
            grid = row1
    elif len(display_frames) == 1:
        grid = display_frames[0]
    else:
        continue

    cv2.imshow('ExamGuard Multi-Camera', grid)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

manager.stop_all()
cv2.destroyAllWindows()
```

---

## Person Re-Identification (Re-ID)

**The Challenge:** Student appears in Camera 1, then walks and appears in Camera 3. How does ExamGuard know it is the same person?

```
Camera 1 frame: [person detected, bounding box, appearance features]
Camera 3 frame: [person detected, bounding box, appearance features]

Re-ID model compares appearance features:
  Camera 1 person features: [0.23, 0.87, -0.12, ...]  (128 numbers)
  Camera 3 person features: [0.25, 0.85, -0.10, ...]  (128 numbers)

  Distance: 0.15 → SAME PERSON (below threshold)
```

**ExamGuard uses Re-ID for:**
- Tracking a student who leaves their seat and moves around
- Ensuring no one enters from another hall
- Matching suspicious person across multiple camera angles

```python
# Simplified Re-ID concept using appearance features
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
import numpy as np

# Use a pre-trained model as feature extractor
model = models.resnet50(pretrained=True)
model = torch.nn.Sequential(*list(model.children())[:-1])  # Remove last layer
model.eval()

transform = transforms.Compose([
    transforms.Resize((256, 128)),  # Standard Re-ID size
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

def extract_features(person_crop):
    """Extract appearance features from a person crop."""
    img = Image.fromarray(person_crop)
    img_tensor = transform(img).unsqueeze(0)

    with torch.no_grad():
        features = model(img_tensor)

    return features.squeeze().numpy()

def match_person(features1, features2, threshold=0.5):
    """Check if two person crops are the same person."""
    distance = np.linalg.norm(features1 - features2)
    is_same = distance < threshold
    return is_same, distance
```

---

## Edge Processing Architecture

For large deployments (50+ cameras), you cannot send all raw video to one central server. Instead, use **edge processing** — each camera has a small computer that pre-processes locally.

```
WITHOUT edge processing (BAD for scale):
  Camera 1 ──(raw video)──→
  Camera 2 ──(raw video)──→  Central Server (overwhelmed)
  Camera 3 ──(raw video)──→
  ...
  Camera 50 ─(raw video)──→

  Problem: 50 cameras × 30fps × 2MB/frame = 3 GB/second network traffic!

WITH edge processing (GOOD for scale):
  Camera 1 → [Edge Device] → (only alerts + suspicious clips) →
  Camera 2 → [Edge Device] → (only alerts + suspicious clips) →  Central Server
  Camera 3 → [Edge Device] → (only alerts + suspicious clips) →  (handles easily)
  ...
  Camera 50 → [Edge Device] → (only alerts + suspicious clips)→

  Each edge device runs YOLO locally
  Only sends data when something suspicious is detected
  Network traffic reduced by 95%+
```

**Edge devices:** Raspberry Pi, NVIDIA Jetson Nano, or any small computer with GPU capability.

```python
# Edge device code (runs on small computer attached to each camera)

class EdgeProcessor:
    def __init__(self, camera_url, server_url, hall_name, camera_name):
        self.cap = cv2.VideoCapture(camera_url)
        self.model = YOLO('yolov8n.pt')  # Lightweight model for edge
        self.server_url = server_url
        self.hall_name = hall_name
        self.camera_name = camera_name

    def process_and_send(self):
        """Process locally, only send suspicious findings."""
        while True:
            ret, frame = self.cap.read()
            if not ret:
                break

            results = self.model(frame, verbose=False, conf=0.5)

            suspicious = False
            for result in results:
                for box in result.boxes:
                    class_name = result.names[int(box.cls)]
                    if class_name in ['cell phone', 'book']:  # Suspicious objects
                        suspicious = True
                        break

            if suspicious:
                # Only NOW send data to server
                self.send_alert(frame, results)
                print(f"[{self.camera_name}] Alert sent to server")

            # Normal frames → do nothing (save bandwidth)

    def send_alert(self, frame, results):
        """Send suspicious frame and detections to central server."""
        # In real system: HTTP POST or WebSocket to server
        # For now, save locally
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        cv2.imwrite(f'alerts/{self.hall_name}_{self.camera_name}_{timestamp}.jpg', frame)
```

---

## Synchronizing Multiple Camera Feeds

When combining data from multiple cameras, timestamps must be synchronized:

```python
import time
from datetime import datetime

class SynchronizedMultiCamera:
    def __init__(self):
        self.cameras = {}
        self.sync_buffer = {}  # timestamp → {camera_name: frame}

    def add_camera(self, source, name):
        self.cameras[name] = CameraStream(source, name)

    def get_synchronized_frames(self, max_time_diff_ms=100):
        """Get frames from all cameras captured within 100ms of each other."""
        current_time = time.time()
        frames = {}

        for name, cam in self.cameras.items():
            frame = cam.get_frame()
            if frame is not None:
                frames[name] = {
                    'frame': frame,
                    'timestamp': current_time
                }

        # Check if all frames are within acceptable time window
        if len(frames) == len(self.cameras):
            timestamps = [f['timestamp'] for f in frames.values()]
            time_spread = (max(timestamps) - min(timestamps)) * 1000  # ms

            if time_spread <= max_time_diff_ms:
                return {name: f['frame'] for name, f in frames.items()}

        return None  # Frames not synchronized
```

---

## Mini Project: Read 2 Camera Feeds Simultaneously

**Goal:** Read from two video sources at the same time, detect people in both, and display in a side-by-side view.

```python
import cv2
import numpy as np
import threading
import queue
import time
from ultralytics import YOLO

class SimpleCamera:
    """Simple threaded camera reader."""
    def __init__(self, source, name):
        self.name = name
        self.cap = cv2.VideoCapture(source)
        self.latest_frame = None
        self.lock = threading.Lock()
        self.running = True

        self.thread = threading.Thread(target=self._read, daemon=True)
        self.thread.start()
        print(f"[{name}] Started")

    def _read(self):
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                break
            with self.lock:
                self.latest_frame = frame

    def get_frame(self):
        with self.lock:
            return self.latest_frame.copy() if self.latest_frame is not None else None

    def stop(self):
        self.running = False
        self.cap.release()


# Initialize YOLO
model = YOLO('yolov8n.pt')

# Start two camera streams
# For testing: use webcam (0) and a video file
# For real use: use two webcams (0, 1) or RTSP URLs
cam1 = SimpleCamera(0, 'Camera-1')
cam2 = SimpleCamera('test_video.mp4', 'Camera-2')  # Replace with second source

# If you only have one webcam, use the same source twice for testing:
# cam2 = SimpleCamera(0, 'Camera-2')

time.sleep(1)  # Let cameras initialize

person_count = {'Camera-1': 0, 'Camera-2': 0}

print("\nDual Camera Detection Running — Press 'q' to quit")

while True:
    frame1 = cam1.get_frame()
    frame2 = cam2.get_frame()

    if frame1 is None and frame2 is None:
        continue

    display_frames = []

    for cam_name, frame in [('Camera-1', frame1), ('Camera-2', frame2)]:
        if frame is None:
            # Create placeholder for missing camera
            placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(placeholder, f'{cam_name}: No Signal', (50, 240),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            display_frames.append(placeholder)
            continue

        # Resize for processing and display
        frame = cv2.resize(frame, (640, 480))

        # Run YOLO detection
        results = model(frame, verbose=False, conf=0.5, classes=[0])  # class 0 = person

        # Count people
        people_in_frame = 0
        for result in results:
            for box in result.boxes:
                people_in_frame += 1
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frame, f'Person {conf:.0%}', (x1, y1-10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        person_count[cam_name] = people_in_frame

        # Add camera label
        cv2.putText(frame, f'{cam_name} | People: {people_in_frame}',
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)

        display_frames.append(frame)

    # Side by side display
    if len(display_frames) == 2:
        combined = np.hstack(display_frames)
    else:
        combined = display_frames[0]

    # Total count across all cameras
    total = sum(person_count.values())
    cv2.putText(combined, f'Total people across cameras: {total}',
                (10, combined.shape[0] - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    cv2.imshow('Multi-Camera Detection', combined)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cam1.stop()
cam2.stop()
cv2.destroyAllWindows()

print(f"\nFinal person counts:")
for cam, count in person_count.items():
    print(f"  {cam}: {count} people")
```

### What You Will Learn:
- Reading multiple video sources simultaneously using threads
- Processing each camera feed independently
- Combining multiple views into one display
- The exact architecture ExamGuard uses for multi-camera monitoring
- Thread safety with locks when sharing data between threads

### Scaling Up:
After this works with 2 cameras, scaling to 4 is just adding more `SimpleCamera` instances. The architecture is the same.

---

## Key Takeaway

Multi-camera handling is what separates a demo from a real ExamGuard deployment. A single camera gives you a proof of concept. Four cameras per hall with synchronized processing, edge computing, and person re-identification gives you a production surveillance system. The threading and queue patterns you learn here are used in every real-time multi-camera system in the world.
