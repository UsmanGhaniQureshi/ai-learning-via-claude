# NumPy - Numerical Python

## What is NumPy?

NumPy (Numerical Python) is a Python library for working with **arrays of numbers**. Think of it as a super-powered calculator that can handle millions of numbers at once.

In simple terms: NumPy lets you do math on big collections of numbers very fast.

```python
import numpy as np

# A regular Python list (slow)
numbers = [1, 2, 3, 4, 5]

# A NumPy array (fast!)
numbers = np.array([1, 2, 3, 4, 5])
```

---

## Why NumPy Matters for ExamGuard

### Images ARE NumPy Arrays

This is the key insight: **every image is just a grid of numbers**, and NumPy is how Python handles grids of numbers.

```
A camera frame (1920 x 1080 pixels, color) is stored as:

NumPy array with shape: (1080, 1920, 3)
                          |      |     |
                          |      |     └── 3 color channels (Red, Green, Blue)
                          |      └──────── 1920 pixels wide
                          └─────────────── 1080 pixels tall

Total numbers: 1080 x 1920 x 3 = 6,220,800 numbers PER FRAME
```

Every pixel has 3 values (Red, Green, Blue), each between 0 and 255.

**A single camera at 30 fps generates 186 million numbers per second.** NumPy handles this efficiently.

### Where NumPy is used in ExamGuard:

| ExamGuard Task | NumPy's Role |
|---|---|
| Reading camera frames | Each frame = NumPy array |
| Resizing images | Reshape arrays for model input |
| Normalizing pixel values | Divide all values by 255 (scale 0-1) |
| Model input/output | All model predictions are NumPy arrays |
| Calculating distances | Person Re-ID vector comparisons |
| Statistics | Mean confidence, detection counts |
| Batch processing | Stack multiple frames into one array |

---

## What to Learn

### 1. Creating Arrays

```python
import numpy as np

# From a list
scores = np.array([0.87, 0.45, 0.92, 0.31, 0.78])

# Create zeros (like a blank image)
blank_frame = np.zeros((1080, 1920, 3))   # Black image

# Create ones
ones = np.ones((224, 224, 3))             # White image

# Random values (useful for testing)
random_frame = np.random.randint(0, 255, (1080, 1920, 3))  # Random "image"

print(scores.shape)       # (5,)
print(blank_frame.shape)  # (1080, 1920, 3)
```

### 2. Array Properties

```python
frame = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)

print(frame.shape)    # (1080, 1920, 3) - dimensions
print(frame.dtype)    # uint8 - data type (0-255)
print(frame.size)     # 6220800 - total elements
print(frame.ndim)     # 3 - number of dimensions
print(frame.min())    # 0 - minimum value
print(frame.max())    # 255 - maximum value
print(frame.mean())   # ~127 - average value
```

### 3. Reshaping (Critical for Models!)

```python
# YOLO needs input as (640, 640) but camera gives (1080, 1920)
# We need to resize!

# Original frame
frame = np.random.randint(0, 255, (1080, 1920, 3))
print(frame.shape)  # (1080, 1920, 3)

# Note: For actual image resizing, you'll use OpenCV (cv2.resize)
# But understanding reshape is fundamental

# Reshape a 1D array to 2D
flat = np.array([1, 2, 3, 4, 5, 6])
matrix = flat.reshape(2, 3)
print(matrix)
# [[1, 2, 3],
#  [4, 5, 6]]

# Flatten a 2D array to 1D (needed for some models)
flat_again = matrix.flatten()
print(flat_again)  # [1, 2, 3, 4, 5, 6]
```

### 4. Math Operations

```python
# Normalize pixel values (REQUIRED before feeding to neural networks)
frame = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)

# Pixel values: 0-255 → 0.0-1.0
normalized = frame / 255.0
print(normalized.max())   # 1.0
print(normalized.min())   # 0.0

# This is called NORMALIZATION - neural networks work better with 0-1 values

# Element-wise operations (happens to ALL numbers at once)
a = np.array([0.87, 0.45, 0.92, 0.31])
b = np.array([0.75, 0.50, 0.80, 0.60])

# Which detections are above threshold?
above_threshold = a > 0.5
print(above_threshold)  # [True, False, True, False]

# Average confidence
print(np.mean(a))       # 0.6375
```

### 5. Slicing (Extracting Parts)

```python
# Get a region of an image (like cropping a face)
frame = np.random.randint(0, 255, (1080, 1920, 3))

# Crop region: rows 200-400, columns 500-700
face_crop = frame[200:400, 500:700, :]
print(face_crop.shape)  # (200, 200, 3) - a 200x200 face crop

# Get just the red channel
red_channel = frame[:, :, 0]
print(red_channel.shape)  # (1080, 1920)

# Get the top half of the image
top_half = frame[:540, :, :]
print(top_half.shape)  # (540, 1920, 3)
```

### 6. Stacking (Combining Arrays)

```python
# Stack multiple frames into a batch (for GPU processing)
frame1 = np.random.rand(224, 224, 3)
frame2 = np.random.rand(224, 224, 3)
frame3 = np.random.rand(224, 224, 3)

# Create a batch of 3 frames
batch = np.stack([frame1, frame2, frame3])
print(batch.shape)  # (3, 224, 224, 3)
#                      |
#                      └── 3 frames in the batch

# Models process batches faster than individual frames!
```

