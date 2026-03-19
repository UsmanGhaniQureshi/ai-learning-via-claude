# Phase 4: Deep Learning — Learning Resources

## YouTube Tutorials (Free)

### PyTorch Fundamentals
- **"PyTorch for Deep Learning & Machine Learning — Full Course"** by freeCodeCamp
  - 25+ hours, covers everything from tensors to deployment
  - https://www.youtube.com/watch?v=V_xro1bcAuQ
- **"PyTorch Tutorials"** by Sentdex
  - Practical, project-based approach
  - Great for people who learn by doing
- **"PyTorch in 100 Seconds"** by Fireship
  - Quick overview before diving deep

### CNN (Convolutional Neural Networks)
- **"But what is a convolution?"** by 3Blue1Brown
  - Beautiful visual explanation of convolutions
  - Must-watch before coding anything
- **"CNN Explainer"** by Poloclub (interactive website)
  - https://poloclub.github.io/cnn-explainer/
  - See CNN layers activate in real time on actual images
- **"Convolutional Neural Networks Explained"** by deeplizard
  - Step-by-step, beginner-friendly series
- **"CS231n: Convolutional Neural Networks for Visual Recognition"** by Stanford (YouTube)
  - University-level but incredibly clear lectures by Andrej Karpathy

### Transfer Learning
- **"Transfer Learning with PyTorch"** by PyTorch official
  - Exact workflow you will use for ExamGuard
- **"Transfer Learning Explained"** by StatQuest
  - Josh Starmer breaks it down clearly with no jargon
- **"Fine-tuning pre-trained models in PyTorch"** — search for latest tutorials
  - New tutorials appear regularly as models improve

### Data Augmentation
- **"Data Augmentation Techniques for Deep Learning"** — search YouTube
  - Many short tutorials showing before/after effects
- **"Albumentations library tutorial"**
  - Advanced augmentation library (beyond torchvision transforms)
  - Very popular in Kaggle competitions

---

## Courses (Structured Learning)

### Highly Recommended (Free)

- **fast.ai — Practical Deep Learning for Coders**
  - https://course.fast.ai/
  - FREE, 7 lessons, top-down approach (build first, theory later)
  - Created by Jeremy Howard (former Kaggle president)
  - Teaches PyTorch through the fastai library
  - You will build image classifiers in Lesson 1
  - **This is the single best free deep learning course available**

### Recommended (Paid but worth it)

- **DeepLearning.AI — Deep Learning Specialization** (Coursera)
  - By Andrew Ng (co-founder of Google Brain)
  - 5 courses covering everything from basics to advanced
  - Uses TensorFlow, but concepts apply to PyTorch
  - Free to audit, ~$49/month for certificates
  - Financial aid available

- **DeepLearning.AI — TensorFlow Developer Professional Certificate** (Coursera)
  - More practical, project-focused
  - Covers CNNs, transfer learning, and image classification specifically

---

## Practice Platforms

### Kaggle (Free)
- **"Dogs vs Cats"** competition — perfect first image classification project
  - https://www.kaggle.com/c/dogs-vs-cats
- **"Digit Recognizer"** (MNIST) — beginner-friendly
  - https://www.kaggle.com/c/digit-recognizer
- **"Intel Image Classification"** — classify scenes (buildings, forest, etc.)
  - Good transfer learning practice
- **Kaggle Learn: Intro to Deep Learning** — free micro-course
  - https://www.kaggle.com/learn/intro-to-deep-learning

### Google Colab (Free GPU)
- https://colab.research.google.com/
- Free GPU access for training models
- No setup needed — runs in your browser
- Perfect for following along with tutorials

---

## Books (Optional, for deeper understanding)

- **"Dive into Deep Learning"** (Free online)
  - https://d2l.ai/
  - Interactive book with runnable code
  - Available in PyTorch, TensorFlow, and JAX versions

- **"Deep Learning with Python"** by Francois Chollet
  - Written by the creator of Keras
  - Very practical, lots of code examples

---

## GitHub Repositories

- **PyTorch official examples:** https://github.com/pytorch/examples
  - Image classification, transfer learning, and more
- **PyTorch image models (timm):** https://github.com/huggingface/pytorch-image-models
  - Hundreds of pre-trained models for transfer learning
- **Albumentations:** https://github.com/albumentations-team/albumentations
  - Advanced data augmentation library

---

## Recommended Learning Order

```
Week 1-2: PyTorch basics
  → Watch: freeCodeCamp PyTorch course (first 5 hours)
  → Do: MNIST digit classifier mini project
  → Practice: Kaggle Digit Recognizer

Week 3-4: CNNs
  → Watch: 3Blue1Brown convolution video
  → Watch: deeplizard CNN series
  → Do: Cats vs Dogs CNN mini project
  → Play with: CNN Explainer website

Week 5-6: Image Classification + Transfer Learning
  → Start: fast.ai course (Lessons 1-3)
  → Do: Transfer learning mini project with ResNet
  → Practice: Kaggle Dogs vs Cats competition

Week 7: Data Augmentation
  → Watch: Augmentation tutorials
  → Do: Augmentation comparison mini project
  → Experiment: Try different augmentations on your dataset

Week 8: Put it all together
  → Build: Full pipeline (data → augmentation → transfer learning → evaluation)
  → Target: 90%+ accuracy on a custom image classification task
```

---

## Quick Reference: What to Search When Stuck

| Problem | Search This |
|---------|-------------|
| PyTorch installation issues | "install pytorch [your OS] [cuda version]" |
| Model not learning | "pytorch model not training troubleshooting" |
| Out of GPU memory | "pytorch reduce GPU memory usage" |
| Overfitting | "pytorch prevent overfitting CNN" |
| Low accuracy | "improve CNN accuracy pytorch" |
| Confusion about tensors | "pytorch tensor tutorial beginner" |
| Transfer learning not working | "pytorch transfer learning fine-tuning tips" |

---

## Key Tip

Do not try to learn everything before building. Follow the fast.ai philosophy: **build something first, then understand why it works.** You will learn 10x faster by training a real model and seeing what breaks than by reading theory for weeks.
