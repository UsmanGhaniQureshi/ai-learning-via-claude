# REST API — How Parts of the System Talk to Each Other

## What Is This?

ExamGuard is not ONE program. It is MANY programs working together:

```
Camera Reader → sends frames to → AI Engine
AI Engine → sends alerts to → Dashboard
Dashboard → sends actions to → Database
Database → sends history to → Report Generator
```

How do these separate programs communicate? Through an **API (Application Programming Interface)**.

A **REST API** is a standard way for programs to send and receive data over a network using simple HTTP requests — the same technology your web browser uses.

---

## How Does It Work? (Simple Explanation)

Think of a REST API like a waiter in a restaurant:

```
You (the client)     →  "I want a pizza"     →  Waiter (API)
Waiter (API)         →  Takes order to        →  Kitchen (server)
Kitchen (server)     →  Makes pizza           →  Waiter (API)
Waiter (API)         →  Delivers pizza        →  You (the client)
```

In code:
```
Dashboard (client)   →  GET /api/alerts       →  Server (API)
Server (API)         →  Queries database      →  Database
Database             →  Returns data          →  Server (API)
Server (API)         →  Sends JSON response   →  Dashboard (client)
```

### The Four Main Actions (HTTP Methods)

```
GET    = Read data      "Show me all alerts"
POST   = Create data    "Add a new alert"
PUT    = Update data    "Change alert status to confirmed"
DELETE = Remove data    "Delete this old alert"
```

### What Is JSON?

JSON is the FORMAT that data travels in. It looks like a Python dictionary:

```json
{
    "id": 1,
    "camera_id": 3,
    "alert_type": "phone_detected",
    "seat": "C2",
    "confidence": 0.92,
    "priority": "high",
    "status": "pending"
}
```

Every API sends and receives data in JSON format.

---

## WHY ExamGuard Needs APIs

### The Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Camera     │────▶│   REST API   │────▶│  Dashboard  │
│   Module     │     │   (FastAPI)  │     │  (Browser)  │
└─────────────┘     │              │     └─────────────┘
                     │   /api/...   │
┌─────────────┐     │              │     ┌─────────────┐
│  AI Engine   │────▶│              │────▶│  Database   │
│  (Models)    │     │              │     │ (PostgreSQL)│
└─────────────┘     └──────────────┘     └─────────────┘
```

### Why Not Just One Big Program?

```
One big program:
- If AI engine crashes → EVERYTHING crashes
- If you update the dashboard → must restart AI engine too
- Cannot scale (run more AI engines for more cameras)
- Hard to develop (one person's change breaks another's code)

Separate programs + API:
- If AI engine crashes → dashboard still works, shows "AI offline"
- Update dashboard → AI engine keeps running, does not notice
- Scale: run 3 AI engines behind one API for more cameras
- Develop: different people work on different parts independently
```

---

## ExamGuard API Endpoints

### Camera Endpoints

```
GET  /api/cameras              → List all cameras and their status
GET  /api/cameras/3            → Get details of camera 3
POST /api/cameras/3/snapshot   → Get current frame from camera 3
```

### Alert Endpoints

```
GET  /api/alerts               → List all alerts (with filters)
GET  /api/alerts?priority=high → List only high-priority alerts
GET  /api/alerts/42            → Get details of alert 42
POST /api/alerts               → Create a new alert (AI engine sends this)
PUT  /api/alerts/42            → Update alert 42 (change status)
```

### Action Endpoints

```
POST /api/alerts/42/confirm    → Invigilator confirms this alert
POST /api/alerts/42/dismiss    → Invigilator dismisses this alert
```

### Statistics Endpoints

```
GET  /api/stats/exam/1         → Get statistics for exam 1
GET  /api/stats/camera/3       → Get statistics for camera 3
```

### Frame Processing Endpoint

```
POST /api/process              → Send an image, get AI analysis back
```

---

## Building with FastAPI

### Why FastAPI?

```
Flask:   Simple, widely used, synchronous
FastAPI: Modern, FAST, async, automatic documentation, type checking

For ExamGuard: FastAPI is better because:
1. It is faster (important for real-time)
2. Auto-generates API documentation
3. Built-in data validation
4. Easy to learn if you know Flask
```

### Step 1: Install

```bash
pip install fastapi uvicorn python-multipart
```

### Step 2: Basic API

```python
from fastapi import FastAPI
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

app = FastAPI(title="ExamGuard API", version="1.0")

# ─── Data Models ───

class AlertCreate(BaseModel):
    camera_id: int
    alert_type: str
    seat: str
    confidence: float
    priority: str  # "high", "medium", "low"

class Alert(BaseModel):
    id: int
    camera_id: int
    alert_type: str
    seat: str
    confidence: float
    priority: str
    status: str
    timestamp: str

# ─── In-memory storage (use database in production) ───

alerts_db = []
alert_counter = 0

# ─── Endpoints ───

@app.get("/")
def root():
    return {"message": "ExamGuard API is running"}

@app.get("/api/alerts", response_model=List[Alert])
def get_alerts(priority: Optional[str] = None):
    """Get all alerts, optionally filtered by priority."""
    if priority:
        return [a for a in alerts_db if a["priority"] == priority]
    return alerts_db

@app.get("/api/alerts/{alert_id}")
def get_alert(alert_id: int):
    """Get a specific alert by ID."""
    for alert in alerts_db:
        if alert["id"] == alert_id:
            return alert
    return {"error": "Alert not found"}

@app.post("/api/alerts")
def create_alert(alert: AlertCreate):
    """Create a new alert (called by AI engine)."""
    global alert_counter
    alert_counter += 1

    new_alert = {
        "id": alert_counter,
        "camera_id": alert.camera_id,
        "alert_type": alert.alert_type,
        "seat": alert.seat,
        "confidence": alert.confidence,
        "priority": alert.priority,
        "status": "pending",
        "timestamp": datetime.now().isoformat()
    }
    alerts_db.append(new_alert)
    return new_alert

