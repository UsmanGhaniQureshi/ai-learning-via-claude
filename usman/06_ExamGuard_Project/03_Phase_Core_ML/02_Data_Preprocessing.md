# Data Preprocessing

## What is Data Preprocessing?

Data preprocessing is **cleaning and preparing your data** before feeding it to a machine learning model. Raw data is messy, inconsistent, and not in the format models expect.

Think of it like preparing ingredients before cooking:
- You don't put a whole chicken in the pot (you need to clean, cut, and season it)
- You don't feed raw, messy data to a model (you need to clean, transform, and format it)

---

## Why Data Preprocessing Matters for ExamGuard

### The Golden Rule: Garbage In = Garbage Out

If you feed bad data to the best model in the world, you get bad results. Period.

```
RAW exam data problems:
  - Video frames are different sizes (Camera 1: 1920x1080, Camera 2: 1280x720)
  - Some clips are too dark (night exam) or too bright (window glare)
  - Labels might be inconsistent ("phone", "Phone", "mobile", "cell phone")
  - Some clips are corrupted or too short
  - Pixel values range 0-255 but models expect 0-1
  - Missing metadata (no camera ID, no timestamp)

ALL of these must be fixed BEFORE training.
```

### What happens without preprocessing:

```
Without preprocessing:
  Raw data → Model → 45% accuracy → Useless

With preprocessing:
  Raw data → Clean → Normalize → Format → Model → 92% accuracy → Useful!
```

---

## What to Learn

### 1. Image Resizing (All Images MUST Be the Same Size)

```python
import cv2
import numpy as np

# Problem: YOLO needs 640x640, camera gives 1920x1080
frame = cv2.imread("exam_frame.jpg")  # Shape: (1080, 1920, 3)

# Solution: Resize
resized = cv2.resize(frame, (640, 640))  # Shape: (640, 640, 3)
```

**Why:** Neural networks have a fixed input size. You can't feed a 1920x1080 image to a model expecting 640x640. EVERY image must be resized to the SAME dimensions.

**ExamGuard specifics:**

| Model | Required Input Size | Why This Size |
|---|---|---|
| YOLOv8 | 640 x 640 | Standard YOLO input |
| CNN (gaze) | 224 x 224 | Standard CNN input (ImageNet) |
| Face crop | 112 x 112 | Standard for face models |
| Behavior LSTM | 224 x 224 per frame | Matches CNN input |

### 2. Normalization (Scale Numbers to 0-1)

```python
import numpy as np

# Problem: Pixel values are 0-255
frame = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
print(f"Before: min={frame.min()}, max={frame.max()}")  # 0 to 255

# Solution: Normalize to 0-1
normalized = frame.astype(np.float32) / 255.0
print(f"After: min={normalized.min():.2f}, max={normalized.max():.2f}")  # 0.0 to 1.0
```

**Why:** Neural networks learn better when input values are small (0-1) instead of large (0-255). Large values cause unstable training (gradients explode).

**Common normalization methods:**

```python
# Method 1: Simple division (0-1 range)
normalized = image / 255.0

# Method 2: ImageNet standardization (used with pre-trained models)
mean = np.array([0.485, 0.456, 0.406])  # ImageNet mean
std = np.array([0.229, 0.224, 0.225])   # ImageNet std
standardized = (image / 255.0 - mean) / std

# Method 3: Min-Max scaling for numerical features
from sklearn.preprocessing import MinMaxScaler
scaler = MinMaxScaler()
features_scaled = scaler.fit_transform(features)
```

### 3. Handling Missing Data

```python
import pandas as pd

# Load clip metadata
df = pd.read_csv("exam_clips.csv")

# Check for missing values
print(df.isnull().sum())
# clip_id            0
# label              5   ← 5 clips without labels
# duration_sec       2   ← 2 clips with missing duration
# camera_id          0
# confidence        15   ← 15 clips missing confidence

# Strategy 1: Drop rows with missing labels (can't train without labels!)
df = df.dropna(subset=["label"])

# Strategy 2: Fill missing numerical values with the median
df["duration_sec"] = df["duration_sec"].fillna(df["duration_sec"].median())
df["confidence"] = df["confidence"].fillna(df["confidence"].median())

print(f"Clean dataset: {len(df)} clips")
print(f"Missing values: {df.isnull().sum().sum()}")  # Should be 0
```

