# Version 2.0 — Multi-Hall System

## BUILD THIS AFTER: Phase 8 (Testing)

## What This Version Does

The COMPLETE ExamGuard product. Multiple exam halls, dozens of cameras, central control room, edge computing, full reporting, and production-grade reliability.

```
Hall A (5 cameras) ──→ Edge Devices ──→ ┐
Hall B (5 cameras) ──→ Edge Devices ──→ │
Hall C (5 cameras) ──→ Edge Devices ──→ ├──→ Central Server ──→ Control Room
Hall D (5 cameras) ──→ Edge Devices ──→ │    (GPU Cluster)      Dashboard
...                                      │
Hall J (5 cameras) ──→ Edge Devices ──→ ┘

50+ cameras  →  Edge filtering  →  Central AI  →  Unified Dashboard
```

---

## What Changes from v1.0 to v2.0

```
Feature              v1.0 (Single Hall)       v2.0 (Multi-Hall)
──────────────────────────────────────────────────────────────────
Cameras              4-5                      50-200
Halls                1                        10-50
Processing           1 GPU server             GPU cluster + edge devices
Dashboard            1 invigilator screen     Central control room
Database             Local SQLite/PostgreSQL  Distributed PostgreSQL
Network              Simple LAN               Campus-wide network
Redundancy           None                     Failover, backups
Management           Manual start             Automated management
Reports              Per-exam                 Per-institution, analytics
```

---

## System Architecture

```
┌──────────── Hall A ────────────┐
│ Cam1─┐                         │
│ Cam2─┼─→ Edge Device A ──→ Network ──┐
│ Cam3─┤   (Jetson Orin)               │
│ Cam4─┘   Quick YOLO filter           │
└────────────────────────────────┘      │
                                        │
┌──────────── Hall B ────────────┐      │     ┌─── Central Server ───┐
│ Cam5─┐                         │      │     │                      │
│ Cam6─┼─→ Edge Device B ──→ Network ──┼──→  │  GPU Cluster         │
│ Cam7─┤                               │     │  (2-4 GPUs)          │
│ Cam8─┘                               │     │                      │
└────────────────────────────────┘      │     │  Full AI Pipeline    │
                                        │     │  Database            │
┌──────────── Hall C ────────────┐      │     │  API Server          │
│ Cam9 ─┐                        │      │     │  Alert Manager       │
│ Cam10─┼─→ Edge Device C ──→ Network ──┘     │                      │
│ Cam11─┤                               │     └─────────┬────────────┘
│ Cam12─┘                               │               │
└────────────────────────────────┘      │               ↓
                                               ┌── Control Room ──┐
                                               │ Dashboard (web)  │
                                               │ Multiple screens │
                                               │ Admin panel      │
                                               └──────────────────┘
```

---

## Key Components to Build

### Component 1: Edge Device Software

Each hall gets 1-2 edge devices (NVIDIA Jetson) that pre-filter frames.

```python
"""
Edge device script — runs on Jetson at each hall.
Filters out normal frames, sends only suspicious ones to central server.
"""

class EdgeProcessor:
    def __init__(self, hall_id, camera_urls, server_url):
        self.hall_id = hall_id
        self.model = YOLO("yolov8n.engine")  # TensorRT optimized
        self.server_url = server_url
        self.cameras = {}

        for cam_id, url in camera_urls.items():
            self.cameras[cam_id] = cv2.VideoCapture(url)

    def run(self):
        """Main processing loop."""
        frame_count = 0

        while True:
            for cam_id, cap in self.cameras.items():
                ret, frame = cap.read()
                if not ret:
                    continue

                frame_count += 1
                if frame_count % 3 != 0:  # Process every 3rd frame
                    continue

                # Quick YOLO check
                results = self.model(frame, verbose=False)
                is_suspicious = self.check_suspicious(results)

                if is_suspicious:
                    # Send to central server for deep analysis
                    self.send_to_server(frame, cam_id, results)

                # Always send heartbeat every 30 seconds
                if frame_count % 900 == 0:  # 30fps * 30sec
                    self.send_heartbeat(cam_id)

    def check_suspicious(self, results):
        """Quick check: anything worth sending to server?"""
        suspicious_objects = ['cell phone', 'book']
        for box in results[0].boxes:
            class_name = self.model.names[int(box.cls)]
            if class_name in suspicious_objects and float(box.conf) > 0.5:
                return True
        return False

    def send_to_server(self, frame, cam_id, results):
        """Send suspicious frame to central server."""
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        try:
            requests.post(
                f"{self.server_url}/api/edge/frame",
                files={'frame': buffer.tobytes()},
                data={
                    'hall_id': self.hall_id,
                    'camera_id': cam_id,
                    'timestamp': time.time(),
                },
                timeout=3
            )
        except requests.exceptions.RequestException:
            pass  # Log error, continue processing
```

