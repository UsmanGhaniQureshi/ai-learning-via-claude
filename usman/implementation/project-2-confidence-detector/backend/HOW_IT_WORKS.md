# HOW THE CONFIDENCE DETECTOR ACTUALLY WORKS

> **This document is HONEST. It tells you exactly where every value comes from, 
> what's actually measured vs what's guessed, and where the system is unreliable.**

---

## The Complete Flow

```
CAMERA FRAME (640x480 image, 30 times per second)
      |
      v
MEDIAPIPE FACELLANDMARKER
  → 468 face landmark points (x, y, z coordinates)
  → 52 blendshape scores (0.0 to 1.0 each)
  RELIABILITY: HIGH — MediaPipe is trained on millions of faces by Google
      |
      v
BASELINE CALIBRATION (first 30 frames = ~1 second)
  → Averages all 52 blendshape scores during "resting face"
  → This becomes YOUR personal baseline
  RELIABILITY: MEDIUM — depends on user actually looking neutral during first second
      |
      v
DEVIATION CALCULATION
  → For each frame: current_value - baseline_value = deviation
  → Example: squint was 0.45 at rest, now 0.58 → deviation = +0.13
  RELIABILITY: HIGH — simple subtraction math, always correct
      |
      v
EXPRESSION CLASSIFICATION ← THIS IS WHERE GUESSING STARTS
  → IF squint deviation > +0.05 AND no frown → "happy"
  → IF browDown deviation > +0.15 → "angry"
  → IF squint deviation < -0.08 → "surprised"
  → etc.
  RELIABILITY: LOW — ALL thresholds are guessed. No research backing.
  The 0.05, 0.15, 0.08 numbers were picked by trial and error, not science.
      |
      v
CONFIDENCE SCORE ← MORE GUESSING
  → Base: 25 (silent) or 35 (speaking)
  → +30 for "happy", +20 for "speaking", -20 for "angry", etc.
  → +20 for good eye contact, -15 for poor eye contact
  → +5 for upright posture
  RELIABILITY: LOW — every bonus/penalty number is arbitrary.
  Why +30 for happy and not +25 or +35? No reason. I guessed.
```

---

## Value-by-Value Breakdown: What's Real and What's Not

### VALUES THAT ARE REAL (actually measured)

| Value | Source | How It Works | Reliable? |
|:---|:---|:---|:---|
| **Eye contact %** | Blendshape gaze directions (eyeLookDown/Up/In/Out) | If strongest gaze < 0.55, looking at camera. Rolling average of last 30 readings. | YES — gaze blendshapes are accurate |
| **Blink rate** | eyeBlinkLeft/Right blendshapes | Count transitions from <0.3 to >0.5 in a 60-second window | YES — blink detection works well |
| **WPM (words per minute)** | total_words / elapsed_seconds × 60 | Simple division, always correct | YES — math is correct |
| **Filler word count** | Text search for "um", "uh", "like", etc. in transcript | Match words against a list | MOSTLY YES — but "like" has ~15% false positives |
| **Hedge phrase count** | Text search for "I think", "maybe", etc. | Match phrases against a list | YES — these phrases are always hedging in presentations |
| **Posture** | MediaPipe Pose Landmarker (shoulder positions) | Shoulder tilt > 0.06 = tilted | MOSTLY YES — but "upright" is just "not tilted" |
| **Jaw open** | jawOpen blendshape | Value > 0.02 = mouth is moving | YES — works reliably |

### VALUES THAT ARE ESTIMATED (calculated from real data but using guessed thresholds)

| Value | Source | Threshold | Research Backing |
|:---|:---|:---|:---|
| **Expression label** | Combination of blendshape deviations | squint > 0.05 = happy, browDown > 0.15 = angry, etc. | NONE — all thresholds guessed by trial and error |
| **Filler rate severity** | filler_count / total_words × 100 | < 2% = "acceptable", > 5% = "high" | SOME — public speaking research suggests 3-5/min is noticeable |
| **Pace assessment** | WPM value | 130-160 = "optimal" | SOME — TED talk research suggests 130-170 WPM |
| **Fidget score** | Shoulder/wrist movement over 10 frames | movement > 0.03 threshold | NONE — arbitrary |

### VALUES THAT ARE GUESSED (no measurement or research behind them)

