# Edge Computing — Processing Video Near the Camera

## What Is This?

Right now, you probably imagine one big powerful computer processing ALL the video from ALL the cameras. That is called "cloud" or "centralized" computing.

**Edge computing** means putting a small computer RIGHT NEXT TO each camera (or group of cameras) to do SOME processing locally, before sending anything to the central server.

Think of it like this:

```
WITHOUT Edge Computing:
  200 cameras → ALL video → 1 central server → OVERLOADED!
  200 cameras × 30fps × 1MB per frame = 6,000 MB per second
  That is 6 GB/second of data flowing to ONE server. Impossible.

WITH Edge Computing:
  Each camera → small computer next to it → processes locally
  → Only sends SUSPICIOUS frames to central server
  200 cameras, but 90% of frames are normal → filtered out locally
  Only 10% sent to server = 600 MB/second (manageable!)
```

---

## How Does It Work?

### The Architecture

```
Camera 1 ──→ Edge Device 1 ──→ ┐
Camera 2 ──→ Edge Device 1 ──→ │
Camera 3 ──→ Edge Device 2 ──→ │──→ Central Server ──→ Dashboard
Camera 4 ──→ Edge Device 2 ──→ │    (detailed AI)      (invigilator)
Camera 5 ──→ Edge Device 3 ──→ │
Camera 6 ──→ Edge Device 3 ──→ ┘

Edge Device: Runs lightweight YOLO (fast, basic detection)
Central Server: Runs full pipeline (CNN, LSTM, Autoencoder, RL)
```

### What Happens at Each Level

**Edge Device (at the camera):**
- Runs YOLOv8-nano (fastest, smallest model)
- Detects: "Is there a person? Is there a phone? Any object on desk?"
- Filters: "Is this frame worth analyzing further?"
- Decision: Normal frame → discard. Suspicious frame → send to server.

**Central Server (in the control room):**
- Receives only suspicious frames (10% of total)
- Runs full analysis: CNN behavior classification, LSTM sequence analysis, autoencoder anomaly detection
- Makes final decision: alert or not
- Sends result to dashboard

---

## WHY ExamGuard Needs This

### The Bandwidth Problem

```
One camera: 1920×1080 resolution, 30 fps
  Raw data: 1920 × 1080 × 3 bytes × 30 fps = 186 MB/second
  Compressed (H.264): ~2-5 MB/second

20 cameras compressed: 20 × 5 MB = 100 MB/second
  Network can handle this (Gigabit Ethernet = 125 MB/s)

200 cameras compressed: 200 × 5 MB = 1,000 MB/second
  Network CANNOT handle this. Need 10 Gigabit Ethernet.
  And one server cannot process all of it.
```

### The Processing Problem

```
Full AI pipeline per frame: ~25ms
200 cameras × 30 fps = 6,000 frames/second
6,000 × 25ms = 150,000ms of compute per second
Need 150 parallel GPU cores to keep up!

WITH edge computing:
Edge filters out 90% → only 600 frames/second reach server
600 × 25ms = 15,000ms → Need only 15 GPU cores. MUCH cheaper!
```

### The Latency Problem

```
Without edge:
  Camera → Network (50ms) → Server queue (200ms) → Process (25ms) → Alert
  Total: 275ms delay. Nearly a third of a second late.

With edge:
  Camera → Edge device (2ms) → Quick check (5ms)
  If suspicious → Server (50ms) → Process (25ms) → Alert
  Total for normal frames: 7ms (no delay)
  Total for suspicious: 82ms (much faster than 275ms)
```

---

## Edge Computing Hardware

### Option 1: NVIDIA Jetson Nano ($150-200)

```
What: A tiny computer with a GPU, size of a credit card
GPU: 128 CUDA cores
RAM: 4 GB
Power: 5-10 watts (plugs into wall outlet)

Can run: YOLOv8-nano at 15-25 fps
Perfect for: 1-2 cameras per device
```

### Option 2: NVIDIA Jetson Orin Nano ($500)

```
What: Upgraded version, much more powerful
GPU: 1024 CUDA cores
RAM: 8 GB
Power: 7-15 watts

Can run: YOLOv8-small at 30+ fps
Perfect for: 4-6 cameras per device
```

### Option 3: Raspberry Pi 5 + Coral TPU ($100 total)

```
What: Tiny general-purpose computer + Google's AI accelerator
GPU: None (uses TPU instead)
RAM: 4-8 GB
Power: 5 watts

Can run: Lightweight models at 10-15 fps
Perfect for: Simple detection, 1 camera per device
Cheaper but less powerful than Jetson
```

### Option 4: Intel NUC with GPU ($300-600)

```
What: Mini PC, more powerful than Jetson
GPU: Intel integrated or small discrete GPU
RAM: 8-16 GB

Can run: YOLOv8-small/medium at 30+ fps
Perfect for: 4-8 cameras per device
```

---

## Making Models Lightweight for Edge

### Model Compression Techniques

**1. Use Smaller Model Variants**
```python
from ultralytics import YOLO

# Full model (for server):
server_model = YOLO("yolov8m.pt")  # 25.9M parameters, accurate

# Edge model (for Jetson):
edge_model = YOLO("yolov8n.pt")    # 3.2M parameters, fast!

# Comparison:
# yolov8n: 3.2M params, 8.7 GFLOPs  → Edge
# yolov8s: 11.2M params, 28.6 GFLOPs → Good edge device
# yolov8m: 25.9M params, 78.9 GFLOPs → Server
# yolov8l: 43.7M params, 165 GFLOPs  → Powerful server
```

