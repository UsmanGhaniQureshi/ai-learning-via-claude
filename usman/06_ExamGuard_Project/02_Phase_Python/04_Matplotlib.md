# Matplotlib - Charts and Graphs in Python

## What is Matplotlib?

Matplotlib is a Python library for creating **charts, graphs, and visualizations**. It turns numbers into pictures so you can understand data at a glance.

```python
import matplotlib.pyplot as plt

# That's it - you can now make any chart
```

---

## Why Matplotlib Matters for ExamGuard

You need to SEE your data and your model's performance. Numbers alone don't tell the full story.

| What You Need to See | Chart Type | Why |
|---|---|---|
| Class distribution (normal vs cheating) | Bar chart | Check if data is imbalanced |
| Model accuracy over training | Line plot | See if model is learning |
| Loss curve during training | Line plot | Detect overfitting |
| Detection confidence distribution | Histogram | Are scores clustered high or spread out? |
| Precision vs Recall tradeoff | Line plot | Find the best confidence threshold |
| Alerts per hour during an exam | Bar chart | Understand system behavior |
| Confusion matrix | Heatmap | See what the model gets right and wrong |

**Without visualization, you're training blind.** Every ML engineer uses Matplotlib constantly.

---

## What to Learn

### 1. Line Plots (Training Curves)

The most common chart in ML: plotting how your model improves over training.

```python
import matplotlib.pyplot as plt

# Simulated training data
epochs = list(range(1, 101))
train_accuracy = [0.50 + 0.004 * e + 0.001 * (e % 5) for e in epochs]  # Improving
val_accuracy = [0.48 + 0.003 * e + 0.002 * (e % 7) for e in epochs]    # Slightly lower

# Cap at 1.0
train_accuracy = [min(a, 0.98) for a in train_accuracy]
val_accuracy = [min(a, 0.95) for a in val_accuracy]

plt.figure(figsize=(10, 6))
plt.plot(epochs, train_accuracy, label="Training Accuracy", color="blue")
plt.plot(epochs, val_accuracy, label="Validation Accuracy", color="orange")
plt.xlabel("Epoch")
plt.ylabel("Accuracy")
plt.title("ExamGuard Phone Detection - Training Progress")
plt.legend()
plt.grid(True)
plt.savefig("training_curve.png")
plt.show()
```

**ExamGuard connection:** You'll plot this for EVERY model you train. If training accuracy goes up but validation doesn't, your model is overfitting (memorizing instead of learning).

### 2. Bar Charts (Class Distribution)

```python
import matplotlib.pyplot as plt

# ExamGuard label distribution
labels = ["Normal", "Phone", "Looking\nNeighbor", "Passing\nNotes", "Other"]
counts = [9500, 200, 180, 70, 50]
colors = ["green", "red", "orange", "red", "orange"]

plt.figure(figsize=(10, 6))
plt.bar(labels, counts, color=colors)
plt.xlabel("Behavior Label")
plt.ylabel("Number of Clips")
plt.title("ExamGuard Training Data - Class Distribution")

# Add count labels on top of bars
for i, count in enumerate(counts):
    plt.text(i, count + 100, str(count), ha="center", fontweight="bold")

plt.savefig("class_distribution.png")
plt.show()

# The visual makes the imbalance problem OBVIOUS
# 9500 normal vs 200 phone - you can SEE the problem
```

**ExamGuard connection:** This chart instantly shows you the imbalanced data problem. 9500 normal clips vs just 200 phone clips. You can't miss it when it's visual.

### 3. Histograms (Confidence Distribution)

```python
import matplotlib.pyplot as plt
import numpy as np

# Simulated confidence scores
normal_confidence = np.random.normal(0.9, 0.05, 1000)    # Normal: high confidence
cheating_confidence = np.random.normal(0.65, 0.15, 100)   # Cheating: lower, more spread

plt.figure(figsize=(10, 6))
plt.hist(normal_confidence, bins=30, alpha=0.7, label="Normal", color="green")
plt.hist(cheating_confidence, bins=30, alpha=0.7, label="Cheating", color="red")
plt.xlabel("Confidence Score")
plt.ylabel("Frequency")
plt.title("ExamGuard - Detection Confidence Distribution")
plt.legend()
plt.axvline(x=0.75, color="black", linestyle="--", label="Threshold (0.75)")
plt.legend()
plt.savefig("confidence_distribution.png")
plt.show()

# This shows WHERE to set your alert threshold
# Too low = many false alarms. Too high = missed detections.
```

**ExamGuard connection:** Choose the confidence threshold by seeing where normal and cheating distributions overlap.

### 4. Scatter Plots (Feature Relationships)

```python
import matplotlib.pyplot as plt
import numpy as np

# Simulated: Gaze deviation vs. Head movement frequency
np.random.seed(42)

# Normal students
normal_gaze = np.random.normal(10, 5, 200)      # Low gaze deviation
normal_movement = np.random.normal(3, 2, 200)    # Low head movement

# Cheating students
cheat_gaze = np.random.normal(35, 10, 30)        # High gaze deviation
cheat_movement = np.random.normal(15, 5, 30)      # High head movement

plt.figure(figsize=(10, 6))
plt.scatter(normal_gaze, normal_movement, c="green", alpha=0.5, label="Normal")
plt.scatter(cheat_gaze, cheat_movement, c="red", alpha=0.7, label="Cheating")
plt.xlabel("Gaze Deviation (degrees)")
plt.ylabel("Head Movements per Minute")
plt.title("ExamGuard - Student Behavior Features")
plt.legend()
plt.grid(True)
plt.savefig("behavior_scatter.png")
plt.show()

# You can see that cheating students form a clear cluster!
```

