# Task 05: Alert System — Beep + Save Evidence

## The Problem

We can detect phones now, but what good is detection if nobody gets alerted? We need:

1. **Visual alert** — screen flashes red border when phone detected
2. **Sound alert** — beep sound plays
3. **Evidence** — save a screenshot with timestamp when phone is detected
4. **Cooldown** — don't beep 30 times per second! Alert once, then wait before alerting again

## What we're building

```
Phone detected?
  ├── YES → Has it been more than 5 seconds since last alert?
  │         ├── YES → ALERT! (beep + red border + save screenshot)
  │         └── NO  → Just show red box, no beep (cooldown active)
  └── NO  → Green status: "No phones detected"
```

## New concepts

| Concept | What it means |
|---------|-------------|
| **Cooldown** | Minimum time between alerts. Prevents beeping every frame (30 times/sec!). |
| **Timestamp** | Current date+time added to screenshot filename so each is unique. |
| **Evidence folder** | A folder where all detection screenshots are saved. |
| **winsound.Beep()** | Windows function that makes the computer beep. |

## After this task

You'll have a COMPLETE phone detector that:
- Watches webcam in real-time
- Detects only phones (ignores everything else)
- Alerts with sound when phone is found
- Saves timestamped screenshot evidence
- Has configurable cooldown and threshold

**That's ExamGuard v0.1!**
