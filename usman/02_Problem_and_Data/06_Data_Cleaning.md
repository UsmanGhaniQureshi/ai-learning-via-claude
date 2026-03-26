# 5. Data Cleaning — "How to Fix Garbage Data"

> **The #1 rule of machine learning: Garbage In = Garbage Out.**
> If you feed a model bad data, it will learn bad things. No algorithm can fix bad data.

---

## The 80/20 Rule of ML Engineering

Here's something nobody tells beginners:

| Activity | Time Spent |
|:---|:---|
| **Data collection + cleaning + fixing** | **80%** |
| Choosing a model | 5% |
| Training the model | 5% |
| Tuning and improving | 10% |

ML engineers spend **80% of their time on data**, not on fancy algorithms. A clean, simple dataset with a basic model beats a messy dataset with the most advanced model every single time.

---

## Common Problems and How to Fix Each

### Problem 1: Missing Values

Some rows have empty cells. This happens a lot in real-world data.

**Example — Student exam data:**

| Student | Score | Attendance | Result |
|:---|:---|:---|:---|
| Ali | 78 | 85% | Pass |
| Sara | | 90% | Pass |
| Ahmed | 45 | | Fail |
| Fatima | 92 | 95% | |

Three rows have missing data. What do you do?

**Option A: Delete the row** (simplest)
- Remove Sara, Ahmed, and Fatima's rows entirely
- When to use: You have LOTS of data and only a few rows are missing values
- When NOT to use: You'd lose too much data (more than 10-15% of your dataset)

**Option B: Fill with average** (for numbers)
- Sara's missing score → average of all other scores = (78+45+92)/3 = 72
- Ahmed's missing attendance → average of all other attendance = (85+90+95)/3 = 90%
- When to use: The missing values are random, not systematic

**Option C: Fill with most common value** (for categories)
- Fatima's missing result → most common result in data = "Pass"
- When to use: For text/category columns, not numbers

**Decision table:**

| Situation | Best Fix |
|:---|:---|
| Less than 5% of data is missing | Delete those rows |
| 5-20% missing in one column | Fill with average (numbers) or most common (categories) |
| More than 20% missing in one column | That column is unreliable — consider removing the entire column |
| Entire rows are mostly empty | Delete those rows |

---

### Problem 2: Duplicate Rows

The same data appears more than once. This tricks the model into thinking that specific example is more important.

**How to detect:**
```python
# In Python with Pandas
import pandas as pd
data = pd.read_csv("exam_data.csv")

# Count duplicates
print(data.duplicated().sum())  # Shows: "47 duplicates found"

# Remove duplicates
data_clean = data.drop_duplicates()
print(f"Before: {len(data)} rows → After: {len(data_clean)} rows")
```

**For images:** Look for files with same size, same name pattern, or use a duplicate image finder tool. Sometimes the same image appears with different filenames.

---

### Problem 3: Wrong Labels

This is the most dangerous problem. If an image of a book is labeled "phone", the model learns that books are phones.

**How to find wrong labels:**
1. Randomly pick 50 samples from your dataset
2. Look at each one and check: does the label match what you see?
3. Count how many are wrong

| Wrong Labels Found (out of 50) | Data Quality | Action |
|:---|:---|:---|
| 0-2 | Good | Small fixes, proceed |
| 3-5 | Concerning | Check 100 more, fix all wrong ones |
| 6-10 | Bad | Need systematic review of entire dataset |
| 10+ | Terrible | Consider finding a different dataset |

**ExamGuard example:** You check 50 images. 3 are labeled "phone" but actually show a calculator. Fix: relabel those 3 as "calculator" or "not phone".

---

### Problem 4: Outliers (Impossible Values)

Numbers that don't make any sense.

| Column | Outlier Value | Why It's Wrong | Fix |
|:---|:---|:---|:---|
| Age | 500 | Nobody is 500 years old | Probably meant 50 — fix or delete |
| Salary | -10,000 | Negative salary? | Data entry error — delete or investigate |
| Height (cm) | 12 | 12cm is an insect, not a person | Probably 120 — fix or delete |
| Exam score | 150 | Maximum is 100 | Typo — delete or cap at 100 |
| Temperature (°C) | 99 | That's Fahrenheit, not Celsius | Convert: (99-32) x 5/9 = 37.2°C |

**How to detect outliers:**
- Sort each column from lowest to highest — check the extremes
- Any value more than 3x the average is suspicious
- Use common sense: does this number make sense in the real world?

**ExamGuard example:** Your dataset says one image has dimensions 1x1 pixels. That's obviously broken — remove it.

---

### Problem 5: Wrong Format

Data that's stored as text when it should be numbers, or mixed formats in the same column.

| Raw Value | Problem | Clean Value |
|:---|:---|:---|
| "Rs 50,000" | Text with currency symbol and comma | 50000 |
| "5-Mar-2024" | Date as text | 2024-03-05 |
| "$12.5K" | Abbreviation | 12500 |
| "85%" | Percentage as text | 0.85 |
| "N/A" | Text instead of empty | (empty/null) |
| "three" | Word instead of number | 3 |

**The fix:** Convert everything to a consistent format before training.

```python
# Example: Clean salary column
data["salary"] = data["salary"].str.replace("Rs ", "")
data["salary"] = data["salary"].str.replace(",", "")
data["salary"] = data["salary"].astype(int)
# "Rs 50,000" → 50000
```

---

### Problem 6: Inconsistent Categories

Same thing written in different ways:

