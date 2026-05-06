# Task 03: Body Turning + Combined Detection (Head + Eyes + Body)

## Why Body Turning?

A smart cheater might:
- Keep head forward (beats head detection)
- Keep eyes centered (beats eye gaze)
- But ROTATE their whole body/shoulders toward neighbor

Body turning catches this. MediaPipe Pose tracks shoulder positions — if one shoulder is closer to the camera than the other, the body is rotated.

```
Student cheating methods vs what catches them:

Method 1: Turn head to look           → HEAD detection catches ✅
Method 2: Peek with eyes only         → EYE GAZE catches ✅
Method 3: Rotate body toward neighbor → BODY TURNING catches ✅
Method 4: All three combined          → ALL THREE catch ✅✅✅
```

## How Body Turning Works

MediaPipe Pose gives us shoulder positions:

```
Normal (facing forward):
  Left shoulder ●─────────● Right shoulder
  (both at same distance from camera)

Turned RIGHT (toward right neighbor):
  Left shoulder ●───● Right shoulder
  (left shoulder appears further away = smaller on screen)
  (right shoulder appears closer = larger on screen)
```

We calculate: difference in shoulder positions. Big difference = body is rotated.

## This Notebook Combines ALL THREE

Instead of running 3 separate notebooks, this one runs:
1. Head Direction (from Task 01)
2. Eye Gaze (from Task 02)
3. Body Turning (NEW)

All on the same camera frame, same screen, one combined score.

## The Combined Scoring

| Signal | Weight | Why |
|--------|--------|-----|
| Head turned | 30 points | Easy to detect, could be stretching |
| Eyes peeking | 40 points | Hard to fake, strong cheating signal |
| Body rotated | 30 points | Confirms intent, not just a glance |

```
Score 0-20:   ALL CLEAR (green)
Score 20-50:  MILD WARNING (yellow) — might be stretching
Score 50-70:  SUSPICIOUS (orange) — probably cheating
Score 70-100: HIGH ALERT (red) — definitely cheating
```

## Next step

After this → Task 04: Talking detection → Task 05: Combine all + web app
