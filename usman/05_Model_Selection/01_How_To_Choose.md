# Topic 12 — How To Choose The Right ML Model

## Forget Abstract Tables. Let's Solve Real Problems.

You told me the cheat table doesn't make sense. Fair enough.
Here's the truth: **nobody memorizes a table and then picks a model.**

What actually happens is:
1. You look at your PROBLEM
2. You ask yourself 4 simple questions
3. The answer almost picks itself

Let me prove it with 10 real problems.

---

## The 4 Questions You Ask Every Single Time

```
QUESTION 1 — What does my answer look like?
             Is it a WORD? (spam, cat, yes/no)
             Is it a NUMBER? (price, temperature, score)
             Is it a GROUP? (similar customers together)
             Is it a STRATEGY? (learn what to do over time)

QUESTION 2 — Do I have labels?
             Did someone already mark the correct answers in my data?
             YES → Supervised Learning
             NO  → Unsupervised Learning

QUESTION 3 — How much data do I have?
             Small (under 10K rows) → simple models
             Big (100K+ rows) → can try complex models
             Images/Text (millions) → deep learning

QUESTION 4 — Do I need real-time speed?
             YES → pick a fast model (YOLO, not slow ensemble)
             NO  → accuracy matters more than speed
```

That's it. Those 4 questions. Now let's use them on real problems.

---

## Case 1: Email Spam Filter

```
PROBLEM:  Gmail wants to automatically move spam to the spam folder
DATA:     5,000 emails. Each email is labeled "spam" or "not spam"
          Features: word count, number of links, sender reputation,
          does it contain "FREE MONEY" etc.

STEP 1 — What does the answer look like?
          "Spam" or "Not Spam" → that's a WORD (two categories)
          WORD answer = CLASSIFICATION

STEP 2 — Do I have labels?
          YES — each email is already marked spam or not spam
          Labels = SUPERVISED learning

STEP 3 — How much data?
          5,000 emails → that's SMALL
          Small data = simple model

STEP 4 — Real-time needed?
          Not really. A 1-second delay is fine for email.

DECISION: Classification → Supervised → Small data
          → LOGISTIC REGRESSION
```

**Why Logistic Regression?**
- It's the simplest classification model
- Works great on small data with number/text features
- Fast to train, fast to predict

**Why NOT a CNN (Convolutional Neural Network)?**
- CNNs are for IMAGES (photos, videos)
- Our data is numbers and text features, not pictures
- Using CNN here is like using a helicopter to go to the corner shop — it works, but WHY?

**Why NOT a huge neural network?**
- 5,000 emails is too little data for a neural network
- Neural networks need 100K+ data points to shine
- On 5,000 rows, Logistic Regression will likely beat a neural network

---

## Case 2: House Price Prediction

```
PROBLEM:  A property website wants to show estimated prices
DATA:     10,000 houses that already sold
          Features: size (sq ft), age, number of rooms, location, sold price

STEP 1 — What does the answer look like?
          "Rs 72 lakhs" → that's a NUMBER
          NUMBER answer = REGRESSION

STEP 2 — Do I have labels?
          YES — we know the actual sold price for each house
          Labels = SUPERVISED learning

STEP 3 — How much data?
          10,000 rows → MEDIUM size

STEP 4 — Real-time needed?
          No. User can wait 1-2 seconds on a website.

DECISION: Regression → Supervised → Medium data
          → Start with LINEAR REGRESSION
          → If accuracy is low, try RANDOM FOREST REGRESSOR
```

**Why start with Linear Regression?**
- Simplest regression model
- If the relationship is straightforward (bigger house = higher price), it works perfectly
- You get a baseline to compare against

**When to upgrade to Random Forest?**
- If Linear Regression gives bad accuracy (like R-squared below 0.7)
- Means the relationship is complex (price depends on location + size + age in weird combinations)
- Random Forest handles these complex relationships

**Real example of the difference:**
```
Linear Regression thinks: price = (size x 5000) + (rooms x 200000) - (age x 50000)
                          Simple formula. Works if reality is simple.

Random Forest thinks:     IF location=DHA AND size>2000 → high price
                          IF location=Saddar AND size>2000 → medium price
                          It learns that DHA + big = expensive, but Saddar + big ≠ as expensive
                          Handles these combinations better.
```

---

## Case 3: Customer Grouping for Marketing

