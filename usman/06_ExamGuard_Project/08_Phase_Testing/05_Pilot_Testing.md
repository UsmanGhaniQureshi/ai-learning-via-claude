# Pilot Testing — Testing in a REAL Exam

## What Is This?

All the testing so far has been in controlled conditions — your lab, your friends acting, your test videos. But a real exam is different.

**Pilot testing** means running ExamGuard during an ACTUAL exam, with REAL students, to see how it performs in the real world.

But you do NOT go from zero to full deployment. You take careful, measured steps.

---

## WHY Lab Testing Is Not Enough

```
In the lab:
- You control lighting, camera angles, and student behavior
- You know who is "cheating" (you told them to act)
- There are 5-10 people, not 200
- It runs for 15 minutes, not 3 hours
- No real consequences if something goes wrong

In a real exam:
- Lighting changes throughout the day
- Real cheating is subtle and unpredictable
- 200 students with 200 different behaviors
- Must run for 3 hours without issues
- A mistake could affect a student's academic career
```

**You MUST test in real conditions before trusting the system.**

---

## The Three Phases of Pilot Testing

### Phase 1: Shadow Mode (Weeks 1-4)

**What:** The system runs during a real exam, but NO alerts are sent to anyone. The AI records what it WOULD have flagged, and you compare with what the human invigilators actually caught.

```
Setup:
  - 1 exam hall, 1-2 cameras
  - ExamGuard runs silently in the background
  - Invigilators do their job as usual (they don't even know about the AI yet)
  - AI logs all detections to a file

After the exam:
  Compare two lists:
  1. What did ExamGuard flag?
  2. What did invigilators report?

  Results show:
  ┌──────────────────────────────────────────────────────────────┐
  │ ExamGuard flagged, Invigilator also caught    = TRUE POSITIVE│
  │ ExamGuard flagged, Invigilator did not catch   = Check video │
  │ ExamGuard missed, Invigilator caught           = FALSE NEG   │
  │ ExamGuard missed, Invigilator also missed      = Unknown     │
  └──────────────────────────────────────────────────────────────┘
```

**Key question:** Does ExamGuard find things invigilators miss?

```python
# Shadow mode logging
import json
from datetime import datetime

shadow_log = []

def shadow_detect(frame, camera_id):
    """Run detection but do NOT send alerts. Just log."""
    result = ai_pipeline(frame)

    if result.confidence > 0.5:  # Would have been flagged
        entry = {
            'timestamp': datetime.now().isoformat(),
            'camera_id': camera_id,
            'detection_type': result.detection_type,
            'seat': result.seat,
            'confidence': result.confidence,
            'alert_sent': False,  # Shadow mode: no alert sent
            'note': 'Shadow mode - detection only'
        }
        shadow_log.append(entry)

        # Save frame as evidence
        save_frame(frame, f"shadow_{len(shadow_log)}.jpg")

# After exam: save the log
with open('shadow_results.json', 'w') as f:
    json.dump(shadow_log, f, indent=2)
```

### Phase 2: Assisted Mode (Weeks 5-8)

**What:** The system sends alerts to a SEPARATE screen (not the main invigilator dashboard). A researcher watches and notes whether each alert is correct.

```
Setup:
  - Same hall, 2-4 cameras
  - ExamGuard sends alerts to a research laptop
  - A researcher (not the invigilator) watches alerts
  - Invigilator continues their normal job
  - After exam: Researcher reviews each alert with the invigilator

Why separate screen?
  - Invigilators are not disrupted
  - If the system sends 50 false alarms, it does not affect the exam
  - Researcher can calibrate thresholds in real-time
```

**What to measure:**
```
Metric                     Target     Actual
──────────────────────────────────────────────
True positive rate         > 80%      ___%
False positive rate        < 10%      ___%
Alert latency              < 5 sec    ___ sec
Alerts per hour            5-15       ___
System uptime              > 99%      ___%
Camera disconnections      0          ___
```

### Phase 3: Live Mode (Weeks 9-12)

**What:** The system is integrated with the actual invigilator dashboard. Alerts go directly to the invigilator. This is the REAL deployment.

```
Setup:
  - Full hall, 4-5 cameras
  - ExamGuard alerts appear on invigilator's screen
  - Invigilator uses ExamGuard + their own observation
  - Every alert is marked as "confirmed" or "dismissed"
  - Feedback is used to improve the model

Rules for live mode:
  1. Invigilator reviews EVERY alert — AI never acts alone
  2. High false alarm rate? → Increase threshold immediately
  3. Any system issue? → Fall back to manual monitoring
  4. After each exam: Review all alerts with the exam committee
```

---

## The Pilot Testing Checklist

### Before the Pilot

```
[ ] System tested in lab for at least 20 hours continuously
[ ] All edge cases from the edge case file have been addressed
[ ] Camera placement verified — every seat visible
[ ] Network tested — sufficient bandwidth for all cameras
[ ] UPS installed — 30 minutes battery backup
[ ] Fallback plan ready — manual invigilators on standby
[ ] Ethics approval obtained from institution
[ ] Student consent forms ready
[ ] Data handling procedures documented
[ ] Incident response plan written (what if something goes wrong?)
```

