# Model Deployment — From Jupyter Notebook to Production System

## What Is This?

You trained a model in a Jupyter notebook. It works great. You are proud.

But here is the problem:

```
Jupyter Notebook:
- YOU click "Run" manually
- Runs on YOUR laptop
- Stops when you close the lid
- No error handling
- No monitoring
- No auto-restart

Real Exam:
- Must start automatically when exam begins
- Runs on a SERVER (not your laptop)
- Must run for 3+ hours without stopping
- Must handle errors gracefully
- Must be monitored (is it still working?)
- Must auto-restart if it crashes
```

**Model deployment** means packaging your model into a reliable system that runs without you babysitting it.

---

## WHY ExamGuard Needs This

### The Nightmare Scenario

```
Exam starts at 2:00 PM.
200 students sit down.
ExamGuard is running on your laptop in a Jupyter notebook.

2:15 PM: Your laptop goes to sleep. System stops.
2:20 PM: You realize and wake it up. Restart the notebook.
2:22 PM: Python crashes — "CUDA out of memory"
2:30 PM: You restart, but the camera connection code has a bug.
2:45 PM: Finally working again.

Result: 45 minutes of exam with NO monitoring.
Any cheating in that window? Completely missed.
```

### What Deployment Solves

```
Exam starts at 2:00 PM.
ExamGuard runs on a dedicated server, in Docker containers.

2:00 PM: System auto-starts. All cameras connected.
2:15 PM: Camera 3 disconnects. System logs error, reconnects in 5 seconds.
2:30 PM: AI engine uses too much memory. Auto-restart in 3 seconds.
2:31 PM: AI engine back online. No alerts lost (queued during restart).
5:00 PM: Exam ends. System generates report automatically.

Result: 3 hours of continuous monitoring. Every second covered.
```

---

## Key Concepts

### 1. Docker — Package Everything Into a Box

**What:** Docker creates a "container" — a mini computer inside your computer that has EVERYTHING your code needs.

**Why:** "It works on my machine" problem. Your code needs specific versions of Python, PyTorch, CUDA, OpenCV, etc. Docker packages ALL of this together.

```
Without Docker:
  "Install Python 3.10, then PyTorch 2.0, then CUDA 11.8, then OpenCV 4.8..."
  "Oh, it does not work on your computer because you have Python 3.8"

With Docker:
  "Run this one command: docker run examguard"
  Everything is already inside the container. Works on ANY computer.
```

### 2. Model Saving and Loading

```python
import torch

# ─── Save the model after training ───
model = YourTrainedModel()
# ... training code ...

# Save the entire model
torch.save(model.state_dict(), 'examguard_model.pth')
print("Model saved!")

# ─── Load in production ───
model = YourModelClass()  # Create empty model
model.load_state_dict(torch.load('examguard_model.pth'))
model.eval()  # Switch to inference mode (no training)
print("Model loaded and ready!")
```

### 3. Health Checks

```python
# The server needs to know: "Is ExamGuard still working?"

from fastapi import FastAPI
import torch
import psutil

app = FastAPI()

@app.get("/health")
def health_check():
    """Called every 30 seconds by the monitoring system."""
    checks = {
        "api": "ok",
        "gpu": "ok" if torch.cuda.is_available() else "error",
        "gpu_memory_used": f"{torch.cuda.memory_allocated()/1e9:.1f}GB"
            if torch.cuda.is_available() else "N/A",
        "cpu_percent": psutil.cpu_percent(),
        "ram_percent": psutil.virtual_memory().percent,
        "cameras_connected": check_cameras(),
        "model_loaded": model is not None
    }

    all_ok = all(v != "error" for v in checks.values() if isinstance(v, str))
    return {"status": "healthy" if all_ok else "unhealthy", "checks": checks}
```

### 4. Logging

```python
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    filename=f'examguard_{datetime.now().strftime("%Y%m%d")}.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger('examguard')

# Use throughout your code
logger.info("ExamGuard started")
logger.info(f"Connected to {len(cameras)} cameras")
logger.warning("Camera 3 disconnected, attempting reconnect...")
logger.error("AI model failed to load!")
logger.info("Alert #42: Phone detected at seat C2, confidence 0.92")

# Log file looks like:
# 2026-03-15 14:00:01 - INFO - ExamGuard started
# 2026-03-15 14:00:03 - INFO - Connected to 4 cameras
# 2026-03-15 14:15:22 - WARNING - Camera 3 disconnected, attempting reconnect...
# 2026-03-15 14:15:27 - INFO - Camera 3 reconnected
```

---

## Docker: Step by Step

### Step 1: Create a Dockerfile

