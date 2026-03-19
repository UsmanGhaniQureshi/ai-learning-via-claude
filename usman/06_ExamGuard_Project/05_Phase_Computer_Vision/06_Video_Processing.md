# Video Processing — Real-Time Frame-by-Frame Analysis

## What Is This?

Video processing means taking a live camera feed or recorded video and analyzing it **frame by frame** in real time. A video is just a rapid sequence of images (frames) — typically 30 frames per second. Video processing means running your AI models on each of those frames fast enough to keep up.

```
Video at 30 FPS:

Frame 1     Frame 2     Frame 3     Frame 4     ...    Frame 30
[image]  →  [image]  →  [image]  →  [image]  →  ...  → [image]
  |           |           |           |                    |
  v           v           v           v                    v
 AI          AI          AI          AI                   AI
 model       model       model       model                model
  |           |           |           |                    |
  v           v           v           v                    v
Result      Result      Result      Result              Result

All 30 results must be ready within 1 second, or the system falls behind.
```

---

## WHY This Matters for ExamGuard

ExamGuard does not analyze static photos. It analyzes **live video streams** from exam hall cameras. This creates massive processing demands:

```
Single camera:
  30 frames/second × 1 exam hall = 30 frames to process per second

Real ExamGuard deployment:
  4 cameras per hall × 30 fps = 120 frames/second per hall
  10 halls × 120 fps = 1,200 frames/second for full exam
  3-hour exam = 1,200 × 3600 × 3 = 12,960,000 frames total
```

If your processing takes longer than the incoming frame rate, the system falls behind. Frames pile up. By the end of the exam, you might be 30 minutes behind on analysis. That is useless — you need **real-time alerts**, not alerts after the exam is over.

---

## Key Concepts

### FPS (Frames Per Second)

```
Camera FPS: How many frames the camera captures per second
  - Typical: 30 fps
  - High quality: 60 fps
  - Security cameras: 15-30 fps

Processing FPS: How many frames your AI can process per second
  - YOLO on GPU: 30-100+ fps ✓ (can keep up)
  - YOLO on CPU: 5-15 fps (falls behind at 30fps input)
  - Complex pipeline (YOLO + Pose + Gaze): 10-20 fps

RULE: Processing FPS must be >= Camera FPS, or you must skip frames
```

### Frame Extraction

```python
import cv2

cap = cv2.VideoCapture('exam_recording.mp4')

fps = cap.get(cv2.CAP_PROP_FPS)          # Camera FPS
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_frames / fps

print(f"Video: {fps} FPS, {total_frames} frames, {duration:.1f} seconds")

frame_count = 0
while True:
    ret, frame = cap.read()
    if not ret:
        break
    frame_count += 1

    # Process frame here...

cap.release()
print(f"Processed {frame_count} frames")
```

### Frame Skipping (Critical for Performance)

You do NOT need to process every single frame. If a student is cheating, they will be cheating across many frames. Processing every 3rd frame still catches everything.

```python
import cv2

cap = cv2.VideoCapture(0)
frame_count = 0
SKIP_FRAMES = 3  # Process every 3rd frame

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1

    # Skip frames we do not need to process
    if frame_count % SKIP_FRAMES != 0:
        continue

    # Only process every 3rd frame
    # At 30fps, this means processing 10 frames/second — plenty for cheating detection
    process_frame(frame)

cap.release()
```

**ExamGuard math:**
- Camera: 30 fps
- Skip every 3rd: Process 10 fps
- Cheating event lasts 5+ seconds = 50+ frames analyzed
- More than enough to detect and flag

### Buffering

When processing takes longer than frame arrival, you need a buffer:

```
Without buffer:
  Frame arrives → Process immediately → if slow, DROP frame → miss events

With buffer (queue):
  Frame arrives → Add to queue → Process from queue → never miss a frame
  If queue grows too large → skip oldest frames (they are stale anyway)
```

```python
import cv2
import threading
import queue

class VideoBuffer:
    def __init__(self, source, max_buffer=30):
        self.cap = cv2.VideoCapture(source)
        self.buffer = queue.Queue(maxsize=max_buffer)
        self.running = True

        # Start capture thread
        self.thread = threading.Thread(target=self._capture, daemon=True)
        self.thread.start()

    def _capture(self):
        """Continuously read frames into buffer."""
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                break

            if self.buffer.full():
                # Drop oldest frame (it is stale)
                try:
                    self.buffer.get_nowait()
                except queue.Empty:
                    pass

            self.buffer.put(frame)

    def get_frame(self):
        """Get the next frame to process."""
        try:
            return self.buffer.get(timeout=1)
        except queue.Empty:
            return None

    def stop(self):
        self.running = False
        self.cap.release()
```

