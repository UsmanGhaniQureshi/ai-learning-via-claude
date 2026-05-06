# Version 1.0 — Single Hall System

## BUILD THIS AFTER: Phase 7 (System Building)

## What This Version Does

This is the REAL product. Not a demo. Not a prototype. A system you can actually install in ONE exam hall and use during a real exam.

```
4-5 cameras in one hall
    ↓
Full AI detection pipeline (phone + gaze + pose + anomaly)
    ↓
Dashboard for invigilator (live feeds, alerts, evidence)
    ↓
Database (all alerts stored, evidence clips saved)
    ↓
API connecting everything
    ↓
Runs reliably for 3+ hours
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EXAM HALL A-101                           │
│                                                             │
│  Camera 1 ──┐                                               │
│  Camera 2 ──┤                                               │
│  Camera 3 ──┼──→ Local Server (GPU) ──→ Dashboard (Laptop)  │
│  Camera 4 ──┤        ↕                                      │
│  Camera 5 ──┘    Database                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Local Server: NVIDIA GPU desktop or workstation
  - Runs all AI models
  - Hosts the API
  - Runs the database
  - Stores evidence clips

Dashboard Laptop: The invigilator's screen
  - Opens browser to http://server-ip:3000
  - Shows live camera grid
  - Shows alerts with evidence
  - Confirm/dismiss buttons
```

---

## Hardware Requirements

```
Component              Specification              Estimated Cost
─────────────────────────────────────────────────────────────────
GPU Server             NVIDIA RTX 3080+ (10GB+)   $1,500-2,500
                       16GB RAM, 1TB SSD
IP Cameras (x5)       1080p, RTSP support         $100-200 each
Network Switch         Gigabit, PoE (powers cams)  $100-200
Invigilator Laptop     Any modern laptop           Already have
Ethernet Cables        Cat6, various lengths        $30-50
UPS (Battery Backup)   30 minutes backup           $200-400
─────────────────────────────────────────────────────────────────
TOTAL ESTIMATED:                                   $2,500-4,000
```

---

## What to Build: Component by Component

### Component 1: Camera Manager

```python
"""
Manages all camera connections.
Handles disconnects, reconnects, and health monitoring.
"""

import cv2
import threading
import time
from collections import deque

class CameraManager:
    def __init__(self):
        self.cameras = {}
        self.frames = {}
        self.status = {}

    def add_camera(self, cam_id, rtsp_url, name):
        """Add a camera to the system."""
        self.cameras[cam_id] = {
            'url': rtsp_url,
            'name': name,
            'cap': None,
        }
        self.frames[cam_id] = None
        self.status[cam_id] = 'connecting'

        # Start reading in background
        thread = threading.Thread(
            target=self._read_loop, args=(cam_id,), daemon=True
        )
        thread.start()

    def _read_loop(self, cam_id):
        """Continuously read frames from camera."""
        while True:
            try:
                cap = cv2.VideoCapture(self.cameras[cam_id]['url'])
                if not cap.isOpened():
                    self.status[cam_id] = 'offline'
                    time.sleep(5)
                    continue

                self.status[cam_id] = 'online'

                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break
                    self.frames[cam_id] = frame

                self.status[cam_id] = 'reconnecting'
                cap.release()
                time.sleep(2)

            except Exception as e:
                self.status[cam_id] = 'error'
                time.sleep(5)

    def get_frame(self, cam_id):
        return self.frames.get(cam_id)

    def get_all_status(self):
        return {cid: self.status[cid] for cid in self.cameras}

# Usage:
cam_mgr = CameraManager()
cam_mgr.add_camera(1, "rtsp://192.168.1.10:554/stream1", "Front-Left")
cam_mgr.add_camera(2, "rtsp://192.168.1.11:554/stream1", "Front-Right")
cam_mgr.add_camera(3, "rtsp://192.168.1.12:554/stream1", "Back-Left")
cam_mgr.add_camera(4, "rtsp://192.168.1.13:554/stream1", "Back-Right")
cam_mgr.add_camera(5, "rtsp://192.168.1.14:554/stream1", "Center")
```

