# Phase 3: Face & Expression Detection

## What Is This Phase?

This phase detects **what the speaker's face is doing** — are they making eye contact? Are they smiling genuinely or nervously? Are they blinking excessively (a stress signal)? Do they look tense or relaxed?

Here is the good news: **you already built half of this in ExamGuard.** ExamGuard used MediaPipe FaceMesh for gaze detection and talking detection. The Confidence Detector reuses those exact skills and adds new ones on top — expression classification, smile analysis, and baseline calibration.

This file marks every skill as **REUSED** (you already know it from ExamGuard) or **NEW** (you need to learn it fresh).

---

## WHY This Phase Matters for the Confidence Detector

```
Camera video stream (from Phase 1)
        |
        v
[MediaPipe FaceMesh]                          ← 468 facial landmarks
        |
        +--→ [Eye aspect ratio]               ← REUSED: blink detection
        |
        +--→ [Iris + head direction]          ← REUSED: eye contact detection
        |
        +--→ [Mouth landmarks]                ← REUSED: talking detection
        |
        +--→ [Eyebrow distances]              ← NEW: expression classification
        |
        +--→ [Mouth corner angles]            ← NEW: smile analysis
        |
        +--→ [Forehead + jaw tension]         ← NEW: stress detection
        |
        v
[Baseline comparison]                         ← NEW: compare to user's neutral face
        |
        v
[Facial confidence score]                     ← Combined metric
```

A confident speaker maintains eye contact, has relaxed facial muscles, smiles naturally, and blinks at a normal rate. A nervous speaker avoids eye contact, has tense facial muscles, forces smiles, and blinks rapidly. **This phase gives you the data to measure all of that.**

---

## Skills to Learn

### 1. MediaPipe FaceMesh Setup (Platform-Specific) — Loading the Model

| | |
|---|---|
| **What is it?** | MediaPipe FaceMesh is a pre-trained model that detects 468 landmark points on a human face in real-time. You used it in ExamGuard via Python. For the Confidence Detector, you load it in the **browser** using `@mediapipe/face_mesh` or the newer MediaPipe Tasks Vision API. |
| **WHY it matters** | FaceMesh is the foundation for ALL facial analysis. Every other skill in this phase reads landmark positions that FaceMesh provides. No FaceMesh = no expression detection, no eye contact, nothing. |
| **Difficulty** | Easy — you already understand the concept. The only new part is loading it in JavaScript instead of Python. |
| **Status** | **REUSED concept, NEW platform.** Same model, different language. |

**What to learn:**

You import the MediaPipe Tasks Vision library and create a `FaceLandmarker` by loading the pre-trained model from a CDN with GPU acceleration enabled. The setup specifies VIDEO running mode, single face detection, and enables both blendshapes (expression coefficients like smile, frown, brow raise) and facial transformation matrices (head pose). On each video frame, you call `detectForVideo()` which returns 468 landmark points and blendshape data that you can use for all subsequent facial analysis.

**Confidence Detector connection:** In ExamGuard, you loaded FaceMesh in Python with `mp.solutions.face_mesh`. Here you load it in JavaScript. Same 468 landmarks, same coordinate system, same landmark indices. The big addition is `outputFaceBlendshapes: true` — this gives you pre-computed expression coefficients (smile, frown, brow raise) that ExamGuard never used.

---

### 2. Landmark Distance Calculations — Measuring Specific Facial Features

| | |
|---|---|
| **What is it?** | Computing the Euclidean distance between two landmark points. This is how you measure whether eyes are open or closed, whether the mouth is open or shut, whether eyebrows are raised or lowered. |
| **WHY it matters** | Every facial measurement in the Confidence Detector is a distance between landmarks. Eye Aspect Ratio, mouth openness, eyebrow position — all distances. |
| **Difficulty** | Easy — basic math. You did this in ExamGuard. |
| **Status** | **REUSED from ExamGuard.** Identical technique. |

**What to learn:**

