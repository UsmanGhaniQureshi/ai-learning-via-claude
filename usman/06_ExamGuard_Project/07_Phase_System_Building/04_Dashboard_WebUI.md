# Dashboard & Web UI — The Invigilator's Screen

## What Is This?

You have built all the AI models. They can detect phones, track gaze, spot anomalies, and make decisions. But right now, the output is just text in a terminal:

```
[14:23:05] Camera 3: Phone detected, confidence 0.92
[14:23:07] Camera 7: Suspicious gaze pattern, student seat B4
[14:23:12] Camera 1: Anomaly detected, reconstruction error 0.45
```

An invigilator cannot stare at terminal text during a 3-hour exam. They need a VISUAL dashboard.

**The dashboard is the HUMAN INTERFACE** — where all AI outputs become useful, actionable information on a screen.

---

## What the Dashboard Looks Like

```
┌──────────────────────────────────────────────────────────────┐
│  ExamGuard Dashboard          Hall: A-101    Exam: Physics   │
├────────────────────────────────────┬─────────────────────────┤
│                                    │   ALERTS (3 active)     │
│  ┌──────────┐  ┌──────────┐      │                         │
│  │ Camera 1 │  │ Camera 2 │      │  🔴 HIGH: Camera 3      │
│  │          │  │          │      │  Phone on desk - Seat C2│
│  └──────────┘  └──────────┘      │  [View] [Dismiss]       │
│                                    │                         │
│  ┌──────────┐  ┌──────────┐      │  🟡 MED: Camera 7       │
│  │ Camera 3 │  │ Camera 4 │      │  Sustained gaze - B4    │
│  │ (RED     │  │          │      │  [View] [Dismiss]       │
│  │  BORDER) │  │          │      │                         │
│  └──────────┘  └──────────┘      │  🟢 LOW: Camera 1       │
│                                    │  Unusual movement - A1  │
├────────────────────────────────────┤  [View] [Dismiss]       │
│  Stats: 23 alerts today           │                         │
│  Confirmed: 18 | False: 5         │  History ▼              │
│  System: All cameras online       │  ...                    │
└────────────────────────────────────┴─────────────────────────┘
```

---

## WHY ExamGuard Needs This

### AI Is Not the Final Decision Maker

ExamGuard is a TOOL for invigilators, not a replacement:

```
AI detects something suspicious
    ↓
Dashboard shows alert with evidence
    ↓
Invigilator reviews the evidence
    ↓
Invigilator decides: real cheating or false alarm
    ↓
Invigilator's decision is recorded
    ↓
AI learns from this feedback (gets better over time)
```

### What the Invigilator Needs

1. **Live camera feeds** — see all cameras at once
2. **Alert notifications** — know immediately when something is flagged
3. **Priority levels** — high alerts first, low alerts later
4. **Evidence clips** — short video showing what triggered the alert
5. **One-click actions** — confirm cheating, dismiss false alarm, request closer look
6. **Statistics** — how many alerts, accuracy rate, active cameras

---

## Technology Stack

### Backend: FastAPI (Python)

```
FastAPI handles:
- Receiving alerts from AI models
- Serving camera feeds to the browser
- Managing the database
- Sending real-time updates to the dashboard

Why FastAPI?
- Written in Python (same as your AI code!)
- FAST (async support)
- Easy to learn
- Great documentation
```

### Frontend: HTML + CSS + JavaScript

```
The browser displays:
- Camera grid
- Alert panel
- Statistics
- Interactive buttons

You do NOT need React or Vue for the first version.
Plain HTML + CSS + JavaScript is enough.
```

### Real-Time Updates: WebSockets

```
Normal web: Browser asks server "any updates?" every 5 seconds (polling)
WebSocket: Server PUSHES updates to browser instantly (real-time)

For ExamGuard: When AI detects something, dashboard shows it IMMEDIATELY.
```

---

## Building the Dashboard Step by Step

### Step 1: Basic Flask Web Server

