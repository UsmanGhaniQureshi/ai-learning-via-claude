# Phase 6: Advanced ML — Learning Resources

## LSTM and RNN

### YouTube Videos
- **"LSTM Networks - EXPLAINED!"** by CodeEmporium — visual explanation of gates and memory
- **"Recurrent Neural Networks (RNN) - Deep Learning w/ Python, TensorFlow & Keras"** by sentdex — hands-on coding
- **"Illustrated Guide to LSTM's and GRU's"** by Michael Phi — best visual walkthrough
- **"Understanding LSTM Networks"** by The AI Epiphany — step-by-step through the math (beginner-friendly)
- **"Sequence Models"** by Andrew Ng (YouTube clips from Coursera) — the theory behind it all

### Articles
- **"Understanding LSTM Networks"** by Christopher Olah (colah.github.io) — THE classic explanation, read this first
- **"The Unreasonable Effectiveness of Recurrent Neural Networks"** by Andrej Karpathy — fun examples

### Practice
- Kaggle: "Stock Price Prediction" competitions (time series = sequences)
- PyTorch LSTM tutorial: pytorch.org/tutorials

---

## Autoencoders

### YouTube Videos
- **"Autoencoders - EXPLAINED"** by CodeEmporium — clear visual explanation
- **"Building Autoencoders in Keras"** by Keras official — step-by-step code
- **"Variational Autoencoders"** by Arxiv Insights — next level after basic autoencoders
- **"Autoencoder Tutorial PyTorch"** by Aladdin Persson — full code walkthrough

### Practice
- Kaggle: "Credit Card Fraud Detection" dataset — perfect for anomaly detection practice
- MNIST anomaly detection — train on one digit, detect others
- Fashion-MNIST — train on one clothing type, detect others

---

## Anomaly Detection

### YouTube Videos
- **"Anomaly Detection - Machine Learning"** by StatQuest — clear statistical foundation
- **"Isolation Forest Algorithm"** by Krish Naik — simple explanation with code
- **"One-Class SVM"** by Normalized Nerd — visual explanation
- **"Anomaly Detection in Time Series"** by ritvikmath — directly applicable to video

### Practice
- Kaggle: "Credit Card Fraud Detection" (most popular anomaly detection dataset)
- Kaggle: "Network Intrusion Detection" (another classic)
- scikit-learn anomaly detection examples: sklearn docs have great tutorials

---

## Reinforcement Learning

### YouTube Videos
- **"Reinforcement Learning in 3 Hours - Full Course"** by Nicholas Renotte — complete beginner course
- **"An introduction to Reinforcement Learning"** by Arxiv Insights — beautiful visual explanation
- **"Reinforcement Learning Course - Full Machine Learning Tutorial"** by freeCodeCamp — thorough free course
- **"Stable Baselines3 Tutorial"** by Nicholas Renotte — the library you will actually use

### Courses
- **"Reinforcement Learning Specialization"** by University of Alberta on Coursera — THE gold standard RL course
- **"Deep Reinforcement Learning"** by David Silver (DeepMind, YouTube) — legendary lecture series
- **"Spinning Up in Deep RL"** by OpenAI (spinningup.openai.com) — free, excellent documentation

### Practice
- OpenAI Gymnasium environments: CartPole, MountainCar, LunarLander
- Build your own simple environment first
- Stable Baselines3 documentation has many examples

---

## Real-Time Inference and Optimization

### YouTube Videos
- **"TensorRT Tutorial"** by NVIDIA Developer — official guide to GPU optimization
- **"ONNX Runtime Tutorial"** by Microsoft — convert and speed up models
- **"Model Optimization for Edge Deployment"** by Edge Impulse — practical optimization
- **"PyTorch Model Optimization"** by PyTorch official — quantization and pruning

### Articles
- NVIDIA TensorRT documentation: developer.nvidia.com/tensorrt
- ONNX Runtime: onnxruntime.ai
- PyTorch Quantization tutorial: pytorch.org/docs/stable/quantization.html

### Practice
- Benchmark every model you build (make it a habit)
- Try exporting to ONNX and compare speed
- Experiment with different YOLO model sizes

---

## Recommended Learning Order

```
Week 1-2:  LSTM basics → Next word predictor mini project
Week 3-4:  Autoencoders → MNIST anomaly detection mini project
Week 5-6:  Anomaly detection → Credit card fraud mini project
Week 7-8:  Reinforcement learning → CartPole mini project
Week 9-10: Real-time inference → YOLO benchmarking mini project
```

## Tools to Install

```bash
# Core ML
pip install torch torchvision
pip install ultralytics          # YOLO

# RL
pip install stable-baselines3
pip install gymnasium

# Optimization
pip install onnx onnxruntime     # ONNX export and runtime
# TensorRT: Follow NVIDIA's install guide for your GPU

# Anomaly detection
pip install scikit-learn         # Isolation Forest, One-Class SVM

# Data
pip install pandas numpy matplotlib seaborn
```

---

## Key Kaggle Competitions for Practice

1. **Credit Card Fraud Detection** — anomaly detection
2. **IEEE Fraud Detection** — advanced anomaly detection
3. **Stock Market Prediction** — LSTM/time series
4. **Disaster Tweets** — NLP sequences (same LSTM skills)
5. **Any object detection competition** — real-time inference practice
