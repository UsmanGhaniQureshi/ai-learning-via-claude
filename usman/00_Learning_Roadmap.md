# My Learning Roadmap — Stand On My Own Feet

> **Goal:** Stop depending on Claude for everything. Learn independently. Build a strong foundation. Then build real projects on my own.

> **Rule:** Don't skip steps. Each step builds on the previous one.

---

## Step 1: Python + Data Skills (FOUNDATION — Do This First)

**WHY:** I know basic Python but I don't know NumPy, Pandas, Matplotlib — the tools needed to handle data, train models, and visualize results. Without these, I can't do ML independently.

### Pick ONE Course:

| Course | Platform | Price | WHY This One |
|:---|:---|:---|:---|
| **100 Days of Code: Python Pro Bootcamp** — Dr. Angela Yu | Udemy | ~$15 | 4.7 stars, 1.4M students. Project-based — build something EVERY day. Best for my learning style. |
| **Python for Data Science, AI & Development** — IBM | Coursera | Free to audit | Shorter, focused on data science Python specifically. Good for fast track. |

### YouTube (Free Supplement):
- **Corey Schafer** — Best Python tutorials on YouTube. Clear, no fluff. Search "Corey Schafer Pandas tutorial"
- **freeCodeCamp** — "Python for Data Science" full course (4+ hours, free)

### What I'll Learn:
- NumPy (arrays, math operations)
- Pandas (loading data, filtering, grouping, cleaning)
- Matplotlib (charts, graphs, visualizations)
- Data handling (CSV files, JSON, databases)

### How I Know I'm Done:
- [ ] I can load a CSV file with Pandas and answer questions about the data
- [ ] I can create charts with Matplotlib showing trends
- [ ] I can clean messy data (missing values, wrong types, duplicates)

---

## Step 2: Machine Learning (BIGGEST GAP — Learn to Train Models)

**WHY:** I've ONLY used pre-trained models (YOLO, MediaPipe, Vosk). I've never trained one myself. Training is the core ML skill. This is where 01_Foundations, 02_Problem_Data, and 03_Model_Selection all come together.

### Pick ONE Course:

| Course | Platform | Price | WHY This One |
|:---|:---|:---|:---|
| **Machine Learning A-Z: AI, Python & R** | Udemy | ~$15 | **#1 PICK.** 1M+ students, 4.5 stars. Covers EVERY algorithm with hands-on Python. Train classification, regression, clustering. |
| **Machine Learning Specialization** — Andrew Ng | Coursera | Free to audit | The GOLD STANDARD. Andrew Ng is the godfather of ML education. 3 courses. More math-heavy but deepest understanding. |

### YouTube (Free — ESSENTIAL):
- **StatQuest with Josh Starmer** — THE best channel for understanding ML algorithms. He explains WHY things work, not just how.
  - Search: "StatQuest Random Forest", "StatQuest Cross Validation", "StatQuest Gradient Descent"
  - When I don't understand an algorithm → search "StatQuest + [algorithm name]"
- **Sentdex** — Practical Python ML tutorials. Builds real projects.

### What I'll Learn:
- Train/test split — splitting data correctly
- Scikit-learn — the #1 ML library
- Classification (predict categories) — Logistic Regression, Decision Trees, Random Forest, SVM, KNN
- Regression (predict numbers) — Linear, Polynomial
- Clustering (find groups) — K-Means, DBSCAN
- Evaluation — precision, recall, F1 score, confusion matrix
- Feature engineering — turning raw data into model inputs
- Overfitting/underfitting — knowing when your model is learning wrong

### How I Know I'm Done:
- [ ] I can train a classifier that predicts something with >80% accuracy
- [ ] I can explain train/test split and WHY it matters
- [ ] I can read a confusion matrix and know if my model is good or bad
- [ ] I can choose the right algorithm for a given problem (using my 03_Model_Selection knowledge)

---

## Step 3: Deep Learning + Computer Vision (Understand What's INSIDE YOLO and MediaPipe)

**WHY:** I use YOLO and MediaPipe as black boxes. After this step, I'll understand HOW they work internally — what a CNN is, how it learns to detect objects, why transfer learning works.

### Pick ONE Course:

| Course | Platform | Price | WHY This One |
|:---|:---|:---|:---|
| **Deep Learning Specialization** — Andrew Ng | Coursera | Free to audit | **THE BEST.** 5 courses. Neural networks → CNN → sequence models → transformers. After this, I'll understand YOLO and MediaPipe internals. |
| **PyTorch for Deep Learning & Computer Vision Bootcamp** | Udemy | ~$15 | More practical, less math. Build CNNs, train on images, deploy models. Good if I prefer building over theory. |

### YouTube (Free — MUST WATCH):
- **3Blue1Brown** — "Neural Networks" series (4 videos, ~1 hour total)
  - "But what is a neural network?" — https://www.youtube.com/watch?v=aircAruvnKk
  - "Gradient descent" — how learning actually happens
  - "Backpropagation" — how the network adjusts itself
  - **WATCH THIS BEFORE ANYTHING ELSE.** Changes how I understand everything in 01_Foundations and 03_Deep_Dives.
- **Andrej Karpathy** — "Let's build GPT from scratch." Former Tesla AI director. Advanced but eye-opening.

### What I'll Learn:
- How neural networks actually learn (forward pass → loss → backpropagation → weight update)
- CNNs — how they detect features in images (edges → shapes → objects)
- Why YOLO is fast (single-shot detection vs two-stage)
- Transfer learning — using a pre-trained model and fine-tuning for my specific task
- PyTorch or TensorFlow — building and training networks from code

