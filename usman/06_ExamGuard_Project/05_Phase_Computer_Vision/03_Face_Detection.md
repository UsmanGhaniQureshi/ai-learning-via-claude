# Face Detection and Recognition — Know WHO Is Where

## What Is This?

Face detection and recognition is the ability to:
1. **Find faces** in an image or video (detection)
2. **Identify whose face** it is (recognition)

These are two separate tasks:

```
Face DETECTION:   "There are 30 faces in this exam hall frame"
                  (Finds the faces, draws boxes around them)

Face RECOGNITION: "Face at Seat 5 belongs to Student: Ahmed Khan, Roll #2245"
                  (Matches the face to a known identity)
```

You need both for ExamGuard.

---

## WHY This Matters for ExamGuard

ExamGuard needs to know **WHO** is sitting **WHERE** at all times.

### Before the Exam:
```
Registration Phase:
  1. Each student sits at their assigned seat
  2. Camera captures their face
  3. System stores: "Face #2245 = Ahmed Khan, Seat 5, Hall A"

Database after registration:
  Face #2245 → Ahmed Khan, Seat 5
  Face #2246 → Sara Ali, Seat 6
  Face #2247 → Hassan Raza, Seat 7
  ... (all 30 students)
```

### During the Exam:
```
Real-time monitoring:
  Camera frame → Detect all faces → Match each face to database

  Seat 5 face matches Ahmed Khan ✓ (correct student in correct seat)
  Seat 6 face matches Sara Ali ✓
  Seat 7 face does NOT match anyone ✗ → ALERT: Unknown person!
  Seat 12 face matches student assigned to Seat 18 ✗ → ALERT: Wrong seat!
```

### ExamGuard Uses Face Detection For:

| Use Case | What Happens |
|----------|-------------|
| Attendance | Automatically mark who is present (no manual roll call) |
| Seat verification | Confirm each student is in their assigned seat |
| Impersonation detection | Someone taking exam for another student → caught |
| Tracking individuals | When cheating detected, system knows exactly WHO |
| Evidence | "Student Ahmed Khan (Roll #2245) was flagged at 10:23 AM" |

---

## Two Parts Explained

### Part 1: Face Detection — Finding the Face

Face detection locates faces in an image and returns their position (bounding box).

```
Input image of exam hall:
  +----------------------------------+
  |                                  |
  |   [face1]     [face2]  [face3]  |
  |                                  |
  |   [face4]     [face5]  [face6]  |
  |                                  |
  +----------------------------------+

Output:
  Face 1: position (50, 30) to (100, 90)
  Face 2: position (180, 25) to (230, 85)
  Face 3: position (310, 35) to (360, 95)
  Face 4: position (55, 170) to (105, 230)
  Face 5: position (185, 165) to (235, 225)
  Face 6: position (315, 175) to (365, 235)
```

### Part 2: Face Recognition — Identifying the Person

Face recognition takes a detected face and compares it to a database of known faces.

```
Detected face at Seat 5
        |
        v
Convert face to 128 numbers (face encoding)
  [0.12, -0.34, 0.56, 0.78, ..., -0.23]
        |
        v
Compare to all stored face encodings
  Ahmed Khan:  distance = 0.3 (CLOSE MATCH!)
  Sara Ali:    distance = 0.9 (no match)
  Hassan Raza: distance = 0.8 (no match)
        |
        v
Result: "This is Ahmed Khan" (distance < 0.6 threshold)
```

---

## Libraries for Face Detection/Recognition

| Library | Best For | Speed | Accuracy | Difficulty |
|---------|----------|-------|----------|------------|
| face_recognition | Quick start, simplest API | Medium | Good | Easy |
| dlib | Precise landmarks, reliable | Medium | Great | Medium |
| MediaPipe Face | Real-time, mobile | Fast | Good | Easy |
| InsightFace | Production, highest accuracy | Fast | Best | Medium |
| OpenCV Haar | Legacy, very fast | Very fast | OK | Easy |

**Recommendation:** Start with `face_recognition` library (built on dlib). Move to InsightFace for production.

---

## Face Detection with face_recognition Library

