# Model Selection — Learning Resources

## YouTube Videos to Watch

Search for these on YouTube. Watch in this order:

### 1. Start Here (Big Picture)
- **Search:** `"StatQuest how to choose a machine learning model"`
  - Josh Starmer explains model selection with visuals and humor
  - He makes even confusing topics feel simple
- **Search:** `"Machine learning model selection for beginners"`
  - Several good beginner-level walkthroughs come up
  - Pick the one with the most views and watch it

### 2. Understand Each Model Type (Watch After You Read How_To_Choose.md)
- **Search:** `"StatQuest Logistic Regression clearly explained"`
  - You'll understand Case 1 (spam) and Case 8 (diabetes) better
- **Search:** `"StatQuest Linear Regression clearly explained"`
  - You'll understand Case 2 (house price) and Case 9 (weather) better
- **Search:** `"StatQuest Decision Trees clearly explained"`
  - You'll understand why doctors prefer Decision Trees (Case 8)
- **Search:** `"StatQuest Random Forest clearly explained"`
  - You'll understand the "upgrade from Decision Tree" concept
- **Search:** `"K-Means clustering simply explained"`
  - You'll understand Case 3 (customer grouping)

### 3. Deep Learning and Advanced Models
- **Search:** `"YOLO object detection explained for beginners"`
  - You'll understand Case 5 (phone detection in ExamGuard)
- **Search:** `"What is transfer learning simple explanation"`
  - You'll understand why we don't train from scratch with small data
- **Search:** `"What is reinforcement learning simple explanation"`
  - You'll understand Case 10 (self-driving car)
- **Search:** `"Autoencoder anomaly detection explained"`
  - You'll understand Case 6 (unusual behavior detection)

### 4. The Practical "How Do I Actually Choose?" Videos
- **Search:** `"how to choose the right machine learning algorithm"`
- **Search:** `"machine learning algorithm selection flowchart"`
- **Search:** `"which ML model should I use decision guide"`

---

## The Famous Scikit-Learn Algorithm Cheat Sheet

Scikit-learn (the most popular Python ML library) has an official flowchart for choosing a model.

**How to find it:**
- Google: `"scikit-learn algorithm cheat sheet"`
- Direct URL: https://scikit-learn.org/stable/machine_learning_map.html

**What it looks like:**
- A flowchart that starts with "How many samples do I have?"
- Then branches based on what you're trying to do
- Ends at a specific algorithm recommendation

**Honest note about it:**
- This cheat sheet is useful AFTER you understand the basics
- If you look at it right now, it might feel overwhelming
- Come back to it after watching the StatQuest videos and reading How_To_Choose.md
- Then it will make much more sense

---

## Websites for Quick Reference

- **Google's Machine Learning Crash Course** (free)
  - Search: `"Google machine learning crash course"`
  - Great for structured learning with real examples

- **Kaggle Learn** (free)
  - Search: `"Kaggle intro to machine learning"`
  - Hands-on coding exercises with real datasets
  - Start with "Intro to Machine Learning" course

- **Papers With Code** (for checking what models others use)
  - URL: https://paperswithcode.com
  - Search any task like "object detection" or "text classification"
  - See which models are currently the best for that task
  - This is where Trick 3 ("check what others are using") comes from

---

## Suggested Learning Path

```
Week 1: Read How_To_Choose.md carefully (this folder)
         Watch StatQuest: Logistic Regression + Linear Regression
         Goal: Understand Classification vs Regression

Week 2: Watch StatQuest: Decision Trees + Random Forest
         Look at scikit-learn cheat sheet
         Goal: Understand when simple vs complex models

Week 3: Watch YOLO + Transfer Learning videos
         Goal: Understand deep learning and when you need it

Week 4: Try Kaggle's "Intro to ML" course
         Goal: Actually CODE a model selection decision
```