@app.post("/api/alerts/{alert_id}/confirm")
def confirm_alert(alert_id: int):
    """Invigilator confirms this alert as real cheating."""
    for alert in alerts_db:
        if alert["id"] == alert_id:
            alert["status"] = "confirmed"
            return {"message": f"Alert {alert_id} confirmed"}
    return {"error": "Alert not found"}

@app.post("/api/alerts/{alert_id}/dismiss")
def dismiss_alert(alert_id: int):
    """Invigilator dismisses this alert as false alarm."""
    for alert in alerts_db:
        if alert["id"] == alert_id:
            alert["status"] = "dismissed"
            return {"message": f"Alert {alert_id} dismissed"}
    return {"error": "Alert not found"}

@app.get("/api/stats")
def get_stats():
    """Get overall statistics."""
    total = len(alerts_db)
    confirmed = sum(1 for a in alerts_db if a["status"] == "confirmed")
    dismissed = sum(1 for a in alerts_db if a["status"] == "dismissed")
    pending = sum(1 for a in alerts_db if a["status"] == "pending")

    return {
        "total_alerts": total,
        "confirmed": confirmed,
        "dismissed": dismissed,
        "pending": pending,
        "false_alarm_rate": dismissed / total if total > 0 else 0
    }
```

### Step 3: Run the API

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Step 4: Test with Browser

Open `http://localhost:8000/docs` — FastAPI auto-generates interactive documentation where you can test every endpoint!

---

## Image Processing Endpoint

The most important endpoint — send an image, get AI analysis back.

```python
from fastapi import FastAPI, UploadFile, File
import cv2
import numpy as np
from ultralytics import YOLO

app = FastAPI()
model = YOLO("yolov8n.pt")

@app.post("/api/process")
async def process_frame(file: UploadFile = File(...)):
    """
    Send an image, get AI analysis back.
    This is what edge devices call.
    """
    # Read the uploaded image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Run YOLO detection
    results = model(frame, verbose=False)

    # Format results
    detections = []
    for box in results[0].boxes:
        detections.append({
            "class": results[0].names[int(box.cls)],
            "confidence": float(box.conf),
            "bbox": box.xyxy[0].tolist()
        })

    # Determine if suspicious
    suspicious_items = ["cell phone", "book"]
    is_suspicious = any(d["class"] in suspicious_items for d in detections)

    return {
        "is_suspicious": is_suspicious,
        "detections": detections,
        "total_objects": len(detections)
    }
```

### Calling the API from Python (Client Side)

```python
import requests

# Send an image to the API
with open("test_image.jpg", "rb") as f:
    response = requests.post(
        "http://localhost:8000/api/process",
        files={"file": f}
    )

result = response.json()
print(f"Suspicious: {result['is_suspicious']}")
print(f"Detections: {result['detections']}")
```

---

## What You Need to Learn

1. **REST concepts** — GET, POST, PUT, DELETE, JSON, status codes
2. **FastAPI basics** — routes, request/response models, file uploads
3. **HTTP status codes** — 200 (OK), 201 (Created), 404 (Not Found), 500 (Server Error)
4. **Testing APIs** — using the browser, curl, or Python requests library
5. **API design** — naming conventions, structuring endpoints logically

---

## Mini Project: Image Classification API

### Goal
Build an API that accepts an image and returns whether it shows "cheating" or "normal" behavior.

**Step 1: Create the API**
```python
# save as app.py
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import HTMLResponse
import cv2
import numpy as np
from ultralytics import YOLO

app = FastAPI(title="ExamGuard Classifier API")
model = YOLO("yolov8n.pt")

# Suspicious objects
SUSPICIOUS = {"cell phone", "book", "laptop"}

@app.get("/", response_class=HTMLResponse)
def home():
    return """
    <h1>ExamGuard Classifier API</h1>
    <form action="/api/classify" method="post" enctype="multipart/form-data">
        <input type="file" name="image" accept="image/*">
        <button type="submit">Analyze</button>
    </form>
    """

@app.post("/api/classify")
async def classify_image(image: UploadFile = File(...)):
    # Read image
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Run detection
    results = model(frame, verbose=False)

    detections = []
    suspicious_found = []

    for box in results[0].boxes:
        class_name = results[0].names[int(box.cls)]
        conf = float(box.conf)
        detections.append({"object": class_name, "confidence": round(conf, 2)})

        if class_name in SUSPICIOUS and conf > 0.5:
            suspicious_found.append(class_name)

    verdict = "SUSPICIOUS" if suspicious_found else "NORMAL"

    return {
        "verdict": verdict,
        "suspicious_objects": suspicious_found,
        "all_detections": detections,
        "total_objects": len(detections)
    }

# Run: uvicorn app:app --reload --port 8000
# Then open http://localhost:8000 in your browser
```

**Step 2: Run It**
```bash
uvicorn app:app --reload --port 8000
```

**Step 3: Test It**
- Open http://localhost:8000 in your browser
- Upload a photo
- See the classification result
- Also try http://localhost:8000/docs for the auto-generated API docs

---

## Key Takeaways

1. **APIs let separate programs communicate** — camera module, AI engine, dashboard, database all talk through APIs
2. **REST uses HTTP** — the same technology as web browsing, simple and universal
3. **FastAPI is the best choice for Python AI projects** — fast, easy, auto-documentation
4. **JSON is the data format** — everything is sent and received as JSON
5. **The /api/process endpoint is ExamGuard's core** — send a frame in, get analysis back
6. **Start with simple endpoints** — get them working, then add complexity