### 7. Distance Calculations (for Person Re-ID)

```python
# Person Re-ID: Compare two appearance vectors
person_cam1 = np.array([0.23, 0.87, 0.12, 0.45, 0.91])
person_cam3 = np.array([0.25, 0.85, 0.14, 0.43, 0.89])
different_person = np.array([0.91, 0.13, 0.78, 0.22, 0.34])

# Euclidean distance
dist_same = np.sqrt(np.sum((person_cam1 - person_cam3) ** 2))
dist_diff = np.sqrt(np.sum((person_cam1 - different_person) ** 2))

print(f"Same person distance: {dist_same:.4f}")      # ~0.04 (small = same person)
print(f"Different person distance: {dist_diff:.4f}")  # ~1.12 (large = different person)
```

---

## Mini Project: Fake Image Processor

Build this to practice NumPy with image-like data:

```python
"""
Mini Project: Fake Image Processor
Practice: NumPy arrays, reshaping, math operations, slicing
"""
import numpy as np

# Step 1: Create a fake "camera frame" (100x100 pixels, 3 colors)
print("=== ExamGuard Frame Simulator ===\n")

frame = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
print(f"Frame shape: {frame.shape}")
print(f"Frame size: {frame.size} numbers")
print(f"Pixel range: {frame.min()} to {frame.max()}")

# Step 2: Normalize (what we do before feeding to AI model)
normalized = frame / 255.0
print(f"\nNormalized range: {normalized.min():.2f} to {normalized.max():.2f}")

# Step 3: Crop a "face region" (rows 20-60, columns 30-70)
face = frame[20:60, 30:70, :]
print(f"Face crop shape: {face.shape}")

# Step 4: Simulate 5 camera frames in a batch
frames = np.random.randint(0, 255, (5, 100, 100, 3), dtype=np.uint8)
print(f"\nBatch of 5 frames shape: {frames.shape}")

# Step 5: Calculate average brightness per frame
for i in range(5):
    brightness = frames[i].mean()
    status = "BRIGHT" if brightness > 127 else "DARK"
    print(f"Camera {i+1}: avg brightness = {brightness:.1f} ({status})")

# Step 6: Simulate detection confidence scores
confidences = np.array([0.87, 0.45, 0.92, 0.31, 0.78, 0.65, 0.23, 0.91])
threshold = 0.70

alerts = confidences[confidences >= threshold]
print(f"\n{len(alerts)} detections above threshold {threshold}: {alerts}")
print(f"Average confidence of alerts: {alerts.mean():.2f}")

# Step 7: Simulate Person Re-ID
print("\n=== Person Re-ID Simulation ===")
person_a_cam1 = np.random.rand(128)  # 128-dim feature vector
person_a_cam3 = person_a_cam1 + np.random.normal(0, 0.02, 128)  # Same person, small noise
person_b_cam2 = np.random.rand(128)  # Different person

dist_same = np.linalg.norm(person_a_cam1 - person_a_cam3)
dist_diff = np.linalg.norm(person_a_cam1 - person_b_cam2)

print(f"Same person (Cam1 vs Cam3): distance = {dist_same:.4f}")
print(f"Different person (A vs B):  distance = {dist_diff:.4f}")
print(f"Match: {'YES' if dist_same < 0.5 else 'NO'} (threshold: 0.5)")
```

### What this mini project teaches:

| Step | NumPy Skill | ExamGuard Connection |
|---|---|---|
| Create frame | Array creation | Camera captures frame |
| Normalize | Division operation | Preprocess for model |
| Crop face | Array slicing | Extract face for gaze CNN |
| Batch frames | Array stacking | GPU batch processing |
| Brightness | Statistical operations | Image quality check |
| Threshold | Boolean indexing | Filter confident detections |
| Re-ID | Distance calculation | Match persons across cameras |

---

## Key NumPy Functions for ExamGuard

```python
# Creation
np.array()              # Create from list
np.zeros()              # Create empty (black image)
np.ones()               # Create filled
np.random.randint()     # Random integers (fake images)
np.random.rand()        # Random floats 0-1

# Properties
array.shape             # Dimensions
array.dtype             # Data type
array.mean()            # Average
array.max(), .min()     # Range

# Operations
array / 255.0           # Normalize
array.reshape()         # Change dimensions
array.flatten()         # Make 1D
np.stack()              # Combine arrays
np.linalg.norm()        # Distance calculation

# Indexing
array[start:end]        # Slice
array[array > 0.5]      # Boolean filter
```

---

## Common Gotcha for Beginners

```python
# WRONG: Regular Python list math
a = [1, 2, 3]
b = [4, 5, 6]
c = a + b          # [1, 2, 3, 4, 5, 6]  ← concatenation, NOT addition!

# RIGHT: NumPy array math
a = np.array([1, 2, 3])
b = np.array([4, 5, 6])
c = a + b          # [5, 7, 9]  ← actual element-wise addition!
```

NumPy arrays do MATH. Python lists do CONCATENATION. This trips up every beginner at least once.
