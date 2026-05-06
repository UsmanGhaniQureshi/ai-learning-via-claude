# 7. Data Labeling — "How to Label Data Properly"

> **Labeling = telling the model what each piece of data IS.**
> Without labels, the model has no idea what it's looking at.

---

## What is Labeling?

Labeling is adding the "answer" to each piece of training data.

Think of it like a teacher grading exam papers. The student (model) needs to see both the question (image) and the correct answer (label) to learn.

| Data Type | The "Question" (Input) | The "Answer" (Label) |
|:---|:---|:---|
| Image | A photo of a desk | "phone" or "no phone" |
| Text | A customer review | "positive" or "negative" |
| Audio | A sound clip | "speech" or "music" or "noise" |
| Numbers | Patient vital signs | "healthy" or "at risk" |

**Without labels:** The model sees thousands of images but doesn't know what's in them. It's like showing flashcards without ever saying what's on them.

**With labels:** The model sees an image AND knows "this is a phone." After seeing 500 labeled examples, it learns to recognize phones on its own.

---

## Types of Labels

Different problems need different types of labels. Here are the four main types:

### Type 1: Classification Label

**What it is:** One label for the WHOLE image (or text, or data point).

```
Image of desk with phone → Label: "phone"
Image of desk without phone → Label: "no_phone"
```

The model only learns "IS there a phone?" It doesn't learn WHERE the phone is.

**Best for:** Simple yes/no or category questions.

---

### Type 2: Bounding Box

**What it is:** A rectangle drawn around each object of interest in the image.

```
Image of desk → Rectangle drawn around the phone → Label: "phone" at position (x=120, y=200, width=80, height=40)
```

The model learns WHAT the object is AND WHERE it is in the image.

**Best for:** Object detection — finding and locating objects (YOLO uses this).

---

### Type 3: Segmentation

**What it is:** The exact outline of the object, pixel by pixel. Like tracing around the phone with a pen.

```
Image of desk → Every pixel that is part of the phone is colored → Label: "phone" pixels vs "background" pixels
```

The model learns the exact shape and boundaries of the object.

**Best for:** Medical imaging (exact tumor boundaries), self-driving cars (exact road boundaries), satellite images.

---

### Type 4: Text Labels

**What it is:** A category or tag for each piece of text.

```
"This product is amazing, I love it!" → Label: "positive"
"Terrible quality, broke in 2 days" → Label: "negative"
"The product arrived on time" → Label: "neutral"
```

---

## Which Label Type for Which Problem?

| Question You're Asking | Label Type Needed | Example |
|:---|:---|:---|
| "Is there a phone in this image?" | Classification | Whole image = "phone" or "no_phone" |
| "WHERE is the phone in this image?" | Bounding box | Rectangle around the phone |
| "What is the EXACT shape of the phone?" | Segmentation | Pixel-by-pixel outline |
| "How many phones are in this image?" | Bounding box | One box per phone, count the boxes |
| "Is this review positive or negative?" | Text classification | "positive" / "negative" |
| "Where is the tumor in this X-ray?" | Segmentation | Exact tumor outline |
| "What objects are on this desk?" | Bounding box | Box around each object with a label |

### For ExamGuard:

| Task | Label Type | Why |
|:---|:---|:---|
| Detect phone on desk | **Bounding box** | YOLO needs to know WHERE the phone is, not just that it exists |
| Detect chit (cheat sheet) | **Bounding box** | Same reason — need location |
| Detect earpiece | **Bounding box** | Same reason — need location |
| Normal vs suspicious behavior | **Classification** | Whole video clip = "normal" or "suspicious" |
| Student identity | **Classification** | Whole face image = "Student A" or "Student B" |

---

## Labeling Tools: Step by Step

### Tool 1: Roboflow (Web-Based — Easiest)

Best for: Image bounding boxes and classification.

