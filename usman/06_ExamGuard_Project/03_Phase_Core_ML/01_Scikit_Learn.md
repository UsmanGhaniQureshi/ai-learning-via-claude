# Scikit-Learn - The ML Library

## What is Scikit-Learn?

Scikit-Learn (often written as `sklearn`) is THE machine learning library for Python. It contains all the classic ML algorithms in one package, with a simple, consistent interface.

Think of it as a toolbox: you pick a model, give it data, and it learns.

```python
from sklearn.ensemble import RandomForestClassifier

model = RandomForestClassifier()
model.fit(X_train, y_train)        # Train
predictions = model.predict(X_test) # Predict

# That's it. Three lines to train and use an ML model.
```

---

## Why Scikit-Learn Matters for ExamGuard

### Before Deep Learning, Start Simple

You DON'T jump straight to YOLO and CNN. First, you learn ML fundamentals with Scikit-Learn:

```
Learning path:
  Scikit-Learn (simple models, learn the workflow)
      ↓
  PyTorch/TensorFlow (deep learning models, same workflow but more powerful)
      ↓
  YOLO, CNN, LSTM (specialized models for ExamGuard)
```

### What Scikit-Learn teaches you:
- How to train ANY model (the workflow is the same everywhere)
- How to evaluate models (accuracy, precision, recall)
- How to preprocess data (scaling, encoding)
- How to avoid common mistakes (overfitting, data leakage)

### ExamGuard uses Scikit-Learn for:
- **Initial experiments** - Test if simple models can distinguish cheating from normal behavior
- **Feature engineering** - Create and test features before using deep learning
- **Evaluation** - All metrics (accuracy, precision, recall, F1) come from sklearn
- **Data splitting** - train_test_split is from sklearn
- **Preprocessing** - Scaling, normalizing data before feeding to any model
- **Baselines** - "Can a simple model do this? If yes, maybe we don't need deep learning."

---

## What to Learn

### 1. The Universal ML Workflow

Every ML model in Scikit-Learn follows the SAME pattern:

```python
# Step 1: Import the model
from sklearn.tree import DecisionTreeClassifier

# Step 2: Create the model
model = DecisionTreeClassifier()

# Step 3: Train the model
model.fit(X_train, y_train)

# Step 4: Make predictions
predictions = model.predict(X_test)

# Step 5: Evaluate
from sklearn.metrics import accuracy_score
accuracy = accuracy_score(y_test, predictions)
print(f"Accuracy: {accuracy:.2%}")
```

**This is the same for EVERY model.** Change the import, everything else stays the same:

```python
# Decision Tree
from sklearn.tree import DecisionTreeClassifier
model = DecisionTreeClassifier()

# Random Forest
from sklearn.ensemble import RandomForestClassifier
model = RandomForestClassifier()

# SVM
from sklearn.svm import SVC
model = SVC()

# KNN
from sklearn.neighbors import KNeighborsClassifier
model = KNeighborsClassifier()

# ALL use: model.fit(X_train, y_train) → model.predict(X_test)
```

### 2. Key Functions

```python
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

# Split data: 80% train, 20% test
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Scale features (important for many models)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)  # Use same scaler!

# Train
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train_scaled, y_train)

# Predict and evaluate
predictions = model.predict(X_test_scaled)
print(f"Accuracy: {accuracy_score(y_test, predictions):.2%}")
print(classification_report(y_test, predictions))
print(confusion_matrix(y_test, predictions))
```

### 3. A Complete ExamGuard Example

Let's say you have extracted FEATURES from video clips (before using deep learning):

