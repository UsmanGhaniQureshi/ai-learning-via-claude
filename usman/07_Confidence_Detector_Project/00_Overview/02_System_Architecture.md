# Confidence Detector — System Architecture

## What is System Architecture?

System architecture is the **blueprint** of how all the parts connect. Before writing code, you need to understand the big picture — what are the pieces, how do they talk to each other, and what data flows where.

---

## The Complete System Diagram

```
+================================================================+
|                        USER'S DEVICE                           |
|                (Browser / Mobile / Desktop)                    |
|                                                                |
|  +-----------+    +------------+    +-----------+              |
|  | WEBCAM    |    | MICROPHONE |    | TOPIC     |              |
|  | (Video)   |    | (Audio)    |    | INPUT     |              |
|  +-----+-----+    +-----+------+    +-----------+              |
|        |                |                                      |
|        v                v                                      |
|  +-----------+    +------------+                               |
|  | Video     |    | Audio      |                               |
|  | Stream    |    | Stream     |                               |
|  | (30 FPS)  |    | (continuous)|                               |
|  +-----+-----+    +--+------+--+                               |
|        |             |      |                                  |
|        v             v      v                                  |
|  +-----------+  +------+ +--------+                            |
|  | FACE      |  | STT  | | VOICE  |                            |
|  | ENGINE    |  |ENGINE| | ENGINE |                            |
|  |           |  |      | |        |                            |
|  | MediaPipe |  |Speech| | Audio  |                            |
|  | FaceMesh  |  |to    | | Freq.  |                            |
|  | 468 pts   |  |Text  | | Anlys  |                            |
|  +-----+-----+  +--+---+ +---+----+                            |
|        |           |         |                                 |
|        v           v         v                                 |
|  +-----------+  +------+  +--------+                           |
|  | Expression|  | NLP  |  | Voice  |                           |
|  | Score     |  |ENGINE|  | Score  |                           |
|  |           |  |      |  |        |                           |
|  | Nervous?  |  |Filler|  | Shaky? |                           |
|  | Eye cntct?|  |Hedge |  | Pace?  |                           |
|  | Blink rt? |  |Repeat|  | Mono?  |                           |
|  +-----+-----+  +--+---+  +---+----+                           |
|        |           |          |                                |
|        +-----+-----+----+----+                                 |
|              |           |                                     |
|              v           v                                     |
|  +--------------------+ +------------------+                   |
|  | CONFIDENCE SCORING | | AI ENGINE        |                   |
|  | ALGORITHM          | | (Claude API)     |                   |
|  |                    | |                  |                   |
|  | Face  × 0.25      | | Frame + Text     |                   |
|  | Eyes  × 0.30      | | → Deep analysis  |                   |
|  | Speech× 0.30      | | Every 30 seconds |                   |
|  | Voice × 0.15      | |                  |                   |
|  | = Score 0-100     | | (OPTIONAL - v2)  |                   |
|  +--------+-----------+ +--------+---------+                   |
|           |                      |                             |
|           v                      v                             |
|  +------------------------------------------------+           |
|  |              REAL-TIME DASHBOARD                |           |
|  |                                                 |           |
|  |  [Webcam Feed]  [Confidence Meter]  [Alerts]   |           |
|  |  [Transcript]   [Metrics Cards]     [Timer]    |           |
|  +------------------------------------------------+           |
|           |                                                    |
|           v  (user clicks STOP)                                |
|  +------------------------------------------------+           |
|  |              SESSION REPORT                     |           |
|  |                                                 |           |
|  |  Final Score + Breakdown + Timeline + Coaching  |           |
|  +------------------------------------------------+           |
+================================================================+
```

---

**Note:** The ASCII diagram above is illustrative. For the browser-first MVP, use the scoring split defined below: **Face 0.40, Speech 0.35, Voice 0.25**.

## The 5 Layers

Like ExamGuard's 5-layer architecture, our system has layers. Each layer has a clear job:

### Layer 1: Input Layer (Camera + Mic)
**Job:** Capture raw video frames and audio data

| Input | Format | Rate |
|:---|:---|:---|
| Camera | Video frames (images) | 30 frames per second |
| Microphone | Audio samples (sound) | 44,100 samples per second |

This layer is platform-dependent. Everything above it is platform-independent.

### Layer 2: Processing Layer (4 Engines)
**Job:** Extract meaningful signals from raw data

