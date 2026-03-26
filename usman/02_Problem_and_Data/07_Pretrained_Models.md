# 6. Pre-Trained Models — "Using and Extending Pre-Trained Models"

> **You asked: "I got a pre-trained model and want to extend its functionality, how can I?"**
> Let's start from the beginning and build up to extending models.

---

## What is a Pre-Trained Model?

A pre-trained model is a model that has ALREADY been trained on millions of images (or text, or audio) by companies like Google, Meta, or Microsoft. You download it and use it immediately.

**Analogy:**

| Approach | Real Life | ML Equivalent |
|:---|:---|:---|
| Train from scratch | Hire a fresh graduate who knows nothing about your industry. Train them for 6 months. | Collect thousands of images, train model from zero. Takes days/weeks. |
| Use pre-trained | Hire an experienced professional who already knows the field. Just show them YOUR office. | Download a model that already detects 80+ objects. Just show it YOUR specific photos. |

The experienced employee already knows how to work — you just need to show them your specific setup. Same with pre-trained models.

---

## Available Pre-Trained Models

| Model | What It Already Does | Data Needed From You | Install | Best For |
|:---|:---|:---|:---|:---|
| **YOLOv8** | Detects 80 objects: person, phone, laptop, bag, chair, bottle, etc. | ZERO | `pip install ultralytics` | Object detection in images/video |
| **MediaPipe Face** | Detects faces + 468 facial landmarks | ZERO | `pip install mediapipe` | Face detection, gaze tracking |
| **MediaPipe Pose** | Tracks 33 body keypoints (skeleton) | ZERO | `pip install mediapipe` | Body posture, gesture recognition |
| **MediaPipe Hands** | Tracks 21 points per hand | ZERO | `pip install mediapipe` | Hand gesture, sign language |
| **ResNet-50** | Classifies images into 1,000 categories | ZERO | `pip install torchvision` | Image classification |
| **EfficientNet** | Same as ResNet but faster and lighter | ZERO | `pip install torchvision` | Mobile/edge deployment |
| **BERT** | Understands text meaning, sentiment, Q&A | ZERO | `pip install transformers` | Text classification, chatbots |
| **Whisper** | Converts speech to text (100+ languages) | ZERO | `pip install openai-whisper` | Transcription, voice commands |
| **CLIP** | Matches images to text descriptions | ZERO | `pip install openai-clip` | Search images by text |
| **SAM (Segment Anything)** | Segments any object in any image | ZERO | Meta's GitHub | Image segmentation |

**Key point: All of these cost ZERO data. Download, install, run. That's it.**

---

## Step 1: TEST a Pre-Trained Model on YOUR Problem

Before doing anything complex, just TEST it. This takes 10 minutes.

### The 10-Photo Test

1. Take 10 photos from YOUR actual situation
   - For ExamGuard: 10 photos from your exam hall camera
   - 5 with phones visible, 5 without

2. Run the pre-trained model on these 10 photos

3. Count: How many did it get right?

```python
# Example: Test YOLO on your exam hall photos
from ultralytics import YOLO

model = YOLO("yolov8n.pt")  # Download pre-trained model (takes 30 seconds)

results = model("exam_hall_photo.jpg")  # Run on your photo
results[0].show()  # See what it detected
```

4. Write down the results:

| Photo | Contains Phone? | Model Said | Correct? |
|:---|:---|:---|:---|
| exam_01.jpg | Yes — phone on desk | Detected "cell phone" | YES |
| exam_02.jpg | Yes — phone partially hidden | No detection | NO |
| exam_03.jpg | Yes — phone in hand | Detected "cell phone" | YES |
| exam_04.jpg | No | No detection | YES |
| exam_05.jpg | No | No detection | YES |
| exam_06.jpg | Yes — phone far from camera | No detection | NO |
| exam_07.jpg | Yes — phone on desk | Detected "cell phone" | YES |
| exam_08.jpg | No | Detected "remote" (false alarm) | NO |
| exam_09.jpg | No | No detection | YES |
| exam_10.jpg | No | No detection | YES |

**Result: 7/10 correct = 70% accuracy**

---

## Step 2: Decide What to Do Based on Accuracy

| Accuracy on Your 10 Photos | What It Means | What to Do |
|:---|:---|:---|
| **85-100%** (9-10 correct) | Model works great for your situation | USE IT AS-IS. You're done! No training needed. |
| **60-85%** (6-8 correct) | Model understands the concept but struggles with YOUR specifics | FINE-TUNE with your data (Transfer Learning) |
| **Below 60%** (0-5 correct) | Model doesn't work for your situation | Try a DIFFERENT model, or collect data and train from scratch |