You define a 3D Euclidean distance function that works with FaceMesh's x/y/z landmark coordinates. The Eye Aspect Ratio (EAR) is calculated by dividing the average of two vertical eyelid distances by the horizontal eye-corner distance -- a low ratio means the eye is closed. Mouth openness uses the same approach: vertical lip distance divided by horizontal mouth-corner distance. These are the same formulas used in ExamGuard, just ported from Python to JavaScript.

**Confidence Detector connection:** You already wrote this code in Python for ExamGuard. Now you write it in JavaScript. The landmark indices are the same. The math is the same. This is a direct port.

---

### 3. Blink Rate Detection — Counting Eye Open/Close Cycles

| | |
|---|---|
| **What is it?** | Tracking how many times the speaker blinks per minute. Normal blink rate is 15-20 per minute. Under stress, it can jump to 30-50 per minute. Very low blink rate (staring) also indicates tension. |
| **WHY it matters** | Blink rate is one of the most reliable involuntary stress indicators. The speaker cannot fake it. A person giving a confident presentation blinks normally. A nervous person blinks excessively. |
| **Difficulty** | Easy — you already built a similar state-tracking pattern in ExamGuard for talking detection (mouth open/close cycles). |
| **Status** | **REUSED pattern from ExamGuard.** ExamGuard tracked mouth state transitions. Blink detection uses the same logic with eye state. |

**What to learn:**

You build a `BlinkDetector` class that uses Eye Aspect Ratio to track open-to-closed transitions (the same state-transition pattern used for talking detection in ExamGuard). Each blink is timestamped and stored in a rolling 60-second window, allowing you to compute blinks per minute. A `getStressLevel` method maps the blink rate to stress categories: under 10 BPM indicates a tense stare, 10-25 is normal, 25-40 is elevated stress, and above 40 signals significant nervousness.

**Confidence Detector connection:** In ExamGuard, you tracked mouth-open-to-closed transitions to detect talking. Blink detection is the same pattern — eye-open-to-closed transitions. The logic is identical, just applied to different landmarks. The blinks-per-minute feeds into the facial confidence score.

---

### 4. Eye Contact Detection — Iris and Head Direction

| | |
|---|---|
| **What is it?** | Determining whether the speaker is looking at the camera (audience) or looking away. This combines iris position within the eye (where are they looking?) with head pose (which direction is their head facing?). |
| **WHY it matters** | Eye contact is THE number one indicator of confidence in presentations. A speaker who maintains eye contact appears confident and trustworthy. A speaker who constantly looks down or away appears nervous and unprepared. |
| **Difficulty** | Medium — you built this in ExamGuard for gaze detection, but the Confidence Detector version needs more nuance (looking at notes briefly is OK, looking away for 10 seconds is not). |
| **Status** | **REUSED from ExamGuard gaze detection.** Same technique, refined thresholds. |

**What to learn:**

You build an `EyeContactDetector` class that combines two signals: how centered the iris is within the eye (normalized offset from 0 to 1) and how straight the head is facing (nose tip position relative to face center). The speaker is considered to be making eye contact only if BOTH the iris is centered and the head is facing forward. A rolling 60-second history of per-frame contact/no-contact readings lets you calculate an eye contact percentage and track the current streak of looking at or away from the camera.

**Confidence Detector connection:** ExamGuard detected "student is looking away from screen" as suspicious. The Confidence Detector detects "speaker is not looking at camera" as a confidence issue. Same underlying technique, different interpretation. The eye contact percentage is one of the strongest confidence signals you have.

---

### 5. Expression Classification — Mapping Distance Patterns to Emotions

| | |
|---|---|
| **What is it?** | Using combinations of landmark distances to classify the speaker's facial expression — neutral, happy, tense, worried, surprised. This goes beyond individual features (blink rate, mouth openness) to read the face as a WHOLE. |
| **WHY it matters** | Facial expressions reveal confidence and comfort. A relaxed, occasionally smiling face indicates confidence. A tense face with furrowed brows indicates anxiety. The Confidence Detector needs to read these patterns, not just individual features. |
| **Difficulty** | Medium-Hard — this is genuinely new. ExamGuard never classified expressions. |
| **Status** | **NEW.** ExamGuard detected specific actions (talking, looking). This detects emotional states. |

