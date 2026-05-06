# Evaluation Metrics

## What Are Evaluation Metrics?

Evaluation metrics are **measurements that tell you how good your model actually is**. They answer the question: "Is this model ready for the real world?"

You wouldn't buy a car just because the salesman says "it's great." You'd check the mileage, safety rating, and reliability scores. Same with ML models - you need objective measurements.

---

## Why Evaluation Metrics Matter for ExamGuard

### The Accuracy Trap

Here's a scenario that trips up every beginner:

```
ExamGuard dataset:
  - 9,900 normal clips (99%)
  - 100 cheating clips (1%)

You build a model. It predicts "NOT CHEATING" for EVERY SINGLE clip.

Accuracy = 9,900 correct / 10,000 total = 99% accuracy!

But the model caught ZERO cheating. It's completely useless.
```

**99% accuracy. 0% useful.** This is why accuracy alone is DANGEROUS for ExamGuard.

You need metrics that answer specific questions:

| Question | Metric | ExamGuard Meaning |
|---|---|---|
| How often is the model correct overall? | **Accuracy** | Basic, but misleading for imbalanced data |
| Of all alerts sent, how many were real cheating? | **Precision** | Avoid bothering invigilators with false alarms |
| Of all real cheating, how much did we catch? | **Recall** | Don't miss actual cheating |
| What's the balance of precision and recall? | **F1 Score** | Overall model quality for ExamGuard |

---

## The Confusion Matrix: Foundation of All Metrics

Every prediction falls into one of four categories:

```
                        ACTUAL
                   Cheating    Normal
                 +----------+----------+
    Predicted    |   TRUE   |  FALSE   |
    Cheating     | POSITIVE | POSITIVE |
                 |   (TP)   |   (FP)   |
                 +----------+----------+
    Predicted    |  FALSE   |   TRUE   |
    Normal       | NEGATIVE | NEGATIVE |
                 |   (FN)   |   (TN)   |
                 +----------+----------+
```

### ExamGuard Examples:

**True Positive (TP) - Correct Alert:**
> Model says: "Cheating!" → Student WAS actually cheating.
> This is what we want!

**False Positive (FP) - False Alarm:**
> Model says: "Cheating!" → Student was just scratching their head.
> Invigilator walks over for nothing. Annoying but not dangerous.

**True Negative (TN) - Correct Silence:**
> Model says: "Normal" → Student IS writing normally.
> Good - no unnecessary alert.

**False Negative (FN) - Missed Cheating:**
> Model says: "Normal" → Student WAS actually cheating with a phone!
> THE WORST OUTCOME. We missed real cheating.

### With Numbers:

```
ExamGuard tested on 2,000 clips (1,900 normal + 100 cheating)

                        ACTUAL
                   Cheating    Normal
                 +----------+----------+
    Predicted    |    85    |    30    |  → 115 alerts sent
    Cheating     |   (TP)   |   (FP)  |
                 +----------+----------+
    Predicted    |    15    |  1,870   |  → 1,885 no alert
    Normal       |   (FN)   |   (TN)  |
                 +----------+----------+
                    100         1,900

Results:
  - 85 cheaters caught correctly (TP)
  - 30 false alarms (FP) - students wrongly flagged
  - 15 cheaters MISSED (FN) - real cheating went undetected
  - 1,870 normal correctly ignored (TN)
```

---

## The Metrics Explained

### Accuracy

```
Accuracy = (TP + TN) / (TP + FP + FN + TN)
         = (85 + 1,870) / 2,000
         = 97.75%
```

Sounds great, but remember: a model that ALWAYS says "normal" would get 95% accuracy. So 97.75% is only slightly better than doing nothing.

**ExamGuard verdict:** Useful as a baseline, but NEVER rely on accuracy alone.

### Precision

```
Precision = TP / (TP + FP)
          = 85 / (85 + 30)
          = 73.9%

"Of all alerts we sent, 73.9% were real cheating"
"26.1% of our alerts were false alarms"
```

**ExamGuard meaning:** If precision is too low, invigilators get flooded with false alarms and start ignoring ALL alerts. We want precision to be high (>80%).

**Think of it as:** "How much can the invigilator TRUST our alerts?"

### Recall (Sensitivity)

```
Recall = TP / (TP + FN)
       = 85 / (85 + 15)
       = 85.0%

"We caught 85% of all real cheating"
"We MISSED 15% of real cheating"
```

**ExamGuard meaning:** If recall is too low, cheating goes undetected. We want recall to be very high (>90%).

**Think of it as:** "How much cheating are we actually catching?"

### F1 Score

```
F1 = 2 × (Precision × Recall) / (Precision + Recall)
   = 2 × (0.739 × 0.850) / (0.739 + 0.850)
   = 79.0%

F1 is the harmonic mean of precision and recall.
It's only high when BOTH precision and recall are high.
```

**ExamGuard meaning:** F1 gives you ONE number that balances "don't cry wolf" (precision) with "don't miss anything" (recall).

**Think of it as:** "Overall, how good is our detection system?"

---

## The Precision-Recall Tradeoff

You can't maximize both. Here's why:

```
HIGH THRESHOLD (e.g., alert only if >95% confident):
  → Very few alerts sent
  → Almost all alerts are real cheating (HIGH PRECISION)
  → But many cheating incidents below 95% are missed (LOW RECALL)

LOW THRESHOLD (e.g., alert if >30% confident):
  → Many alerts sent
  → Catches almost all cheating (HIGH RECALL)
  → But lots of false alarms (LOW PRECISION)
```

