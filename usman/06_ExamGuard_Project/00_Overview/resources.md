# ExamGuard Overview - Resources

## Search Terms for Research

When researching ExamGuard-related topics, use these search terms to find relevant information:

### System Design Research
- **"exam proctoring AI system"** - Find how existing companies solve this problem
- **"AI surveillance system architecture"** - Understand how large-scale AI monitoring systems are designed
- **"real-time video analytics architecture"** - Learn about processing live video feeds with AI
- **"multi-camera monitoring system design"** - Study how to handle many cameras simultaneously
- **"AI cheating detection in exams"** - Find academic papers and articles on this specific topic

### Technical Research
- **"YOLO object detection real-time"** - The core detection model we'll use
- **"gaze estimation deep learning"** - How AI tracks where people look
- **"video anomaly detection autoencoder"** - Finding unusual behavior in video
- **"reinforcement learning alert system"** - Smart decision-making for alerts
- **"person re-identification deep learning"** - Tracking people across cameras

---

## Similar Products to Study

Understanding existing products helps you design ExamGuard better. Study what they do well and what they miss.

### 1. Proctorio
- **What it does:** Online exam proctoring (monitors students taking exams on their computers)
- **How it works:** Uses the student's webcam and microphone to monitor during online exams
- **What it detects:** Eye movement, head movement, background noise, browser tab switching, other people in the room
- **Limitation:** Only works for online exams (not physical exam halls like ExamGuard)
- **What to learn from it:** Their gaze tracking and behavior analysis approaches
- **Website:** proctorio.com

### 2. ExamSoft (now part of Turnitin)
- **What it does:** Secure exam platform with AI monitoring
- **How it works:** Locks down the computer during exams and records video for review
- **What it detects:** Facial recognition (is it the right student?), eye tracking, audio analysis
- **Limitation:** Post-exam review (flags clips for human review AFTER the exam, not real-time)
- **What to learn from it:** Their flagging system and how they handle false positives
- **Website:** examsoft.com

### 3. Respondus LockDown Browser + Monitor
- **What it does:** Locks the browser during online exams and records webcam
- **How it works:** Prevents students from opening other programs; webcam recording analyzed by AI
- **What it detects:** Missing student, multiple people, looking away, speaking
- **Limitation:** Online only, not real-time (analysis happens after exam)
- **What to learn from it:** Simple but effective detection rules; their approach to flagging severity levels
- **Website:** respondus.com

### 4. Honorlock
- **What it does:** AI-powered online proctoring with live proctors available
- **How it works:** AI monitors the exam in real-time; if something suspicious happens, a live proctor can intervene
- **What it detects:** Phone detection (searches for exam questions), secondary device detection, voice detection
- **Limitation:** Online exams only
- **What to learn from it:** Their hybrid AI + human approach is very similar to ExamGuard's philosophy
- **Website:** honorlock.com

### Comparison with ExamGuard:

| Feature | Proctorio | ExamSoft | Respondus | Honorlock | **ExamGuard** |
|---|---|---|---|---|---|
| Environment | Online | Online | Online | Online | **Physical hall** |
| Real-time? | Yes | No | No | Yes | **Yes** |
| Multi-camera? | No (1 webcam) | No | No | No | **Yes (5+ cameras)** |
| Object detection? | Limited | No | No | Phone only | **Yes (multiple objects)** |
| Behavior analysis? | Basic | Basic | Basic | Moderate | **Advanced (LSTM)** |
| Anomaly detection? | No | No | No | No | **Yes (Autoencoder)** |
| Human in the loop? | Optional | Post-exam | Post-exam | Yes | **Yes (always)** |

**Key insight:** All existing products focus on ONLINE exams. ExamGuard fills a gap by addressing PHYSICAL exam halls with multi-camera coverage. This is our unique value.

---

## YouTube Channels and Videos

### System Design
- Search: **"AI surveillance system design tutorial"**
- Search: **"real-time object detection system architecture"**
- Search: **"building a video analytics pipeline"**

### Similar Project Walkthroughs
- Search: **"exam cheating detection using deep learning"**
- Search: **"YOLO object detection project tutorial"**
- Search: **"behavior recognition using CNN LSTM"**
- Search: **"anomaly detection in surveillance video"**

### Understanding the Problem Space
- Search: **"how AI proctoring works"**
- Search: **"problems with AI exam monitoring"** (learn from criticisms to build better)
- Search: **"ethics of AI surveillance in education"**

---

## Academic Papers (for later)

When you're more advanced, these papers will be valuable:

1. **"A Survey on Deep Learning Based Video Anomaly Detection"** - Comprehensive overview of anomaly detection methods
2. **"YOLO: Real-Time Object Detection"** - The original YOLO paper series
3. **"Deep Learning for Gaze Estimation"** - Methods for tracking eye direction
4. **"Person Re-identification: Past, Present and Future"** - Multi-camera tracking methods

Search for these on **Google Scholar** (scholar.google.com) or **Papers With Code** (paperswithcode.com).

---

## Recommended Study Order

```
Week 1: Read about Proctorio and Honorlock
        → Understand what's already been done

Week 2: Watch YouTube videos on YOLO and object detection
        → See how the core technology works

Week 3: Read about system architecture for video analytics
        → Understand how to connect everything

Week 4: Study ethics of AI surveillance
        → Understand the responsibility of building such a system
```

---

## Key Questions to Ask While Researching

As you study these resources, keep asking:

1. **What works well** in existing systems? (Copy the good ideas)
2. **What fails** in existing systems? (Avoid their mistakes)
3. **What's missing** from existing systems? (That's where ExamGuard adds value)
4. **What are the ethical concerns?** (Build responsibly)
5. **What would make an invigilator's life easier?** (Design for the user)
