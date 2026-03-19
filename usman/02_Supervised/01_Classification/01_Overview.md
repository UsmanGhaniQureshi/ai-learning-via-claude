# Classification

## What Is Classification?

Classification means **sorting things into categories.**

Think of a sorting machine at a fruit factory:
- A mango comes in → machine says **"Mango"**
- An apple comes in → machine says **"Apple"**
- An orange comes in → machine says **"Orange"**

The machine learned from thousands of labeled examples (fruit photos with their names), and now it can sort NEW fruits it has never seen before.

> **Classification = The answer is a WORD or a CATEGORY, not a number.**

---

## Real-World Examples

| Problem | What Goes In (Features) | What Comes Out (Label/Category) |
|---------|------------------------|--------------------------------|
| **Spam Detection** | Email text, number of links, sender address | "Spam" or "Not Spam" |
| **Disease Diagnosis** | Blood pressure, sugar level, symptoms | "Diabetic" or "Healthy" |
| **Fruit Sorting** | Color, weight, shape | "Apple", "Banana", or "Mango" |
| **Exam Cheating** | Head direction, eye movement, hand position | "Cheating" or "Not Cheating" |
| **Sentiment Analysis** | Customer review text | "Positive", "Negative", or "Neutral" |
| **Face Recognition** | Photo of a face | "Usman", "Ahmed", "Unknown" |

---

## Quick Reminder: Features vs Labels

This is the MOST important concept. Let's make sure it's clear:

```
FEATURES (Input)              LABEL (Output)
---------------------         ---------------
Email has 10 links     →      "Spam"
Email has 0 links      →      "Not Spam"
Email has 8 links      →      "Spam"
```

- **Features** = The clues / information you give the computer
- **Label** = The correct answer / category

During **training**, you give BOTH features and labels.
During **prediction**, you give ONLY features, and the computer guesses the label.

---

## How to Tell If Your Problem Is Classification

Ask yourself these questions:

1. **Is my answer a WORD or CATEGORY?** → Yes? It's classification.
2. **Am I sorting things into groups?** → Yes? It's classification.
3. **Can I list all possible answers?** → Like "Yes/No", "Cat/Dog/Bird", "Spam/Not Spam"? It's classification.

### NOT Classification:
- "How much will this house cost?" → That's a NUMBER → **Regression**
- "What will the temperature be tomorrow?" → That's a NUMBER → **Regression**

---

## Types of Classification

### Binary Classification (2 categories)
- Spam / Not Spam
- Cheating / Not Cheating
- Sick / Healthy

### Multi-class Classification (3+ categories)
- Apple / Banana / Mango / Orange
- Cat / Dog / Bird / Fish
- Grade A / Grade B / Grade C / Fail

---

## Classification Models in This Folder

| Model | Best For | Difficulty |
|-------|----------|------------|
| **Logistic Regression** | Simple 2-category problems | Easy |
| **Decision Tree** | When you need to explain WHY | Easy |
| **Random Forest** | Best overall accuracy | Medium |
| **SVM** | Clear separation between groups | Medium |
| **KNN** | Simple, intuitive problems | Easy |
| **CNN** | Images and video (ExamGuard!) | Hard |

Start with **Logistic Regression** and **Decision Tree** — they're the easiest to understand. Work your way up to **CNN** which is the most powerful but also most complex.

---

## Key Terms

| Term | Meaning | Example |
|------|---------|---------|
| **Classification** | Sorting into categories | Spam / Not Spam |
| **Binary** | Only 2 categories | Yes / No |
| **Multi-class** | 3 or more categories | Apple / Banana / Mango |
| **Features** | Input clues | Word count, link count |
| **Label** | The correct category | "Spam" |
| **Prediction** | Computer's guess for new data | "This email is Spam" |
