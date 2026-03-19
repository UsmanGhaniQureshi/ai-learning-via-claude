# Performance Optimization — Making It Fast Enough for 200 Cameras

## What Is This?

Your system works. It detects cheating, shows alerts, saves evidence. But it is too SLOW.

```
Current performance:
  1 camera: 25 fps ← Almost real-time (30 fps target)
  4 cameras: 8 fps ← Falling behind
  20 cameras: 1.5 fps ← Basically useless
  200 cameras: Not even possible on current setup
```

**Performance optimization** means finding the bottlenecks and fixing them until your system runs fast enough for real deployment.

---

## WHY Speed Matters

```
Real-time (30 fps):
  Student pulls out phone → AI detects in 0.5 seconds → Alert sent
  Invigilator walks over → Phone is still out → CAUGHT

2 seconds behind:
  Student pulls out phone → AI detects after 2 seconds → Alert sent
  Invigilator walks over → Phone already back in pocket → No evidence

10 seconds behind:
  Student copies answers for 10 seconds → AI still processing old frames
  By the time alert arrives → Cheating is already done
```

**Every millisecond matters.** The target is 33ms per frame (1000ms / 30fps = 33ms).

---

## Step 1: Find the Bottleneck

Before optimizing anything, MEASURE where the time goes.

```python
import time

def timed_pipeline(frame):
    """Measure time for each step in the pipeline."""

    # Step 1: Preprocessing
    start = time.time()
    processed = preprocess(frame)
    preprocess_time = (time.time() - start) * 1000

    # Step 2: YOLO detection
    start = time.time()
    detections = yolo_model(processed)
    yolo_time = (time.time() - start) * 1000

    # Step 3: Crop detected regions
    start = time.time()
    crops = crop_detections(frame, detections)
    crop_time = (time.time() - start) * 1000

    # Step 4: CNN classification
    start = time.time()
    behaviors = cnn_model(crops)
    cnn_time = (time.time() - start) * 1000

    # Step 5: LSTM sequence analysis
    start = time.time()
    sequence_result = lstm_model(behaviors)
    lstm_time = (time.time() - start) * 1000

    # Step 6: Autoencoder anomaly check
    start = time.time()
    anomaly_score = autoencoder(processed)
    ae_time = (time.time() - start) * 1000

    # Step 7: Decision making
    start = time.time()
    decision = rl_agent(sequence_result, anomaly_score)
    decision_time = (time.time() - start) * 1000

    total = preprocess_time + yolo_time + crop_time + cnn_time + lstm_time + ae_time + decision_time

    print(f"Pipeline timing breakdown:")
    print(f"  Preprocess:   {preprocess_time:6.1f}ms")
    print(f"  YOLO:         {yolo_time:6.1f}ms  {'← BOTTLENECK' if yolo_time > 10 else ''}")
    print(f"  Crop:         {crop_time:6.1f}ms")
    print(f"  CNN:          {cnn_time:6.1f}ms  {'← BOTTLENECK' if cnn_time > 10 else ''}")
    print(f"  LSTM:         {lstm_time:6.1f}ms")
    print(f"  Autoencoder:  {ae_time:6.1f}ms")
    print(f"  Decision:     {decision_time:6.1f}ms")
    print(f"  TOTAL:        {total:6.1f}ms  {'OVER BUDGET' if total > 33 else 'OK'}")

    return decision

# Run on 100 frames to get average
for _ in range(100):
    frame = camera.read()
    timed_pipeline(frame)
```

**Example Output:**
```
Pipeline timing breakdown:
  Preprocess:     1.2ms
  YOLO:          12.5ms  ← BOTTLENECK
  Crop:           0.8ms
  CNN:            8.3ms  ← BOTTLENECK
  LSTM:           3.1ms
  Autoencoder:    5.2ms
  Decision:       0.4ms
  TOTAL:         31.5ms  OK (barely under 33ms budget!)
```

Now you know: YOLO and CNN are the slowest parts. Optimize THOSE first.

---

## Optimization Techniques

### Technique 1: Model Quantization

Convert 32-bit floating point to 8-bit integer. 4x smaller, 2-4x faster.

```python
# PyTorch quantization
import torch

model = torch.load("cnn_model.pth")

# Dynamic quantization (easiest)
quantized = torch.quantization.quantize_dynamic(
    model,
    {torch.nn.Linear, torch.nn.Conv2d},
    dtype=torch.qint8
)

# Compare speed
original_time = benchmark(model)      # e.g., 8.3ms
quantized_time = benchmark(quantized)  # e.g., 3.1ms
print(f"Speedup: {original_time/quantized_time:.1f}x")  # ~2.7x
```

### Technique 2: Use Smaller Model Variants

```python
# Instead of ResNet50 (25.6M params), use ResNet18 (11.7M params)
# Or use MobileNet (3.4M params) — designed to be fast!

import torchvision.models as models

# Slow but accurate
model_heavy = models.resnet50(pretrained=True)    # 25.6M params

# Fast and still good
model_light = models.mobilenet_v3_small(pretrained=True)  # 2.5M params

# Compare
heavy_time = benchmark(model_heavy)   # ~15ms
light_time = benchmark(model_light)   # ~3ms
# 5x faster with MobileNet!
```

### Technique 3: Smart Frame Skipping

You do NOT need to analyze every frame.