**ExamGuard connection:** Real datasets ALWAYS have missing data. Some clips might not have labels, some might have corrupted metadata. Handle this BEFORE training.

### 4. Label Encoding (Convert Text to Numbers)

```python
# Problem: Models need numbers, not text
labels = ["normal", "phone", "looking_neighbor", "passing_notes"]

# Solution 1: Label encoding (for simple classification)
from sklearn.preprocessing import LabelEncoder
le = LabelEncoder()
encoded = le.fit_transform(labels)
print(encoded)  # [2, 3, 1, 0]  (alphabetical order)

# Solution 2: One-hot encoding (for neural networks)
# "phone"           → [0, 0, 1, 0]
# "normal"          → [0, 1, 0, 0]
# "looking_neighbor"→ [1, 0, 0, 0]
# "passing_notes"   → [0, 0, 0, 1]
```

**ExamGuard connection:** The model can't understand "phone" or "normal". It only understands numbers. Every label must be encoded.

### 5. Data Augmentation (Create More Training Data)

```python
import cv2
import numpy as np

# Problem: Only 200 cheating clips (not enough!)
# Solution: Create variations of existing clips

def augment_frame(frame):
    """Create augmented versions of a frame."""
    augmented = []

    # Horizontal flip
    augmented.append(cv2.flip(frame, 1))

    # Brightness adjustment
    bright = cv2.convertScaleAbs(frame, alpha=1.2, beta=30)
    augmented.append(bright)

    # Slight rotation
    h, w = frame.shape[:2]
    M = cv2.getRotationMatrix2D((w//2, h//2), 5, 1.0)  # 5 degree rotation
    rotated = cv2.warpAffine(frame, M, (w, h))
    augmented.append(rotated)

    # Add slight noise
    noise = np.random.normal(0, 10, frame.shape).astype(np.uint8)
    noisy = cv2.add(frame, noise)
    augmented.append(noisy)

    return augmented

# 200 clips × 5 variations (original + 4 augmented) = 1000 clips!
```

**ExamGuard connection:** You have very few cheating clips. Augmentation creates more training data from existing clips by applying transformations. This is ESSENTIAL for handling the imbalanced data problem.

### 6. Video-Specific Preprocessing

```python
import cv2

def preprocess_video_clip(video_path, target_frames=30, target_size=(224, 224)):
    """
    Preprocess a video clip for the behavior model.

    Steps:
    1. Load video
    2. Sample fixed number of frames
    3. Resize each frame
    4. Normalize pixel values
    """
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Sample evenly spaced frames
    indices = np.linspace(0, total_frames - 1, target_frames, dtype=int)

    frames = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            # Resize
            frame = cv2.resize(frame, target_size)
            # Convert BGR to RGB (OpenCV uses BGR, models expect RGB)
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            # Normalize
            frame = frame.astype(np.float32) / 255.0
            frames.append(frame)

    cap.release()

    # Stack into array: (30, 224, 224, 3)
    return np.array(frames)
```

**ExamGuard connection:** Video clips have different lengths (20 sec, 45 sec, etc.). The LSTM model needs a FIXED number of frames. This function standardizes every clip to exactly 30 frames.

---

## The Complete Preprocessing Pipeline for ExamGuard

```
RAW DATA
    |
    v
1. COLLECT: Load all video clips and metadata CSV
    |
    v
2. CLEAN: Remove corrupted clips, fix missing labels, standardize label names
    |
    v
3. RESIZE: All frames to required size (640x640 for YOLO, 224x224 for CNN)
    |
    v
4. NORMALIZE: Pixel values from 0-255 to 0.0-1.0
    |
    v
5. AUGMENT: Create more cheating clips via flip, rotate, brightness
    |
    v
6. ENCODE: Convert text labels to numbers
    |
    v
7. SPLIT: 80% training, 20% testing (stratified!)
    |
    v
8. SAVE: Store preprocessed data for fast loading during training
    |
    v
CLEAN DATA → Ready for model training!
```