### Component 2: AI Pipeline

```python
"""
Processes frames from all cameras through the full AI pipeline.
"""

class AIPipeline:
    def __init__(self):
        self.yolo = YOLO("phone_detector.pt")
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(...)
        self.pose = mp.solutions.pose.Pose(...)
        self.autoencoder = load_autoencoder("autoencoder.pt")
        self.scorer = ConfidenceScorer()

    def process_frame(self, frame, camera_id):
        """Run full AI analysis on a single frame."""

        # 1. Object detection
        phone_result = self.detect_phones(frame)

        # 2. Gaze tracking
        gaze_result = self.track_gaze(frame)

        # 3. Body pose
        pose_result = self.analyze_pose(frame)

        # 4. Anomaly check
        anomaly_result = self.check_anomaly(frame)

        # 5. Combine scores
        signals = {
            'phone_detected': phone_result.confidence,
            'gaze_at_neighbor': gaze_result.score,
            'body_leaning': pose_result.lean_score,
            'hands_not_writing': 0.0 if pose_result.is_writing else 1.0,
            'anomaly_score': anomaly_result.score,
        }

        total_score, alert_level = self.scorer.calculate(signals)

        return {
            'camera_id': camera_id,
            'score': total_score,
            'level': alert_level,
            'signals': signals,
            'detections': phone_result.detections,
            'frame': frame
        }
```

### Component 3: Alert Manager

```python
"""
Manages alerts: creates, stores, sends to dashboard.
"""

class AlertManager:
    def __init__(self, db, evidence_dir="/evidence"):
        self.db = db
        self.evidence_dir = evidence_dir
        self.active_alerts = []

    def create_alert(self, ai_result, exam_id):
        """Create a new alert from AI pipeline result."""
        if ai_result['level'] in ['MEDIUM', 'HIGH']:
            # Save evidence clip
            evidence_path = self.save_evidence(ai_result['frame'], ai_result)

            # Create alert record
            alert = {
                'exam_id': exam_id,
                'camera_id': ai_result['camera_id'],
                'alert_type': self.determine_type(ai_result['signals']),
                'confidence': ai_result['score'],
                'priority': ai_result['level'].lower(),
                'evidence_path': evidence_path,
                'signals': ai_result['signals'],
                'status': 'pending'
            }

            # Save to database
            alert_id = self.db.save_alert(alert)
            alert['id'] = alert_id

            # Add to active list
            self.active_alerts.append(alert)

            return alert

        return None

    def determine_type(self, signals):
        """Determine the primary alert type from signals."""
        max_signal = max(signals, key=signals.get)
        type_map = {
            'phone_detected': 'phone_on_desk',
            'gaze_at_neighbor': 'sustained_gaze',
            'body_leaning': 'suspicious_posture',
            'anomaly_score': 'unusual_behavior',
        }
        return type_map.get(max_signal, 'general_suspicion')
```

### Component 4: Main Orchestrator

