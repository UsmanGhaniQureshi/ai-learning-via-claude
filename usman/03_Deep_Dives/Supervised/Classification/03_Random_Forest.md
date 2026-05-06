# Random Forest

## What It Does

Random Forest creates **many decision trees** (a "forest") and lets them all **vote** on the answer. The category that gets the most votes wins. This fixes the biggest problem with a single Decision Tree — overfitting.

---

## Real-World Example: Disease Diagnosis

**Problem:** A hospital wants to predict if a patient has **Diabetes** based on their medical data.

**Patient data:**

| Feature | Value |
|---------|-------|
| Age | 45 |
| Blood Sugar | 180 |
| BMI (body weight index) | 32 |
| Blood Pressure | 140/90 |
| Family History | Yes |

**What happens inside Random Forest:**

```
Tree 1 (looks at Age, BMI, Blood Sugar):         → Diabetes
Tree 2 (looks at Blood Pressure, BMI, Family):   → Diabetes
Tree 3 (looks at Age, Blood Pressure, Sugar):     → Healthy
Tree 4 (looks at BMI, Family, Age):               → Diabetes
Tree 5 (looks at Sugar, Family, Blood Pressure):  → Diabetes
...
Tree 100 (looks at Age, Sugar, Family):           → Diabetes
```

**Vote count:** Diabetes = 82 trees, Healthy = 18 trees

**Final answer: DIABETES** (majority wins!)

---

## How It Works (Simple Analogy)

**Imagine you're sick and you want a diagnosis.**

- **Decision Tree** = Asking ONE doctor → They might be wrong
- **Random Forest** = Asking **100 different doctors** → Each doctor looks at slightly different symptoms and medical reports → **The majority opinion is almost always correct**

Why does this work? Because:
- Each doctor might make individual mistakes
- But it's VERY unlikely that 80 out of 100 doctors are ALL wrong
- The mistakes of individual doctors **cancel each other out**

The "random" part means each tree:
1. Gets a **random sample** of the training data (not all of it)
2. Looks at a **random selection of features** (not all of them)

This is what makes them different from each other — and different opinions lead to better group decisions!

---

## When to Use It

- You want the **best accuracy** for tabular data (rows and columns)
- You have a **medium to large dataset**
- You don't mind a model that's a bit of a **"black box"** (harder to explain exactly why it made a decision)
- You want something that's **hard to mess up** — Random Forest works well even without much tuning

## When NOT to Use It

- You need **instant, real-time speed** — 100 trees take longer than 1 tree
- You need to **explain every step** of the decision (a bank can't say "100 trees voted" — they need to show a clear reason). Use a single Decision Tree instead
- You're working with **images** (use CNN instead)
- Your data is very **small** (less than a few hundred rows) — not enough data to split among 100 trees

---

## ExamGuard Connection

Random Forest could be used as a **backup check** in ExamGuard:

After the CNN processes the camera image and extracts features like:
- Head angle: 35 degrees
- Eye direction: Left
- Mouth movement: None
- Hand near face: No
- Time looking away: 8 seconds

These features go into a Random Forest with 100 trees:
- 78 trees say: **CHEATING**
- 22 trees say: **NOT CHEATING**
- **Final verdict: CHEATING** (flagged for teacher review)

The advantage: Even if some trees are confused by unusual head positions, the majority will likely get it right.

---

## Key Terms

| Term | Meaning |
|------|---------|
| **Random Forest** | A collection of many decision trees that vote together |
| **Ensemble** | Any method that combines multiple models into one (Random Forest is an ensemble method) |
| **Voting** | Each tree gives its answer, and the most popular answer wins |
| **Bagging** | The technique of giving each tree a random sample of data (short for "Bootstrap Aggregating" — but you don't need to remember that!) |
| **Overfitting** | When a model memorizes training data instead of learning patterns — Random Forest reduces this problem compared to a single Decision Tree |
