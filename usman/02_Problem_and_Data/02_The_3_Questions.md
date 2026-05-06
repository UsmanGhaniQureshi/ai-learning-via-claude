# 2. The 3 Questions — The Core Skill of ML Engineering

> **This is THE most important skill in AI. Not coding. Not math. Decomposing problems into ML tasks using 3 simple questions.**

---

## The 3 Questions

For EACH task a human does, ask:

```
Q1: What DATA is the human using?
    → Eyes (looking at something)        = IMAGES
    → Reading words                      = TEXT
    → Checking numbers/measurements      = NUMBERS

Q2: HOW is the human thinking?
    → "I recognize this from experience" = SUPERVISED
    → "Something feels off, not normal"  = ANOMALY DETECTION
    → "Let me group similar things"      = CLUSTERING
    → "I need to balance tradeoffs"      = REINFORCEMENT LEARNING

Q3: Does the human have PAST EXAMPLES with correct answers?
    → YES (labeled data exists)          = SUPERVISED
    → NO (just knows normal)             = UNSUPERVISED
    → NO (learns by trying)              = RL
```

---

## How It Works — Step by Step

### Step 1: Watch the human
Don't think about ML at all. Just observe: "What is this person physically DOING?"

### Step 2: Ask Q1 — What data?
What is the human LOOKING at? Images? Text? Numbers? This narrows down the model type immediately.

### Step 3: Ask Q2 — How thinking?
Is the human recognizing something from memory? Sensing something abnormal? Grouping things? Making a judgment call with consequences?

### Step 4: Ask Q3 — Past examples?
Has the human been trained on labeled examples? Or do they just know "normal" and flag anything else? Or are they learning by trial and error?

### Step 5: Combine the answers
The combination of Q1 + Q2 + Q3 tells you the ML type:

| Q1: Data | Q2: Thinking | Q3: Labels? | → ML Type | → Model Family |
|:---|:---|:---|:---|:---|
| IMAGES | Recognizing | YES | Supervised | CNN / YOLO |
| IMAGES | Something off | NO | Anomaly | Autoencoder |
| TEXT | Categorizing | YES | Supervised | Naive Bayes / BERT |
| NUMBERS | Recognizing/Predicting | YES (word) | Supervised | Classification (LogReg, DT, RF) |
| NUMBERS | Recognizing/Predicting | YES (number) | Supervised | Regression (Linear, Poly, RF) |
| NUMBERS | Something off | NO | Anomaly | Isolation Forest |
| NUMBERS | Grouping | NO | Unsupervised | K-Means / DBSCAN |
| ANY | Balancing tradeoffs over time | Rewards | RL | Reinforcement Learning |

---

## When to Use ML vs Simple Rules

Before jumping to ML, check: can a simple rule do it?

| Scenario | ML or Simple Rule? | Why |
|:---|:---|:---|
| "If temperature > 38°C, flag fever" | SIMPLE RULE | One number, one threshold |
| "Predict if patient has diabetes from 20 factors" | ML | Too many factors interacting |
| "If order > Rs 1 lakh, require manager approval" | SIMPLE RULE | One number, one threshold |
| "Detect fraud from transaction patterns" | ML | Complex pattern across many variables |
| "If student absent > 5 days, notify parents" | SIMPLE RULE | Simple counting |
| "Predict which students will fail" | ML | Many factors (marks, attendance, behavior) |
| "Calculate BMI from height and weight" | NOT ML — formula | weight / height² |
| "Detect pneumonia from X-ray" | ML | Complex visual pattern, no formula exists |

**Rule: If you can write it as one IF-ELSE or a formula → don't use ML.**

---

## Practice Problems — Build Your Skill

### Practice 1: Hospital

| What human does | Q1: Data | Q2: Thinking | Q3: Labels? | ML Type |
|:---|:---|:---|:---|:---|
| Doctor reads X-ray | IMAGES | "I've seen pneumonia before" — recognizing | YES — past X-rays labeled | Supervised → CNN |
| Nurse checks vitals (BP, sugar) | NUMBERS | "BP 180 + sugar 400 = dangerous combo" | YES — past cases labeled | Supervised → Classification |
| Doctor notices weird lab report | NUMBERS | "Can't explain, but this doesn't look right" | NO — just knows normal | Anomaly → Isolation Forest |
| ICU ventilator settings | NUMBERS + JUDGMENT | "Too high = lung damage, too low = not enough O2" | NO — learns by adjusting | RL |
| Receptionist identifies patient | IMAGES (face) | "I remember this face" | YES — registered photos | Supervised → CNN (face recognition) |
| Admin assigns rooms | RULES | "ICU = floor 3, general = floor 1" | N/A | NOT ML — simple rule |

### Practice 2: Restaurant Manager