**What to learn:**

There are two approaches to classify expressions. The recommended approach for MVP uses MediaPipe's blendshapes, which provide about 52 pre-computed coefficients (smile, brow down, jaw open, etc.) -- you simply check if the smile coefficient is above 0.5 for "happy," if brow-down is above 0.4 for "tense," and so on. The fallback approach manually calculates landmark distances (brow height, mouth width/height ratio) and maps combinations to emotion labels. Both approaches return the detected expression and a confidence value.

**Confidence Detector connection:** Expression classification runs every frame and feeds a rolling average into the UI. "Expression: Relaxed (72% of session)" or "Expression: Tense (last 30 seconds)." The blendshapes approach is easier and recommended for your MVP — MediaPipe does the hard work for you.

---

### 6. Facial Action Coding System (FACS) Basics — Understanding Action Units

| | |
|---|---|
| **What is it?** | FACS is a scientific system that describes facial expressions using **Action Units (AUs)** — individual muscle movements. AU1 = inner brow raise, AU2 = outer brow raise, AU6 = cheek raise, AU12 = lip corner pull (smile), AU4 = brow lowerer. Combinations of AUs define expressions. |
| **WHY it matters** | FACS gives you a **vocabulary** for facial expressions. Instead of guessing "that looks nervous," you can say "AU4 (brow lower) + AU15 (lip corner depressor) + AU17 (chin raise) = distress expression." MediaPipe's blendshapes are roughly mapped to AUs. Understanding FACS helps you interpret them. |
| **Difficulty** | Easy conceptually — you do not need to memorize all 44 AUs. You need to know the 10-12 most relevant ones for confidence detection. |
| **Status** | **NEW concept.** ExamGuard never needed to understand facial muscle groups. |

**What to learn:**

| Action Unit | Muscle Movement | What It Signals | Relevant to Confidence? |
|-------------|----------------|-----------------|------------------------|
| AU1 | Inner brow raise | Worry, concern | Yes — raised inner brows = nervousness |
| AU2 | Outer brow raise | Surprise | Moderate — can indicate engagement or shock |
| AU4 | Brow lowerer | Anger, frustration, concentration | Yes — sustained = tension |
| AU6 | Cheek raiser | Genuine happiness (Duchenne) | Yes — present in real smiles, absent in fake |
| AU7 | Lid tightener | Stress, squinting | Yes — tension indicator |
| AU12 | Lip corner puller | Smile | Yes — core smile muscle |
| AU15 | Lip corner depressor | Sadness, displeasure | Yes — opposite of smile |
| AU20 | Lip stretcher | Fear, nervousness | Yes — "nervous grin" |
| AU24 | Lip pressor | Stress, holding back | Yes — pressed lips = suppressing anxiety |
| AU45 | Blink | Normal function / stress | Yes — rate indicates stress level |

**Confidence Detector connection:** You do not need to implement FACS detection from scratch — MediaPipe's blendshapes already approximate many of these AUs. But understanding FACS helps you INTERPRET the blendshape values. When `browDownLeft` is high, you know that is AU4 (brow lowerer), which maps to tension. This knowledge turns raw numbers into meaningful confidence signals.

---

### 7. Nervous vs Genuine Smile Detection — Distinguishing Fake from Real

| | |
|---|---|
| **What is it?** | A **genuine smile** (Duchenne smile) activates both the lip corners (AU12) AND the cheek raiser/eye crinkle muscles (AU6). A **fake/nervous smile** only activates the lip corners — the eyes do not participate. This is one of the most well-studied findings in psychology. |
| **WHY it matters** | Nervous speakers often force a smile to mask anxiety. The Confidence Detector should not interpret a fake smile as genuine confidence. Detecting the difference gives you a more accurate reading. |
| **Difficulty** | Medium — the concept is simple, but getting reliable detection from landmark data requires calibration. |
| **Status** | **NEW.** ExamGuard never analyzed smile quality. |

**What to learn:**