---

## Mini Project: Build a Preprocessing Pipeline

```python
"""
Mini Project: ExamGuard Data Preprocessing Pipeline
Practice: Resizing, normalizing, augmenting, encoding
"""
import numpy as np

# Simulate raw data
print("=== ExamGuard Preprocessing Pipeline ===\n")

# Step 1: Simulate raw frames of different sizes
raw_frames = [
    np.random.randint(0, 255, (1080, 1920, 3)),  # Camera 1: Full HD
    np.random.randint(0, 255, (720, 1280, 3)),    # Camera 2: HD
    np.random.randint(0, 255, (480, 640, 3)),      # Camera 3: SD
]

print("Step 1 - Raw frames:")
for i, frame in enumerate(raw_frames):
    print(f"  Camera {i+1}: {frame.shape}")

# Step 2: Resize all to same size
target_size = (224, 224)
resized = []
for frame in raw_frames:
    # Simple resize by taking evenly spaced pixels (real code uses cv2.resize)
    h_idx = np.linspace(0, frame.shape[0]-1, target_size[0], dtype=int)
    w_idx = np.linspace(0, frame.shape[1]-1, target_size[1], dtype=int)
    r = frame[np.ix_(h_idx, w_idx)]
    resized.append(r)

print("\nStep 2 - After resizing:")
for i, frame in enumerate(resized):
    print(f"  Camera {i+1}: {frame.shape}")

# Step 3: Normalize
normalized = [f.astype(np.float32) / 255.0 for f in resized]
print(f"\nStep 3 - After normalizing:")
print(f"  Value range: {normalized[0].min():.2f} to {normalized[0].max():.2f}")

# Step 4: Label encoding
raw_labels = ["normal", "phone", "looking_neighbor", "normal", "passing_notes"]
label_map = {"normal": 0, "phone": 1, "looking_neighbor": 2, "passing_notes": 3}
encoded_labels = [label_map[l] for l in raw_labels]
print(f"\nStep 4 - Label encoding:")
for raw, enc in zip(raw_labels, encoded_labels):
    print(f"  '{raw}' → {enc}")

# Step 5: Data augmentation (simulate)
n_original_cheating = 50
n_augmented_per_clip = 4
n_total = n_original_cheating * (1 + n_augmented_per_clip)
print(f"\nStep 5 - Data augmentation:")
print(f"  Original cheating clips: {n_original_cheating}")
print(f"  Augmentations per clip: {n_augmented_per_clip}")
print(f"  Total after augmentation: {n_total}")

# Step 6: Summary
print(f"\n=== Pipeline Complete ===")
print(f"  All frames: {target_size[0]}x{target_size[1]} pixels")
print(f"  Value range: 0.0 to 1.0")
print(f"  Labels: numerical (0-3)")
print(f"  Data: augmented and balanced")
print(f"  Ready for training!")
```

---

## Common Preprocessing Mistakes

| Mistake | Why It's Bad | How to Avoid |
|---|---|---|
| Not resizing images | Model crashes or performs poorly | Always resize to model's expected input |
| Forgetting to normalize | Training is unstable, slow | Always normalize to 0-1 or standardize |
| Normalizing test data with test statistics | Data leakage! | Fit scaler on TRAIN data only, apply to test |
| Inconsistent labels | Model gets confused | Standardize labels before training |
| Not augmenting minority class | Model ignores rare events | Augment cheating clips heavily |
| BGR vs RGB mix-up | Colors are wrong, model confused | OpenCV reads BGR, convert to RGB for models |
| Preprocessing after split | Data leakage risk | Determine preprocessing params from train set only |

The most dangerous mistake is **data leakage**: accidentally using information from the test set during training. This makes your metrics look great but the model fails in the real world.
