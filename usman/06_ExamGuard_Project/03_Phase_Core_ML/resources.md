# Phase 3: Core ML - Resources

## Scikit-Learn

### YouTube
- **"Scikit-Learn Tutorial"** by freeCodeCamp
  - Complete walkthrough of the library
  - Search: "freeCodeCamp scikit-learn tutorial"

- **"Machine Learning with Scikit-Learn"** by Data School
  - Excellent playlist, very clear explanations
  - Search: "Data School scikit-learn tutorial"

- **"Scikit-Learn Crash Course"** by Tech With Tim
  - Quick but thorough overview
  - Search: "Tech With Tim scikit-learn crash course"

### Documentation
- **Scikit-Learn Official Docs:** scikit-learn.org/stable/
  - The best reference once you understand the basics
  - Especially: User Guide section

### Practice
- **Kaggle: Titanic Competition** (kaggle.com/c/titanic)
  - The classic beginner ML competition
  - Practice the full workflow: load data, preprocess, train, evaluate
  - Thousands of notebooks to learn from

---

## Evaluation Metrics

### YouTube
- **"Precision, Recall, F1 Score"** by StatQuest (Josh Starmer)
  - THE BEST explanation of these metrics, period
  - Search: "StatQuest precision recall"
  - Also watch his confusion matrix video

- **"ROC and AUC Explained"** by StatQuest
  - Another key metric, explained perfectly
  - Search: "StatQuest ROC AUC"

- **"Confusion Matrix Explained Simply"** by Normalized Nerd
  - Great visual explanation
  - Search: "Normalized Nerd confusion matrix"

- **"Accuracy is NOT Enough"** by Krish Naik
  - Why accuracy fails on imbalanced data
  - Search: "Krish Naik accuracy imbalanced"

### Must-Watch Order:
```
1. StatQuest: Confusion Matrix
2. StatQuest: Sensitivity and Specificity
3. StatQuest: Precision, Recall, F1
4. StatQuest: ROC and AUC
```
These four videos will give you a complete understanding of evaluation metrics.

---

## Data Preprocessing

### YouTube
- **"Data Preprocessing in Machine Learning"** by Krish Naik
  - Covers all preprocessing steps
  - Search: "Krish Naik data preprocessing ML"

- **"Feature Scaling: Normalization vs Standardization"** by StatQuest
  - When to use which scaling method
  - Search: "StatQuest feature scaling"

- **"Data Augmentation for Deep Learning"** by Aladdin Persson
  - How to create more training data from existing images
  - Search: "Aladdin Persson data augmentation"

---

## Imbalanced Data

### YouTube
- **"Dealing with Imbalanced Data"** by Krish Naik
  - Covers all solutions (SMOTE, oversampling, class weights)
  - Search: "Krish Naik imbalanced data"

- **"SMOTE Explained"** by Normalized Nerd
  - Visual explanation of how SMOTE creates synthetic examples
  - Search: "Normalized Nerd SMOTE"

- **"Class Imbalance in Machine Learning"** by Abhishek Thakur
  - Practical tips from a Kaggle Grandmaster
  - Search: "Abhishek Thakur class imbalance"

### Library
- **imbalanced-learn** (imbalanced-learn.org)
  - Python library specifically for handling imbalanced data
  - Includes SMOTE, ADASYN, and other methods
  - `pip install imbalanced-learn`

---

## Train-Test Split

### YouTube
- **"Train Test Split Explained"** by StatQuest
  - Clear, visual explanation
  - Search: "StatQuest train test split"

- **"Cross Validation Explained"** by StatQuest
  - Advanced technique for better evaluation
  - Search: "StatQuest cross validation"

- **"Overfitting vs Underfitting"** by StatQuest
  - Why we split data in the first place
  - Search: "StatQuest overfitting underfitting"

---

## Courses (Comprehensive)

### Free
- **Andrew Ng's Machine Learning Course** (Coursera)
  - The most famous ML course in the world
  - Covers all core ML concepts
  - Free to audit (no certificate without paying)
  - Search: "Andrew Ng machine learning Coursera"

- **Google's Machine Learning Crash Course** (developers.google.com/machine-learning)
  - Free, interactive, by Google
  - Covers all topics in this phase

- **fast.ai Practical Deep Learning** (course.fast.ai)
  - Free, practical, top-down approach
  - You'll use this more in later phases

### Paid (Optional)
- **"Hands-On Machine Learning"** by Aurelien Geron (book)
  - The best ML textbook, very practical
  - Uses Scikit-Learn and TensorFlow
  - Available as O'Reilly book

---

## Practice Platforms

### Kaggle Competitions (Start Here)
- **Titanic** (kaggle.com/c/titanic)
  - Binary classification, imbalanced data
  - Perfect practice for ExamGuard concepts

- **Digit Recognizer** (kaggle.com/c/digit-recognizer)
  - Image classification (handwritten digits)
  - First step toward computer vision

- **Spam Detection** datasets
  - Text classification with imbalanced data
  - Search "spam classification dataset" on Kaggle

### Kaggle Learn Courses (Free)
- **Intro to Machine Learning** (kaggle.com/learn/intro-to-machine-learning)
- **Intermediate Machine Learning** (kaggle.com/learn/intermediate-machine-learning)
  - These two cover exactly what's in this phase

---

## Recommended Learning Order

```
Week 1: Scikit-Learn Basics
  - Watch: freeCodeCamp Scikit-Learn tutorial
  - Practice: Kaggle Titanic competition
  - Goal: Complete the fit → predict → evaluate workflow

Week 2: Evaluation Metrics
  - Watch: ALL StatQuest videos (confusion matrix, precision, recall, F1, ROC)
  - Practice: Evaluate your Titanic model with all metrics
  - Goal: Understand WHY accuracy alone is not enough

Week 3: Data Preprocessing + Train-Test Split
  - Watch: Krish Naik data preprocessing
  - Watch: StatQuest overfitting + train-test split
  - Practice: Build a complete preprocessing pipeline
  - Goal: Clean data, split properly, preprocess correctly

Week 4: Imbalanced Data
  - Watch: Krish Naik imbalanced data + Normalized Nerd SMOTE
  - Practice: Take an imbalanced dataset, apply all solutions, compare results
  - Goal: Handle imbalanced data confidently (this is critical for ExamGuard!)
```

---

## Key Search Terms

When you need to find more resources, use these search terms:

```
Scikit-Learn:     "scikit-learn tutorial python beginners"
Preprocessing:    "data preprocessing machine learning python"
Evaluation:       "precision recall F1 score explained simply"
Imbalanced data:  "handling imbalanced data machine learning"
Train-test:       "train test split machine learning overfitting"
General ML:       "machine learning for beginners python practical"
```

---

## After This Phase

Once you're comfortable with:
- Training and evaluating models with Scikit-Learn
- Preprocessing data correctly
- Handling imbalanced data
- Understanding precision, recall, and F1

You're ready for **Phase 4: Computer Vision** where you'll start working with actual images and video using OpenCV and YOLO. That's where ExamGuard really starts to come alive.