| Engine | Input | Output | Speed |
|:---|:---|:---|:---|
| Face Engine | Video frames | Expression, eye contact, blink rate | Real-time (every frame) |
| STT Engine | Audio | Text transcript | Real-time (interim + final) |
| NLP Engine | Transcript text | Fillers, hedging, pace, repetitions | Every final sentence |
| Voice Engine | Audio | Volume, pitch, steadiness | Continuous |

Each engine runs independently. If one fails, the others keep working. If the mic breaks, you still get face analysis.

### Layer 3: Scoring Layer
**Job:** Combine all engine outputs into one confidence score

```
Face Score    = expression + eye contact + blink/stress signals
Speech Score  = transcript-based signals from STT + NLP
Voice Score   = pitch + volume + steadiness signals

Confidence Score = (Face × 0.40) + (Speech × 0.35) + (Voice × 0.25)
                 = 0-100
```

These are MVP starter weights, not scientific constants. Tune them after testing with real sessions. The important design choice is that STT feeds the speech score; it is not a separate user-facing score.

#### WHY These Weights?

Why 0.40 / 0.35 / 0.25 and not equal thirds?

| Score | Weight | Reasoning |
|:---|:---|:---|
| **Face** | **0.40** | Mehrabian's communication research suggests ~55% of perceived confidence comes from visual cues (facial expression, eye contact, body language). Since we only see the face (no body), 0.40 is a conservative discount from 0.55. Face is also the most reliable signal — MediaPipe runs at 30 FPS with high accuracy. |
| **Speech** | **0.35** | What you SAY is what the audience remembers after the presentation. Filler words, hedging, and pacing are the most actionable feedback — a speaker can immediately reduce "um" count. Speech gets strong weight because it's the most improvable signal. |
| **Voice** | **0.25** | Voice tone matters, but it's the hardest to measure accurately in a browser. Web Audio API gives us volume and basic pitch, but distinguishing "nervous shaky" from "passionate emphasis" is unreliable. Lower weight = lower damage from measurement noise. |

**These are starting points.** After testing with 10-20 real practice sessions, adjust based on what feels right. If voice analysis turns out to be more accurate than expected, bump it up.

#### Scoring Walkthrough with Real Numbers

Quick example to show the math in action:

```
Face Score   = 72/100  (good eye contact, slight tension detected)
Speech Score = 58/100  (8 fillers in 3 minutes, some hedging)
Voice Score  = 81/100  (steady volume, natural pitch variation)

Confidence = (72 × 0.40) + (58 × 0.35) + (81 × 0.25)
           = 28.8 + 20.3 + 20.25
           = 69.35 → rounds to 69/100

Verdict: "Good start — your voice is strong but filler words are dragging you down"
```

For the detailed breakdown of how each sub-score is calculated, see **04_Scoring_Explained.md**.

#### Why Exponential Moving Average?

The confidence score updates every 1-2 seconds, but we don't just show the latest calculation. We use an **Exponential Moving Average (EMA)** to smooth it.

Think of it like a weather forecast: if Monday is 20C and Tuesday is 35C, you don't say "the weather doubled!" — you say "it's warming up." EMA does the same thing. It gives more weight to recent values but doesn't ignore the trend.

```
smoothed_score = (alpha × new_score) + ((1 - alpha) × previous_smoothed_score)

alpha = 0.3 means: 30% new value, 70% previous trend
```

Without smoothing, the meter would jump from 80 to 45 to 72 to 60 every second — that's distracting and useless. With EMA, it moves gradually: 80 → 69 → 70 → 67 — you can see the real trend.

For the full math and alpha tuning, see **04_Scoring_Explained.md**.

### Layer 4: Feedback Layer
**Job:** Show results to the user in real-time

| Component | What It Shows | Update Rate |
|:---|:---|:---|
| Confidence Meter | Animated score 0-100 | Every 1-2 seconds |
| Coaching Alerts | "Slow down", "Make eye contact" | Max 1 per 15 seconds |
| Live Transcript | Words appearing with highlighted fillers | Real-time (interim) |
| Metrics Cards | Individual scores per engine | Every 2 seconds |

### Layer 5: Report Layer
**Job:** Generate a comprehensive post-session summary

| Report Section | Content |
|:---|:---|
| Final Score | Overall + per-engine breakdown |
| Timeline | Confidence score over time (chart) |
| Filler Analysis | Count, rate, which fillers, when |
| Eye Contact | % of time looking at camera |
| Pace Graph | WPM over time — steady or erratic |
| Top 3 Improvements | Rule-based coaching suggestions |
| AI Coaching (v2) | Claude API detailed written feedback |

---

