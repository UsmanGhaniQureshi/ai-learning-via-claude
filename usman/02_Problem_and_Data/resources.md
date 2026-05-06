# Resources — Problem Understanding & Data

> **Everything you need to practice what you learned in this section.**

---

## YouTube Channels & Videos

### Data Preprocessing & Cleaning

| Video/Channel | What You'll Learn | Link |
|:---|:---|:---|
| **Krish Naik** — Data Preprocessing Playlist | Missing values, encoding, scaling — full walkthrough | Search: "Krish Naik data preprocessing" |
| **CodeBasics** — Data Cleaning with Pandas | Practical Pandas cleaning in Hindi/English | Search: "CodeBasics data cleaning pandas" |
| **StatQuest** — Data Science Basics | Visual, simple explanations of every concept | youtube.com/@statquest |
| **Sentdex** — Practical Machine Learning | Hands-on Python ML with real datasets | youtube.com/@sentdex |
| **Nicholas Renotte** — YOLO Object Detection | Full YOLO tutorials from data to deployment | Search: "Nicholas Renotte YOLO tutorial" |

### Data Labeling & Augmentation

| Video/Channel | What You'll Learn | Link |
|:---|:---|:---|
| **Roboflow** — YouTube Channel | Labeling, augmentation, training — all in one | youtube.com/@roboflow |
| **Augmentation Tutorial** | All image augmentation techniques visually explained | Search: "image augmentation tutorial machine learning" |
| **CVAT Tutorial** | How to label video data step by step | Search: "CVAT annotation tutorial" |

### Transfer Learning & Pre-Trained Models

| Video/Channel | What You'll Learn | Link |
|:---|:---|:---|
| **deeplizard** — Transfer Learning | Concept explained simply with PyTorch | Search: "deeplizard transfer learning" |
| **Ultralytics** — YOLOv8 Tutorials | Official YOLO fine-tuning guides | youtube.com/@Ultralytics |
| **TensorFlow** — Transfer Learning Guide | Using pre-trained models in TensorFlow | Search: "TensorFlow transfer learning tutorial" |

---

## Tools

### Data Collection & Exploration

| Tool | What It Does | URL | Cost |
|:---|:---|:---|:---|
| **Kaggle** | 50,000+ free datasets, notebooks, competitions | kaggle.com | Free |
| **Roboflow Universe** | Image/video datasets with labels ready to use | universe.roboflow.com | Free |
| **HuggingFace Datasets** | Text, audio, image datasets | huggingface.co/datasets | Free |
| **Google Dataset Search** | Search engine specifically for datasets | datasetsearch.research.google.com | Free |

### Data Labeling

| Tool | Best For | URL | Cost |
|:---|:---|:---|:---|
| **Roboflow** | Image labeling (bounding boxes, classification) | roboflow.com | Free up to 10K images |
| **LabelImg** | Offline image labeling | `pip install labelImg` | Free |
| **CVAT** | Video labeling, team labeling | cvat.ai | Free |
| **Label Studio** | All data types (image, text, audio) | labelstud.io | Free (open source) |

### Data Cleaning & Processing

| Tool | Best For | Install | Cost |
|:---|:---|:---|:---|
| **Pandas** | Cleaning tables/CSV/Excel | `pip install pandas` | Free |
| **OpenCV** | Image processing, blur detection, resizing | `pip install opencv-python` | Free |
| **Pillow** | Simple image operations, format conversion | `pip install Pillow` | Free |
| **NumPy** | Number crunching, statistics | `pip install numpy` | Free |

### Data Augmentation

| Tool | Best For | Install | Cost |
|:---|:---|:---|:---|
| **Roboflow** (web) | Click-button augmentation, no code needed | Web browser | Free up to 10K images |
| **Albumentations** | Fine control over image augmentation | `pip install albumentations` | Free |
| **torchvision.transforms** | PyTorch image augmentation | `pip install torchvision` | Free |
| **imgaug** | Advanced image augmentation | `pip install imgaug` | Free |
| **nlpaug** | Text augmentation | `pip install nlpaug` | Free |
| **imbalanced-learn** | SMOTE for tabular data | `pip install imbalanced-learn` | Free |

### Pre-Trained Models

| Model | Install | Use Case |
|:---|:---|:---|
| **YOLOv8** | `pip install ultralytics` | Object detection |
| **MediaPipe** | `pip install mediapipe` | Face, pose, hand tracking |
| **Transformers (BERT, etc.)** | `pip install transformers` | Text understanding |
| **Whisper** | `pip install openai-whisper` | Speech to text |
| **torchvision models** | `pip install torchvision` | Image classification |

