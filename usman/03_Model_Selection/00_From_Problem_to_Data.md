# Step 0: From Problem to Data — "I Have No Data Yet"

> **This is the REAL starting point.** Most courses skip this and assume you already have data. But in real life, you start with just a PROBLEM.

---

## The Key Insight

> **You don't need data to CHOOSE the model. You need the PROBLEM.**
> The problem tells you the model. The model tells you what data to collect.

```
PROBLEM (no data yet)
  ↓
"What does the answer look like?" → WORD / NUMBER / GROUP / STRATEGY
  ↓
"What kind of data would give me that answer?" → images / text / numbers
  ↓
NOW you know: what to collect + which model family
  ↓
GO COLLECT the data
  ↓
Clean it → Train → Test → Deploy
```

---

## Step-by-Step: From Problem to Data

### Step 1: Define the Problem Clearly

Before ANYTHING else, write one sentence:

**"I want to _______________."**

| Vague (Bad) | Clear (Good) |
|:------------|:-------------|
| "I want AI for my business" | "I want to predict which customers will cancel their subscription" |
| "I want to use ML" | "I want to detect phone usage in exam halls" |
| "I need a smart system" | "I want to predict tomorrow's sales amount" |
| "I want to group stuff" | "I want to group my 50K customers into marketing segments" |

If you can't write ONE clear sentence, you're not ready for ML yet. Define the problem first.

---

### Step 2: What Does the Answer Look Like?

Look at your problem sentence. What would the answer be?

| Your Problem | The Answer | Type |
|:-------------|:-----------|:-----|
| "Is this email spam?" | Spam / Not Spam | **WORD** → Classification |
| "How much will this house sell for?" | Rs 72 lakhs | **NUMBER** → Regression |
| "What types of customers do I have?" | Group A, B, C | **GROUPS** → Clustering |
| "Is this transaction fraud?" | Normal / Fraud (but 99.9% normal!) | **WORD but IMBALANCED** → Anomaly Detection |
| "When should ExamGuard alert the invigilator?" | Alert / Don't Alert (depends on context, changes over time) | **STRATEGY** → Reinforcement Learning |

**This is the MOST important step.** The answer type decides EVERYTHING that follows.

---

### Step 3: What Data Do I Need?

Once you know the answer type, you know what data to collect:

| Answer Type | What Data to Collect | Labels Needed? |
|:------------|:--------------------|:---------------|
| **WORD** (Classification) | Examples WITH correct labels | YES — you must label each example |
| **NUMBER** (Regression) | Past records with actual numbers | YES — you need the real numbers |
| **GROUPS** (Clustering) | Just the raw data | NO — model finds groups itself |
| **WEIRD** (Anomaly) | Mostly "normal" data | NO — model learns what normal looks like |
| **STRATEGY** (RL) | A simulator / environment | NO — agent learns by trying |

---

### Step 4: WHERE to Get Data

| Source | Good For | Example |
|:-------|:---------|:--------|
| **Collect Yourself** | Custom problems, unique data | Take 500 photos of exam desks with/without phones |
| **Your Database** | Business problems | Export 10K customer records from CRM |
| **Public Datasets** | Learning, common problems | Kaggle, UCI ML Repository, Google Datasets |
| **Web Scraping** | Text data, prices | Scrape 5K product reviews from Amazon |
| **APIs** | Live data | Weather API for temperature prediction |
| **Synthetic/Augment** | Not enough real data | Flip, rotate, crop your 500 photos to get 2000 |

---

### Step 5: How MUCH Data Do I Need?

| Model Type | Minimum Data | Ideal Data | Why |
|:-----------|:-------------|:-----------|:----|
| Logistic Regression | 500 rows | 5K+ rows | Simple model, learns fast |
| Decision Tree | 500 rows | 5K+ rows | Small trees work on small data |
| Random Forest | 1K rows | 10K+ rows | 100 trees need more examples |
| CNN (from scratch) | 10K images | 100K+ images | Millions of weights to train |
| CNN (Transfer Learning) | 200 images | 1K+ images | Pre-trained, just fine-tuning |
| K-Means | 500 rows | 5K+ rows | Depends on number of groups |
| Autoencoder | 1K normal examples | 10K+ normal | Must learn "normal" deeply |
| RL | Millions of simulated episodes | More = better | Agent needs many tries |

**Rule of thumb:** More data = better model. But start with what you have and see if it works!

---

