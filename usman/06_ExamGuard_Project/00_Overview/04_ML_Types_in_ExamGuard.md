# ML Types in ExamGuard

## The Three Types of Machine Learning

ExamGuard uses ALL three types of machine learning, each for a different purpose. Think of them as three different kinds of employees:

```
SUPERVISED LEARNING    = The trained expert    (knows exactly what cheating looks like)
UNSUPERVISED LEARNING  = The watchful observer (notices anything unusual)
REINFORCEMENT LEARNING = The experienced guard  (learns when to raise the alarm)
```

---

## Type 1: Supervised Learning

### What it does in ExamGuard: Answers "WHAT is happening?"

Supervised learning is like training a new invigilator by showing them examples:

> "Here's a video of a student using a phone. THIS is cheating."
> "Here's a video of a student writing normally. THIS is NOT cheating."
> After 10,000 examples, the AI learns to tell the difference.

### How it works:

```
TRAINING:
  Input: Video clip of a student
  Label: "cheating" or "not cheating" (human-provided)

  Show 10,000+ labeled clips to the model
  Model learns: "When I see THESE patterns, it's cheating"

AFTER TRAINING:
  Input: NEW video clip (never seen before)
  Output: "This looks like cheating (87% confident)"
```

### Where ExamGuard uses it:

| Task | Input | Label | Model |
|---|---|---|---|
| Phone detection | Video frame | "phone" / "no phone" | YOLOv8 |
| Gaze direction | Face image | "looking left" / "looking at paper" / "looking right" | CNN |
| Behavior classification | 30-second clip | "cheating" / "normal" / "suspicious" | CNN + LSTM |
| Face detection | Video frame | Face bounding boxes | CNN |

### Why Supervised for these tasks?

Because we KNOW what cheating looks like. We can label examples. When you have clear categories and labeled data, supervised learning is the best choice.

### Training data needed:

```
Minimum viable:     1,000 labeled clips (basic proof of concept)
Good performance:   5,000 labeled clips (reasonable accuracy)
Production quality: 10,000+ labeled clips (reliable in real exams)

For each clip, a human must label:
- What behavior is shown
- Start and end time of the behavior
- Confidence level (obvious cheating vs borderline)
```

---

## Type 2: Unsupervised Learning

### What it does in ExamGuard: Answers "What PATTERNS are unusual?"

Unsupervised learning doesn't know what cheating looks like. Instead, it learns what NORMAL looks like, and then flags anything that's different.

> Think of it this way: You don't need to know what every disease looks like to know someone is sick. You just need to know what "healthy" looks like, and anything that deviates is worth checking.

### How it works:

```
TRAINING:
  Input: Thousands of clips of NORMAL exam behavior
  No labels needed! Just normal behavior.

  Model learns: "Normal looks like THIS"

AFTER TRAINING:
  Input: New video clip
  Model thinks: "Hmm, this doesn't look like normal... flagging it"

  The model doesn't know WHAT is wrong, just that SOMETHING is different.
```

### Where ExamGuard uses it:

| Task | Model | What It Catches |
|---|---|---|
| Anomaly detection | Autoencoder | Any behavior that's "weird" compared to normal |
| Behavior clustering | K-Means | Groups of students with similar suspicious behavior |

### Why Unsupervised for these tasks?

Because we CAN'T label everything! There are cheating methods we haven't even thought of yet. Unsupervised learning catches the unexpected.

**Real example:**
- Supervised model knows: phone, chit, looking at neighbor
- But what about: Morse code tapping? Specific pen arrangements as signals? Coded coughs?
- Unsupervised catches: "I don't know WHAT this is, but it's not normal exam behavior"

### How the Autoencoder works (simplified):

```
Normal frame → [Compress] → Small representation → [Decompress] → Reconstructed frame

If the reconstruction is GOOD → "I've seen this before" → Normal
If the reconstruction is BAD  → "I've never seen this"  → Anomaly!

The model learns to compress and reconstruct normal behavior.
When it sees something abnormal, it can't reconstruct it well = FLAGGED.
```

### Clustering example:

```
K-Means looks at all student behaviors and groups them:

Cluster 1: Students writing steadily          → Normal (95% of students)
Cluster 2: Students looking around occasionally → Normal (4% of students)
Cluster 3: Students with very unusual movement  → Investigate! (1% of students)
```

---

## Type 3: Reinforcement Learning

### What it does in ExamGuard: Answers "WHEN should I alert?"

Reinforcement Learning (RL) is like training a guard dog. It learns from rewards and punishments.

