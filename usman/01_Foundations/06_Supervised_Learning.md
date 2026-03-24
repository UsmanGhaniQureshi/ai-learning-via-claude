# 6. Supervised Learning — Learning WITH a Teacher

> **Part of: Types of Machine Learning — 3 Approaches (Topics 6, 7, 8)**
> After learning WHAT ML is (Topic 5), now learn the 3 ways machines can learn.
> - **Topic 6: Supervised** — learning WITH labeled data (teacher gives answers)
> - **Topic 7: Unsupervised** — learning WITHOUT labels (find patterns alone)
> - **Topic 8: Reinforcement** — learning by trial & error (reward/penalty)

---

## What is Supervised Learning?

You give the model **DATA + CORRECT ANSWERS (labels)**. The model learns the pattern between input and output.

**New Teacher Analogy:** A new teacher gets a class photo WITH names written below. She studies faces + names together. After a few days, she can identify students WITHOUT the name labels. That's supervised — learn from labeled examples, then predict on new data.

---

## Step 1: Is Your Answer a WORD or a NUMBER?

This is the FIRST question you ask. It decides everything.

### If answer is a WORD/CATEGORY → Classification

| Your Problem | Answer | Why it's Classification |
|:-------------|:-------|:----------------------|
| Is this email spam? | "Spam" or "Not Spam" | 2 words to choose from |
| What disease does this patient have? | "Dengue" or "Malaria" or "Flu" | 3 words to choose from |
| Will this student pass? | "Pass" or "Fail" | 2 words |
| What size t-shirt for this customer? | "S" or "M" or "L" or "XL" | 4 words |
| Is this photo a cat or dog? | "Cat" or "Dog" | 2 words |
| Is this student cheating? (ExamGuard) | "Cheating" or "Normal" | 2 words |

### If answer is a NUMBER on a scale → Regression

| Your Problem | Answer | Why it's Regression |
|:-------------|:-------|:-------------------|
| How much will this house cost? | Rs 72 lakhs | A number |
| What will temperature be tomorrow? | 33.5°C | A number |
| How long for food delivery? | 42 minutes | A number |
| What marks will this student get? | 87/100 | A number |
| What will this stock price be? | Rs 2,847 | A number |

### Same Problem Can Be Either!
- "Will this patient have diabetes?" → **Yes/No → Classification**
- "What will his sugar level be next month?" → **195 mg/dL → Regression**

The MODEL depends on what your ANSWER looks like, not the topic.

---

## Step 2: Pick Your Classification Model

### The Decision Flowchart — Read Top to Bottom

```
START: Your answer is a WORD. You have labeled data.
  │
  ├── Is your data IMAGES or VIDEO?
  │     YES → CNN (with Transfer Learning)
  │           Only model that can handle pixels.
  │           No other option exists for visual data.
  │
  │     NO → Your data is numbers/text (tables, spreadsheets)
  │           │
  │           ├── How many categories?
  │           │     │
  │           │     ├── 2 categories (Yes/No, Spam/Not Spam)?
  │           │     │     AND want a simple, interpretable model?
  │           │     │     → START with Logistic Regression (works with small OR large data)
  │           │     │       Simplest. Fastest. If 80%+ accuracy, DONE.
  │           │     │       If accuracy too low → try Random Forest
  │           │     │
  │           │     ├── 3-10 categories (Dog/Cat/Bird, S/M/L/XL)?
  │           │     │     → START with Random Forest
  │           │     │       Handles multiple categories well.
  │           │     │       100 trees vote = reliable.
  │           │     │
  │           │     └── 10+ categories (recognize 50 different products)?
  │           │           → Random Forest or SVM
  │           │             SVM good if groups clearly separable.
  │           │             Random Forest good if messy data.
  │           │
  │           ├── Do you NEED to explain WHY?
  │           │     YES (bank must tell customer WHY loan rejected)
  │           │     → Decision Tree
  │           │       Shows: "Rejected BECAUSE income < 50K AND credit < 600"
  │           │       Only model where you can show the reasoning.
  │           │
  │           └── Just want best accuracy, don't care about speed?
  │                 → Random Forest
  │                   Almost always the best accuracy for tabular data.
  │                   Slower than others, but most reliable.
```

---

### Classification Models — When Your Answer is a WORD

#### 1. Logistic Regression — "The Simple Starter"

**IF your problem looks like:** Yes/No answer, small data, numbers in a spreadsheet → **TRY THIS FIRST**

