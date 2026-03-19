# Real-Time Inference — Making AI Fast Enough for Live Video

## What Is This?

You have trained amazing models. They can detect objects, track gaze, spot anomalies, and make decisions. In a Jupyter notebook, they work great.

But here is the problem:

```
Your model takes 500ms (0.5 seconds) to process ONE frame.
Camera sends 30 frames per second.
30 frames x 500ms = 15,000ms = 15 seconds needed per second of video.

You are 15x TOO SLOW. You can never catch up.
```

**Real-time inference** means making your models fast enough to process video AS IT HAPPENS — at 30 frames per second.

---

## The Speed Requirement

### The Math

```
Camera sends: 30 frames per second (fps)
Time available per frame: 1000ms / 30 = 33.3 milliseconds

Your ENTIRE pipeline must complete in under 33ms per frame:
- Read frame from camera:        ~2ms
- YOLO object detection:         ~8ms
- CNN behavior classification:   ~5ms
- LSTM sequence analysis:        ~3ms
- Autoencoder anomaly check:     ~4ms
- RL decision making:            ~1ms
- Send alert if needed:          ~1ms
                          Total: ~24ms ← Under 33ms! We are good!
```

If ANY step is too slow, the whole pipeline falls behind.

### What Happens When Too Slow?

```
Real time: Frame 1, 2, 3, 4, 5, 6, 7, 8, 9, 10...

Fast system:
  Processing: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10   (keeps up)
  Alert: "Cheating at frame 5!" (detected in real-time)

Slow system:
  Processing: 1, ...2, ...3, ...4 (still processing 4 when frame 10 happens)
  Alert: "Cheating at frame 5!" (detected 6 frames LATE)
  By then, cheating already happened. Evidence may be gone.
```

---

## WHY ExamGuard Needs This

### The Scale Problem

One camera is manageable. But ExamGuard needs to handle MANY:

```
Small exam:   4 cameras × 30 fps = 120 frames/second
Medium exam: 20 cameras × 30 fps = 600 frames/second
Large exam: 200 cameras × 30 fps = 6,000 frames/second

6,000 frames per second. Each needs full AI pipeline.
At 33ms per frame, you need: 6000 × 33ms = 198,000ms of compute per second.
That is 198 seconds of work needed every 1 second.
You need ~200 parallel processing units (GPU cores handle this).
```

### Real-Time Matters

An invigilator watching live needs INSTANT alerts:
- Student pulls out phone → Alert should appear within 1-2 seconds
- Student starts copying → Flag immediately
- If alert comes 30 seconds late, the student already put the phone away

---

## Optimization Techniques

### Technique 1: Model Quantization

**What:** Convert model from 32-bit numbers to 8-bit numbers.
**Result:** 4x smaller, 2-4x faster, tiny accuracy loss.

```
Regular model (FP32):
  Weight: 0.123456789012345 (32 bits per number)
  Size: 200 MB
  Speed: 15ms per frame

Quantized model (INT8):
  Weight: 0.12 (8 bits per number)
  Size: 50 MB
  Speed: 5ms per frame

Accuracy drop: maybe 0.5% — almost nothing!
```

```python
import torch

# Load your trained model
model = torch.load("examguard_model.pth")

# Quantize to INT8
quantized_model = torch.quantization.quantize_dynamic(
    model,
    {torch.nn.Linear, torch.nn.Conv2d},
    dtype=torch.qint8
)

# Compare sizes
import os
torch.save(model, "original.pth")
torch.save(quantized_model, "quantized.pth")
print(f"Original: {os.path.getsize('original.pth') / 1e6:.1f} MB")
print(f"Quantized: {os.path.getsize('quantized.pth') / 1e6:.1f} MB")
```

### Technique 2: ONNX Export

**What:** Convert PyTorch model to a universal format that runs faster.
**Result:** 1.5-3x speedup, works on any platform.

```python
import torch

model = torch.load("examguard_model.pth")
model.eval()

# Create a dummy input (same shape as real input)
dummy_input = torch.randn(1, 3, 224, 224)

# Export to ONNX
torch.onnx.export(
    model,
    dummy_input,
    "examguard_model.onnx",
    input_names=["image"],
    output_names=["prediction"],
    dynamic_axes={"image": {0: "batch_size"}}
)

# Now run with ONNX Runtime (faster than PyTorch)
import onnxruntime as ort

session = ort.InferenceSession("examguard_model.onnx")
result = session.run(None, {"image": dummy_input.numpy()})
```

### Technique 3: TensorRT (NVIDIA GPU Optimization)

**What:** NVIDIA's tool that optimizes models specifically for their GPUs.
**Result:** 2-5x speedup on NVIDIA GPUs.

