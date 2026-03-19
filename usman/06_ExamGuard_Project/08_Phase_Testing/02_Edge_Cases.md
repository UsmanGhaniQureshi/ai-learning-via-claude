# Edge Cases — When the Real World Breaks Your System

## What Is This?

An "edge case" is an unusual situation that your system was not designed for. In development, everything works perfectly because you control the conditions. In the real world, ANYTHING can happen.

**Edge cases are the #1 reason AI systems fail in production.** Your model is 95% accurate in the lab, but the real world throws situations it has never seen.

---

## WHY This Matters

```
Lab testing:
  - Perfect lighting
  - Camera at ideal angle
  - Students sitting normally
  - Clear view of all desks
  → 95% accuracy. Looks great!

Real exam:
  - Afternoon sun creates glare on camera 2
  - Camera 3's view is blocked by a pillar
  - A student has a broken arm (unusual posture)
  - Power flickers for 2 seconds
  - 50 students instead of the expected 30
  → System breaks in unexpected ways
```

---

## ExamGuard Edge Cases (And How to Handle Each One)

### Category 1: Camera and Hardware Issues

**Edge Case: Camera goes offline mid-exam**
```
What happens: Network cable loose, camera overheats, power supply fails
Impact: That section of the hall has NO monitoring
How to handle:
  1. Dashboard shows "Camera 3: OFFLINE" with red indicator
  2. System sends alert to admin: "Camera down, check hardware"
  3. Nearest cameras increase their monitoring of that area
  4. Log the offline period: "Camera 3 offline 14:23-14:31"
  5. After exam: Note that section had reduced monitoring
```

**Edge Case: Power cut during exam**
```
What happens: All cameras and servers lose power
Impact: Complete monitoring blackout
How to handle:
  1. UPS (Uninterruptible Power Supply) gives 15-30 minutes of backup
  2. System saves state to disk every 30 seconds
  3. On power restore: auto-restart, reconnect cameras, resume monitoring
  4. Log: "Power outage 14:45-14:52, monitoring gap"
  5. Alert invigilators: "Please increase manual monitoring"
```

**Edge Case: Network congestion**
```
What happens: Too many cameras overwhelm the network
Impact: Frames arrive late or get dropped
How to handle:
  1. Reduce frame rate during congestion (30fps → 10fps)
  2. Prioritize cameras with active alerts
  3. Edge processing reduces bandwidth needs
  4. Alert: "Network congestion detected, reduced monitoring quality"
```

### Category 2: Lighting and Environment

**Edge Case: Very dark room**
```
What happens: Camera image is too dark to see anything
Impact: AI cannot detect objects or faces
How to handle:
  1. Monitor average brightness of each frame
  2. If brightness < threshold: "Camera 4: Low light warning"
  3. Apply image enhancement (brightness, contrast adjustment)
  4. If enhancement is not enough: Alert invigilator to check lights
```

**Edge Case: Bright sunlight or glare**
```
What happens: Sun through window creates bright spots, washes out image
Impact: Part of the frame is unreadable
How to handle:
  1. Detect overexposed regions
  2. Apply HDR-like processing
  3. Alert: "Camera 2 has glare issue, rows 3-4 partially obscured"
  4. Recommend: Close blinds or reposition camera
```

**Edge Case: Camera view blocked**
```
What happens: Pillar, another student's head, or equipment blocks the view
Impact: Some seats are not visible
How to handle:
  1. During setup: Check every seat is visible from at least one camera
  2. Track "visibility map" — which cameras see which seats
  3. If a camera is blocked: Other cameras cover those seats
  4. Alert: "Seat B4 not visible from any camera"
```

### Category 3: Student Variations

**Edge Case: Student with disability**
```
What happens: Student in wheelchair, with crutches, or with mobility issues
  has different posture and movement patterns
Impact: Anomaly detection flags them as "unusual"
How to handle:
  1. Register known accommodations before exam
  2. Exclude registered students from anomaly detection
  3. Use only object detection for them (phone, notes — not posture)
  4. NEVER flag disability as suspicious behavior
  5. This is both ethical and legally required
```

**Edge Case: Identical twins in same exam**
```
What happens: Face recognition cannot tell them apart
Impact: Could mix up identities, wrong student gets flagged
How to handle:
  1. Use seat assignment, not face recognition, as primary ID
  2. Seat twins far apart
  3. Use additional identifiers (clothing, accessories)
  4. Note in system: "Students at A1 and D5 are twins"
```

**Edge Case: Student wearing face mask**
```
What happens: Cannot detect facial features or gaze direction
Impact: Gaze tracking fails, face identification fails
How to handle:
  1. Fall back to body pose and hand tracking only
  2. Increase weight on object detection (phones, notes)
  3. Log: "Student at C3 wearing mask — reduced gaze tracking"
  4. Consider: Is the mask policy-allowed or itself suspicious?
```

**Edge Case: Student wearing hijab, hat, or sunglasses**
```
What happens: Partial face occlusion affects face and gaze detection
Impact: Reduced accuracy on face-based features
How to handle:
  1. System must work with partial face visibility
  2. Rely more on body pose and hand movement when face is occluded
  3. NEVER flag religious clothing as suspicious
  4. Test the system with diverse head coverings during development
```