```dockerfile
# Dockerfile
# This tells Docker how to build your container

# Start with a base image that has Python and CUDA
FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04

# Install Python
RUN apt-get update && apt-get install -y python3 python3-pip
RUN apt-get install -y libgl1-mesa-glx libglib2.0-0  # For OpenCV

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip3 install -r requirements.txt

# Copy your code and models
COPY . .

# Expose the API port
EXPOSE 8000

# Command to run when container starts
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Step 2: Create requirements.txt

```
fastapi==0.104.0
uvicorn==0.24.0
torch==2.1.0
torchvision==0.16.0
ultralytics==8.0.200
opencv-python-headless==4.8.1.78
psycopg2-binary==2.9.9
numpy==1.26.0
```

### Step 3: Build and Run

```bash
# Build the Docker image
docker build -t examguard .

# Run it
docker run -d \
    --name examguard-api \
    --gpus all \
    -p 8000:8000 \
    -v /data/evidence:/app/evidence \
    --restart unless-stopped \
    examguard

# Flags explained:
# -d               : Run in background
# --name           : Give it a name
# --gpus all       : Use GPU
# -p 8000:8000     : Expose port 8000
# -v /data:/app/data : Share a folder for evidence storage
# --restart unless-stopped : Auto-restart if it crashes!
```

### Step 4: Docker Compose (Multiple Services)

For the full ExamGuard system with multiple components:

```yaml
# docker-compose.yml
version: '3.8'

services:
  # AI Engine
  ai-engine:
    build: ./ai_engine
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
    ports:
      - "8001:8000"
    restart: unless-stopped
    depends_on:
      - database
      - redis

  # API Server
  api-server:
    build: ./api_server
    ports:
      - "8000:8000"
    restart: unless-stopped
    depends_on:
      - database

  # Dashboard
  dashboard:
    build: ./dashboard
    ports:
      - "3000:3000"
    restart: unless-stopped

  # Database
  database:
    image: postgres:15
    environment:
      POSTGRES_DB: examguard
      POSTGRES_PASSWORD: secure_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  # Redis (real-time cache)
  redis:
    image: redis:7
    restart: unless-stopped

volumes:
  pgdata:
```

```bash
# Start EVERYTHING with one command:
docker-compose up -d

# Stop everything:
docker-compose down

# See logs:
docker-compose logs -f ai-engine
```

---

## Production Checklist

Before deploying ExamGuard for a real exam:

```
[ ] Models saved and tested (.pth or .engine files)
[ ] Docker containers built and tested
[ ] Health check endpoint working
[ ] Logging configured (file + console)
[ ] Auto-restart on crash (--restart unless-stopped)
[ ] Camera connections tested with real cameras
[ ] Database backed up before exam
[ ] Evidence storage has enough disk space
[ ] GPU memory checked (no leaks)
[ ] API endpoints all tested
[ ] Dashboard loads correctly
[ ] Network connectivity verified
[ ] Fallback plan if system goes down (human invigilators ready)
```

---

## What You Need to Learn

1. **Docker basics** — images, containers, Dockerfile, docker-compose
2. **Model serialization** — saving and loading PyTorch models
3. **Logging** — Python logging module, log levels, log files
4. **Health checks** — monitoring system status
5. **Process management** — auto-restart, resource limits, graceful shutdown

---

## Mini Project: Package YOLO in Docker

### Goal
Create a Docker container that runs YOLO as an API service.

**Step 1: Create Project Structure**
```
yolo_service/
├── Dockerfile
├── requirements.txt
├── main.py
└── yolov8n.pt       (download this first)
```

**Step 2: main.py**
```python
from fastapi import FastAPI, UploadFile, File
from ultralytics import YOLO
import cv2
import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("yolo-service")

app = FastAPI(title="YOLO Detection Service")

# Load model once at startup
logger.info("Loading YOLO model...")
model = YOLO("yolov8n.pt")
logger.info("Model loaded!")

@app.get("/health")
def health():
    return {"status": "healthy", "model": "yolov8n"}

@app.post("/detect")
async def detect(image: UploadFile = File(...)):
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    results = model(frame, verbose=False)

    detections = []
    for box in results[0].boxes:
        detections.append({
            "class": results[0].names[int(box.cls)],
            "confidence": round(float(box.conf), 3),
        })

    logger.info(f"Detected {len(detections)} objects")
    return {"detections": detections}
```

**Step 3: Dockerfile**
```dockerfile
FROM python:3.10-slim
RUN apt-get update && apt-get install -y libgl1-mesa-glx libglib2.0-0
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 4: Build and Run**
```bash
docker build -t yolo-service .
docker run -d -p 8000:8000 --restart unless-stopped --name yolo yolo-service
```

**Step 5: Test**
```bash
# Check health
curl http://localhost:8000/health

# Send an image for detection
curl -X POST http://localhost:8000/detect -F "image=@test_photo.jpg"
```

---

## Key Takeaways

1. **Jupyter is for development, Docker is for production** — never run Jupyter in a real exam
2. **Docker packages everything** — Python, libraries, models, code, all in one container
3. **Auto-restart is essential** — crashes WILL happen, recovery must be automatic
4. **Logging saves you** — when something goes wrong at 2 AM, logs tell you what happened
5. **Health checks keep you informed** — monitor system status continuously
6. **docker-compose runs the whole system** — one command starts everything
