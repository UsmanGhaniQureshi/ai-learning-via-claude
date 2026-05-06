# Phase 7: System Building — Learning Resources

## Camera Streams & RTSP

### YouTube Videos
- **"RTSP Camera Stream with Python OpenCV"** by Murtaza's Workshop — hands-on tutorial
- **"IP Camera Streaming Python"** by Tech with Tim — step-by-step
- **"OpenCV VideoCapture Tutorial"** by ProgrammingKnowledge — covers all input sources
- **"Multi-camera OpenCV Python"** by Nicholas Renotte — reading multiple feeds

### Practice
- Use your phone as an IP camera (IP Webcam app for Android, EpocCam for iPhone)
- Connect to any RTSP stream and display it with OpenCV
- Build a multi-camera display grid

---

## Edge Computing

### YouTube Videos
- **"Getting Started with NVIDIA Jetson Nano"** by JetsonHacks — the essential Jetson tutorial
- **"Run YOLO on Jetson Nano"** by NVIDIA Developer — official guide
- **"Edge AI Explained"** by Deloitte — understand the concept
- **"Raspberry Pi AI Projects"** by ExplainingComputers — budget edge computing

### Documentation
- NVIDIA Jetson Developer Kit: developer.nvidia.com/embedded/jetson-developer-kits
- Google Coral Edge TPU: coral.ai/docs
- PyTorch Mobile: pytorch.org/mobile

### Practice
- If you have a Jetson: Run YOLOv8-nano on it
- If not: Simulate edge computing by comparing YOLOv8-nano vs YOLOv8-large speeds
- Try model export to TensorRT or ONNX

---

## GPU Programming

### YouTube Videos
- **"CUDA Programming for Beginners"** by CoffeeBeforeArch — gentle introduction
- **"PyTorch GPU Tutorial"** by sentdex — practical GPU usage in PyTorch
- **"NVIDIA CUDA Explained"** by Fireship — quick overview
- **"Mixed Precision Training"** by NVIDIA Developer — speed up training 2x

### Documentation
- PyTorch CUDA guide: pytorch.org/docs/stable/cuda.html
- NVIDIA CUDA Toolkit: developer.nvidia.com/cuda-toolkit
- cuDNN: developer.nvidia.com/cudnn

### Practice
- Run CPU vs GPU benchmark on any model
- Try mixed precision training
- Monitor GPU memory usage during training

---

## Web Dashboard

### YouTube Videos
- **"Flask Tutorial - Full Course for Beginners"** by Tech with Tim — complete Flask guide
- **"FastAPI Tutorial"** by Traversy Media — modern Python web framework
- **"Build a Dashboard with Flask"** by Pretty Printed — directly applicable
- **"WebSocket Tutorial"** by Fireship — real-time communication
- **"HTML/CSS Crash Course"** by Traversy Media — just enough web skills

### Courses
- **"Flask Web Development"** on Udemy (by Jose Portilla) — comprehensive
- **freeCodeCamp** Responsive Web Design certification — free, covers HTML/CSS

### Practice
- Build a simple Flask app that shows webcam feed in browser
- Add fake alerts that appear in real-time
- Style it with CSS to look like a monitoring dashboard

---

## Database

### YouTube Videos
- **"SQL Tutorial - Full Database Course"** by freeCodeCamp — complete SQL from scratch
- **"PostgreSQL Tutorial for Beginners"** by Amigoscode — setup and basic queries
- **"SQLAlchemy Tutorial"** by Pretty Printed — Python + database made easy
- **"Redis Crash Course"** by Traversy Media — real-time caching

### Practice
- Start with SQLite (no installation needed)
- Build the alert logging system from the mini project
- Learn these SQL commands: SELECT, INSERT, UPDATE, WHERE, JOIN, GROUP BY, COUNT, AVG
- Move to PostgreSQL when ready for production

---

## REST API

### YouTube Videos
- **"FastAPI Course for Beginners"** by freeCodeCamp — 4-hour comprehensive course
- **"REST API Concepts"** by WebDevSimplified — understand the theory
- **"Build a REST API with FastAPI"** by Traversy Media — practical tutorial
- **"Postman Tutorial"** by Traversy Media — testing APIs

### Tools
- **Postman** — GUI tool for testing APIs (download from postman.com)
- **curl** — command-line tool for testing APIs (built into most systems)
- **FastAPI /docs** — auto-generated interactive documentation

### Practice
- Build a simple CRUD API (Create, Read, Update, Delete)
- Add file upload endpoint (for images)
- Test with Postman or the auto-generated docs page

---

## Docker & Deployment

### YouTube Videos
- **"Docker Tutorial for Beginners"** by TechWorld with Nana — best Docker intro
- **"Docker for Data Scientists"** by Data School — directly applicable
- **"Docker Compose Tutorial"** by NetworkChuck — running multiple services
- **"Deploying ML Models"** by Krish Naik — model deployment specifically

### Documentation
- Docker official tutorial: docs.docker.com/get-started
- Docker Hub: hub.docker.com (pre-built images)

### Practice
- Install Docker Desktop
- Build a Docker image for a simple Python script
- Package your YOLO API in Docker
- Use docker-compose to run API + database together

---

## Recommended Learning Order

```
Week 1-2:   Camera streams → Phone camera mini project
Week 3-4:   Flask dashboard → Webcam + fake alerts mini project
Week 5-6:   Database (SQLite) → Alert logging mini project
Week 7-8:   REST API (FastAPI) → Image classification API mini project
Week 9-10:  Docker → Package YOLO in Docker mini project
Week 11-12: GPU programming → CPU vs GPU benchmark
Week 13-14: Edge computing → Run YOLO on lightweight setup
```

## Quick Tip

Build each component STANDALONE first. Get it working independently. THEN start connecting them together. Trying to build everything at once is a recipe for confusion.

```
Phase 1: Camera reading (standalone) ✓
Phase 2: AI detection (standalone) ✓
Phase 3: Dashboard (standalone, fake data) ✓
Phase 4: Database (standalone) ✓
Phase 5: API (standalone) ✓
Phase 6: Camera → API → AI → Database → Dashboard (INTEGRATED)
```

## Tools to Install

```bash
# Web framework
pip install flask flask-socketio
pip install fastapi uvicorn python-multipart

# Database
pip install psycopg2-binary sqlalchemy
# Also install PostgreSQL from postgresql.org

# Docker
# Download Docker Desktop from docker.com

# Utilities
pip install requests    # For testing APIs
pip install psutil      # For system monitoring
pip install redis       # For Redis cache (optional)
```