| Value | What I Did | Why It's a Guess |
|:---|:---|:---|
| **Base score (25 silent, 35 speaking)** | Picked numbers that "felt right" | No research says "a silent person = 25% confident" |
| **Expression bonuses (+30 happy, +20 speaking, -20 angry)** | Made up to create score spread | Why +30 and not +25? No reason |
| **Eye contact bonuses (+20 for >80%)** | Guessed based on "80% sounds like good contact" | No study says "80% eye contact = +20 points" |
| **Filler penalty multiplier (×5)** | Picked to make 5% filler rate = 25 point penalty | Arbitrary multiplication |
| **Hedge penalty (×3 each)** | Picked to make 10 hedges = 30 point penalty | Arbitrary |
| **Scoring weights (0.40 / 0.35 / 0.25)** | Guessed based on "face matters most, voice least" | Mehrabian's research is often cited but applies to contradictory messages, not presentations |
| **EMA smoothing factor (0.3)** | Common default for EMA | Not tuned for this specific use case |

---

## How the Final Score is Calculated (Exact Math)

### Face Score (0-100)

```
Step 1: Determine if speaking
  is_active = (expression is "speaking" or "happy")

Step 2: Base score
  if is_active: base = 35
  else: base = 25

Step 3: Expression bonus/penalty
  happy:      +30
  speaking:   +20
  focused:    +10
  neutral:     +0
  calibrating: fixed 50
  surprised:   -5
  sad:        -15
  angry:      -20

Step 4: Eye contact
  If speaking:
    eye_pct > 80%: +20
    eye_pct > 60%: +12
    eye_pct > 30%: +5
    eye_pct < 15%: -15
  If silent:
    eye_pct > 70%: +8
    eye_pct < 20%: -5

Step 5: Other adjustments
  blink_rate > 35/min: -10
  blink_rate > 25/min: -5
  posture upright: +5
  posture tilted: -5
  posture slouching: -12
  fidget > 50: -10
  fidget > 25: -5
  hands gesturing (only when speaking): +7

Step 6: Clamp to 0-100

EXAMPLE: Speaking, neutral expression, 75% eye contact, upright, no fidget
  35 (base) + 20 (speaking) + 12 (eye 75%) + 5 (upright) = 72
```

### Speech Score (0-100)

```
Start at 100, subtract penalties:

  filler_penalty = min(40, filler_rate_percent × 5)
  hedge_penalty  = min(30, hedge_count × 3)
  rep_penalty    = min(15, repetition_count × 5)
  pace_penalty   = 0 (if 130-160 WPM)
                   5 (if 100-130 or 160-180 WPM)
                  10 (if < 100 WPM)
                  15 (if > 180 WPM)

  speech_score = 100 - (filler + hedge + rep + pace penalties)

EXAMPLE: 280 words, 140 WPM, 6 fillers (2.1% rate), 2 hedges, 0 reps
  filler: min(40, 2.1 × 5) = min(40, 10.5) = 10
  hedge:  min(30, 2 × 3) = 6
  rep:    0
  pace:   0 (140 is optimal)
  score = 100 - 16 = 84
```

### Overall Score (for uploaded videos with audio)

```
overall = face_avg × 0.40 + speech_score × 0.40 + pace_score × 0.20

Where pace_score:
  130-160 WPM: 100
  100-130 or 160-180 WPM: 75
  < 100 or > 180 WPM: 50
```

---

## Known Problems

1. **Expression detection is unreliable.** Blendshape values shift between sessions (different lighting, distance, angle). The same person can get different expression labels 5 minutes apart without changing their actual expression.

2. **"Like" false positives.** "I like pizza" counts as a filler. Accepted tradeoff for v1.

3. **Vosk small model misses words.** The 40MB model was chosen for speed, not accuracy. Replacing with 1.8GB model will help significantly.

4. **No validation.** The system has never been compared against human confidence ratings. We don't know if "78/100" actually means anything.

5. **Cultural assumptions.** The system assumes Western presentation norms: direct eye contact = good, steady voice = confident. This isn't universal.

---

## How to Improve (What Would Make This Real)

1. **Validate with humans.** Record 20 presentations. Have 5 people rate each on 0-100. Compare to system score. Adjust weights until they match.

2. **Use a real emotion model.** MediaPipe blendshapes aren't designed for emotion detection. A dedicated model (FER, AffectNet, or a fine-tuned model) would be more accurate. We couldn't install these due to Windows path length limits.

3. **Collect training data.** Record labeled "confident" and "nervous" presentations. Train a classifier on the actual blendshape patterns. Replace guessed thresholds with learned ones.

4. **A/B test thresholds.** Instead of guessing "filler penalty = rate × 5", try different multipliers and see which one best predicts human ratings.

5. **User feedback loop.** After each session, ask the user: "Did this score feel right?" Use their feedback to tune the system over time.
