# Logistic Regression

## What It Does

Logistic Regression looks at the clues (features) and decides which of **two categories** something belongs to. Despite having "regression" in the name, it's actually a **classification** model — it answers YES or NO, not a number.

---

## Real-World Example: Email Spam Detection

**Problem:** You want to automatically detect if an email is **Spam** or **Not Spam**.

**Data you collect for each email:**

| Feature | Email 1 | Email 2 | Email 3 | Email 4 |
|---------|---------|---------|---------|---------|
| Word count | 15 | 250 | 20 | 300 |
| Number of links | 8 | 1 | 12 | 0 |
| Sender reputation (0-10) | 2 | 9 | 1 | 10 |
| Contains "FREE!!!" | Yes | No | Yes | No |
| **Label** | **Spam** | **Not Spam** | **Spam** | **Not Spam** |

The model learns the pattern: lots of links + low reputation + words like "FREE" = Spam.

Now when a NEW email arrives, it checks these features and says: **"87% chance this is Spam"** → Classified as **Spam**.

---

## How It Works (Simple Analogy)

**Imagine you have apples and oranges on a table.**

You draw a **fence** (a line) between them:
- Everything on the LEFT side of the fence = Apple
- Everything on the RIGHT side of the fence = Orange

```
  Apple  Apple          Orange  Orange
    Apple     |     Orange
  Apple       |        Orange  Orange
     Apple    |   Orange
              |
          (FENCE)
```

Logistic Regression finds the **best position for this fence** so that most apples are on one side and most oranges are on the other.

When a NEW fruit arrives, the model checks which side of the fence it falls on and says "Apple!" or "Orange!"

---

## When to Use It

- You have a **simple problem with 2 categories** (Yes/No, Spam/Not Spam, Pass/Fail)
- You have **small to medium data** (even a few hundred rows works)
- You need to **explain your results** (doctors, banks want to know WHY — logistic regression can show which features mattered most)
- You want a **quick first try** before using fancier models

## When NOT to Use It

- Your data has **complex patterns** (curves, circles, weird shapes — the fence is only a straight line!)
- You're working with **images or video** (use CNN instead)
- You have **many categories** (it works best with just 2)
- The relationship between features and answer is not straightforward

---

## ExamGuard Connection

In ExamGuard, Logistic Regression could be a **simple first step**:

- **Features:** Head angle, eye direction, time looking away, hand movement
- **Label:** "Cheating" or "Not Cheating"

It would draw a "fence" — students whose head angle + eye direction cross a certain threshold get flagged as potentially cheating.

**But for ExamGuard, we'd probably need something more powerful** (like CNN) because camera images have complex visual patterns that a simple fence can't handle.

---

## Key Terms

| Term | Meaning |
|------|---------|
| **Logistic Regression** | A classification model that draws a straight line (fence) between two groups |
| **Probability** | The model gives a percentage (like 87% spam). If above 50%, it picks that category |
| **Decision Boundary** | The "fence" — the line that separates the two groups |
| **Binary Classification** | Choosing between exactly 2 categories |
