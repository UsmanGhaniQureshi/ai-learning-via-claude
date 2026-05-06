# 2. Data Collection — "Where to Get Data"

> **The 4 sources, in order of preference: Already Have → Public Dataset → Pre-trained Model → Collect Yourself**

---

## Source 1: You Already Have It

Most businesses are sitting on data they don't realize:

| Business | Data they already have | Where |
|:---|:---|:---|
| Hospital | Patient records, X-rays, lab results | Hospital software |
| Online store | Orders, clicks, returns, reviews | Website database |
| University | Marks, attendance, feedback | Management system |
| Factory | Sensor readings, defect logs, production counts | SCADA / PLC systems |
| Bank | Transactions, loan history, KYC documents | Core banking system |
| ExamGuard | Camera footage from past exams | CCTV storage/NVR |

**Always check this first. You might already have thousands of records sitting unused.**

---

## Source 2: Public Datasets (FREE)

Someone already collected data for common problems:

| Platform | Best For | URL |
|:---|:---|:---|
| **Kaggle** | Everything — 50,000+ datasets | kaggle.com/datasets |
| **Roboflow Universe** | Image/video datasets with labels | universe.roboflow.com |
| **HuggingFace** | Text/NLP datasets | huggingface.co/datasets |
| **Google Dataset Search** | Search engine for datasets | datasetsearch.research.google.com |
| **UCI ML Repository** | Classic textbook datasets | archive.ics.uci.edu |
| **Papers With Code** | Datasets used in research papers | paperswithcode.com/datasets |
| **GitHub** | Search "dataset" + your topic | github.com |

### How to Search Effectively

Don't search vague terms. Be specific:

| Bad Search | Good Search | Why |
|:---|:---|:---|
| "AI dataset" | "phone detection dataset labeled" | Specific object + labeled |
| "exam cheating" | "exam proctoring image dataset" | Industry term + data type |
| "medical data" | "chest X-ray pneumonia classification" | Specific disease + specific image type |
| "customer data" | "e-commerce customer churn labeled CSV" | Specific problem + format |

### For ExamGuard — Actual Datasets That Exist

| Component | Search Term | Where Found |
|:---|:---|:---|
| Phone detection | "mobile phone detection YOLO" | Roboflow — multiple datasets |
| Face detection | "face detection dataset" | WIDER Face dataset (32K images) |
| Pose estimation | "human pose estimation" | COCO Keypoints (200K+ images) |
| Gaze tracking | "gaze estimation dataset" | MPIIGaze, GazeCapture |
| Cheating behavior | "exam proctoring dataset" | Limited — may need to combine |

---

## Source 3: Pre-Trained Models (Zero Data Needed!)

Some models are already trained on millions of images. Just download and use:

| Model | What It Already Does | Data Needed | Download |
|:---|:---|:---|:---|
| **YOLOv8** | Detect 80 objects (person, phone, laptop, bag...) | ZERO | `pip install ultralytics` |
| **MediaPipe Face** | Face detection + 468 face landmarks | ZERO | `pip install mediapipe` |
| **MediaPipe Pose** | Body skeleton (33 keypoints) | ZERO | Same package |
| **MediaPipe Hands** | Hand tracking (21 points per hand) | ZERO | Same package |
| **ResNet / EfficientNet** | Image classification (1000 categories) | ZERO | `pip install torchvision` |
| **BERT** | Text understanding (sentiment, classification) | ZERO | `pip install transformers` |
| **Whisper** | Speech to text | ZERO | `pip install openai-whisper` |

### When to Use Pre-Trained vs Collect Your Own

```
Pre-trained model detects "phone" → works on your exam room? → YES → DONE!
                                                               → KIND OF (70%) → Fine-tune with 200 your photos
                                                               → NO (30%) → Need to collect more and retrain
```

---

## Source 4: Collect Yourself (Last Resort)

When nothing else works, collect your own data:

### For Images/Video:
```
Equipment: Smartphone camera is fine for v1
Setup:     Match your REAL setup (same camera angle, same room, same lighting)
Quantity:  200 minimum for transfer learning, 500-1000 for good results
Variation: Different angles, different phones, different lighting, different desks

ExamGuard Example:
  Day 1: Empty room → photograph 100 desk setups
         Place phone on desk → 100 photos (different positions, phones, angles)
         Student sitting normally → record 30 min video
         Student "cheating" → record 15 min video (looking around, using phone)
  Day 2: Different room/lighting → repeat
  Total: 200 images + 45 min video = enough to start
```

### For Text:
```
Web scraping (with permission): Reviews, tweets, articles
Manual collection: Surveys, feedback forms
Copy from existing documents: Medical records, support tickets
```

### For Numbers:
```
Export from database: SQL query → CSV file
Manual entry: Spreadsheet
Sensors/IoT: Temperature, pressure, motion sensors
APIs: Weather data, stock prices, social media stats
```

### Labeling Tools (for labeling your collected data):

| Tool | Best For | Free? |
|:---|:---|:---|
| **Roboflow** | Image labeling (bounding boxes) | Free tier |
| **LabelImg** | Image labeling (desktop app) | Free |
| **CVAT** | Video labeling (frame by frame) | Free |
| **Label Studio** | Images + text + audio | Free |
| **Prodigy** | Text labeling (fast) | Paid |

---

## Data Collection Checklist

- [ ] Checked existing data sources first
- [ ] Searched public datasets (Kaggle, Roboflow, HuggingFace)
- [ ] Checked pre-trained models (YOLO, MediaPipe)
- [ ] If collecting: camera/setup matches real deployment
- [ ] At least 200 samples for transfer learning, 500+ for training
- [ ] Data has enough variety (different lighting, angles, subjects)
- [ ] Labeling plan ready (which tool, who labels)

> 📝 *Next: [04_Data_Validation.md](04_Data_Validation.md) — How to check if your data is actually good*
