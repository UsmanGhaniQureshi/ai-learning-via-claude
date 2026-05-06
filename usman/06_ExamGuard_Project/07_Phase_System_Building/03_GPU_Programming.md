# GPU Programming — Making AI 100x Faster

## What Is This?

Your computer has two main processors:

**CPU (Central Processing Unit)** — The "brain." Does one thing at a time, but very smartly. Good at complex tasks like running your operating system, web browser, Word document.

**GPU (Graphics Processing Unit)** — Originally for video games. Does THOUSANDS of simple things at the same time. Good at math on lots of numbers simultaneously.

Deep learning is basically doing the SAME math on MILLIONS of numbers. That is EXACTLY what GPUs are designed for.

```
CPU: 1 chef making 1 dish at a time (but a really good chef)
     Makes 8 dishes per hour (8 cores)

GPU: 5,000 simple cooks, each makes 1 dish at a time
     Makes 5,000 dishes per hour (5,000 CUDA cores)

Deep learning needs 5,000 simple dishes, not 8 complex ones.
GPU wins by a MASSIVE margin.
```

---

## WHY ExamGuard Needs This

### Speed Comparison

```
Task: Run YOLO on one image (detect objects)

CPU (Intel i7):    ~150ms per image    =  ~7 fps
GPU (RTX 3060):    ~8ms per image      = ~125 fps
GPU (RTX 4090):    ~3ms per image      = ~333 fps

CPU: Can barely handle 1 camera at 7 fps (choppy, delayed)
GPU: Can handle 4+ cameras at 30 fps (smooth, real-time)
```

### ExamGuard is IMPOSSIBLE Without GPU

```
Full pipeline per frame: ~25ms on GPU, ~800ms on CPU

On CPU:  1 camera at 1.2 fps (2.5 seconds behind real-time) — USELESS
On GPU:  4 cameras at 30 fps (real-time) — PERFECT
```

### Scaling

```
Small exam (1 hall, 4 cameras):
  1x NVIDIA RTX 3080 = enough

Medium exam (5 halls, 20 cameras):
  2x NVIDIA RTX 4080 = enough

Large exam (50 halls, 200 cameras):
  Edge computing + 4x NVIDIA A100 server GPUs
  Or: 10x RTX 4090 consumer GPUs
```

---

## How GPU Programming Works

### CUDA — NVIDIA's GPU Programming Platform

CUDA (Compute Unified Device Architecture) lets you run code on NVIDIA GPUs.

You do NOT need to write CUDA code directly. PyTorch does it for you. But you need to understand the basics.

```
Your Python code
    ↓
PyTorch (.to('cuda'))
    ↓
CUDA translates to GPU instructions
    ↓
GPU executes thousands of operations in parallel
    ↓
Results sent back to CPU
```

### The Key Concept: Moving Data to GPU

```python
import torch

# Data on CPU (default)
tensor_cpu = torch.randn(1000, 1000)
print(tensor_cpu.device)  # cpu

# Move data to GPU
tensor_gpu = tensor_cpu.to('cuda')
print(tensor_gpu.device)  # cuda:0

# Or create directly on GPU
tensor_gpu = torch.randn(1000, 1000, device='cuda')
```

### IMPORTANT: Model AND Data Must Be on Same Device

```python
model = MyModel()

# WRONG: Model on CPU, data on GPU
model = model.cpu()
data = data.cuda()
output = model(data)  # ERROR! Device mismatch!

# CORRECT: Both on GPU
model = model.cuda()
data = data.cuda()
output = model(data)  # Works!

# Or use .to() for flexibility
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = model.to(device)
data = data.to(device)
output = model(data)
```

---

## Setting Up GPU for Deep Learning

### Step 1: Check Your GPU

```python
import torch

# Do you have a GPU?
print(f"CUDA available: {torch.cuda.is_available()}")

if torch.cuda.is_available():
    print(f"GPU name: {torch.cuda.get_device_name(0)}")
    print(f"GPU memory: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB")
    print(f"CUDA version: {torch.version.cuda}")
    print(f"Number of GPUs: {torch.cuda.device_count()}")
else:
    print("No GPU found. Install NVIDIA drivers and CUDA toolkit.")
```

### Step 2: Install the Right Software

```bash
# 1. NVIDIA GPU Driver (from nvidia.com — match your GPU model)
# 2. CUDA Toolkit (from developer.nvidia.com/cuda-downloads)
# 3. cuDNN (from developer.nvidia.com/cudnn — for deep learning)
# 4. PyTorch with CUDA support:

pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
# Replace cu121 with your CUDA version (cu118, cu121, etc.)
```

### Step 3: Verify Installation

```python
import torch

# This should print True
print(torch.cuda.is_available())

# Quick GPU test
a = torch.randn(1000, 1000, device='cuda')
b = torch.randn(1000, 1000, device='cuda')
c = torch.matmul(a, b)  # Matrix multiplication on GPU
print(f"Result shape: {c.shape}, device: {c.device}")
print("GPU is working!")
```

---

## Using GPU in Your ExamGuard Code

### Training a Model on GPU

```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

# Pick device
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {device}")

# Create model and move to GPU
model = YourModel()
model = model.to(device)

# Loss and optimizer
criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

# Training loop
for epoch in range(10):
    for images, labels in train_loader:
        # Move data to GPU
        images = images.to(device)
        labels = labels.to(device)

        # Forward pass (runs on GPU)
        outputs = model(images)
        loss = criterion(outputs, labels)

        # Backward pass (runs on GPU)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    print(f"Epoch {epoch}: Loss = {loss.item():.4f}")
```

### Running YOLO with GPU