```python
# Convert ONNX to TensorRT
# This is usually done via command line
# trtexec --onnx=examguard_model.onnx --saveEngine=examguard_model.trt

# Or in Python
import tensorrt as trt

# TensorRT fuses layers, optimizes memory, uses GPU-specific tricks
# Result: The fastest possible inference on NVIDIA hardware
```

### Technique 4: Batch Processing

**What:** Process multiple frames at once instead of one at a time.
**Result:** GPU utilization goes from 30% to 90%.

```python
# SLOW: One frame at a time
for frame in frames:
    result = model(frame)  # GPU does tiny job, wastes capacity

# FAST: Batch of 8 frames at once
batch = torch.stack(frames[:8])
results = model(batch)  # GPU does big job, fully utilized
```

```
Single frame:  8ms per frame  (GPU barely working)
Batch of 8:   20ms for all 8  = 2.5ms per frame (GPU fully utilized)
Speedup: 3.2x!
```

### Technique 5: Smart Frame Skipping

**What:** You do NOT need to process EVERY frame. Skip some.

```python
# 30 fps camera, but we process every 3rd frame
# Result: 10 fps processing (still catches cheating, 3x less work)

frame_count = 0
while True:
    frame = camera.read()
    frame_count += 1

    if frame_count % 3 != 0:
        continue  # Skip this frame

    # Process only every 3rd frame
    result = model(frame)
```

**Why this works:**
- Cheating is not instantaneous — it takes several seconds
- 10 fps is still 10 chances per second to catch it
- Reduces computation by 67%

### Technique 6: Pipeline Parallelism

**What:** While one model processes frame N, another model processes frame N-1.

```
Without pipeline:
  Frame 1: [YOLO 8ms][CNN 5ms][LSTM 3ms] = 16ms total, then start frame 2

With pipeline:
  Frame 1: [YOLO 8ms][CNN 5ms][LSTM 3ms]
  Frame 2:           [YOLO 8ms][CNN 5ms][LSTM 3ms]
  Frame 3:                     [YOLO 8ms][CNN 5ms][LSTM 3ms]

  Each frame still takes 16ms, but a new result comes every 8ms!
  Effective throughput: 125 fps instead of 62 fps
```

```python
import threading
from queue import Queue

# Create queues between pipeline stages
yolo_queue = Queue(maxsize=10)
cnn_queue = Queue(maxsize=10)

def yolo_worker():
    while True:
        frame = camera_queue.get()
        detections = yolo_model(frame)
        yolo_queue.put((frame, detections))

def cnn_worker():
    while True:
        frame, detections = yolo_queue.get()
        behaviors = cnn_model(frame, detections)
        cnn_queue.put((frame, detections, behaviors))

def lstm_worker():
    while True:
        frame, detections, behaviors = cnn_queue.get()
        sequence_result = lstm_model(behaviors)
        process_alert(sequence_result)

# Run all workers in parallel
threading.Thread(target=yolo_worker, daemon=True).start()
threading.Thread(target=cnn_worker, daemon=True).start()
threading.Thread(target=lstm_worker, daemon=True).start()
```

---

## ExamGuard Full Pipeline Timing

### Target: Process One Camera at 30 FPS

```
Step                    | Time    | Technique
─────────────────────────────────────────────
Read frame              |  2ms    | OpenCV optimized
Resize/preprocess       |  1ms    | GPU preprocessing
YOLO detection          |  8ms    | YOLOv8-small + TensorRT
Crop detected persons   |  1ms    | GPU crop
CNN behavior classify   |  5ms    | ResNet18 quantized
LSTM sequence check     |  3ms    | Every 10th frame only
Autoencoder anomaly     |  4ms    | Runs on separate GPU stream
RL decision             |  1ms    | Tiny model, CPU is fine
Send alert              |  1ms    | Async, non-blocking
─────────────────────────────────────────────
TOTAL                   | 26ms    | Under 33ms budget!
```

### Scaling to Multiple Cameras

```
1 GPU (NVIDIA RTX 3080):
  - Can handle ~4 cameras at full pipeline
  - Or ~12 cameras with frame skipping (every 3rd frame)

1 GPU (NVIDIA A100 — data center):
  - Can handle ~20 cameras at full pipeline
  - Or ~60 cameras with frame skipping

Large deployment (200 cameras):
  - Need 8-10 GPUs
  - Or use edge computing (process at camera, send only suspicious frames)
```

---

## What You Need to Learn

### Benchmarking Basics
```python
import time

def benchmark_model(model, input_data, num_runs=100):
    """Measure how fast a model runs."""
    # Warm up (first run is always slow)
    for _ in range(10):
        model(input_data)

    # Measure
    start = time.time()
    for _ in range(num_runs):
        model(input_data)
    end = time.time()

    avg_time = (end - start) / num_runs * 1000  # Convert to ms
    fps = 1000 / avg_time

    print(f"Average inference time: {avg_time:.1f}ms")
    print(f"Frames per second: {fps:.1f}")
    print(f"Can handle {fps/30:.0f} cameras at 30fps")

    return avg_time
```

