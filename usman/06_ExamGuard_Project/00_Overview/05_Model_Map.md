# ExamGuard Model Map

## The 5 Questions to Choose Any ML Model

Before picking a model, ask these 5 questions:

```
1. WHAT is the sub-problem?        → Break the big problem into small pieces
2. WHAT kind of data do I have?    → Images? Numbers? Sequences? Labels?
3. WHAT type of ML fits?           → Supervised? Unsupervised? Reinforcement?
4. WHAT models can do this?        → List candidate models
5. WHY this specific model?        → Speed? Accuracy? Simplicity?
```

Let's apply these 5 questions to every part of ExamGuard.

---

## ExamGuard Sub-Problems

The big problem "detect cheating in exams" breaks down into 7 sub-problems:

```
1. Detect prohibited objects (phones, chits, earpieces)
2. Track where students are looking (gaze direction)
3. Classify behavior over time (cheating vs normal)
4. Find unusual/unexpected behavior (anomaly detection)
5. Group similar behaviors (pattern discovery)
6. Decide when to send alerts (smart alerting)
7. Track students across cameras (identity matching)
```

Each sub-problem needs its own model (or combination of models).

---

## The Full Model Map

| # | Sub-Problem | Data Type | ML Type | Model | Why This Model |
|---|---|---|---|---|---|
| 1 | **Phone/Object Detection** | Images (frames) | Supervised | **YOLOv8** | Fastest real-time detector. Can find and locate multiple objects in one frame in under 10ms. Other detectors (Faster R-CNN, SSD) are slower. |
| 2 | **Gaze Direction** | Face images | Supervised | **CNN (EfficientNet)** | Best accuracy-to-speed ratio for image classification. Takes a face crop and predicts gaze direction (left/right/down/center). |
| 3 | **Behavior Classification** | Video clips (sequences of frames) | Supervised | **CNN + LSTM** | CNN extracts features from each frame, LSTM remembers the sequence over time. Together they understand "what happened over 30 seconds." |
| 4 | **Anomaly Detection** | Normal behavior data | Unsupervised | **Autoencoder** | Learns to compress and reconstruct normal behavior. Anything it can't reconstruct well = anomaly. No labels needed. |
| 5 | **Behavior Grouping** | Feature vectors | Unsupervised | **K-Means Clustering** | Simple and fast. Groups students by behavior similarity. Finds clusters of suspicious coordinated behavior. |
| 6 | **Alert Decision** | State + reward signals | Reinforcement | **DQN / PPO** | Learns the optimal policy for when to alert. DQN for simple decisions, PPO for more complex multi-factor decisions. |
| 7 | **Person Re-ID** | Person images | Supervised | **Re-ID CNN (OSNet)** | Creates unique appearance signatures. Matches same person across different cameras using appearance features. |

---

## Detailed Breakdown: Why Each Model?

### 1. Phone/Object Detection: YOLOv8

**The 5 questions:**
1. Sub-problem: Find phones, chits, books, earpieces in video frames
2. Data: Images (video frames), with labeled bounding boxes
3. ML type: Supervised (we have labeled examples of objects)
4. Candidates: YOLOv8, Faster R-CNN, SSD, EfficientDet
5. Why YOLO: **Speed.** ExamGuard is real-time. YOLO processes a frame in 5-10ms. Faster R-CNN takes 50-100ms. That 10x difference matters when processing hundreds of cameras.

```
Input:  A video frame [640 x 640 pixels]
Output: Bounding boxes with labels
        → "phone" at position (x:312, y:445) with 89% confidence
        → "paper chit" at position (x:156, y:223) with 72% confidence
```

---

### 2. Gaze Direction: CNN (EfficientNet)

**The 5 questions:**
1. Sub-problem: Determine where a student is looking
2. Data: Cropped face images, labeled with gaze direction
3. ML type: Supervised (labeled gaze directions)
4. Candidates: ResNet, VGG, EfficientNet, MobileNet
5. Why EfficientNet: Best accuracy per computation. Smaller than ResNet but equally accurate. Important when running alongside other models.