**ExamGuard result: 70% = falls in the 60-85% range. We need to fine-tune.**

---

## What is Fine-Tuning (Transfer Learning)?

> **Simple explanation:** "The teacher already knows math. You just teach them YOUR specific exam pattern."

The pre-trained model already knows:
- What edges look like
- What shapes look like
- What textures look like
- What common objects look like (phones, people, chairs)

It just doesn't know YOUR specific setup:
- Your camera angle
- Your lighting
- Your desk layout
- Partially hidden phones at your distance

**Fine-tuning = showing the model 200-500 of YOUR photos so it adapts to YOUR environment.**

### How It Works (Simple Version)

```
Pre-trained YOLO:
  Layer 1-5: Knows edges, shapes, textures       → KEEP (don't change)
  Layer 6-10: Knows general objects               → KEEP (don't change)
  Layer 11-15: Knows specific object details      → RETRAIN (show your photos)
  Final layer: Makes the detection decision        → RETRAIN (show your photos)
```

You're not starting from zero. You're starting from a model that's already 70% of the way there and just nudging it the last 30%.

---

## How to Fine-Tune: Step by Step

### For ExamGuard Phone Detection (YOLO)

**What you need:**
- Pre-trained YOLOv8 model (already downloaded)
- 200-500 of YOUR labeled photos (phones with bounding boxes)
- A computer with a GPU (or Google Colab — free)

**Steps:**

1. **Prepare your labeled data** (see Chapter 7 for labeling)
   - 200+ images from your exam hall cameras
   - Each phone drawn with a bounding box in Roboflow

2. **Export from Roboflow in YOLO format**
   - Roboflow gives you a download link with the right folder structure

3. **Fine-tune with 3 lines of code:**

```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")  # Start from pre-trained

model.train(
    data="your_dataset/data.yaml",  # Your labeled ExamGuard photos
    epochs=50,                       # 50 rounds of training
    imgsz=640,                       # Image size
    batch=16                         # Process 16 images at a time
)
```

4. **Test the fine-tuned model:**

```python
fine_tuned = YOLO("runs/detect/train/weights/best.pt")
results = fine_tuned("new_exam_photo.jpg")
results[0].show()
```

**Expected improvement:**

| Stage | Accuracy on Your Photos |
|:---|:---|
| Pre-trained (before fine-tuning) | 70% |
| After fine-tuning with 200 photos | 85% |
| After fine-tuning with 500 photos | 92% |

---

## Extending Functionality: "YOLO Detects Phones, But I Also Want Chits"

This is exactly what you asked about. Here's how to extend a model to detect NEW things:

### The Problem
- YOLO already detects phones (pre-trained or fine-tuned)
- You ALSO want it to detect cheat sheets (chits) and earpieces
- YOLO has never seen a "chit" before — it's not in its 80 standard categories

### The Solution: Add New Classes

1. **Collect labeled images for the new objects:**

| New Object | Images Needed | Labeling Type |
|:---|:---|:---|
| Chit (cheat sheet) | 200-500 | Bounding box around chit |
| Earpiece | 200-500 | Bounding box around earpiece |

2. **Combine with your existing phone dataset:**

| Class | Images |
|:---|:---|
| Phone (existing) | 500 |
| Chit (NEW) | 300 |
| Earpiece (NEW) | 250 |
| **Total** | **1,050** |

3. **Fine-tune on the combined dataset:**

```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")  # Start from pre-trained

# Train on ALL classes together
model.train(
    data="examguard_all_classes/data.yaml",  # Contains phone + chit + earpiece
    epochs=100,
    imgsz=640
)
```

4. **Result:** Model now detects phones AND chits AND earpieces!

```python
# Test it
model = YOLO("runs/detect/train/weights/best.pt")
results = model("exam_photo.jpg")
# Output: "phone detected (94%), chit detected (87%)"
```

---

## Freezing Layers: What It Means and When to Do It

Remember the layer diagram? A neural network has layers:

```
Early layers:  Detect edges, lines, simple shapes     → UNIVERSAL (same for all images)
Middle layers: Detect textures, patterns, parts        → MOSTLY UNIVERSAL
Late layers:   Detect specific objects                  → SPECIFIC to your task
Final layer:   Make the decision                        → COMPLETELY SPECIFIC to your task
```

