# Polynomial Regression

## What It Does

Polynomial Regression draws a **curved line** through your data points instead of a straight one. It's used when the relationship between your input and output is **not a straight line** — it bends, dips, or curves.

---

## Real-World Example: Crop Yield vs Fertilizer

**Problem:** A farmer wants to predict **crop yield** based on how much fertilizer they use.

**The data:**

| Fertilizer (kg) | Crop Yield (tons) |
|------------------|--------------------|
| 0 | 1.0 |
| 20 | 2.5 |
| 40 | 4.0 |
| 60 | 4.8 |
| 80 | 5.0 (peak!) |
| 100 | 4.5 |
| 120 | 3.0 |
| 140 | 1.5 |

**Notice the pattern:** Yield goes UP, reaches a PEAK, then comes back DOWN!

Too little fertilizer = low yield.
Right amount = best yield.
Too much = burns the crops, yield drops!

```
Yield (tons)
   5 |            •  •
   4 |         •        •
   3 |      •              •
   2 |   •
   1 | •                      •
     +--|---|---|---|---|---|---|---> Fertilizer (kg)
       0  20  40  60  80 100 120 140
```

**A straight line (Linear Regression) would be TERRIBLE here** — it can't capture the curve!

**Polynomial Regression draws a CURVE:**

```
Yield (tons)
   5 |          /‾‾‾‾\
   4 |        /        \
   3 |      /            \
   2 |    /                \
   1 |  /                    \
     +--|---|---|---|---|---|---|---> Fertilizer (kg)
       0  20  40  60  80 100 120 140
```

**Now the farmer can predict:** Using 50 kg of fertilizer → look at the curve → about 4.5 tons!

---

## How It Works (Simple Analogy)

**Life isn't always a straight line.**

- **Linear Regression** is like drawing with a ruler — only straight lines
- **Polynomial Regression** is like drawing with a flexible curve ruler — it can bend and twist to match the data

Think of it this way:
- A roller coaster track is NOT a straight line
- The path of a ball you throw in the air is NOT a straight line
- Happiness vs money is NOT a straight line (more money helps up to a point, then it stops mattering as much)

When the real-world pattern curves, you need a curved line to capture it!

---

## When to Use It

- You can clearly SEE that the relationship **curves** (plot your data and look!)
- **Linear Regression gave bad results** and the pattern obviously isn't straight
- The data goes **up then down** (like fertilizer example) or **down then up**
- You understand the general **shape** of the curve (U-shape, hill-shape, S-shape)

## When NOT to Use It

- You **don't know the shape yet** — always start with Linear Regression first! If the straight line works, stick with it
- You have **very little data** — curves need more data points to be reliable
- The relationship is **extremely complex** with many features — use Neural Networks instead
- You use **too high a degree** (too many curves) — the line starts wiggling wildly through every point, which means it's memorizing the data instead of learning the pattern (overfitting)

---

## The Danger: Overfitting with High Degree

The "degree" controls how curvy the line is:

```
Degree 1 (straight):    /          ← might be too simple
Degree 2 (one curve):   ∩          ← probably just right
Degree 3 (two curves):  ~          ← might be OK
Degree 10:              ~~~~~~     ← DANGER! Too wiggly! Overfitting!
```

**Rule of thumb:** Start with degree 2, then try 3. Rarely go above 4 or 5.

---

## ExamGuard Connection

Polynomial Regression could model **non-linear patterns** in ExamGuard:

**Example: Student attention vs exam time**

- First 15 minutes: Students are focused (low cheating risk)
- Middle of exam: Stress builds, some students start looking around (risk increases)
- Last 10 minutes: Desperate students try to cheat (risk peaks)
- Final 2 minutes: Everyone is writing fast, heads down (risk drops slightly)

This pattern isn't a straight line — it curves up and then slightly down. Polynomial regression could model this to predict **cheating risk level at each time point** during the exam.

---

## Key Terms

| Term | Meaning |
|------|---------|
| **Polynomial Regression** | Fitting a curved line through data instead of a straight one |
| **Degree** | How curvy the line is. Degree 1 = straight line, Degree 2 = one curve, Degree 3 = two curves, etc. |
| **Overfitting** | When the curve wiggles through every data point perfectly but makes terrible predictions on new data (too specific to training data) |
| **Underfitting** | When the curve is too simple to capture the real pattern (like using a straight line for curved data) |