| Problem | Data | Answer | Why Logistic Regression? |
|:--------|:-----|:-------|:------------------------|
| Email spam filter | 5K emails, features: word count, links, sender | Spam / Not Spam | Small data, 2 categories, fast |
| Customer will buy? | 3K customers, features: age, income, visits | Buy / Won't Buy | Small data, 2 categories |
| Student pass exam? | 2K students, features: attendance, marks, study hours | Pass / Fail | Simple yes/no with few features |

**DON'T use when:** Your data is images, or you have 5+ categories, or patterns are complex.

**Analogy:** Drawing a fence between apples and oranges on a table. One straight line separates them.

---

#### 2. Decision Tree — "The Explainer"

**IF your problem looks like:** Anyone needs to SEE why the decision was made → **USE THIS**

| Problem | Data | Answer | Why Decision Tree? |
|:--------|:-----|:-------|:-------------------|
| Bank loan approval | Income, credit score, existing loans | Approve / Reject | Bank MUST show customer: "Rejected because credit < 600" |
| Hospital triage | Symptoms, vitals, age | Emergency / Urgent / Normal | Doctor needs to see reasoning chain |
| Insurance claim | Damage photos, claim amount, history | Approve / Investigate / Reject | Legal requirement to explain decisions |
| Tax audit selection | Income, deductions, profession | Audit / No Audit | Government must justify why someone was selected |

**DON'T use when:** You just want accuracy and don't care about explanation. Decision Trees are less accurate than Random Forest.

**Analogy:** Playing "20 Questions." Income > 50K? YES → Credit > 700? YES → Loans < 3? YES → APPROVED!

---

#### 3. Random Forest — "The Accuracy King"

**IF your problem looks like:** You want the BEST accuracy. Period. → **USE THIS**

| Problem | Data | Answer | Why Random Forest? |
|:--------|:-----|:-------|:-------------------|
| Disease diagnosis | 50K patients, 30+ symptoms | Dengue / Malaria / Flu / COVID | Many categories, many features, accuracy critical |
| Product quality check | 100K items, 20 measurements | Pass / Fail / Recheck | Accuracy matters more than speed |
| Credit card fraud | 1M transactions, 50 features | Fraud / Normal | Complex patterns, many features |
| Customer churn | 200K customers, behavior data | Will Leave / Will Stay | Lots of data, complex patterns |

**DON'T use when:** You need to explain each decision step (use Decision Tree), or need real-time speed on edge devices.

**Analogy:** 100 doctors examining same patient. Each might make a small mistake. But majority vote of 100 = almost always correct.

---

#### 4. SVM (Support Vector Machine) — "The Boundary Expert"

**IF your problem looks like:** Groups clearly separate from each other, medium data → **TRY THIS**

| Problem | Data | Answer | Why SVM? |
|:--------|:-----|:-------|:---------|
| Handwriting recognition | 10K letters as pixel values | A / B / C / D... | Letters have distinct shapes, clear boundaries |
| Text sentiment | 20K reviews as word vectors | Positive / Negative | Text categories often well-separated |
| Gene classification | 5K gene samples | Cancer Type A / B / C | Medical data often has clear boundaries |

**DON'T use when:** Very large data (>100K rows — too slow), data is messy with no clear boundaries.

**Analogy:** Building a wall between two groups with MAXIMUM empty space on both sides. Wider gap = more confident.

---

#### 5. KNN (K-Nearest Neighbors) — "The Neighbor Checker"

**IF your problem looks like:** Small data, simple pattern, you want an intuitive first try → **TRY THIS**

| Problem | Data | Answer | Why KNN? |
|:--------|:-----|:-------|:---------|
| House category | 500 houses, size + location | Cheap / Medium / Expensive | Tiny data, look at 5 similar houses |
| Movie recommendation | Small user base, ratings | Will Like / Won't Like | Find users most similar to you |
| Plant species | 150 plants, 4 measurements | Setosa / Versicolor / Virginica | Classic small dataset problem |

**DON'T use when:** Large data (>10K rows — checks EVERY point, very slow), many features (>20).

**Analogy:** "You are who your neighbors are." 5 nearest neighbors are rich → you're probably rich too.

---

#### 6. Naive Bayes — "The Text Expert"

**What:** Uses probability to classify. Calculates: "Given these words, what's the probability this email is spam?"

**IF your problem looks like:** Text classification, spam detection, sentiment analysis → **Use Naive Bayes**

