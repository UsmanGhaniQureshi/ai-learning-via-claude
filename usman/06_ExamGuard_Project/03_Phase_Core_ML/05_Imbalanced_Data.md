# Imbalanced Data

## What is Imbalanced Data?

Imbalanced data is when one class has **WAY more examples** than another. The common class is called the "majority class" and the rare class is called the "minority class."

```
Balanced data:      50% Class A, 50% Class B     (easy to learn)
Imbalanced data:    99% Class A, 1% Class B      (VERY hard to learn)
```

---

## Why Imbalanced Data is ExamGuard's Biggest Challenge

### The Reality of Exam Monitoring

In a real exam:
- 99% of the time, students are writing normally
- Only about 1% of behavior involves cheating

This means your training data looks like:

```
ExamGuard Training Data:
  Normal behavior clips:   9,900 (99%)
  Cheating clips:            100 (1%)
  ─────────────────────────────────
  Total:                  10,000

Visualized:
  Normal:   ████████████████████████████████████████████████ 99%
  Cheating: ▌ 1%
```

### What Happens If You Ignore This?

The model takes the lazy shortcut:

```
Model's "learning":
  "If I ALWAYS predict 'normal', I'm right 99% of the time!"

Result:
  Accuracy: 99%
  Cheating caught: 0 out of 100
  The model is USELESS. It never learned what cheating looks like.
```

This is not a theoretical problem. This WILL happen if you don't handle imbalanced data. It's one of the most common reasons real ML projects fail.

---

## Why Models Fail with Imbalanced Data

### The Model's Perspective

During training, the model sees examples and adjusts its weights:

```
Batch 1:  normal, normal, normal, normal, normal  → Learn "normal"
Batch 2:  normal, normal, normal, normal, normal  → Reinforce "normal"
Batch 3:  normal, normal, normal, normal, normal  → Even more "normal"
...
Batch 99: normal, normal, normal, normal, CHEATING → One cheating example!
          But the model has seen 495 normal vs 1 cheating.
          The cheating signal is drowned out.
```

The model simply doesn't see ENOUGH cheating examples to learn the pattern. It's like trying to learn Urdu by reading 99 English books and 1 Urdu book.

---

## Solutions

### Solution 1: Oversampling (Duplicate Minority Class)

Simply copy cheating clips multiple times to balance the dataset.

```python
from sklearn.utils import resample
import pandas as pd

# Original data
df = pd.DataFrame({
    "clip_id": range(1000),
    "label": ["normal"] * 950 + ["cheating"] * 50
})

print(f"Before: {df['label'].value_counts().to_dict()}")
# normal: 950, cheating: 50

# Separate classes
normal = df[df["label"] == "normal"]
cheating = df[df["label"] == "cheating"]

# Oversample cheating to match normal
cheating_oversampled = resample(
    cheating,
    replace=True,          # Allow duplicates
    n_samples=len(normal), # Match majority class size
    random_state=42
)

# Combine
df_balanced = pd.concat([normal, cheating_oversampled])
print(f"After:  {df_balanced['label'].value_counts().to_dict()}")
# normal: 950, cheating: 950
```

**Pros:** Simple, works immediately
**Cons:** Exact duplicates can cause overfitting (model memorizes specific clips)

### Solution 2: Undersampling (Reduce Majority Class)

Remove some normal clips to balance the dataset.

```python
# Undersample normal to match cheating
normal_undersampled = resample(
    normal,
    replace=False,             # No duplicates
    n_samples=len(cheating),   # Match minority class size
    random_state=42
)

df_balanced = pd.concat([normal_undersampled, cheating])
print(f"After: {df_balanced['label'].value_counts().to_dict()}")
# normal: 50, cheating: 50
```

**Pros:** No duplicates, fast training (smaller dataset)
**Cons:** Throws away 900 normal clips! Loses valuable training data.

### Solution 3: SMOTE (Create Synthetic Minority Examples)

SMOTE (Synthetic Minority Over-sampling Technique) creates NEW, artificial cheating examples by interpolating between existing ones.

```python
from imblearn.over_sampling import SMOTE
import numpy as np

# Features and labels
X = np.random.randn(1000, 5)  # 5 features
y = np.array([0] * 950 + [1] * 50)  # 0=normal, 1=cheating

print(f"Before SMOTE: Normal={sum(y==0)}, Cheating={sum(y==1)}")

# Apply SMOTE
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X, y)

print(f"After SMOTE:  Normal={sum(y_resampled==0)}, Cheating={sum(y_resampled==1)}")
# Before: Normal=950, Cheating=50
# After:  Normal=950, Cheating=950
```

