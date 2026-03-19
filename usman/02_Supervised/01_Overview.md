# Supervised Learning

## What Is Supervised Learning?

Imagine you have a **teacher** who shows you questions **and** the correct answers.

- The teacher says: "This picture is a **cat**." (shows you the picture AND the answer)
- The teacher says: "This picture is a **dog**." (again, picture + answer)
- After seeing 1000 examples with answers, you can now look at a NEW picture and say "That's a cat!"

**That's supervised learning.** You train the computer by giving it **data with correct answers already attached.** These correct answers are called **labels.**

> **Supervised** = Someone is supervising (teaching) the computer by providing the right answers.

---

## The 2 Types of Supervised Learning

There are ONLY two types. The difference is simple:

### 1. Classification (Answer = a WORD / CATEGORY)

The computer sorts things into **groups/categories.**

| Problem | Input (Features) | Output (Label) |
|---------|-------------------|-----------------|
| Spam Detection | Email text, links, sender | **"Spam"** or **"Not Spam"** |
| Disease Diagnosis | Symptoms, blood tests | **"Diabetes"** or **"Healthy"** |
| ExamGuard | Camera frame of student | **"Cheating"** or **"Not Cheating"** |

**How to know it's Classification:** Ask yourself — *Is the answer a WORD or a CATEGORY?* If yes, it's classification.

### 2. Regression (Answer = a NUMBER)

The computer predicts a **number on a scale.**

| Problem | Input (Features) | Output (Label) |
|---------|-------------------|-----------------|
| House Price | Size, location, rooms | **75 lakhs** |
| Exam Score | Hours studied, attendance | **82 marks** |
| Temperature | Month, humidity, wind | **35 degrees** |

**How to know it's Regression:** Ask yourself — *Is the answer a NUMBER that could be anything on a scale?* If yes, it's regression.

---

## Quick Test: Classification or Regression?

| Problem | Answer Type | Type |
|---------|-------------|------|
| Will it rain tomorrow? | Yes / No (word) | **Classification** |
| How much rain will fall? | 12mm (number) | **Regression** |
| Is this email spam? | Spam / Not Spam (word) | **Classification** |
| What will my electricity bill be? | 3500 rupees (number) | **Regression** |
| What fruit is this? | Apple / Banana / Mango (word) | **Classification** |
| How heavy is this fruit? | 150 grams (number) | **Regression** |

---

## When to Use Supervised Learning

Use supervised learning when:

1. **You HAVE labeled data** — someone has already provided the correct answers for your training examples
2. **You want to predict something specific** — a category OR a number
3. **You have enough examples** — at least a few hundred, ideally thousands

## When You CAN'T Use Supervised Learning

- You don't have correct answers/labels for your data
- You just want to find patterns or groups in your data (that's **unsupervised** learning)
- You want the computer to learn by trial and error (that's **reinforcement** learning)

---

## Key Terms

| Term | Meaning | Example |
|------|---------|---------|
| **Features** | The INPUT information you give the computer | House size, number of rooms |
| **Label** | The correct ANSWER you want to predict | House price (75 lakhs) |
| **Training Data** | Examples with both features AND labels | 1000 houses with sizes AND prices |
| **Prediction** | The computer's guess for NEW data | "This new house is worth 80 lakhs" |
| **Classification** | Predicting a CATEGORY | Spam / Not Spam |
| **Regression** | Predicting a NUMBER | 75 lakhs |

---

## Folder Structure

```
Supervised/
  |-- Classification/    --> Answer is a WORD (Spam, Cheating, Sick...)
  |     |-- Logistic_Regression.md
  |     |-- Decision_Tree.md
  |     |-- Random_Forest.md
  |     |-- SVM.md
  |     |-- KNN.md
  |     |-- CNN.md
  |
  |-- Regression/        --> Answer is a NUMBER (price, marks, temperature...)
  |     |-- Linear_Regression.md
  |     |-- Polynomial_Regression.md
  |     |-- Neural_Networks.md
  |
  |-- resources.md       --> YouTube channels & search terms for learning
```
