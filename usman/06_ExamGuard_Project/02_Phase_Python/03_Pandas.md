# Pandas - Data Tables in Python

## What is Pandas?

Pandas is a Python library for working with **data in tables** (rows and columns). Think of it as Excel, but inside Python, and much more powerful.

```python
import pandas as pd

# This is a DataFrame - Pandas' main data structure
data = pd.DataFrame({
    "student_id": [1, 2, 3, 4, 5],
    "score": [85, 72, 91, 65, 78],
    "passed": [True, True, True, True, True]
})

print(data)
#    student_id  score  passed
# 0           1     85    True
# 1           2     72    True
# 2           3     91    True
# 3           4     65    True
# 4           5     78    True
```

---

## Why Pandas Matters for ExamGuard

Before you train ANY model, you need to understand your data. Pandas is how you load, explore, clean, and prepare data.

### ExamGuard Data Example

Imagine you have 10,000 labeled video clips for training. The metadata is stored in a CSV file:

```
clip_id,filename,label,duration_sec,camera_id,hall_id,student_position,confidence
1,clip_0001.mp4,normal,30,cam_1,hall_A,row2_seat5,0.95
2,clip_0002.mp4,phone_detected,30,cam_2,hall_A,row3_seat7,0.88
3,clip_0003.mp4,normal,30,cam_1,hall_A,row1_seat3,0.97
4,clip_0004.mp4,looking_at_neighbor,30,cam_3,hall_B,row4_seat2,0.72
5,clip_0005.mp4,normal,30,cam_2,hall_B,row2_seat8,0.93
...
```

Pandas lets you ask questions like:
- How many cheating clips vs normal clips? (imbalance check)
- Which camera catches the most suspicious behavior?
- What's the average confidence score per label?
- Are there any missing or corrupted entries?

---

## What to Learn

### 1. Reading Data (Loading a CSV file)

```python
import pandas as pd

# Load the dataset
df = pd.read_csv("exam_clips_metadata.csv")

# Quick look at the data
print(df.head())          # First 5 rows
print(df.shape)           # (10000, 8) → 10,000 rows, 8 columns
print(df.info())          # Data types and missing values
print(df.describe())      # Statistics for numeric columns
```

**ExamGuard connection:** Before training any model, you MUST load and understand your dataset.

### 2. Exploring Data

```python
# How many clips per label?
print(df["label"].value_counts())
# normal               9500
# phone_detected        200
# looking_at_neighbor   180
# passing_notes          70
# other_suspicious       50

# PROBLEM! 9500 normal vs 500 total cheating = extremely imbalanced!
# This is the imbalanced data problem we discussed.
```

**ExamGuard connection:** This is how you discover the class imbalance problem BEFORE it ruins your model.

### 3. Filtering Rows

```python
# Get only cheating clips
cheating = df[df["label"] != "normal"]
print(f"Cheating clips: {len(cheating)}")

# Get high-confidence detections only
high_conf = df[df["confidence"] >= 0.80]
print(f"High confidence: {len(high_conf)}")

# Get clips from a specific camera
cam2_clips = df[df["camera_id"] == "cam_2"]
print(f"Camera 2 clips: {len(cam2_clips)}")

# Combine filters: cheating + high confidence
reliable_cheating = df[(df["label"] != "normal") & (df["confidence"] >= 0.80)]
print(f"Reliable cheating clips: {len(reliable_cheating)}")
```

**ExamGuard connection:** Filter your training data to find exactly what you need for each model.

### 4. Group By (Analyzing Patterns)

```python
# Average confidence per label
print(df.groupby("label")["confidence"].mean())
# label
# looking_at_neighbor    0.71
# normal                 0.94
# other_suspicious       0.65
# passing_notes          0.68
# phone_detected         0.85

# Count clips per camera per hall
print(df.groupby(["hall_id", "camera_id"])["clip_id"].count())

# Which hall has the most suspicious activity?
suspicious = df[df["label"] != "normal"]
print(suspicious.groupby("hall_id")["clip_id"].count())
```

**ExamGuard connection:** Find patterns in your data. Which cameras, halls, or positions have the most cheating? This helps you understand the data before training.

### 5. Adding New Columns

```python
# Add a binary label column (for training)
df["is_cheating"] = (df["label"] != "normal").astype(int)
# 0 = normal, 1 = cheating

# Add a duration category
df["duration_cat"] = pd.cut(df["duration_sec"], bins=[0, 15, 30, 60],
                            labels=["short", "medium", "long"])

# Add a row-column position
df["row"] = df["student_position"].str.extract(r"row(\d+)")
```

**ExamGuard connection:** Create the exact labels and features your model needs from raw data.

### 6. Handling Missing Data

