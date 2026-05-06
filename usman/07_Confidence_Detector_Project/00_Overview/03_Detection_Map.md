# Confidence Detector — Detection Map

## The 4 Questions to Choose Any Detection Approach

Before picking a technology for each sub-problem, ask:

```
1. WHAT signal am I trying to detect?       → Break confidence into measurable parts
2. WHAT input data do I need?               → Video frames? Audio? Text?
3. WHAT technology can process this input?   → Pre-trained model? API? Custom code?
4. WHY this specific approach?              → Speed? Accuracy? Cost? Offline?
```

---

## Confidence Detection Sub-Problems

The big problem "detect confidence in a presentation" breaks down into **6 sub-problems:**

```
1. Read facial expressions    → Is the presenter tense, neutral, or relaxed?
2. Track eye contact          → Are they looking at the camera/audience?
3. Count filler words         → How many "um", "uh", "like" per minute?
4. Detect hedging language    → Are they saying "I think maybe" or stating facts?
5. Measure speaking pace      → Too fast, too slow, or steady?
6. Analyze voice steadiness   → Is the voice shaky, monotone, or confident?
```

Each sub-problem needs its own detection approach. Some share technology.

---

## The Full Detection Map

| # | Sub-Problem | Input | Technology | Why This Approach | Runs |
|:---|:---|:---|:---|:---|:---|
| 1 | **Facial Expressions** | Video frames | MediaPipe FaceMesh (468 landmarks) | Pre-trained, free, runs on any platform, fast (30+ FPS). Same tool used in ExamGuard. | Every frame |
| 2 | **Eye Contact** | Video frames | MediaPipe FaceMesh (iris + head landmarks) | Same model as #1 — no extra cost. You already built this in ExamGuard (gaze detection). | Every frame |
| 3 | **Filler Words** | Transcript text | Speech-to-Text → Pattern matching | STT converts audio to text. Pattern matching is instant and free — just check against a word list. | Every final sentence |
| 4 | **Hedging Language** | Transcript text | Pattern matching (phrase list) | Same approach as #3. Check text against known hedging phrases. No AI needed. | Every final sentence |
| 5 | **Speaking Pace** | Transcript text + time | Word count ÷ elapsed time | Simple math — no model needed. Count words, divide by seconds, multiply by 60 = WPM. | Every 5 seconds |
| 6 | **Voice Steadiness** | Raw audio | Audio frequency analysis (FFT) | Built into every platform's audio API. Measures pitch variation and volume over time. | Continuous |

**Optional (v2):**

| # | Sub-Problem | Input | Technology | Why | Runs |
|:---|:---|:---|:---|:---|:---|
| 7 | **Deep AI Analysis** | Video frame + transcript | Claude API (multimodal) | Combines face + text for nuanced coaching that rules can't provide. Costs money. | Every 30 seconds |

---

## Detailed Breakdown: Why Each Approach?

### 1. Facial Expressions: MediaPipe FaceMesh

**Why not a dedicated emotion classifier (like FER, AffectNet)?**

