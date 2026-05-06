# Train-Test Split

## What is Train-Test Split?

Train-test split is **dividing your data into two separate groups** before training:

- **Training set (80%):** The model learns from this data
- **Testing set (20%):** The model is evaluated on this data (it NEVER sees this during training)

```
All Data (10,000 clips)
    |
    ├── Training Set (8,000 clips) → Model LEARNS from these
    |
    └── Testing Set (2,000 clips)  → Model is TESTED on these
```

---

## Why Train-Test Split Matters for ExamGuard

### The Exam Analogy

Imagine a student who memorized the exact questions from last year's exam paper:

```
Teacher gives them last year's paper as a test:
  → Student scores 100%
  → Teacher thinks: "Brilliant student!"

Teacher gives them a NEW paper:
  → Student scores 30%
  → Reality: Student memorized, didn't learn
```

This is EXACTLY what happens with ML models:

```
Model tested on training data:
  → 99% accuracy!
  → You think: "Amazing model!"

Model tested on NEW data (test set):
  → 55% accuracy
  → Reality: Model memorized, didn't learn

This is called OVERFITTING - the most common ML mistake.
```

### For ExamGuard, this means:

If you test your phone detection model on the same frames it was trained on, it might score 99% accuracy. But in a REAL exam with NEW students, NEW angles, NEW lighting, it might only score 60%. That's useless.

**The test set simulates the real world.** If the model performs well on data it has NEVER seen, it will likely perform well in a real exam.

---

## What to Learn

### 1. Basic Split

```python
from sklearn.model_selection import train_test_split

# X = features (video clip data)
# y = labels (0=normal, 1=cheating)

X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,      # 20% for testing
    random_state=42,     # Reproducible split
)

print(f"Training samples: {len(X_train)}")  # 8,000
print(f"Testing samples: {len(X_test)}")    # 2,000
```

### 2. Stratified Split (CRITICAL for ExamGuard!)

```python
# Problem: Random split might put ALL cheating clips in one set

# Example of BAD random split:
# Training: 8,000 clips (7,950 normal, 50 cheating)   ← almost no cheating!
# Testing:  2,000 clips (1,550 normal, 450 cheating)  ← too much cheating!

# Solution: Stratified split preserves the ratio
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=y          # ← THIS is the key parameter!
)

# Now both sets have the same ratio:
# Training: 8,000 clips (7,600 normal, 400 cheating)  = 5% cheating
# Testing:  2,000 clips (1,900 normal, 100 cheating)  = 5% cheating
```

**Why stratified?** ExamGuard has 95% normal and 5% cheating clips. A random split might accidentally put most cheating clips in one set. Stratified split ensures BOTH sets have the same proportion.

### 3. Validation Set (Three-Way Split)

For serious model development, you actually need THREE sets:

```
All Data (10,000 clips)
    |
    ├── Training Set (70%) - 7,000 clips → Model LEARNS
    |
    ├── Validation Set (15%) - 1,500 clips → Tune model settings
    |
    └── Test Set (15%) - 1,500 clips → FINAL evaluation (use only once!)
```

```python
from sklearn.model_selection import train_test_split

# First split: separate test set
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.15, random_state=42, stratify=y
)

# Second split: separate validation from training
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.176, random_state=42, stratify=y_temp
)
# 0.176 of 85% ≈ 15% of total

print(f"Training:   {len(X_train)} clips ({len(X_train)/len(X)*100:.0f}%)")
print(f"Validation: {len(X_val)} clips ({len(X_val)/len(X)*100:.0f}%)")
print(f"Testing:    {len(X_test)} clips ({len(X_test)/len(X)*100:.0f}%)")
```

**Why three sets?**

| Set | Purpose | When Used |
|---|---|---|
| **Training** | Model learns patterns | Every training epoch |
| **Validation** | Tune hyperparameters (learning rate, model size) | During development |
| **Test** | Final, unbiased evaluation | ONCE, at the very end |

The validation set prevents you from accidentally tuning your model to the test set (which would be another form of cheating).

### 4. ExamGuard-Specific Split Strategy

For ExamGuard, a smarter split is by **exam hall**, not by random clips:

