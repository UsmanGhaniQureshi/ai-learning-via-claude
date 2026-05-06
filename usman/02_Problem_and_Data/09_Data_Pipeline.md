# 8. Data Pipeline — "The Complete Data Journey"

> **This chapter ties EVERYTHING together. From problem to deployed model — the complete flow.**

---

## The 12-Step ML Pipeline

Every ML project follows these steps. Some steps are quick, some take weeks. But you can't skip any.

```
Step 1:  Problem Understanding ──→ What are we solving?
Step 2:  Data Collection ────────→ Where do we get data?
Step 3:  Data Validation ────────→ Is the data good?
Step 4:  Data Cleaning ──────────→ Fix the problems
Step 5:  Data Labeling ──────────→ Add correct labels
Step 6:  Data Augmentation ──────→ Make it bigger (if needed)
Step 7:  Train/Test Split ───────→ 80% train, 20% test
Step 8:  Model Selection ────────→ Pick the right model
Step 9:  Training ───────────────→ Model learns
Step 10: Testing ────────────────→ Check accuracy
Step 11: If bad ─────────────────→ Go back to steps 2-6
Step 12: If good ────────────────→ Deploy!
```

Let's walk through each step, then see the full ExamGuard example.

---

## Step 1: Problem Understanding

**What you do:** Turn a vague goal into specific ML tasks.

**Key question:** "What would a HUMAN do? What data would they look at?"

| Input | Output |
|:---|:---|
| "Build ExamGuard" | Task 1: Detect phone on desk (object detection) |
| | Task 2: Detect chit/cheat sheet (object detection) |
| | Task 3: Detect suspicious behavior (classification) |

**Time:** 1-3 days of thinking and discussion.

**Common mistake:** Jumping straight to code without understanding the problem. You end up solving the wrong thing.

---

## Step 2: Data Collection

**What you do:** Find or collect data for each task.

**Options (in order of preference):**
1. Data you already have
2. Public datasets (Kaggle, Roboflow)
3. Pre-trained models (zero data needed)
4. Collect it yourself

**Time:** 1-7 days depending on availability.

**Common mistake:** Using the first dataset you find without checking if it matches your situation.

---

## Step 3: Data Validation

**What you do:** Run the 5 checks on your data.

| Check | What to Look For |
|:---|:---|
| Size | Enough samples? (200+ per class) |
| Visual inspection | Open 20-30 samples — do they look right? |
| Relevance | Does data match your real-world situation? |
| Balance | Classes roughly equal? |
| Trust | Reliable source? |

**Time:** 30 minutes to 2 hours.

**Common mistake:** Skipping this step and discovering bad data after weeks of training.

---

## Step 4: Data Cleaning

**What you do:** Fix all the problems you found.

| Problem | Fix |
|:---|:---|
| Missing values | Delete row or fill with average |
| Duplicates | Remove them |
| Wrong labels | Fix them |
| Outliers | Remove impossible values |
| Wrong format | Standardize |
| Bad images | Remove blurry/dark/tiny ones |

**Time:** 2-10 hours depending on data quality.

**Common mistake:** Being too aggressive with cleaning and removing too much data. Or being too soft and leaving garbage in.

---

## Step 5: Data Labeling

**What you do:** Add correct labels to every data point.

| Task Type | Label Type | Tool |
|:---|:---|:---|
| Object detection | Bounding boxes | Roboflow, LabelImg |
| Classification | Category per image/text | Roboflow, spreadsheet |
| Segmentation | Pixel-level outline | CVAT |
| Video | Clip-level label | CVAT |

**Time:** 10-40 hours (this is the most time-consuming step).

**Common mistake:** Inconsistent labeling. Different rules for different images. Always write a labeling guide first.

---

## Step 6: Data Augmentation

**What you do:** Create variations of your data to increase the dataset size.

**Only needed if:** Your data is below the minimum for your model type.

| Technique | When to Use |
|:---|:---|
| Flip, rotate, brightness | Image data |
| Synonym replacement | Text data |
| SMOTE | Tabular/number data |

**Time:** 1-2 hours with Roboflow (automated).

**Common mistake:** Over-augmenting. 500 real images are better than 3,000 augmented from 100 originals. Augment to fill gaps, don't rely on it completely.

---

## Step 7: Train/Test Split

**What you do:** Divide your data into two groups.

```
Total dataset: 1000 images
├── Training set (80%): 800 images → model learns from these
└── Test set (20%): 200 images → model is tested on these (NEVER seen during training)
```

**Why split?** If you test the model on the same data it trained on, it just memorizes and gets a fake 99% accuracy. The test set checks if the model actually LEARNED.

**The golden rule: The model must NEVER see the test set during training.**