```
PROBLEM:  A clothing brand wants to send different ads to different types of customers
          But they don't KNOW what the types are yet!
DATA:     50,000 customers
          Features: age, monthly spending, how often they visit, what they buy
          NO LABELS — nobody has said "this customer is type A" or "type B"

STEP 1 — What does the answer look like?
          Not a specific word or number
          We want GROUPS of similar customers
          GROUP answer = CLUSTERING

STEP 2 — Do I have labels?
          NO — that's the whole point, we don't know the groups yet
          No labels = UNSUPERVISED learning

STEP 3 — How much data?
          50,000 rows → good amount

STEP 4 — Real-time needed?
          No. This is a one-time analysis.

DECISION: Clustering → Unsupervised → Medium data
          → K-MEANS CLUSTERING (start with 3-5 groups)
```

**What K-Means will find (example):**
```
Group 1: Young (18-25), low spending, buys during sales only
         → Send them SALE notifications

Group 2: Middle-aged (30-45), high spending, buys premium brands
         → Send them NEW ARRIVAL notifications

Group 3: Older (50+), medium spending, buys seasonal items
         → Send them SEASONAL COLLECTION notifications
```

**Why K-Means?**
- Simplest clustering algorithm
- You just tell it "find 4 groups" and it does
- Works well when groups are roughly equal size

**The brand didn't know these groups existed.**
K-Means discovered them from the data. That's the power of unsupervised learning.

---

## Case 4: Credit Card Fraud Detection

```
PROBLEM:  A bank wants to catch fraudulent transactions
DATA:     1,000,000 transactions
          Features: amount, time, location, merchant type
          Labels: "fraud" or "not fraud"
          BUT: 999,000 are "not fraud" and only 1,000 are "fraud" (0.1%)

STEP 1 — What does the answer look like?
          "Fraud" or "Not Fraud" → WORD → seems like Classification...

STEP 2 — Do I have labels?
          YES... but they're EXTREMELY IMBALANCED
          99.9% = "not fraud", 0.1% = "fraud"

          ⚠️ THIS CHANGES EVERYTHING ⚠️

STEP 3 — How much data?
          1,000,000 rows total. But only 1,000 fraud cases.

STEP 4 — Real-time needed?
          YES — must catch fraud BEFORE the transaction completes

DECISION: Looks like Classification, but imbalanced data
          → ANOMALY DETECTION → ISOLATION FOREST
```

**Why NOT regular Classification?**
This is the most important lesson in this entire file:

```
If you train a regular classifier on this data:

Model says "Not Fraud" for EVERY SINGLE transaction.
Accuracy = 99.9%      ← looks amazing!
Fraud caught = 0%     ← completely useless!

The model learned: "just say not fraud every time, you'll be right 99.9% of the time"
That's not intelligence. That's laziness.
```

**Why Isolation Forest works better:**
- It learns what NORMAL transactions look like
- Then flags anything that looks DIFFERENT (isolated from normal)
- A fraud transaction (Rs 500,000 at 3am in another city) looks very different from normal
- Even if it's rare, Isolation Forest catches it because it's UNUSUAL

**Think of it like this:**
```
Regular Classification = "I've seen 999 not-fraud for every 1 fraud.
                          Fraud basically doesn't exist. Everything is not-fraud."

Isolation Forest =       "Here's what NORMAL looks like.
                          This transaction is NOT normal. FLAG IT."
```

---

## Case 5: ExamGuard — Phone Detection

```
PROBLEM:  Detect if a student has a phone on their desk during an exam
DATA:     Camera images of exam desks
          Features: RAW IMAGES (not numbers in a spreadsheet!)

STEP 1 — What does the answer look like?
          "Phone Found" or "No Phone" → WORD → Classification
          BUT the input is IMAGES, not numbers!

STEP 2 — Do I have labels?
          YES — we can label images "has phone" / "no phone"

STEP 3 — How much data?
          We have maybe 500-1000 exam room photos
          That's VERY small for image tasks
          (Image models usually need 100,000+ images)

STEP 4 — Real-time needed?
          YES! Must detect phone LIVE during exam, not after.

DECISION: Image Classification → needs CNN
          → but 500 images is too few to train CNN from scratch
          → TRANSFER LEARNING with YOLO (pre-trained on millions of images)
          → Fine-tune YOLO with our 500 exam room photos
          → YOLO processes 30+ frames per second ✅ real-time works
```

