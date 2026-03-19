# CNN (Convolutional Neural Network)

## What It Does

CNN is a special type of neural network designed to **understand images and video.** It automatically learns to detect patterns in visual data — from simple edges and colors all the way up to complex objects like faces, cars, or (in our case) cheating students.

---

## Real-World Example: ExamGuard Cheating Detection

**Problem:** Detect if a student is **cheating** during an exam using camera footage.

**What happens when a camera frame enters the CNN:**

```
Camera Frame (Raw Image)
        |
        v
Layer 1: EDGES
        Detects basic lines, edges, color boundaries
        "I see some horizontal lines and curved edges"
        |
        v
Layer 2: SHAPES
        Combines edges into shapes
        "I see an oval shape (face), circles (eyes), a line (nose)"
        |
        v
Layer 3: FACE PARTS
        Recognizes specific parts
        "I see two eyes looking to the LEFT, head turned 40 degrees"
        |
        v
Layer 4: UNDERSTANDING
        Puts it all together
        "This student is looking at their neighbor's paper"
        |
        v
FINAL OUTPUT: "CHEATING" (92% confidence)
```

**The data:**

| Input | What CNN Sees | Output |
|-------|--------------|--------|
| Student facing forward, eyes on own paper | Normal posture | **Not Cheating** |
| Student head turned 45 degrees, eyes looking sideways | Suspicious posture | **Cheating** |
| Student looking at own paper, writing | Normal behavior | **Not Cheating** |
| Student passing paper under desk | Unusual hand movement | **Cheating** |

---

## How It Works (Simple Analogy)

**Imagine a team of detectives solving a case, each one specializing in different things:**

- **Detective 1 (First Layer):** Only notices basic things — straight lines, curves, light and dark areas. "I see some edges here."
- **Detective 2 (Second Layer):** Combines Detective 1's findings into shapes. "Those edges form a circle — that's probably an eye."
- **Detective 3 (Third Layer):** Identifies objects from the shapes. "Two eyes, a nose, a mouth — that's a face, and it's turned to the left."
- **Detective 4 (Final Layer):** Makes the final judgment. "A face turned left + eyes looking at the next desk = **CHEATING!**"

Each detective builds on what the previous one found. **Simple patterns combine into more complex understanding.**

---

## Why CNN Is Special (vs Other Models)

Other models need YOU to tell them what features to look for. CNN **figures out the features by itself!**

| Other Models | CNN |
|-------------|-----|
| You manually extract features: "head angle = 35, eye direction = left" | You just give it the raw image — it figures out head angle, eye direction, everything on its own |
| Needs a human expert to decide what's important | Learns what's important from the data |
| Works on numbers in a spreadsheet | Works directly on images and video |

---

## When to Use It

- You're working with **images** (photos, camera frames, medical scans)
- You're working with **video** (which is just a series of images)
- You want to do **computer vision** tasks: face recognition, object detection, image classification
- You have a **large dataset** (thousands of images) OR you can use **transfer learning** (borrowing a pre-trained CNN and adjusting it for your task)

## When NOT to Use It

- Your data is **simple tabular data** (spreadsheet with rows and columns) — CNN is massive overkill. Use Random Forest or Logistic Regression instead
- You have a **very small dataset** (less than a few hundred images) and can't use transfer learning
- You need **instant explanations** of why it made a decision (CNNs are "black boxes" — they work amazingly but it's hard to explain exactly why)
- You don't have a **GPU** (graphics card) for training — CNNs are computationally heavy

---

## ExamGuard Connection

**CNN is THE model for ExamGuard.** This is where everything comes together.

**How ExamGuard would use CNN:**

1. **Camera** captures video of the exam room
2. Each frame (image) is fed into the CNN
3. CNN processes the image through its layers:
   - Edges → Shapes → Face direction → Body posture
4. CNN outputs: **"Cheating" (85%)** or **"Not Cheating" (95%)"**
5. If cheating probability is high → **alert the teacher**

**Training the CNN:**
- Collect thousands of images labeled "Cheating" and "Not Cheating"
- Feed them to the CNN during training
- The CNN learns which visual patterns indicate cheating

**Transfer Learning shortcut:**
- Instead of training from scratch (needs millions of images), we can take a CNN that already knows how to detect faces and objects (like one trained on ImageNet)
- Then fine-tune it with our exam-specific images
- This means we need WAY fewer training images!

---

## Key Terms

| Term | Meaning |
|------|---------|
| **CNN** | Convolutional Neural Network — a neural network designed for images/video |
| **Convolution** | The process of sliding a small filter across the image to detect patterns (like edges, corners). You don't need to understand the math — just know it's how the CNN "scans" the image |
| **Layer** | Each step that processes the image at a deeper level (edges → shapes → objects) |
| **Filter/Kernel** | A small pattern detector — one filter might detect horizontal lines, another detects vertical lines, another detects curves |
| **Feature Map** | The output after a filter scans the image — it highlights where certain patterns were found |
| **Transfer Learning** | Using a CNN that was already trained on millions of images, and adjusting it for YOUR specific task. Like hiring an experienced detective instead of training a new one from scratch |
| **GPU** | Graphics Processing Unit — the special hardware that makes CNN training fast (a regular CPU would take days or weeks) |
