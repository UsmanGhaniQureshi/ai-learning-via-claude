# Pose Estimation — Tracking Body Language for Cheating Detection

## What Is This?

Pose estimation detects the position of a person's body parts in an image or video — head, shoulders, elbows, wrists, hips, knees, ankles. It draws a "skeleton" over the person, showing exactly how their body is positioned.

```
What the camera sees:          What pose estimation outputs:
                                        O         (head)
  [photo of student]                   /|\        (shoulders, torso)
                                      / | \
                                     /  |  \      (arms)
                                        |
                                       / \        (legs)
                                      /   \

  17 keypoints detected:
    Nose: (150, 30)
    Left Shoulder: (120, 80)
    Right Shoulder: (180, 80)
    Left Elbow: (90, 140)
    Right Wrist: (210, 180)    ← hand reaching toward neighbor!
    ...
```

---

## WHY This Is Critical for ExamGuard

**Body language reveals cheating that cameras cannot catch from faces alone.**

Think about it: a student can look at their own paper while their hand slides a chit to their neighbor. Face analysis sees "looking at paper = normal." But pose estimation sees "hand moving toward the next desk = suspicious."

### Cheating Behaviors Detected by Pose Estimation:

| Body Movement | What It Means | Pose Detection |
|---------------|--------------|----------------|
| Hand extends toward neighbor | Passing/receiving a chit | Wrist position moves past shoulder width |
| Head turns > 45 degrees | Looking at neighbor's paper | Head keypoint shifts relative to shoulders |
| Body leans sideways | Trying to see neighbor's answer | Shoulder line tilts, torso angle changes |
| Hand goes under desk repeatedly | Using hidden phone | Wrist drops below desk level, returns up |
| Student turns fully around | Signaling or copying from behind | Shoulder orientation reverses |
| Both hands hidden for long time | Using phone or notes under desk | Both wrists below desk plane |

### ExamGuard Pose Pipeline:

```
Camera frame
      |
      v
Pose estimation model (17 keypoints per student)
      |
      v
Track keypoints over time (30 frames = 1 second)
      |
      v
Analyze movement patterns:
  - "Right wrist moved 200px toward neighbor over 2 seconds"
  - "Head turned 60 degrees to the left for 8 seconds"
  - "Body leaning 30 degrees toward neighbor's desk"
      |
      v
Combine signals:
  Head turned + Body leaning + Hand extended = CHEATING (92% confidence)
```

---

## Models for Pose Estimation

| Model | Speed | Accuracy | Best For |
|-------|-------|----------|----------|
| **MediaPipe Pose** | Very fast | Good | **Start here — easiest to use** |
| OpenPose | Slow | Great | Multi-person, research |
| MoveNet | Fast | Good | Real-time, TensorFlow |
| YOLOv8 Pose | Fast | Great | Already using YOLO |
| HRNet | Slow | Best | Highest accuracy needed |

**Recommendation:** Start with **MediaPipe Pose** for learning. Use **YOLOv8 Pose** for ExamGuard production (since you are already using YOLO for object detection).

---

## The 17 Body Keypoints

```
Keypoint Map (COCO format):

             0: Nose
            / \
    1: L Eye   2: R Eye
    3: L Ear   4: R Ear
           |
    5: L Shoulder---6: R Shoulder
           |              |
    7: L Elbow        8: R Elbow
           |              |
    9: L Wrist       10: R Wrist
           |
   11: L Hip --------12: R Hip
           |              |
   13: L Knee        14: R Knee
           |              |
   15: L Ankle       16: R Ankle
```

**For ExamGuard, the most important keypoints are:**
- **Nose + Eyes (0, 1, 2):** Head direction — where are they looking?
- **Shoulders (5, 6):** Body orientation — are they turned toward a neighbor?
- **Wrists (9, 10):** Hand position — are they passing something?
- **Elbows (7, 8):** Arm extension — reaching toward another desk?

---

## Pose Estimation with MediaPipe

```python
import mediapipe as mp
import cv2

# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
mp_draw = mp.solutions.drawing_utils

cap = cv2.VideoCapture(0)

with mp_pose.Pose(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
) as pose:

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Convert to RGB (MediaPipe needs RGB)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Detect pose
        results = pose.process(rgb)

        # Draw skeleton
        if results.pose_landmarks:
            mp_draw.draw_landmarks(
                frame,
                results.pose_landmarks,
                mp_pose.POSE_CONNECTIONS  # Draw lines connecting keypoints
            )

            # Access specific keypoints
            landmarks = results.pose_landmarks.landmark

            nose = landmarks[mp_pose.PoseLandmark.NOSE]
            left_wrist = landmarks[mp_pose.PoseLandmark.LEFT_WRIST]
            right_wrist = landmarks[mp_pose.PoseLandmark.RIGHT_WRIST]
            left_shoulder = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER]
            right_shoulder = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER]

            # Print positions (normalized 0-1)
            h, w = frame.shape[:2]
            print(f"Nose: ({int(nose.x*w)}, {int(nose.y*h)})")
            print(f"L Wrist: ({int(left_wrist.x*w)}, {int(left_wrist.y*h)})")
            print(f"R Wrist: ({int(right_wrist.x*w)}, {int(right_wrist.y*h)})")

        cv2.imshow('Pose Estimation', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
```