**The key insight:**
```
Option A: Train CNN from scratch
          Need: 100,000+ labeled images
          We have: 500
          Result: TERRIBLE accuracy

Option B: Use YOLO (already trained on millions of images)
          YOLO already knows what phones look like!
          We just fine-tune it: "here's what phones look like
          specifically on exam desks"
          Need: 500 images is enough for fine-tuning
          Result: GREAT accuracy
```

**Why YOLO specifically (not other CNNs)?**
- YOLO = "You Only Look Once" → designed for SPEED
- Processes 30+ images per second
- Other models (like Faster R-CNN) are more accurate but slower (5-10 fps)
- For a live exam camera, we NEED speed → YOLO wins

---

## Case 6: ExamGuard — Unusual Behavior Detection

```
PROBLEM:  Detect if a student is behaving unusually (excessive looking around,
          passing notes, suspicious hand movements)
DATA:     Live camera feeds of students during exams
          NO LABELS — nobody has labeled clips as "unusual" because what
          counts as "unusual" is hard to define!

STEP 1 — What does the answer look like?
          "Normal" or "Unusual" → WORD
          But we don't have labels for "unusual"!

STEP 2 — Do I have labels?
          NO for unusual behavior
          YES for normal behavior (just record any normal exam)

          This is a special case: we know what NORMAL looks like
          but NOT what UNUSUAL looks like

STEP 3 — How much data?
          Hours of normal exam footage → plenty

STEP 4 — Real-time needed?
          YES — flag suspicious behavior as it happens

DECISION: Unusual = anything not normal
          → AUTOENCODER (learns to recreate normal behavior)
          → When it can't recreate something → that's unusual!
```

**How the Autoencoder works (simple explanation):**
```
Training:
  Feed it 1000s of clips of NORMAL student behavior
  It learns: "normal looks like this"

During exam:
  Feed it live video
  It tries to recreate what it sees

  If student is sitting normally → recreates well → NORMAL
  If student is looking around frantically → can't recreate this
    → reconstruction is bad → FLAG AS UNUSUAL
```

**Why not just label unusual behavior and use classification?**
- What counts as "unusual"? There are THOUSANDS of ways to cheat
- You can't think of all of them and label them
- New cheating methods come up every semester
- Autoencoder approach: learns NORMAL, catches ANY deviation
- Even cheating methods you never thought of!

---

## Case 7: Netflix Movie Recommendation

```
PROBLEM:  Recommend movies that a user will actually enjoy
DATA:     100 million ratings from millions of users
          User A rated Movie X: 4 stars, Movie Y: 2 stars, Movie Z: 5 stars
          User B rated Movie X: 5 stars, Movie Y: 1 star...

STEP 1 — What does the answer look like?
          "You will like Movie Z" → this is a STRATEGY over time
          (Netflix keeps recommending, you keep watching or skipping,
           it keeps learning what you like)

STEP 2 — Do I have labels?
          YES (ratings) → Supervised part
          But also learning strategy over time → RL part

STEP 3 — How much data?
          100 million ratings → MASSIVE

STEP 4 — Real-time needed?
          Semi — recommendations update when you open the app

DECISION: TWO systems working together:
          1. COLLABORATIVE FILTERING → "Users similar to you liked this movie"
          2. REINFORCEMENT LEARNING → maximize engagement over time
```

**How Collaborative Filtering works (dead simple):**
```
You rated:     Inception = 5, Interstellar = 5, Tenet = 4
User #48291:   Inception = 5, Interstellar = 5, Tenet = 5, Arrival = 5

You and User #48291 have very similar taste!
User #48291 loved "Arrival" but you haven't seen it.
→ Netflix recommends "Arrival" to you.
```

**Where RL comes in:**
```
Collaborative Filtering: "Here are 50 movies you might like"
Reinforcement Learning:  "Show 'Arrival' first because this user watches
                          sci-fi movies on Friday nights, and it's Friday."

The RL part learns WHEN and HOW to show recommendations,
not just WHAT to recommend.
```

---

## Case 8: Hospital — Predict if Patient Has Diabetes

