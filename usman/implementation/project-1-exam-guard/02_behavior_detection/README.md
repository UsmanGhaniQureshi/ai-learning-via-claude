# Module 02: Behavior Detection

> **Goal:** Detect cheating BEHAVIORS — not just objects. This is the core of ExamGuard.

## What We're Detecting

| Behavior | How a human spots it | How AI spots it | Tool |
|----------|---------------------|-----------------|------|
| Looking away from paper | Head pointing sideways/up | Head angle > threshold | MediaPipe Face Mesh |
| Looking at neighbor's paper | Eyes/head directed toward another desk | Gaze direction + head angle | MediaPipe Face + Iris |
| Turning body toward neighbor | Shoulders rotated toward side | Shoulder angle | MediaPipe Pose |
| Talking/whispering | Lips moving, jaw movement | Mouth landmarks changing | MediaPipe Face Mesh |

## How MediaPipe Works

MediaPipe is Google's pre-trained model that tracks **face landmarks** (468 points on your face) and **body landmarks** (33 points on your body). ZERO training needed — just download and use.

```
Your face → MediaPipe → 468 points mapped:
  - Nose tip position → which direction is head pointing
  - Eye iris position → where are you looking
  - Lip corners + jaw → is mouth open/moving (talking?)

Your body → MediaPipe → 33 points mapped:
  - Left shoulder + Right shoulder → body rotation angle
  - Head position relative to shoulders → leaning toward neighbor?
```

## Task Order

| Task | What We Build | What We Learn |
|------|-------------- |---------------|
| 01_head_direction | Detect if head points: down (paper), left, right, up | Face landmarks, angles, thresholds |
| 02_eye_gaze | Detect where eyes are looking | Iris tracking, gaze estimation |
| 03_body_turning | Detect if body rotates toward neighbor | Pose landmarks, shoulder angles |
| 04_talking_detection | Detect mouth movement (talking/whispering) | Lip landmark distances, motion detection |
| 05_combine_all | Merge all detectors → single "suspicious score" | Multi-signal combination, alert logic |

## End Result

After all 5 tasks, the system will output for each frame:

```
Frame 1234:
  Head direction:  LEFT (looking away from paper) ⚠️
  Eye gaze:        Toward neighbor's desk ⚠️
  Body rotation:   Normal ✅
  Talking:         No ✅
  Overall:         SUSPICIOUS (2 out of 4 flags)
```
