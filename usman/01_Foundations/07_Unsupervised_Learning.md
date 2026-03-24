# 7. Unsupervised Learning — Learning WITHOUT a Teacher

> **Part of: Types of Machine Learning — 3 Approaches (Topics 6, 7, 8)**

---

## What is Unsupervised Learning?

You give the model **DATA but NO correct answers (no labels)**. The computer finds patterns, groups, and oddities BY ITSELF.

**School Photo Analogy:** You're given 50 photos with NO names. You sort them by appearance — glasses together, tall together, blue uniform together. Nobody told you how many groups or what to look for. You figured out patterns alone.

---

## Step 1: What Are You Trying to Do?

| Your Goal | Type | Go To |
|:----------|:-----|:------|
| "Group similar things together" | **Clustering** | Step 2A below |
| "Find the weird one that doesn't fit" | **Anomaly Detection** | Step 2B below |
| "Too many features, simplify the data" | **Dimensionality Reduction** | Step 2C below |

**How to know which one?**
- "I want to DISCOVER groups in my data" → Clustering
- "I want to CATCH something unusual/rare" → Anomaly Detection
- "I have TOO MANY features, simplify my data" → Dimensionality Reduction

---

## Step 2A: Clustering — "Group Similar Things"

### The Decision

```
Do you know how many groups you want?
  │
  YES (marketing team says "give me 3 customer segments")
  │   → K-Means
  │     You tell it K=3, it finds the best 3 groups.
  │
  NO (you have no idea how many groups exist)
  │   → DBSCAN
  │     It finds groups NATURALLY + flags outliers.
  │     "There are 4 natural groups + 2 outliers."
```

---

### K-Means — "I Know Roughly How Many Groups"

**IF your problem looks like:** "Divide these into 3 (or 4 or 5) groups" → **Use K-Means**

| Problem | Data | You Say | K-Means Finds | Why K-Means? |
|:--------|:-----|:--------|:-------------|:-------------|
| Customer segmentation for targeted ads | 10K customers: age, spend, frequency | "Give me 3 groups" (K=3) | Group 1: Young, daily, low spend = "Budget Shoppers". Group 2: Old, monthly, high spend = "Premium". Group 3: Sale-only = "Deal Hunters" | Marketing WANTS exactly 3 segments for 3 ad campaigns |
| Student grouping for extra help | 500 students: marks, attendance, participation | "Give me 4 groups" (K=4) | Group 1: Strong all around. Group 2: Good marks, low attendance. Group 3: Struggling. Group 4: At risk | School wants 4 tiers for different support levels |
| Spotify playlist creation | 1000 songs: tempo, energy, mood score | "Give me 5 playlists" (K=5) | Happy upbeat, Sad slow, Energetic workout, Calm focus, Party mix | Spotify wants exactly 5 mood-based playlists |
| **ExamGuard:** Group behavior types | Pose + gaze data from cameras | "Find 4 behavior types" (K=4) | Normal writers, Head scratchers, Constant lookers, Phone checkers | Group similar behaviors to set baselines |

**DON'T use when:** You have no idea how many groups exist, or data has lots of noise/outliers.

**Analogy:** Sorting colored marbles into bowls. You decide how many bowls (K). Machine decides which marble goes where.

#### But how do I pick K? Use the Elbow Method:

Try K=2, K=3, K=4, K=5... and measure how good each grouping is.
Plot the results → the graph looks like an arm. The "elbow" (where improvement slows down) = best K.

**Example:** K=2 (bad), K=3 (much better!), K=4 (slightly better), K=5 (barely improves) → Elbow at K=3 → use 3 groups.

---

### DBSCAN — "I Don't Know How Many Groups, Just Find Them"

**IF your problem looks like:** "I have no idea what's in this data — find whatever groups exist" → **Use DBSCAN**