### Component 2: Central Server API

```python
"""
Central server receives frames from edge devices and runs full analysis.
"""

from fastapi import FastAPI, UploadFile, File, Form

app = FastAPI(title="ExamGuard Central Server v2.0")

# Load full AI models (more powerful than edge)
full_pipeline = FullAIPipeline()

@app.post("/api/edge/frame")
async def receive_edge_frame(
    frame: UploadFile = File(...),
    hall_id: str = Form(...),
    camera_id: int = Form(...),
    timestamp: float = Form(...)
):
    """Receive a suspicious frame from an edge device."""
    # Decode frame
    contents = await frame.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Run full AI pipeline
    result = full_pipeline.process(image, hall_id, camera_id)

    if result['level'] in ['MEDIUM', 'HIGH']:
        # Create alert
        alert_manager.create_alert(result)

    return {"status": "processed", "result": result['level']}

@app.get("/api/halls")
def list_halls():
    """List all halls and their status."""
    return hall_manager.get_all_status()

@app.get("/api/halls/{hall_id}/alerts")
def get_hall_alerts(hall_id: str):
    """Get alerts for a specific hall."""
    return alert_manager.get_alerts_by_hall(hall_id)

@app.get("/api/dashboard/summary")
def dashboard_summary():
    """Get summary for the central control room dashboard."""
    return {
        'halls_online': hall_manager.count_online(),
        'halls_total': hall_manager.count_total(),
        'cameras_online': camera_manager.count_online(),
        'cameras_total': camera_manager.count_total(),
        'active_alerts': alert_manager.count_active(),
        'alerts_today': alert_manager.count_today(),
        'confirmed_today': alert_manager.count_confirmed_today(),
        'system_health': health_monitor.get_status()
    }
```

### Component 3: Multi-Hall Dashboard

```
The control room dashboard shows:

┌─────────────────────────────────────────────────────────────────┐
│  ExamGuard v2.0 — Central Control Room                         │
│  Halls: 10/10 online | Cameras: 48/50 online | Alerts: 12     │
├──────────────────────────────┬──────────────────────────────────┤
│                              │                                  │
│  HALL OVERVIEW               │  ACTIVE ALERTS                   │
│                              │                                  │
│  Hall A: 🟢 5/5 cams | 2    │  🔴 Hall C Cam 3 - Phone        │
│  Hall B: 🟢 5/5 cams | 0    │     Seat B4 | 92% | 14:23:05    │
│  Hall C: 🟡 4/5 cams | 3    │     [View] [Assign] [Dismiss]   │
│  Hall D: 🟢 5/5 cams | 1    │                                  │
│  Hall E: 🟢 5/5 cams | 0    │  🟡 Hall A Cam 2 - Gaze         │
│  Hall F: 🔴 3/5 cams | 0    │     Seat D1 | 78% | 14:22:50    │
│  Hall G: 🟢 5/5 cams | 2    │     [View] [Assign] [Dismiss]   │
│  Hall H: 🟢 5/5 cams | 1    │                                  │
│  Hall I: 🟢 5/5 cams | 0    │  🟢 Hall G Cam 1 - Anomaly      │
│  Hall J: 🟢 5/5 cams | 3    │     Seat A3 | 65% | 14:22:30    │
│                              │     [View] [Assign] [Dismiss]   │
│  Click hall to see cameras   │                                  │
│                              │  + 9 more alerts...              │
├──────────────────────────────┴──────────────────────────────────┤
│  TODAY'S STATS: 87 alerts | 62 confirmed | 18 dismissed | 7 ⏳ │
└─────────────────────────────────────────────────────────────────┘
```

### Component 4: Analytics and Reporting