---

## Multi-Threading for Speed

The biggest performance trick: **read frames on one thread, process on another**.

Without threading:
```
Read frame (5ms) → Process frame (50ms) → Read frame (5ms) → Process (50ms)
Total per frame: 55ms = 18 fps MAX
```

With threading:
```
Thread 1 (Reader):  Read → Read → Read → Read → Read
Thread 2 (Processor):       Process → Process → Process → Process
Total: Reader and processor work simultaneously = higher throughput
```

```python
import cv2
import threading
import queue
import time

class ThreadedVideoProcessor:
    def __init__(self, source):
        self.cap = cv2.VideoCapture(source)
        self.frame_queue = queue.Queue(maxsize=60)
        self.result_queue = queue.Queue(maxsize=60)
        self.running = True
        self.frames_read = 0
        self.frames_processed = 0

    def reader_thread(self):
        """Continuously read frames from camera."""
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                break

            self.frames_read += 1

            if not self.frame_queue.full():
                self.frame_queue.put(frame)
            # If full, skip this frame (drop oldest if needed)

    def processor_thread(self, process_fn):
        """Continuously process frames from queue."""
        while self.running:
            try:
                frame = self.frame_queue.get(timeout=1)
            except queue.Empty:
                continue

            # Run AI model on frame
            result = process_fn(frame)
            self.frames_processed += 1

            if not self.result_queue.full():
                self.result_queue.put((frame, result))

    def start(self, process_fn):
        """Start reading and processing in separate threads."""
        reader = threading.Thread(target=self.reader_thread, daemon=True)
        processor = threading.Thread(target=self.processor_thread,
                                     args=(process_fn,), daemon=True)

        reader.start()
        processor.start()

        return reader, processor

    def stop(self):
        self.running = False
        self.cap.release()

# Usage:
def my_ai_model(frame):
    """Your YOLO/CNN/Pose model goes here."""
    # result = model(frame)
    time.sleep(0.03)  # Simulate 30ms processing time
    return {"cheating": False, "confidence": 0.1}

processor = ThreadedVideoProcessor(0)
reader, proc = processor.start(my_ai_model)

start_time = time.time()

while True:
    try:
        frame, result = processor.result_queue.get(timeout=1)
    except queue.Empty:
        continue

    # Display result
    elapsed = time.time() - start_time
    fps = processor.frames_processed / elapsed if elapsed > 0 else 0

    cv2.putText(frame, f'Processing FPS: {fps:.1f}', (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(frame, f'Read: {processor.frames_read} | Processed: {processor.frames_processed}',
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    cv2.imshow('Threaded Processing', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

processor.stop()
cv2.destroyAllWindows()
```

---

## ExamGuard Video Processing Pipeline

```python
import cv2
import time
import threading
import queue
from ultralytics import YOLO
from datetime import datetime

class ExamGuardProcessor:
    def __init__(self, camera_url, hall_name, model_path='yolov8n.pt'):
        self.camera_url = camera_url
        self.hall_name = hall_name
        self.model = YOLO(model_path)
        self.cap = cv2.VideoCapture(camera_url)
        self.alerts = []
        self.frame_count = 0
        self.process_every_n = 3  # Process every 3rd frame

    def process_stream(self):
        """Main processing loop for one camera."""
        print(f"[{self.hall_name}] Starting video processing...")

        fps_start = time.time()
        fps_frames = 0

        while True:
            ret, frame = self.cap.read()
            if not ret:
                print(f"[{self.hall_name}] Camera disconnected!")
                break

            self.frame_count += 1

            # Skip frames for performance
            if self.frame_count % self.process_every_n != 0:
                continue

            # Run detection
            results = self.model(frame, verbose=False, conf=0.5)
            fps_frames += 1

            # Check for suspicious objects
            for result in results:
                for box in result.boxes:
                    class_name = result.names[int(box.cls)]
                    confidence = float(box.conf)

                    if class_name == 'cell phone' and confidence > 0.7:
                        alert = {
                            'hall': self.hall_name,
                            'object': class_name,
                            'confidence': confidence,
                            'time': datetime.now().isoformat(),
                            'frame': self.frame_count
                        }
                        self.alerts.append(alert)
                        print(f"  ALERT: {alert}")

                        # Save evidence frame
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                        cv2.imwrite(f'evidence/{self.hall_name}_{timestamp}.jpg', frame)

            # Calculate processing FPS
            elapsed = time.time() - fps_start
            if elapsed > 0:
                current_fps = fps_frames / elapsed
            else:
                current_fps = 0

            # Display
            cv2.putText(frame, f'{self.hall_name} | FPS: {current_fps:.1f} | Alerts: {len(self.alerts)}',
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        self.cap.release()

    def stop(self):
        self.cap.release()

# Usage for a single camera:
processor = ExamGuardProcessor(0, 'Hall-A-Cam1')
processor.process_stream()
```