```
Input:  Cropped face image [224 x 224 pixels]
Output: Gaze class
        → "looking_left" (67%)
        → "looking_at_paper" (20%)
        → "looking_at_neighbor" (13%)
```

---

### 3. Behavior Classification: CNN + LSTM

**The 5 questions:**
1. Sub-problem: Classify a 30-second clip as cheating, suspicious, or normal
2. Data: Video clips (sequences of frames) with behavior labels
3. ML type: Supervised (labeled video clips)
4. Candidates: 3D CNN, CNN+LSTM, Transformer, Two-Stream Network
5. Why CNN+LSTM: CNN handles the visual part (what each frame shows), LSTM handles the temporal part (how frames relate over time). This combination is well-proven for action recognition and easier to train than 3D CNNs or Transformers with limited data.

```
Input:  30-second video clip [90 frames at 3fps]
        Frame 1 → CNN → features_1
        Frame 2 → CNN → features_2
        ...
        Frame 90 → CNN → features_90

        [features_1, features_2, ..., features_90] → LSTM

Output: Behavior class
        → "suspicious_looking" (74%)
        → "normal_writing" (18%)
        → "passing_notes" (8%)
```

---

### 4. Anomaly Detection: Autoencoder

**The 5 questions:**
1. Sub-problem: Find any behavior that's unusual/unexpected
2. Data: Lots of normal behavior clips (NO labels needed)
3. ML type: Unsupervised (learn normal, flag abnormal)
4. Candidates: Autoencoder, Isolation Forest, One-Class SVM, GAN
5. Why Autoencoder: Intuitive and effective for video. Learns to compress and reconstruct normal behavior. When it sees abnormal behavior, reconstruction error is high = anomaly detected. Works well with visual data unlike Isolation Forest.

```
TRAINING (only on normal behavior):
Normal clip → [Encoder] → compressed → [Decoder] → reconstructed clip
Loss = difference between original and reconstructed
Model learns to perfectly reconstruct normal behavior

DETECTION:
Normal clip → reconstruct → low error (0.05) → NORMAL
Weird clip  → reconstruct → high error (0.73) → ANOMALY!
```

---

### 5. Behavior Grouping: K-Means

**The 5 questions:**
1. Sub-problem: Group students by behavior patterns
2. Data: Feature vectors extracted from behavior analysis
3. ML type: Unsupervised (find natural groups)
4. Candidates: K-Means, DBSCAN, Hierarchical Clustering
5. Why K-Means: Simplest and fastest. When you need quick grouping of behavior patterns during a live exam, speed matters more than finding perfect cluster shapes.

```
Input: Behavior features for 100 students
       Student 1: [0.1, 0.9, 0.2, 0.8, ...]  (lots of head movement)
       Student 2: [0.8, 0.1, 0.9, 0.1, ...]  (steady writing)
       ...

Output: Clusters
       Cluster A (85 students): Steady writers → NORMAL
       Cluster B (10 students): Occasional lookers → MONITOR
       Cluster C (5 students):  Unusual movement → INVESTIGATE
```

---

### 6. Alert Decision: DQN / PPO