> Every time it makes a correct alert: REWARD (+100 points)
> Every time it sends a false alarm: PENALTY (-50 points)
> Every time it misses real cheating: BIG PENALTY (-200 points)
> Over time, it learns the perfect balance.

### Why this is critical:

```
Scenario A: Alert for EVERYTHING
  - Invigilator gets 500 alerts per exam
  - 490 are false alarms
  - Invigilator starts ignoring ALL alerts
  - System becomes USELESS

Scenario B: Alert for NOTHING
  - Invigilator gets 0 alerts
  - 10 real cheating incidents missed
  - System is USELESS

Scenario C: Smart alerts (RL)
  - Invigilator gets 15 alerts per exam
  - 12 are real cheating (80% precision)
  - Invigilator trusts and acts on alerts
  - System is VALUABLE
```

### The Reward System:

| Action | Result | Points | Why |
|---|---|---|---|
| Alert sent | Invigilator confirms real cheating | **+100** | Correct alert, system is useful |
| Alert sent | Invigilator dismisses (false alarm) | **-50** | Wasted invigilator's time |
| No alert | Nothing was happening | **+10** | Correctly stayed quiet |
| No alert | Cheating was happening (missed!) | **-200** | The worst outcome! |

**Why is missing cheating punished MORE than false alarms?**
- A false alarm wastes 10 seconds of the invigilator's time
- Missing real cheating defeats the entire purpose of the system
- So the AI learns: "When in doubt, it's better to alert than to miss"
- But not TOO much, or it alerts for everything

### How the RL agent learns:

```
Exam 1: Agent sends 200 alerts, 180 are false alarms
         Score: 20 x 100 + 180 x (-50) = -7,000 (terrible!)
         Agent learns: "I'm alerting too much"

Exam 2: Agent sends 50 alerts, 30 are false alarms
         Score: 20 x 100 + 30 x (-50) = 500 (better!)
         Agent learns: "Getting closer"

Exam 10: Agent sends 18 alerts, 3 are false alarms
          Score: 15 x 100 + 3 x (-50) = 1,350 (great!)
          Agent has learned the right balance
```

### Where ExamGuard uses it:

| Task | What It Decides | Model |
|---|---|---|
| Alert timing | Alert now or wait for more evidence? | Deep Q-Network (DQN) |
| Confidence threshold | How suspicious before alerting? | Policy Gradient |
| Camera priority | Which camera needs attention most? | Multi-Agent RL |

---

## How All Three Types Work Together

```
EXAM IN PROGRESS:

Frame captured from Camera 3
        |
        v
SUPERVISED (YOLO + CNN):
"I see a phone shape under the paper (73% confident)"
"Student's gaze is toward neighbor (68% confident)"
        |
        v
UNSUPERVISED (Autoencoder):
"This student's movement pattern is unusual (anomaly score: 0.82)"
"Doesn't match any normal behavior cluster"
        |
        v
REINFORCEMENT LEARNING (DQN):
"Phone detection: 73% - that's moderate"
"Gaze: 68% - could be just thinking"
"Anomaly: 0.82 - that's high"
"Combined evidence is strong enough"
DECISION: SEND ALERT
        |
        v
INVIGILATOR receives alert with video clip
```

---

## Summary: Which Type for What?

| Type | Question It Answers | Data Needed | ExamGuard Use |
|---|---|---|---|
| **Supervised** | What IS this? | Labeled examples | Detect known cheating (phone, gaze, behavior) |
| **Unsupervised** | Is this NORMAL? | Only normal examples | Find unknown/new cheating methods |
| **Reinforcement** | Should I ACT? | Reward/penalty feedback | Decide when to alert |

### The key insight:

- Supervised catches what we KNOW about
- Unsupervised catches what we DON'T know about
- Reinforcement makes the final SMART decision

Together, they create a system that is both knowledgeable and adaptive, exactly what ExamGuard needs.

---

## Models Used for Each Type (Summary)

| ML Type | Model | Why This Model |
|---|---|---|
| Supervised | **YOLOv8** | Fastest real-time object detector |
| Supervised | **CNN (ResNet/EfficientNet)** | Best for image classification |
| Supervised | **CNN + LSTM** | CNN sees frames, LSTM remembers sequences |
| Unsupervised | **Autoencoder** | Perfect for learning "normal" and flagging "abnormal" |
| Unsupervised | **K-Means** | Simple, fast clustering of behavior types |
| Reinforcement | **DQN / PPO** | Proven for decision-making with discrete choices |