| What he does | Q1: Data | Q2: Thinking | Q3: Labels? | ML Type |
|:---|:---|:---|:---|:---|
| Predicts how much chicken to buy | NUMBERS (past sales) | "Fridays we sell 200" — predicting amount | YES — past sales records | Regression |
| Reads review: "Food was cold" | TEXT | Categorizing: good/bad/average | YES — past reviews categorized | Text Classification → Naive Bayes |
| Notices electricity bill unusually high | NUMBERS (bills) | "This doesn't match normal pattern" | NO — just knows normal | Anomaly → Isolation Forest |
| Sets lunch prices daily | NUMBERS + JUDGMENT | "Too high = no customers, too low = no profit" | NO — learns by daily results | RL |
| Spots waiter pocketing cash on CCTV | IMAGES (camera) | "I see cash in hand" — recognizing | YES — knows what theft looks like | Supervised → CNN/YOLO |

### Practice 3: Clothing Store ("Reduce Returns")

| Sub-problem | Q1: Data | Q2: Thinking | Q3: Labels? | ML Type |
|:---|:---|:---|:---|:---|
| Customer buys wrong size | NUMBERS (measurements) | "This body type = Medium" — predicting | YES — past correct purchases | Classification |
| Color looks different | IMAGES (screen vs real) | "Do these match?" — comparing | YES — past matches/mismatches | Supervised → CNN |
| Quality complaints | TEXT (return feedback) | Categorizing: quality/size/color/other | YES — past feedback categorized | Text Classification → Naive Bayes |
| Try-and-return customers | NUMBERS (order patterns) | "Group similar shopping behaviors" | NO — nobody labeled customer types | Clustering → K-Means |
| Fraudulent returns | NUMBERS (return patterns) | "This return doesn't look normal" | NO — just knows normal patterns | Anomaly → Isolation Forest |

### Practice 4: Cricket Team AI

| What coach does | Q1: Data | Q2: Thinking | Q3: Labels? | ML Type |
|:---|:---|:---|:---|:---|
| Studies opponent batting video | IMAGES (video) | "Weak against spin" — recognizing pattern | YES — past match analysis | Supervised → CNN |
| Predicts player's next score | NUMBERS (past scores, form) | "Based on form, around 45 runs" | YES — actual past scores | Regression |
| Groups players by style | NUMBERS (stats) | "These 4 bat similarly" | NO — finding groups himself | Clustering → K-Means |
| Decides field placement | JUDGMENT (strategy) | "Fielder here = less runs but boundary risk" | NO — trial and error each match | RL |
| Notices player fitness drop | NUMBERS (fitness data) | "Something wrong, sudden decline" | NO — just knows normal fitness | Anomaly → Isolation Forest |

### Practice 5: ExamGuard

| What invigilator does | Q1: Data | Q2: Thinking | Q3: Labels? | ML Type |
|:---|:---|:---|:---|:---|
| Spots phone on desk | IMAGES (camera) | "That's a phone" — recognizing object | YES — knows what phones look like | Supervised → YOLO |
| Notices student looking sideways | IMAGES (video) | "Head turned toward neighbor" — recognizing | YES — knows what copying looks like | Supervised → CNN + Pose |
| Senses something "off" | IMAGES (video) | "Can't explain but not normal" | NO — just knows normal exam behavior | Anomaly → Autoencoder |
| Checks student identity | IMAGES (face vs ID) | "Does face match?" — comparing | YES — registered student photos | Supervised → Face Recognition |
| Decides to confront or wait | JUDGMENT | "Is it worth disrupting? Am I sure enough?" | NO — learns from experience | RL |
| Counts absent students | COUNTING | "30 desks, 28 present" | N/A | NOT ML — YOLO count or simple database |

---

## Try It Yourself — Unsolved Problems

For each, answer Q1, Q2, Q3 yourself:

**Problem A:** A school principal wants to identify struggling students BEFORE they fail. What would a teacher look at?

**Problem B:** A warehouse manager wants to reduce delivery errors. What does a human picker actually do?

**Problem C:** A social media company wants to detect fake accounts. What would a human moderator check?

**Problem D:** A farmer wants to maximize crop yield. What does a human farmer observe?

---

## Mini Summary

- The 3 Questions work for ANY problem in ANY industry
- Q1 (data) narrows the model family immediately
- Q2 (thinking) tells you supervised vs unsupervised vs RL
- Q3 (labels) confirms the ML type
- Not everything needs ML — check for simple rules first
- The skill improves with practice — do 20-30 problems and it becomes automatic

> 📝 *Previous: [01_Problem_Understanding.md](01_Problem_Understanding.md) — How to break down vague goals*
> 📝 *Next: [03_Data_Collection.md](03_Data_Collection.md) — Where to find and collect data*
