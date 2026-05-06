# MVP Versions — Learning Resources

## Similar Products to Study

Study these existing products to understand what the market expects:

### Commercial AI Proctoring Systems

**Proctorio**
- What it does: Browser-based exam proctoring, webcam monitoring, screen recording
- How it works: AI flags suspicious behavior, human reviews
- Study: Their website, YouTube demos, user reviews (learn from complaints too!)
- Website: proctorio.com

**ExamSoft (Examplify)**
- What it does: Secure exam browser + AI monitoring
- How it works: Locks down computer + monitors via webcam
- Study: How they handle false positives, their reporting features
- Website: examsoft.com

**Respondus LockDown Browser + Monitor**
- What it does: Locks browser + webcam recording + AI flagging
- How it works: Records video, AI scans for suspicious movements post-exam
- Study: Their AI flagging system, how invigilators review flags
- Website: respondus.com

**Mercer Mettl**
- What it does: Online exam proctoring with AI + human proctors
- How it works: Three levels — AI only, AI + human review, live human proctor
- Study: Their tiered approach is smart — different exams need different levels
- Website: mettl.com

**ProctorU / Meazure Learning**
- What it does: Live human proctoring augmented with AI
- How it works: Human proctor watches via webcam, AI assists with detection
- Study: How they combine human and AI monitoring
- Website: meazurelearning.com

### What to Learn From Them

```
1. User interface — How do they show alerts? What does the dashboard look like?
2. Privacy approach — How do they handle consent and data?
3. Accuracy claims — What accuracy do they claim? How do they measure?
4. Complaints — Search Reddit and forums for complaints (learn from their mistakes)
5. Pricing — How do they charge? Per student? Per exam? Per institution?
6. Edge cases — How do they handle disabilities, technical issues?
```

---

## Open Source Projects to Reference

### Object Detection
- **YOLOv8 (Ultralytics)**: github.com/ultralytics/ultralytics — The model you will use
- **YOLO-NAS**: github.com/Deci-AI/super-gradients — Alternative to YOLO
- **Detectron2**: github.com/facebookresearch/detectron2 — Facebook's detection framework

### Pose Estimation
- **MediaPipe**: google.github.io/mediapipe — Face mesh, pose, hands (Google)
- **OpenPose**: github.com/CMU-Perceptual-Computing-Lab/openpose — Body pose estimation
- **AlphaPose**: github.com/MVIG-SJTU/AlphaPose — Multi-person pose estimation

### Anomaly Detection
- **PyOD**: github.com/yzhao062/pyod — Python Outlier Detection library (30+ algorithms)
- **Alibi Detect**: github.com/SeldonIO/alibi-detect — Outlier and drift detection

### Dashboard / Web
- **Streamlit**: streamlit.io — Build data dashboards in Python (fastest way to prototype)
- **Grafana**: grafana.com — Professional monitoring dashboards (for system metrics)
- **Flask**: flask.palletsprojects.com — Lightweight web framework

### Deployment
- **Docker**: docker.com — Containerization
- **NVIDIA Triton**: github.com/triton-inference-server — Model serving at scale
- **BentoML**: github.com/bentoml/BentoML — ML model deployment

---

## YouTube Videos

### How AI Proctoring Works
- **"How Online Exam Proctoring Works"** by Vice — Shows the student experience
- **"AI Proctoring Software Explained"** by WIRED — Technical overview
- **"The Problem with Online Exam Proctoring"** by Tom Scott — Ethical concerns (important to understand!)

### Building Each Version
- **"Object Detection with YOLOv8 — Complete Tutorial"** — For v0.1
- **"Eye Tracking with Python and MediaPipe"** — For v0.2
- **"Building a Real-Time Dashboard with Flask"** — For v1.0
- **"Deploying ML Models with Docker"** — For v1.0/v2.0
- **"NVIDIA Jetson for Edge AI"** — For v2.0

### System Design
- **"How to Design a Real-Time System"** by Gaurav Sen — Architecture thinking
- **"System Design for ML"** by Chip Huyen — ML-specific system design
- **"Microservices Explained"** by TechWorld with Nana — Why separate components

---

## Version-Specific Resources

### v0.1 Phone Detector
```
Must learn: YOLOv8 fine-tuning, data labeling
YouTube: "Custom Object Detection YOLOv8" by Nicolai Nielsen
Tool: Roboflow (roboflow.com) for data labeling
Dataset: Search Kaggle for "phone detection" datasets
```

### v0.2 Gaze Tracker
```
Must learn: MediaPipe Face Mesh, eye landmark detection
YouTube: "Gaze Detection Python MediaPipe" by Murtaza's Workshop
Documentation: google.github.io/mediapipe/solutions/face_mesh
Paper: "MPIIGaze: Real-World Dataset for Gaze Estimation"
```

### v0.3 Behavior Monitor
```
Must learn: MediaPipe Pose, signal combination, confidence scoring
YouTube: "Pose Estimation MediaPipe Python" by Nicholas Renotte
YouTube: "Autoencoder for Anomaly Detection" by Krish Naik
Practice: Combine multiple MediaPipe solutions in one pipeline
```

### v1.0 Single Hall
```
Must learn: Flask/FastAPI, database, multi-camera, Docker
YouTube: "Full Stack ML Project" by Patrick Loeber
YouTube: "FastAPI + React Dashboard" by various
Practice: Build each component standalone, then integrate
```

### v2.0 Multi-Hall
```
Must learn: Edge computing, distributed systems, scaling
YouTube: "NVIDIA Jetson AI Projects" by JetsonHacks
YouTube: "System Design Interview" by Gaurav Sen
Practice: Deploy v1.0 first, then plan v2.0 architecture
```

---

## Project Milestones Checklist

Use this to track your progress:

```
[ ] Phase 1-4: Foundations (Python, Math, ML basics)
[ ] Phase 5: Object Detection & Classification
    [ ] v0.1: Phone Detector BUILT AND WORKING
    [ ] v0.2: Gaze Tracker BUILT AND WORKING
[ ] Phase 6: Advanced ML (LSTM, Autoencoder, RL)
    [ ] v0.3: Behavior Monitor BUILT AND WORKING
[ ] Phase 7: System Building (Camera, Dashboard, API, Docker)
    [ ] v1.0: Single Hall System BUILT AND WORKING
[ ] Phase 8: Testing (Edge cases, Ethics, Performance, Pilot)
    [ ] v1.0: Pilot tested in real exam
    [ ] v2.0: Multi-Hall System DESIGNED
    [ ] v2.0: Multi-Hall System BUILT AND TESTED
    [ ] v2.0: Deployed in production
```

---

## Final Advice

```
1. BUILD v0.1 as soon as possible
   Do not wait until you "know everything." Build, fail, learn, improve.

2. Show people your work at EVERY version
   Feedback from real users is worth more than 100 hours of solo coding.

3. Each version should be USABLE
   v0.1 is useful. v0.2 is useful. Do not wait for v2.0 to be "complete."

4. Study the competitors
   They have spent millions learning what works. Learn from their experience.

5. Ethics are not a phase — they are ongoing
   Think about privacy and fairness at EVERY version, not just Phase 8.

6. The journey from v0.1 to v2.0 takes 12-18 months
   This is normal. Professional products take years. Be patient.
```
