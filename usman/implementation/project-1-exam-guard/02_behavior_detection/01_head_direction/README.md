# Task 01: Head Direction — Where Is the Student Looking?

## The Idea

In an exam, a student's head should point **DOWN** (looking at their paper). If their head is pointing **LEFT, RIGHT, or UP** for too long — that's suspicious.

## How It Works

MediaPipe Face Mesh gives us 468 points on the face. We only need 3 to figure out head direction:

```
Nose tip (point 1)     → where the face is pointing
Left eye corner (point 33)  → reference for left side
Right eye corner (point 263) → reference for right side
```

By comparing nose position relative to the eyes, we know which way the head is turned:

```
Nose centered between eyes  → facing FORWARD/DOWN (normal)
Nose shifted toward left eye → head turned LEFT (looking at neighbor?)
Nose shifted toward right eye → head turned RIGHT (looking at neighbor?)
Nose above eye level → head turned UP (looking away from paper)
```

## What You'll See

The webcam feed with:
- A colored indicator showing head direction
- GREEN = looking down/forward (normal)
- YELLOW = slightly turned (could be stretching)
- RED = turned significantly (suspicious)
- Timer counting how long head has been turned away

## New Concepts

| Concept | What it means |
|---------|-------------|
| **Face Mesh** | 468 invisible dots mapped onto your face |
| **Landmark** | One single point on the face (nose tip = landmark 1) |
| **Head pose** | Which direction the head is pointing (left/right/up/down) |
| **Threshold** | How much turn counts as "suspicious" (too strict = false alarms, too loose = misses) |
| **Duration** | How LONG the head stays turned. 2 seconds = stretching. 10 seconds = suspicious. |

## Next step

After this works → Task 02: Eye Gaze (where EXACTLY are the eyes looking)
