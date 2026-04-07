"""Face + Body Engine — Expression (blendshapes), eye contact, blink, posture, fidgeting."""
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
import math
import os
from collections import deque

FACE_MODEL = os.path.join(os.path.dirname(__file__), 'face_landmarker.task')
POSE_MODEL = os.path.join(os.path.dirname(__file__), 'pose_landmarker.task')


class FaceEngine:
    """Detects expressions (blendshapes), eye contact, blink rate, posture, fidgeting."""

    def __init__(self):
        # Face landmarker WITH blendshapes (52 direct facial action scores)
        self.face_lm = vision.FaceLandmarker.create_from_options(
            vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=FACE_MODEL),
                num_faces=1,
                output_face_blendshapes=True,
                min_face_detection_confidence=0.4,
                min_face_presence_confidence=0.4,
                running_mode=vision.RunningMode.IMAGE))

        # Pose landmarker for body language
        self.pose_lm = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=POSE_MODEL),
                num_poses=1,
                min_pose_detection_confidence=0.4,
                running_mode=vision.RunningMode.IMAGE))

        # Blink tracking
        self.blink_times = deque()
        self.prev_blink_val = 0
        self.BLINK_WINDOW = 60.0

        # Eye contact history
        self.eye_contact_hist = deque(maxlen=30)

        # Fidgeting: track shoulder/wrist positions over time
        self.pose_history = deque(maxlen=30)

        # Expression smoothing
        self.expr_history = deque(maxlen=10)

    def _get_blendshape(self, blendshapes, name):
        """Get a blendshape score by name. Returns 0.0 if not found."""
        for bs in blendshapes:
            if bs.category_name == name:
                return bs.score
        return 0.0

    def _detect_expression(self, blendshapes):
        """Detect expression using blendshapes (52 direct Action Unit scores).
        Much more reliable than manual landmark distance calculations."""

        bs = {b.category_name: b.score for b in blendshapes}

        # Smile: mouth corners pull up + optional cheek raise
        smile_l = bs.get('mouthSmileLeft', 0)
        smile_r = bs.get('mouthSmileRight', 0)
        smile = (smile_l + smile_r) / 2

        # Tension: brows down + mouth press/frown
        brow_down = (bs.get('browDownLeft', 0) + bs.get('browDownRight', 0)) / 2
        mouth_press = (bs.get('mouthPressLeft', 0) + bs.get('mouthPressRight', 0)) / 2
        mouth_frown = (bs.get('mouthFrownLeft', 0) + bs.get('mouthFrownRight', 0)) / 2

        # Worry/surprise: brows up + eyes wide
        brow_up = bs.get('browInnerUp', 0)
        eye_wide = (bs.get('eyeWideLeft', 0) + bs.get('eyeWideRight', 0)) / 2

        # Talking: jaw open
        jaw_open = bs.get('jawOpen', 0)

        # Classify — thresholds tuned from real video (stock presenter, jaw_open 0.01-0.05)
        if smile > 0.08:
            expression = 'smiling'
            intensity = min(100, int(smile * 300))
        elif mouth_frown > 0.12 and mouth_press > 0.08:
            expression = 'tense'
            intensity = min(100, int((mouth_frown + mouth_press) * 150))
        elif brow_up > 0.25 and eye_wide > 0.15:
            expression = 'worried'
            intensity = min(100, int((brow_up + eye_wide) * 150))
        elif jaw_open > 0.02:
            # Real speaking jaw values: 0.01-0.05. Old threshold 0.15 was way too high.
            expression = 'speaking'
            intensity = 0
        else:
            expression = 'neutral'
            intensity = 0

        return expression, intensity, {
            'smile': round(smile, 3),
            'brow_down': round(brow_down, 3),
            'mouth_frown': round(mouth_frown, 3),
            'mouth_press': round(mouth_press, 3),
            'brow_up': round(brow_up, 3),
            'eye_wide': round(eye_wide, 3),
            'jaw_open': round(jaw_open, 3),
        }

    def _detect_eye_contact(self, blendshapes):
        """Detect eye contact using blendshape gaze directions.
        If all look directions are low, the person is looking straight (at camera)."""

        bs = {b.category_name: b.score for b in blendshapes}

        look_down = (bs.get('eyeLookDownLeft', 0) + bs.get('eyeLookDownRight', 0)) / 2
        look_up = (bs.get('eyeLookUpLeft', 0) + bs.get('eyeLookUpRight', 0)) / 2
        look_in = (bs.get('eyeLookInLeft', 0) + bs.get('eyeLookInRight', 0)) / 2
        look_out = (bs.get('eyeLookOutLeft', 0) + bs.get('eyeLookOutRight', 0)) / 2

        # If looking strongly in any direction = NOT at camera
        max_look = max(look_down, look_up, look_in, look_out)

        # Threshold: 0.55 — allows slight downward gaze (normal for laptop/webcam)
        # Old value 0.4 was too strict — flagged normal camera angle as "not looking"
        looking = max_look < 0.55

        gaze_direction = 'center'
        if not looking:
            if look_down == max_look:
                gaze_direction = 'down'
            elif look_up == max_look:
                gaze_direction = 'up'
            elif look_in == max_look or look_out == max_look:
                gaze_direction = 'side'

        self.eye_contact_hist.append(1 if looking else 0)
        pct = int(np.mean(self.eye_contact_hist) * 100) if self.eye_contact_hist else 0

        return looking, pct, gaze_direction

    def _detect_blink(self, blendshapes, timestamp):
        """Detect blinks using blendshape eye blink scores."""
        bs = {b.category_name: b.score for b in blendshapes}
        blink_val = (bs.get('eyeBlinkLeft', 0) + bs.get('eyeBlinkRight', 0)) / 2

        # Detect blink: transition from low to high blink value
        if blink_val > 0.5 and self.prev_blink_val < 0.3:
            self.blink_times.append(timestamp)
        self.prev_blink_val = blink_val

        # Count blinks in window
        cutoff = timestamp - self.BLINK_WINDOW
        while self.blink_times and self.blink_times[0] < cutoff:
            self.blink_times.popleft()

        return len(self.blink_times)

    def _detect_posture(self, pose_landmarks, w, h):
        """Detect posture and fidgeting from pose landmarks."""
        if not pose_landmarks:
            return {
                'posture': 'unknown',
                'shoulder_tilt': 0,
                'fidget_score': 0,
                'hands_visible': False,
                'hand_position': 'unknown',
            }

        pl = pose_landmarks[0]

        # Shoulder tilt (left shoulder y vs right shoulder y)
        l_shoulder = pl[11]
        r_shoulder = pl[12]
        shoulder_tilt = abs(l_shoulder.y - r_shoulder.y)

        # Posture: shoulder width relative to frame (leaning in vs slouching back)
        shoulder_width = abs(l_shoulder.x - r_shoulder.x)

        if shoulder_tilt > 0.06:
            posture = 'tilted'
        elif shoulder_width < 0.1:
            posture = 'slouching'
        else:
            posture = 'upright'

        # Hand position
        l_wrist = pl[15]
        r_wrist = pl[16]
        hands_visible = (l_wrist.visibility > 0.5 or r_wrist.visibility > 0.5)

        hand_position = 'not visible'
        if hands_visible:
            avg_hand_y = (l_wrist.y + r_wrist.y) / 2
            avg_shoulder_y = (l_shoulder.y + r_shoulder.y) / 2
            if avg_hand_y < avg_shoulder_y - 0.05:
                hand_position = 'raised (gesturing)'
            elif avg_hand_y < avg_shoulder_y + 0.15:
                hand_position = 'mid-level'
            else:
                hand_position = 'low/resting'

        # Fidgeting: track movement of shoulders + wrists over time
        current_pose = {
            'l_shoulder': (l_shoulder.x, l_shoulder.y),
            'r_shoulder': (r_shoulder.x, r_shoulder.y),
            'l_wrist': (l_wrist.x, l_wrist.y),
            'r_wrist': (r_wrist.x, r_wrist.y),
        }
        self.pose_history.append(current_pose)

        fidget_score = 0
        if len(self.pose_history) >= 10:
            # Compare current position to 10 frames ago
            old = self.pose_history[-10]
            total_movement = 0
            for key in ['l_shoulder', 'r_shoulder', 'l_wrist', 'r_wrist']:
                dx = current_pose[key][0] - old[key][0]
                dy = current_pose[key][1] - old[key][1]
                total_movement += math.sqrt(dx*dx + dy*dy)
            # Scale to 0-100 (higher = more fidgeting)
            # Reduced sensitivity — normal webcam micro-movements shouldn't register
            fidget_score = min(100, int(max(0, total_movement - 0.03) * 300))

        return {
            'posture': posture,
            'shoulder_tilt': round(shoulder_tilt, 3),
            'fidget_score': fidget_score,
            'hands_visible': hands_visible,
            'hand_position': hand_position,
        }

    def process_frame(self, frame, timestamp):
        """Process one frame. Returns complete analysis dict."""
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mi = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))

        # Face detection + blendshapes
        face_r = self.face_lm.detect(mi)
        if not face_r.face_landmarks:
            return None

        fl = face_r.face_landmarks[0]
        blendshapes = face_r.face_blendshapes[0] if face_r.face_blendshapes else []

        # Pose detection
        pose_r = self.pose_lm.detect(mi)
        pose_landmarks = pose_r.pose_landmarks if pose_r.pose_landmarks else None

        # Expression from blendshapes
        expression, expr_intensity, expr_details = self._detect_expression(blendshapes)
        self.expr_history.append(expression)

        # Smoothed expression (most common in last 10 frames)
        if self.expr_history:
            from collections import Counter
            smooth_expr = Counter(self.expr_history).most_common(1)[0][0]
        else:
            smooth_expr = expression

        # Eye contact from blendshapes
        looking, eye_pct, gaze_dir = self._detect_eye_contact(blendshapes)

        # Blink rate from blendshapes
        blink_rate = self._detect_blink(blendshapes, timestamp)

        # Body language from pose
        body = self._detect_posture(pose_landmarks, w, h)

        # Face position for overlay
        face_x = int(fl[4].x * w)
        face_y = int(fl[4].y * h)
        ear_dist = math.sqrt((fl[234].x - fl[454].x)**2 + (fl[234].y - fl[454].y)**2)
        radius = max(30, min(int(ear_dist * max(w, h) * 0.5), 150))

        # === CONFIDENCE SCORING ===
        # Multiple positive signals stacking = higher confidence
        score = 45  # starting baseline

        # Expression: biggest swing factor
        if smooth_expr == 'smiling':
            score += 25
        elif smooth_expr == 'speaking':
            score += 15   # actively presenting = strong positive
        elif smooth_expr == 'tense':
            score -= 20
        elif smooth_expr == 'worried':
            score -= 10
        # neutral = no change

        # Eye contact (strongest signal for audience perception)
        if eye_pct > 80:
            score += 20
        elif eye_pct > 60:
            score += 12
        elif eye_pct > 30:
            score += 5
        elif eye_pct < 15:
            score -= 15

        # Blink rate (only penalize abnormal)
        if blink_rate > 35:
            score -= 10
        elif blink_rate > 25:
            score -= 5

        # Posture
        if body['posture'] == 'upright':
            score += 8
        elif body['posture'] == 'tilted':
            score -= 5
        elif body['posture'] == 'slouching':
            score -= 12

        # Fidgeting (penalize excessive)
        if body['fidget_score'] > 50:
            score -= 10
        elif body['fidget_score'] > 25:
            score -= 5

        # Hand gestures (positive signal — good presenters gesture)
        if body['hand_position'] == 'raised (gesturing)':
            score += 7
        elif body['hand_position'] == 'mid-level':
            score += 3

        confidence = max(0, min(100, score))

        return {
            'face_detected': True,
            'face_position': {'x': face_x, 'y': face_y},
            'face_radius': radius,
            'expression': smooth_expr,
            'expression_raw': expression,
            'expression_details': expr_details,
            'eye_contact': looking,
            'eye_contact_pct': eye_pct,
            'gaze_direction': gaze_dir,
            'blink_rate': blink_rate,
            'posture': body['posture'],
            'shoulder_tilt': body['shoulder_tilt'],
            'fidget_score': body['fidget_score'],
            'hands_visible': body['hands_visible'],
            'hand_position': body['hand_position'],
            'confidence_score': confidence,
        }

    def draw_overlay(self, frame, result):
        """Draw detection overlay on frame."""
        if result is None:
            cv2.putText(frame, "No face detected", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 100), 2)
            return frame

        fx = result['face_position']['x']
        fy = result['face_position']['y']
        r = result['face_radius']
        score = result['confidence_score']
        h, w = frame.shape[:2]

        # Color based on confidence
        if score >= 70:
            c = (0, 200, 0)
        elif score >= 40:
            c = (0, 200, 200)
        else:
            c = (0, 0, 255)

        # Face circle
        cv2.circle(frame, (fx, fy), r, c, 2)

        # Labels on left side
        x_label = 10
        y_start = 40

        cv2.putText(frame, f"Expression: {result['expression']}", (x_label, y_start),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Eye Contact: {result['eye_contact_pct']}% ({result['gaze_direction']})",
                    (x_label, y_start + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.putText(frame, f"Blink Rate: {result['blink_rate']}/min",
                    (x_label, y_start + 44), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.putText(frame, f"Posture: {result['posture']}",
                    (x_label, y_start + 66), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.putText(frame, f"Fidget: {result['fidget_score']}",
                    (x_label, y_start + 88), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.putText(frame, f"Hands: {result['hand_position']}",
                    (x_label, y_start + 110), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        # Confidence bar at top
        bar_w = int(score * w / 100)
        cv2.rectangle(frame, (0, 0), (w, 28), (30, 30, 30), -1)
        cv2.rectangle(frame, (0, 0), (bar_w, 28), c, -1)
        cv2.putText(frame, f"Confidence: {score}/100", (10, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        return frame

    def reset(self):
        self.blink_times.clear()
        self.prev_blink_val = 0
        self.eye_contact_hist.clear()
        self.pose_history.clear()
        self.expr_history.clear()