| Option | Pros | Cons | Verdict |
|:---|:---|:---|:---|
| **MediaPipe FaceMesh** | Free, fast, 468 points, you know it from ExamGuard, runs offline | Doesn't label emotions directly — YOU write the distance-to-emotion logic | **CHOSEN** — gives us raw data, we control the interpretation |
| **Dedicated emotion model (FER)** | Labels emotions directly ("happy", "sad", "angry") | Often inaccurate on subtle expressions, black box (can't tune it), many are research-only | Skip — too inaccurate for subtle confidence signals |
| **Claude API per frame** | Most accurate expression reading possible | Way too slow (2-5 sec/frame) and expensive for real-time | Use periodically, not per-frame |

**Key decision:** We use MediaPipe for RAW MEASUREMENTS and write our OWN expression logic. This gives us control — we can tune what "nervous" means rather than relying on a generic emotion classifier.

### 2. Eye Contact: Same MediaPipe Model

No extra technology needed — eye contact uses the SAME 468 landmarks from #1.

```
From ExamGuard you already know:
  - Iris landmarks (468-472) → where the iris is pointing
  - Head direction landmarks (4, 133, 362) → where the head is facing
  - Combine both → "looking at camera" or "looking away"
```

This is a direct reuse of ExamGuard skills. Zero new learning needed.

### 3 & 4. Filler Words + Hedging: Speech-to-Text → Pattern Matching

**Why not use AI for filler detection?**

| Approach | Speed | Cost | Accuracy | Verdict |
|:---|:---|:---|:---|:---|
| **Pattern matching (word list)** | Instant | Free | ~85% (misses context like "I like pizza") | **CHOSEN for v1** — fast, free, good enough |
| **Claude API per sentence** | 2-5 seconds | ~$0.001/sentence | ~98% (understands context) | v2 enhancement — add as optional layer |

For v1, catching 85% of fillers instantly is better than catching 98% with a 3-second delay.

### 5. Speaking Pace: Simple Math

No AI needed at all. Pure arithmetic:

```
words_spoken = count words in transcript
time_elapsed = current time - session start time
pace = (words_spoken / time_elapsed) * 60  → words per minute
```

Check against thresholds: <100 = too slow, 130-160 = optimal, >180 = too fast.

### 6. Voice Steadiness: Audio Frequency Analysis

Every platform has a built-in way to analyze audio frequencies:

| What We Measure | How | What It Tells Us |
|:---|:---|:---|
| **Volume over time** | Measure amplitude of audio signal | Drops = trailing off. Spikes = emphasis. |
| **Pitch variation** | Measure fundamental frequency (FFT) | Monotone = low variation. Shaky = rapid small variation. Confident = natural variation. |
| **Silence ratio** | Detect when volume < threshold | Long silences = lost for words. Short pauses = thoughtful. |

---

## How Each Detection Connects to the Confidence Score

```
Detection 1: Expressions  ──→ } Face Score (0-100) ───────┐
Detection 2: Eye Contact  ──→ }                           ├──→ CONFIDENCE
Detection 3: Filler Words ──→ }                           │     SCORE
Detection 4: Hedging      ──→ } Speech Score (0-100) ─────┤     (0-100)
Detection 5: Pace         ──→ }                           │
Detection 6: Voice Steady ──→ Voice Score (0-100) ────────┘

Weights:
  Face       × 0.40
  Speech     × 0.35
  Voice      × 0.25
  ──────────────────
  Total      = 1.00
```

These are starting heuristics for the MVP, not universal truth. Eye contact still matters a lot, but in implementation it is folded into the Face Score rather than shown as a separate top-level score.

---

## The Blendshapes We Use

MediaPipe FaceMesh provides 52 blendshape coefficients. We don't use all 52 — most are for avatar animation (puffed cheeks, tongue out). Here are the ~15 that matter for confidence detection:

| Blendshape | What It Measures | What It Tells Us About Confidence | Threshold |
|:---|:---|:---|:---|
| **eyeBlinkLeft** | Left eye closure (0.0 open - 1.0 closed) | Rapid blinking = stress/nervousness | >0.5 = blink detected |
| **eyeBlinkRight** | Right eye closure | Same as left — we average both eyes | >0.5 = blink detected |
| **eyeLookUpLeft** | Left eye looking up | Combined with head pose = looking away from camera | >0.3 = looking up |
| **eyeLookUpRight** | Right eye looking up | Same — averaged with left | >0.3 = looking up |
| **eyeLookDownLeft** | Left eye looking down | Reading notes? Looking at desk? | >0.3 = looking down |
| **eyeLookDownRight** | Right eye looking down | Same — averaged with left | >0.3 = looking down |
| **eyeLookInLeft** | Left eye looking inward (toward nose) | Cross-referencing with right = gaze direction | >0.3 = looking right |
| **eyeLookInRight** | Right eye looking inward | Combined = looking left | >0.3 = looking left |
| **eyeSquintLeft** | Left eye squinting | Tension indicator — squinting under stress | >0.4 = squint detected |
| **eyeSquintRight** | Right eye squinting | Same | >0.4 = squint detected |
| **browDownLeft** | Left brow lowered | Furrowed brows = tension, concentration, or frustration | >0.3 = brow tension |
| **browDownRight** | Right brow lowered | Same | >0.3 = brow tension |
| **browInnerUp** | Inner brow raised | Worry/concern expression | >0.3 = worry signal |
| **mouthSmileLeft** | Left corner of mouth raised | Genuine smile (both sides) vs forced (one side) | >0.4 = smile detected |
| **mouthSmileRight** | Right corner of mouth raised | Symmetry check: genuine smiles are symmetrical | >0.4 = smile detected |
| **jawOpen** | Jaw opening amount | Speaking vs not speaking detection | >0.1 = mouth open (talking) |

**Why these 15 and not all 52?** The remaining blendshapes cover tongue position, cheek puff, lip pucker, etc. — things that don't indicate confidence or nervousness. Using fewer signals means less noise in our scoring.

---

## Concrete Formulas

No code here — just the math so you understand exactly what the system computes.

### Eye Aspect Ratio (EAR) for Blink Detection

EAR measures how "open" an eye is. When you blink, EAR drops to near zero.

```
EAR = (|p2 - p6| + |p3 - p5|) / (2 × |p1 - p4|)

Where:
  p1, p4 = outer and inner corner of the eye (horizontal)
  p2, p3 = upper eyelid landmarks (vertical)
  p5, p6 = lower eyelid landmarks (vertical)
  |a - b| = Euclidean distance between points a and b
```

**Worked example:**

```
Eye wide open:
  |p2 - p6| = 12 pixels    (upper-lower distance, left side)
  |p3 - p5| = 11 pixels    (upper-lower distance, right side)
  |p1 - p4| = 30 pixels    (corner-to-corner distance)

  EAR = (12 + 11) / (2 × 30) = 23 / 60 = 0.383

Eye during blink:
  |p2 - p6| = 2 pixels
  |p3 - p5| = 1 pixel
  |p1 - p4| = 30 pixels

  EAR = (2 + 1) / (2 × 30) = 3 / 60 = 0.05

Threshold: EAR < 0.20 for 2+ consecutive frames = one blink
Normal blink rate: 15-20 per minute
Stress blink rate: >25 per minute
```

### WPM Calculation (Words Per Minute)

```
WPM = (total_words / elapsed_seconds) × 60

Windowed version (last 15 seconds):
WPM_recent = (words_in_last_15_seconds / 15) × 60
```

**Worked example:**

```
User has spoken 47 words in the last 15 seconds:
WPM_recent = (47 / 15) × 60 = 188 WPM

Verdict: Too fast (optimal range is 130-160 WPM)
Coaching nudge: "Slow down a bit"
```

### Filler Rate

```
filler_rate = filler_count / total_words × 100    (as percentage)

OR

fillers_per_minute = filler_count / elapsed_minutes
```

**Worked example:**

```
Transcript: "So um we decided to uh launch the product because um like
             the market was uh ready and you know we had the um resources"

Fillers found: "um" (×3), "uh" (×2), "like" (×1), "you know" (×1) = 7 fillers
Total words: 25
Elapsed time: 12 seconds

filler_rate = 7 / 25 × 100 = 28% of words are fillers (very high)
fillers_per_minute = 7 / (12/60) = 35 fillers/minute (extremely high)

Normal: <2 per minute
Acceptable: 2-5 per minute
High: 5-10 per minute → coaching nudge
Very high: >10 per minute → strong warning
```

---

## Threshold Values and WHY

Every magic number in the system, what it is, and why that specific value:

| Metric | Threshold | Value | WHY This Number |
|:---|:---|:---|:---|
| **EAR blink** | Blink detected | <0.20 for 2+ frames | Research standard (Soukupova & Cech 2016). Below 0.20 the eye is effectively closed. Requiring 2 frames prevents false positives from motion blur. |
| **Blink rate** | Normal | 15-20/min | Medical average for adults during conversation. Below 10 = staring. Above 25 = stress indicator. |
| **Blink rate** | Stress signal | >25/min | Studies show anxious speakers blink 26-30 times per minute vs 17 average. |
| **Eye contact** | Good | >60% of time looking at camera | Presentation coaches recommend 60-70%. Below 50% feels evasive. Above 90% feels intense/staring. |
| **WPM** | Too slow | <100 | Below 100 WPM sounds hesitant or under-prepared. TED talks average 130-170 WPM. |
| **WPM** | Optimal | 130-160 | The "sweet spot" from public speaking research. Fast enough to hold attention, slow enough to be understood. |
| **WPM** | Too fast | >180 | Above 180 WPM, audiences lose comprehension. Nervous speakers often hit 200+. |
| **Filler rate** | Acceptable | <5/min | Most audiences don't consciously notice fillers below 3-5 per minute. |
| **Filler rate** | High | >10/min | Above 10/min, fillers become distracting. Audiences start counting them. |
| **Hedging phrases** | Flag threshold | >3 per minute | Occasional hedging is natural ("I think" once is fine). Constant hedging ("I sort of maybe think") signals low confidence. |
| **Volume drop** | Trailing off | >40% drop from speaker's average | A 40% volume drop within a sentence almost always means trailing off or losing confidence in the statement. |
| **Pitch variation** | Monotone | StdDev <10 Hz over 30 seconds | Very low pitch variation = monotone delivery. Confident speakers vary pitch by 20-50 Hz naturally. |
| **Pitch variation** | Shaky | StdDev >80 Hz over 5 seconds | Rapid, large pitch swings in a short window = voice tremor, usually from nervousness. |
| **Silence** | Thinking pause | 1-3 seconds | Natural pauses for thought. Don't penalize. |
| **Silence** | Awkward gap | >5 seconds | More than 5 seconds of silence feels uncomfortable. May indicate the speaker lost their place. |
| **Smile symmetry** | Genuine | Left-right difference <0.15 | Duchenne smiles (genuine) are symmetrical. Forced/nervous smiles show asymmetry >0.15 between left and right mouth corners. |
| **Coaching alert cooldown** | Min gap between alerts | 15 seconds | Showing alerts more often than every 15 seconds is distracting and counterproductive. Let the speaker absorb one tip before giving the next. |
| **EMA alpha** | Smoothing factor | 0.3 | 0.3 = 30% weight on new value, 70% on trend. Lower = smoother but more lag. Higher = more responsive but jumpier. 0.3 is a good balance for 1-2 second update cycles. |

**These are all tunable.** After testing with real sessions, some will feel too aggressive (too many warnings) or too lenient (not catching real issues). Adjust based on user feedback.

---

## Fairness and Bias

An honest discussion. This system has bias — all systems do. Here's what we know:

### Face Shape and Skin Tone

| Concern | Status | What We Know |
|:---|:---|:---|
| **Does MediaPipe work for all skin tones?** | Mostly yes, with caveats | Google tested FaceMesh across skin tones and it performs well. However, very dark skin in low lighting has higher landmark error rates. This is a known issue in computer vision. |
| **Does it work for all face shapes?** | Yes for detection, maybe not for scoring | MediaPipe finds landmarks on any face shape. But our THRESHOLDS (e.g., smile symmetry, brow tension) were calibrated on limited face types. A naturally asymmetric face might trigger false "forced smile" signals. |
| **Glasses, beards, hijab?** | Partial support | Glasses: works but may interfere with eye tracking accuracy. Thick beards: jaw landmarks less reliable. Hijab/headscarf: works fine for face landmarks — FaceMesh only needs the face visible. |

### Accent and Language

| Concern | Status | What We Know |
|:---|:---|:---|
| **Does STT work for all accents?** | No — accuracy varies significantly | Web Speech API (browser STT) is most accurate for American and British English. Indian English, Nigerian English, Southern US accents — all get more transcription errors. This directly affects filler word detection accuracy. |
| **Non-English speakers?** | Limited | Filler words are language-specific. "Um" in English is "euh" in French, "eto" in Japanese. Our word list is English-only in v1. |
| **Speaking style differences** | Not accounted for | Some cultures speak faster or slower by default. Our 130-160 WPM "optimal" range is based on Western public speaking norms. |

### What We Should Do About It

1. **Be transparent** — show users a note: "This system was tested primarily with American English speakers. Accuracy may vary with other accents."
2. **Let users calibrate** — a 30-second calibration phase where the system learns the user's baseline (their normal pace, their typical eye contact, their default facial expression)
3. **Never present scores as absolute truth** — always frame as "relative to your baseline" not "objectively good/bad"
4. **Don't build a filler word list for languages you haven't tested** — better to say "unsupported" than to give wrong results

This isn't something to "fix in v2." Bias awareness should be part of v1 design.

---

## Skills You Already Have (from ExamGuard)

| Detection | ExamGuard Equivalent | Reuse Level |
|:---|:---|:---|
| Facial landmarks | MediaPipe FaceLandmarker | **Direct reuse** — same library, same points |
| Eye contact | Gaze detection (iris tracking) | **Direct reuse** — same code logic |
| Blink rate | Talking detection (mouth cycles) | **Pattern reuse** — same cycle-counting approach |
| Expression analysis | Head direction + scoring | **Concept reuse** — same distance-to-score pattern |

## Skills You Need to Learn (NEW)

| Detection | What's New | Which Phase |
|:---|:---|:---|
| Speech-to-Text | Converting audio to text in real-time | Phase 2 |
| NLP pattern matching | Analyzing text for linguistic patterns | Phase 4 |
| Audio frequency analysis | Measuring pitch, volume from raw audio | Phase 2 |
| AI API integration | Sending multimodal data to Claude API | Phase 5 |
| Real-time dashboard | Live updating UI with multiple data sources | Phase 5 |

---

## Quick Summary

| Question | Answer |
|:---|:---|
| How many detections? | 6 core + 1 optional (AI deep analysis) |
| Main technology? | MediaPipe FaceMesh (face) + Speech-to-Text (voice) + Pattern Matching (text) |
| What's reused from ExamGuard? | Face landmarks, iris tracking, blink detection, scoring pattern |
| What's new? | Speech-to-text, NLP, audio analysis, AI API, real-time dashboard |
| Why not use AI for everything? | Too slow and expensive for real-time. Use AI periodically (v2), rules for real-time. |