You analyze smile authenticity by checking two things: mouth corner movement (AU12) and cheek/eye crinkle (AU6). Using blendshapes, a genuine Duchenne smile has both mouth smile and cheek squint coefficients above threshold, while a forced smile has high mouth movement but low cheek/eye involvement. The manual fallback approach measures the distance between lower eyelid and cheekbone landmarks -- in a genuine smile this distance shrinks as the skin bunches up around the eyes, which does not happen in a fake smile.

**Confidence Detector connection:** The post-session report can include: "You smiled 12 times during your presentation. 8 were genuine, 4 appeared forced — typically during the Q&A section." This level of feedback helps speakers become aware of unconscious habits.

---

### 8. Baseline Concept — Why Everyone's Neutral Face Is Different

| | |
|---|---|
| **What is it?** | A **baseline** is a measurement of the speaker's face at rest (neutral expression) before the session begins. Everyone's face is shaped differently — different eye sizes, brow heights, mouth widths. Without a baseline, you cannot tell if a brow distance of 0.15 is "raised" or just "that person's normal face." |
| **WHY it matters** | This is critical for accuracy. Person A might have naturally narrow eyes (low EAR at rest). Without baseline calibration, your system would constantly flag them as "blinking" or "squinting." The baseline lets you measure CHANGE from neutral, not absolute values. |
| **Difficulty** | Medium — the concept is simple, but the implementation requires a calibration step at the start of each session. |
| **Status** | **NEW.** ExamGuard used fixed thresholds. The Confidence Detector needs personalized baselines for accurate expression detection. |

**What to learn:**

You build a `BaselineCalibrator` class that collects facial measurements (eye aspect ratios, brow height, mouth width/height, jaw openness) over 3 seconds while the user holds a neutral expression. Once calibration is complete, it averages all collected frames to establish the user's personal baseline values. During the live session, a `getDeviation` method compares any current measurement to the baseline and returns a percentage deviation (e.g., 0.2 means 20% higher than neutral), so that all expression detection is personalized to the individual's face rather than using generic fixed thresholds.

**Confidence Detector connection:** The calibration step happens at the start of every practice session. The UI shows "Look at the camera with a relaxed, neutral expression for 3 seconds." Those 3 seconds establish the speaker's personal baseline. From that point on, all expression detection measures DEVIATION from their neutral — not absolute values. This makes the system work for faces of all shapes and sizes.

---

## ALL 52 Blendshapes — Which Ones We Use

MediaPipe FaceMesh returns approximately 52 blendshape coefficients. Each is a float from 0.0 (not activated) to 1.0 (fully activated). We do NOT use all 52 — most are irrelevant to confidence detection (tongue movements, nostril flaring, etc.). Here are the ~15 we actually use, organized by what they tell us:

### Smile Detection (Confidence Signal: Positive)

| Blendshape | What It Measures | Our Threshold | What It Means for Confidence |
|-----------|-----------------|---------------|------------------------------|
| `mouthSmileLeft` | Left mouth corner pulled up | > 0.4 | Half-smile or full smile starting |
| `mouthSmileRight` | Right mouth corner pulled up | > 0.4 | Combined with Left: full smile detected |

When BOTH `mouthSmileLeft` and `mouthSmileRight` exceed 0.4, the speaker is smiling. Cross-reference with cheek raise (AU6) to distinguish genuine from forced — see Skill 7 above.

### Frown / Displeasure Detection (Confidence Signal: Negative)

| Blendshape | What It Measures | Our Threshold | What It Means for Confidence |
|-----------|-----------------|---------------|------------------------------|
| `mouthFrownLeft` | Left mouth corner pulled down | > 0.3 | Displeasure, frustration, or concentration |
| `mouthFrownRight` | Right mouth corner pulled down | > 0.3 | Combined with Left: speaker looks unhappy or strained |

### Lip Tension (Stress Signal)

| Blendshape | What It Measures | Our Threshold | What It Means for Confidence |
|-----------|-----------------|---------------|------------------------------|
| `mouthPressLeft` | Left lips pressed together | > 0.4 | Suppressing speech, holding back, anxiety |
| `mouthPressRight` | Right lips pressed together | > 0.4 | Combined: tight-lipped expression = stress |