```
PROBLEM:  Help doctors quickly screen patients for diabetes
DATA:     5,000 patient records
          Features: age, weight, blood pressure, sugar level, family history
          Labels: "has diabetes" or "no diabetes"

STEP 1 — What does the answer look like?
          "Yes" or "No" → WORD → Classification

STEP 2 — Do I have labels?
          YES — confirmed diagnoses

STEP 3 — How much data?
          5,000 rows → SMALL

STEP 4 — Real-time needed?
          No. Doctor can wait a few seconds.

DECISION: Classification → Supervised → Small data
          → DECISION TREE

          Wait — why Decision Tree and not Logistic Regression?
          (both work on small classification data)

          → Because doctors need to EXPLAIN the prediction!
```

**This is the KEY reason: EXPLAINABILITY**

```
Logistic Regression says:
  "Patient has diabetes. Confidence: 87%."
  Doctor: "But WHY? I need to explain to the patient."
  Model: "...math happened."

Decision Tree says:
  "Patient has diabetes BECAUSE:
   → Blood sugar > 200 mg/dL     ✓ (patient has 240)
   → Age > 50                    ✓ (patient is 58)
   → Blood pressure > 140        ✓ (patient has 155)
   → Family history of diabetes   ✓ (father had it)"

  Doctor: "I can see exactly why. I can explain this to the patient.
           I can even disagree with one branch if I have more information."
```

**Rule: When humans need to UNDERSTAND the decision → Decision Tree**
- Medical diagnosis → doctors must explain
- Loan approval → bank must explain why rejected
- Legal decisions → must be transparent

**Rule: When you just need the best accuracy → Logistic Regression or Random Forest**
- Spam filter → nobody cares WHY it's spam
- Movie recommendation → nobody asks "why did you recommend this?"

---

## Case 9: Weather — Predict Tomorrow's Temperature

```
PROBLEM:  Weather app wants to predict tomorrow's temperature
DATA:     10 years of daily records (3,650 rows)
          Features: today's temperature, humidity, wind speed, pressure,
          cloud cover, yesterday's temperature

STEP 1 — What does the answer look like?
          "33.5 degrees Celsius" → NUMBER → Regression

STEP 2 — Do I have labels?
          YES — we know what the actual temperature was each day

STEP 3 — How much data?
          3,650 rows → SMALL-MEDIUM

STEP 4 — Real-time needed?
          No. Calculate once per day is fine.

DECISION: Regression → Supervised → Small data
          → LINEAR REGRESSION first
          → If accuracy low → POLYNOMIAL REGRESSION
```

**When does Linear Regression fail here?**
```
Linear thinks:  temperature = (humidity x -0.3) + (wind x -0.5) + (pressure x 0.2)
                A straight line relationship

Reality:        Temperature goes UP in summer and DOWN in winter
                It follows a CURVE (a wave pattern through the year)

If you only look at one season → Linear works fine
If you look at the whole year → you need a CURVE → Polynomial Regression
```

**Visual way to think about it:**
```
Linear:     ────────────────    (straight line)
Polynomial: ~~~~~~~~~~~~~~~    (can follow curves)

If your data follows a straight line → Linear
If your data follows a curve → Polynomial
```

**Why not a huge neural network?**
- 3,650 rows is way too small for neural networks
- Linear/Polynomial Regression will actually be MORE accurate on small data
- Neural network would overfit (memorize the data instead of learning patterns)

---

## Case 10: Self-Driving Car — When to Brake

```
PROBLEM:  Car must decide: brake, accelerate, turn left, turn right, do nothing
DATA:     Millions of driving scenarios in a simulator
          No pre-labeled "correct actions" for every possible situation
          Instead: reward (+1 for safe driving) and penalty (-100 for crash)

STEP 1 — What does the answer look like?
          "Brake NOW" → but it's not just one decision
          It's a STRATEGY: a sequence of decisions over time
          (brake now so you can turn later so you don't crash)

STEP 2 — Do I have labels?
          NO traditional labels
          We have REWARDS and PENALTIES instead
          Good driving = reward, crash = penalty

STEP 3 — How much data?
          Millions of simulator runs → MASSIVE

STEP 4 — Real-time needed?
          YES — millisecond decisions or people die

DECISION: Strategy over time + rewards/penalties
          → REINFORCEMENT LEARNING
          → Custom reward system
```