## Data Flow: One Second of Presenting

What happens in ONE SECOND while you're presenting:

```
Second 14 of your presentation:

Camera sends 30 frames:
  → Face Engine processes each frame
  → Frame 420: Expression=neutral, EyeContact=YES, Blinks=0
  → Frame 421: Expression=neutral, EyeContact=YES, Blinks=0
  → Frame 422: Expression=tense, EyeContact=NO, Blinks=1
  → ... (30 frames total)
  → Average this second: Expression=mostly_neutral, EyeContact=87%, BlinkRate=normal

Microphone sends audio:
  → STT gives interim: "and our revenue grew by"
  → Voice Engine: Volume=normal, Pitch=steady, NoShake
  → No final result yet (still mid-sentence)

Scoring Algorithm:
  → Face: 75/100 (mostly neutral, good eye contact)
  → Speech: waiting for sentence to finish
  → Voice: 80/100 (steady voice, normal volume)
  → Combined: ~77/100 (confident)

Dashboard updates:
  → Confidence meter shows 77
  → Color: light green
  → No coaching alert (score is good)
  → Transcript shows "and our revenue grew by" (interim, still typing)
```

---

## What Happens When Things Fail?

Real users will deny camera access, have bad microphones, or present in dark rooms. The system must handle every failure gracefully — never crash, never show a blank screen.

| Failure | What Happens | User Sees | Scoring Impact |
|:---|:---|:---|:---|
| **Camera denied** | Face engine cannot start | Clear message: "Camera access needed for face analysis. Grant permission or continue with voice-only mode." | Voice + Speech only (re-weight to Speech 0.58, Voice 0.42) |
| **Microphone denied** | STT and Voice engines cannot start | Clear message: "Microphone access needed for speech analysis. Grant permission or continue with face-only mode." | Face only (score = Face Score directly) |
| **Both denied** | No engines can start | "This app needs camera or microphone access to work. Please grant at least one." | Cannot score — session blocked |
| **Face not detected** | Camera works but MediaPipe can't find a face (bad lighting, too far away, face covered) | Warning: "Face not detected — check lighting and camera angle" | Fall back to Voice + Speech only scoring |
| **STT timeout** | Speech-to-Text stops returning results for >10 seconds | Auto-restart STT engine silently. If it fails 3 times, show: "Speech recognition having trouble — check microphone" | Speech score freezes at last known value until STT recovers |
| **No audio detected** | Microphone works but user isn't speaking (long silence) | After 15 seconds: "Are you still presenting? No audio detected." | Voice score penalizes for silence ratio. Face score still updates. |
| **Browser tab hidden** | User switches to another tab during session | Pause session. Show: "Session paused — camera stops when tab is hidden" | Score pauses. Resume when tab is visible again. |
| **Low FPS / slow device** | MediaPipe can't keep up at 30 FPS | Reduce to 15 FPS, then 10 FPS. Below 10: warn user | Accuracy slightly reduced but system keeps running |

**Design principle:** Degrade gracefully, never crash. Something is always better than nothing. A voice-only confidence score is still useful.

---

## Comparison with ExamGuard Architecture

| Aspect | ExamGuard | Confidence Detector |
|:---|:---|:---|
| **Input** | Video only | Video + Audio |
| **Processing** | Server-side (Python) | Client-side (in the app) |
| **# of engines** | 1 combined detector | 4 independent engines |
| **Output** | "Cheating? Yes/No + score" | "Confidence score 0-100 + coaching" |
| **Users** | Invigilators watching students | Individuals coaching themselves |
| **Real-time feedback** | Alert dashboard | Live confidence meter + coaching nudges |
| **Post-session** | Evidence screenshots + timeline | Detailed report + improvement suggestions |
| **Camera count** | Multiple cameras, multiple students | One camera, one user |
| **Complexity** | YOLO + crop + MediaPipe pipeline | MediaPipe + STT + Audio + NLP |

---

## Quick Summary

| Question | Answer |
|:---|:---|
| How many layers? | 5: Input → Processing → Scoring → Feedback → Report |
| How many engines? | 4 processing engines: Face, Speech-to-Text, NLP, Voice |
| How many scored outputs? | 3: Face, Speech, Voice |
| What's platform-dependent? | Only Layer 1 (camera/mic access). Everything else is the same |
| What's the hero output? | Confidence Score 0-100, updated every 1-2 seconds |
| How do engines connect? | They run independently, scoring layer combines their outputs |
| What if one engine fails? | Others keep working — degraded but functional |