Pressed lips (AU24) are one of the most reliable stress indicators. The speaker is literally holding their mouth shut — a sign of suppressed anxiety or disagreement.

### Brow Movement (Worry and Tension Signals)

| Blendshape | What It Measures | Our Threshold | What It Means for Confidence |
|-----------|-----------------|---------------|------------------------------|
| `browInnerUp` | Inner eyebrows raised (near nose bridge) | > 0.3 | Worry, concern, pleading. Classic "worried" face. |
| `browDownLeft` | Left eyebrow pulled down | > 0.3 | Concentration, frustration, anger |
| `browDownRight` | Right eyebrow pulled down | > 0.3 | Combined with Left: furrowed brows = tension |

`browInnerUp` alone (without outer brow raise) is the single best indicator of worry in the FACS system (AU1). When someone is nervous about their presentation, their inner brows go up involuntarily.

### Eye Behavior (Engagement and Stress Signals)

| Blendshape | What It Measures | Our Threshold | What It Means for Confidence |
|-----------|-----------------|---------------|------------------------------|
| `eyeBlinkLeft` | Left eye closed | > 0.5 | Used for blink rate calculation (see Skill 3) |
| `eyeBlinkRight` | Right eye closed | > 0.5 | Combined: both eyes blink = one blink counted |
| `eyeWideLeft` | Left eye opened wide | > 0.3 | Surprise, fear, or heightened alertness |
| `eyeWideRight` | Right eye opened wide | > 0.3 | Combined: wide eyes = startled or anxious |

### Mouth Opening (Speaking Detection)

| Blendshape | What It Measures | Our Threshold | What It Means for Confidence |
|-----------|-----------------|---------------|------------------------------|
| `jawOpen` | Jaw dropped / mouth open | > 0.15 | Speaker is talking. Used to sync with audio. |

### Eye Direction (Gaze / Eye Contact)

| Blendshape | What It Measures | Our Threshold | What It Means for Confidence |
|-----------|-----------------|---------------|------------------------------|
| `eyeLookDownLeft` | Left eye looking down | > 0.3 | Reading notes, avoiding eye contact |
| `eyeLookDownRight` | Right eye looking down | > 0.3 | Combined: looking down = not engaging audience |
| `eyeLookUpLeft` | Left eye looking up | > 0.3 | Thinking, recalling (less concerning) |
| `eyeLookUpRight` | Right eye looking up | > 0.3 | Combined: looking up = recalling information |
| `eyeLookInLeft` | Left eye looking toward nose | > 0.4 | Cross-reference with head pose for gaze direction |
| `eyeLookInRight` | Right eye looking toward nose | > 0.4 | Cross-reference with head pose for gaze direction |
| `eyeLookOutLeft` | Left eye looking away from nose | > 0.4 | Looking to the side = distracted or avoiding |
| `eyeLookOutRight` | Right eye looking away from nose | > 0.4 | Combined: looking sideways = not focused on audience |

**The remaining ~37 blendshapes** (tongue out, nostril flare, cheek puff, mouth shrug, etc.) are not relevant to confidence detection. We ignore them entirely. This keeps the processing fast and the logic simple.

---

## WHY Blendshapes Beat Manual Distances — Our Real Experience

This is not theoretical. Here is what actually happened when we tried both approaches:

### Attempt 1: Manual Distance Calculations

The first approach was to calculate distances between landmarks manually — the same technique used in ExamGuard for gaze detection.

**Smile detection with manual distances:**
We measured the distance between the left mouth corner (landmark 61) and the right mouth corner (landmark 291), and compared it to the vertical distance between the upper and lower lips. The idea: when someone smiles, their mouth gets wider and thinner. Simple ratio.

**What went wrong:** When people smiled, their mouth also OPENED slightly. The mouth opening shifted the center point of the lips downward, which made the vertical measurement INCREASE. The ratio sometimes went in the wrong direction. We got negative confidence contributions from genuine smiles — the system thought smiling people were frowning.