```python
import face_recognition
import cv2

# Load an image
image = face_recognition.load_image_file('exam_hall.jpg')

# Find all faces in the image
face_locations = face_recognition.face_locations(image)

print(f"Found {len(face_locations)} faces")

# Draw boxes around each face
image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
for (top, right, bottom, left) in face_locations:
    cv2.rectangle(image_bgr, (left, top), (right, bottom), (0, 255, 0), 2)

cv2.imshow('Detected Faces', image_bgr)
cv2.waitKey(0)
```

## Face Recognition — Matching to Known People

```python
import face_recognition
import cv2
import os
import numpy as np

# ===== Step 1: Register known students =====
known_faces = {}  # name → face encoding

# Load each student's photo
student_photos = {
    'Ahmed Khan': 'students/ahmed_khan.jpg',
    'Sara Ali': 'students/sara_ali.jpg',
    'Hassan Raza': 'students/hassan_raza.jpg',
}

for name, photo_path in student_photos.items():
    image = face_recognition.load_image_file(photo_path)
    encoding = face_recognition.face_encodings(image)[0]  # 128-number encoding
    known_faces[name] = encoding
    print(f"Registered: {name}")

print(f"\nTotal registered students: {len(known_faces)}")

# ===== Step 2: Identify faces in exam frame =====
exam_frame = face_recognition.load_image_file('exam_frame.jpg')

# Find all faces and their encodings
face_locations = face_recognition.face_locations(exam_frame)
face_encodings = face_recognition.face_encodings(exam_frame, face_locations)

# Convert for drawing
frame_bgr = cv2.cvtColor(exam_frame, cv2.COLOR_RGB2BGR)

known_names = list(known_faces.keys())
known_encodings = list(known_faces.values())

for (top, right, bottom, left), encoding in zip(face_locations, face_encodings):
    # Compare this face to all known faces
    distances = face_recognition.face_distance(known_encodings, encoding)
    best_match_idx = np.argmin(distances)

    if distances[best_match_idx] < 0.6:  # Threshold for match
        name = known_names[best_match_idx]
        confidence = 1 - distances[best_match_idx]
        color = (0, 255, 0)  # Green for known student
    else:
        name = "UNKNOWN"
        confidence = 0
        color = (0, 0, 255)  # Red for unknown person

    # Draw box and label
    cv2.rectangle(frame_bgr, (left, top), (right, bottom), color, 2)
    cv2.putText(frame_bgr, f'{name} ({confidence:.0%})',
                (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX,
                0.6, color, 2)

cv2.imshow('Face Recognition', frame_bgr)
cv2.waitKey(0)
```

---

## Face Landmarks — Understanding Facial Features

Face landmarks are specific points on a face (68 or 468 points depending on the model):

```
Standard 68 landmarks:
  - Jaw line: 17 points
  - Left eyebrow: 5 points
  - Right eyebrow: 5 points
  - Nose: 9 points
  - Left eye: 6 points
  - Right eye: 6 points
  - Mouth: 20 points
```

**ExamGuard uses landmarks for:**
- **Gaze estimation:** Eye landmarks show where the student is looking
- **Head pose:** Which direction the head is turned
- **Expression analysis:** Nervous/stressed expression patterns

```python
import face_recognition
import cv2

image = face_recognition.load_image_file('student_face.jpg')
landmarks = face_recognition.face_landmarks(image)

for face in landmarks:
    # face is a dictionary of facial features
    print("Left eye points:", face['left_eye'])
    print("Right eye points:", face['right_eye'])
    print("Nose tip:", face['nose_tip'])

    # Draw landmarks on image
    image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    for feature_name, points in face.items():
        for point in points:
            cv2.circle(image_bgr, point, 2, (0, 255, 0), -1)

    cv2.imshow('Landmarks', image_bgr)
    cv2.waitKey(0)
```

---

## MediaPipe Face Detection (Faster, Real-Time)

For real-time processing with multiple cameras, MediaPipe is faster:

```python
import mediapipe as mp
import cv2

mp_face = mp.solutions.face_detection
mp_draw = mp.solutions.drawing_utils

cap = cv2.VideoCapture(0)

with mp_face.FaceDetection(min_detection_confidence=0.5) as face_detection:
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Convert to RGB (MediaPipe needs RGB)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Detect faces
        results = face_detection.process(rgb)

        # Draw detections
        if results.detections:
            for detection in results.detections:
                mp_draw.draw_detection(frame, detection)

                # Get confidence
                confidence = detection.score[0]
                print(f"Face detected: {confidence:.1%} confidence")

        cv2.imshow('MediaPipe Face Detection', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
```

