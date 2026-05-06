# Phase 8: Testing — Learning Resources

## Testing AI Systems

### YouTube Videos
- **"Testing Machine Learning Models"** by Google Cloud Tech — how Google tests AI
- **"ML Model Evaluation Metrics"** by StatQuest — precision, recall, F1 explained simply
- **"Software Testing Tutorial for Beginners"** by Guru99 — testing fundamentals
- **"pytest Tutorial"** by Corey Schafer — Python testing framework

### Articles
- **"How to Test Machine Learning Code and Systems"** by Jeremy Jordan — comprehensive guide
- **"Testing ML Systems: Code, Data, and Models"** by Google — best practices
- **"Confusion Matrix Explained"** by Towards Data Science — visual guide to TP, FP, FN, TN

### Practice
- Write unit tests for your YOLO model (does it detect known objects?)
- Run your system for 2+ hours and monitor for issues
- Create a labeled test dataset with known normal and cheating clips

---

## Edge Cases and Robustness

### YouTube Videos
- **"AI Failures and Edge Cases"** by Two Minute Papers — real-world AI failure examples
- **"Adversarial Examples Explained"** by Computerphile — how AI can be tricked
- **"Robustness in Machine Learning"** by Stanford CS229 — academic perspective

### Articles
- **"When AI Goes Wrong"** by MIT Technology Review — real-world failures
- **"Testing Edge Cases in ML"** by Neptune.ai — systematic approach

### Practice
- List 20 edge cases specific to your system
- Test each one and document results
- Create a "what if" document for each scenario

---

## AI Ethics and Privacy

### YouTube Videos
- **"AI Ethics in 5 Minutes"** by IBM Technology — quick overview
- **"Ethics of AI Surveillance"** by Vox — directly relevant to ExamGuard
- **"GDPR Explained Simply"** by Simplilearn — data protection basics
- **"Algorithmic Bias"** by Joy Buolamwini (MIT) — essential viewing on AI fairness
- **"India's DPDP Act Explained"** by LegalSamiksha — if deploying in India

### Courses
- **"AI Ethics"** on Coursera by University of Helsinki — free, comprehensive
- **"Responsible AI"** by Google (free course) — practical ethics for AI developers
- **"Ethics of AI and Big Data"** edX — academic perspective

### Books (Optional)
- **"Weapons of Math Destruction"** by Cathy O'Neil — how algorithms can harm
- **"Race After Technology"** by Ruha Benjamin — AI bias and society

### Legal Resources
- India DPDP Act 2023: meity.gov.in (Ministry of Electronics and IT)
- GDPR basics: gdpr.eu
- AI surveillance legal guide: accessnow.org

---

## Performance Optimization

### YouTube Videos
- **"PyTorch Performance Tuning"** by PyTorch official — from the source
- **"Model Optimization for Production"** by TensorFlow — techniques overview
- **"TensorRT Optimization"** by NVIDIA Developer — GPU-specific optimization
- **"Profiling Python Code"** by Corey Schafer — finding slow code

### Tools
- **torch.profiler** — PyTorch built-in profiler
- **nvidia-smi** — Monitor GPU usage in real-time
- **ONNX Runtime** — Cross-platform model optimization
- **TensorRT** — NVIDIA GPU optimization

### Practice
- Profile your full pipeline (find the bottleneck)
- Try quantization on your models
- Compare FP32 vs FP16 vs INT8 performance
- Benchmark with increasing number of cameras

---

## Pilot Testing and Deployment

### YouTube Videos
- **"A/B Testing Explained"** by StatQuest — testing new systems safely
- **"Deploying ML Models in Production"** by MLOps Community — real deployment challenges
- **"ML in Production: Lessons Learned"** by Google — what goes wrong and how to fix it

### Articles
- **"Rules of Machine Learning"** by Google — 43 rules for ML in production
- **"Monitoring ML Models in Production"** by Neptune.ai — keeping track after deployment
- **"Shadow Mode Deployment"** by Uber ML Blog — how Uber tests new models safely

### Practice
- Run a shadow mode test (system runs but does not alert)
- Compare your results with a human reviewer
- Create a pilot testing report template

---

## Recommended Learning Order

```
Week 1-2:  Testing strategies → Write unit tests for your models
Week 3-4:  Edge cases → Document and test 20 edge cases
Week 5-6:  Privacy & ethics → Create consent form and privacy policy
Week 7-8:  Performance optimization → Profile and optimize your pipeline
Week 9-12: Pilot testing → Run shadow mode in a real or simulated exam
```

## Essential Metrics to Know

```
Testing:
  - Precision, Recall, F1 Score
  - Confusion Matrix
  - ROC Curve (Receiver Operating Characteristic)
  - False Positive Rate, False Negative Rate

Performance:
  - Frames Per Second (FPS)
  - Latency (ms per frame)
  - GPU Utilization (%)
  - Memory Usage over time

Deployment:
  - System Uptime (%)
  - Mean Time Between Failures (MTBF)
  - Mean Time to Recovery (MTTR)
  - Alert response time
```

## Tools to Install

```bash
# Testing
pip install pytest           # Unit testing
pip install scikit-learn     # Metrics (precision_score, recall_score, etc.)

# Profiling
pip install py-spy           # Python profiler
pip install memory-profiler  # Memory usage tracking
pip install psutil           # System monitoring

# Monitoring
pip install prometheus-client  # Metrics collection (optional)
pip install grafana-api        # Dashboards for monitoring (optional)
```
