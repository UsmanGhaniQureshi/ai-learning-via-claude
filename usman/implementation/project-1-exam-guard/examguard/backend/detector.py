"""ExamGuard Detection Engine — Multi-student with YOLO person detection + MediaPipe."""
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from ultralytics import YOLO
from collections import deque
import os
import math

# Model paths
BASE = os.path.join(os.path.dirname(__file__), '..', '..')
FACE_MODEL = os.path.join(BASE, '02_behavior_detection', '01_head_direction', 'face_landmarker.task')
POSE_MODEL = os.path.join(BASE, '02_behavior_detection', '03_body_turning', 'pose_landmarker.task')
YOLO_MODEL = os.path.join(os.path.dirname(__file__), 'yolov8n.pt')


class StudentTracker:
    """Tracks detection state for ONE student (eye calibration, talking cycles)."""

    def __init__(self, student_id):
        self.id = student_id
        self.gaze_history = []
        self.eye_center = 0.5
        self.prev_mouth_open = False
        self.cycle_times = deque()
        # Last known face center (pixel coords) for tracking across frames
        self.last_cx = 0
        self.last_cy = 0


class ExamGuardDetector:
    """Detects cheating behaviors. Uses YOLO to find people, then MediaPipe per-person."""

    def __init__(self):
        # Face landmarker — num_faces=1 since we run per-crop
        self.face_landmarker = vision.FaceLandmarker.create_from_options(
            vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=FACE_MODEL),
                num_faces=1,
                min_face_detection_confidence=0.3,
                min_face_presence_confidence=0.3,
                min_tracking_confidence=0.3,
                running_mode=vision.RunningMode.IMAGE))

        # Pose landmarker — num_poses=1 since we run per-crop
        self.pose_landmarker = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=POSE_MODEL),
                num_poses=1,
                min_pose_detection_confidence=0.3,
                min_tracking_confidence=0.3,
                running_mode=vision.RunningMode.IMAGE))

        # YOLO for person detection
        self.yolo = YOLO(YOLO_MODEL)

        # Thresholds
        self.HEAD_TURN = 0.15
        self.HEAD_UP = 0.1
        self.HEAD_W = 35
        self.GAZE_TH = 0.12
        self.EYE_W = 30
        self.BODY_TH = 0.06
        self.BODY_W = 15
        self.MOUTH_TH = 0.15
        self.TALK_CYCLES = 3
        self.CYCLE_WIN = 2.0
        self.TALK_W = 20
        self.MILD = 20
        self.SUSPICIOUS = 40
        self.HIGH = 65
        self.HIST_SIZE = 300
        self.MIN_READ = 30

        # Per-student state — keyed by stable ID
        self.students = {}
        self.next_student_id = 1
        self.TRACK_DIST = 100  # pixels — max distance to match same student

    # ── Analysis functions (work on crop coordinates) ──

    def _head(self, fl, w, h):
        nose_x = fl[4].x * w
        ecx = (fl[133].x * w + fl[362].x * w) / 2
        ecy = (fl[133].y + fl[362].y) / 2 * h
        ed = abs(fl[362].x * w - fl[133].x * w)
        if ed == 0:
            return 'FORWARD', 0
        hr = (nose_x - ecx) / ed
        vr = (fl[4].y * h - ecy) / ed
        if vr < -self.HEAD_UP:
            d = 'UP'
        elif hr < -self.HEAD_TURN:
            d = 'LEFT'
        elif hr > self.HEAD_TURN:
            d = 'RIGHT'
        else:
            return 'FORWARD', 0
        return d, min(self.HEAD_W, int((max(abs(hr), abs(vr)) / 0.4) * self.HEAD_W))

    def _eyes(self, fl, w, h, student):
        lw = abs(fl[133].x - fl[33].x)
        rw = abs(fl[362].x - fl[263].x)
        lr = (fl[468].x - fl[33].x) / lw if lw > 0 else 0.5
        rr = (fl[473].x - fl[263].x) / rw if rw > 0 else 0.5
        avg = (lr + rr) / 2
        student.gaze_history.append(avg)
        if len(student.gaze_history) > self.HIST_SIZE:
            student.gaze_history.pop(0)
        if len(student.gaze_history) >= self.MIN_READ:
            student.eye_center = np.median(student.gaze_history)
        dev = avg - student.eye_center
        if len(student.gaze_history) < self.MIN_READ:
            return 'CALIBRATING', 0
        if abs(dev) < self.GAZE_TH:
            return 'CENTER', 0
        d = 'LEFT' if dev > 0 else 'RIGHT'
        return d, min(self.EYE_W, int((abs(dev) / 0.4) * self.EYE_W))

    def _body(self, pl, w, h):
        yd = pl[12].y - pl[11].y
        vd = 0
        if hasattr(pl[11], 'visibility') and hasattr(pl[12], 'visibility'):
            vd = pl[11].visibility - pl[12].visibility
        rot = abs(yd) + abs(vd) * 0.3
        if rot < self.BODY_TH:
            return 'FORWARD', 0
        d = 'LEFT' if yd > 0 else 'RIGHT'
        return d, min(self.BODY_W, int((rot / 0.15) * self.BODY_W))

    def _talking(self, fl, w, h, now, student):
        vert = abs(fl[13].y - fl[14].y) * h
        horiz = abs(fl[308].x - fl[78].x) * w
        mar = vert / horiz if horiz > 0 else 0
        is_open = mar > self.MOUTH_TH
        if student.prev_mouth_open and not is_open:
            student.cycle_times.append(now)
        student.prev_mouth_open = is_open
        while student.cycle_times and (now - student.cycle_times[0]) > self.CYCLE_WIN:
            student.cycle_times.popleft()
        cycles = len(student.cycle_times)
        talking = cycles >= self.TALK_CYCLES
        score = min(self.TALK_W, int((cycles / 8) * self.TALK_W)) if talking else 0
        return 'TALKING' if talking else 'SILENT', score, cycles

    def _verdict(self, total):
        if total < self.MILD:
            return 'ALL CLEAR'
        elif total < self.SUSPICIOUS:
            return 'MILD WARNING'
        elif total < self.HIGH:
            return 'SUSPICIOUS'
        else:
            return 'HIGH ALERT'

    # ── Student tracking ──

    def _match_student_id(self, cx, cy):
        """Find existing student by proximity or create new one.
        cx, cy are pixel coordinates in the full frame."""
        best_id = None
        best_dist = float('inf')

        for st in self.students.values():
            d = math.sqrt((cx - st.last_cx)**2 + (cy - st.last_cy)**2)
            if d < best_dist:
                best_dist = d
                best_id = st.id

        if best_id is not None and best_dist < self.TRACK_DIST:
            self.students[best_id].last_cx = cx
            self.students[best_id].last_cy = cy
            return best_id

        # New student
        sid = self.next_student_id
        self.next_student_id += 1
        self.students[sid] = StudentTracker(sid)
        self.students[sid].last_cx = cx
        self.students[sid].last_cy = cy
        return sid

    # ── Per-person detection (on a crop) ──

    def _detect_person(self, frame, person_box, full_h, full_w, timestamp):
        """Run face + pose detection on one person's crop.
        person_box = (x1, y1, x2, y2) in full-frame coords.
        Returns result dict or None if no face found."""
        x1, y1, x2, y2 = person_box
        pw = x2 - x1
        ph = y2 - y1

        # Pad person box slightly for better detection
        pad_x = int(pw * 0.1)
        pad_y = int(ph * 0.1)
        crop_x1 = max(0, x1 - pad_x)
        crop_y1 = max(0, y1 - pad_y)
        crop_x2 = min(full_w, x2 + pad_x)
        crop_y2 = min(full_h, y2 + pad_y)
        person_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]

        if person_crop.size == 0:
            return None

        crop_rgb = cv2.cvtColor(person_crop, cv2.COLOR_BGR2RGB)
        crop_mi = mp.Image(image_format=mp.ImageFormat.SRGB,
                           data=np.ascontiguousarray(crop_rgb))

        # -- Face detection on person crop --
        face_r = self.face_landmarker.detect(crop_mi)
        if not face_r.face_landmarks:
            return None

        fl = face_r.face_landmarks[0]
        crop_h, crop_w = person_crop.shape[:2]

        # Face center in full-frame pixel coords
        face_cx = int(fl[4].x * crop_w + crop_x1)
        face_cy = int(fl[4].y * crop_h + crop_y1)

        # Match to student ID first, then analyze
        sid = self._match_student_id(face_cx, face_cy)
        student = self.students[sid]

        hd, hs = self._head(fl, crop_w, crop_h)
        ed, es = self._eyes(fl, crop_w, crop_h, student)
        td, ts, tc = self._talking(fl, crop_w, crop_h, timestamp, student)

        # -- Body detection on same crop --
        bd, bs = '--', 0
        pose_r = self.pose_landmarker.detect(crop_mi)
        if pose_r.pose_landmarks:
            bd, bs = self._body(pose_r.pose_landmarks[0], crop_w, crop_h)

        total = min(100, hs + es + bs + ts)

        # Face radius based on face size in full frame
        ear_dist_px = math.sqrt(
            ((fl[234].x - fl[454].x) * crop_w)**2 +
            ((fl[234].y - fl[454].y) * crop_h)**2)
        radius = max(30, min(int(ear_dist_px * 0.6), 150))

        return {
            'student_id': sid,
            'face_position': {'x': face_cx, 'y': face_cy},
            'face_radius': radius,
            'person_box': {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2},
            'head': {'direction': hd, 'score': hs},
            'eyes': {'direction': ed, 'score': es},
            'body': {'direction': bd, 'score': bs},
            'talking': {'status': td, 'score': ts, 'cycles': tc},
            'total_score': total,
            'verdict': self._verdict(total),
            'timestamp': timestamp
        }

    # ── Main processing ──

    def process_frame(self, frame, timestamp):
        """Process one frame. Uses YOLO to find people, then MediaPipe per person.
        Falls back to direct MediaPipe if no YOLO persons found (webcam close-up)."""
        full_h, full_w = frame.shape[:2]

        # Step 1: YOLO person detection
        yolo_results = self.yolo(frame, verbose=False, conf=0.4)
        boxes = yolo_results[0].boxes
        person_boxes = []
        for box in boxes:
            if int(box.cls[0]) == 0:  # class 0 = person
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                person_boxes.append((x1, y1, x2, y2))

        results = []

        if person_boxes:
            # Step 2: For each person, crop and detect
            used_sids = set()
            for pbox in person_boxes:
                r = self._detect_person(frame, pbox, full_h, full_w, timestamp)
                if r and r['student_id'] not in used_sids:
                    results.append(r)
                    used_sids.add(r['student_id'])
        else:
            # Fallback: direct full-frame detection (webcam close-up)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mi = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            face_r = self.face_landmarker.detect(mi)

            if face_r.face_landmarks:
                for fl in face_r.face_landmarks:
                    face_cx = int(fl[4].x * full_w)
                    face_cy = int(fl[4].y * full_h)
                    sid = self._match_student_id(face_cx, face_cy)
                    student = self.students[sid]

                    hd, hs = self._head(fl, full_w, full_h)
                    ed, es = self._eyes(fl, full_w, full_h, student)
                    td, ts, tc = self._talking(fl, full_w, full_h, timestamp, student)

                    # Body: try full-frame pose
                    bd, bs = '--', 0
                    pose_r = self.pose_landmarker.detect(mi)
                    if pose_r.pose_landmarks:
                        bd, bs = self._body(pose_r.pose_landmarks[0], full_w, full_h)

                    total = min(100, hs + es + bs + ts)
                    ear_dist = math.sqrt(
                        (fl[234].x - fl[454].x)**2 + (fl[234].y - fl[454].y)**2)
                    radius = max(30, min(int(ear_dist * max(full_w, full_h) * 0.55), 150))

                    results.append({
                        'student_id': sid,
                        'face_position': {'x': face_cx, 'y': face_cy},
                        'face_radius': radius,
                        'head': {'direction': hd, 'score': hs},
                        'eyes': {'direction': ed, 'score': es},
                        'body': {'direction': bd, 'score': bs},
                        'talking': {'status': td, 'score': ts, 'cycles': tc},
                        'total_score': total,
                        'verdict': self._verdict(total),
                        'timestamp': timestamp
                    })

        return results

    def draw_overlays(self, frame, all_results):
        """Draw detection overlays for ALL students on frame."""
        h, w = frame.shape[:2]

        for r in all_results:
            sid = r['student_id']
            total = r['total_score']
            verdict = r['verdict']
            fx = r['face_position']['x']
            fy = r['face_position']['y']
            radius = r.get('face_radius', 60)

            # Color based on verdict
            if total < self.MILD:
                c = (0, 200, 0)
            elif total < self.SUSPICIOUS:
                c = (0, 200, 200)
            elif total < self.HIGH:
                c = (0, 100, 255)
            else:
                c = (0, 0, 255)

            # Draw circle around face
            cv2.circle(frame, (fx, fy), radius, c, 2)

            # Person bounding box (if available)
            if 'person_box' in r:
                pb = r['person_box']
                cv2.rectangle(frame, (pb['x1'], pb['y1']), (pb['x2'], pb['y2']), c, 1)

            # Student label above head
            label = f"Student {sid}: {verdict} ({total})"
            label_y = max(20, fy - radius - 15)
            cv2.putText(frame, label, (fx - 100, label_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, c, 2)

            # Compact signals below label
            signals = (f"H:{r['head']['direction']} E:{r['eyes']['direction']} "
                       f"B:{r['body']['direction']} M:{r['talking']['status']}")
            cv2.putText(frame, signals, (fx - 100, label_y + 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

            # Score bar
            bar_x = fx - 50
            bar_y = label_y + 28
            bar_w = int(total)
            cv2.rectangle(frame, (bar_x, bar_y), (bar_x + 100, bar_y + 6),
                          (50, 50, 50), -1)
            cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + 6), c, -1)

        # Overall summary bar at bottom
        if all_results:
            max_score = max(r['total_score'] for r in all_results)
            worst = max(all_results, key=lambda r: r['total_score'])
            summary = (f"Students: {len(all_results)} | "
                       f"Worst: Student {worst['student_id']} "
                       f"({worst['verdict']}, {worst['total_score']}/100)")

            if max_score < self.MILD:
                bc = (0, 150, 0)
            elif max_score < self.SUSPICIOUS:
                bc = (0, 150, 150)
            elif max_score < self.HIGH:
                bc = (0, 80, 200)
            else:
                bc = (0, 0, 200)

            cv2.rectangle(frame, (0, h - 30), (w, h), bc, -1)
            cv2.putText(frame, summary, (10, h - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        return frame

    def reset(self):
        """Reset all student states for new video/session."""
        self.students.clear()
        self.next_student_id = 1
