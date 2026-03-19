# 7. Unsupervised Learning — Learning WITHOUT a Teacher

> **Part of: Types of Machine Learning — 3 Approaches (Topics 6, 7, 8)**

---

### Simple Definition
You give the model **DATA but NO labels** (no correct answers). The model finds patterns, groups, and oddities BY ITSELF. Nobody tells it what to look for.

### The Two Types

**Clustering = "Group similar things together"**
- 10,000 customers → Budget / Premium / Sale Hunters
- 1,000 songs → By mood (happy, sad, energetic)
- Photos → Sort by face similarity (no names given)

**Anomaly Detection = "Spot the weird one that doesn't fit"**
- Credit card: Rs 5,00,000 in Dubai at 3 AM → FRAUD!
- Factory: machine RPM jumps from 1000 to 1500 → FAILING
- Student: always 40% → suddenly 100% → SUSPICIOUS

**Dimensionality Reduction = "Simplify complex data"** (Advanced — mentioned for completeness)
- When data has 500 features, reduce to 10 most important ones
- Models like **PCA** (Principal Component Analysis) do this automatically
- Makes other models faster and sometimes more accurate
- Think of it like summarizing a 500-page book into 10 key points

**The main two you'll use most: Clustering and Anomaly Detection.**

**Quick Rule:** "Find groups" → **Clustering**. "Find the odd one" → **Anomaly Detection**.

### Analogy
**School Photo Without Names:** You're given 50 photos of students with NO names. You sort them into groups by appearance — these look similar, those look similar. Nobody told you how many groups or what to look for. You figured out the patterns alone. That's unsupervised learning.

---

## Clustering Models — Which One & When?

### 1. K-Means
**What:** You tell it how many groups (K). It finds the best way to divide data into exactly K groups.

**Best for:** When you roughly know how many groups you want.

**Real Example — Shopping Mall Customer Segmentation:**
Mall has 10,000 customers. Marketing team wants 3 groups for targeted ads. K-Means (K=3) finds:
- Group 1: Young (18-25), visits daily, spends Rs 200-500 → **"Budget Shoppers"** → send coupon ads
- Group 2: Older (40-60), visits monthly, spends Rs 5000-20000 → **"Premium Buyers"** → send luxury brand ads
- Group 3: All ages, only visits during sales → **"Deal Hunters"** → send sale notification ads

Nobody labeled these customers. K-Means discovered the groups from purchase patterns alone.

**When to use:** Know approximate number of groups, data is numeric, want fast results.
**When NOT:** Don't know how many groups, data has weird shapes or lots of noise.

**ExamGuard Connection:** Group exam behaviors: "Normal writers", "Head scratchers", "Constant lookers", "Phone checkers" — K-Means finds these groups automatically from pose/gaze data.

**Analogy:** Sorting colored marbles into bowls. Red with red, blue with blue. K = how many bowls you give it.

---