---

## ExamGuard Face System — Complete Architecture

```
BEFORE EXAM (Registration):
  Student walks in → Camera captures face → Generate encoding → Store in database
  Result: Database of 30 face encodings + names + seat assignments

DURING EXAM (Monitoring):
  Every 5 seconds:
    Camera frame → Detect all faces → Generate encodings → Match to database

    For each detected face:
      Match found?
        YES → Student identified → Check correct seat → All good ✓
        NO  → ALERT: Unknown person in exam hall!

      Face at wrong seat?
        → ALERT: Student in wrong seat (possible impersonation)

      Expected face missing for 2+ minutes?
        → ALERT: Student may have left hall

AFTER EXAM (Evidence):
  All face detections logged with timestamps
  "Ahmed Khan was at Seat 5 from 9:00 AM to 12:00 PM"
  "Unknown face detected at Seat 12 at 10:23 AM — evidence clip saved"
```

---

## Mini Project: Attendance System

**Goal:** Build a system that detects who walks in front of the camera and marks them as present.

```python
import face_recognition
import cv2
import numpy as np
from datetime import datetime

# ===== Register known people =====
# Take a few photos of yourself and friends/family
# Save in a folder: known_people/name.jpg

import os

known_faces = {}
known_dir = 'known_people'

for filename in os.listdir(known_dir):
    if filename.endswith(('.jpg', '.png')):
        name = os.path.splitext(filename)[0]
        image = face_recognition.load_image_file(os.path.join(known_dir, filename))
        encodings = face_recognition.face_encodings(image)
        if encodings:
            known_faces[name] = encodings[0]
            print(f"Registered: {name}")

print(f"\nTotal registered: {len(known_faces)} people")

# ===== Run attendance system =====
attendance = {}  # name → first seen time
cap = cv2.VideoCapture(0)

known_names = list(known_faces.keys())
known_encodings = list(known_faces.values())

print("\nAttendance system running... Press 'q' to quit and see results.")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Process every 3rd frame for speed
    small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
    rgb_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

    # Detect and encode faces
    face_locations = face_recognition.face_locations(rgb_small)
    face_encodings = face_recognition.face_encodings(rgb_small, face_locations)

    for (top, right, bottom, left), encoding in zip(face_locations, face_encodings):
        # Scale back up (we shrunk the frame by 0.5)
        top *= 2; right *= 2; bottom *= 2; left *= 2

        # Match face
        distances = face_recognition.face_distance(known_encodings, encoding)

        if len(distances) > 0:
            best_idx = np.argmin(distances)
            if distances[best_idx] < 0.6:
                name = known_names[best_idx]
                color = (0, 255, 0)

                # Record attendance
                if name not in attendance:
                    attendance[name] = datetime.now().strftime('%H:%M:%S')
                    print(f"PRESENT: {name} at {attendance[name]}")
            else:
                name = "Unknown"
                color = (0, 0, 255)
        else:
            name = "Unknown"
            color = (0, 0, 255)

        # Draw
        cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
        cv2.putText(frame, name, (left, top - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

    # Show attendance count
    cv2.putText(frame, f'Present: {len(attendance)}/{len(known_faces)}',
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)

    cv2.imshow('Attendance System', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

# ===== Print attendance report =====
print("\n" + "=" * 40)
print("ATTENDANCE REPORT")
print("=" * 40)
for name, time in attendance.items():
    print(f"  {name}: Present (arrived {time})")

absent = set(known_faces.keys()) - set(attendance.keys())
for name in absent:
    print(f"  {name}: ABSENT")

print(f"\nTotal: {len(attendance)}/{len(known_faces)} present")
```

### What You Will Learn:
- How face encodings work (converting a face to 128 numbers)
- Comparing face encodings to find matches
- Real-time face processing from webcam
- Building a practical face-based system
- The exact architecture ExamGuard uses for student identification

### Connection to ExamGuard:
This attendance system IS ExamGuard's face module. Replace "known_people" with "registered_students," add seat assignment checking, and you have ExamGuard's identity verification system.

---

## Key Takeaway

Face detection and recognition give ExamGuard the ability to answer "WHO is doing WHAT." Without it, ExamGuard can detect cheating behavior but cannot tell you which student was involved. This module connects detected behaviors to specific identities, making evidence actionable and accountability clear.
