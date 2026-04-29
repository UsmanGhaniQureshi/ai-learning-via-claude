"""Face + Body Engine — Expression (blendshapes), eye contact, blink, posture, fidgeting."""
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
import math
import os
from collections import deque, Counter

FACE_MODEL = os.path.join(os.path.dirname(__file__), 'face_landmarker.task')
POSE_MODEL = os.path.join(os.path.dirname(__file__), 'pose_landmarker.task')


class _LandmarkShim:
    """Minimal stand-in for MediaPipe Python's NormalizedLandmark.

    Browser MediaPipe sends landmarks as `{x, y, z}` JSON dicts; the
    Python-side scoring code accesses them as `.x`, `.y`, `.z`. This
    shim lets the live-WS path reuse the exact same scoring body
    that processes upload-side MediaPipe output.
    """
    __slots__ = ('x', 'y', 'z')
    def __init__(self, d):
        self.x = float(d.get('x', 0.0) or 0.0)
        self.y = float(d.get('y', 0.0) or 0.0)
        self.z = float(d.get('z', 0.0) or 0.0)


class _BlendshapeShim:
    """Stand-in for MediaPipe Python's blendshape category.

    Browser sends `{categoryName, score}`; Python side reads
    `.category_name` + `.score`. We accept both spellings to tolerate
    a possible camelCase-vs-snake_case mismatch on the wire.
    """
    __slots__ = ('category_name', 'score')
    def __init__(self, d):
        self.category_name = (
            d.get('categoryName')
            or d.get('category_name')
            or ''
        )
        self.score = float(d.get('score', 0.0) or 0.0)


_shared_face_lm = None
_shared_pose_lm = None
_shared_models_lock = __import__('threading').Lock()
_face_lm_call_lock = __import__('threading').Lock()
_pose_lm_call_lock = __import__('threading').Lock()


def _get_shared_models():
    global _shared_face_lm, _shared_pose_lm
    if _shared_face_lm is None:
        with _shared_models_lock:
            if _shared_face_lm is None:
                _shared_face_lm = vision.FaceLandmarker.create_from_options(
                    vision.FaceLandmarkerOptions(
                        base_options=mp_python.BaseOptions(model_asset_path=FACE_MODEL),
                        num_faces=2,
                        output_face_blendshapes=True,
                        min_face_detection_confidence=0.4,
                        min_face_presence_confidence=0.4,
                        running_mode=vision.RunningMode.IMAGE))
                _shared_pose_lm = vision.PoseLandmarker.create_from_options(
                    vision.PoseLandmarkerOptions(
                        base_options=mp_python.BaseOptions(model_asset_path=POSE_MODEL),
                        num_poses=1,
                        min_pose_detection_confidence=0.4,
                        running_mode=vision.RunningMode.IMAGE))
    return _shared_face_lm, _shared_pose_lm