### CPU vs GPU Comparison
```python
import torch
import torchvision.models as models

model = models.resnet18(pretrained=True)
model.eval()
input_tensor = torch.randn(1, 3, 224, 224)

# CPU benchmark
model_cpu = model.cpu()
input_cpu = input_tensor.cpu()
cpu_time = benchmark_model(model_cpu, input_cpu)

# GPU benchmark
if torch.cuda.is_available():
    model_gpu = model.cuda()
    input_gpu = input_tensor.cuda()
    gpu_time = benchmark_model(model_gpu, input_gpu)

    print(f"\nGPU is {cpu_time/gpu_time:.1f}x faster than CPU")
```

---

## Mini Project: Benchmark Your YOLO Model

### Goal
Measure your YOLO model's speed with and without GPU. See if it meets the 33ms target.

### Steps

**Step 1: Load YOLO**
```python
from ultralytics import YOLO
import cv2
import time

model = YOLO("yolov8n.pt")  # nano version (fastest)
```

**Step 2: Benchmark on CPU**
```python
# Use a test image
image = cv2.imread("test_image.jpg")

# Warm up
for _ in range(5):
    model(image, device='cpu', verbose=False)

# Measure
times = []
for _ in range(50):
    start = time.time()
    results = model(image, device='cpu', verbose=False)
    end = time.time()
    times.append((end - start) * 1000)

print(f"CPU - Average: {sum(times)/len(times):.1f}ms")
print(f"CPU - FPS: {1000/(sum(times)/len(times)):.1f}")
```

**Step 3: Benchmark on GPU**
```python
# Warm up
for _ in range(5):
    model(image, device=0, verbose=False)  # device=0 means first GPU

# Measure
times = []
for _ in range(50):
    start = time.time()
    results = model(image, device=0, verbose=False)
    end = time.time()
    times.append((end - start) * 1000)

print(f"GPU - Average: {sum(times)/len(times):.1f}ms")
print(f"GPU - FPS: {1000/(sum(times)/len(times)):.1f}")
```

**Step 4: Compare Different YOLO Sizes**
```python
models_to_test = {
    "YOLOv8-nano":   YOLO("yolov8n.pt"),   # Fastest, least accurate
    "YOLOv8-small":  YOLO("yolov8s.pt"),   # Good balance
    "YOLOv8-medium": YOLO("yolov8m.pt"),   # More accurate, slower
    "YOLOv8-large":  YOLO("yolov8l.pt"),   # Most accurate, slowest
}

for name, model in models_to_test.items():
    times = []
    for _ in range(30):
        start = time.time()
        model(image, device=0, verbose=False)
        end = time.time()
        times.append((end - start) * 1000)

    avg = sum(times) / len(times)
    fps = 1000 / avg
    cameras = fps / 30

    print(f"{name:20s} | {avg:6.1f}ms | {fps:5.1f} fps | {cameras:.0f} cameras")
```

**Expected Output (approximate, depends on GPU):**
```
Model                |   Time  |   FPS   | Cameras at 30fps
YOLOv8-nano          |   5.2ms | 192 fps |  6 cameras
YOLOv8-small         |   8.1ms | 123 fps |  4 cameras
YOLOv8-medium        |  15.3ms |  65 fps |  2 cameras
YOLOv8-large         |  25.7ms |  39 fps |  1 camera
```

**Step 5: Check if It Meets the 33ms Budget**
```python
yolo_time = 8.1   # From benchmark above
cnn_time = 5.0    # Estimate
lstm_time = 3.0   # Estimate
other_time = 5.0  # Preprocessing, postprocessing

total = yolo_time + cnn_time + lstm_time + other_time
budget = 33.3

print(f"Total pipeline time: {total:.1f}ms")
print(f"Budget: {budget:.1f}ms")
if total < budget:
    print(f"PASS! {budget - total:.1f}ms to spare")
else:
    print(f"FAIL! {total - budget:.1f}ms over budget. Need optimization.")
```

---

## Key Takeaways

1. **33ms per frame is the target** — anything slower and you fall behind real-time
2. **Quantization gives easy 2-4x speedup** — tiny accuracy loss, huge speed gain
3. **TensorRT is the gold standard** — best performance on NVIDIA GPUs
4. **Frame skipping is free speed** — you do not need every frame to catch cheating
5. **Pipeline parallelism multiplies throughput** — overlap different processing stages
6. **Always benchmark before deploying** — measure, optimize, measure again
7. **Start with YOLOv8-nano or small** — fastest variants, good enough for ExamGuard