| Problem | Data | Answer | Why Naive Bayes? |
|:--------|:-----|:-------|:-----------------|
| Spam filter | 50K emails, word frequencies | Spam/Not | Designed for text, very fast, surprisingly accurate |
| Product review sentiment | 100K reviews | Positive/Negative | Text data, need fast results |
| News categorization | Articles, word counts | Sports/Politics/Tech | Multi-class text, handles it naturally |

**DON'T use when:** Data is images (use CNN) or numeric only (use Random Forest).

**Analogy:** Calculating odds. What are the chances this email is spam if it contains "free", "money", and "click"?

---

#### 7. CNN (Convolutional Neural Network) — "The Eye"

**IF your data is IMAGES or VIDEO → THIS IS YOUR ONLY OPTION. No other model can handle pixels.**

| Problem | Data | Answer | Why CNN? |
|:--------|:-----|:-------|:---------|
| ExamGuard: cheating detection | Camera video frames | Cheating / Normal | VIDEO data = CNN only |
| X-ray diagnosis | 50K chest X-rays | Pneumonia / Normal / COVID | Medical IMAGES = CNN only |
| Self-driving: object detection | Camera feeds | Car / Pedestrian / Sign / Lane | Real-time VIDEO = CNN (YOLO) |
| Product defect | Factory camera photos | Good / Defective | Visual inspection = CNN only |
| Face recognition | Photos of people | Person A / B / C / Unknown | Face IMAGES = CNN only |

**Transfer Learning (CRITICAL — saves months of work):**
You DON'T train CNN from scratch (would need millions of images). Instead:
1. Take a model pre-trained on 14 million images (like ResNet, YOLO)
2. Remove its last layer
3. Add YOUR categories (cheating/normal)
4. Train only your layer with YOUR 5K-10K images
5. Works! 90% of real projects do this.

**DON'T use when:** Data is just numbers in a spreadsheet. CNN is overkill — use Random Forest instead.

---

## Step 3: Pick Your Regression Model

### The Decision Flowchart — Read Top to Bottom

```
START: Your answer is a NUMBER. You have labeled data.
  │
  ├── Try Linear Regression FIRST (always)
  │     It's the simplest. Takes 1 minute.
  │     │
  │     ├── Error acceptably low? (R-squared > 0.80 or average error < 5%) → DONE. Use it.
  │     │     Sometimes the simplest model wins.
  │     │
  │     └── Accuracy bad? Data might be curved or complex.
  │           │
  │           ├── Is the relationship CURVED?
  │           │     (like fertilizer: too little=bad, right=good, too much=bad)
  │           │     → Polynomial Regression
  │           │
  │           ├── Need to EXPLAIN how you got the number?
  │           │     → Decision Tree Regression
  │           │       Shows: "Price is 72L BECAUSE size>1200 AND age<5 AND city center"
  │           │
  │           ├── Want best accuracy for numbers?
  │           │     → Random Forest Regression
  │           │       100 trees average = most reliable number prediction
  │           │
  │           └── Data is MASSIVE (100K+ rows, 50+ features)?
  │                 → Neural Network Regression
  │                   Most powerful but needs tons of data
```

---

### Regression Models — When Your Answer is a NUMBER

#### 1. Linear Regression — "Always Try First"

**IF your problem looks like:** Predict a number from simple data → **TRY THIS FIRST. ALWAYS.**

| Problem | Data | Answer | Why Linear First? |
|:--------|:-----|:-------|:-----------------|
| House price from size | 1K houses, size in sqft | Rs 72 lakhs | Bigger house = more money (straight line!) |
| Salary from experience | 5K employees, years of experience | Rs 8 lakhs/year | More years = more salary (mostly straight) |
| Sales from ad budget | 2 years of data | Rs 50K revenue | More ads = more sales (roughly straight) |

**Even if it's not perfect, start here.** If it gives 75% accuracy, try Random Forest for 85%. But if Linear gives 82%, maybe that's good enough — simpler is better.

---

#### 2. Polynomial Regression — "When Life Isn't Straight"

**IF your problem has a CURVE → use this**

| Problem | Data | Answer | Why Polynomial? |
|:--------|:-----|:-------|:---------------|
| Crop yield vs fertilizer | Fertilizer amount, yield | Tons/hectare | Too little = low, right = high, too much = drops AGAIN |
| Speed vs fuel efficiency | Car speed, km per liter | km/L | Slow = inefficient, medium = best, fast = burns fuel |
| Employee productivity vs hours | Hours worked, output | Units produced | 8 hrs = good, 12 = peak, 16 = drops (exhaustion) |

