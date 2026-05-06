# Module 01: Phone Detection

> **Goal:** Detect phones on exam desks using a webcam in real-time.

## How We're Building This

| Task | What We Do | What We Learn |
|------|-----------|---------------|
| 01_setup | Create environment, install packages | Virtual environments, requirements.txt, Jupyter |
| 02_test_yolo | Load YOLO, test on one photo | What YOLO is, how pre-trained models work, the 10-photo test |
| 03_live_webcam | Run YOLO on live webcam feed | Real-time detection, processing video frames, FPS |
| 04_phone_only_filter | Ignore everything except phones | Filtering detections, confidence thresholds, reducing false alarms |
| 05_alert_system | Beep/highlight when phone detected | Building alert logic, saving evidence, logging events |

## The Thinking Behind This Order

```
Task 01: Can I set up my tools?          → Environment works
Task 02: Can YOLO see a phone at all?    → Yes, pre-trained model works
Task 03: Can it see phones in real-time? → Yes, webcam feed works
Task 04: Can it ONLY alert on phones?    → Yes, filtered out chairs/people
Task 05: Can it ALERT me properly?       → Yes, beeps + saves screenshot
```

Each task builds on the previous one. If any task fails, we fix it before moving on.

## End Result

After all 5 tasks, you'll have a working phone detector that:
- Watches through your webcam
- Detects phones in real-time
- Ignores everything else (people, chairs, laptops)
- Alerts you when a phone is spotted
- Saves a screenshot as evidence