**Why NOT Supervised Learning?**
```
Supervised would need:
  Situation: "Car at 60km/h, pedestrian 20m ahead, wet road"
  Label: "Brake with 80% force"

  Situation: "Car at 40km/h, green light, no obstacles"
  Label: "Accelerate to 50km/h"

  You'd need labels for EVERY POSSIBLE SITUATION.
  There are BILLIONS of possible situations.
  Impossible to label them all.
```

**How RL solves it:**
```
The car tries things in a simulator:
  Round 1: Sees pedestrian → does nothing → CRASH → penalty of -100
  Round 2: Sees pedestrian → brakes hard → stops safely → reward of +10
  Round 3: Sees pedestrian → brakes gently → stops smoothly → reward of +15

  After millions of rounds:
  Car has learned a STRATEGY: "When pedestrian detected at X distance
  and speed is Y, apply brakes with Z force"

  It figured out the strategy BY ITSELF through trial and error.
  Nobody told it the rules. It DISCOVERED them.
```

---

## Summary: All 10 Cases at a Glance

```
Case  | Problem              | Answer Type | Labels? | Data Size | → Model
------|----------------------|-------------|---------|-----------|------------------
1     | Spam filter          | WORD        | YES     | Small     | Logistic Regression
2     | House prices         | NUMBER      | YES     | Medium    | Linear → Random Forest
3     | Customer groups      | GROUP       | NO      | Medium    | K-Means Clustering
4     | Fraud detection      | WORD*       | YES*    | Big       | Isolation Forest
5     | Phone in exam        | IMAGE+WORD  | YES     | Small     | YOLO (Transfer Learning)
6     | Unusual behavior     | WORD        | NO      | Medium    | Autoencoder
7     | Movie recommendation | STRATEGY    | Partial | Massive   | Collab Filter + RL
8     | Diabetes prediction  | WORD        | YES     | Small     | Decision Tree
9     | Weather temperature  | NUMBER      | YES     | Small     | Linear → Polynomial
10    | Self-driving car     | STRATEGY    | NO      | Massive   | Reinforcement Learning

* Case 4: Has labels but extremely imbalanced → treat as anomaly detection
```

---

## The 6 Expert Tricks (With Real Examples)

### Trick 1: Always Start Simple

```
Real story:
  Problem: Classify spam emails

  Attempt 1: Built a CNN (complex deep learning model)
             Accuracy: 85%
             Training time: 6 hours

  Attempt 2: Tried Logistic Regression (simplest classifier)
             Accuracy: 83%
             Training time: 2 seconds

  Difference: only 2% accuracy
  But CNN took 6 hours vs 2 seconds
  And CNN needs a GPU, LR runs on any laptop

  WINNER: Logistic Regression

  Rule: If the simple model gets close to the complex model → USE THE SIMPLE ONE
  Simple models are faster, cheaper, easier to debug, and easier to explain
```

### Trick 2: Data Size Decides Complexity

```
500 patient records     → Decision Tree, Logistic Regression
                           (simple models, won't overfit)

5,000 patient records   → Random Forest, SVM
                           (medium models, enough data to learn patterns)

500,000 X-ray images    → CNN, Deep Learning
                           (complex models, need lots of data, and they GET lots)

Rule of thumb:
  Under 1,000 rows    → use the simplest model possible
  1,000 — 100,000     → try medium complexity (Random Forest, SVM)
  Over 100,000         → deep learning becomes worth trying
  Over 1,000,000       → deep learning will likely beat everything else
```

### Trick 3: Check What Others Are Using

```
Before building anything, Google the problem:

  "object detection real time" → everyone uses YOLO → use YOLO
  "text classification"       → everyone uses BERT or simple TF-IDF + LR
  "image classification"      → everyone uses ResNet or EfficientNet
  "tabular data prediction"   → everyone uses XGBoost or Random Forest

  You're not the first person to solve this kind of problem.
  Someone has already figured out what works best.

  Don't reinvent the wheel.
  Stand on the shoulders of giants.
```

### Trick 4: Transfer Learning Is Your Best Friend

```
Problem: Detect phones in exam rooms
Reality: You have 500 photos. CNN needs 100,000+.

Without Transfer Learning:
  Train from scratch → 500 images → garbage accuracy (40%)

With Transfer Learning:
  Take YOLO (trained on millions of images, already knows what phones look like)
  Fine-tune with your 500 exam photos
  → Great accuracy (90%+)

It's like hiring someone who already knows how to cook (YOLO)
and just teaching them YOUR specific recipe (exam room photos)
vs hiring someone who has never seen food before (training from scratch)
and teaching them everything from "this is a knife" to your recipe.

Transfer Learning works for:
  Images → use pre-trained YOLO, ResNet, EfficientNet
  Text   → use pre-trained BERT, GPT
  Audio  → use pre-trained Whisper, Wav2Vec
```

