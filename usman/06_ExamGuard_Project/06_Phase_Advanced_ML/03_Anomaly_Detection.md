# Anomaly Detection — Catching What You Have Never Seen Before

## What Is This?

Anomaly detection means finding things that DO NOT FIT the normal pattern.

Think of a school classroom:
- 29 students wearing uniforms → NORMAL
- 1 student wearing a clown costume → ANOMALY

You did not need to be trained on "clown costumes." You just know it does not fit.

**Anomaly detection in AI works the same way.** Train on normal. Anything different = flagged.

---

## WHY ExamGuard Needs This

### The Limitation of Classification

A classifier says: "Is this cheating method A, B, or C?"

But what about cheating method D, E, F that you NEVER trained on?

```
Trained to detect:              Cannot detect:
- Looking at neighbor           - Morse code tapping
- Using phone                   - Smartwatch cheating
- Passing notes                 - Coded cough patterns
- Hidden earpiece               - Invisible ink
- Writing on hand               - Shoe camera
```

**Cheaters are CREATIVE.** New methods appear every exam season.

### The Anomaly Detection Solution

Instead of asking "Is this cheating method X?" ask "Is this NORMAL?"

```
Normal student behavior:
- Writing on paper
- Looking at own paper
- Occasional look up (thinking)
- Stretching
- Drinking water
- Flipping pages

ANYTHING significantly different from this list → FLAG IT
```

Now it catches EVERYTHING unusual, including methods you never imagined.

---

## Three Approaches to Anomaly Detection

### Approach 1: Autoencoder-Based (Best for ExamGuard)

You already learned this in the previous file. Quick recap:

```
Train autoencoder on normal behavior
    ↓
Feed new video frame
    ↓
Measure reconstruction error
    ↓
High error = anomaly
```