```python
from flask import Flask, render_template, Response
import cv2

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('dashboard.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

### Step 2: HTML Dashboard Template

Create `templates/dashboard.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>ExamGuard Dashboard</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: #1a1a2e;
            color: white;
        }
        .header {
            text-align: center;
            padding: 10px;
            background: #16213e;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .container {
            display: flex;
            gap: 20px;
        }
        .camera-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            flex: 2;
        }
        .camera-feed {
            background: #0f3460;
            border-radius: 10px;
            padding: 10px;
            text-align: center;
        }
        .camera-feed img {
            width: 100%;
            border-radius: 5px;
        }
        .camera-feed.alert {
            border: 3px solid red;
            animation: pulse 1s infinite;
        }
        @keyframes pulse {
            0% { border-color: red; }
            50% { border-color: transparent; }
            100% { border-color: red; }
        }
        .alert-panel {
            flex: 1;
            background: #16213e;
            border-radius: 10px;
            padding: 15px;
        }
        .alert-item {
            background: #0f3460;
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 10px;
        }
        .alert-high { border-left: 4px solid red; }
        .alert-medium { border-left: 4px solid orange; }
        .alert-low { border-left: 4px solid green; }
        .btn {
            padding: 5px 10px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin: 2px;
        }
        .btn-confirm { background: #e94560; color: white; }
        .btn-dismiss { background: #533483; color: white; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ExamGuard Dashboard</h1>
        <p>Hall: A-101 | Exam: Physics | Time: <span id="clock"></span></p>
    </div>

    <div class="container">
        <div class="camera-grid">
            <div class="camera-feed" id="cam1">
                <h3>Camera 1 - Front Left</h3>
                <img src="/video_feed/1" alt="Camera 1">
            </div>
            <div class="camera-feed" id="cam2">
                <h3>Camera 2 - Front Right</h3>
                <img src="/video_feed/2" alt="Camera 2">
            </div>
            <div class="camera-feed" id="cam3">
                <h3>Camera 3 - Back Left</h3>
                <img src="/video_feed/3" alt="Camera 3">
            </div>
            <div class="camera-feed" id="cam4">
                <h3>Camera 4 - Back Right</h3>
                <img src="/video_feed/4" alt="Camera 4">
            </div>
        </div>

        <div class="alert-panel">
            <h2>Alerts</h2>
            <div id="alerts">
                <!-- Alerts will be added here dynamically -->
            </div>
            <hr>
            <h3>Statistics</h3>
            <p>Total alerts: <span id="total-alerts">0</span></p>
            <p>Confirmed: <span id="confirmed">0</span></p>
            <p>Dismissed: <span id="dismissed">0</span></p>
        </div>
    </div>

    <script>
        // Update clock
        setInterval(() => {
            document.getElementById('clock').textContent =
                new Date().toLocaleTimeString();
        }, 1000);

        // Connect to WebSocket for real-time alerts
        const ws = new WebSocket('ws://localhost:5000/ws');

        ws.onmessage = function(event) {
            const alert = JSON.parse(event.data);
            addAlert(alert);
        };

        function addAlert(alert) {
            const alertsDiv = document.getElementById('alerts');
            const alertHtml = `
                <div class="alert-item alert-${alert.priority}">
                    <strong>${alert.priority.toUpperCase()}</strong>: Camera ${alert.camera_id}<br>
                    ${alert.description}<br>
                    Seat: ${alert.seat} | Confidence: ${(alert.confidence * 100).toFixed(0)}%<br>
                    <button class="btn btn-confirm" onclick="confirmAlert(${alert.id})">Confirm</button>
                    <button class="btn btn-dismiss" onclick="dismissAlert(${alert.id})">Dismiss</button>
                </div>
            `;
            alertsDiv.insertAdjacentHTML('afterbegin', alertHtml);

            // Highlight the camera feed
            document.getElementById('cam' + alert.camera_id).classList.add('alert');

            // Update counter
            const total = document.getElementById('total-alerts');
            total.textContent = parseInt(total.textContent) + 1;
        }

        function confirmAlert(id) {
            fetch('/api/alert/' + id + '/confirm', {method: 'POST'});
            const confirmed = document.getElementById('confirmed');
            confirmed.textContent = parseInt(confirmed.textContent) + 1;
        }

        function dismissAlert(id) {
            fetch('/api/alert/' + id + '/dismiss', {method: 'POST'});
            const dismissed = document.getElementById('dismissed');
            dismissed.textContent = parseInt(dismissed.textContent) + 1;
        }
    </script>
</body>
</html>
```

### Step 3: Video Streaming from Camera

```python
from flask import Flask, render_template, Response
import cv2

app = Flask(__name__)

def generate_frames(camera_id):
    """Stream video frames as MJPEG."""
    # In real system, connect to RTSP camera
    # For testing, use webcam
    cap = cv2.VideoCapture(0)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Encode frame as JPEG
        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        # Yield as multipart response (MJPEG stream)
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed/<int:camera_id>')
def video_feed(camera_id):
    return Response(
        generate_frames(camera_id),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

@app.route('/')
def index():
    return render_template('dashboard.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### Step 4: WebSocket for Real-Time Alerts

```python
from flask import Flask
from flask_socketio import SocketIO, emit
import json

app = Flask(__name__)
socketio = SocketIO(app)

def send_alert(alert_data):
    """Called by AI system when something suspicious is detected."""
    socketio.emit('new_alert', json.dumps(alert_data))

# Example: AI detects something
alert = {
    'id': 1,
    'camera_id': 3,
    'priority': 'high',
    'description': 'Phone detected on desk',
    'seat': 'C2',
    'confidence': 0.92,
    'timestamp': '14:23:05'
}
send_alert(alert)
```

---

## What You Need to Learn

### Web Development Basics (Just Enough)

1. **HTML** — Structure of the page (headings, divs, images)
2. **CSS** — Styling (colors, layout, animations)
3. **JavaScript** — Interactivity (buttons, real-time updates)
4. **Flask** — Python web framework (serves pages, handles API calls)
5. **WebSockets** — Real-time two-way communication

### You Do NOT Need to Be a Web Developer

You only need enough to build a functional dashboard. It does not need to look like a professional website. FUNCTION over FORM.

---

## Mini Project: Simple Dashboard with Webcam + Fake Alerts

### Goal
Build a basic dashboard that shows your webcam feed and displays fake alerts.

**Step 1: Install Flask**
```bash
pip install flask flask-socketio
```

**Step 2: Create Project Structure**
```
dashboard_project/
├── app.py
├── templates/
│   └── dashboard.html
└── static/
    └── style.css
```

**Step 3: Create app.py**
```python
from flask import Flask, render_template, Response, jsonify
import cv2
import time
import threading
import random

app = Flask(__name__)

# Store alerts
alerts = []
alert_id = 0

def generate_frames():
    cap = cv2.VideoCapture(0)
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        _, buffer = cv2.imencode('.jpg', frame)
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

@app.route('/')
def index():
    return render_template('dashboard.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/alerts')
def get_alerts():
    return jsonify(alerts[-10:])  # Last 10 alerts

# Simulate fake alerts every 10 seconds (for testing)
def fake_alert_generator():
    global alert_id
    descriptions = [
        "Phone detected on desk",
        "Sustained gaze at neighbor",
        "Unusual hand movement",
        "Possible note passing",
        "Student looking at another paper"
    ]
    priorities = ["high", "medium", "low"]
    seats = ["A1", "B3", "C2", "D5", "E4"]

    while True:
        time.sleep(random.randint(5, 15))
        alert_id += 1
        alert = {
            'id': alert_id,
            'description': random.choice(descriptions),
            'priority': random.choice(priorities),
            'seat': random.choice(seats),
            'confidence': round(random.uniform(0.6, 0.99), 2),
            'time': time.strftime("%H:%M:%S")
        }
        alerts.append(alert)
        print(f"New alert: {alert}")

# Start fake alerts in background
threading.Thread(target=fake_alert_generator, daemon=True).start()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

**Step 4: Run It**
```bash
python app.py
# Open browser: http://localhost:5000
```

You should see your webcam feed and alerts appearing every few seconds. This is the FOUNDATION of ExamGuard's dashboard.

---

## Key Takeaways

1. **The dashboard is where AI becomes useful** — without it, the AI is just printing text
2. **Flask + HTML/CSS/JS is enough** — you do not need React or complex frameworks to start
3. **WebSockets provide real-time updates** — alerts appear instantly, not on page refresh
4. **Human-in-the-loop is the design** — AI flags, dashboard presents, human decides
5. **Start simple** — webcam feed + fake alerts. Add complexity gradually.
6. **The dashboard IS the product** — from the invigilator's perspective, the dashboard IS ExamGuard