**Freezing** means telling the model: "Don't change these layers. Only learn in the unfrozen layers."

| Strategy | What Gets Frozen | When to Use | Training Speed |
|:---|:---|:---|:---|
| **Freeze nothing** | Nothing frozen — all layers learn | Lots of data (1000+), very different from original | Slowest |
| **Freeze early layers** | First 5-10 layers frozen | Medium data (200-500), somewhat similar to original | Medium |
| **Freeze most layers** | Only last 2-3 layers learn | Very little data (50-200), very similar to original | Fastest |

```python
# Example: Freeze first 10 layers in YOLO
model = YOLO("yolov8n.pt")
model.train(
    data="your_data.yaml",
    epochs=50,
    freeze=10  # Freeze first 10 layers
)
```

**ExamGuard recommendation:** Freeze early layers (freeze=10). Our exam photos are similar enough to general images that the early layers (edges, shapes) don't need retraining.

---

## ExamGuard Complete Walkthrough: Building It Step by Step

### Phase 1: Phone Detection (Week 1)

| Step | Action | Result |
|:---|:---|:---|
| 1 | Download pre-trained YOLO | Detects 80 objects including "cell phone" |
| 2 | Test on 10 exam hall photos | 70% accuracy — good but not great |
| 3 | Collect 300 exam hall photos with phones | Labeled with bounding boxes in Roboflow |
| 4 | Fine-tune YOLO for 50 epochs | 90% accuracy on exam hall photos |

### Phase 2: Add Chit Detection (Week 2)

| Step | Action | Result |
|:---|:---|:---|
| 5 | Collect 250 photos of chits on desks | Labeled with bounding boxes |
| 6 | Combine phone dataset + chit dataset | 550 total images, 2 classes |
| 7 | Fine-tune YOLO on combined data | Detects phones (90%) AND chits (85%) |

### Phase 3: Add Earpiece Detection (Week 3)

| Step | Action | Result |
|:---|:---|:---|
| 8 | Collect 200 photos with earpieces | Labeled with bounding boxes |
| 9 | Combine all three datasets | 750 total images, 3 classes |
| 10 | Fine-tune YOLO on everything | Detects phones (89%), chits (84%), earpieces (80%) |

### Phase 4: Add Behavior Detection (Week 4+)

| Step | Action | Result |
|:---|:---|:---|
| 11 | Use MediaPipe Pose (pre-trained, zero data) | Detects body skeleton |
| 12 | Collect 200 video clips of normal + suspicious behavior | Labeled as "normal" or "suspicious" |
| 13 | Train a simple classifier on pose data | Detects unusual head movement, turning around |

**Final ExamGuard System:**
- YOLO (fine-tuned) → detects phones, chits, earpieces
- MediaPipe Pose (pre-trained) → tracks body posture
- Custom classifier → flags suspicious behavior
- All three running together on the exam hall video feed

---

## Common Mistakes with Pre-Trained Models

| Mistake | Why It's Wrong | What to Do Instead |
|:---|:---|:---|
| Training from scratch when a pre-trained model exists | Wastes time and needs way more data | Always check pre-trained first |
| Using a model trained on the wrong type of data | ImageNet model for medical X-rays won't work well | Find a model pre-trained on similar data |
| Not testing before fine-tuning | Maybe it already works at 90% | Always do the 10-photo test first |
| Fine-tuning with too few epochs | Model doesn't have time to adapt | Start with 50 epochs, increase if needed |
| Fine-tuning with too many epochs | Model overfits to your small dataset | Use early stopping or stick to 50-100 epochs |
| Forgetting to freeze layers with small data | Model forgets what it already knew | Freeze early layers when data is small |

---

## Quick Decision Flowchart

```
Your problem → Is there a pre-trained model for it?
├── YES → Test it on 10 of your samples
│   ├── 85%+ accuracy → USE IT. Done!
│   ├── 60-85% accuracy → FINE-TUNE with 200-500 of your images
│   └── Below 60% → Try a different pre-trained model
│       ├── Still bad → Collect more data, train from scratch
│       └── Better → Fine-tune this one instead
└── NO → Collect data, train from scratch (see Chapters 2-5)

Want to add new detection capabilities?
├── Collect labeled images for new object (200-500)
├── Combine with existing dataset
└── Fine-tune on combined dataset → model now detects old + new objects
```

---

> **Key Takeaway: Always start with a pre-trained model. It's like having a head start in a race. Fine-tuning 200 images on a pre-trained model gives better results than training 2,000 images from scratch. Work smart, not hard.**