**Best for:** Image and video data (ExamGuard's main use case)

### Approach 2: Isolation Forest

**The idea:** Normal data points are SURROUNDED by other normal points. Anomalies are ISOLATED — far away from everything else.

```
Imagine a scatter plot:

    Normal points:        Anomaly:
    * * * *                          *  (all alone!)
    * * * * *
    * * * * *
    * * * *

The lonely point is easy to ISOLATE — it takes fewer splits to separate it.
```

**How it works:**
1. Randomly pick a feature (like "head angle")
2. Randomly pick a split value
3. Repeat until each point is isolated
4. Points that get isolated QUICKLY = anomalies (they are far from others)
5. Points that take MANY splits to isolate = normal (surrounded by similar points)

```python
from sklearn.ensemble import IsolationForest

# Features: [head_angle, body_lean, hand_position, gaze_direction]
normal_data = [...]  # 10,000 samples of normal behavior features

# Train
model = IsolationForest(contamination=0.05)  # Expect 5% anomalies
model.fit(normal_data)

# Test
new_sample = [45, 12, 3, 7]  # Features from a new frame
result = model.predict([new_sample])
# result = 1 → Normal
# result = -1 → ANOMALY
```

**Best for:** Tabular/numerical data (feature vectors extracted from video)

### Approach 3: One-Class SVM

**The idea:** Draw a BOUNDARY around all normal data. Anything outside the boundary = anomaly.

```
Think of it like drawing a circle around normal data:

         /----------\
        / * * * *    \
       | * * * * *    |    X  ← Anomaly (outside circle)
       | * * * * *    |
        \ * * * *    /
         \----------/
```

```python
from sklearn.svm import OneClassSVM

# Train on normal data only
model = OneClassSVM(kernel='rbf', gamma='auto', nu=0.05)
model.fit(normal_data)

# Test
result = model.predict([new_sample])
# result = 1 → Inside boundary → Normal
# result = -1 → Outside boundary → ANOMALY
```

**Best for:** When you have clean normal data and clear boundaries

---

## ExamGuard: Combining All Three

In a real system, you do not pick just one. You COMBINE them:

```
Video frame
    ↓
Extract features (CNN)
    ↓
┌─────────────────────────────────────────┐
│  Autoencoder: Reconstruction error = 0.3 │ → Suspicious
│  Isolation Forest: Score = -0.8          │ → Anomaly
│  One-Class SVM: Prediction = -1          │ → Anomaly
└─────────────────────────────────────────┘
    ↓
2 out of 3 say anomaly → FLAG IT
```

This "ensemble" approach reduces false alarms because all methods must agree.

---

## The Biggest Challenge: Setting the Threshold

### Too Sensitive (Threshold Too Low)
```
Threshold: 0.05

Normal student scratches head    → Error: 0.06 → ALERT!  (false alarm)
Normal student drops pen         → Error: 0.07 → ALERT!  (false alarm)
Normal student yawns             → Error: 0.08 → ALERT!  (false alarm)
Actual cheater passing notes     → Error: 0.15 → ALERT!  (correct)

Result: 100 alerts per hour, 97 are false alarms.
Invigilator ignores ALL alerts because too many false ones.
The 3 real ones get missed!
```

### Too Loose (Threshold Too High)
```
Threshold: 0.50

Normal student scratches head    → Error: 0.06 → OK      (correct)
Student tapping Morse code       → Error: 0.25 → OK      (MISSED!)
Student using hidden earpiece    → Error: 0.35 → OK      (MISSED!)
Student openly copying           → Error: 0.65 → ALERT!  (correct)

Result: Only catches obvious cheating. Subtle methods slip through.
```

### The Sweet Spot
```
Threshold: 0.15

Normal student scratches head    → Error: 0.06 → OK      (correct)
Normal student drops pen         → Error: 0.07 → OK      (correct)
Student tapping Morse code       → Error: 0.25 → ALERT!  (correct)
Student using hidden earpiece    → Error: 0.35 → ALERT!  (correct)

Result: Catches unusual behavior, ignores normal quirks.
Maybe 5-10 alerts per hour, most are worth investigating.
```

### How to Find the Right Threshold

```python
import numpy as np

# Step 1: Get reconstruction errors for ALL normal validation data
normal_errors = []
for sample in normal_validation_set:
    error = calculate_reconstruction_error(model, sample)
    normal_errors.append(error)

# Step 2: Look at the distribution
print(f"Mean error: {np.mean(normal_errors):.4f}")
print(f"Std error: {np.std(normal_errors):.4f}")
print(f"95th percentile: {np.percentile(normal_errors, 95):.4f}")
print(f"99th percentile: {np.percentile(normal_errors, 99):.4f}")

# Step 3: Set threshold at 95th or 99th percentile
# 95th → 5% of normal data flagged (more sensitive, more false alarms)
# 99th → 1% of normal data flagged (less sensitive, fewer false alarms)
threshold = np.percentile(normal_errors, 97)  # 3% false alarm rate
```

---

## Real ExamGuard Anomaly Examples

### True Anomalies (Should Be Caught)
```
Behavior                              Why It Is Anomalous
───────────────────────────────────────────────────────────
Rhythmic desk tapping                 No normal student taps for 30+ seconds
Repeated ear touching                 Normal = occasional scratch. This = every 10 seconds
Hand under desk for extended time     Normal = adjusting. This = 2+ minutes
Synchronized movements with neighbor  Two students moving in sync = coordination
Looking at same spot on wall          Could be hidden notes on wall
Frequent bathroom requests            3+ times in 1 hour exam
```

### False Alarms (Should NOT Be Caught)
```
Behavior                              Why It Looks Anomalous But Is Not
──────────────────────────────────────────────────────────────────────
Student with disability               Different posture is NORMAL for them
Student who fidgets                   Some people naturally fidget a lot
Student having anxiety attack         Unusual behavior but not cheating
Left-handed student                   Different arm position than most
Student wearing cast                  Different body movement
Very tall student                     Looks different in frame
```

**This is why human-in-the-loop is ESSENTIAL.** AI flags, human decides.

---

## What You Need to Learn

### Concept 1: What Makes a Good "Normal" Dataset
- Must be LARGE (10,000+ samples minimum)
- Must be DIVERSE (different students, different halls, different lighting)
- Must be CLEAN (no cheating behavior mixed in)
- Must represent ALL normal behaviors (writing, thinking, stretching, etc.)

### Concept 2: Feature Engineering for Anomaly Detection
```python
# What features to extract from each frame?
features = {
    'head_angle_x': 15.2,        # Head tilt left/right
    'head_angle_y': -5.1,        # Head tilt up/down
    'body_lean': 3.4,            # How much body is leaning
    'hand_position_x': 120,      # Where is the dominant hand
    'hand_position_y': 85,       # Vertical hand position
    'gaze_direction': 'paper',   # Where student is looking
    'movement_speed': 2.1,       # How fast student is moving
    'mouth_open': False,         # Is mouth open (talking?)
    'neighbor_distance': 45,     # Distance to nearest neighbor
}
```

### Concept 3: Evaluation Metrics
```
True Positive  (TP): AI says anomaly, it IS anomaly     → GOOD
True Negative  (TN): AI says normal, it IS normal       → GOOD
False Positive (FP): AI says anomaly, it is NORMAL       → BAD (false alarm)
False Negative (FN): AI says normal, it IS anomaly       → VERY BAD (missed cheating)

Precision = TP / (TP + FP)  → "When AI says anomaly, how often is it right?"
Recall    = TP / (TP + FN)  → "Of all real anomalies, how many did AI catch?"

For ExamGuard: Recall is MORE important than precision.
Missing a cheater (FN) is WORSE than a false alarm (FP).
```

---

## Mini Project: Credit Card Fraud Detection

This is the CLASSIC anomaly detection problem. Perfect practice for ExamGuard.

### Goal
Detect fraudulent credit card transactions using anomaly detection.

### Step-by-Step

**Step 1: Get the Data**
```python
# Kaggle dataset: "Credit Card Fraud Detection"
# Download from: https://www.kaggle.com/mlg-ulb/creditcardfraud
import pandas as pd
from sklearn.model_selection import train_test_split

data = pd.read_csv('creditcard.csv')
print(f"Total transactions: {len(data)}")
print(f"Fraud cases: {data['Class'].sum()}")
print(f"Fraud percentage: {data['Class'].mean()*100:.2f}%")
# Usually around 0.17% — very imbalanced, just like ExamGuard!
```

**Step 2: Prepare Data**
```python
# Separate normal and fraud
normal = data[data['Class'] == 0]
fraud = data[data['Class'] == 1]

# Use only normal data for training (anomaly detection style)
X_train = normal.drop('Class', axis=1).values[:200000]  # Train on normal
X_val_normal = normal.drop('Class', axis=1).values[200000:]  # Validate normal
X_val_fraud = fraud.drop('Class', axis=1).values  # Validate fraud
```

**Step 3: Try Isolation Forest**
```python
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report

model = IsolationForest(contamination=0.01, random_state=42)
model.fit(X_train)

# Test on normal data
normal_preds = model.predict(X_val_normal)
print(f"Normal detected as normal: {(normal_preds == 1).sum()}")
print(f"Normal detected as fraud (false alarms): {(normal_preds == -1).sum()}")

# Test on fraud data
fraud_preds = model.predict(X_val_fraud)
print(f"Fraud detected as fraud: {(fraud_preds == -1).sum()}")
print(f"Fraud detected as normal (MISSED): {(fraud_preds == 1).sum()}")
```

**Step 4: Try Autoencoder**
```python
import torch
import torch.nn as nn

class FraudAutoencoder(nn.Module):
    def __init__(self, input_dim):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 16),
            nn.ReLU()
        )
        self.decoder = nn.Sequential(
            nn.Linear(16, 32),
            nn.ReLU(),
            nn.Linear(32, 64),
            nn.ReLU(),
            nn.Linear(64, input_dim),
        )

    def forward(self, x):
        return self.decoder(self.encoder(x))

# Train on normal transactions only
# Test: fraud transactions should have HIGH reconstruction error
```

**Step 5: Compare Methods**
```python
# Which method catches more fraud with fewer false alarms?
# Try: Isolation Forest, One-Class SVM, Autoencoder
# Measure precision and recall for each
# The best one = your go-to for ExamGuard
```

### What This Teaches You
- Working with imbalanced data (rare events, just like cheating)
- Setting and tuning thresholds
- Measuring precision vs recall trade-off
- Comparing different anomaly detection methods

---

## Connection to ExamGuard

| Credit Card Fraud | ExamGuard |
|---|---|
| Normal transactions = purchases | Normal behavior = writing, reading |
| Fraud = unusual transactions | Cheating = unusual behavior |
| Train on normal transactions | Train on normal exam footage |
| High reconstruction error = fraud | High reconstruction error = suspicious |
| 0.17% fraud rate | Maybe 1-5% cheating rate |
| Cannot predict new fraud types | Cannot predict new cheating methods |
| Anomaly detection catches new types | Anomaly detection catches new methods |

---

## Key Takeaways

1. **Anomaly detection finds the UNKNOWN** — catches cheating methods never seen before
2. **Three main approaches** — Autoencoder (images), Isolation Forest (features), One-Class SVM (boundaries)
3. **Threshold is everything** — too sensitive means too many false alarms, too loose means missed catches
4. **Combine multiple methods** — ensemble approach reduces errors
5. **Human-in-the-loop is essential** — AI flags, human investigates and decides
6. **Start with credit card fraud** — classic problem, same concepts apply to ExamGuard