| Problem | Data | DBSCAN Finds | Why DBSCAN? |
|:--------|:-----|:------------|:------------|
| Delivery truck route analysis | GPS data from 200 trucks | 4 route clusters: city (80), highway (60), suburb (45), mixed (13). PLUS 2 outlier trucks going to wrong locations | Nobody knew how many route types existed. DBSCAN found 4 + caught 2 suspicious trucks |
| Website user behavior | Click patterns from 50K users | 6 user types + 200 bot accounts flagged as outliers | Nobody could guess how many user types. Bots caught automatically |
| Crime hotspot mapping | 5 years of crime locations | 12 natural hotspot clusters + 3 isolated incidents | Police didn't pre-define areas. DBSCAN found natural patterns |
| **ExamGuard:** Discover unknown behavior patterns | Raw movement data during exam | Finds groups nobody thought of — like "two students making synchronized movements" (possible signal sharing) | You can't pre-define what creative cheating looks like. DBSCAN discovers it |

**DON'T use when:** You WANT a specific number of groups (use K-Means), or data is very high-dimensional.

**Analogy:** Friend groups in school form naturally. Nobody decides how many groups. Some kids are loners (outliers). DBSCAN works the same way.

---

## Step 2B: Anomaly Detection — "Find the Weird One"

### The Decision

```
What kind of "unusual" are you looking for?
  │
  ├── Rare events in a huge dataset (fraud = 0.1% of transactions)
  │   → Isolation Forest
  │     Isolates the weird ones in a few questions.
  │     Like spotting a dinosaur costume in a cricket crowd.
  │
  └── "Learn what NORMAL is, flag ANYTHING different"
      (even things you've never seen before)
      → Autoencoder
        Learns normal pattern. Anything it can't recreate = ANOMALY.
        Like a photocopy machine trained only on cats.
```

---

### Isolation Forest — "The Rare Event Catcher"

**IF your problem looks like:** "99.9% of data is normal, find the 0.1% that's suspicious" → **Use Isolation Forest**

| Problem | Data | Normal (99%+) | Anomaly (<1%) | Why Isolation Forest? |
|:--------|:-----|:-------------|:-------------|:---------------------|
| Credit card fraud | 1M transactions | Rs 500, local, daytime | Rs 5,00,000 in Dubai at 3AM | Fraud is RARE. Isolation Forest catches rare things fast |
| Network intrusion | 10M server logs | Normal login from office IP | Login from 5 countries in 1 hour | Attack patterns are rare but critical to catch |
| Factory machine failure | 1 year of sensor data | RPM = 1000 ±50 | RPM suddenly 1500 | Machine failure is rare but catastrophic |
| Student score cheating | 5K exam results | Student usually scores 35-45% | Student suddenly scores 98% | Score jump is extremely unusual |
| **ExamGuard:** Flag unusual students | Behavioral data during exam | Looks at paper 80% of time, occasional stretch | Hasn't looked at paper for 5 minutes while everyone writes | This behavior is RARE and stands out. Isolated in 2-3 checks |

**DON'T use when:** Unusual events are common (>10% of data) — Isolation Forest assumes anomalies are RARE.

**Analogy:** Person wearing dinosaur costume at a cricket match. "Are you wearing a costume?" → YES → ISOLATED in 1 question. Normal person takes 20 questions to single out.

---

### Autoencoder — "The Normal Learner"

**IF your problem looks like:** "I don't know WHAT the anomaly will look like — just learn what normal is and flag anything else" → **Use Autoencoder**

| Problem | Train on NORMAL only | Normal = recreated well | Anomaly = can't recreate | Why Autoencoder? |
|:--------|:--------------------|:-----------------------|:------------------------|:----------------|
| Factory quality control | 10K photos of GOOD brake pads | Good pad → perfect copy → PASS | Cracked pad → blurry copy → DEFECTIVE | Catches defects it has NEVER SEEN before |
| Medical ECG monitoring | 1M normal heartbeats | Normal rhythm → recreated perfectly | Irregular rhythm → high error → ALERT | New heart conditions caught automatically |
| Cybersecurity | 6 months of normal network traffic | Normal patterns → low error | New attack type → can't recreate → FLAG | Catches attacks that don't exist yet |
| **ExamGuard:** Catch creative cheating | 10K clips of normal exam behavior | Normal behavior → recreated well → IGNORE | Student tapping desk rhythmically → can't recreate → FLAG | Catches cheating methods nobody thought of yet |