**How SMOTE works:**
```
Original cheating clip features: [0.8, 0.7, 0.9]
Another cheating clip features:  [0.6, 0.5, 0.8]

SMOTE creates a new synthetic example BETWEEN them:
New synthetic features:          [0.7, 0.6, 0.85]

This is NOT a copy - it's a new, realistic example!
```

**Pros:** Creates diverse, new examples (better than plain duplication)
**Cons:** Works on features, not raw images. For images, use augmentation instead.

### Solution 4: Data Augmentation (Best for Images/Video!)

For ExamGuard, data augmentation is the BEST solution because we work with images and video.

```python
import cv2
import numpy as np

def augment_cheating_clip(frames):
    """Create 5 new variations of a cheating video clip."""
    augmented = []

    # Original
    augmented.append(frames)

    # Horizontal flip (mirror image)
    augmented.append([cv2.flip(f, 1) for f in frames])

    # Brightness increase (+20%)
    augmented.append([cv2.convertScaleAbs(f, alpha=1.2, beta=0) for f in frames])

    # Brightness decrease (-20%)
    augmented.append([cv2.convertScaleAbs(f, alpha=0.8, beta=0) for f in frames])

    # Add random noise
    noisy = []
    for f in frames:
        noise = np.random.normal(0, 10, f.shape).astype(np.uint8)
        noisy.append(cv2.add(f, noise))
    augmented.append(noisy)

    # Slight zoom (crop center 90% and resize back)
    zoomed = []
    for f in frames:
        h, w = f.shape[:2]
        crop = f[h//20:h-h//20, w//20:w-w//20]
        zoomed.append(cv2.resize(crop, (w, h)))
    augmented.append(zoomed)

    return augmented  # 6 versions (1 original + 5 augmented)

# Result:
# 100 original cheating clips × 6 = 600 cheating clips
# Much closer to the 950 normal clips!
```

**Pros:** Creates visually different examples, works great for images/video
**Cons:** All variations are based on original clips (limited diversity)

### Solution 5: Class Weights (Tell the Model to Care More About Minority)

Instead of changing the data, tell the model to pay MORE attention to cheating examples.

```python
from sklearn.ensemble import RandomForestClassifier

# Without class weights (model treats all samples equally)
model_bad = RandomForestClassifier()
model_bad.fit(X_train, y_train)

# With class weights (model pays more attention to cheating)
model_good = RandomForestClassifier(class_weight="balanced")
model_good.fit(X_train, y_train)

# "balanced" automatically calculates weights:
# Normal weight:  1000 / (2 * 950) = 0.526
# Cheating weight: 1000 / (2 * 50)  = 10.0
# Cheating examples count 19x more than normal!
```

For deep learning (PyTorch):
```python
import torch
import torch.nn as nn

# Calculate weights inversely proportional to class frequency
n_normal = 9500
n_cheating = 500
total = n_normal + n_cheating

weight_normal = total / (2 * n_normal)    # 0.526
weight_cheating = total / (2 * n_cheating) # 10.0

class_weights = torch.tensor([weight_normal, weight_cheating])
criterion = nn.CrossEntropyLoss(weight=class_weights)

# Now the loss function penalizes missing cheating 19x more than missing normal
```

**Pros:** No data modification needed, easy to implement
**Cons:** Might make model too aggressive (more false alarms)

---

## Which Solution to Use for ExamGuard?

**Recommended combination:**

```
1. Data Augmentation (PRIMARY)
   → Create more cheating clips via flip, rotate, brightness, noise
   → Goal: At least 5x more cheating clips

2. Class Weights (SECONDARY)
   → Tell the model cheating matters more
   → Helps even after augmentation

3. Stratified Sampling (ALWAYS)
   → Ensure every training batch has some cheating clips
   → Never let the model go many batches without seeing cheating

DO NOT use undersampling (you need all your normal data too)
Use SMOTE only for tabular features, not for raw images
```

---

## Mini Project: Compare Imbalanced vs Balanced Training