**Edge Case: Very fidgety or anxious student**
```
What happens: Student constantly moves, looks around, shifts in seat
Impact: Anomaly detection flags constant movement as suspicious
How to handle:
  1. Build a per-student baseline in the first 10 minutes of exam
  2. "This student always fidgets" → normal FOR THEM
  3. Anomaly = deviation from THEIR OWN pattern, not class average
  4. Reduce sensitivity for students with high baseline movement
```

### Category 4: Exam Variations

**Edge Case: Group project or open-book exam**
```
What happens: Students are ALLOWED to talk, share materials, use books
Impact: All normal cheating indicators trigger false alarms
How to handle:
  1. Configurable exam modes: "Strict", "Open Book", "Group Work"
  2. Open Book mode: Disable book/paper detection
  3. Group Work mode: Disable gaze and communication detection
  4. Only keep active: Phone detection, unauthorized device detection
```

**Edge Case: Exam with calculator or approved device**
```
What happens: Students have electronic devices that look like phones
Impact: False detection of "phones" that are actually calculators
How to handle:
  1. Pre-register approved devices
  2. Train model to distinguish calculator from phone
  3. Add "approved device" class to YOLO training
  4. Reduce phone detection sensitivity when calculators are allowed
```

**Edge Case: Overcrowded exam hall**
```
What happens: More students than expected, desks very close together
Impact: Camera cannot separate individual students, gaze tracking fails
  because "looking at neighbor" = looking 30cm to the side
How to handle:
  1. Measure desk spacing during setup
  2. Adjust gaze threshold based on spacing
  3. If desks are < 1 meter apart: Increase gaze duration threshold
  4. Focus more on object detection than gaze tracking
```

### Category 5: System Issues

**Edge Case: AI model runs out of GPU memory**
```
What happens: Too many frames queued, memory fills up
Impact: System crashes or slows to a crawl
How to handle:
  1. Set maximum queue size (drop old frames, keep new ones)
  2. Monitor GPU memory every 10 seconds
  3. If memory > 90%: Reduce batch size, skip more frames
  4. If crash: Auto-restart within 5 seconds (Docker restart policy)
```

**Edge Case: Database disk full**
```
What happens: Evidence clips fill up the hard drive
Impact: Cannot save new alerts or evidence
How to handle:
  1. Monitor disk space continuously
  2. Alert at 80% full: "Disk space low, review evidence storage"
  3. At 95% full: Stop saving video clips, keep text alerts only
  4. Auto-cleanup: Delete evidence older than retention period
```

---

## Building an Edge Case Test Suite

```python
"""
Systematic edge case testing for ExamGuard.
Run each scenario and check if system handles it correctly.
"""

edge_case_tests = [
    {
        "name": "Camera disconnection",
        "setup": "Unplug camera 3 during test",
        "expected": "Dashboard shows offline status within 10 seconds",
        "pass_criteria": "No system crash, clear error message"
    },
    {
        "name": "Dark room",
        "setup": "Turn off lights, test with low-light camera feed",
        "expected": "Low-light warning, enhanced image processing",
        "pass_criteria": "Detection still works (reduced accuracy OK)"
    },
    {
        "name": "Rapid movement",
        "setup": "Student stands up quickly, waves arms",
        "expected": "Anomaly flagged but not classified as cheating",
        "pass_criteria": "Alert says 'unusual movement' not 'cheating'"
    },
    {
        "name": "Long running",
        "setup": "Run system for 3 hours with active cameras",
        "expected": "No memory leak, consistent performance",
        "pass_criteria": "FPS at hour 3 is within 10% of hour 1"
    },
    {
        "name": "High load",
        "setup": "Send 100 alerts per minute",
        "expected": "System handles load, dashboard responsive",
        "pass_criteria": "No alerts lost, dashboard updates within 2 seconds"
    },
]

for test in edge_case_tests:
    print(f"\n--- Test: {test['name']} ---")
    print(f"Setup: {test['setup']}")
    print(f"Expected: {test['expected']}")
    result = input("Did it pass? (y/n): ")
    test["result"] = "PASS" if result.lower() == 'y' else "FAIL"

# Summary
print("\n=== Edge Case Test Results ===")
for test in edge_case_tests:
    print(f"  {test['result']}: {test['name']}")
```

---

## The Golden Rule

For EVERY edge case, ask three questions:

```
1. What is the WORST thing that could happen?
   (System crashes? False accusation? Missed cheating?)

2. How likely is this scenario?
   (Common? Rare? Once in 100 exams?)

3. What is the GRACEFUL response?
   (Not "system crashes" but "system alerts and degrades safely")
```

---

## Key Takeaways

1. **Edge cases WILL happen** — plan for them, do not hope they will not occur
2. **Graceful degradation** — if something breaks, the system should degrade safely, not crash
3. **Student diversity is not an edge case** — it is NORMAL. The system must work for everyone
4. **Configurable exam modes** — not every exam has the same rules
5. **Document every edge case** — build a checklist, test before every deployment
6. **The real world is messy** — your lab is not. Test in real conditions early and often