---

## Practice Exercises

### Exercise 1: Validate a Dataset (30 minutes)

1. Go to kaggle.com/datasets
2. Search for "phone detection" or any object detection dataset
3. Download it
4. Run the 5 validation checks from Chapter 3:
   - Count the images (Size)
   - Open 20 random images (Visual check)
   - Check if images match a real-world scenario (Relevance)
   - Count images per class (Balance)
   - Check downloads, comments, rating (Trust)
5. Fill out the validation checklist
6. Write your verdict: Would you use this dataset? Why or why not?

### Exercise 2: Clean a Messy Dataset (1 hour)

1. Go to Kaggle and search for "dirty data" or "messy dataset"
2. Download a CSV dataset (try the "Dirty Data" practice datasets)
3. Open in Python with Pandas:
   ```python
   import pandas as pd
   data = pd.read_csv("messy_data.csv")
   print(data.info())
   print(data.describe())
   print(data.isnull().sum())
   ```
4. Fix:
   - Missing values (fill or delete)
   - Duplicates (remove)
   - Inconsistent categories (standardize)
   - Outliers (detect and handle)
5. Save the clean dataset
6. Compare: How many rows before vs after?

### Exercise 3: Label 50 Images (1 hour)

1. Collect 50 photos with your phone (any object — cups, pens, phones)
2. Upload to Roboflow (free account)
3. Draw bounding boxes around each object
4. Export in YOLO format
5. Look at the exported files — understand the label format

### Exercise 4: Augment a Small Dataset (30 minutes)

1. Take 20 photos of any object
2. Upload to Roboflow
3. Apply augmentations: flip, rotation, brightness
4. Generate 3x more images
5. Download and count: 20 originals became how many?
6. Look at the augmented images — do they look realistic?

### Exercise 5: Test a Pre-Trained Model (30 minutes)

1. Install YOLO: `pip install ultralytics`
2. Run it on 10 photos you took:
   ```python
   from ultralytics import YOLO
   model = YOLO("yolov8n.pt")
   results = model("your_photo.jpg")
   results[0].show()
   ```
3. Write down: What did it detect correctly? What did it miss?
4. Calculate your accuracy: correct / total

### Exercise 6: The Complete Mini-Pipeline (3-4 hours)

Do the entire pipeline on a small project:
1. Pick a problem: "Detect pens on my desk" or "Detect cups in kitchen"
2. Collect 50 photos (25 with object, 25 without)
3. Validate: Are all photos clear? Balanced? Relevant?
4. Clean: Remove any blurry or duplicate photos
5. Label: Draw bounding boxes in Roboflow
6. Augment: Generate 3x more images
7. Split: 80/20 train/test
8. Train: Fine-tune YOLOv8 (even 10 epochs is fine for practice)
9. Test: Run on the test set
10. Write down your results

---

## Recommended Courses

| Course | Platform | What You'll Learn | Duration | Cost |
|:---|:---|:---|:---|:---|
| **Andrew Ng — Data-Centric AI** | Coursera / deeplearning.ai | Why data quality matters more than model choice | 4 weeks | Free to audit |
| **Google ML Crash Course — Data Section** | developers.google.com/machine-learning | Data preparation fundamentals | 2-3 hours | Free |
| **Fast.ai — Practical Deep Learning** | course.fast.ai | Hands-on approach, data to deployment | 7 weeks | Free |
| **Kaggle Learn — Intro to ML** | kaggle.com/learn | Interactive coding exercises | 3-4 hours | Free |
| **Kaggle Learn — Data Cleaning** | kaggle.com/learn | Hands-on data cleaning with Pandas | 4 hours | Free |
| **Roboflow University** | roboflow.com/university | Computer vision from labeling to training | Self-paced | Free |

---

## Quick Reference Card

```
PROBLEM → COLLECT → VALIDATE → CLEAN → LABEL → AUGMENT → SPLIT → TRAIN → TEST → DEPLOY

Stuck at any step?
├── Not enough data?      → Augment (Ch 4) or use pre-trained model (Ch 6)
├── Data quality bad?     → Clean it (Ch 5) or find better data (Ch 2)
├── Labels inconsistent?  → Write a labeling guide, double-label (Ch 7)
├── Model accuracy low?   → More data > better model, every time
└── Works in test, fails in real life? → Training data doesn't match reality (Ch 3)
```

---

> **The best way to learn ML is to DO ML. Pick a small project, follow the pipeline, and complete it end to end. One finished project teaches more than 100 tutorials.**