### How I Know I'm Done:
- [ ] I can build a CNN from scratch that classifies images
- [ ] I can explain how backpropagation works (not just "it adjusts weights")
- [ ] I can fine-tune a pre-trained model for a custom task
- [ ] I understand WHY YOLO is fast and HOW MediaPipe detects face landmarks

---

## Step 4: NLP + Audio Processing (For Confidence Detector)

**WHY:** I built the speech engine using Vosk and pattern matching but I don't deeply understand HOW speech recognition works, or how to build better text analysis.

### Courses:

| Course | Platform | Price | WHY |
|:---|:---|:---|:---|
| **NLP Mastery in Python** | Udemy | ~$15 | 38 hours. Text processing, sentiment analysis, speech-to-text. Directly applies to filler/hedging detection. |
| **Spoken Language Processing in Python** | DataCamp | Paid | Short, focused specifically on audio → text processing in Python. |

### What I'll Learn:
- Tokenization, stemming, lemmatization
- TF-IDF (term frequency — how important is each word?)
- Sentiment analysis (positive/negative/neutral from text)
- Speech recognition internals (acoustic models, language models)
- Audio processing (FFT, pitch extraction, spectrograms)

### How I Know I'm Done:
- [ ] I can build a sentiment classifier from scratch (not using a pre-trained API)
- [ ] I understand how Vosk converts sound waves to text internally
- [ ] I can extract pitch and volume from raw audio using FFT

---

## Step 5: System Design + Deployment (Make It Real)

**WHY:** Both my projects only run on localhost. A real product needs to be deployed, have a database, handle users.

### Courses:

| Course | Platform | Price | WHY |
|:---|:---|:---|:---|
| **FastAPI Complete Course 2026** | Udemy | ~$15 | I already use FastAPI but don't know it deeply. Auth, databases, deployment. |
| **The Ultimate React Course** | Udemy | ~$15 | Deepen React — state management, performance, real-world patterns. |

### What I'll Learn:
- Database (SQLite/PostgreSQL) — store session data, user history
- Authentication — user login, API keys
- Docker — package my app so it runs anywhere
- Deployment — put it on the internet (Vercel, Railway, AWS)
- Performance optimization — caching, lazy loading, Web Workers

### How I Know I'm Done:
- [ ] My Confidence Detector is live on the internet (not just localhost)
- [ ] It has a database storing session history
- [ ] Someone else can open a URL and use it

---

## YouTube Channels — Watch Regularly

| Channel | What They Teach | WHY Essential | Watch When |
|:---|:---|:---|:---|
| **3Blue1Brown** | Neural networks, math visually | Makes me UNDERSTAND, not just memorize | Before Step 3 — watch "Neural Networks" playlist |
| **StatQuest (Josh Starmer)** | Every ML algorithm explained simply | When I don't understand an algorithm from my course | During Step 2 — search "StatQuest + [topic]" |
| **Sentdex** | Practical Python ML projects | Builds real things. Matches my learning style. | During Step 2 and 3 |
| **Corey Schafer** | Python, Pandas, Flask, OOP | Best Python teacher. Clean, no fluff. | During Step 1 |
| **freeCodeCamp** | Full free courses (3-12 hours) | Complete courses for free | Any time — search "freeCodeCamp + [topic]" |

---

## My Timeline

```
MONTH 1:
  ☐ Watch 3Blue1Brown Neural Networks playlist (1 hour, free) — DO THIS TODAY
  ☐ Start Step 1: Python data skills course
  ☐ Watch StatQuest videos alongside
  ☐ Practice: Load a dataset, clean it, visualize it

MONTH 2:
  ☐ Step 2: Machine Learning course (ML A-Z or Andrew Ng)
  ☐ Train my FIRST model from scratch
  ☐ StatQuest for every algorithm I don't understand
  ☐ Mini project: Train a classifier on a real dataset

MONTH 3:
  ☐ Step 3: Deep Learning course
  ☐ Build a CNN from scratch
  ☐ NOW I understand how YOLO and MediaPipe work inside
  ☐ Go back to ExamGuard and Confidence Detector with new understanding

MONTH 4:
  ☐ Step 4: NLP + Audio processing
  ☐ Step 5: Deployment
  ☐ Deploy Confidence Detector to the web
  ☐ Build a new mini project completely on my own — NO Claude help
```

---

## Links (Quick Access)

### Courses:
- Udemy ML A-Z: https://www.udemy.com/course/machinelearning/
- Coursera Andrew Ng ML: https://www.coursera.org/specializations/machine-learning-introduction
- Coursera Andrew Ng Deep Learning: https://www.coursera.org/specializations/deep-learning
- Udemy 100 Days Python: https://www.udemy.com/course/100-days-of-code/
- Udemy NLP Mastery: https://www.udemy.com/course/nlp-in-python/
- Udemy FastAPI: https://www.udemy.com/course/fastapi-the-complete-course/
- Udemy Ultimate React: https://www.udemy.com/course/the-ultimate-react-course/
- Udemy PyTorch CV: https://www.udemy.com/course/deep-learning-pytorch/
- OpenCV University: https://opencv.org/university/
- LearnOpenCV: https://learnopencv.com/

### YouTube:
- 3Blue1Brown Neural Networks: https://www.youtube.com/watch?v=aircAruvnKk
- StatQuest: https://www.youtube.com/c/joshstarmer
- Sentdex: https://www.youtube.com/c/sentdex
- Corey Schafer: https://www.youtube.com/c/Coreyms
- freeCodeCamp: https://www.youtube.com/c/Freecodecamp

---

## The Rule

> **"When I get stuck, I search StatQuest or 3Blue1Brown FIRST. Then YouTube. Then documentation. Claude is the LAST resort — not the first."**

This is how I stop depending on Claude and start thinking for myself.
