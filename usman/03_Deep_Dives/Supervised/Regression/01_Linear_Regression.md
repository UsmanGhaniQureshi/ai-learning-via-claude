# Linear Regression

## What It Does

Linear Regression draws the **best straight line** through your data points so you can predict a number. Give it a new input, and it tells you where that input falls on the line.

---

## Real-World Example: Predict House Price from Size

**Problem:** You want to predict **house prices** based on house size.

**Your data:**

| House Size (sq ft) | Price (lakhs) |
|--------------------|---------------|
| 800 | 40 |
| 1000 | 50 |
| 1200 | 60 |
| 1500 | 75 |
| 1800 | 90 |
| 2000 | 100 |

**Plot these on a graph:**

```
Price
(lakhs)
  100 |                              •
   90 |                         •
   80 |
   75 |                    •
   70 |
   60 |               •
   50 |          •
   40 |     •
      +-----|-----|-----|-----|-----|----> Size (sq ft)
          800  1000  1200  1500  1800 2000
```

**Linear Regression draws the BEST straight line through these dots:**

```
Price
(lakhs)
  100 |                            ••/
   90 |                       ••/ /
   80 |                    / /
   75 |                 /•/
   70 |              / /
   60 |           /•/
   50 |        /•/
   40 |     /•/
      +----/--|-----|-----|-----|----> Size (sq ft)
          800  1000  1200  1500  2000
```

**Now predict:** What would a 1400 sq ft house cost?

Look at the line at 1400 → **about 70 lakhs!**

---

## How It Works (Simple Analogy)

**Imagine throwing a bunch of dots on a graph paper.**

Now grab a ruler and try to place it so that it passes through the dots as closely as possible. The line won't go through every dot perfectly, but it should be **close to most of them.**

That's Linear Regression — **finding the best ruler position.**

The computer tries millions of positions and picks the one where the total distance between the line and all the dots is the smallest.

---

## When to Use It

- The relationship between input and output is roughly a **straight line** (as X goes up, Y goes up steadily)
- You have **small data** — works even with just a few dozen rows
- You want a **quick first try** — Linear Regression is always a good starting point
- You need to **explain the result** — "For every extra 100 sq ft, the price goes up by 5 lakhs" is easy to understand
- You want a **baseline** — try Linear Regression first, then see if fancier models do better

## When NOT to Use It

- The relationship is **curved** (like fertilizer vs crop yield — too much fertilizer hurts the crop). Use Polynomial Regression instead
- The data is **very complex** with many interacting features. Use Neural Networks instead
- You're predicting a **category**, not a number. Use Classification models instead
- There are **many outliers** (extreme values that don't follow the pattern) — the line gets pulled toward them

---

## ExamGuard Connection

Linear Regression probably won't be the main model in ExamGuard (since we need classification: Cheating / Not Cheating), but it could help with **related predictions:**

- **Predict how many minutes** a student looks away from their paper during a 60-minute exam
  - Features: Student's seat position, nearby students, exam difficulty
  - Output: **12.5 minutes** (a number)

- **Predict the cheating risk score** (0 to 100) for each student
  - Features: Past behavior, seat position, exam type
  - Output: **Risk score = 73** (a number)

These number predictions could feed into the larger ExamGuard system as additional features.

---

## Key Terms

| Term | Meaning |
|------|---------|
| **Linear Regression** | Finding the best straight line through data points to predict a number |
| **Linear** | Means "straight line" — the relationship goes up (or down) at a steady rate |
| **Best Fit Line** | The line that is closest to all the data points overall |
| **Slope** | How steep the line is — "for every 100 sq ft increase, price goes up by 5 lakhs" (the slope is 5 lakhs per 100 sq ft) |
| **Baseline** | The simplest model you try first, to compare other models against |
