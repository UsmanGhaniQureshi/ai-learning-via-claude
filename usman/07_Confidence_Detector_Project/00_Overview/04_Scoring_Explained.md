# How the Confidence Score Actually Works

> **This is the most important document in the project.** If you understand how the score is calculated, you understand the entire system. Every detection engine, every threshold, every UI element exists to feed this score.

---

## The Big Picture in One Sentence

We measure three things — your **face**, your **words**, and your **voice** — give each a score out of 100, then combine them with weights into one final number.

```
Final Confidence Score = (Face Score x 0.40) + (Speech Score x 0.35) + (Voice Score x 0.25)
```

That's it. Everything else is detail about how each sub-score is calculated.

---

## WHY These Three Scores?

### Watch the Human: How Does a Real Presentation Coach Score You?

A professional coach watches a presenter and mentally tracks three separate channels:

| Channel | What They Notice | How Important |
|:---|:---|:---|
| **Face** | "Are they making eye contact? Do they look relaxed or tense? Are they smiling naturally?" | Very — it's the first thing the audience sees |
| **Words** | "Are they saying 'um' every 5 seconds? Do they sound sure of their facts? Do they finish sentences?" | Very — it's what the audience REMEMBERS |
| **Voice** | "Is their voice steady or shaky? Are they speaking at a comfortable pace? Can I hear them clearly?" | Important — but less than face and words |

Our three scores match these three channels exactly.

### WHY These Weights? (0.40 / 0.35 / 0.25)