| Split | Size | Purpose |
|:---|:---|:---|
| Training set | 80% of data | Model learns from this |
| Test set | 20% of data | Final accuracy check |

Some people also use a validation set:

| Split | Size | Purpose |
|:---|:---|:---|
| Training set | 70% | Model learns from this |
| Validation set | 15% | Check progress during training, tune settings |
| Test set | 15% | Final accuracy check after all tuning is done |

**Time:** 5 minutes (one line of code).

```python
from sklearn.model_selection import train_test_split

train_data, test_data = train_test_split(all_data, test_size=0.2, random_state=42)
```

**Common mistake:** Testing on training data and getting unrealistically high accuracy. Or accidentally including the same image in both train and test sets.

---

## Step 8: Model Selection

**What you do:** Pick the right model for your task type.

| Task | Model | Why |
|:---|:---|:---|
| Detect objects in images | YOLO | Fast, accurate, well-supported |
| Classify images (yes/no) | ResNet / EfficientNet | Good balance of speed and accuracy |
| Understand text | BERT | State-of-the-art text understanding |
| Speech to text | Whisper | Works in 100+ languages |
| Track body pose | MediaPipe | Real-time, runs on phone |

**Time:** 30 minutes if you follow the decision tables (covered in next section).

**Common mistake:** Choosing the most complex model because it sounds impressive. Simple models often work better with small data.

---

## Step 9: Training

**What you do:** Feed the training data to the model and let it learn.

```python
model.train(data="training_data.yaml", epochs=50)
```

**What happens during training:**
- Epoch 1: Model is random, gets 10% accuracy
- Epoch 10: Starting to learn patterns, 50% accuracy
- Epoch 30: Getting good, 80% accuracy
- Epoch 50: Plateauing at 88% accuracy — done

**Time:** 30 minutes to 48 hours depending on data size and model.