---

## Detecting Suspicious Movements

### Example 1: Hand Reaching Toward Neighbor

```python
def check_hand_reaching(landmarks, frame_width):
    """Check if either hand extends past the shoulder line (reaching toward neighbor)."""
    left_shoulder_x = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER].x * frame_width
    right_shoulder_x = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER].x * frame_width
    left_wrist_x = landmarks[mp_pose.PoseLandmark.LEFT_WRIST].x * frame_width
    right_wrist_x = landmarks[mp_pose.PoseLandmark.RIGHT_WRIST].x * frame_width

    shoulder_width = abs(right_shoulder_x - left_shoulder_x)

    # If wrist extends more than 1.5x shoulder width from center → reaching
    center_x = (left_shoulder_x + right_shoulder_x) / 2

    left_reach = abs(left_wrist_x - center_x) > shoulder_width * 1.5
    right_reach = abs(right_wrist_x - center_x) > shoulder_width * 1.5

    if left_reach or right_reach:
        return True, "Hand extending toward neighbor"
    return False, "Normal"
```

### Example 2: Head Turn Detection

```python
import math

def check_head_turn(landmarks, frame_width):
    """Check if head is turned significantly (looking at neighbor)."""
    nose_x = landmarks[mp_pose.PoseLandmark.NOSE].x * frame_width
    left_shoulder_x = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER].x * frame_width
    right_shoulder_x = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER].x * frame_width

    # Center of shoulders
    shoulder_center = (left_shoulder_x + right_shoulder_x) / 2
    shoulder_width = abs(right_shoulder_x - left_shoulder_x)

    # How far is nose from shoulder center?
    nose_offset = (nose_x - shoulder_center) / shoulder_width

    if abs(nose_offset) > 0.3:  # Head turned more than 30% off-center
        direction = "left" if nose_offset < 0 else "right"
        return True, f"Head turned {direction}"
    return False, "Looking forward"
```

### Example 3: Body Lean Detection

```python
def check_body_lean(landmarks, frame_height):
    """Check if body is leaning sideways (toward neighbor's desk)."""
    left_shoulder_y = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER].y * frame_height
    right_shoulder_y = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER].y * frame_height

    shoulder_diff = abs(left_shoulder_y - right_shoulder_y)

    # If shoulders are not level (difference > 5% of frame height)
    if shoulder_diff > frame_height * 0.05:
        direction = "left" if left_shoulder_y > right_shoulder_y else "right"
        return True, f"Body leaning {direction}"
    return False, "Sitting upright"
```

---

## Tracking Movements Over Time

A single suspicious frame is not cheating. Sustained suspicious behavior IS cheating. You need to track over time.

```python
from collections import deque
import time

# Store last 30 frames of analysis (1 second at 30fps)
movement_history = deque(maxlen=30)

def analyze_behavior_over_time(landmarks, frame_size):
    """Analyze sustained suspicious behavior."""
    w, h = frame_size

    # Check current frame
    hand_suspicious, hand_msg = check_hand_reaching(landmarks, w)
    head_suspicious, head_msg = check_head_turn(landmarks, w)
    lean_suspicious, lean_msg = check_body_lean(landmarks, h)

    # Score this frame (0 = normal, 1-3 = suspicious)
    frame_score = sum([hand_suspicious, head_suspicious, lean_suspicious])
    movement_history.append(frame_score)

    # Calculate average suspicion over last second
    if len(movement_history) >= 15:  # Need at least 0.5 seconds of data
        avg_score = sum(movement_history) / len(movement_history)

        if avg_score > 2.0:
            return "CHEATING", avg_score, f"{hand_msg}, {head_msg}, {lean_msg}"
        elif avg_score > 1.0:
            return "SUSPICIOUS", avg_score, f"{hand_msg}, {head_msg}, {lean_msg}"

    return "NORMAL", 0, "Normal behavior"
```

---

## YOLOv8 Pose (Alternative — Recommended for Production)

Since ExamGuard already uses YOLO for object detection, using YOLOv8 Pose means one model handles both.