| Score | Weight | WHY This Weight |
|:---|:---|:---|
| **Face: 0.40** | Highest | Body language is 55% of communication (Mehrabian's research). Eye contact is the #1 signal audiences use to judge confidence. It's also what we detect most reliably (MediaPipe blendshapes are accurate). |
| **Speech: 0.35** | Second | What you SAY is the lasting impression. Filler words and hedging are concrete, countable signals. Pattern matching gives us reliable detection. But it only works when the person is speaking (not useful during pauses). |
| **Voice: 0.25** | Lowest | Voice tone matters, but it's the HARDEST to measure accurately in a browser. Pitch detection via FFT has noise. Volume depends on mic distance. We weight it lower because our measurement confidence is lower. |

**Honest note:** These weights are starting heuristics, NOT scientific constants. After testing with real users, we may discover that speech matters more than face for certain presentation styles. The weights should be tuned based on real data.

### WHY NOT Equal Weights (0.33 / 0.33 / 0.33)?

Equal weights assume all three signals are equally reliable AND equally important. They're not:

| Signal | Detection Reliability | Audience Impact |
|:---|:---|:---|
| Face (blendshapes) | High — MediaPipe is well-tested | High — first impression |
| Speech (pattern matching) | Medium — misses context ("I like pizza" counted as filler) | High — lasting memory |
| Voice (FFT in browser) | Lower — mic quality varies, ambient noise | Medium — supporting signal |

Giving voice equal weight to face would let a noisy microphone swing the score too much.

---

## How Each Score is Calculated (with Real Numbers)

### Face Score (0-100)

The face score starts at a **baseline of 45** and gets adjusted up or down based on what we detect:

```
Face Score = 45 (baseline)
           + Expression adjustment  (-20 to +25)
           + Eye contact adjustment (-15 to +20)
           + Blink rate adjustment  (-10 to 0)
           + Posture adjustment     (-12 to +8)
           + Fidget adjustment      (-10 to 0)
           + Hand gesture adjustment (0 to +7)
```

#### Expression: What Your Face is Doing

We use MediaPipe's **52 face blendshapes** — pre-computed scores that tell us exactly what each part of the face is doing. The key ones:

| Blendshape | What It Measures | Threshold | Meaning |
|:---|:---|:---|:---|
| `mouthSmileLeft + mouthSmileRight` | Average smile amount | > 0.08 | Smiling — confident signal |
| `mouthFrownLeft + mouthFrownRight` | Frown + `mouthPressLeft/Right` (lip press) | frown > 0.12 AND press > 0.08 | Tense — stress signal |
| `browInnerUp` + `eyeWideLeft/Right` | Brow raised + eyes wide | brow > 0.25 AND wide > 0.15 | Worried — anxiety signal |
| `jawOpen` | Mouth opening amount | > 0.02 | Speaking — active presenting (positive) |

**WHY blendshapes instead of measuring distances ourselves?**

We actually tried manual distance calculations first (measuring pixel distances between landmarks). It failed badly:
- Our "smile detection" gave negative scores when people smiled (mouth opening shifted the center point)
- "Tense" triggered on every normal resting face (lip distance threshold was too tight)
- Thresholds that worked on one person failed on another

Blendshapes solved this because MediaPipe's model was trained on millions of faces. It already knows what a smile looks like across different face shapes, sizes, and lighting conditions. We just read the pre-computed score.

| Approach | Our Experience | Verdict |
|:---|:---|:---|
| **Manual distance math** | Failed — smile gave negative scores, tense triggered on resting faces | Abandoned |
| **MediaPipe blendshapes** | Works — `mouthSmileLeft > 0.08` reliably detects smiles | Using this |
| **Emotion classifier (FER)** | Not tested — research shows 40-60% accuracy on subtle expressions | Too unreliable |

#### Expression Score Adjustments

| Expression | Adjustment | WHY |
|:---|:---|:---|
| Smiling | +25 | Genuine smile is the strongest single confidence signal |
| Speaking | +15 | Actively presenting is positive (mouth moving = engaged) |
| Neutral | 0 | Default state — not good or bad |
| Worried | -10 | Mild negative — could be concentrating |
| Tense | -20 | Strong negative — visible stress |

#### Eye Contact: Looking at the Camera

We use blendshape gaze directions:

```
eyeLookDownLeft/Right  → how much looking down
eyeLookUpLeft/Right    → how much looking up
eyeLookInLeft/Right    → how much looking inward
eyeLookOutLeft/Right   → how much looking outward

If the STRONGEST gaze direction score is below 0.55 → looking at camera
If above 0.55 → looking away
```

**WHY 0.55 and not 0.5?**

We tested with real video. At 0.4 (our first try), a person looking straight at a laptop camera was flagged as "looking down" — because laptop cameras are slightly below eye level. 0.55 gives tolerance for normal camera angles.

| Eye Contact % | Score Adjustment | WHY |
|:---|:---|:---|
| > 80% | +20 | Excellent — strong connection with audience |
| 60-80% | +12 | Good — natural pattern (look, think, look back) |
| 30-60% | +5 | Acceptable — might be reading notes occasionally |
| < 15% | -15 | Poor — avoiding audience, reading everything |

#### Blink Rate

Normal: 15-20 blinks/minute. Nervous: 25+/minute. Very anxious: 35+/minute.

We detect blinks using the `eyeBlinkLeft/Right` blendshape. When the score jumps from below 0.3 to above 0.5, that's one blink.

| Blink Rate | Adjustment | WHY |
|:---|:---|:---|
| < 25/min | 0 | Normal — no penalty |
| 25-35/min | -5 | Slightly elevated — mild stress signal |
| > 35/min | -10 | High — anxiety indicator |

#### Posture (from Pose Landmarks)

MediaPipe Pose Landmarker detects shoulder positions.

| Posture | Adjustment | Detection Method |
|:---|:---|:---|
| Upright | +8 | Shoulder tilt < 0.06 AND width normal |
| Tilted | -5 | Shoulder tilt > 0.06 (one shoulder noticeably higher) |
| Slouching | -12 | Shoulder width very small (far from camera, hunched) |

#### Fidgeting

We track shoulder and wrist positions across frames. Movement rate above a threshold = fidgeting.

| Fidget Score | Adjustment | Detection |
|:---|:---|:---|
| < 25 | 0 | Normal movement |
| 25-50 | -5 | Noticeable fidgeting |
| > 50 | -10 | Excessive movement — distracting |

**Subtlety we handle:** Moving hands to GESTURE is positive (hand_position = "raised/gesturing" gives +7). Moving hands nervously is negative (fidget > 50 gives -10). Same body part, different meaning based on HOW it moves.

---

### Speech Score (0-100)

The speech score analyzes the TEXT from speech-to-text:

```
Speech Score = 100 (start perfect)
             - Filler penalty     (0 to -40)
             - Hedge penalty      (0 to -30)
             - Repetition penalty (0 to -15)
             - Pace penalty       (0 to -15)
```

#### Filler Words

**What counts as a filler and WHY:**

| Filler | WHY It's a Filler | Can It Be a Real Word? |
|:---|:---|:---|
| um, uh, uhh, ah, er, hmm | Pure verbal pauses — zero meaning in any context | No — always fillers |
| like | "It was, like, really good" = filler. "I like pizza" = real word | Yes — we accept ~15% false positives |
| basically, actually, literally | Used as verbal padding: "So basically, the thing is..." | Sometimes meaningful, usually padding |
| you know, I mean | Filler phrases: "You know, the data shows..." | Almost always fillers in presentations |
| sort of, kind of, okay so | Softening/opening phrases with no content | Usually fillers |

**Filler penalty formula:**

```
filler_rate = total_fillers / total_words x 100

Penalty = filler_rate x 5 (capped at 40)

Examples:
  2 fillers in 100 words = 2% rate → penalty = 10
  5 fillers in 100 words = 5% rate → penalty = 25
  8 fillers in 100 words = 8% rate → penalty = 40 (max)
```

**WHY cap at 40?** Because fillers are NOT the only speech signal. Even with terrible filler usage, your hedging, pace, and repetitions also matter. If fillers alone could take the score to 0, the other signals would be meaningless.

#### Hedging Phrases

| Hedge Phrase | WHY It Shows Low Confidence |
|:---|:---|
| "I think", "I believe", "I feel like" | Presenting opinion as uncertain instead of fact |
| "maybe", "probably", "perhaps" | Weak modifiers — sounds unsure |
| "sort of", "kind of", "a little bit" | Downplaying your own statement |
| "I'm not sure", "I could be wrong" | Explicitly saying you lack confidence |
| "sorry", "sorry but" | Apologizing for having something to say |

**Hedge penalty:** Each hedge phrase costs 3 points (capped at 30).

**WHY is the cap lower than fillers?** Because some hedging is appropriate. A scientist SHOULD say "I believe the data suggests..." — that's intellectual honesty, not low confidence. We penalize quantity, not existence.

#### Repetitions

```
Penalty = repetition_count x 5 (capped at 15)
```

Repetitions ("the the main point") show lost train of thought. Less impactful than fillers because they're less frequent.

#### Pace

| WPM | Penalty | WHY |
|:---|:---|:---|
| 130-160 | 0 | Optimal — natural, comfortable pace |
| 100-130 or 160-180 | -5 | Slightly off — could be natural variation |
| < 100 or > 180 | -15 | Problematic — hesitating or rushing |

---

### Voice Score (0-100)

The voice score analyzes the raw audio signal:

```
Voice Score = based on:
  - Volume consistency (is voice steady or fading?)
  - Pitch variation (monotone vs natural variation vs shaky)
  - Silence ratio (appropriate pauses vs lost for words)
```

**WHY this is weighted lowest (0.25):**

Browser-based audio analysis has limitations:
- Mic quality varies wildly between devices
- Background noise affects readings
- Browser FFT has lower precision than dedicated audio tools
- Distance from mic changes volume independent of confidence

We use voice as a **supporting signal**, not a primary one. If face and speech say "confident" but voice says "shaky," the score drops slightly — not dramatically.

---

## Complete Walkthrough: Real Example

**Scenario:** A presenter gives a 2-minute practice session.

### What the System Observes

**Face (over 2 minutes):**
- Expression: speaking 60% of time, neutral 30%, smiling 10%
- Eye contact: 75% looking at camera
- Blink rate: 22/min (normal)
- Posture: upright throughout
- Fidgeting: score 15 (minimal)
- Hand gestures: occasional (raised 20% of time)

**Speech (transcript analysis):**
- 280 words spoken in 2 minutes = 140 WPM (optimal)
- 6 fillers found: "um" (3), "like" (2), "basically" (1)
- Filler rate: 6/280 = 2.1%
- 2 hedging phrases: "I think", "kind of"
- 0 repetitions

**Voice:**
- Volume: steady, slight drop at end of sentences
- Pitch: natural variation, no shakiness
- Silence ratio: 15% (appropriate pauses)

### How the Score is Calculated

**Step 1: Face Score**

```
Baseline:                          45
Expression (mostly speaking):     +15
Eye contact (75%):                +12
Blink rate (22/min, normal):       +0
Posture (upright):                 +8
Fidgeting (15, minimal):           +0
Hand gestures (occasional):        +3
                                 ────
Face Score:                        83
```

**Step 2: Speech Score**

```
Starting:                         100
Filler penalty (2.1% x 5):       -10
Hedge penalty (2 x 3):            -6
Repetition penalty (0):            +0
Pace penalty (140 WPM, optimal):   +0
                                 ────
Speech Score:                      84
```

**Step 3: Voice Score**

```
Volume (steady):                   85
Pitch (natural variation):         80
Silence ratio (appropriate):       90
                                 ────
Voice Score (average):             85
```

**Step 4: Combined Final Score**

```
Final = (Face x 0.40) + (Speech x 0.35) + (Voice x 0.25)
      = (83 x 0.40)   + (84 x 0.35)    + (85 x 0.25)
      = 33.2           + 29.4            + 21.25
      = 83.85
      ≈ 84
```

**Verdict: 84 = "Confident"** — This presenter has good eye contact, minimal fillers, steady voice. Room to improve: reduce the 6 fillers and 2 hedges.

---

## "What Should the Score Be?" Decision Table

Test your understanding. Read the scenario, guess the score, then check.

| # | Face | Speech | Voice | Expected Score | WHY |
|:---|:---|:---|:---|:---|:---|
| 1 | Smiling, 90% eye contact, upright | 0 fillers, direct statements, 145 WPM | Steady, clear | **90+** | Everything positive — highly confident |
| 2 | Neutral, 80% eye contact, upright | 3 fillers (1.5%), 1 hedge, 140 WPM | Steady | **78-82** | Good overall, minor filler issue |
| 3 | Neutral, 40% eye contact, upright | 0 fillers, 135 WPM | Steady | **65-70** | Good speech but poor eye contact drags face score down |
| 4 | Tense, 30% eye contact, tilted | 10 fillers (5%), 5 hedges, 190 WPM | Shaky, fast | **25-35** | Multiple stress signals across all three channels |
| 5 | Smiling, 85% eye contact | 8 fillers (4%), 4 hedges, 180 WPM | Slightly fast | **55-65** | Face says confident but speech says nervous — mixed signals |
| 6 | Neutral, 70% eye contact | No speech (silent video) | No audio | **65-73** | Face-only scoring — no speech or voice data |
| 7 | Neutral, 90% eye contact, gesturing | 1 filler, 0 hedges, 150 WPM | Perfect | **85-90** | Great across all channels, gestures help |
| 8 | Worried, 20% eye contact, slouching | 15 fillers (7.5%), 8 hedges, 85 WPM | Monotone, quiet | **15-25** | Everything signals low confidence |
| 9 | Speaking, 60% eye contact | 4 fillers (2%), 2 hedges, 165 WPM | Slightly fast | **65-72** | Decent but room for improvement everywhere |
| 10 | Smiling, 95% eye contact, gesturing | 2 fillers (0.8%), 0 hedges, 150 WPM | Confident, varied | **92-95** | Near-perfect presentation delivery |

---

## How to Tune the Weights

The weights (0.40 / 0.35 / 0.25) are starting values. Here's how to improve them:

### Step 1: Record 5-10 Test Sessions

Record yourself presenting with DIFFERENT confidence levels:
- One session where you TRY to be confident
- One session where you deliberately add lots of "ums"
- One session where you avoid eye contact
- One session at normal comfort level

### Step 2: Score Each Session by Human Judgment

Watch each recording and rate it 0-100 yourself. Be honest.

### Step 3: Compare Human Score vs System Score

| Session | Human Says | System Says | Gap |
|:---|:---|:---|:---|
| Confident attempt | 82 | 78 | -4 (close!) |
| Lots of ums | 35 | 55 | +20 (system too generous) |
| No eye contact | 40 | 60 | +20 (system too generous) |
| Normal | 65 | 68 | +3 (close!) |

### Step 4: Adjust Weights to Close the Gap

If the system is too generous on "lots of ums" → increase Speech weight.
If the system is too generous on "no eye contact" → increase Face weight or adjust eye contact penalty.

**This is the real path to accuracy.** No amount of theoretical weight-choosing beats testing with real data.

---

## Smoothing: Why the Score Doesn't Jump Around

Without smoothing, the score would change every frame — jumping from 72 to 45 to 81 in one second. That looks broken.

**Analogy: Weather Forecast**

A weather app doesn't say "It's 25 degrees! Now it's 23! Now it's 26!" every minute. It smooths the data: "Today will be around 24-25 degrees."

We use **Exponential Moving Average (EMA)**:

```
New displayed score = (0.3 x latest reading) + (0.7 x previous displayed score)
```

This means:
- 70% of the score comes from where it WAS (stability)
- 30% comes from the new reading (responsiveness)

**Example:**

```
Frame 1: Raw score = 75 → Displayed: 75 (first reading)
Frame 2: Raw score = 60 → Displayed: (0.3 x 60) + (0.7 x 75) = 18 + 52.5 = 70.5 ≈ 71
Frame 3: Raw score = 80 → Displayed: (0.3 x 80) + (0.7 x 71) = 24 + 49.7 = 73.7 ≈ 74
Frame 4: Raw score = 50 → Displayed: (0.3 x 50) + (0.7 x 74) = 15 + 51.8 = 66.8 ≈ 67
```

Instead of jumping 75→60→80→50, the displayed score moves 75→71→74→67. Much smoother, still responsive to real changes.

---

## Common Scoring Mistakes to Watch For

| Mistake | What Goes Wrong | How to Fix |
|:---|:---|:---|
| "Score is always 50-60" | Neutral expression + decent eye contact + no speech = baseline score | This is correct! Not presenting = moderate score. Score should only be high when ACTIVELY presenting well. |
| "Score jumps wildly" | No smoothing applied, or smoothing factor too low | Apply EMA with 0.7 stability factor |
| "Smiling person gets low score" | Lots of fillers in speech override the face signal | Check speech analysis — the COMBINED score is what matters |
| "Silent person gets high score" | Only face score active (no speech/voice data) | When speech is unavailable, show "Face only" label and don't claim overall confidence |
| "Score is too high for nervous person" | Weights favor face too much and person looks calm but sounds terrible | Test with deliberate filler-heavy sessions, tune Speech weight up |
| "Score drops when looking down briefly" | Eye contact window too short, single glance down tanks the score | Increase rolling window (we use last 30 readings — about 1 second) |

---

## Score Labels

| Score Range | Label | Color | What It Means |
|:---|:---|:---|:---|
| 85-100 | Highly Confident | Bright Green | Excellent delivery — ready for any audience |
| 70-84 | Confident | Green | Strong presentation — minor areas to polish |
| 50-69 | Moderate | Yellow | Decent but noticeable room for improvement |
| 25-49 | Developing | Orange | Multiple confidence signals need work |
| 0-24 | Low Confidence | Red | Significant nervousness across all channels |

---

## Mini Summary

- **Three scores:** Face (0.40 weight), Speech (0.35), Voice (0.25)
- **Face uses blendshapes** — 52 pre-computed facial action scores from MediaPipe, NOT manual distance math (we tried that, it failed)
- **Speech uses pattern matching** — count fillers and hedges against word lists. Fast, free, runs locally
- **Voice is weighted lowest** because browser audio analysis is the least reliable
- **Smoothing (EMA)** prevents the score from jumping around — 70% stability + 30% new reading
- **Tune with real data** — record yourself, compare human judgment to system score, adjust weights
- **These weights are starting heuristics** — not final truth. Real accuracy comes from testing.