**The 5 questions:**
1. Sub-problem: Decide when to alert and when to wait
2. Data: State (suspicion scores) + Reward (invigilator feedback)
3. ML type: Reinforcement Learning (learn from outcomes)
4. Candidates: DQN, PPO, A3C, SAC
5. Why DQN/PPO: DQN is simpler and works well for discrete decisions (alert / don't alert). PPO is more stable for complex decisions (alert level: low / medium / high / critical).

```
State:  [phone_score: 0.73, gaze_score: 0.68, anomaly_score: 0.82,
         time_since_last_alert: 120sec, hall_alert_count: 5]

Action: ALERT (with confidence: high)

Reward: Invigilator confirms → +100
   OR   Invigilator dismisses → -50
```

---

### 7. Person Re-ID: OSNet

**The 5 questions:**
1. Sub-problem: Match same person across different cameras
2. Data: Person images from different camera angles with identity labels
3. ML type: Supervised (labeled person identities)
4. Candidates: OSNet, ResNet-based Re-ID, BoT, TransReID
5. Why OSNet: Designed specifically for Re-ID. Lightweight enough for real-time use. Good accuracy even with low resolution images from surveillance cameras.

```
Camera 1: [Person crop] → OSNet → vector [0.23, 0.87, 0.12, ...]
Camera 3: [Person crop] → OSNet → vector [0.25, 0.85, 0.14, ...]

Distance between vectors: 0.04 → Very close → SAME PERSON

Camera 2: [Different person] → OSNet → vector [0.91, 0.13, 0.78, ...]
Distance from first person: 0.82 → Far apart → DIFFERENT PERSON
```

---

## Expert Tricks for Model Selection

### 1. Transfer Learning: Don't Train From Scratch

```
BAD:  Train YOLO from zero on your exam data
      Needs: 100,000+ labeled images
      Time: Weeks of training

GOOD: Start with YOLO pre-trained on COCO dataset (80 object types)
      Fine-tune on your exam data
      Needs: 1,000-5,000 labeled images
      Time: Hours of training
```

Transfer learning means: take a model that already knows how to see (trained on millions of images) and teach it to see YOUR specific things (phones in exam halls). It's like hiring an experienced security guard instead of training a baby.

### 2. Start MVP (Minimum Viable Product)

```
Phase 1: Just phone detection with YOLO        → Does it work at all?
Phase 2: Add gaze tracking with CNN             → Can it see where people look?
Phase 3: Add behavior analysis with LSTM        → Can it understand sequences?
Phase 4: Add anomaly detection with Autoencoder → Can it catch unexpected things?
Phase 5: Add RL for smart alerting              → Can it make good decisions?

DON'T try to build everything at once!
```

### 3. Test Multiple Models

```
For object detection, try:
  YOLOv8-nano  → fastest, less accurate
  YOLOv8-small → good balance
  YOLOv8-medium → more accurate, slower

Measure on YOUR exam hall data and pick the best trade-off.
```

### 4. Data Size Rules of Thumb

| Model | Minimum Data | Good Performance | Production |
|---|---|---|---|
| YOLO (fine-tune) | 500 images | 2,000 images | 5,000+ images |
| CNN (fine-tune) | 500 images | 2,000 images | 5,000+ images |
| CNN + LSTM | 1,000 clips | 5,000 clips | 10,000+ clips |
| Autoencoder | 2,000 normal clips | 5,000 normal clips | 10,000+ normal clips |
| RL Agent | 100 exam sessions | 500 sessions | 1,000+ sessions |

### 5. Real-Time Constraint

```
ExamGuard must process each frame in under 100ms (10 FPS minimum)

Model speed budget per frame:
  YOLO detection:     ~10ms
  Face/Gaze CNN:      ~15ms
  Behavior LSTM:      ~20ms
  Autoencoder:        ~10ms
  RL decision:         ~5ms
  Other processing:   ~10ms
  ─────────────────────────
  Total:              ~70ms  ✓ (under 100ms budget)
```

If a model is too slow, you must either use a smaller version or optimize it.

---

## Quick Reference Card

```
╔══════════════════════════════════════════════════════════════╗
║              EXAMGUARD MODEL MAP - QUICK REF                ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  See an OBJECT?      → YOLO        (Supervised)             ║
║  See a FACE/GAZE?    → CNN         (Supervised)             ║
║  See a BEHAVIOR?     → CNN + LSTM  (Supervised)             ║
║  See something WEIRD?→ Autoencoder (Unsupervised)           ║
║  See a PATTERN?      → K-Means    (Unsupervised)            ║
║  ALERT or NOT?       → DQN / PPO  (Reinforcement)           ║
║  SAME person?        → Re-ID CNN  (Supervised)              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```