### During the Pilot

```
[ ] Arrive 1 hour early to set up and test cameras
[ ] Verify all cameras are online
[ ] Run health check on all systems
[ ] Start recording 15 minutes before exam
[ ] Monitor system performance throughout
[ ] Log any issues in real-time
[ ] Have a "kill switch" — ability to shut down AI instantly
[ ] Human invigilators present as backup at all times
```

### After the Pilot

```
[ ] Collect all logs and detection results
[ ] Review every alert with invigilator
[ ] Calculate accuracy metrics (TP, FP, FN, TN)
[ ] Identify false alarms — why did they happen?
[ ] Identify missed detections — why were they missed?
[ ] Collect invigilator feedback (interview)
[ ] Collect student feedback (optional survey)
[ ] Document all findings in a report
[ ] Plan improvements for next pilot
```

---

## The Feedback Loop

The most important part of pilot testing: EVERY mistake the AI makes teaches it to be better.

```
Pilot Exam 1:
  AI flags student scratching head → Dismissed by invigilator
  Lesson: Add "scratching" to normal behaviors
  Fix: Retrain model with more scratching examples

Pilot Exam 2:
  AI misses student with hidden earpiece → Invigilator catches it
  Lesson: Earpiece is hard to detect visually
  Fix: Add ear-touching pattern to anomaly detector

Pilot Exam 3:
  AI correctly flags phone under desk → Invigilator confirms
  Lesson: The model works for this scenario!
  Note: No change needed, keep this capability

Pilot Exam 4:
  AI floods invigilator with 40 alerts in 1 hour
  Lesson: Threshold is too sensitive
  Fix: Increase confidence threshold from 0.6 to 0.75
```

```python
# After each pilot, track improvements
pilot_results = {
    'pilot_1': {
        'date': '2026-03-15',
        'exams_monitored': 1,
        'total_alerts': 23,
        'true_positives': 5,
        'false_positives': 15,
        'false_negatives': 3,
        'precision': 0.25,     # Only 25% of alerts were real ← BAD
        'recall': 0.63,        # Caught 63% of cheating ← Needs work
        'notes': 'Too many false alarms. Threshold too low.'
    },
    'pilot_2': {
        'date': '2026-03-22',
        'exams_monitored': 2,
        'total_alerts': 12,
        'true_positives': 7,
        'false_positives': 4,
        'false_negatives': 1,
        'precision': 0.64,     # 64% of alerts were real ← BETTER
        'recall': 0.88,        # Caught 88% of cheating ← Good
        'notes': 'Improved after threshold adjustment and retraining.'
    },
    'pilot_3': {
        'date': '2026-03-29',
        'exams_monitored': 3,
        'total_alerts': 8,
        'true_positives': 6,
        'false_positives': 2,
        'false_negatives': 1,
        'precision': 0.75,     # 75% of alerts were real ← GOOD
        'recall': 0.86,        # Caught 86% of cheating ← Good
        'notes': 'System is stabilizing. Ready for broader deployment.'
    }
}
```

---

## Scaling Up After Pilot

```
Pilot success → Gradual scale-up:

Month 1-2:  1 hall, 2 cameras, shadow mode
Month 3-4:  1 hall, 4 cameras, assisted mode
Month 5-6:  1 hall, 4 cameras, live mode
Month 7-8:  3 halls, 12 cameras, live mode
Month 9-10: 10 halls, 40 cameras, live mode
Month 11+:  Full deployment, all halls

NEVER jump from 1 hall to full deployment.
Each step should have at least 3 successful exams before scaling up.
```

---

## Reporting Template

After each pilot exam, fill out this report:

```
ExamGuard Pilot Report
─────────────────────

Date: ___________
Exam: ___________
Hall: ___________
Duration: ___ hours
Cameras: ___
Students: ___
Mode: Shadow / Assisted / Live

Performance Metrics:
  Total alerts:         ___
  True positives:       ___
  False positives:      ___
  False negatives:      ___
  Precision:            ___%
  Recall:               ___%
  False alarm rate:     ___%
  Average alert latency: ___ seconds
  System uptime:        ___%

Issues Encountered:
  1. _______________
  2. _______________

Invigilator Feedback:
  _______________

Improvements for Next Pilot:
  1. _______________
  2. _______________

Recommendation:
  [ ] Ready for next phase
  [ ] Needs more testing at current phase
  [ ] Significant issues — address before continuing
```

---

## Key Takeaways

1. **Shadow mode first** — run silently, compare with human invigilators, no risk
2. **Never go from lab to live** — always shadow mode, then assisted, then live
3. **Every mistake is a learning opportunity** — false alarms and misses both teach the system
4. **Scale gradually** — 1 hall, then 3, then 10, then all
5. **Always have a fallback** — human invigilators must be present throughout pilot
6. **Document everything** — metrics, feedback, issues, improvements
7. **3 successful exams before scaling** — do not rush the process
