# KNN (K-Nearest Neighbors)

## What It Does

KNN classifies something by looking at its **nearest neighbors** in the data. Whatever category most of the neighbors belong to, the new item gets that same category. It literally uses the idea: **"You are who your neighbors are."**

---

## Real-World Example: House Price Category

**Problem:** You want to classify houses as **"Cheap"**, **"Medium"**, or **"Expensive"** based on size and location.

Imagine plotting houses on a graph (size on one axis, location score on the other):

```
        ^  Location Score
        |
        |  ($$$) ($$$)           ← Expensive houses
        |     ($$$)
        |
        |        ($$) ($$)       ← Medium houses
        |     ($$)  ($$)
        |
        |  ($) ($)               ← Cheap houses
        | ($)    ($)
        |        ★ ← YOUR HOUSE (new, unknown)
        +-------------------------> Size
```

**Your house is the star (★). Let's use K=5 (look at 5 nearest neighbors):**

The 5 closest houses to yours are:
- Neighbor 1: **Cheap**
- Neighbor 2: **Cheap**
- Neighbor 3: **Cheap**
- Neighbor 4: **Medium**
- Neighbor 5: **Medium**

**Vote: Cheap = 3, Medium = 2, Expensive = 0**

**Answer: Your house is classified as "Cheap"** (majority wins!)

---

## How It Works (Simple Analogy)

**You're the new kid at school. You don't know which group you belong to.**

- You look at the **5 kids sitting closest to you** in class
- 3 of them are in the Science Club
- 2 of them are in the Sports Club
- Since most of your neighbors are in Science Club, you're probably a **Science Club** type too!

That's KNN. No complicated calculations. No training phase. Just: **"Look at who's nearby and go with the majority."**

---

## The "K" in KNN

**K = how many neighbors to check.**

| K Value | What Happens |
|---------|-------------|
| K = 1 | Look at only the 1 closest neighbor. Risky — what if that one neighbor is weird? |
| K = 3 | Look at 3 closest. Better, but still could be unreliable. |
| K = 5 | Look at 5 closest. A good default starting point! |
| K = 100 | Look at 100 closest. Very safe but might include neighbors that are too far away. |

**Rule of thumb:** Start with K = 5, then try different values and see which works best.

**Important:** Always use an ODD number for K (3, 5, 7...) so you never get a tie in the vote!

---

## When to Use It

- You have a **simple problem** with clear groups
- Your dataset is **small** (hundreds to a few thousand rows)
- You want results that are **easy to understand** ("it was classified as X because its 5 nearest neighbors were X")
- You want something with **no training time** — KNN doesn't "learn" anything, it just remembers all the data

## When NOT to Use It

- You have **large data** (millions of rows) — KNN has to check the distance to EVERY single point for each prediction. That's incredibly slow!
- Your data has **many features** (like 100+ columns) — in high dimensions, the concept of "nearest neighbor" breaks down (everything seems equally far away)
- You need **fast predictions** — since it checks every data point each time, predictions are slow
- Your data has a lot of **irrelevant features** — these confuse the distance calculation

---

## ExamGuard Connection

KNN could be used for a **simple prototype** of ExamGuard:

**Scenario:** You have pre-labeled data of student head positions:
- (Head angle: 0, Eye direction: forward) → "Not Cheating"
- (Head angle: 45, Eye direction: left) → "Cheating"
- ... hundreds more examples

**New observation:** A student with head angle 40, eye direction slightly left.

**KNN checks 5 nearest neighbors:**
- 4 out of 5 are labeled "Cheating"
- **Result: CHEATING** (flagged!)

This would be a good **first experiment** — simple and fast to build. But for the real ExamGuard with camera images, you'd graduate to CNN since KNN can't handle raw image data efficiently.

---

## Key Terms

| Term | Meaning |
|------|---------|
| **KNN** | K-Nearest Neighbors — classify by looking at the K closest data points |
| **K** | The number of neighbors to check (you choose this — start with 5) |
| **Distance** | How "close" two data points are (usually measured in a straight line between them) |
| **Lazy Learner** | KNN is called a "lazy learner" because it doesn't actually learn anything during training — it just saves all the data and does all the work during prediction |
| **Majority Vote** | The most common category among the K neighbors becomes the answer |
