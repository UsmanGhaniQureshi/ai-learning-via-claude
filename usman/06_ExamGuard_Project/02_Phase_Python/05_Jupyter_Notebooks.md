# Jupyter Notebooks

## What is a Jupyter Notebook?

A Jupyter Notebook is an **interactive coding environment** where you can write and run Python code one piece at a time, see the results immediately, and add notes alongside your code.

Think of it as a lab notebook for coding:
- Write a piece of code (a "cell")
- Run it and see the output instantly
- Write notes explaining what you did
- Move to the next piece of code

It runs in your web browser and looks like a document with runnable code blocks.

---

## Why Jupyter Matters for ExamGuard

### The ML Workflow is Experimental

Building ML models is NOT like writing a regular program where you write all the code, then run it. Instead, it's a back-and-forth process:

```
Regular Programming:
  Write all code → Run → Debug → Done

ML Development:
  Load data → look at it → try something → see result →
  adjust → try again → see result → adjust → try again →
  visualize → adjust → test → adjust → ...
```

Jupyter Notebooks are PERFECT for this because:
- You run one cell at a time (not the whole program)
- You see results immediately (charts appear inline)
- You can go back and change earlier cells
- You keep a record of everything you tried

### Every ML Professional Uses Jupyter

- Google uses **Colab** (Google's version of Jupyter)
- Kaggle competitions use Jupyter Notebooks
- Research papers include Jupyter Notebooks
- AI courses use Jupyter for exercises

**All your ExamGuard experimentation will happen in Jupyter Notebooks.**

---

## What to Learn

### 1. Starting Jupyter

```bash
# Install (if not already installed)
pip install jupyter

# Start Jupyter Notebook
jupyter notebook

# This opens a browser window where you can create notebooks
```

Or use **Google Colab** (free, no installation, runs in browser):
- Go to colab.research.google.com
- Create a new notebook
- Start coding (free GPU included!)

### 2. Understanding Cells

A notebook is made of **cells**. There are two main types:

**Code Cells** - Write and run Python code:
```python
# This is a code cell
import numpy as np

data = np.random.rand(5)
print(data)
# Output appears right below the cell!
```

**Markdown Cells** - Write formatted notes:
```markdown
# This is a Heading
This is a note explaining what the code does.

## Why this step matters
Because we need to understand the data before training.
```

### 3. Running Cells

| Action | Shortcut |
|---|---|
| Run current cell | `Shift + Enter` |
| Run cell, stay on it | `Ctrl + Enter` |
| Run cell, insert new below | `Alt + Enter` |
| Add cell above | `A` (in command mode) |
| Add cell below | `B` (in command mode) |
| Delete cell | `DD` (press D twice in command mode) |
| Switch to Markdown | `M` (in command mode) |
| Switch to Code | `Y` (in command mode) |

### 4. A Typical ExamGuard Notebook

Here's what a real ExamGuard experimentation notebook looks like:

```
Cell 1 (Markdown):
    # ExamGuard Phone Detection - Experiment 1
    Testing YOLOv8-nano on exam hall images

Cell 2 (Code):
    import numpy as np
    import pandas as pd
    import matplotlib.pyplot as plt

Cell 3 (Markdown):
    ## Load Training Data

Cell 4 (Code):
    df = pd.read_csv("exam_clips.csv")
    print(f"Total clips: {len(df)}")
    df.head()

Cell 5 (Markdown):
    ## Check Class Distribution

Cell 6 (Code):
    df["label"].value_counts().plot(kind="bar")
    plt.title("Class Distribution")
    plt.show()

Cell 7 (Markdown):
    ## Observation
    Data is very imbalanced: 95% normal, 5% cheating.
    Need to apply oversampling before training.

Cell 8 (Code):
    # Train the model...
```

**Notice the pattern:** Code → Result → Note → Code → Result → Note. This creates a complete record of your experiment.

### 5. Inline Visualizations

One of Jupyter's best features: charts appear RIGHT in the notebook.

```python
# In a Jupyter cell:
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x))
plt.title("Test Plot")
plt.show()

# The chart appears right below this cell!
# No separate window, no saving to file first.
```

### 6. Displaying DataFrames Nicely

```python
import pandas as pd

# In Jupyter, just putting the variable name at the end of a cell
# shows it as a nice formatted table
df = pd.DataFrame({
    "camera": ["cam_1", "cam_2", "cam_3"],
    "detections": [45, 72, 31],
    "false_alarms": [5, 12, 3]
})

df  # Just the variable name - Jupyter shows it as a pretty table
```

### 7. Magic Commands

Jupyter has special commands that start with `%`:

```python
# Time how long a cell takes to run
%%time
import numpy as np
big_array = np.random.rand(10000, 10000)
result = np.dot(big_array, big_array)

# Output: CPU times: user 2.3 s, total: 2.3 s
# This tells you if your code is fast enough for real-time!

# Show matplotlib plots inline (usually automatic)
%matplotlib inline

# List all variables in memory
%who

# Run a shell command
!pip install ultralytics
```

---

## ExamGuard Notebook Organization

Here's how to organize your Jupyter notebooks for ExamGuard:

```
notebooks/
    01_data_exploration.ipynb        ← Explore and understand your dataset
    02_data_preprocessing.ipynb      ← Clean and prepare data for training
    03_yolo_phone_detection.ipynb    ← Train and test YOLO for phone detection
    04_cnn_gaze_tracking.ipynb       ← Train and test CNN for gaze direction
    05_lstm_behavior.ipynb           ← Train and test behavior classifier
    06_autoencoder_anomaly.ipynb     ← Train and test anomaly detector
    07_rl_alert_agent.ipynb          ← Train and test the alert decision agent
    08_integration_test.ipynb        ← Test all models together
```

Each notebook is a self-contained experiment that you can run, modify, and share.

---

## Google Colab: Free GPU for Training

Google Colab is Jupyter in the cloud with free GPU access:

### Why use Colab:
- **Free GPU** - Train models faster (NVIDIA T4 or better)
- **No installation** - Everything runs in your browser
- **Pre-installed libraries** - NumPy, Pandas, TensorFlow, PyTorch already there
- **Google Drive integration** - Save and load files from your Drive
- **Share easily** - Send a link to anyone

### Getting started with Colab:
1. Go to **colab.research.google.com**
2. Click "New Notebook"
3. Change runtime to GPU: Runtime menu, Change runtime type, GPU
4. Start coding

```python
# First cell in Colab - check GPU availability
import torch
print(f"GPU available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU name: {torch.cuda.get_device_name(0)}")
```

**ExamGuard connection:** You'll train your models on Colab's free GPU. Training that takes 2 hours on CPU might take 15 minutes on GPU.

---

## Mini Project: Your First ExamGuard Notebook

Create a new Jupyter notebook (or Colab notebook) and add these cells:

```
Cell 1 (Markdown):
    # My First ExamGuard Notebook
    Learning to use Jupyter for ML experiments

Cell 2 (Code):
    # Import libraries
    import numpy as np
    import pandas as pd
    import matplotlib.pyplot as plt
    print("All libraries loaded!")

Cell 3 (Markdown):
    ## Simulate Camera Data

Cell 4 (Code):
    # Create fake camera frame data
    frame = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
    print(f"Frame shape: {frame.shape}")
    print(f"Frame dtype: {frame.dtype}")

    # Display the random "image"
    plt.imshow(frame)
    plt.title("Simulated Camera Frame")
    plt.axis("off")
    plt.show()

Cell 5 (Markdown):
    ## Simulate Detection Scores

Cell 6 (Code):
    # Simulate confidence scores for 50 detections
    scores = np.random.uniform(0.2, 1.0, 50)

    plt.hist(scores, bins=15, color="steelblue", edgecolor="black")
    plt.axvline(x=0.75, color="red", linestyle="--", label="Threshold")
    plt.xlabel("Confidence Score")
    plt.ylabel("Count")
    plt.title("Detection Confidence Distribution")
    plt.legend()
    plt.show()

    alerts = scores[scores >= 0.75]
    print(f"Total detections: {len(scores)}")
    print(f"Alerts (above threshold): {len(alerts)}")
    print(f"Alert rate: {len(alerts)/len(scores):.1%}")

Cell 7 (Markdown):
    ## Observations
    - The random scores are roughly uniform
    - About 30% of detections exceed the 0.75 threshold
    - In a real system, normal behavior would have high confidence
      and cheating would have variable confidence

Cell 8 (Code):
    print("Notebook complete!")
```

### What this teaches:

- How to create and run cells
- How to mix code and notes
- How to display charts inline
- The workflow of experiment, observe, note
- The structure of an ML notebook

---

## Tips for Good Notebooks

1. **Always add markdown cells** explaining WHAT you're doing and WHY
2. **One logical step per cell** (don't cram everything into one cell)
3. **Show your outputs** - print shapes, show charts, display tables
4. **Run cells in order** - from top to bottom, don't skip around
5. **Restart and run all** before sharing (make sure it works from scratch)
6. **Name your notebooks clearly** - `03_yolo_phone_detection.ipynb` not `Untitled7.ipynb`
