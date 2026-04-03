# Task 04: Filter Only Phones — Ignore Everything Else

## The Problem

In Task 03, YOLO detected EVERYTHING — your face, chair, laptop, phone, cup. For ExamGuard, we only care about **phones**. Everything else is noise.

## What we're doing

We add a **filter** that checks each detection:

```
YOLO says: "person 92%"    → Is it a phone? NO  → ignore
YOLO says: "chair 78%"     → Is it a phone? NO  → ignore
YOLO says: "cell phone 87%" → Is it a phone? YES → DRAW THE BOX!
YOLO says: "laptop 90%"    → Is it a phone? NO  → ignore
```

We also add a **confidence threshold** — only show detections above a certain percentage:

```
"cell phone 87%" → Above 50%? YES → Show it
"cell phone 35%" → Above 50%? NO  → Probably a false alarm, ignore
```

## New concepts

| Concept | What it means |
|---------|-------------|
| **Filtering by class** | Only keeping detections of a specific object type (phone) |
| **Confidence threshold** | Minimum confidence % to count as a real detection |
| **False positive** | YOLO says "phone" but there's actually no phone (mistake) |
| **False negative** | There IS a phone but YOLO doesn't detect it (miss) |
| **Threshold tradeoff** | Higher threshold = fewer false alarms BUT might miss real phones |

## The threshold tradeoff (important!)

```
Threshold = 30%  → Catches almost all phones BUT many false alarms
Threshold = 50%  → Good balance — catches most phones, few false alarms
Threshold = 80%  → Very few false alarms BUT might miss phones at bad angles
Threshold = 95%  → Almost no false alarms BUT misses many real phones
```

For ExamGuard, we start with **50%** and adjust based on testing.

## Next step

After filtering works → Task 05: Add alert system (beep + save screenshot)