**Common mistake:** Training for too few epochs (model hasn't finished learning) or too many (model starts memorizing — overfitting).

---

## Step 10: Testing

**What you do:** Run the trained model on the test set (the 20% it never saw).

| Metric | What It Means | Good Threshold |
|:---|:---|:---|
| Accuracy | % of correct predictions overall | 85%+ |
| Precision | When model says "phone", how often is it right? | 85%+ |
| Recall | Of all real phones, how many did the model find? | 85%+ |
| F1 Score | Balance between precision and recall | 85%+ |

**Time:** 5 minutes.

**Common mistake:** Only looking at accuracy. If 95% of images are "no phone", a model that always says "no phone" gets 95% accuracy but is completely useless.

---

## Step 11: If Results Are Bad — Go Back

| Test Result | Problem | Go Back To |
|:---|:---|:---|
| Accuracy below 60% | Not enough data or wrong model | Step 2 (collect more) or Step 8 (try different model) |
| Model confuses two classes | Labels might be wrong or classes too similar | Step 5 (fix labels) |
| Good on training, bad on test | Overfitting (memorized, didn't learn) | Step 6 (augment more) or Step 2 (collect more diverse data) |
| Good on test, bad in real life | Training data doesn't match real situation | Step 3 (validate relevance) |
| One class much worse than others | Imbalanced data | Step 6 (augment minority class) |

**This loop is normal.** Professional ML engineers go through steps 2-10 multiple times. The first attempt rarely gives the best result.

---

## Step 12: If Results Are Good — Deploy!

When test accuracy meets your threshold (e.g., 85%+):

1. Save the model
2. Integrate into your application
3. Monitor in real-world use
4. Collect feedback and retrain periodically

---

## ExamGuard: Complete Pipeline Example

Here's the entire pipeline for ONE task — phone detection:

### Step 1: Problem Understanding
> "Detect phones on student desks during exams using overhead CCTV cameras."
> Type: Object detection. Need bounding boxes. YOLO is the model.

### Step 2: Data Collection
> Found a phone detection dataset on Roboflow: 800 images.
> Also collected 200 photos from our own exam hall cameras.
> Total: 1,000 images.

### Step 3: Data Validation
> - Size: 1,000 images. Above 200 minimum. PASS.
> - Visual check: 23/25 samples look correct. PASS.
> - Relevance: Roboflow images are overhead angle. Our photos match. PASS.
> - Balance: 550 phone, 450 no phone. Ratio 1.2:1. PASS.
> - Trust: Roboflow dataset has 2,000+ downloads. PASS.

### Step 4: Data Cleaning
> - Removed 12 duplicate images
> - Removed 8 blurry images
> - Removed 2 black images
> - Fixed 5 wrong labels
> - Standardized all to .jpg format, 640x640 pixels
> - Clean dataset: 973 images

### Step 5: Data Labeling
> - 800 Roboflow images already had bounding box labels
> - Labeled our 200 photos in Roboflow (bounding boxes around phones)
> - After cleaning: 973 properly labeled images
> - Time spent: 4 hours on our 200 photos + 2 hours reviewing existing labels

### Step 6: Data Augmentation
> - 973 images is above minimum (200). Light augmentation only.
> - Applied: horizontal flip, brightness change, slight rotation
> - Result: 973 original + ~1,900 augmented = 2,873 total images

### Step 7: Train/Test Split
> - Training: 2,298 images (80%)
> - Test: 575 images (20%)
> - Made sure no augmented version of a training image ends up in test set

### Step 8: Model Selection
> - Task: Object detection → YOLO
> - Starting point: Pre-trained YOLOv8 (already knows "cell phone")
> - Plan: Fine-tune on our data

### Step 9: Training
> ```python
> from ultralytics import YOLO
> model = YOLO("yolov8n.pt")
> model.train(data="examguard_phone/data.yaml", epochs=50, imgsz=640)
> ```
> Training time: ~2 hours on Google Colab (free GPU)

### Step 10: Testing
> | Metric | Score |
> |:---|:---|
> | Accuracy | 91% |
> | Precision | 89% |
> | Recall | 93% |
> | F1 Score | 91% |
>
> Above 85% threshold. Looking good!

### Step 11: Check Real-World Performance
> Ran on 20 new exam hall photos (not in dataset):
> - Correctly detected 17/20 phones
> - Missed 2 (phones were mostly hidden under papers)
> - 1 false alarm (labeled a calculator as phone)
> - Real-world accuracy: 85%
>
> Good enough for first version! Can improve later with more data.

### Step 12: Deploy
> - Saved model: `examguard_phone_v1.pt`
> - Integrated into Python script that reads from CCTV feed
> - Sends alert when phone detected with confidence > 80%
> - Plan to retrain monthly with new photos from the system

---

## Where ML Engineers Actually Spend Their Time

```
Data Collection:      ████████████░░░░░░░░ 25%
Data Cleaning:        ████████████████░░░░ 30%
Data Labeling:        ██████████░░░░░░░░░░ 20%
Data Augmentation:    ██░░░░░░░░░░░░░░░░░░  5%
Model Selection:      ██░░░░░░░░░░░░░░░░░░  3%
Training:             ██░░░░░░░░░░░░░░░░░░  5%
Testing & Debugging:  ████░░░░░░░░░░░░░░░░  7%
Deployment:           ██░░░░░░░░░░░░░░░░░░  5%
                      ──────────────────────
DATA WORK:            80%
MODEL WORK:           20%
```

**The takeaway: ML is a data game, not a model game.** The best ML engineers are not the ones who know the fanciest algorithms — they're the ones who know how to get, clean, and label great data.

---

## Common Mistakes at Each Step

| Step | Common Mistake | How to Avoid |
|:---|:---|:---|
| 1. Problem | "Let's use AI for everything!" | Ask: would a simple if/else rule work? |
| 2. Collection | Using first dataset found | Check relevance to YOUR situation |
| 3. Validation | Skipping it entirely | Always do the 5 checks (30 min investment) |
| 4. Cleaning | Leaving duplicates and wrong labels | Always clean before training |
| 5. Labeling | Inconsistent labels | Write a labeling guide before starting |
| 6. Augmentation | Relying only on augmented data | Real data always beats augmented |
| 7. Split | Testing on training data | Keep test set completely separate |
| 8. Selection | Choosing the most complex model | Start simple, upgrade only if needed |
| 9. Training | Too many or too few epochs | Watch the loss curve, use early stopping |
| 10. Testing | Only checking accuracy | Check precision, recall, and F1 too |
| 11. Iteration | Giving up after first try | Professional teams iterate 5-10 times |
| 12. Deployment | "It worked in testing, it'll work in production" | Real-world conditions are always different — monitor closely |

---

## The Pipeline as a Checklist

| # | Step | Status | Notes |
|:---|:---|:---|:---|
| 1 | Problem defined as specific ML task(s) | | |
| 2 | Data collected (enough for minimum) | | |
| 3 | Data validated (5 checks passed) | | |
| 4 | Data cleaned (no duplicates, bad samples removed) | | |
| 5 | Data labeled correctly and consistently | | |
| 6 | Data augmented if below minimum | | |
| 7 | Split into train (80%) and test (20%) | | |
| 8 | Model selected based on task type | | |
| 9 | Model trained | | |
| 10 | Model tested — accuracy above threshold | | |
| 11 | Real-world test passed | | |
| 12 | Deployed and monitoring | | |

---

> **Key Takeaway: ML is not magic. It's a systematic process. Follow the 12 steps, be thorough with data work (steps 2-6), and iterate when results aren't good enough. The pipeline is the same whether you're building ExamGuard or working at Google.**