```python
# BAD: Random split
# Training might have clips from Hall A, Row 3, Seat 7
# Testing might have OTHER clips from Hall A, Row 3, Seat 7
# The model might recognize the SEAT, not the BEHAVIOR!

# GOOD: Split by hall
# Training: Halls A, B, C (different students, different lighting)
# Testing:  Halls D, E (completely new environment)
# Now the model MUST generalize to new halls!

import pandas as pd

df = pd.read_csv("exam_clips.csv")

# Split by hall
train_halls = ["hall_A", "hall_B", "hall_C", "hall_D"]
test_halls = ["hall_E", "hall_F"]

train_data = df[df["hall_id"].isin(train_halls)]
test_data = df[df["hall_id"].isin(test_halls)]

print(f"Training: {len(train_data)} clips from halls {train_halls}")
print(f"Testing:  {len(test_data)} clips from halls {test_halls}")
```

This is harder to pass but gives you a model that actually works in the real world.

---

## CRITICAL RULES (Memorize These!)

### Rule 1: NEVER Test on Training Data

```
WRONG:
  model.fit(X, y)              # Train on ALL data
  predictions = model.predict(X)  # Test on SAME data
  accuracy = 99%                # FAKE accuracy!

RIGHT:
  model.fit(X_train, y_train)       # Train on training set
  predictions = model.predict(X_test) # Test on UNSEEN data
  accuracy = 85%                     # REAL accuracy!
```

### Rule 2: NEVER Preprocess Using Test Data

```
WRONG:
  # Calculate mean from ALL data (includes test)
  mean = X.mean()
  X_normalized = X - mean  # Test data influenced the mean!

RIGHT:
  # Calculate mean from TRAINING data only
  mean = X_train.mean()
  X_train_normalized = X_train - mean  # Training normalized with training stats
  X_test_normalized = X_test - mean    # Test normalized with TRAINING stats
```

### Rule 3: ALWAYS Use Stratified Split for Imbalanced Data

```
ExamGuard data: 95% normal, 5% cheating

Without stratify: Test set might have 0% cheating → can't test at all!
With stratify:    Test set has 5% cheating → proper testing
```

### Rule 4: Split BEFORE Augmentation

```
WRONG:
  Augment data → Split → Training and test share augmented versions of same clips!

RIGHT:
  Split → Augment ONLY training set → Test set has ONLY original clips
```

If you augment before splitting, the test set might contain a flipped version of a training clip. The model would partially recognize it, giving fake high accuracy.

---

## Mini Project: Demonstrate the Danger of Not Splitting

```python
"""
Mini Project: Show WHY train-test split matters
Compare accuracy WITH and WITHOUT proper splitting
"""
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

np.random.seed(42)

# Generate data
n = 1000
X = np.random.randn(n, 5)
y = (X[:, 0] + X[:, 1] > 0).astype(int)

# Method 1: WRONG - test on training data
model_wrong = RandomForestClassifier(n_estimators=100, random_state=42)
model_wrong.fit(X, y)
preds_wrong = model_wrong.predict(X)
acc_wrong = accuracy_score(y, preds_wrong)

# Method 2: RIGHT - proper train-test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
model_right = RandomForestClassifier(n_estimators=100, random_state=42)
model_right.fit(X_train, y_train)
preds_right = model_right.predict(X_test)
acc_right = accuracy_score(y_test, preds_right)

print("=== The Danger of Not Splitting ===\n")
print(f"Testing on training data (WRONG): {acc_wrong:.2%}")
print(f"Testing on unseen data (RIGHT):   {acc_right:.2%}")
print(f"\nDifference: {acc_wrong - acc_right:.2%}")
print(f"\nThe model MEMORIZED {acc_wrong - acc_right:.2%} of the training data.")
print(f"Only {acc_right:.2%} accuracy is real generalization.")
print(f"\nIf you deploy the model thinking it's {acc_wrong:.2%} accurate,")
print(f"it will actually perform at ~{acc_right:.2%} in the real exam hall.")
```

---

## Summary

```
+--------------------------------------------+
|         TRAIN-TEST SPLIT CHECKLIST         |
+--------------------------------------------+
|                                            |
| [ ] Split BEFORE any preprocessing        |
| [ ] Use stratify=y for imbalanced data    |
| [ ] NEVER test on training data           |
| [ ] Augment ONLY the training set         |
| [ ] Consider splitting by hall/session    |
| [ ] Use validation set for tuning         |
| [ ] Use test set ONCE for final eval      |
| [ ] Typical split: 70/15/15 or 80/20     |
|                                            |
+--------------------------------------------+
```