**How to know it's curved?** Plot your data. If the dots make a U-shape, hill-shape, or wave — it's curved.

---

#### 3. Decision Tree Regression — "The Explainable Number"

**IF you need to SHOW how the number was calculated → use this**

| Problem | Data | Answer | Why Decision Tree? |
|:--------|:-----|:-------|:-------------------|
| Property tax | Size, age, location, type | Rs 45,000/year | Government must show: "BECAUSE size>1500 AND city center" |
| Insurance premium | Age, health, claims history | Rs 12,000/month | Customer asks "WHY so expensive?" — you can show the tree |
| Shipping cost | Weight, distance, urgency | Rs 250 | Customer needs to see calculation logic |

---

#### 4. Random Forest Regression — "Best Accuracy for Numbers"

**IF you want the most accurate number prediction → use this**

| Problem | Data | Answer | Why Random Forest? |
|:--------|:-----|:-------|:-------------------|
| Food delivery time | 500K orders, distance, traffic, weather, restaurant | 42 minutes | Many features, complex patterns, accuracy matters |
| House price (serious) | 50K houses, 20+ features | Rs 72 lakhs | Many features interact (size + location + age + market) |
| Electricity demand | 5 years of hourly data, weather, holidays | 4,500 MW | Complex seasonal patterns |

---

#### 5. Neural Network Regression — "The Heavy Artillery"

**IF your data is MASSIVE and COMPLEX → use this as last resort**

| Problem | Data | Answer | Why Neural Network? |
|:--------|:-----|:-------|:-------------------|
| Stock price | 500K rows, 50+ features (price, volume, news, earnings) | Rs 2,847 | Way too complex for any simple model |
| Weather prediction | Millions of data points, satellite, sensors | 33.5°C tomorrow | Enormous data, non-linear, many interactions |
| Drug effectiveness | 100K+ patients, genetic data, dosage, side effects | 73% effective | Extremely complex biological interactions |

**DON'T use when:** Small data (<10K rows) — will memorize instead of learning. Simple patterns — complete overkill.

---

## The Complete Decision Guide — From Problem to Model

### Step 1: What does your answer look like?
```
Answer is a WORD (spam, cat, yes, S/M/L)     → CLASSIFICATION (go to Step 2A)
Answer is a NUMBER (72 lakhs, 33°C, 87 marks) → REGRESSION (go to Step 2B)
```

### Step 2A: Classification — Pick the model
```
Is data IMAGES/VIDEO?
  YES → CNN (with Transfer Learning). No other option.

  NO (numbers/text) →
    Need to EXPLAIN why? → Decision Tree
    Want BEST accuracy?  → Random Forest
    Small data, 2 categories? → Logistic Regression
    Small data, intuitive? → KNN
    Clear group boundaries? → SVM
```

### Step 2B: Regression — Pick the model
```
ALWAYS try Linear Regression first.
  Good enough? → DONE.

  Not good enough? →
    Data is CURVED?          → Polynomial Regression
    Need to EXPLAIN number?  → Decision Tree Regression
    Want BEST accuracy?      → Random Forest Regression
    Data is MASSIVE (100K+)? → Neural Network Regression
```

---

## How to Know If Your Model Is Good — Evaluation Metrics

You built a model. It gives answers. But **how good** are those answers? Here's how to measure.

### Accuracy — The Obvious One
"Got 85 out of 100 correct = 85% accuracy."

**BUT accuracy can LIE with imbalanced data!**
Example: Fraud detection — 99.9% of transactions are NOT fraud. A model that says "not fraud" for EVERYTHING gets 99.9% accuracy but catches **ZERO fraud!** Useless.

### Precision — "Of what I flagged, how many were correct?"
"Of all the emails I flagged as spam, how many actually WERE spam?"
- High precision = few false alarms
- Important when: False alarms are costly (blocking a real email = bad)

### Recall — "Of all the real ones, how many did I catch?"
"Of all the actual spam emails, how many did I CATCH?"
- High recall = you miss very few real cases
- Important when: Missing a real case is dangerous (missing a fraud transaction = bad)