```python
# Check for missing values
print(df.isnull().sum())
# clip_id            0
# filename           0
# label              3    ← 3 clips have no label!
# duration_sec       0
# camera_id          1    ← 1 clip has no camera info
# confidence        12    ← 12 clips have no confidence score

# Drop rows with missing labels (can't train without labels!)
df_clean = df.dropna(subset=["label"])

# Fill missing confidence with average
df_clean["confidence"] = df_clean["confidence"].fillna(df_clean["confidence"].mean())

print(f"Clean dataset: {len(df_clean)} clips")
```

**ExamGuard connection:** Real data is always messy. Missing labels, corrupted files, incomplete records. Clean BEFORE training.

### 7. Saving Processed Data

```python
# Save clean training data
train_data = df_clean[df_clean["hall_id"].isin(["hall_A", "hall_B", "hall_C"])]
test_data = df_clean[df_clean["hall_id"].isin(["hall_D", "hall_E"])]

train_data.to_csv("train_metadata.csv", index=False)
test_data.to_csv("test_metadata.csv", index=False)

print(f"Training clips: {len(train_data)}")
print(f"Testing clips: {len(test_data)}")
```

**ExamGuard connection:** Split data by hall (not randomly) so the test set has completely new environments.

---

## Mini Project: Analyze ExamGuard Training Data

```python
"""
Mini Project: Analyze ExamGuard Training Data
Practice: Reading CSV, filtering, groupby, statistics, missing data
"""
import pandas as pd

# Step 1: Create a sample dataset (since we don't have real data yet)
import numpy as np

np.random.seed(42)
n = 1000

data = {
    "clip_id": range(1, n + 1),
    "label": np.random.choice(
        ["normal", "phone", "looking_neighbor", "passing_notes", "suspicious"],
        size=n,
        p=[0.90, 0.04, 0.03, 0.02, 0.01]  # Imbalanced!
    ),
    "camera_id": np.random.choice(["cam_1", "cam_2", "cam_3", "cam_4", "cam_5"], size=n),
    "hall_id": np.random.choice(["hall_A", "hall_B", "hall_C"], size=n),
    "duration_sec": np.random.randint(10, 60, size=n),
    "confidence": np.round(np.random.uniform(0.3, 1.0, size=n), 2)
}

df = pd.DataFrame(data)

# Step 2: Basic exploration
print("=== ExamGuard Training Data Analysis ===\n")
print(f"Total clips: {len(df)}")
print(f"Columns: {list(df.columns)}")
print(f"\nFirst 5 rows:")
print(df.head())

# Step 3: Class distribution (THE MOST IMPORTANT CHECK)
print("\n=== Class Distribution ===")
print(df["label"].value_counts())
print(f"\nNormal: {(df['label'] == 'normal').mean():.1%}")
print(f"Cheating: {(df['label'] != 'normal').mean():.1%}")
print("WARNING: Data is very imbalanced!" if (df["label"] == "normal").mean() > 0.8 else "OK")

# Step 4: Analysis by camera
print("\n=== Detections by Camera ===")
suspicious = df[df["label"] != "normal"]
print(suspicious.groupby("camera_id")["clip_id"].count())

# Step 5: Confidence analysis
print("\n=== Confidence by Label ===")
print(df.groupby("label")["confidence"].agg(["mean", "min", "max"]))

# Step 6: Recommend training split
print("\n=== Recommended Split ===")
total_cheating = len(df[df["label"] != "normal"])
print(f"Total cheating clips: {total_cheating}")
print(f"Recommended: Oversample cheating clips to at least {len(df)//5} for balance")
```

---

## Key Pandas Functions for ExamGuard

```python
# Loading data
pd.read_csv("file.csv")          # Load CSV
df.to_csv("file.csv")            # Save CSV

# Exploring
df.head()                         # First rows
df.shape                          # (rows, columns)
df.info()                         # Column types
df.describe()                     # Statistics
df["column"].value_counts()       # Count unique values

# Filtering
df[df["label"] == "phone"]        # Filter rows
df[df["confidence"] > 0.8]        # Condition filter
df[(cond1) & (cond2)]             # Multiple conditions

# Grouping
df.groupby("column").mean()       # Group and average
df.groupby("column").count()      # Group and count

# Cleaning
df.isnull().sum()                 # Check missing values
df.dropna()                       # Drop missing rows
df.fillna(value)                  # Fill missing values

# Creating
df["new_col"] = values            # Add column
df["binary"] = (df["label"] != "normal").astype(int)  # Binary encoding
```

---

## The Pandas Workflow for ExamGuard

```
1. LOAD:    pd.read_csv("exam_clips.csv")
2. EXPLORE: df.shape, df.describe(), value_counts()
3. CLEAN:   Handle missing data, fix errors
4. ANALYZE: groupby, filter, statistics
5. PREPARE: Create labels, split data
6. SAVE:    train.to_csv(), test.to_csv()
7. TRAIN:   Feed clean data to your models
```

This workflow happens BEFORE any model training. Skipping it leads to garbage models.