```python
frame_count = 0
SKIP_RATE = 3  # Process every 3rd frame

while True:
    frame = camera.read()
    frame_count += 1

    # Always display (smooth video)
    display(frame)

    # But only analyze every 3rd frame
    if frame_count % SKIP_RATE != 0:
        continue

    # Full AI analysis
    result = ai_pipeline(frame)

# Result: 10 fps analysis instead of 30 fps
# Still catches cheating (cheating lasts seconds, not milliseconds)
# 3x less computation!
```

### Technique 4: Selective Processing

Not every camera needs full analysis all the time.

```python
def smart_processing(cameras, resources):
    """
    Allocate more processing to suspicious cameras.
    """
    for cam in cameras:
        frame = cam.read()

        # Level 1: Quick check (ALL cameras, every 3rd frame)
        # Just YOLO — are there suspicious objects?
        quick_result = yolo_model(frame)

        if has_suspicious_objects(quick_result):
            # Level 2: Deep analysis (only suspicious cameras)
            # CNN + LSTM + Autoencoder + RL
            deep_result = full_pipeline(frame)

            if deep_result.confidence > 0.7:
                # Level 3: Maximum attention
                # Process EVERY frame from this camera
                cam.set_priority("HIGH")
                cam.set_skip_rate(1)  # No skipping
        else:
            # Normal camera — skip more frames
            cam.set_priority("LOW")
            cam.set_skip_rate(5)  # Process every 5th frame
```

### Technique 5: Batch Processing

Process multiple frames at once for better GPU utilization.

```python
# Instead of processing 1 frame at a time:
for cam in cameras:
    frame = cam.get_frame()
    result = model(frame)  # GPU processes 1 image (underutilized)

# Process a batch of frames from ALL cameras:
frames = [cam.get_frame() for cam in cameras]
batch = torch.stack(frames)
results = model(batch)  # GPU processes 4-8 images at once (fully utilized)
# Each frame takes LESS time per frame because GPU is efficient with batches
```

### Technique 6: ONNX Runtime / TensorRT

Convert model to optimized format for faster inference.

```python
# Export to ONNX
import torch

model = torch.load("cnn_model.pth")
dummy = torch.randn(1, 3, 224, 224)
torch.onnx.export(model, dummy, "model.onnx")

# Run with ONNX Runtime (1.5-3x faster than PyTorch)
import onnxruntime as ort

session = ort.InferenceSession("model.onnx")
result = session.run(None, {"input": frame_numpy})
```

### Technique 7: Pipeline Parallelism

Overlap processing stages.

```python
import threading
from queue import Queue

# Three stages running in parallel
stage1_queue = Queue()
stage2_queue = Queue()
stage3_queue = Queue()

def stage1_yolo():
    """YOLO detection runs on GPU stream 1."""
    while True:
        frame = stage1_queue.get()
        detections = yolo_model(frame)
        stage2_queue.put((frame, detections))

def stage2_cnn():
    """CNN classification runs on GPU stream 2."""
    while True:
        frame, detections = stage2_queue.get()
        behaviors = cnn_model(frame, detections)
        stage3_queue.put((frame, detections, behaviors))

def stage3_decision():
    """Decision making runs on CPU."""
    while True:
        frame, detections, behaviors = stage3_queue.get()
        decision = make_decision(behaviors)
        if decision.alert:
            send_alert(decision)

# Start parallel workers
threading.Thread(target=stage1_yolo, daemon=True).start()
threading.Thread(target=stage2_cnn, daemon=True).start()
threading.Thread(target=stage3_decision, daemon=True).start()

# Feed frames continuously
while True:
    frame = camera.read()
    stage1_queue.put(frame)
```

---

## Optimization Workflow

```
Step 1: MEASURE current performance
  → "Total pipeline: 45ms per frame. Need 33ms."

Step 2: IDENTIFY the bottleneck
  → "YOLO takes 15ms, CNN takes 12ms. These are the slowest."

Step 3: OPTIMIZE the bottleneck
  → Try quantization on CNN: 12ms → 5ms. Saved 7ms!
  → Try smaller YOLO: 15ms → 8ms. Saved 7ms!

Step 4: MEASURE again
  → "Total pipeline: 31ms. Under budget!"

Step 5: REPEAT if needed
  → Add more cameras, measure again, optimize again
```

---

## ExamGuard Performance Targets

```
Metric                          Target          How to Verify
────────────────────────────────────────────────────────────────
Frame processing time           < 33ms          Benchmark tool
Frames per second               > 30 fps        FPS counter
Alert latency                   < 3 seconds     Stopwatch test
Camera connection time          < 5 seconds     Startup test
Recovery from crash             < 10 seconds    Kill and time restart
Memory usage growth over time   < 1% per hour   Monitor for 3 hours
GPU utilization                 50-90%          nvidia-smi
CPU utilization                 < 80%           System monitor
```

---

## Key Takeaways

1. **Measure before optimizing** — find the bottleneck first, do not guess
2. **33ms per frame is the target** — that is 30 fps, real-time processing
3. **Frame skipping is the easiest win** — 3x less work with minimal impact
4. **Quantization is free speed** — 2-4x faster with < 1% accuracy loss
5. **Batch processing uses GPU efficiently** — process multiple frames at once
6. **Selective processing is smart** — spend more resources on suspicious cameras
7. **Optimize iteratively** — measure, optimize, measure, repeat
