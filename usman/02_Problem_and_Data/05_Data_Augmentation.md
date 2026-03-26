# 4. Data Augmentation — "My Data is Too Small, How to Make It Bigger?"

> **You asked: "I have data but so small, how can I make that a bit big?"**
> **Answer: Augmentation — creating new training data by modifying existing data.**

---

## Why Small Data is a Problem

When you have very little data, the model **memorizes** instead of **learning**.

Think of it like a student who only studies 5 past papers:
- They memorize those 5 exact papers word-by-word
- A new question comes → they're lost because they never learned the CONCEPT
- This is called **overfitting** — the model is too focused on the training data

Now imagine a student who studies 500 past papers:
- They see the same concepts appear in different forms
- They learn the PATTERN, not the exact question
- New question comes → they can handle it because they understand the underlying idea

**More data = model learns the PATTERN, not the specific examples.**

---

## Image Augmentation Techniques

Each technique takes your original image and creates a slightly different version. The model sees each version as a "new" example.

### 1. Horizontal Flip (Mirror)

| What it does | Flips the image left-to-right, like looking in a mirror |
|:---|:---|
| **ExamGuard example** | Phone on left side of desk → now phone on right side of desk |
| **When to use** | Objects that look the same from both sides |
| **When NOT to use** | Text recognition (flipped text is unreadable), clocks, anything with direction |

```
Original:  [phone on LEFT of desk]
Flipped:   [phone on RIGHT of desk]
→ Model learns: phone can be anywhere on the desk
```

### 2. Rotation (5-30 degrees)

| What it does | Tilts the image slightly, like a tilted camera |
|:---|:---|
| **ExamGuard example** | Straight desk view → slightly angled desk view |
| **When to use** | When camera angle might vary slightly in real life |
| **When NOT to use** | When orientation matters (satellite images where North must be up) |

```
Original:  [straight desk]
Rotated:   [desk tilted 15°]
→ Model learns: desk doesn't have to be perfectly straight
```

### 3. Brightness Change

| What it does | Makes image brighter or darker |
|:---|:---|
| **ExamGuard example** | Morning exam (bright sunlight) vs evening exam (dim lights) |
| **When to use** | Almost always — lighting changes in real life |
| **When NOT to use** | When brightness IS the feature you're detecting |

```
Original:  [normal lighting desk]
Brighter:  [sunny morning exam hall]
Darker:    [evening exam hall with dim lights]
→ Model learns: detect phone regardless of lighting
```

### 4. Zoom In / Zoom Out

| What it does | Crops to center (zoom in) or adds padding (zoom out) |
|:---|:---|
| **ExamGuard example** | Camera close to desk vs camera far from desk |
| **When to use** | When distance from camera varies |
| **When NOT to use** | When exact size of object matters for your task |

```
Original:  [full desk view with phone]
Zoomed in: [close-up of phone area]
→ Model learns: detect phone at different sizes
```

### 5. Add Noise (Grain)

| What it does | Adds random dots/grain like a cheap camera |
|:---|:---|
| **ExamGuard example** | Cheap CCTV camera produces grainy footage |
| **When to use** | When your real cameras are low quality |
| **When NOT to use** | When you need pixel-perfect clarity (medical imaging) |

```
Original:  [clean, clear image]
Noisy:     [same image but slightly grainy]
→ Model learns: detect phone even with cheap camera quality
```

### 6. Random Crop

| What it does | Cuts out a portion of the image |
|:---|:---|
| **ExamGuard example** | Sometimes CCTV only captures half the desk |
| **When to use** | When objects might be partially visible |
| **When NOT to use** | When you need to see the full object every time |

```
Original:  [full desk with phone in corner]
Cropped:   [just the corner area with phone]
→ Model learns: detect phone even if only partially visible
```

### 7. Color Shift / Hue Change

| What it does | Slightly changes the colors (warmer, cooler, more blue, more red) |
|:---|:---|
| **ExamGuard example** | Fluorescent lights (bluish) vs warm bulbs (yellowish) |
| **When to use** | When lighting color varies in real life |
| **When NOT to use** | When color IS what you're classifying (ripe vs unripe fruit) |

```
Original:  [normal colors]
Shifted:   [slightly blue tint — fluorescent lighting]
→ Model learns: detect phone regardless of light color
```

### 8. Blur

| What it does | Makes image slightly blurry |
|:---|:---|
| **ExamGuard example** | Camera slightly out of focus or student moves quickly |
| **When to use** | When real images might have motion blur or focus issues |
| **When NOT to use** | When fine detail is critical (reading text, fingerprints) |

```
Original:  [sharp, clear desk image]
Blurred:   [slightly out-of-focus desk image]
→ Model learns: detect phone even when image isn't perfectly sharp
```

---

## The Augmentation Math: 500 → 3000-5000

Here's how a small dataset grows:

| Start | + Flip | + Rotate (3 angles) | + Brightness (2 levels) | + Noise | Total |
|:---|:---|:---|:---|:---|:---|
| 500 | +500 | +1500 | +2000 | +3000 | ~3000-5000 |

Each original image can produce 6-10 variations. So:
- **500 originals x 6 augmentations = 3,000 images**
- **500 originals x 10 augmentations = 5,000 images**

You don't have to use all techniques. Pick the ones that make sense for your problem.

---

## Text Augmentation (For NLP Tasks)

If you're working with text data (reviews, comments, chat messages), you can augment text too:

| Technique | Original | Augmented | When to Use |
|:---|:---|:---|:---|
| **Synonym replacement** | "The phone is on the desk" | "The mobile is on the table" | Classification tasks |
| **Back-translation** | "The student is cheating" → translate to Urdu → translate back | "The pupil is engaging in dishonesty" | When you need diverse phrasing |
| **Random insertion** | "phone on desk" | "phone clearly on desk" | Adding variety to short text |
| **Random deletion** | "the big black phone on the desk" | "the phone on desk" | Making model robust to missing words |