```python
"""
ExamGuard v1.0 — Single Hall System
Main entry point that coordinates all components.
"""

import time
import logging

logging.basicConfig(level=logging.INFO,
                   format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger('examguard')

class ExamGuardV1:
    def __init__(self, config):
        self.config = config
        self.camera_mgr = CameraManager()
        self.ai_pipeline = AIPipeline()
        self.alert_mgr = AlertManager(database, evidence_dir)
        self.running = False

        # Setup cameras from config
        for cam in config['cameras']:
            self.camera_mgr.add_camera(cam['id'], cam['url'], cam['name'])

    def start(self):
        """Start monitoring."""
        self.running = True
        logger.info("ExamGuard v1.0 starting...")
        logger.info(f"Monitoring {len(self.config['cameras'])} cameras")

        frame_count = 0

        while self.running:
            for cam_id in self.camera_mgr.cameras:
                frame = self.camera_mgr.get_frame(cam_id)
                if frame is None:
                    continue

                frame_count += 1

                # Skip frames for performance
                if frame_count % 3 != 0:
                    continue

                # Run AI pipeline
                result = self.ai_pipeline.process_frame(frame, cam_id)

                # Create alert if needed
                alert = self.alert_mgr.create_alert(result, self.config['exam_id'])

                if alert:
                    logger.info(f"ALERT [{alert['priority'].upper()}]: "
                              f"Camera {cam_id}, {alert['alert_type']}, "
                              f"confidence {alert['confidence']:.2f}")

    def stop(self):
        """Stop monitoring and generate report."""
        self.running = False
        report = self.generate_report()
        logger.info("ExamGuard stopped. Report generated.")
        return report

    def generate_report(self):
        """Generate end-of-exam report."""
        alerts = self.alert_mgr.active_alerts
        return {
            'total_alerts': len(alerts),
            'high_priority': sum(1 for a in alerts if a['priority'] == 'high'),
            'medium_priority': sum(1 for a in alerts if a['priority'] == 'medium'),
            'confirmed': sum(1 for a in alerts if a['status'] == 'confirmed'),
            'dismissed': sum(1 for a in alerts if a['status'] == 'dismissed'),
            'pending': sum(1 for a in alerts if a['status'] == 'pending'),
        }

# Run it:
config = {
    'exam_id': 1,
    'exam_name': 'Physics Final',
    'hall': 'A-101',
    'cameras': [
        {'id': 1, 'url': 'rtsp://192.168.1.10:554/stream1', 'name': 'Front-Left'},
        {'id': 2, 'url': 'rtsp://192.168.1.11:554/stream1', 'name': 'Front-Right'},
        {'id': 3, 'url': 'rtsp://192.168.1.12:554/stream1', 'name': 'Back-Left'},
        {'id': 4, 'url': 'rtsp://192.168.1.13:554/stream1', 'name': 'Back-Right'},
    ]
}

examguard = ExamGuardV1(config)
examguard.start()
```

---

## Deployment Checklist for v1.0

```
PRE-EXAM (1 day before):
[ ] Install cameras in hall
[ ] Verify every seat is visible from at least one camera
[ ] Test network connectivity
[ ] Run ExamGuard for 30 minutes — verify stable
[ ] Test dashboard on invigilator laptop
[ ] Verify UPS battery is charged
[ ] Prepare consent forms for students

EXAM DAY (1 hour before):
[ ] Power on server and cameras
[ ] Run health check (all cameras online, GPU working, database connected)
[ ] Open dashboard on invigilator laptop
[ ] Brief invigilator on dashboard usage
[ ] Distribute and collect consent forms

DURING EXAM:
[ ] Monitor system health every 30 minutes
[ ] Be available for technical issues
[ ] Invigilator reviews and acts on alerts

AFTER EXAM:
[ ] Generate exam report
[ ] Review all pending alerts with invigilator
[ ] Back up evidence and database
[ ] Collect feedback from invigilator
[ ] Document issues for improvement
```

---

## Success Criteria for v1.0

```
Metric                           Target
──────────────────────────────────────────
Cameras: 4-5 connected            All online
Processing: Real-time              > 10 fps per camera
Uptime: 3-hour exam               > 99% (< 2 min total downtime)
Dashboard: Responsive              Updates < 2 seconds
Alerts: Accurate                   > 80% precision
Evidence: Saved                    Every alert has video clip
Report: Generated                  Automatic end-of-exam report
```

---

## This IS ExamGuard

v1.0 is not a toy or a demo. It is a deployable product.

After successful pilot testing with v1.0, you scale to v2.0: multiple halls, edge computing, full production deployment.