**Tense face detection with manual distances:**
We measured the distance between the inner eyebrow landmarks and the eye landmarks. The idea: when someone furrows their brows (tension), the distance between brow and eye decreases.

**What went wrong:** Everyone's brow-to-eye distance is different. Some people have naturally low brows. The threshold that worked for one test face flagged every resting frame as "tense" for another face. We tried normalizing by face height, but the noise in frame-to-frame landmark positions meant the normalized values jittered constantly, producing flickering tension scores.

### Attempt 2: MediaPipe Blendshapes

We switched to blendshapes: `mouthSmileLeft > 0.4` for smile, `browDownLeft > 0.3` for tension.

**What happened:** Smile detection worked immediately. Tension detection worked immediately. No negative scores, no false positives on resting faces, no jittering. MediaPipe's internal model had already learned how to separate "smiling with mouth open" from "mouth open without smiling" — something our simple ratio could not do.

### The Lesson

**Pre-trained features beat hand-crafted features.** MediaPipe's blendshape model was trained on thousands of faces across different shapes, sizes, skin tones, and lighting conditions. It learned complex patterns that a simple distance ratio cannot capture. Our manual distances worked for binary decisions (eye open vs closed, mouth open vs closed) but failed for nuanced expressions (genuine smile vs mouth movement, real tension vs natural face shape).

**When to use manual distances:** Binary states — blink detection (EAR), mouth open/closed, head facing left/right. These are simple geometry problems.

**When to use blendshapes:** Expression classification — smile, frown, tension, worry, surprise. These are pattern recognition problems that benefit from a trained model.

---

## EAR Formula Explained

The Eye Aspect Ratio (EAR) is a simple formula that tells you whether an eye is open or closed. It was introduced by Soukupova and Cech in 2016 and has become the standard approach for blink detection.

### The Formula

```
EAR = (|p2 - p6| + |p3 - p5|) / (2 x |p1 - p4|)
```

Where p1 through p6 are specific landmark points around one eye:

```
        p2    p3
   p1 -------- ---- p4
        p6    p5
```

- **p1** = outer eye corner (left side)
- **p2** = upper eyelid, outer third
- **p3** = upper eyelid, inner third
- **p4** = inner eye corner (right side, near nose)
- **p5** = lower eyelid, inner third
- **p6** = lower eyelid, outer third

**|p2 - p6|** = vertical distance between upper and lower eyelid at the outer third
**|p3 - p5|** = vertical distance between upper and lower eyelid at the inner third
**|p1 - p4|** = horizontal distance across the eye (corner to corner)

The numerator averages two vertical measurements (to handle cases where the eyelid is not perfectly symmetrical). The denominator normalizes by eye width so the ratio works for eyes of different sizes.

### Worked Example: Eye Open

Suppose the landmark coordinates are:
- p1 = (0.30, 0.40), p4 = (0.38, 0.40) -- eye corners, roughly horizontal
- p2 = (0.33, 0.37), p3 = (0.36, 0.37) -- upper eyelid, above center
- p5 = (0.36, 0.43), p6 = (0.33, 0.43) -- lower eyelid, below center

Calculations:
- |p2 - p6| = distance from (0.33, 0.37) to (0.33, 0.43) = 0.06
- |p3 - p5| = distance from (0.36, 0.37) to (0.36, 0.43) = 0.06
- |p1 - p4| = distance from (0.30, 0.40) to (0.38, 0.40) = 0.08

EAR = (0.06 + 0.06) / (2 x 0.08) = 0.12 / 0.16 = **0.75**

An EAR of 0.75 means the eye is wide open. The vertical opening is 75% of the horizontal width.

### Worked Example: Eye Closed (Blink)

During a blink, the upper and lower eyelids nearly touch:
- p2 = (0.33, 0.405), p3 = (0.36, 0.405) -- upper eyelid drops down
- p5 = (0.36, 0.415), p6 = (0.33, 0.415) -- lower eyelid rises up