```python
"""
Post-exam analytics for v2.0.
"""

class AnalyticsEngine:
    def generate_institution_report(self, date):
        """Generate report across ALL halls for a given date."""
        return {
            'date': date,
            'halls_monitored': 10,
            'total_students': 2000,
            'total_alerts': 87,
            'confirmed_cheating': 62,
            'false_alarms': 18,
            'pending': 7,
            'precision': 62 / (62 + 18),  # 77.5%
            'detection_types': {
                'phone_detected': 25,
                'sustained_gaze': 30,
                'note_passing': 5,
                'unusual_behavior': 15,
                'other': 12
            },
            'hall_comparison': {
                'Hall A': {'alerts': 12, 'confirmed': 9},
                'Hall B': {'alerts': 5, 'confirmed': 4},
                # ...
            },
            'camera_performance': {
                'most_alerts': 'Hall C Cam 3 (15 alerts)',
                'cameras_offline_during_exam': ['Hall F Cam 4', 'Hall F Cam 5'],
            },
            'system_performance': {
                'average_alert_latency': '1.8 seconds',
                'system_uptime': '99.7%',
                'total_frames_processed': 5400000,
            },
            'recommendations': [
                'Hall F network needs repair (2 cameras offline)',
                'Camera 3 in Hall C may need repositioning (too many alerts)',
                'Consider adding camera to Hall B corner (blind spot reported)',
            ]
        }
```

---

## Scaling Considerations

### Network Architecture

```
Campus Network:
  Core Switch (10 Gbps)
      ↓
  Building Switches (1 Gbps)
      ↓
  Hall Switches (1 Gbps, PoE)
      ↓
  Cameras (100 Mbps each)

Bandwidth calculation:
  50 cameras × 5 Mbps each (compressed) = 250 Mbps
  With edge filtering (only 10% sent): 25 Mbps to central server
  Well within 1 Gbps capacity
```

### Server Scaling

```
Small deployment (10-20 cameras):
  1 server, 1 GPU (RTX 3080)

Medium deployment (20-50 cameras):
  1 server, 2 GPUs (RTX 4080)
  Edge devices at each hall

Large deployment (50-200 cameras):
  2 servers, 4 GPUs total
  Edge devices at each hall
  Load balancer distributes work

Enterprise deployment (200+ cameras):
  Cloud-based GPU cluster
  Edge devices required at every hall
  Distributed database
  Multiple dashboard instances
```

### Reliability

```
v1.0: If server crashes → monitoring stops
v2.0: Redundancy at every level

Camera fails     → Other cameras in the hall cover
Edge device fails → Frames go directly to central server (slower but works)
Central GPU fails → Second GPU takes over
Database fails    → Redis cache maintains recent alerts
Network fails     → Edge devices store locally, sync when network returns
Dashboard fails   → Secondary dashboard URL available
Power fails       → UPS at each hall gives 30 minutes
```

---

## Development Timeline (Realistic)

```
After completing v1.0 and successful pilot testing:

Month 1:  Design v2.0 architecture, order hardware
Month 2:  Build edge device software, test on Jetson
Month 3:  Build central server, multi-hall API
Month 4:  Build control room dashboard
Month 5:  Build analytics and reporting
Month 6:  Integration testing with 2-3 halls
Month 7:  Pilot testing with real exams
Month 8:  Fix issues from pilot, optimize
Month 9:  Scale to 5-10 halls
Month 10: Full deployment
```

---

## Success Criteria for v2.0

```
Metric                          Target
──────────────────────────────────────────
Halls supported                 10+ simultaneously
Cameras per hall                5
Total cameras                   50+
Processing latency              < 3 seconds per alert
System uptime                   > 99.9% (< 3 min downtime per exam)
Alert precision                 > 85%
Alert recall                    > 90%
Edge filtering rate             > 85% of frames filtered
Central server GPU utilization  < 80%
Dashboard response time         < 1 second
Report generation               Automatic within 5 minutes of exam end
```

---

## This Is the Complete Product

v2.0 is what you pitch to universities and exam boards. It is:
- Scalable: Works for 10 students or 10,000
- Reliable: Redundancy at every level
- Ethical: Human-in-the-loop, consent, data protection
- Useful: Real-time alerts, evidence clips, analytics

From learning "what is a neural network" to deploying a multi-hall AI surveillance system — this is the complete journey.
