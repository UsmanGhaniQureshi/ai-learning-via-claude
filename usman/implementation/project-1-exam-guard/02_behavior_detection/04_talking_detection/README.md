# Task 04: Talking/Whispering Detection

## The Idea

In an exam, students shouldn't be talking. If their mouth is moving, they're either:
- Talking to a neighbor (cheating)
- Whispering answers
- Reading aloud to themselves (less suspicious but still flaggable)

## How It Works

MediaPipe Face Landmarker gives us lip landmarks. We measure the distance between upper and lower lip:

```
Mouth closed: Upper lip ═══════ Lower lip  (distance = small)
Mouth open:   Upper lip
                         (gap)
              Lower lip                     (distance = large)
Talking:      Distance keeps CHANGING rapidly (open-close-open-close)
```

Key insight: **A single open mouth = yawning. Rapid open-close = talking.**

We track mouth distance over time. If it changes rapidly (up-down-up-down), that's talking.

## Detection Logic

```
1. Measure lip distance each frame
2. Track if distance is CHANGING (not just open or closed)
3. Count how many open-close cycles happen in last 2 seconds
4. More than 3 cycles = probably talking
5. Score increases with number of cycles
```

## New Concepts

| Concept | What it means |
|---------|-------------|
| **Lip landmarks** | Points on upper and lower lip edges |
| **Mouth Aspect Ratio (MAR)** | Height / width of mouth opening. Higher = more open. |
| **Motion detection** | Not just "is mouth open?" but "is mouth CHANGING?" |
| **Cycle counting** | Open→close = 1 cycle. Many cycles = talking. |