**2. Export for Edge (TensorRT)**
```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")

# Export optimized for Jetson
model.export(
    format="engine",      # TensorRT format
    half=True,            # FP16 (half precision — 2x faster)
    device=0              # Optimize for this specific GPU
)
# Creates: yolov8n.engine (runs 2-3x faster than .pt on Jetson)
```

**3. Reduce Input Resolution**
```python
# Instead of processing 1920x1080 (HD), resize to 640x480
# Faster processing, still good enough for detection

import cv2

frame = camera.read()  # 1920x1080
small_frame = cv2.resize(frame, (640, 480))  # Much faster to process
results = model(small_frame)
```

---

## Edge Device Code Example

### What Runs on the Edge Device

```python
"""
ExamGuard Edge Device Script
Runs on NVIDIA Jetson at each camera location.
Only sends suspicious frames to central server.
"""

import cv2
import requests
import json
import time
from ultralytics import YOLO

# Configuration
CAMERA_URL = "rtsp://192.168.1.10:554/stream1"
SERVER_URL = "http://central-server:8000/api/frame"
CAMERA_ID = "hall1_cam1"

# Load lightweight model
model = YOLO("yolov8n.engine")  # TensorRT optimized

# Connect to camera
cap = cv2.VideoCapture(CAMERA_URL)

suspicious_classes = ['cell phone', 'book', 'paper']  # Objects to flag
frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        continue

    frame_count += 1

    # Only process every 3rd frame (10 fps is enough)
    if frame_count % 3 != 0:
        continue

    # Run lightweight detection
    results = model(frame, verbose=False)

    # Check if anything suspicious was detected
    is_suspicious = False
    detections = []

    for box in results[0].boxes:
        class_name = results[0].names[int(box.cls)]
        confidence = float(box.conf)

        if class_name in suspicious_classes and confidence > 0.5:
            is_suspicious = True
            detections.append({
                'class': class_name,
                'confidence': confidence,
                'bbox': box.xyxy[0].tolist()
            })

    if is_suspicious:
        # ONLY send suspicious frames to server
        _, img_encoded = cv2.imencode('.jpg', frame)

        payload = {
            'camera_id': CAMERA_ID,
            'timestamp': time.time(),
            'detections': json.dumps(detections)
        }

        try:
            requests.post(
                SERVER_URL,
                files={'frame': img_encoded.tobytes()},
                data=payload,
                timeout=2
            )
            print(f"Sent suspicious frame: {detections}")
        except Exception as e:
            print(f"Failed to send: {e}")
    else:
        # Normal frame — discard, do not send
        pass
```

---

## What You Need to Learn

1. **Edge vs Cloud computing** — when to process locally vs remotely
2. **NVIDIA Jetson platform** — the go-to hardware for edge AI
3. **Model compression** — making models small enough for edge devices
4. **Network architecture** — how edge devices communicate with the server
5. **Power and cost planning** — how many edge devices for your deployment

---

## Mini Project: Run YOLO on a Raspberry Pi or Jetson

### If You Have a Jetson Nano

**Step 1: Flash JetPack OS**
- Download JetPack from NVIDIA website
- Flash to microSD card using Etcher
- Boot the Jetson, complete setup

**Step 2: Install Dependencies**
```bash
# On Jetson terminal:
pip install ultralytics opencv-python
```

**Step 3: Run YOLO**
```python
from ultralytics import YOLO
import cv2

model = YOLO("yolov8n.pt")

# Use USB webcam connected to Jetson
cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    results = model(frame, verbose=False)
    annotated = results[0].plot()

    cv2.imshow("Jetson Detection", annotated)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break
```

**Step 4: Measure FPS**
```python
import time

start = time.time()
count = 0

while count < 100:
    ret, frame = cap.read()
    results = model(frame, verbose=False)
    count += 1

elapsed = time.time() - start
print(f"FPS on Jetson: {count/elapsed:.1f}")
```

### If You Do NOT Have a Jetson (Simulate It)

You can simulate edge computing on your regular computer:

```python
"""
Simulate edge computing:
- Run lightweight YOLO (pretend it is on edge device)
- Only forward suspicious frames (pretend sending to server)
- Run full pipeline on suspicious frames only (pretend this is the server)
"""

lightweight_model = YOLO("yolov8n.pt")   # "Edge" model
full_model = YOLO("yolov8m.pt")          # "Server" model

frames_processed_edge = 0
frames_sent_to_server = 0

for frame in video_frames:
    frames_processed_edge += 1

    # Edge processing (fast check)
    results = lightweight_model(frame, verbose=False)
    has_suspicious = any(box.conf > 0.5 for box in results[0].boxes)

    if has_suspicious:
        # "Send to server" — run full pipeline
        frames_sent_to_server += 1
        full_results = full_model(frame, verbose=False)
        # Process full_results...

print(f"Edge processed: {frames_processed_edge} frames")
print(f"Sent to server: {frames_sent_to_server} frames")
print(f"Filtered out: {(1 - frames_sent_to_server/frames_processed_edge)*100:.0f}%")
```

---

## Key Takeaways

1. **Edge computing processes data near the source** — reduces network load and latency
2. **90% of frames are normal** — edge devices filter them, server only handles the interesting 10%
3. **NVIDIA Jetson is the go-to edge device** — small, cheap, GPU-equipped
4. **Use lightweight models at the edge** — YOLOv8-nano, TensorRT optimized
5. **Edge + Server = best of both worlds** — fast local filtering, deep central analysis
