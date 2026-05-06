# Phase 5: Computer Vision — Learning Resources

## YouTube Tutorials (Free)

### OpenCV
- **"OpenCV Course — Full Tutorial with Python"** by freeCodeCamp
  - 4 hours, covers everything from basics to projects
  - https://www.youtube.com/watch?v=oXlwWbU8l2o
- **"OpenCV Python Tutorial For Beginners"** by ProgrammingKnowledge
  - 40+ video playlist, very beginner friendly
- **"Learn OpenCV in 3 Hours"** by Murtaza's Workshop
  - Fast-paced but practical, builds real projects

### YOLO Object Detection
- **"YOLO Object Detection Tutorial"** by Ultralytics (official)
  - YOLOv8 official tutorials and documentation
  - https://docs.ultralytics.com/
- **"YOLOv8 Custom Object Detection"** — search for latest tutorials
  - Many creators show how to train YOLO on custom datasets
- **"Object Detection in 5 Minutes"** by Fireship
  - Quick overview of how object detection works
- **"Train YOLOv8 on Custom Dataset"** by Roboflow
  - End-to-end tutorial with data labeling

### Face Detection and Recognition
- **"Face Recognition with Python"** by sentdex
  - Uses the face_recognition library (same as our lessons)
- **"Build a Face Recognition System"** by Tech With Tim
  - Complete project tutorial
- **"MediaPipe Face Mesh Tutorial"** — search for latest
  - 468 face landmarks including iris tracking

### Pose Estimation
- **"MediaPipe Pose Estimation Tutorial"** by Nicholas Renotte
  - Excellent hands-on tutorial
- **"Human Pose Estimation Explained"** by Computer Vision Engineer
  - Visual explanation of how keypoints work
- **"OpenPose vs MediaPipe vs MoveNet"** — comparison tutorials
  - Helps you understand which to use when

### Gaze Estimation
- **"Eye Tracking with Python"** — search YouTube
  - Several tutorials using MediaPipe for iris tracking
- **"Gaze Estimation with OpenCV and dlib"** — search YouTube
  - Lower-level approach, good for understanding
- **"MediaPipe Iris — Real-time Eye Tracking"** by Ivan Googol
  - Practical implementation

### Real-Time Video Processing
- **"Real-time Object Detection with YOLO and Webcam"** — many tutorials available
  - This is the most popular demo project on YouTube
- **"Multi-threading in Python for Computer Vision"** — search YouTube
  - Critical for multi-camera processing
- **"RTSP Camera Stream with Python"** — search YouTube
  - How to connect to IP cameras

---

## Courses (Structured Learning)

### Free

- **"OpenCV Python Tutorial"** by freeCodeCamp (YouTube)
  - Best free OpenCV course available
  - Covers reading images, video, drawing, transforms, and projects

- **"Computer Vision with Python"** on Kaggle Learn
  - https://www.kaggle.com/learn/computer-vision
  - Free micro-course, hands-on in browser

- **"Introduction to Computer Vision"** by Udacity
  - Georgia Tech course available free on Udacity
  - More academic, covers theory and math

### Paid (Worth It)

- **"Deep Learning and Computer Vision A-Z"** on Udemy
  - Covers OpenCV, YOLO, face detection, and more
  - Frequently on sale for $10-15

- **"Modern Computer Vision with PyTorch"** by V Kishore Ayyadevara
  - Book + code, very practical

---

## Practice: Build Each Mini Project in Order

This is the recommended progression. Each project builds on the previous one:

```
Week 1: OpenCV Basics
  → Mini project: Motion detection in video
  → Skills: Read video, process frames, draw on images

Week 2: YOLO Object Detection
  → Mini project: Real-time webcam object detection
  → Skills: Use pre-trained YOLO, detect objects, draw boxes

Week 3: Face Detection and Recognition
  → Mini project: Attendance system with face recognition
  → Skills: Detect faces, encode faces, match identities

Week 4: Pose Estimation
  → Mini project: Real-time skeleton overlay from webcam
  → Skills: Detect body keypoints, analyze body position

Week 5: Gaze Estimation
  → Mini project: Gaze direction tracker (left/right/center)
  → Skills: Eye landmark detection, iris tracking, gaze mapping

Week 6: Video Processing
  → Mini project: Real-time YOLO with FPS measurement
  → Skills: Frame skipping, multi-threading, performance optimization

Week 7: Multi-Camera
  → Mini project: Two camera feeds with simultaneous detection
  → Skills: Thread management, synchronized processing, grid display

Week 8: Integration
  → Combine all projects into a basic ExamGuard prototype
  → Skills: Pipeline building, multi-model processing
```

---

## GitHub Repositories

### Essential
- **ultralytics/ultralytics** — YOLOv8 (object detection)
  - https://github.com/ultralytics/ultralytics
  - The YOLO implementation you will use for ExamGuard

- **google/mediapipe** — Pose estimation, face mesh, iris tracking
  - https://github.com/google/mediapipe
  - Multi-platform, works on Python, mobile, and web

- **ageitgey/face_recognition** — Simplest face recognition library
  - https://github.com/ageitgey/face_recognition
  - Built on dlib, extremely easy API

### Advanced (Reference for Later)
- **opencv/opencv** — OpenCV source code and examples
  - https://github.com/opencv/opencv
- **CMU-Perceptual-Computing-Lab/openpose** — Multi-person pose estimation
  - https://github.com/CMU-Perceptual-Computing-Lab/openpose
- **deepinsight/insightface** — Production face recognition
  - https://github.com/deepinsight/insightface

---

## Tools for Data Labeling

When you start training custom YOLO models for ExamGuard, you need to label data:

| Tool | Type | Best For | Link |
|------|------|----------|------|
| LabelImg | Desktop app | Simple bounding box labeling | https://github.com/HumanSignal/labelImg |
| Roboflow | Web app | Easy labeling + augmentation + export | https://roboflow.com/ |
| CVAT | Web app | Large team labeling projects | https://www.cvat.ai/ |
| Label Studio | Web app | Multi-type labeling | https://labelstud.io/ |

**Recommendation:** Start with **Roboflow** — free tier, easy to use, exports directly to YOLO format.

---

## Hardware Recommendations

### For Learning (What You Have Now)
- Any laptop with webcam
- CPU is fine for learning — models will be slower but work
- 8GB RAM minimum

### For Development
- Laptop/desktop with NVIDIA GPU (GTX 1060 or better)
- 16GB RAM
- SSD for fast data loading
- External webcam for better quality

### For ExamGuard Deployment
- NVIDIA Jetson Nano/Xavier (edge processing per camera)
- Central server with RTX 3060+ GPU
- IP cameras (Hikvision, Dahua) with RTSP support
- Gigabit network switch

---

## Quick Reference: What to Search When Stuck

| Problem | Search This |
|---------|-------------|
| OpenCV installation | "pip install opencv-python" (just use pip) |
| Camera not opening | "opencv videocapture not working [your OS]" |
| YOLO too slow | "speed up yolov8 inference" or use smaller model |
| Face not detected | "improve face detection accuracy [lighting/angle]" |
| RTSP not connecting | "opencv rtsp connection timeout fix" |
| Multi-threading crash | "python threading opencv safe" |
| Gaze inaccurate | "improve gaze estimation accuracy tips" |
| GPU not detected | "pytorch cuda not available fix" |
| Out of memory | "reduce opencv memory usage multi-camera" |

---

## Key Tip

Phase 5 is the most hands-on phase. Every lesson has a mini project that produces a working demo. Do not skip the projects — they are not optional exercises, they are the building blocks of ExamGuard. By the end of Phase 5, you should be able to combine all these mini projects into a basic prototype that reads a camera, detects objects, recognizes faces, tracks poses, and estimates gaze. That prototype IS ExamGuard v0.1.