## 6 Real-World Walk-Throughs

### Example 1: ExamGuard — Phone Detection

```
Problem:  "I want to detect phone usage in exams"
Answer:   "Phone" or "No Phone" = WORD → Classification
Data:     Need labeled IMAGES → photos of desks with/without phones
Labels:   YES — each photo labeled phone/no-phone
Source:   Take 500 photos yourself + augment to 2000
How much: 500 enough for Transfer Learning (YOLO pre-trained)
Model:    YOLO + Transfer Learning (images + real-time + small data)
```

### Example 2: Predict Monthly Sales

```
Problem:  "I want to predict next month's sales amount"
Answer:   Rs 15,00,000 = NUMBER → Regression
Data:     Need past sales records with actual amounts
Labels:   YES — actual monthly sales figures
Source:   Export from company database (last 5 years = 60 records)
How much: 60 rows is small → start with Linear Regression
Model:    Linear Regression first → if R² bad → try RF Regression
```

### Example 3: Customer Segmentation

```
Problem:  "I want to group customers for targeted marketing"
Answer:   Groups (not a specific word or number) → Clustering
Data:     Need customer info: age, spend, visit frequency
Labels:   NO labels needed! Model finds groups itself
Source:   Export 50K customer records from CRM
How much: 50K is plenty for K-Means
Model:    K-Means (marketing wants exactly 3 segments, so K=3)
```

### Example 4: Detect Unusual Exam Behavior

```
Problem:  "I want to flag unusual student behavior during exams"
Answer:   Normal / Unusual — but can't label every type of unusual!
Data:     Need camera footage of NORMAL exam behavior
Labels:   NO — only need examples of "normal"
Source:   Record 100 hours of normal exams
How much: 1K+ normal clips for Autoencoder
Model:    Autoencoder (learns normal, flags anything different)
```

### Example 5: Product Review Sentiment

```
Problem:  "I want to classify customer reviews as positive/negative"
Answer:   Positive / Negative = WORD → Classification
Data:     Need reviews with correct labels
Labels:   YES — each review labeled positive/negative
Source:   Scrape 20K reviews from website OR use existing dataset
How much: 20K is good for Naive Bayes
Model:    Naive Bayes (text data + small dataset)
```

### Example 6: Self-Driving Decision Making

```
Problem:  "AI should learn when to brake, steer, accelerate"
Answer:   Strategy over time = STRATEGY → Reinforcement Learning
Data:     Need a driving SIMULATOR (not real data!)
Labels:   NO labels — define rewards instead
Source:   Build/use driving simulator (CARLA, AirSim)
How much: Millions of simulated episodes
Model:    RL with custom reward system (safe arrival +1000, crash -10000)
```

---

## Common Mistakes

| Mistake | Why It's Wrong | What to Do |
|:--------|:--------------|:-----------|
| "I'll collect ALL possible data first" | You might collect the WRONG data | Decide the model type FIRST, then collect the RIGHT data |
| "I need millions of records" | Many models work with 500-5K | Check the minimum table above |
| "I have data but no problem" | Data without purpose = wasted effort | Always start with the PROBLEM, not the data |
| "I'll use Deep Learning for everything" | DL needs 100K+ data. On 5K it will OVERFIT | Match model complexity to data size |
| "I'll label the data later" | You might need labels NOW for supervised | Decide supervised vs unsupervised FIRST |

---

## The Complete Flow

```
1. PROBLEM → "I want to ___________" (one clear sentence)
2. ANSWER  → What does the answer look like? (WORD / NUMBER / GROUP / STRATEGY)
3. DATA    → What data do I need? What type? (images / text / numbers)
4. SOURCE  → Where to get it? (collect / database / public / scrape)
5. AMOUNT  → How much? (check minimum table)
6. MODEL   → Now go to "01_How_To_Choose.md" to pick the exact model!
```

> **PROBLEM → ANSWER → DATA → SOURCE → AMOUNT → MODEL**

---

## Mini Summary

- You don't need data to start. You need a CLEAR PROBLEM.
- The problem tells you the answer type (WORD/NUMBER/GROUP/STRATEGY)
- The answer type tells you what data to collect and whether you need labels
- The data type (images/text/numbers) narrows down the model
- THEN go collect the data and use the 5 Questions to pick the exact model

> 📝 *Next: Once you have data, go to [01_How_To_Choose.md](01_How_To_Choose.md) to pick the exact model*
