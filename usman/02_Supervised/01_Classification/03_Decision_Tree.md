# Decision Tree

## What It Does

A Decision Tree makes decisions by asking a **series of Yes/No questions**, one after another, until it reaches a final answer. It works exactly like a flowchart.

---

## Real-World Example: Loan Approval

**Problem:** A bank wants to automatically decide if a loan should be **Approved** or **Rejected**.

**The tree the computer learns:**

```
                    Income > 50,000?
                   /              \
                 YES               NO
                /                    \
      Credit Score > 700?        Has Guarantor?
         /        \                /        \
       YES        NO            YES         NO
        |          |              |           |
     APPROVE   Employment       APPROVE    REJECT
               > 2 years?
               /      \
             YES       NO
              |         |
           APPROVE   REJECT
```

**How it works for a new customer:**
- Usman applies for a loan
- Income = 60,000? → YES (go right... wait, go left)
- Credit Score = 650? → NO (go right)
- Employment = 3 years? → YES
- **Decision: APPROVE**

The bank can see EXACTLY why Usman got approved — because of his income, and even though his credit score was low, his long employment saved him.

---

## How It Works (Simple Analogy)

**It's like playing the game "20 Questions"!**

Think of the game where someone thinks of an animal, and you ask:
1. "Is it bigger than a cat?" → Yes
2. "Does it live in water?" → No
3. "Does it have stripes?" → Yes
4. "Is it a tiger?" → **YES!**

Each question **splits** the possibilities. After a few smart questions, you narrow down to the answer.

A Decision Tree does the same thing with data — it picks the BEST question to ask at each step to split the data most effectively.

---

## When to Use It

- You need to **explain WHY** a decision was made (banks need to tell customers why their loan was rejected; hospitals need to explain why a treatment was chosen)
- Your data is **tabular** (rows and columns, like a spreadsheet)
- You want something **easy to visualize** — you can literally draw the tree and show it to anyone
- You're a **beginner** and want to understand how models think

## When NOT to Use It

- Your data is **very complex** with lots of features — the tree gets HUGE and messy
- You want the **best possible accuracy** — Decision Trees tend to **overfit** (they memorize the training data too perfectly and fail on new data)
- You're working with **images** (use CNN instead)
- You have a lot of **noise** (random errors) in your data — the tree will try to learn the noise too

---

## ExamGuard Connection

A Decision Tree for ExamGuard might look like:

```
        Head turned > 30 degrees?
           /              \
         YES               NO
        /                    \
  Eyes looking at           → NOT CHEATING
  neighbor's paper?
     /        \
   YES         NO
    |           |
 CHEATING    Looking at
             clock/ceiling?
              /       \
            YES        NO
             |          |
         NOT         SUSPICIOUS
         CHEATING    (flag for review)
```

This is great because a teacher could look at this tree and say: "Yes, that logic makes sense!" But real exam cheating detection with cameras needs image processing, so we'd use CNN for the actual ExamGuard system.

---

## Key Terms

| Term | Meaning |
|------|---------|
| **Decision Tree** | A model that makes decisions by asking a chain of Yes/No questions |
| **Root Node** | The very first question at the top of the tree |
| **Leaf Node** | The final answer at the bottom (Approve/Reject, Cheating/Not Cheating) |
| **Splitting** | Choosing which question to ask at each step |
| **Overfitting** | When the tree memorizes training data too perfectly and fails on new data (like memorizing past exam answers instead of understanding the concepts) |