```python
from ultralytics import YOLO
import cv2

# Load YOLOv8 Pose model
model = YOLO('yolov8n-pose.pt')

cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Detect poses
    results = model(frame, verbose=False)

    # Access keypoints for each detected person
    for result in results:
        if result.keypoints is not None:
            for person_keypoints in result.keypoints.data:
                # person_keypoints shape: (17, 3) → 17 keypoints, each with (x, y, confidence)
                nose = person_keypoints[0]         # (x, y, conf)
                left_wrist = person_keypoints[9]
                right_wrist = person_keypoints[10]

                print(f"Nose: ({nose[0]:.0f}, {nose[1]:.0f}) conf: {nose[2]:.2f}")

    # Draw results
    annotated = results[0].plot()
    cv2.imshow('YOLOv8 Pose', annotated)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

---

## Mini Project: Real-Time Pose Detection with Skeleton Overlay

**Goal:** Detect your body pose from webcam in real time, draw the skeleton, and display which direction you are leaning.

```python
import mediapipe as mp
import cv2
import math

mp_pose = mp.solutions.pose
mp_draw = mp.solutions.drawing_utils
mp_styles = mp.solutions.drawing_styles

cap = cv2.VideoCapture(0)

with mp_pose.Pose(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
) as pose:

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb)

        status = "No person detected"
        color = (200, 200, 200)

        if results.pose_landmarks:
            # Draw skeleton with styled connections
            mp_draw.draw_landmarks(
                frame,
                results.pose_landmarks,
                mp_pose.POSE_CONNECTIONS,
                mp_styles.get_default_pose_landmarks_style()
            )

            landmarks = results.pose_landmarks.landmark

            # --- Analyze pose ---
            # 1. Head direction
            nose_x = landmarks[mp_pose.PoseLandmark.NOSE].x
            l_shoulder_x = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER].x
            r_shoulder_x = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER].x
            shoulder_center = (l_shoulder_x + r_shoulder_x) / 2
            head_offset = nose_x - shoulder_center

            if head_offset < -0.05:
                head_dir = "Looking LEFT"
            elif head_offset > 0.05:
                head_dir = "Looking RIGHT"
            else:
                head_dir = "Looking CENTER"

            # 2. Body lean
            l_shoulder_y = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER].y
            r_shoulder_y = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER].y
            shoulder_diff = l_shoulder_y - r_shoulder_y

            if shoulder_diff > 0.03:
                lean_dir = "Leaning LEFT"
            elif shoulder_diff < -0.03:
                lean_dir = "Leaning RIGHT"
            else:
                lean_dir = "Upright"

            # 3. Hand position
            l_wrist_x = landmarks[mp_pose.PoseLandmark.LEFT_WRIST].x
            r_wrist_x = landmarks[mp_pose.PoseLandmark.RIGHT_WRIST].x
            shoulder_width = abs(r_shoulder_x - l_shoulder_x)

            hand_status = "Hands normal"
            if abs(l_wrist_x - shoulder_center) > shoulder_width * 1.5:
                hand_status = "LEFT hand extended!"
            if abs(r_wrist_x - shoulder_center) > shoulder_width * 1.5:
                hand_status = "RIGHT hand extended!"

            # Display analysis
            cv2.putText(frame, f'Head: {head_dir}', (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f'Body: {lean_dir}', (10, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f'Hands: {hand_status}', (10, 90),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            # Overall assessment
            suspicious_count = sum([
                'LEFT' in head_dir or 'RIGHT' in head_dir,
                'Leaning' in lean_dir,
                'extended' in hand_status
            ])

            if suspicious_count >= 2:
                status = "SUSPICIOUS BEHAVIOR"
                color = (0, 0, 255)
            elif suspicious_count == 1:
                status = "Slightly unusual"
                color = (0, 165, 255)
            else:
                status = "Normal"
                color = (0, 255, 0)

        cv2.putText(frame, status, (10, h - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)

        cv2.imshow('Pose Analysis', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
```

### What to Try:
1. Sit normally — should show "Normal"
2. Turn your head left/right — should detect head turn
3. Lean to one side — should detect body lean
4. Extend your arm out — should detect hand extension
5. Combine multiple movements — should flag "SUSPICIOUS"

### What You Will Learn:
- Real-time body keypoint detection
- Drawing skeleton overlays on video
- Calculating body angles and positions from keypoints
- Building rule-based behavior analysis from pose data
- The exact logic ExamGuard uses for body language cheating detection

---

## Key Takeaway

Pose estimation gives ExamGuard the ability to read body language. While face detection tells you WHO the student is and gaze estimation tells you WHERE they are looking, pose estimation tells you WHAT their body is doing. Passing chits, reaching toward neighbors, leaning to copy — all of these are body movements that pose estimation can detect and flag in real time.