**ExamGuard connection:** Visualize whether your features actually separate normal from cheating behavior. If they overlap completely, those features are useless.

### 5. Subplots (Multiple Charts Together)

```python
import matplotlib.pyplot as plt
import numpy as np

fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle("ExamGuard - Training Dashboard", fontsize=16)

# Top left: Accuracy curve
epochs = range(1, 51)
axes[0, 0].plot(epochs, np.cumsum(np.random.normal(0.01, 0.005, 50)).clip(0.5, 0.95))
axes[0, 0].set_title("Model Accuracy")
axes[0, 0].set_xlabel("Epoch")
axes[0, 0].set_ylabel("Accuracy")

# Top right: Loss curve
axes[0, 1].plot(epochs, np.cumsum(np.random.normal(-0.02, 0.01, 50)).clip(0.1, 2.0)[::-1])
axes[0, 1].set_title("Model Loss")
axes[0, 1].set_xlabel("Epoch")
axes[0, 1].set_ylabel("Loss")

# Bottom left: Class distribution
axes[1, 0].bar(["Normal", "Phone", "Gaze", "Notes", "Other"],
               [9500, 200, 180, 70, 50], color=["green", "red", "orange", "red", "orange"])
axes[1, 0].set_title("Class Distribution")

# Bottom right: Confidence histogram
axes[1, 1].hist(np.random.normal(0.85, 0.1, 1000), bins=30, color="blue", alpha=0.7)
axes[1, 1].set_title("Confidence Scores")
axes[1, 1].set_xlabel("Confidence")

plt.tight_layout()
plt.savefig("training_dashboard.png")
plt.show()
```

**ExamGuard connection:** During training, you'll have a dashboard showing multiple metrics at once.

---

## Mini Project: Plot a Model's Training History

```python
"""
Mini Project: Simulate and Plot ExamGuard Model Training
Practice: Line plots, subplots, labels, legends, saving figures
"""
import matplotlib.pyplot as plt
import numpy as np

np.random.seed(42)
epochs = 100

# Simulate realistic training curves
train_acc = []
val_acc = []
train_loss = []
val_loss = []

acc = 0.50
loss = 2.0

for e in range(epochs):
    # Accuracy improves, with noise
    acc += np.random.normal(0.004, 0.002)
    acc = min(acc, 0.97)
    train_acc.append(acc)
    val_acc.append(acc - np.random.uniform(0.02, 0.05))  # Validation slightly lower

    # Loss decreases, with noise
    loss -= np.random.normal(0.015, 0.005)
    loss = max(loss, 0.08)
    train_loss.append(loss)
    val_loss.append(loss + np.random.uniform(0.01, 0.05))  # Validation slightly higher

# Create the training report
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

# Plot 1: Accuracy
ax1.plot(range(1, epochs + 1), train_acc, label="Train Accuracy", color="blue")
ax1.plot(range(1, epochs + 1), val_acc, label="Validation Accuracy", color="orange")
ax1.set_xlabel("Epoch")
ax1.set_ylabel("Accuracy")
ax1.set_title("ExamGuard Phone Detector - Accuracy")
ax1.legend()
ax1.grid(True, alpha=0.3)

# Plot 2: Loss
ax2.plot(range(1, epochs + 1), train_loss, label="Train Loss", color="blue")
ax2.plot(range(1, epochs + 1), val_loss, label="Validation Loss", color="orange")
ax2.set_xlabel("Epoch")
ax2.set_ylabel("Loss")
ax2.set_title("ExamGuard Phone Detector - Loss")
ax2.legend()
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig("examguard_training_report.png", dpi=150)
plt.show()

# Print summary
print("=== Training Summary ===")
print(f"Final Training Accuracy: {train_acc[-1]:.2%}")
print(f"Final Validation Accuracy: {val_acc[-1]:.2%}")
print(f"Final Training Loss: {train_loss[-1]:.4f}")
print(f"Final Validation Loss: {val_loss[-1]:.4f}")
print(f"Overfit gap: {train_acc[-1] - val_acc[-1]:.2%}")

if train_acc[-1] - val_acc[-1] > 0.05:
    print("WARNING: Model may be overfitting (train >> validation)")
else:
    print("Good: Training and validation are close (no overfitting)")
```

### What this mini project teaches:

- **Line plots** - the bread and butter of ML visualization
- **Subplots** - showing multiple metrics side by side
- **Labels, legends, titles** - making charts readable
- **Saving figures** - export for reports
- **Interpreting curves** - understanding what the charts mean

---

## Charts You'll Make for ExamGuard

```
BEFORE TRAINING:
  - Class distribution bar chart (check imbalance)
  - Feature scatter plots (check separability)
  - Data quality histograms (check distributions)

DURING TRAINING:
  - Accuracy curve (is the model learning?)
  - Loss curve (is the loss going down?)
  - Learning rate schedule (if using LR scheduling)

AFTER TRAINING:
  - Confusion matrix heatmap (what does the model get right/wrong?)
  - Precision-Recall curve (find optimal threshold)
  - ROC curve (overall model quality)
  - Sample predictions (show actual frames with detections)
```

---

## Key Matplotlib Functions

```python
# Basic plotting
plt.plot(x, y)              # Line plot
plt.bar(x, y)               # Bar chart
plt.scatter(x, y)           # Scatter plot
plt.hist(data, bins=30)     # Histogram

# Customization
plt.xlabel("label")         # X-axis label
plt.ylabel("label")         # Y-axis label
plt.title("title")          # Chart title
plt.legend()                # Show legend
plt.grid(True)              # Show grid

# Multiple plots
fig, axes = plt.subplots(rows, cols)

# Saving
plt.savefig("filename.png", dpi=150)

# Display
plt.show()
```