Calculations:
- |p2 - p6| = distance from (0.33, 0.405) to (0.33, 0.415) = 0.01
- |p3 - p5| = distance from (0.36, 0.405) to (0.36, 0.415) = 0.01
- |p1 - p4| = 0.08 (unchanged — eye corners do not move during a blink)

EAR = (0.01 + 0.01) / (2 x 0.08) = 0.02 / 0.16 = **0.125**

An EAR of 0.125 is well below the blink threshold. The eye is closed.

### The Threshold

| EAR Value | Interpretation |
|-----------|---------------|
| > 0.3 | Eye is open (normal) |
| 0.2 - 0.3 | Eye is partially closed (squinting or starting to blink) |
| < 0.2 | Eye is closed — count as a blink |

**When EAR drops below 0.2 and then rises back above 0.2, that is one blink.** The BlinkDetector class (Skill 3) tracks these transitions.

**WHY 0.2?** This threshold was established in the original EAR research paper and works well for most people. However, people with naturally narrow eyes may have a resting EAR of 0.25, which is why baseline calibration (Skill 8) matters — you measure their personal "open eye" EAR and set the threshold relative to that.

---

## Baseline Calibration Concept

Everyone's resting face is different. Person A has naturally wide eyes (resting EAR of 0.35). Person B has naturally narrow eyes (resting EAR of 0.25). If you use a fixed blink threshold of 0.2 for both:

- Person A: works fine. Their EAR drops from 0.35 to 0.12 during a blink. Clear signal.
- Person B: false positives everywhere. Their RESTING EAR of 0.25 is already close to 0.2. Any slight squint triggers a "blink."

The same problem applies to every facial measurement — brow height, mouth width, smile intensity. Fixed thresholds fail because faces are not one-size-fits-all.

### How Baseline Calibration Works

**Step 1: Calibration prompt (3 seconds)**
When the user starts a practice session, the UI shows: "Look at the camera with a relaxed, neutral expression for 3 seconds." A countdown timer shows the progress.

**Step 2: Record neutral measurements**
During those 3 seconds (roughly 90 frames at 30 FPS), the system records every blendshape value and landmark distance for each frame.

**Step 3: Calculate personal averages**
Average all 90 frames to get the user's personal baseline. For example:
- Person A's neutral `eyeBlinkLeft` average: 0.05 (eyes naturally wide)
- Person B's neutral `eyeBlinkLeft` average: 0.18 (eyes naturally narrow)
- Person A's neutral `browInnerUp` average: 0.08 (relaxed brows)
- Person C's neutral `browInnerUp` average: 0.22 (naturally raised inner brows)

**Step 4: Measure deviations during the session**
Instead of comparing blendshape values to fixed thresholds, compare them to the personal baseline.

Example for brow tension detection:
- Fixed threshold approach: `browDownLeft > 0.3` = tense. Person C with naturally high brows gets flagged as tense when they are perfectly relaxed.
- Baseline approach: `browDownLeft > (baseline_browDownLeft + 0.15)` = tense. Person C's baseline browDownLeft is 0.22, so tension is only flagged above 0.37. This catches ACTUAL tension, not natural face shape.

### Worked Example with Real Numbers

Person A (wide eyes, relaxed brows) and Person B (narrow eyes, naturally furrowed brows) both give a practice presentation:

| Measurement | Person A Baseline | Person A During Talk | Deviation | Person B Baseline | Person B During Talk | Deviation |
|------------|------------------|---------------------|-----------|------------------|---------------------|-----------|
| eyeBlinkLeft | 0.05 | 0.08 | +0.03 (normal) | 0.18 | 0.21 | +0.03 (normal) |
| browDownLeft | 0.06 | 0.12 | +0.06 (slight tension) | 0.22 | 0.28 | +0.06 (slight tension) |
| mouthSmileLeft | 0.02 | 0.45 | +0.43 (smiling) | 0.05 | 0.48 | +0.43 (smiling) |

Both speakers show the SAME deviations from their personal baselines, even though their absolute values are very different. Without calibration, Person B would be flagged as "tense and squinting" at rest. With calibration, both are measured fairly.

### Why This Is a v2 Feature