```python
"""
ExamGuard: Simple Cheating Detection with Scikit-Learn
Features extracted from video clips:
  - avg_gaze_deviation: How much the student looks away from their paper
  - head_movement_freq: How often they move their head
  - hand_movement_range: How far their hands move from the desk
  - stillness_duration: Longest period of no movement
  - neighbor_proximity_score: How close to their neighbor's space
"""
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score

# Simulated feature data
np.random.seed(42)
n_normal = 900
n_cheating = 100

# Normal students: low gaze deviation, low head movement
normal = np.column_stack([
    np.random.normal(10, 5, n_normal),   # gaze_deviation
    np.random.normal(3, 2, n_normal),    # head_movement
    np.random.normal(5, 3, n_normal),    # hand_movement
    np.random.normal(30, 10, n_normal),  # stillness
    np.random.normal(2, 1, n_normal),    # neighbor_proximity
])

# Cheating students: high gaze deviation, high head movement
cheating = np.column_stack([
    np.random.normal(35, 10, n_cheating),  # gaze_deviation
    np.random.normal(15, 5, n_cheating),   # head_movement
    np.random.normal(15, 5, n_cheating),   # hand_movement
    np.random.normal(10, 5, n_cheating),   # stillness
    np.random.normal(7, 2, n_cheating),    # neighbor_proximity
])

# Combine
X = np.vstack([normal, cheating])
y = np.array([0] * n_normal + [1] * n_cheating)  # 0=normal, 1=cheating

# Split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Train
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Evaluate
predictions = model.predict(X_test)
print(f"Accuracy: {accuracy_score(y_test, predictions):.2%}")
print("\nDetailed Report:")
print(classification_report(y_test, predictions,
                            target_names=["Normal", "Cheating"]))

# Feature importance (which features matter most?)
feature_names = ["gaze_dev", "head_move", "hand_move", "stillness", "neighbor"]
importances = model.feature_importances_
for name, imp in sorted(zip(feature_names, importances), key=lambda x: -x[1]):
    print(f"  {name}: {imp:.3f}")
```

**ExamGuard connection:** This shows the COMPLETE ML workflow that you'll use for every model, just with more complex features and models later.

---

## Mini Project: Build a Simple Cheating Classifier

```python
"""
Mini Project: ExamGuard Simple Classifier
Try 4 different models and compare them.
"""
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, f1_score
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier

# Generate data (same as above)
np.random.seed(42)
normal = np.column_stack([
    np.random.normal(10, 5, 900),
    np.random.normal(3, 2, 900),
    np.random.normal(5, 3, 900),
])
cheating = np.column_stack([
    np.random.normal(30, 10, 100),
    np.random.normal(12, 5, 100),
    np.random.normal(14, 5, 100),
])

X = np.vstack([normal, cheating])
y = np.array([0] * 900 + [1] * 100)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

# Try 4 models
models = {
    "Decision Tree": DecisionTreeClassifier(random_state=42),
    "Random Forest": RandomForestClassifier(n_estimators=100, random_state=42),
    "SVM": SVC(random_state=42),
    "KNN (k=5)": KNeighborsClassifier(n_neighbors=5),
}

print("=== ExamGuard Model Comparison ===\n")
print(f"{'Model':<20} {'Accuracy':>10} {'F1 Score':>10}")
print("-" * 42)

for name, model in models.items():
    model.fit(X_train_s, y_train)
    preds = model.predict(X_test_s)
    acc = accuracy_score(y_test, preds)
    f1 = f1_score(y_test, preds)
    print(f"{name:<20} {acc:>10.2%} {f1:>10.3f}")

print("\nBest model for ExamGuard: Pick highest F1 score")
print("(F1 matters more than accuracy for imbalanced data!)")
```

---

## Key Scikit-Learn Functions

```python
# Data Splitting
train_test_split(X, y, test_size=0.2, stratify=y)

# Preprocessing
StandardScaler()                   # Normalize features
LabelEncoder()                     # Convert text labels to numbers

# Models
DecisionTreeClassifier()           # Simple, interpretable
RandomForestClassifier()           # Powerful, handles many features
SVC()                              # Support Vector Machine
KNeighborsClassifier()             # Instance-based learning

# Training and Prediction
model.fit(X_train, y_train)        # Train
model.predict(X_test)              # Predict
model.predict_proba(X_test)        # Probability scores

# Evaluation
accuracy_score(y_true, y_pred)     # Overall accuracy
f1_score(y_true, y_pred)           # Balance of precision/recall
classification_report()            # Complete report
confusion_matrix()                 # Detailed breakdown
```

---

## From Scikit-Learn to Deep Learning

```
Scikit-Learn:
  model = RandomForestClassifier()
  model.fit(X_train, y_train)
  preds = model.predict(X_test)

PyTorch (Deep Learning):
  model = CNN()                    # Different model definition
  for epoch in range(100):         # Training loop (more control)
      output = model(X_train)
      loss = criterion(output, y_train)
      loss.backward()
      optimizer.step()
  preds = model(X_test)

The WORKFLOW is the same: prepare data → train → predict → evaluate.
Deep learning just gives you more control over the training process.
```

Scikit-Learn is where you learn the workflow. Deep learning is where you apply it to complex problems like computer vision.