---

## Number/Tabular Augmentation: SMOTE

For spreadsheet-type data (numbers in rows and columns):

**SMOTE** (Synthetic Minority Oversampling Technique) creates new fake rows by:
1. Finding a minority class sample (e.g., "cheating" row)
2. Finding its nearest neighbor (most similar "cheating" row)
3. Creating a new point between them

```
Real data point:    exam_score=45, eye_movement=high, hand_movement=high → cheating
Nearest neighbor:   exam_score=50, eye_movement=high, hand_movement=medium → cheating
SMOTE creates:      exam_score=47, eye_movement=high, hand_movement=high → cheating
                    (averaged values = new realistic fake data)
```

---

## Tools for Augmentation

| Tool | Type | Difficulty | Best For |
|:---|:---|:---|:---|
| **Roboflow** | Web app (click buttons) | Easy — no code | Image augmentation, auto-applies best settings |
| **Albumentations** | Python library | Medium | Fine control over image augmentations |
| **torchvision.transforms** | Python library | Medium | PyTorch users, standard augmentations |
| **imgaug** | Python library | Medium | Advanced image augmentations |
| **nlpaug** | Python library | Medium | Text augmentation |
| **imbalanced-learn** | Python library | Medium | SMOTE for tabular data |

### Roboflow (Easiest — No Code)

1. Upload your images to Roboflow
2. Click "Generate" → "Augmentation"
3. Toggle on: Flip, Rotation, Brightness, Noise
4. Click "Generate" → it creates augmented versions automatically
5. Download the bigger dataset

### Albumentations (Python — More Control)

```python
import albumentations as A

# Define what augmentations to apply
transform = A.Compose([
    A.HorizontalFlip(p=0.5),           # 50% chance of flipping
    A.Rotate(limit=30, p=0.5),          # Rotate up to 30 degrees
    A.RandomBrightnessContrast(p=0.5),  # Change brightness
    A.GaussNoise(p=0.3),                # Add noise 30% of the time
    A.Blur(blur_limit=3, p=0.2),        # Slight blur 20% of the time
])

# Apply to an image
augmented = transform(image=original_image)
new_image = augmented["image"]
```

---

## The Golden Rule of Augmentation

> **Augmentation helps, but REAL data is ALWAYS better.**

| Data Type | Model Accuracy (typical) |
|:---|:---|
| 500 real images | 85% |
| 200 real + 300 augmented (500 total) | 78% |
| 200 real + 800 augmented (1000 total) | 80% |
| 500 real + 500 augmented (1000 total) | 88% |

**The pattern:**
- 500 real images beats 1000 images where most are augmented
- Augmented data helps MOST when combined with a decent amount of real data
- Never rely on augmentation alone — always try to get more real data too

**Think of it this way:**
- Real data = actual meals (nutritious)
- Augmented data = vitamin supplements (helpful but not a replacement)

---

## Practical ExamGuard Walkthrough: 200 → 1200

Let's say you collected 200 photos of phones on desks for ExamGuard:

### Step 1: Start with 200 Real Photos
- 100 photos with phone on desk
- 100 photos without phone (just desk)

### Step 2: Choose Relevant Augmentations

| Augmentation | Why It Makes Sense for ExamGuard |
|:---|:---|
| Horizontal flip | Phone could be on left or right side of desk |
| Brightness change | Morning exams vs evening exams, different hall lighting |
| Slight rotation (5-15°) | Camera might not be perfectly straight |
| Add noise | Some CCTV cameras are low quality |
| Blur | Students might move, causing motion blur |

Augmentations we SKIP for ExamGuard:

| Augmentation | Why We Skip It |
|:---|:---|
| Vertical flip | Desks don't appear upside-down from CCTV |
| Heavy rotation (90°+) | Camera is always roughly overhead |
| Extreme zoom out | Camera distance is fixed |

### Step 3: Apply Augmentations (Using Roboflow)

1. Upload 200 images to Roboflow
2. Turn ON: Flip horizontal, Brightness (-25% to +25%), Rotation (-15° to +15°), Noise (up to 5%)
3. Set output to 3x (each image generates 3 versions)
4. Click Generate

### Step 4: Result

| Category | Original | After Augmentation |
|:---|:---|:---|
| Phone on desk | 100 | 400 |
| No phone | 100 | 400 |
| **Total** | **200** | **800** |

With a few more rounds of augmentation or tweaked settings:

| Final Count | Images |
|:---|:---|
| Original real photos | 200 |
| Augmented versions | 1,000 |
| **Total training set** | **1,200** |

### Step 5: Train and Compare

| Training Data | Expected Accuracy |
|:---|:---|
| 200 original only | ~70% |
| 1,200 with augmentation | ~82% |
| 1,200 real photos (if we had them) | ~90% |

The augmented model is significantly better than 200 images alone. But if you can collect more real photos, always do that first.

---

## Quick Decision Guide

```
Do you have enough data? (Check minimum table in Chapter 3)
├── YES → Skip augmentation, go to cleaning
└── NO → How far below minimum?
    ├── Slightly below (have 150, need 200)
    │   → Light augmentation (flip + brightness) gets you there
    ├── Significantly below (have 100, need 500)
    │   → Heavy augmentation + try to collect more real data
    └── Way below (have 20, need 500)
        → Augmentation alone won't save you
        → Must collect more real data first
        → Or use a pre-trained model (Chapter 6)
```

---

> **Key Takeaway: Augmentation is like photocopying your notes with slight changes. It helps you study more, but nothing beats having more actual notes to study from. Use it to fill gaps, not as your main strategy.**