```python
"""
Mini Project: See the Impact of Imbalanced Data
Train the same model WITH and WITHOUT handling imbalance
"""
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.utils import resample

np.random.seed(42)

# Create imbalanced data
n_normal = 950
n_cheating = 50

normal_X = np.random.normal(0, 1, (n_normal, 5))
cheating_X = np.random.normal(2, 1, (n_cheating, 5))

X = np.vstack([normal_X, cheating_X])
y = np.array([0] * n_normal + [1] * n_cheating)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Method 1: Ignore imbalance (naive approach)
print("=== Method 1: Ignore Imbalance (NAIVE) ===")
model_naive = RandomForestClassifier(random_state=42)
model_naive.fit(X_train, y_train)
preds_naive = model_naive.predict(X_test)
print(classification_report(y_test, preds_naive, target_names=["Normal", "Cheating"]))

# Method 2: Class weights
print("=== Method 2: Class Weights ===")
model_weighted = RandomForestClassifier(class_weight="balanced", random_state=42)
model_weighted.fit(X_train, y_train)
preds_weighted = model_weighted.predict(X_test)
print(classification_report(y_test, preds_weighted, target_names=["Normal", "Cheating"]))

# Method 3: Oversampling
print("=== Method 3: Oversampling ===")
train_df_X = X_train
train_df_y = y_train

# Separate and oversample
cheating_mask = train_df_y == 1
normal_mask = train_df_y == 0

X_cheating = train_df_X[cheating_mask]
y_cheating = train_df_y[cheating_mask]

# Oversample cheating to match normal
n_to_sample = normal_mask.sum()
indices = np.random.choice(len(X_cheating), size=n_to_sample, replace=True)
X_cheating_over = X_cheating[indices]
y_cheating_over = y_cheating[indices]

X_balanced = np.vstack([train_df_X[normal_mask], X_cheating_over])
y_balanced = np.concatenate([train_df_y[normal_mask], y_cheating_over])

model_over = RandomForestClassifier(random_state=42)
model_over.fit(X_balanced, y_balanced)
preds_over = model_over.predict(X_test)
print(classification_report(y_test, preds_over, target_names=["Normal", "Cheating"]))

# Summary
from sklearn.metrics import recall_score, f1_score
print("=== Summary ===")
print(f"{'Method':<25} {'Recall (Cheating)':>20} {'F1 (Cheating)':>15}")
print("-" * 62)
print(f"{'Naive (no handling)':<25} {recall_score(y_test, preds_naive):>20.1%} {f1_score(y_test, preds_naive):>15.1%}")
print(f"{'Class Weights':<25} {recall_score(y_test, preds_weighted):>20.1%} {f1_score(y_test, preds_weighted):>15.1%}")
print(f"{'Oversampling':<25} {recall_score(y_test, preds_over):>20.1%} {f1_score(y_test, preds_over):>15.1%}")
```

---

## This is One of the HARDEST Problems in Real ML

Imbalanced data is not just an ExamGuard problem. It appears everywhere in the real world:

| Domain | Majority Class | Minority Class | Ratio |
|---|---|---|---|
| ExamGuard | Normal behavior | Cheating | 99:1 |
| Fraud detection | Legitimate transactions | Fraud | 99.9:0.1 |
| Medical diagnosis | Healthy patients | Disease | 95:5 |
| Spam detection | Real email | Spam | 80:20 |
| Manufacturing | Good products | Defective | 99:1 |

Every ML engineer struggles with this. The solutions you learn here apply to ALL of these domains.

---

## Key Takeaways

```
+--------------------------------------------------------+
|  IMBALANCED DATA SURVIVAL GUIDE                        |
+--------------------------------------------------------+
|                                                        |
|  1. CHECK your class distribution FIRST                |
|     (before any training!)                             |
|                                                        |
|  2. NEVER trust accuracy on imbalanced data            |
|     (use F1, precision, recall instead)                |
|                                                        |
|  3. For ExamGuard images/video:                        |
|     → Data augmentation (flip, rotate, brightness)     |
|     → Class weights in loss function                   |
|     → Stratified batches during training               |
|                                                        |
|  4. For tabular features:                              |
|     → SMOTE                                            |
|     → Class weights                                    |
|     → Oversampling                                     |
|                                                        |
|  5. ALWAYS use stratified train-test split             |
|                                                        |
|  6. Monitor recall for the minority class              |
|     (catching cheating is our #1 priority)             |
|                                                        |
+--------------------------------------------------------+
```