| What's in the data | Should be |
|:---|:---|
| "Male", "male", "M", "m", "MALE", "Male " | "Male" |
| "Lahore", "lahore", "LHR", "Lahor" | "Lahore" |
| "Phone", "phone", "PHONE", "Mobile Phone" | "phone" |
| "Yes", "yes", "Y", "1", "TRUE" | "yes" |

The model treats "Male" and "male" as two completely different categories. You need to standardize.

```python
# Fix: Convert to lowercase and strip spaces
data["gender"] = data["gender"].str.lower().str.strip()
# "Male", "male", "MALE", "Male " → all become "male"
```

**ExamGuard example:** Some images are labeled "Phone", others "phone", others "mobile_phone". Standardize all to "phone".

---

### Problem 7: Blurry or Dark Images

For image datasets, some images might be unusable:

| Problem | How to Detect | Fix |
|:---|:---|:---|
| Completely black image | File exists but all pixels are 0 | Delete |
| Completely white image | All pixels are 255 | Delete |
| Too blurry to see anything | Calculate blur score (variance of Laplacian) | Delete if below threshold |
| Too dark to see | Average brightness below 20 (out of 255) | Try brightening, or delete |
| Too small (thumbnail) | Image dimensions below 64x64 pixels | Delete — not enough detail |

```python
import cv2

# Check if image is too blurry
image = cv2.imread("exam_photo.jpg")
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()

if blur_score < 100:
    print("Too blurry — remove this image")
else:
    print("Sharp enough — keep it")
```

---

### Problem 8: Wrong File Types

Your model expects .jpg images but you have a mix:

| File Type | Issue | Fix |
|:---|:---|:---|
| .bmp | Huge file size, some tools don't support | Convert to .jpg or .png |
| .tiff | Not supported by many ML frameworks | Convert to .jpg or .png |
| .webp | Some tools can't read it | Convert to .jpg or .png |
| .gif | Animated — which frame to use? | Extract first frame, save as .jpg |
| .png (with transparency) | Transparency channel confuses some models | Convert to .jpg (removes transparency) |

```python
from PIL import Image

# Convert any image to jpg
img = Image.open("photo.bmp")
img = img.convert("RGB")  # Remove transparency if any
img.save("photo.jpg")
```

---

## Data Cleaning for ExamGuard: Full Example

Starting with 800 images from our validated dataset:

| Step | Action | Images Before | Images After |
|:---|:---|:---|:---|
| 1 | Remove 2 completely black images | 800 | 798 |
| 2 | Remove 5 images smaller than 64x64 | 798 | 793 |
| 3 | Remove 8 blurry images (blur score < 100) | 793 | 785 |
| 4 | Remove 12 duplicate images | 785 | 773 |
| 5 | Fix 3 wrong labels (calculator labeled as phone) | 773 | 773 (fixed labels) |
| 6 | Standardize labels: "Phone" → "phone", "No_Phone" → "no_phone" | 773 | 773 (fixed labels) |
| 7 | Convert 15 .png files to .jpg | 773 | 773 (fixed format) |
| 8 | Resize all images to 640x640 (YOLO standard) | 773 | 773 (consistent size) |

**Final clean dataset: 773 images, all correctly labeled, consistent format, consistent size.**

We lost 27 images (3.4%) during cleaning. That's normal and acceptable. Better to have 773 clean images than 800 dirty ones.

---

## Cleaning Tools

| Tool | Best For | How to Use |
|:---|:---|:---|
| **Pandas** (Python) | Cleaning tables/spreadsheets | `pip install pandas` — handles CSV, Excel files |
| **OpenCV** (Python) | Cleaning images | `pip install opencv-python` — resize, blur check, format conversion |
| **Pillow** (Python) | Simple image operations | `pip install Pillow` — convert formats, resize |
| **Excel / Google Sheets** | Quick look at small datasets | Sort, filter, find duplicates visually |
| **Roboflow** | Image dataset cleaning | Web-based, shows health stats of your dataset |

---

## Data Cleaning Checklist

| # | Task | Done? |
|:---|:---|:---|
| 1 | Check for and handle missing values | |
| 2 | Find and remove duplicate rows/images | |
| 3 | Manually verify 50 random labels are correct | |
| 4 | Check for impossible values (outliers) | |
| 5 | Standardize number formats (remove Rs, %, commas) | |
| 6 | Standardize category names (lowercase, consistent spelling) | |
| 7 | Remove blurry, black, white, or tiny images | |
| 8 | Convert all files to consistent format (.jpg, .csv) | |
| 9 | Resize all images to consistent dimensions | |
| 10 | Final count: How many samples remain? Still above minimum? | |

> **If after cleaning you've lost more than 30% of your data, you likely need to find additional data or go back to collection.**

---

## Quick Reference: Problem → Fix

| Problem You See | Quick Fix | Python Tool |
|:---|:---|:---|
| Empty cells | `data.fillna(data.mean())` | Pandas |
| Duplicates | `data.drop_duplicates()` | Pandas |
| "Male"/"male"/"M" | `data["col"].str.lower()` | Pandas |
| "Rs 50,000" → 50000 | `data["col"].str.replace(...)` | Pandas |
| Blurry image | Calculate blur score, delete if low | OpenCV |
| Wrong file type | `Image.open().save("new.jpg")` | Pillow |
| Inconsistent image size | `cv2.resize(img, (640,640))` | OpenCV |

---

> **Key Takeaway: Cleaning data is boring. It's also the most important thing you'll do in ML. A model trained on 500 clean images will beat a model trained on 2,000 dirty images every time. Do the boring work.**