```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")

# Run on GPU (YOLO handles it automatically)
results = model("test_image.jpg", device=0)  # device=0 means first GPU

# Or for live camera:
results = model(frame, device=0, verbose=False)
```

### Memory Management

```python
# Check GPU memory usage
print(f"Allocated: {torch.cuda.memory_allocated(0) / 1e9:.2f} GB")
print(f"Cached: {torch.cuda.memory_reserved(0) / 1e9:.2f} GB")

# Clear unused memory
torch.cuda.empty_cache()

# If you run out of memory, try:
# 1. Reduce batch size
# 2. Use smaller model
# 3. Use mixed precision (FP16)
# 4. Use gradient checkpointing
```

### Mixed Precision Training (Faster + Less Memory)

```python
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()

for images, labels in train_loader:
    images = images.to(device)
    labels = labels.to(device)

    optimizer.zero_grad()

    # Mixed precision: use FP16 where possible (2x faster, half memory)
    with autocast():
        outputs = model(images)
        loss = criterion(outputs, labels)

    # Scale gradients to prevent underflow in FP16
    scaler.scale(loss).backward()
    scaler.step(optimizer)
    scaler.update()
```

---

## GPU Memory: The Main Constraint

### How Much Memory Do You Need?

```
Model                   | GPU Memory Needed
──────────────────────────────────────────
YOLOv8-nano            | ~0.5 GB
YOLOv8-small           | ~1.0 GB
YOLOv8-medium          | ~2.0 GB
ResNet18               | ~0.5 GB
ResNet50               | ~1.5 GB
LSTM (sequence model)  | ~0.3 GB
Autoencoder            | ~0.5 GB

Full ExamGuard pipeline| ~3-5 GB total

Common GPUs:
RTX 3060:  12 GB → Plenty for ExamGuard
RTX 3080:  10 GB → Good
RTX 4090:  24 GB → Overkill (but fast!)
A100:      40/80 GB → Server GPU, massive
```

### What If You Run Out of Memory?

```
Error: "CUDA out of memory"

Solutions:
1. Reduce batch size (batch_size=32 → batch_size=8)
2. Use smaller model (yolov8m → yolov8n)
3. Reduce input resolution (640x640 → 320x320)
4. Use mixed precision (FP16 instead of FP32)
5. Free memory: torch.cuda.empty_cache()
6. Use gradient checkpointing (trades speed for memory)
```

---

## Multiple GPUs

### If You Have Multiple GPUs

```python
# Check number of GPUs
print(f"GPUs available: {torch.cuda.device_count()}")
for i in range(torch.cuda.device_count()):
    print(f"  GPU {i}: {torch.cuda.get_device_name(i)}")

# Simple approach: Different models on different GPUs
yolo_model = YOLO("yolov8n.pt").to('cuda:0')   # GPU 0
cnn_model = CNN().to('cuda:1')                   # GPU 1

# Or: DataParallel (same model on multiple GPUs, bigger batches)
model = nn.DataParallel(model)  # Automatically splits batch across GPUs
```

---

## Mini Project: CPU vs GPU Speed Comparison

### Goal
Measure how much faster GPU is compared to CPU for a real model.

```python
import torch
import torchvision.models as models
import time

# Load a pre-trained model
model = models.resnet18(pretrained=True)
model.eval()

# Create fake input (batch of 32 images, 3 channels, 224x224)
input_data = torch.randn(32, 3, 224, 224)

# ─── CPU Benchmark ───
model_cpu = model.cpu()
input_cpu = input_data.cpu()

# Warm up
for _ in range(5):
    with torch.no_grad():
        model_cpu(input_cpu)

# Measure
start = time.time()
for _ in range(100):
    with torch.no_grad():
        output = model_cpu(input_cpu)
cpu_time = (time.time() - start) / 100 * 1000  # ms per batch
print(f"CPU: {cpu_time:.1f}ms per batch of 32")
print(f"CPU: {cpu_time/32:.1f}ms per image")
print(f"CPU: {32000/cpu_time:.0f} images/second")

# ─── GPU Benchmark ───
if torch.cuda.is_available():
    model_gpu = model.cuda()
    input_gpu = input_data.cuda()

    # Warm up
    for _ in range(10):
        with torch.no_grad():
            model_gpu(input_gpu)
    torch.cuda.synchronize()

    # Measure
    start = time.time()
    for _ in range(100):
        with torch.no_grad():
            output = model_gpu(input_gpu)
    torch.cuda.synchronize()
    gpu_time = (time.time() - start) / 100 * 1000

    print(f"\nGPU: {gpu_time:.1f}ms per batch of 32")
    print(f"GPU: {gpu_time/32:.1f}ms per image")
    print(f"GPU: {32000/gpu_time:.0f} images/second")

    print(f"\nGPU is {cpu_time/gpu_time:.1f}x FASTER than CPU!")
else:
    print("\nNo GPU available. Install CUDA to compare.")
```

**Expected Results (approximate):**
```
CPU: 450.0ms per batch of 32
CPU: 14.1ms per image
CPU: 71 images/second

GPU: 12.0ms per batch of 32
GPU: 0.4ms per image
GPU: 2667 images/second

GPU is 37.5x FASTER than CPU!
```

---

## Key Takeaways

1. **GPU is 10-100x faster than CPU** for deep learning tasks
2. **ExamGuard is impossible without GPU** — cannot process real-time video on CPU
3. **Move both model AND data to GPU** — they must be on the same device
4. **GPU memory is the main constraint** — monitor usage, reduce if needed
5. **Use mixed precision (FP16)** for 2x speed and half memory usage
6. **Start with 1 GPU** — it is enough for development and small deployments
7. **Scale with multiple GPUs or edge computing** for large deployments
