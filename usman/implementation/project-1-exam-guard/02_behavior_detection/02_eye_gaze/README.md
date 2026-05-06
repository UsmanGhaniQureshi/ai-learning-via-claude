# Task 02: Eye Gaze — Where Exactly Are the Eyes Looking?

## Why Eye Gaze After Head Direction?

Head direction tells us: "Head is turned left." But a student can keep their head FORWARD and move ONLY their eyes to peek at a neighbor's paper. Head direction misses this. Eye gaze catches it.

```
Scenario 1: Head turned left → Head Direction catches it ✅
Scenario 2: Head forward, eyes looking left → Head Direction MISSES ❌
             → Eye Gaze catches it ✅
```

Combined: Head Direction + Eye Gaze = catches almost all "looking at neighbor" cases.

## How It Works

MediaPipe Face Landmarker gives us iris (eye pupil) positions. We track WHERE the iris is relative to the eye:

```
Eye shape:  [left corner ---- iris ---- right corner]

Iris centered:     [----O----]  → Looking FORWARD (normal)
Iris shifted left: [--O------]  → Looking LEFT (suspicious)
Iris shifted right:[------O--]  → Looking RIGHT (suspicious)
```

We calculate the ratio: how far the iris is from center of the eye.

## What You'll See

- Dots on both irises tracking in real-time
- Direction indicator: "Eyes: CENTER / LEFT / RIGHT"
- Combined with head direction for overall verdict
- GREEN = eyes on paper, RED = eyes wandering

## New Concepts

| Concept | What it means |
|---------|-------------|
| **Iris** | The colored part of your eye (pupil area). MediaPipe tracks its center point. |
| **Eye Aspect Ratio** | Width vs height of eye opening. Used to detect if eyes are open. |
| **Gaze ratio** | How far iris is from center of eye. 0 = centered, -1 = full left, +1 = full right. |
| **Combined detection** | Using BOTH head direction + eye gaze together for more accurate results. |

## Next step

After this works → Task 03: Body Turning (shoulder rotation detection)