### F1-Score — "Balance between Precision and Recall"
Use when both precision and recall matter. F1 = balance of both.
- Spam filter: need both (don't block good emails AND catch spam)
- Medical diagnosis: need both (don't scare healthy people AND catch sick ones)

### Confusion Matrix — See All 4 Outcomes

A simple 2x2 table showing what your model got right and wrong:

| | Model says: SPAM | Model says: NOT SPAM |
|:--|:-----------------|:---------------------|
| **Actually SPAM** | True Positive (TP) — Correctly caught spam | False Negative (FN) — Missed spam (dangerous!) |
| **Actually NOT SPAM** | False Positive (FP) — Wrongly blocked good email | True Negative (TN) — Correctly let good email through |

- **Precision** = TP / (TP + FP) — "Of everything I called spam, how much was real spam?"
- **Recall** = TP / (TP + FN) — "Of all real spam, how much did I catch?"
- **Accuracy** = (TP + TN) / Total — "Overall, how many did I get right?"

**Rule of thumb:**
- Use **accuracy** when classes are balanced (50/50 split)
- Use **precision/recall/F1** when classes are imbalanced (fraud, disease, cheating)
- ExamGuard: cheating is RARE → accuracy is misleading → use **F1-Score**

---

## 10 Real Problems — Walk Through the Decision

### Problem 1: "Is this email spam?"
- Answer: Spam / Not Spam → **WORD → Classification**
- Data: 5K emails, features are numbers → **Not images**
- Only 2 categories, small data → **Logistic Regression**
- If accuracy < 80% → upgrade to **Random Forest**

### Problem 2: "How much will this house sell for?"
- Answer: Rs 72 lakhs → **NUMBER → Regression**
- Try **Linear Regression** first → if accuracy > 80% → DONE
- Not enough? 20+ features? → **Random Forest Regression**

### Problem 3: "Is this student cheating?" (ExamGuard)
- Answer: Cheating / Normal → **WORD → Classification**
- Data: Camera IMAGES → **CNN is the ONLY option**
- Use **YOLO** (pre-trained CNN) + Transfer Learning with 10K exam clips

### Problem 4: "Why was my loan rejected?"
- Answer: Approved / Rejected → **WORD → Classification**
- Bank MUST explain → **Decision Tree**
- Shows: "Rejected BECAUSE income < 50K AND credit < 600"

### Problem 5: "What disease does this patient have?"
- Answer: Dengue / Malaria / Flu / COVID → **WORD → Classification**
- 4 categories, 30+ symptoms, accuracy is CRITICAL → **Random Forest**
- 100 trees vote → majority = most reliable diagnosis

### Problem 6: "How long will food delivery take?"
- Answer: 42 minutes → **NUMBER → Regression**
- Many features (distance, traffic, weather, restaurant) → **Random Forest Regression**
- 100 trees average = reliable prediction

### Problem 7: "What is this handwritten letter?"
- Answer: A / B / C / D... → **WORD → Classification**
- Data: Images of letters → **Could use CNN**
- But if converted to simple pixel numbers → **SVM** (clear boundaries between letter shapes)

### Problem 8: "How much fertilizer should I use?"
- Answer: 15 kg/hectare → **NUMBER → Regression**
- Relationship is CURVED (too little = bad, right = good, too much = bad) → **Polynomial Regression**

### Problem 9: "Will this customer leave our service?"
- Answer: Will Leave / Will Stay → **WORD → Classification**
- 200K customers, many behavior features → **Random Forest**
- Best accuracy for complex tabular data

### Problem 10: "What will tomorrow's stock price be?"
- Answer: Rs 2,847 → **NUMBER → Regression**
- 50+ features, 500K data points, extremely complex → **Neural Network Regression**
- Only neural nets can handle this level of complexity

---

## Mini Summary

**The 3-step process:**
1. **Answer is WORD or NUMBER?** → Classification or Regression
2. **What does your data look like?** → Images = CNN, Numbers = check below
3. **What do you need?** → Explain = Decision Tree, Accuracy = Random Forest, Simple = Logistic/Linear

**Golden rules:**
- Images/Video? → **CNN. Always. No other option.**
- Need to explain WHY? → **Decision Tree. Only model that shows reasoning.**
- Want best accuracy? → **Random Forest. 100 trees > 1 tree.**
- Start SIMPLE → go complex only if accuracy is low
- **Linear Regression is ALWAYS your first try for numbers** — sometimes the simplest model wins

---

> 📝 *Quiz Q&A → see [../AI_ML_Quiz_QnA.md](../AI_ML_Quiz_QnA.md)*
> 📂 *Detailed model files → see [../02_Supervised/](../02_Supervised/)*