### Trick 5: Break Complex Problems Into Sub-Problems

```
ExamGuard is NOT one problem. It's 7 different problems:

Sub-problem 1: Detect phone on desk          → YOLO (object detection)
Sub-problem 2: Detect unusual behavior        → Autoencoder (anomaly)
Sub-problem 3: Count people in room           → YOLO (object detection)
Sub-problem 4: Verify student identity        → Face Recognition CNN
Sub-problem 5: Detect voice during exam       → Audio classifier
Sub-problem 6: Score overall risk level       → Random Forest (combines all signals)
Sub-problem 7: Alert dashboard                → not ML, just software

Each sub-problem needs a DIFFERENT model.
Don't try to build ONE model that does everything.
Build 6 specialized models and connect them.
```

### Trick 6: Test Multiple Models, Pick the Best

```
Problem: Predict house prices

You try 4 models on the same data:

  Model              | Accuracy (R²) | Training Time
  -------------------|---------------|---------------
  Linear Regression  | 0.72          | 1 second
  Decision Tree      | 0.68          | 2 seconds
  Random Forest      | 0.85          | 30 seconds
  XGBoost            | 0.87          | 45 seconds

  XGBoost wins on accuracy, but Random Forest is close and faster.

  If you need the absolute best accuracy → XGBoost
  If you need a balance of accuracy + speed → Random Forest

  You would NEVER know this without trying all of them.
  Always test at least 3-4 models.
```

---

## Quick Decision Guide

When you face a new ML problem, follow this flowchart in your head:

### What does my answer look like?

**If the answer is a WORD (yes/no, cat/dog, spam/not-spam) and I have labels:**
→ CLASSIFICATION
→ Small data? → Logistic Regression or Decision Tree
→ Big data? → Random Forest or XGBoost
→ Need explainability? → Decision Tree
→ Images? → CNN / YOLO
→ Text? → BERT / Transformer

**If the answer is a NUMBER (price, temperature, score) and I have labels:**
→ REGRESSION
→ Small data? → Linear Regression
→ Curved relationship? → Polynomial Regression
→ Complex patterns? → Random Forest Regressor or XGBoost

**If I have NO labels and want to find GROUPS:**
→ CLUSTERING
→ Know how many groups? → K-Means
→ Don't know how many? → DBSCAN
→ Groups within groups? → Hierarchical Clustering

**If I have NO labels and want to find WEIRD things:**
→ ANOMALY DETECTION
→ Tabular data? → Isolation Forest
→ Images/video? → Autoencoder
→ Imbalanced labeled data? → Also treat as Anomaly Detection

**If the model needs to learn a STRATEGY through trial and error:**
→ REINFORCEMENT LEARNING
→ Game/simulation? → Q-Learning or Deep Q-Network
→ Continuous actions? → Policy Gradient methods
→ Robot/car? → Custom RL with reward shaping

**If my data is IMAGES:**
→ DEEP LEARNING (CNN family)
→ Classify image? → ResNet, EfficientNet
→ Find objects in image? → YOLO, Faster R-CNN
→ Small dataset? → Transfer Learning (fine-tune pre-trained model)

**If my data is TEXT:**
→ TRANSFORMER / LLM family
→ Classify text? → BERT
→ Generate text? → GPT
→ Small dataset? → Fine-tune pre-trained model

**If my data is a TIME SEQUENCE (stock prices, sensor readings, speech):**
→ LSTM / RNN
→ Short sequences? → Simple RNN
→ Long sequences? → LSTM or Transformer

---

## One Last Thing: You Don't Need to Memorize This

Seriously. Don't try to memorize all 10 cases or every model name.

Instead, remember the 4 QUESTIONS:
1. What does my answer look like? (WORD / NUMBER / GROUP / STRATEGY)
2. Do I have labels?
3. How much data?
4. Need real-time speed?

Answer those 4 questions, and the model practically picks itself.
When in doubt → start simple → test a few → pick the best.

That's how every ML engineer in the world actually does it.