---

## Performance Optimization Tips

| Technique | Impact | Effort |
|-----------|--------|--------|
| Frame skipping (every 3rd) | 3x faster | Easy |
| Resize frames before AI | 2-4x faster | Easy |
| Use GPU (CUDA) | 5-10x faster | Medium |
| Multi-threading | 1.5-2x faster | Medium |
| Batch processing (multiple frames at once) | 2-3x faster | Medium |
| Use smaller YOLO model (nano vs large) | 3-5x faster | Easy |
| Process ROI only (crop to desk area) | 2x faster | Medium |

```python
# Quick win: Resize before processing
frame_small = cv2.resize(frame, (640, 480))  # Instead of full 1920x1080
results = model(frame_small)                   # 4x fewer pixels to process
```

---

## Mini Project: Real-Time YOLO on Webcam with FPS Counter

**Goal:** Read webcam, apply YOLO on each frame, display results with real-time FPS measurement.

```python
import cv2
from ultralytics import YOLO
import time

model = YOLO('yolov8n.pt')
cap = cv2.VideoCapture(0)

# FPS tracking
frame_count = 0
start_time = time.time()
fps_display = 0

# Detection tracking
detection_counts = {}

print("Real-time YOLO Detection — Press 'q' to quit")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1

    # Measure processing time for this frame
    frame_start = time.time()

    # Run YOLO
    results = model(frame, verbose=False, conf=0.4)

    frame_time = time.time() - frame_start

    # Count detections
    for result in results:
        for box in result.boxes:
            name = result.names[int(box.cls)]
            detection_counts[name] = detection_counts.get(name, 0) + 1

    # Draw detections
    annotated = results[0].plot()

    # Calculate FPS (update every 10 frames for stability)
    if frame_count % 10 == 0:
        elapsed = time.time() - start_time
        fps_display = frame_count / elapsed

    # Display stats
    cv2.putText(annotated, f'FPS: {fps_display:.1f}', (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(annotated, f'Frame time: {frame_time*1000:.0f}ms', (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(annotated, f'Total frames: {frame_count}', (10, 85),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    # Show detection counts
    y = 115
    for name, count in sorted(detection_counts.items(), key=lambda x: -x[1])[:5]:
        cv2.putText(annotated, f'{name}: {count}', (10, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        y += 20

    cv2.imshow('Real-Time YOLO', annotated)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

# Summary
elapsed = time.time() - start_time
print(f"\nSession Summary:")
print(f"  Duration: {elapsed:.1f} seconds")
print(f"  Frames processed: {frame_count}")
print(f"  Average FPS: {frame_count/elapsed:.1f}")
print(f"\nDetection counts:")
for name, count in sorted(detection_counts.items(), key=lambda x: -x[1]):
    print(f"  {name}: {count}")
```

### What You Will Learn:
- Real-time video processing with AI models
- Measuring and displaying FPS
- Understanding processing bottlenecks
- How fast YOLO actually runs on your hardware
- The complete frame-to-detection pipeline ExamGuard uses

---

## Key Takeaway

Video processing is the bridge between AI models and real-world deployment. Your models might work great on single images, but ExamGuard needs them to work on continuous video streams at 30+ FPS across multiple cameras. The techniques in this lesson — frame skipping, multi-threading, buffering, and performance measurement — are what make the difference between a demo and a production system.