class FaceEngine:
    """Detects expressions (blendshapes), eye contact, blink rate, posture, fidgeting."""

    def __init__(self, load_mp_models=True):
        """Set up the engine.

        `load_mp_models=True` (default) — load MediaPipe FaceLandmarker
        + PoseLandmarker. Use this in the upload pipeline where the
        engine ingests raw frames via `process_frame`.

        `load_mp_models=False` — skip the model load. Use this in the
        live WS path where MediaPipe runs in the browser and the
        backend only ever calls `process_landmarks_from_browser`. Saves
        ~1-2 s of cold-start latency + ~80 MB of resident memory per
        live session.
        """
        if load_mp_models:
            self.face_lm, self.pose_lm = _get_shared_models()
        else:
            self.face_lm = None
            self.pose_lm = None

        # Accumulated counters for the session-level report. `frames_processed`
        # denominates everything so ratios are meaningful. `frames_multi_face`
        # is the number of frames where >1 face was present; rendered as a
        # warning when it exceeds a small fraction of total frames.
        self.frames_processed = 0
        self.frames_multi_face = 0

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

        # Baseline calibration — first ~3 s establish "your normal".
        #
        # Was 30 frames (~1 s). One second captures the user still moving
        # from "about to start speaking" into their resting pose, so the
        # baseline was contaminated with motion. 90 frames at 30 fps gives
        # three seconds — enough to average out the startup jitter and
        # still short enough that the user doesn't notice the "calibrating"
        # state. For uploads processed with process_every=2 this is ~6 s
        # of video, which is reasonable for a minimum clip.
        self.baseline = None
        self.calibration_frames = []
        self.CALIBRATION_COUNT = 90  # ~3 seconds at 30fps

    def _get_blendshape(self, blendshapes, name):
        """Get a blendshape score by name. Returns 0.0 if not found."""
        for bs in blendshapes:
            if bs.category_name == name:
                return bs.score
        return 0.0

    def _detect_expression(self, blendshapes):
        """Detect expression using blendshapes (52 direct Action Unit scores).
        Uses BASELINE CALIBRATION — first ~1 second of the session records your
        personal resting face values. All expressions are detected as DEVIATIONS
        from YOUR baseline, not absolute thresholds."""

        bs = {b.category_name: b.score for b in blendshapes}

        # Extract signals that change meaningfully across expressions.
        # Eye-look baselines (look_{down,up,in,out}_rest) are captured
        # here as well so _detect_eye_contact can compare against the
        # user's own resting eye position rather than a global absolute
        # threshold — that's what lets the system adapt for glasses
        # refraction, monitor-below-camera rigs, etc.
        signals = {
            'squint': (bs.get('eyeSquintLeft', 0) + bs.get('eyeSquintRight', 0)) / 2,
            'brow_down': (bs.get('browDownLeft', 0) + bs.get('browDownRight', 0)) / 2,
            'mouth_shrug': bs.get('mouthShrugLower', 0),
            'mouth_pucker': bs.get('mouthPucker', 0),
            'smile': (bs.get('mouthSmileLeft', 0) + bs.get('mouthSmileRight', 0)) / 2,
            'mouth_frown': (bs.get('mouthFrownLeft', 0) + bs.get('mouthFrownRight', 0)) / 2,
            'jaw_open': bs.get('jawOpen', 0),
            'blink': (bs.get('eyeBlinkLeft', 0) + bs.get('eyeBlinkRight', 0)) / 2,
            'look_down_rest': (bs.get('eyeLookDownLeft', 0) + bs.get('eyeLookDownRight', 0)) / 2,
            'look_up_rest': (bs.get('eyeLookUpLeft', 0) + bs.get('eyeLookUpRight', 0)) / 2,
            'look_in_rest': (bs.get('eyeLookInLeft', 0) + bs.get('eyeLookInRight', 0)) / 2,
            'look_out_rest': (bs.get('eyeLookOutLeft', 0) + bs.get('eyeLookOutRight', 0)) / 2,
        }

        # === CALIBRATION PHASE ===
        if self.baseline is None:
            self.calibration_frames.append(signals)
            if len(self.calibration_frames) >= self.CALIBRATION_COUNT:
                # Calculate baseline as average of first N frames
                self.baseline = {}
                for key in signals:
                    values = [f[key] for f in self.calibration_frames]
                    self.baseline[key] = np.mean(values)
                self.calibration_frames = []
            return 'calibrating', 0, signals

        # === DETECTION PHASE — measure deviations from baseline ===
        # Positive deviation = signal went UP from your normal
        # Negative deviation = signal went DOWN from your normal
        dev = {key: signals[key] - self.baseline[key] for key in signals}

        squint = signals['squint']
        brow_down = signals['brow_down']
        mouth_pucker = signals['mouth_pucker']
        mouth_frown = signals['mouth_frown']
        mouth_shrug = signals['mouth_shrug']
        smile = signals['smile']
        jaw_open = signals['jaw_open']

        # === Classify using DEVIATIONS from YOUR baseline ===
        # Key insight from testing: squint and browDown are the most responsive signals
        # Use the RATIO between them to distinguish expressions

        sq_dev = dev['squint']
        bd_dev = dev['brow_down']
        pk_dev = dev['mouth_pucker']
        fr_dev = dev['mouth_frown']
        sh_dev = dev['mouth_shrug']
        jaw_dev = dev['jaw_open']

        # Total face movement (how much is the face changing from neutral?)
        total_movement = abs(sq_dev) + abs(bd_dev) + abs(pk_dev) + abs(sh_dev)

        # Surprised: squint DROPS + browDown RISES + mouth opens
        if sq_dev < -0.08 and bd_dev > 0.08:
            expression = 'surprised'
            intensity = min(100, int(total_movement * 150))

        # Happy/Smiling: squint rises significantly + browDown rises less
        # The key: when smiling, cheeks push UP (squint rises) and face relaxes
        elif sq_dev > 0.05 and fr_dev < 0.005 and pk_dev < 0.03:
            expression = 'happy'
            intensity = min(100, int(sq_dev * 300))

        # Angry: browDown rises significantly + pucker/tension increases
        elif bd_dev > 0.15 and (pk_dev > 0.02 or sq_dev > 0.05):
            expression = 'angry'
            intensity = min(100, int(bd_dev * 150))

        # Sad: frown increases OR squint drops without browDown spike
        elif fr_dev > 0.005 or (sq_dev < -0.05 and abs(bd_dev) < 0.10):
            expression = 'sad'
            intensity = min(100, int(max(abs(fr_dev) * 3000, abs(sq_dev) * 200)))

        # Speaking: jaw opens
        elif jaw_open > 0.02 or jaw_dev > 0.01:
            expression = 'speaking'
            intensity = 0

        # Focused: browDown rises moderately, everything else stable
        elif bd_dev > 0.08 and abs(sq_dev) < 0.05 and abs(pk_dev) < 0.02:
            expression = 'focused'
            intensity = min(100, int(bd_dev * 200))

        # Neutral: face close to baseline (total movement small)
        else:
            expression = 'neutral'
            intensity = 0

        return expression, intensity, {
            'smile': round(smile, 3),
            'squint': round(squint, 3),
            'brow_down': round(brow_down, 3),
            'mouth_frown': round(mouth_frown, 3),
            'mouth_pucker': round(mouth_pucker, 3),
            'mouth_shrug': round(mouth_shrug, 3),
            'jaw_open': round(jaw_open, 3),
            'calibrated': self.baseline is not None,
        }

    def _detect_eye_contact(self, blendshapes):
        """Detect eye contact using blendshape gaze directions.
        If all look directions are low, the person is looking straight (at camera).

        Baseline-aware: during the 3-second calibration window we record
        each user's resting look-{down,up,in,out} values. At detection
        time we subtract that baseline from the current measurement, so
        the "are they looking at the camera?" check fires only when
        their eyes have DEVIATED from their own neutral position — not
        against a global absolute threshold. This removes the bias
        against users with:
          - glasses (refraction shifts the apparent gaze)
          - webcam below eye-line (look_down always elevated)
          - webcam above eye-line (look_up always elevated)
          - individual anatomy differences
        """

        bs = {b.category_name: b.score for b in blendshapes}

        look_down = (bs.get('eyeLookDownLeft', 0) + bs.get('eyeLookDownRight', 0)) / 2
        look_up = (bs.get('eyeLookUpLeft', 0) + bs.get('eyeLookUpRight', 0)) / 2
        look_in = (bs.get('eyeLookInLeft', 0) + bs.get('eyeLookInRight', 0)) / 2
        look_out = (bs.get('eyeLookOutLeft', 0) + bs.get('eyeLookOutRight', 0)) / 2

        # Subtract baseline if calibrated. Clipped at 0 because the user
        # never looks LESS-than-rest in any direction — the "rest" values
        # are a minimum, not a centre.
        if self.baseline is not None:
            look_down = max(0, look_down - self.baseline.get('look_down_rest', 0))
            look_up = max(0, look_up - self.baseline.get('look_up_rest', 0))
            look_in = max(0, look_in - self.baseline.get('look_in_rest', 0))
            look_out = max(0, look_out - self.baseline.get('look_out_rest', 0))

        # If looking strongly in any direction = NOT at camera
        max_look = max(look_down, look_up, look_in, look_out)

        # Threshold after baseline subtraction is tighter because we've
        # removed the per-user offset. Environment variable override so
        # operators can tune it against labelled data without a redeploy.
        try:
            eye_threshold = float(os.environ.get("EYE_CONTACT_THRESHOLD", "0.40"))
        except ValueError:
            eye_threshold = 0.40
        looking = max_look < eye_threshold

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

        l_shoulder = pl[11]
        r_shoulder = pl[12]
        l_hip = pl[23]
        r_hip = pl[24]

        # Posture is measured RELATIVE to the hip line so a tilted
        # webcam (e.g. laptop on a raised surface angling down) doesn't
        # produce false "tilted" posture readings. Both the shoulder
        # axis and the hip axis rotate together with the camera, so the
        # ANGLE BETWEEN them is invariant to camera orientation.
        shoulder_axis = math.atan2(
            r_shoulder.y - l_shoulder.y, r_shoulder.x - l_shoulder.x
        )
        hips_visible = (
            getattr(l_hip, "visibility", 1.0) > 0.4
            and getattr(r_hip, "visibility", 1.0) > 0.4
        )
        if hips_visible:
            hip_axis = math.atan2(r_hip.y - l_hip.y, r_hip.x - l_hip.x)
            rel = abs(shoulder_axis - hip_axis)
            # Wrap to [0, pi]
            if rel > math.pi:
                rel = 2 * math.pi - rel
            shoulder_tilt = rel
        else:
            # Fallback for seated users where hips aren't in frame —
            # use raw shoulder slope. Less accurate but the best we can
            # do without a hip reference.
            shoulder_tilt = abs(l_shoulder.y - r_shoulder.y)

        # Slouching: torso height relative to shoulder width. A compressed
        # torso (short vertical span) means the user is slumped forward
        # or leaning back off-axis. Ratio-based so it's independent of
        # how far the user sits from the camera.
        shoulder_width = math.hypot(
            l_shoulder.x - r_shoulder.x, l_shoulder.y - r_shoulder.y
        )
        torso_height = 0.0
        if hips_visible:
            mid_shoulder = ((l_shoulder.x + r_shoulder.x) / 2,
                            (l_shoulder.y + r_shoulder.y) / 2)
            mid_hip = ((l_hip.x + r_hip.x) / 2, (l_hip.y + r_hip.y) / 2)
            torso_height = math.hypot(
                mid_shoulder[0] - mid_hip[0], mid_shoulder[1] - mid_hip[1]
            )

        # Thresholds: tilt > ~17° (0.3 rad) relative to hips means one
        # shoulder is dropped; torso:shoulder ratio < 1.1 is compressed.
        if shoulder_tilt > 0.30:
            posture = 'tilted'
        elif hips_visible and shoulder_width > 0 and torso_height / shoulder_width < 1.1:
            posture = 'slouching'
        elif not hips_visible and shoulder_width < 0.1:
            # Hips off-screen and shoulders tiny → user is far from cam
            # or hunched forward. Mark as slouching for back-compat.
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
            # Fidgeting is quantified as SHOULDER drift only — wrists are
            # excluded because presentation coaches actively encourage
            # hand gesturing, and raw wrist displacement can't tell a
            # purposeful point-at-slide gesture apart from a nervous
            # tic. Shoulders, by contrast, should stay roughly planted
            # throughout a presentation; rapid shoulder motion means
            # the whole upper body is jittering.
            #
            # We also look at DIRECTION CHANGES, not just total distance.
            # A smooth lean-in (consistent direction) shouldn't count,
            # but bouncing back-and-forth does. We approximate this by
            # comparing short-term (3 frames) vs long-term (10 frames)
            # drift: if the 3-frame drift is large relative to the
            # 10-frame drift, motion is jerky/fidgety rather than smooth.
            old_long = self.pose_history[-10]
            old_short = self.pose_history[-3]
            short_move = 0.0
            long_move = 0.0
            for key in ['l_shoulder', 'r_shoulder']:
                short_move += math.hypot(
                    current_pose[key][0] - old_short[key][0],
                    current_pose[key][1] - old_short[key][1],
                )
                long_move += math.hypot(
                    current_pose[key][0] - old_long[key][0],
                    current_pose[key][1] - old_long[key][1],
                )
            # jerkiness in [0, ~3]: high when short-term drift outpaces
            # long-term (= lots of direction changes, i.e. fidgeting).
            jerkiness = short_move / (long_move + 0.01)
            # Only flag when BOTH the motion is meaningful (short_move
            # above webcam-noise floor) AND it's jerky rather than smooth.
            if short_move > 0.03 and jerkiness > 1.2:
                fidget_score = min(100, int((short_move - 0.03) * 400))

        return {
            'posture': posture,
            'shoulder_tilt': round(shoulder_tilt, 3),
            'fidget_score': fidget_score,
            'hands_visible': hands_visible,
            'hand_position': hand_position,
        }

    def _detect_tension(self, blendshapes):
        """Detect facial tension from brow furrow, mouth tension, and jaw clench.
        Returns tension_score 0-100 (0=relaxed, 100=very tense)."""
        bs = {b.category_name: b.score for b in blendshapes}

        # Brow furrow: browDown signals concentration/tension
        brow_down = (bs.get('browDownLeft', 0) + bs.get('browDownRight', 0)) / 2

        # Mouth tension: pucker + frown indicate stress
        mouth_pucker = bs.get('mouthPucker', 0)
        mouth_frown = (bs.get('mouthFrownLeft', 0) + bs.get('mouthFrownRight', 0)) / 2

        # Jaw clench
        jaw_clench = bs.get('jawForward', 0)

        # Compute deviations from baseline if available
        if self.baseline:
            brow_dev = max(0, brow_down - self.baseline.get('brow_down', 0))
            pucker_dev = max(0, mouth_pucker - self.baseline.get('mouth_pucker', 0))
            frown_dev = max(0, mouth_frown - self.baseline.get('mouth_frown', 0))
        else:
            brow_dev = brow_down
            pucker_dev = mouth_pucker
            frown_dev = mouth_frown

        # Weighted tension: brow furrow is the strongest anxiety signal
        tension = (brow_dev * 400 + pucker_dev * 200 + frown_dev * 300 + jaw_clench * 100)
        return max(0, min(100, int(tension)))

    def _detect_face_turned_away(self, face_landmarks, w, h):
        """Detect if face is turned significantly away from camera.
        Uses nose tip position relative to face bounding box center."""
        if not face_landmarks:
            return True

        fl = face_landmarks
        # Nose tip (landmark 1), left ear (234), right ear (454)
        nose_x = fl[1].x
        left_ear_x = fl[234].x
        right_ear_x = fl[454].x

        face_center_x = (left_ear_x + right_ear_x) / 2
        face_width = abs(right_ear_x - left_ear_x)

        if face_width < 0.01:
            return True

        # How far nose is from center relative to face width
        offset_ratio = abs(nose_x - face_center_x) / face_width
        return offset_ratio > 0.25  # Face turned >~25% = looking away

    def process_frame(self, frame, timestamp):
        """Process one frame. Returns complete analysis dict."""
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mi = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))

        # Face detection + blendshapes (wrapped in try/except for robustness)
        try:
            with _face_lm_call_lock:
                face_r = self.face_lm.detect(mi)
        except Exception:
            return None
        if not face_r.face_landmarks:
            return None
        self.frames_processed += 1
        if len(face_r.face_landmarks) > 1:
            self.frames_multi_face += 1

        fl = face_r.face_landmarks[0]
        blendshapes = face_r.face_blendshapes[0] if face_r.face_blendshapes else []

        # Pose detection (wrapped in try/except for robustness)
        try:
            with _pose_lm_call_lock:
                pose_r = self.pose_lm.detect(mi)
            pose_landmarks = pose_r.pose_landmarks if pose_r.pose_landmarks else None
        except Exception:
            pose_landmarks = None

        return self._compute_signals(fl, blendshapes, pose_landmarks, w, h, timestamp)

    def process_landmarks_from_browser(
        self, face_landmarks, face_blendshapes, timestamp,
        w=640, h=480,
    ):
        """Live-WS entry point.

        Browser MediaPipe (`@mediapipe/tasks-vision`) extracts the face
        landmarks + blendshapes client-side; we receive them as plain
        JSON arrays:
          face_landmarks   — list of {x, y, z} dicts (478 points)
          face_blendshapes — list of {categoryName, score} dicts (52 entries)

        Wrapping them in tiny shim objects lets us reuse every
        `_detect_*` method below unchanged — they all access
        `.x`/`.y`/`.z` on landmarks and `.category_name`/`.score` on
        blendshapes (the Python MediaPipe API). One source of truth
        for face scoring across upload + live.

        Pose isn't sent by the browser, so live `posture / fidget /
        hand_position` come back as their None / 'unknown' defaults
        (vs the full pose engine on uploads). Same baseline-aware
        eye-contact + expression logic, blink detection, and tension
        scoring as the upload path.
        """
        if not face_landmarks or not face_blendshapes:
            self.frames_processed += 1
            return None
        self.frames_processed += 1
        fl = [_LandmarkShim(d) for d in face_landmarks]
        blendshapes = [_BlendshapeShim(d) for d in face_blendshapes]
        return self._compute_signals(fl, blendshapes, None, w, h, timestamp)

    def _compute_signals(self, fl, blendshapes, pose_landmarks, w, h, timestamp):
        """Shared scoring body — given already-extracted face landmarks
        + blendshapes (+ optional pose landmarks), produce the full
        result dict. Used by both `process_frame` (server-side
        MediaPipe) and `process_landmarks_from_browser` (client-side
        MediaPipe over WS)."""
        # Expression from blendshapes
        expression, expr_intensity, expr_details = self._detect_expression(blendshapes)
        self.expr_history.append(expression)

        # Smoothed expression (most common in last 10 frames)
        if self.expr_history:
            smooth_expr = Counter(self.expr_history).most_common(1)[0][0]
        else:
            smooth_expr = expression

        # Eye contact from blendshapes
        looking, eye_pct, gaze_dir = self._detect_eye_contact(blendshapes)

        # Blink rate from blendshapes
        blink_rate = self._detect_blink(blendshapes, timestamp)

        # Body language from pose
        body = self._detect_posture(pose_landmarks, w, h)

        # Facial tension (anxiety/stress signal)
        tension_score = self._detect_tension(blendshapes)

        # Face turned away detection
        face_turned = self._detect_face_turned_away(fl, w, h)

        # Face position for overlay
        face_x = int(fl[4].x * w)
        face_y = int(fl[4].y * h)
        ear_dist = math.sqrt((fl[234].x - fl[454].x)**2 + (fl[234].y - fl[454].y)**2)
        radius = max(30, min(int(ear_dist * max(w, h) * 0.5), 150))

        # === CONFIDENCE SCORING ===
        # Key principle: NOT SPEAKING = max ~50 (you're not presenting!)
        # SPEAKING + good signals = 60-90+
        # SPEAKING + bad signals = 20-40
        is_active = smooth_expr in ('speaking', 'happy')

        # Base depends on whether you're actively presenting
        score = 35 if is_active else 25  # silent baseline is LOW

        # Expression: biggest swing
        if smooth_expr == 'happy':
            score += 30
        elif smooth_expr == 'speaking':
            score += 20
        elif smooth_expr == 'focused':
            score += 10
        elif smooth_expr == 'neutral':
            score += 0   # not presenting = no bonus
        elif smooth_expr == 'surprised':
            score -= 5
        elif smooth_expr == 'sad':
            score -= 15
        elif smooth_expr == 'angry':
            score -= 20
        elif smooth_expr == 'calibrating':
            score = 50  # show 50 during calibration

        # Eye contact — only counts significantly when SPEAKING
        if is_active:
            if eye_pct > 80:
                score += 20
            elif eye_pct > 60:
                score += 12
            elif eye_pct > 30:
                score += 5
            elif eye_pct < 15:
                score -= 15
        else:
            # Silent: eye contact gives minor bonus only
            if eye_pct > 70:
                score += 8
            elif eye_pct < 20:
                score -= 5

        # Blink rate
        if blink_rate > 35:
            score -= 10
        elif blink_rate > 25:
            score -= 5

        # Posture
        if body['posture'] == 'upright':
            score += 5
        elif body['posture'] == 'tilted':
            score -= 5
        elif body['posture'] == 'slouching':
            score -= 12

        # Fidgeting
        if body['fidget_score'] > 50:
            score -= 10
        elif body['fidget_score'] > 25:
            score -= 5

        # Hand gestures (only bonus when speaking)
        if is_active:
            if body['hand_position'] == 'raised (gesturing)':
                score += 7
            elif body['hand_position'] == 'mid-level':
                score += 3

        confidence = max(0, min(100, score))

        # Build transparent breakdown string
        parts = [f"base:{35 if is_active else 25}"]
        if smooth_expr != 'neutral' and smooth_expr != 'calibrating':
            expr_val = {
                'happy': '+30', 'speaking': '+20', 'focused': '+10',
                'surprised': '-5', 'sad': '-15', 'angry': '-20'
            }.get(smooth_expr, '+0')
            parts.append(f"expr:{expr_val}")
        parts.append(f"eye:{'+' if eye_pct > 30 else ''}{score - (35 if is_active else 25)}")

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
            'tension_score': tension_score,
            'face_turned_away': face_turned,
            'posture': body['posture'],
            'shoulder_tilt': body['shoulder_tilt'],
            'fidget_score': body['fidget_score'],
            'hands_visible': body['hands_visible'],
            'hand_position': body['hand_position'],
            'confidence_score': confidence,
            'score_breakdown': ' '.join(parts) + f' = {confidence}',
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

        # Labels — orange text on dark background for visibility
        x_label = 10
        y_start = 40
        ORANGE = (0, 165, 255)
        LIGHT_ORANGE = (0, 200, 255)
        GRAY = (150, 150, 150)

        # Dark background panel
        cv2.rectangle(frame, (0, 30), (350, y_start + 165), (0, 0, 0), -1)
        cv2.rectangle(frame, (0, 30), (350, y_start + 165), (50, 50, 50), 1)

        # Measured values (these are REAL)
        cv2.putText(frame, "-- Measured (real) --", (x_label, y_start),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, GRAY, 1)
        cv2.putText(frame, f"Eye Contact: {result['eye_contact_pct']}% ({result['gaze_direction']})",
                    (x_label, y_start + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, LIGHT_ORANGE, 1)
        cv2.putText(frame, f"Blink Rate: {result['blink_rate']}/min",
                    (x_label, y_start + 38), cv2.FONT_HERSHEY_SIMPLEX, 0.5, LIGHT_ORANGE, 1)
        cv2.putText(frame, f"Posture: {result['posture']}",
                    (x_label, y_start + 58), cv2.FONT_HERSHEY_SIMPLEX, 0.5, LIGHT_ORANGE, 1)
        cv2.putText(frame, f"Fidget: {result['fidget_score']}",
                    (x_label, y_start + 78), cv2.FONT_HERSHEY_SIMPLEX, 0.5, LIGHT_ORANGE, 1)
        cv2.putText(frame, f"Hands: {result['hand_position']}",
                    (x_label, y_start + 98), cv2.FONT_HERSHEY_SIMPLEX, 0.5, LIGHT_ORANGE, 1)

        # Estimated values (these use guessed thresholds)
        cv2.putText(frame, "-- Estimated --", (x_label, y_start + 122),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, GRAY, 1)
        cv2.putText(frame, f"Expression: {result['expression']} (est.)",
                    (x_label, y_start + 140), cv2.FONT_HERSHEY_SIMPLEX, 0.5, ORANGE, 2)
        # Show score breakdown
        cv2.putText(frame, f"Score: {result.get('score_breakdown', '')}",
                    (x_label, y_start + 160), cv2.FONT_HERSHEY_SIMPLEX, 0.4, GRAY, 1)

        # Confidence bar at top — labeled as "Estimated"
        bar_w = int(score * w / 100)
        cv2.rectangle(frame, (0, 0), (w, 28), (30, 30, 30), -1)
        cv2.rectangle(frame, (0, 0), (bar_w, 28), c, -1)
        cv2.putText(frame, f"Est. Confidence: {score}/100", (10, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        return frame

    def reset(self):
        self.blink_times.clear()
        self.prev_blink_val = 0
        self.eye_contact_hist.clear()
        self.pose_history.clear()
        self.expr_history.clear()
        self.baseline = None
        self.calibration_frames = []
        self.frames_processed = 0
        self.frames_multi_face = 0