Baseline calibration adds complexity:
- You need a calibration step at the start of every session (3 seconds of "hold still").
- If the user moves during calibration, the baseline is noisy.
- If lighting changes mid-session, absolute values shift but baselines become stale.
- You need to store and manage per-session baseline data.

For the MVP, fixed thresholds are good enough to demonstrate the concept. The thresholds in the blendshape table above work for most faces in good lighting. But understanding the CONCEPT of baseline calibration is important because it is the path from "demo that works for me" to "tool that works for everyone." Plan for it in your architecture even if you do not implement it in v1.

---

## Skill Summary Table

| Skill | What It Does | Status | Difficulty |
|-------|-------------|--------|------------|
| MediaPipe FaceMesh setup | Load face model in browser | REUSED concept, new platform | Easy |
| Landmark distances | Measure facial features | **REUSED** from ExamGuard | Easy |
| Blink rate detection | Count blinks per minute | **REUSED** pattern from ExamGuard | Easy |
| Eye contact detection | Track gaze direction | **REUSED** from ExamGuard | Medium |
| Expression classification | Map landmarks to emotions | **NEW** | Medium-Hard |
| FACS basics | Understand Action Units | **NEW** concept | Easy (theory) |
| Smile analysis | Genuine vs forced smiles | **NEW** | Medium |
| Baseline calibration | Personalize to each user | **NEW** | Medium |

**4 skills reused from ExamGuard, 4 skills entirely new.** You already have half the foundation built.

---

## After This Phase

**After this phase, you can detect expressions, eye contact, and nervousness from a live camera feed.**

You will have blink rate tracking, eye contact percentage, expression classification (neutral/happy/tense/stressed), genuine vs forced smile detection, and a personalized baseline for each user. Combined with Phase 2's voice analysis, you now have two of the three major confidence signal sources — the third being text/language analysis from Phase 4.

---

## Resources

### Official Documentation

| Resource | Link | What You Get |
|----------|------|-------------|
| MediaPipe Face Landmarker (JS) | https://developers.google.com/mediapipe/solutions/vision/face_landmarker/web_js | Official setup guide for browser |
| MediaPipe Blendshapes | https://developers.google.com/mediapipe/solutions/vision/face_landmarker/web_js#handle_and_display_results | Blendshape categories and usage |
| Face Landmark Indices | https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png | Visual map of all 468 landmarks |
| FACS Wikipedia | https://en.wikipedia.org/wiki/Facial_Action_Coding_System | Action Unit reference table |

### Video Tutorials

| Resource | Link | What You Get |
|----------|------|-------------|
| Nicholas Renotte: Face Mesh JS | https://www.youtube.com/watch?v=JXLBG_GBRuI | MediaPipe FaceMesh in the browser |
| The Coding Train: Face Mesh | https://www.youtube.com/watch?v=R5UOGn49Gp4 | Drawing landmarks on canvas |
| Fireship: MediaPipe in 100 Seconds | https://www.youtube.com/watch?v=MyBbYXg2n9c | Quick overview of MediaPipe |
| Paul Ekman Group: FACS Intro | https://www.youtube.com/watch?v=d28VDtSLSEY | Understanding Action Units from the creators of FACS |

### Research and Articles

| Resource | Link | What You Get |
|----------|------|-------------|
| Duchenne Smile research | https://en.wikipedia.org/wiki/Duchenne_marker | Science behind genuine vs fake smiles |
| Eye Aspect Ratio paper | https://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf | Original EAR blink detection method |
| Real-time blink detection | https://pyimagesearch.com/2017/04/24/eye-blink-detection-opencv-python-dlib/ | Adrian Rosebrock's blink detection guide (Python, but logic applies) |

---

## Key Takeaway

Phase 3 is where ExamGuard experience pays off the most. Half the skills are direct reuse — you already know FaceMesh, landmark distances, and state-tracking patterns. The new skills (expression classification, FACS, smile analysis, baseline calibration) build directly on that foundation. You are not starting from zero; you are adding a second floor to a building you already constructed. Take advantage of that head start.