**DON'T use when:** You have labeled data (use supervised — faster and more accurate).

**Analogy:** Photocopy machine trained ONLY on cat photos. Give it a cat → perfect copy. Give it a dog → blurry mess → "This isn't a cat!"

---

## Step 2C: Dimensionality Reduction — "Simplify Without Losing Much"

### PCA (Principal Component Analysis) — "Simplify Without Losing Much"

**What:** Reduces the number of features while keeping the important patterns. 50 features → 5 features that capture 95% of the information.

**IF your problem looks like:** "I have too many features, model is slow or confused" → **Use PCA**

| Problem | Before PCA | After PCA | Why PCA? |
|:--------|:-----------|:----------|:---------|
| Face recognition | Each photo = 10,000 pixels | 100 key features | 100x faster, almost same accuracy |
| Customer analysis | 50 behavior metrics | 5 main patterns | Easier to visualize and understand |
| Gene analysis | 20,000 genes per sample | 50 key gene patterns | Too many features for any model |
| ExamGuard | 200 behavior measurements per student | 10 key behavior signals | Faster real-time processing |

**DON'T use when:** You have few features already (<10), or you need to explain what each feature means.

**Analogy:** Summarizing a 500-page book into a 5-page summary. You lose some detail but keep the main story.

---

## The Complete Decision Guide

```
I have DATA but NO LABELS.
  │
  ├── I want to FIND GROUPS
  │     ├── I know how many groups → K-Means (set K)
  │     └── I don't know + want outliers too → DBSCAN
  │
  ├── I want to FIND SOMETHING WEIRD
  │     ├── Looking for RARE events (<1%) → Isolation Forest
  │     └── Learn "normal" and catch ANYTHING else → Autoencoder
  │
  └── I have TOO MANY FEATURES, simplify
        → PCA (reduce features, keep patterns)
```

---

## 6 Real Problems — Walk Through the Decision

**Problem 1:** "Segment 50K customers for marketing" → No labels → Find groups → Marketing wants 4 segments → **K-Means (K=4)**

**Problem 2:** "Are any delivery trucks going off-route?" → No labels → Find groups + outliers → Don't know how many → **DBSCAN**

**Problem 3:** "Detect credit card fraud in 1M transactions" → No labels → Find rare weird → Fraud <0.1% → **Isolation Forest**

**Problem 4:** "Catch factory defects we've never seen" → No labels → Learn normal, flag rest → Unknown anomalies → **Autoencoder**

**Problem 5:** "Group ExamGuard behaviors" → No labels → Discover groups → Don't know types → **DBSCAN**

**Problem 6:** "ExamGuard: catch creative cheating" → Can't label what doesn't exist yet → Learn normal → **Autoencoder**

---

## Mini Summary

**2-step process:**
1. **Find groups, find weird, or simplify?** → Clustering, Anomaly Detection, or Dimensionality Reduction
2. **Which model?** → Know group count = K-Means, don't know = DBSCAN, rare events = Isolation Forest, unknown anomalies = Autoencoder, too many features = PCA

**Golden rules:**
- If you HAVE labels → don't use unsupervised, use supervised (more accurate)
- Unsupervised = discovering what you didn't know existed

---

> 📝 *Quiz Q&A → see [../AI_ML_Quiz_QnA.md](../AI_ML_Quiz_QnA.md)*
> 📂 *Detailed model files → see [../03_Deep_Dives/Unsupervised/](../03_Deep_Dives/Unsupervised/)*
