# Isolation Forest

## What It Does

Isolation Forest finds the **rare, weird data points** in your dataset. It works by trying to "isolate" each data point — the easier something is to isolate from everyone else, the more likely it's an **anomaly.** Normal things are hard to separate from the crowd. Weird things stand out immediately.

---

## Real-World Example

### Problem: Credit Card Fraud Detection

A bank processes **1 million transactions per day.** Of these:
- 999,000 are normal (99.9%)
- 1,000 are fraud (0.1%)

The bank can't manually check 1 million transactions. They need AI to **automatically flag the suspicious ones.**

### Fraud Examples:

| Transaction | Amount | Time | Location | Normal or Fraud? |
|-------------|--------|------|----------|-----------------|
| Grocery store | Rs 2,500 | 6pm | Lahore | Normal |
| Petrol pump | Rs 5,000 | 8am | Lahore | Normal |
| Online shopping | Rs 8,000 | 3pm | Lahore | Normal |
| **Jewelry store** | **Rs 5,00,000** | **3am** | **Dubai** | **FRAUD!** |
| Restaurant | Rs 1,200 | 7pm | Lahore | Normal |
| **ATM withdrawal** | **Rs 2,00,000** | **2am** | **Karachi** | **FRAUD!** |

### How Isolation Forest Catches It:

The Rs 5,00,000 transaction at 3am in Dubai is **NOTHING like** the other 999,000 transactions. It gets **isolated in just 2-3 questions:**

1. "Is the amount > Rs 1,00,000?" → YES → Already separated from 99% of transactions
2. "Is the time between 1am-5am?" → YES → Isolated! Almost no one shops at 3am for 5 lakhs

A normal Rs 2,500 grocery transaction would take **many more questions** to separate — because thousands of other transactions look just like it.

**Fewer questions to isolate = More likely to be fraud.**

---

## How It Works (The Costume in a Crowd Analogy)

Imagine you're at a **cricket match.** 50,000 people are wearing normal clothes — t-shirts, jeans, jerseys. But ONE person is wearing a **full dinosaur costume.**

### Finding the Dinosaur Person:

**Question 1:** "Are you wearing a costume?"
- Dinosaur person: "YES" → **ISOLATED in 1 question!**

### Finding a Normal Person:

**Question 1:** "Are you wearing a t-shirt?" → "Yes" (still 25,000 people match)
**Question 2:** "Is it blue?" → "Yes" (still 5,000 people match)
**Question 3:** "Are you in Section B?" → "Yes" (still 500 people match)
**Question 4:** "Row 15-20?" → "Yes" (still 50 people match)
**Question 5:** "Seat 1-10?" → "Yes" (still 5 people match)
... took MANY questions to isolate!

```
ANOMALY (Dinosaur Costume):          NORMAL (Blue T-shirt):
Question 1 → ISOLATED!               Question 1 → 25,000 still match
                                      Question 2 → 5,000 still match
Total questions: 1                    Question 3 → 500 still match
                                      Question 4 → 50 still match
                                      Question 5 → 5 still match

Fewer questions = ANOMALY             Many questions = NORMAL
```

### Isolation Forest Does Exactly This:
- It builds many random "question trees" (decision trees)
- For each data point, it counts how many questions it takes to isolate it
- **Short path** (few questions) = ANOMALY
- **Long path** (many questions) = NORMAL

---

## When to Use Isolation Forest

- **Finding rare events** — fraud (0.1%), defects (0.01%), cyberattacks
- **You have mostly normal data** — 99%+ is normal, you want the 1% weirdos
- **You don't have labels** — you don't know WHICH transactions are fraud (unsupervised)
- **Fast results needed** — Isolation Forest is very fast, even on large datasets
- **High-dimensional data** — works well even with many features (amount, time, location, etc.)

## When NOT to Use Isolation Forest

- **When anomalies are common** — if 10%+ of your data is "abnormal," Isolation Forest gets confused. It works best when anomalies are RARE.
- **When you have labeled data** — if you already know which data is fraud/not fraud, use supervised learning (like Random Forest). It will be more accurate.
- **When you need to explain WHY something is anomalous** — Isolation Forest says "this is weird" but doesn't clearly explain what makes it weird.
- **When "normal" is hard to define** — works best when most data is clearly similar.

---

## ExamGuard AI Connection

### How Isolation Forest Helps ExamGuard

During an exam, 99% of student behaviors are normal. Isolation Forest **quickly spots the 1% that isn't.**

**Normal Exam Behavior (hard to isolate — takes many questions):**
- Looking at paper → 95% of students do this
- Writing → 90% of students do this
- Occasionally looking up → 70% of students do this

**Suspicious Behavior (easy to isolate — takes few questions):**

| Behavior | Questions to Isolate | Why It's Flagged |
|----------|---------------------|------------------|
| Student hasn't looked at paper for 5 minutes | 1-2 questions | Almost NO normal student does this |
| Student's hand under desk for 3 minutes | 2 questions | Very unusual during an exam |
| Student looking at same neighbor 15 times | 2-3 questions | Normal students look at neighbor 0-2 times |
| Two students making identical movements | 2 questions | Statistically nearly impossible by chance |

```
Isolation Forest in ExamGuard:

Student A: looked at paper, wrote answers, looked up twice → NORMAL
  (Path length: 15 questions to isolate → long path → NORMAL)

Student B: hasn't written for 5 min, hand under desk, keeps looking at lap → FLAGGED!
  (Path length: 2 questions to isolate → short path → ANOMALY!)

→ ALERT: "Camera 3, Seat 27 — unusual behavior detected (confidence: 94%)"
```

---

## Key Terms

| Term | Meaning | Example |
|------|---------|---------|
| **Isolation** | Separating one data point from all others | Separating the dinosaur costume person from the crowd |
| **Anomaly Score** | A number showing how "weird" a point is (0 to 1) | 0.9 = very anomalous, 0.3 = normal |
| **Path Length** | How many questions (splits) it takes to isolate a point | Short path = anomaly, long path = normal |
| **Contamination** | What percentage of your data you EXPECT to be anomalous | 0.01 = expect 1% anomalies |
| **Isolation Tree** | One random "question tree" | Many trees together = Isolation Forest |
| **Forest** | Collection of many isolation trees | 100 trees voting together = more reliable |

---

## Quick Summary

```
Isolation Forest in one line:
"The easier something is to separate from the crowd, the weirder it is."

Input:  1,000,000 transactions (no labels)
Output: 1,000 flagged as fraud (the easy-to-isolate ones)

You choose: contamination (expected % of anomalies)
It finds:  Which data points are anomalies

Key insight: Anomalies are RARE and DIFFERENT
  → They get isolated quickly (short path)
  → Normal points take many splits to isolate (long path)
```