**Steps:**
1. Go to roboflow.com and create a free account
2. Create a new project → choose "Object Detection"
3. Upload your images (drag and drop)
4. Click on an image → draw a rectangle around the phone → type "phone"
5. Repeat for every phone in every image
6. When done, click "Generate" → download in YOLO format

**Speed:** About 30-60 images per hour for bounding boxes.

### Tool 2: LabelImg (Desktop App — Free)

Best for: Offline labeling when you don't want to upload images.

**Steps:**
1. Install: `pip install labelImg`
2. Run: `labelImg`
3. Open your image folder
4. Draw rectangles around objects
5. Type the label name
6. Save — creates XML files alongside your images

**Speed:** About 40-80 images per hour.

### Tool 3: CVAT (Web-Based — Best for Video)

Best for: Labeling video frames, team labeling.

**Steps:**
1. Go to cvat.ai or install locally
2. Upload your video
3. Draw bounding boxes on key frames
4. CVAT automatically interpolates between frames (you don't have to label every single frame!)
5. Export in YOLO format

**Speed:** Much faster for video — label every 10th frame and it fills in the rest.

### Comparison Table:

| Feature | Roboflow | LabelImg | CVAT |
|:---|:---|:---|:---|
| Cost | Free (up to 10K images) | Free | Free |
| Platform | Web browser | Desktop (Windows/Mac/Linux) | Web browser |
| Best for | Images | Images | Video |
| Auto-features | Auto-label suggestions, augmentation | None | Frame interpolation |
| Export formats | YOLO, COCO, VOC, TFRecord | VOC, YOLO | Many formats |
| Team labeling | Yes | No | Yes |
| Learning curve | Easy | Easy | Medium |

---

## Labeling Best Practices

### Rule 1: Be Consistent

If you decide that a partially visible phone counts as "phone", then ALWAYS label partial phones. Don't label it in image 1 and skip it in image 50.

| Decision | Stick With It |
|:---|:---|
| Partial phone visible? | Always label "phone" OR always skip — pick one |
| Phone in someone's hand? | Always label OR always skip |
| Phone screen off? | Always label OR always skip |
| Very small phone in background? | Always label OR always skip |

**Write down your rules BEFORE you start labeling.** This is called a "labeling guide."

### Rule 2: Label EVERYTHING Visible

If there are 3 phones in one image, label all 3. Don't just label the obvious one and miss the one in the corner.

```
BAD:  Image has 3 phones → you label 1 → model thinks the other 2 are NOT phones
GOOD: Image has 3 phones → you label all 3 → model learns all phones
```

### Rule 3: When Unsure, Use an "Uncertain" Category

Sometimes you genuinely can't tell if something is a phone or a calculator from the camera angle.

```
Certain it's a phone → label "phone"
Certain it's not a phone → label "no_phone"
Can't tell → label "uncertain" → review later with someone else
```

Don't guess. Wrong labels are worse than no labels.

### Rule 4: Double-Label (Have 2 People Label the Same Data)

This catches mistakes and disagreements.

| Image | Person A's Label | Person B's Label | Match? | Action |
|:---|:---|:---|:---|:---|
| img_001.jpg | phone | phone | YES | Keep |
| img_002.jpg | phone | calculator | NO | Discuss, decide, fix |
| img_003.jpg | no_phone | no_phone | YES | Keep |
| img_004.jpg | phone | uncertain | NO | Look more carefully, decide |

**Agreement rate above 90%** = your labeling guide is clear and labels are reliable.
**Agreement rate below 80%** = your labeling guide needs to be more specific, or the task is genuinely ambiguous.

---

## How Many Labels Do You Need?

| Per Class | Quality | Model Performance |
|:---|:---|:---|
| 50-100 | Bare minimum | Model will struggle, high error rate |
| 200 | Minimum recommended | Decent performance, okay for prototype |
| 500 | Good | Solid performance for most tasks |
| 1000+ | Great | High accuracy, production-ready |
| 5000+ | Excellent | Top-tier performance |

**ExamGuard recommendation:**
- Phone: 500 labeled images (bounding boxes)
- Chit: 300 labeled images (rarer, harder to find data)
- Earpiece: 200 labeled images (start with minimum, add more later)

---

## Adding More Labels to an Existing Model

You trained a model that detects phones. Now you want it to also detect chits.

**You DON'T start over. You ADD to the existing dataset.**

### Steps:
1. Keep your existing labeled phone images (500 images)
2. Collect new chit images (300 images)
3. Label the chit images with bounding boxes
4. Combine both sets into one dataset
5. Retrain (fine-tune) the model on the combined dataset
6. Now it detects phones AND chits

```
Before: model knows [phone]
Add:    300 labeled chit images
After:  model knows [phone, chit]
```

**Important:** When you retrain, include the OLD data too. If you only train on chits, the model will forget about phones. This is called "catastrophic forgetting."

---

## Removing or Correcting Labels

Sometimes you discover labels are wrong after training.

### Signs Your Labels Need Fixing:
- Model keeps confusing two classes (phone vs calculator)
- Accuracy is stuck and won't improve no matter what you try
- You look at the errors and realize many "wrong" predictions are actually wrong LABELS

### How to Fix:

1. **Look at what the model gets wrong** — these are likely wrong labels
2. **Check those specific images** — is the label or the model wrong?
3. **Fix the wrong labels** in your labeling tool
4. **Retrain** the model on the corrected dataset

```
Model says "phone" but label says "no_phone"
→ Look at the image
→ Oh wait, there IS a phone! The label was wrong!
→ Fix label to "phone"
→ Retrain
→ Model improves
```

### Reducing Classes:

If you originally labeled 5 types but realize you only need 3:

| Original Labels | Simplified Labels |
|:---|:---|
| phone, smartphone, mobile | All become "phone" |
| chit, paper_note, cheat_sheet | All become "chit" |
| earpiece, earbud, airpod | All become "earpiece" |

Merge similar labels → retrain → simpler and often more accurate model.

---

## ExamGuard Labeling Plan

| Object | Label Type | Target Count | Tool | Labeling Rules |
|:---|:---|:---|:---|:---|
| Phone | Bounding box | 500 images | Roboflow | Include partial phones, phones in hands, phones screen-off |
| Chit (cheat sheet) | Bounding box | 300 images | Roboflow | Include folded papers, written notes, any paper not an exam sheet |
| Earpiece | Bounding box | 200 images | Roboflow | Include any visible ear device, even partially hidden by hair |
| Normal behavior | Classification (video clip) | 200 clips | CVAT | Student looking at own paper, writing, sitting normally |
| Suspicious behavior | Classification (video clip) | 200 clips | CVAT | Turning head repeatedly, reaching into pocket, passing items |

### Timeline Estimate:

| Task | Time Needed |
|:---|:---|
| Label 500 phone images (bounding boxes) | ~8-12 hours |
| Label 300 chit images | ~5-8 hours |
| Label 200 earpiece images | ~3-5 hours |
| Label 400 video clips (classification) | ~6-8 hours |
| Review and fix disagreements | ~3-4 hours |
| **Total** | **~25-37 hours** |

This is real work. Labeling is the most time-consuming part of an ML project. But every minute spent on good labels pays back 10x in model accuracy.

---

## Labeling Checklist

| # | Task | Done? |
|:---|:---|:---|
| 1 | Decided which label type I need (classification / bounding box / segmentation) | |
| 2 | Written a labeling guide with clear rules for edge cases | |
| 3 | Chosen a labeling tool (Roboflow / LabelImg / CVAT) | |
| 4 | Labeled at least 200 images per class | |
| 5 | Had a second person check at least 50 random labels | |
| 6 | Agreement rate is above 90% | |
| 7 | Fixed any disagreements | |
| 8 | Exported in the right format for my model (YOLO format, etc.) | |

---

> **Key Takeaway: Good labels are the foundation of good models. Spending an extra day on careful labeling can be the difference between a 75% model and a 95% model. Label thoughtfully, be consistent, and always double-check.**