### ExamGuard Threshold Examples:

| Threshold | Alerts Sent | Precision | Recall | F1 | Effect |
|---|---|---|---|---|---|
| 0.30 | 500 | 20% | 98% | 33% | Catch everything but too many false alarms |
| 0.50 | 200 | 45% | 92% | 60% | Still too many false alarms |
| 0.70 | 115 | 74% | 85% | 79% | Good balance |
| 0.80 | 80 | 88% | 70% | 78% | Fewer false alarms but missing cheating |
| 0.95 | 30 | 97% | 29% | 45% | Almost no false alarms but missing most cheating |

**For ExamGuard, a threshold around 0.70-0.80 is usually best.** You want to catch most cheating (recall > 80%) without overwhelming invigilators with false alarms (precision > 70%).

---

## Which Metric Matters Most for ExamGuard?

```
Priority order for ExamGuard:

1. RECALL (most important)
   → Missing real cheating is the WORST outcome
   → Target: > 85%

2. PRECISION (second most important)
   → Too many false alarms = invigilators ignore the system
   → Target: > 70%

3. F1 SCORE (overall quality)
   → Balance of the above
   → Target: > 75%

4. ACCURACY (least useful for ExamGuard)
   → Misleading with imbalanced data
   → Don't optimize for this
```

### Why recall matters more:

```
Scenario A: Miss 1 real cheater (low recall)
  → That student gets an unfair advantage
  → Other students suffer
  → System has failed its core purpose

Scenario B: 10 extra false alarms (low precision)
  → Invigilator checks 10 innocent students
  → Annoying but no one is harmed
  → System still works, just noisily
```

Missing cheating is WORSE than false alarms. So we prioritize recall, then optimize precision.

---

## Implementing Evaluation in Code

```python
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report
)
import numpy as np

# Simulated predictions
np.random.seed(42)
y_true = np.array([0]*1900 + [1]*100)  # Actual labels
y_pred = np.array([0]*1870 + [1]*30 + [1]*85 + [0]*15)  # Predictions

# All metrics at once
print("=== ExamGuard Model Evaluation ===\n")
print(f"Accuracy:  {accuracy_score(y_true, y_pred):.2%}")
print(f"Precision: {precision_score(y_true, y_pred):.2%}")
print(f"Recall:    {recall_score(y_true, y_pred):.2%}")
print(f"F1 Score:  {f1_score(y_true, y_pred):.2%}")

# Confusion Matrix
print(f"\nConfusion Matrix:")
cm = confusion_matrix(y_true, y_pred)
print(f"  TN={cm[0][0]}  FP={cm[0][1]}")
print(f"  FN={cm[1][0]}  TP={cm[1][1]}")

# Full report
print(f"\nFull Classification Report:")
print(classification_report(y_true, y_pred,
                            target_names=["Normal", "Cheating"]))
```

---

## Mini Project: Evaluate Different Thresholds

```python
"""
Mini Project: Find the Best Alert Threshold for ExamGuard
Practice: Precision, recall, F1, threshold selection
"""
import numpy as np

np.random.seed(42)

# Simulate model confidence scores for 2000 test clips
n_normal = 1900
n_cheating = 100

# Normal behavior: high confidence of being normal (low suspicion)
normal_scores = np.random.beta(2, 8, n_normal)  # Mostly low scores

# Cheating behavior: higher suspicion scores
cheating_scores = np.random.beta(5, 3, n_cheating)  # Mostly higher scores

all_scores = np.concatenate([normal_scores, cheating_scores])
all_labels = np.array([0]*n_normal + [1]*n_cheating)

# Try different thresholds
print("=== ExamGuard Threshold Analysis ===\n")
print(f"{'Threshold':>10} {'Alerts':>7} {'Precision':>10} {'Recall':>8} {'F1':>6}")
print("-" * 50)

best_f1 = 0
best_threshold = 0

for threshold in np.arange(0.1, 0.95, 0.05):
    predictions = (all_scores >= threshold).astype(int)

    tp = np.sum((predictions == 1) & (all_labels == 1))
    fp = np.sum((predictions == 1) & (all_labels == 0))
    fn = np.sum((predictions == 0) & (all_labels == 1))

    alerts = tp + fp
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    marker = ""
    if f1 > best_f1:
        best_f1 = f1
        best_threshold = threshold
        marker = " <-- best F1"

    print(f"{threshold:>10.2f} {alerts:>7} {precision:>10.1%} {recall:>8.1%} {f1:>6.1%}{marker}")

print(f"\nBest threshold: {best_threshold:.2f} (F1 = {best_f1:.1%})")
print(f"\nRecommendation: Use threshold {best_threshold:.2f} for ExamGuard")
```

---

## Key Takeaways

```
+------------------------------------------------------+
|  EXAMGUARD EVALUATION RULES                          |
+------------------------------------------------------+
|                                                      |
|  1. NEVER rely on accuracy alone (99% can be useless)|
|  2. Precision = "Can invigilators trust alerts?"     |
|  3. Recall = "Are we catching enough cheating?"      |
|  4. F1 = "Overall system quality"                    |
|  5. Recall > Precision for ExamGuard (missing        |
|     cheating is worse than false alarms)             |
|  6. Always look at the confusion matrix              |
|  7. Try different thresholds to find the sweet spot  |
|                                                      |
+------------------------------------------------------+
```
