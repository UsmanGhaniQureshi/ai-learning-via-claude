# Task 05: Combine ALL Detectors — ExamGuard v0.1 Complete

## What This Does

One single system running ALL 4 detectors on every camera frame:

| Detector | What it catches | Source |
|----------|----------------|--------|
| Head Direction | Head turned left/right/up | Face Landmarker |
| Eye Gaze | Eyes peeking sideways | Face Landmarker (iris) |
| Body Turning | Shoulders rotated | Pose Landmarker |
| Talking | Mouth moving rapidly | Face Landmarker (lips) |

## Combined Scoring (0-100)

| Signal | Max Points | Why this weight |
|--------|-----------|-----------------|
| Head turned | 35 | Obvious signal, could be stretching |
| Eyes peeking | 30 | Strong cheating signal |
| Body rotated | 15 | Confirms intent |
| Talking | 20 | Clear rule violation |

```
Score 0-20:   ALL CLEAR (green)
Score 20-40:  MILD WARNING (yellow) — quick glance or stretch
Score 40-65:  SUSPICIOUS (orange) — likely cheating
Score 65-100: HIGH ALERT (red) — definitely cheating
```

## This is ExamGuard v0.1!

After this task, you have a working cheating detector that:
- Detects head turning
- Catches eye peeking (even with head forward)
- Spots body rotation toward neighbor
- Flags talking/whispering
- Gives a combined suspicion score
- All from a single webcam, no training needed

Next step: Web app (upload video or live feed in browser)