### 2. DBSCAN
**What:** Finds groups NATURALLY without you telling it how many. Also automatically identifies outliers (data that doesn't belong to any group).

**Best for:** When you DON'T know how many groups exist, and data might have noise/outliers.

**Real Example — Delivery Truck GPS Routes:**
Company has GPS data from 200 delivery trucks. DBSCAN finds:
- Cluster A: 80 trucks take city center routes
- Cluster B: 60 trucks take highway routes
- Cluster C: 45 trucks take suburban routes
- Cluster D: 13 trucks take mixed routes
- **2 trucks flagged as OUTLIERS** — went to completely wrong locations!

Nobody told it 4 groups. Nobody told it 2 trucks were wrong. It figured out everything.

**When to use:** Don't know group count, expect outliers/noise, data has natural clusters.
**When NOT:** Very high-dimensional data, extremely large datasets (can be slow).

**ExamGuard Connection:** Cluster exam behaviors without pre-deciding categories. DBSCAN might discover groups you didn't even think of — like "synchronized movements between two students" as its own cluster.

**Analogy:** Friend groups in school form naturally — nobody decides how many groups. Some kids are loners (outliers). DBSCAN works the same way.

---

## Anomaly Detection Models — Which One & When?

### 1. Isolation Forest
**What:** Isolates unusual data points. The idea: normal data is similar (hard to isolate), abnormal data is different (easy to isolate in few questions).

**Best for:** Finding rare events — fraud, defects, intrusions, unusual behavior.

**Real Example — Credit Card Fraud Detection:**
1 million transactions. 99.9% normal. 0.1% fraud.
- Normal transaction: Rs 500, daytime, local store → blends in with millions of similar ones → hard to isolate
- Fraud transaction: Rs 5,00,000, 3 AM, Dubai → completely different from everything → isolated in 2-3 questions!

Fewer questions to isolate = MORE abnormal. Like spotting someone in a dinosaur costume at a cricket match — stands out immediately.

**When to use:** Finding rare events (<1% of data), fraud detection, system failures, security threats.
**When NOT:** When abnormal events are common (>10% of data).

**ExamGuard Connection:** Student hasn't looked at paper for 5 minutes while everyone else is writing? Isolated quickly = flagged as unusual.

**Analogy:** In a crowd of similar people, the person wearing a dinosaur costume is isolated in one question: "Are you wearing a costume?" → YES → OUTLIER.

---

### 2. Autoencoder
**What:** A neural network that learns to COMPRESS and RECREATE data. Train it on NORMAL data only. When it sees something abnormal, it can't recreate it well → high error → ANOMALY.

**Best for:** Learning what "normal" looks like and flagging anything different — even things never seen before.

**Real Example — Factory Quality Control:**
Train autoencoder on 10,000 photos of GOOD brake pads. It learns what normal brake pads look like.
- New good brake pad → autoencoder recreates it perfectly → low error → PASS
- Defective brake pad (crack, chip, discoloration) → autoencoder can't recreate it well → high error → **DEFECTIVE!**

It catches defects it has NEVER seen before — because anything that doesn't match "normal" triggers high error.

**When to use:** Want to learn "normal" baseline and catch ANY deviation, even new/unknown anomalies.
**When NOT:** When you have labeled data (use supervised instead — more accurate).

**ExamGuard Connection:** Train on 10K clips of normal exam behavior (writing, occasional stretch, drinking water). During exam, student does something the model has never seen → can't recreate it → **FLAG for review.**

**Analogy:** A photocopy machine trained ONLY on cat photos. Give it a cat → perfect copy. Give it a dog → blurry, weird copy → "This isn't a cat!" → ANOMALY.

---

## Quick Reference — Which Model to Pick?

| Situation | Best Model | Why |
|:----------|:----------|:----|
| Know how many groups | **K-Means** | Fast, simple, you set K |
| Don't know group count + expect outliers | **DBSCAN** | Finds groups naturally, flags outliers |
| Find rare events (fraud, defects) | **Isolation Forest** | Isolates unusual in few questions |
| Learn "normal" and catch ANY deviation | **Autoencoder** | Catches even never-seen-before anomalies |

### Key Difference from Supervised
| | Supervised | Unsupervised |
|:--|:----------|:------------|
| **Labels?** | YES (spam/not-spam) | NO (just data, no answers) |
| **Goal** | Learn input → answer | Find hidden groups or oddities |
| **Types** | Classification, Regression | Clustering, Anomaly Detection |
| **Testing** | Computer checks automatically (80/20 split) | Human reviews groups + math similarity score |

### Mini Summary
- Unsupervised = DATA without labels → computer finds patterns alone
- Clustering = group similar things → K-Means (you pick K) or DBSCAN (auto-finds groups)
- Anomaly Detection = find the weird one → Isolation Forest (isolate quickly) or Autoencoder (learn normal, flag different)
- Used when you DON'T have labeled data or want to discover patterns you didn't know existed
- ExamGuard uses unsupervised to catch CREATIVE cheating methods never seen before

---

> 📝 *Quiz Q&A → see [../AI_ML_Quiz_QnA.md](../AI_ML_Quiz_QnA.md)*
> 📂 *Detailed model files → see [../03_Unsupervised/](../03_Unsupervised/)*
