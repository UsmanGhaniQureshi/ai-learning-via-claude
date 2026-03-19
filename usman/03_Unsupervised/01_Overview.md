# Unsupervised Learning

## What Is Unsupervised Learning?

Imagine you have **50 photos of random people** and someone says: "Sort these into groups." But they give you **NO names, NO labels, NO instructions** — just the photos.

What would you do? You'd probably start grouping them yourself:
- These 12 people are all wearing school uniforms
- These 8 people are all old with grey hair
- These 15 people are all wearing suits
- This 1 person is wearing a clown costume ← **THE WEIRD ONE**

**That's unsupervised learning.** The computer gets data with **NO correct answers, NO labels, NO teacher.** It has to find patterns and structure **completely on its own.**

> **Unsupervised** = No supervision. No one tells the computer what the answers are. It figures it out alone.

---

## How Is It Different From Supervised Learning?

| | Supervised Learning | Unsupervised Learning |
|---|---|---|
| **Has labels?** | YES — "This is spam", "This is a cat" | NO — just raw data, no labels |
| **Teacher?** | YES — someone provided the answers | NO — computer learns alone |
| **Goal** | Predict a specific answer | Find hidden patterns/groups |
| **Example** | "Is this email spam?" (Yes/No) | "What groups exist in my customers?" |
| **Like** | A student studying with an answer key | A student discovering patterns with no answer key |

---

## The 2 Types of Unsupervised Learning

### 1. Clustering (Group Similar Things Together)

The computer looks at data and says: "These things are similar — they belong in the same group."

**Real-World Examples:**

| Problem | What Gets Grouped | Groups Found |
|---------|-------------------|--------------|
| Customer Segmentation | 10,000 customers by spending habits | Budget shoppers, Premium shoppers, Sale hunters |
| News Articles | Thousands of articles | Politics, Sports, Technology, Entertainment |
| Music Recommendations | Songs by style | Rock, Pop, Jazz, Classical clusters |
| Biology | DNA sequences | Species groups |

**Models we'll learn:**
- **K-Means** — You tell it how many groups (K), it sorts the data
- **DBSCAN** — It figures out how many groups on its own + spots outliers

### 2. Anomaly Detection (Spot the Weird One)

The computer learns what "normal" looks like, then flags anything that **doesn't fit.**

**Real-World Examples:**

| Problem | What's Normal | What's Anomalous |
|---------|---------------|-------------------|
| Credit Card Fraud | Regular purchases at local shops | Rs 5 lakh at 3am in a different country |
| Factory Quality Control | Normal-shaped products | A dented or cracked product |
| Network Security | Normal website traffic | Sudden 1000x spike = hacking attempt |
| Health Monitoring | Normal heart rate (60-100 bpm) | Heart rate suddenly drops to 30 bpm |

**Models we'll learn:**
- **Isolation Forest** — Quickly isolates the odd ones in the data
- **Autoencoder** — Learns what "normal" looks like, flags anything that doesn't match

---

## The School Photo Analogy (Full Version)

Imagine your teacher dumps **50 unlabeled student photos** on your desk:

### Clustering Task:
> "Sort these into groups. I won't tell you how many groups or what the groups are."

You look at the photos and naturally start grouping:
- Group 1: Boys in blue uniform
- Group 2: Girls in blue uniform
- Group 3: Kids in sports kit
- Group 4: Teachers (they snuck in!)

**You found 4 groups that nobody told you about.** That's clustering.

### Anomaly Detection Task:
> "Find anyone who looks suspicious or out of place."

You scan through 49 normal students... and then:
- Photo #37: Someone wearing a clown costume → **ANOMALY!**
- Photo #42: Someone facing backward → **ANOMALY!**

**You found the weird ones without being told what "weird" means.** That's anomaly detection.

---

## ExamGuard AI Connection

ExamGuard uses BOTH types of unsupervised learning:

### Clustering in ExamGuard
- **Group student behaviors:** "These 30 students behave similarly (normal). These 5 students behave similarly (suspicious). These 2 students behave unlike anyone else (needs investigation)."
- **Discover unknown cheating patterns:** Maybe a group of students are all tapping their desks at the same time — clustering reveals this hidden pattern.

### Anomaly Detection in ExamGuard
- **Spot unusual behavior:** Train the AI on normal exam behavior. Then anything that doesn't match "normal" gets flagged.
- **Catch NEW cheating methods:** Supervised learning can only catch cheating methods it was trained on. Unsupervised learning catches methods NOBODY has seen before.

---

## When to Use Unsupervised Learning

Use it when:
1. **You DON'T have labeled data** — no one has provided correct answers
2. **You want to discover hidden groups** — "What kinds of customers do I have?"
3. **You want to find outliers** — "Is anything unusual happening?"
4. **You want to explore your data** — "What patterns exist that I don't know about?"

## When You CAN'T Use Unsupervised Learning

- You need a specific prediction (like "Will this customer buy?" → use supervised)
- You need a yes/no or number answer → use supervised
- You already have labeled data → supervised will be more accurate

---

## Key Terms

| Term | Meaning | Example |
|------|---------|---------|
| **Unsupervised** | Learning without labels/answers | Finding groups in customer data |
| **Clustering** | Grouping similar data points together | Customers → Budget, Premium, Sale Hunter |
| **Anomaly Detection** | Finding data points that don't fit the pattern | 1 transaction out of 1 million is fraud |
| **Cluster** | A single group of similar data points | All "budget shoppers" = one cluster |
| **Outlier / Anomaly** | A data point that doesn't belong to any group | The clown in a room of businesspeople |
| **Centroid** | The "center" of a cluster | Average position of all points in a group |
| **Noise** | Random, meaningless data points | Static in a radio signal |

---

## Folder Structure

```
Unsupervised/
  |-- Clustering/              --> Group similar things together
  |     |-- K_Means.md         --> You choose how many groups (K)
  |     |-- DBSCAN.md          --> It finds groups on its own + spots outliers
  |
  |-- Anomaly_Detection/       --> Spot the weird/unusual ones
  |     |-- Isolation_Forest.md --> Quickly isolates odd data points
  |     |-- Autoencoder.md      --> Learns "normal", flags anything different
  |
  |-- resources.md             --> YouTube channels & courses for learning
```
