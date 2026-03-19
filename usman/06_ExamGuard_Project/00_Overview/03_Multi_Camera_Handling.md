# Multi-Camera Handling in ExamGuard

## The Challenge: Scale

Let's do the math for a real university exam:

```
50 exam halls
x 4-5 cameras per hall
= 200+ cameras

Each camera at 30 fps
= 200 x 30 = 6,000 frames per second

Each frame is 1920x1080 pixels
= 6,000 x 6.2 MB = ~37 GB per second of raw data
```

**That's 37 gigabytes of data EVERY SECOND.**

No single computer can process all of this in real-time. We need smart strategies.

---

## Solution 1: Edge Processing

### What is Edge Processing?

Instead of sending ALL video to one central server, we process video RIGHT AT THE CAMERA (or near it) and only send the interesting parts.

```
WITHOUT Edge Processing:
[Camera] ---(full video stream)---> [Central Server]
= Massive bandwidth, server overloaded

WITH Edge Processing:
[Camera + Small AI Chip] ---(only suspicious clips)---> [Central Server]
= 90% less data, server handles easily
```

### How it works for ExamGuard:

1. A small AI chip (like NVIDIA Jetson) sits next to each camera
2. It runs a lightweight YOLO model locally
3. It quickly checks: "Is anything suspicious happening?"
4. **If NO:** Send nothing (or just a thumbnail every 5 seconds)
5. **If YES:** Send the full-quality clip to the central server for detailed analysis

### The result:

```
Before edge processing: 6,000 fps to process centrally
After edge processing:  ~600 fps to process centrally (90% reduction!)
```

Most of the time, students are just writing their exam. Nothing to send. Only when something looks off does the full video get analyzed.

---

## Solution 2: Person Re-Identification (Re-ID)

### The Problem

A student might appear on Camera 1 (front view) and Camera 4 (side view). The AI sees two different images. How does it know it's the SAME student?

```
Camera 1 sees: [Face from front, blue shirt]
Camera 4 sees: [Side profile, blue shirt]

Are these the same person? The AI needs to figure this out.
```

### What is Person Re-ID?

Person Re-Identification is a special AI model that creates a unique "signature" for each person based on their appearance (clothing, body shape, hair) so they can be recognized across different cameras.

### Why it matters for ExamGuard:

- **Tracking behavior across views:** If Camera 1 sees Student A looking suspicious, and Camera 4 has a better angle, the system needs to know it's the SAME student
- **Complete behavior picture:** Combine observations from multiple cameras for more accurate detection
- **Avoid double alerts:** Don't alert twice for the same incident seen by two cameras

### How it works:

```
Camera 1 frame → Re-ID Model → Feature vector [0.23, 0.87, 0.12, ...]
Camera 4 frame → Re-ID Model → Feature vector [0.25, 0.85, 0.14, ...]

Compare vectors → Very similar! → Same person!
```

The model converts each person's appearance into a list of numbers (feature vector). Similar people have similar vectors.

---

## Solution 3: Smart FPS (Adaptive Frame Rate)

### The Idea

Why process 30 frames per second when nothing is happening? Save processing power for when it matters.

```
NORMAL MODE (nothing suspicious):
- Process 5-10 frames per second
- Quick scan for any changes
- Low CPU/GPU usage

ALERT MODE (something detected):
- Jump to 25-30 frames per second
- Detailed analysis of every frame
- Full model pipeline activated

REVIEW MODE (incident being reviewed):
- Record at full 30 fps
- Save high-quality clip for invigilator
- Keep processing for 30 seconds after incident
```

### ExamGuard implementation:

| State | FPS | Processing | Trigger |
|---|---|---|---|
| **Idle** | 5 fps | Basic motion detection only | Default state |
| **Watch** | 10 fps | YOLO + face detection | Any motion detected |
| **Suspicious** | 20 fps | Full detection pipeline | Object or gaze anomaly |
| **Alert** | 30 fps | All models + recording | High suspicion score |

### Why this saves resources:

```
Without Smart FPS: 200 cameras x 30 fps = 6,000 fps to process
With Smart FPS:    200 cameras x avg 8 fps = 1,600 fps to process

That's a 73% reduction in processing load!
```

At any given moment, most cameras are in "Idle" or "Watch" mode. Only a few cameras with active suspicion need full processing.

---

## Solution 4: GPU Parallel Processing

### What is Parallel Processing?

A GPU (Graphics Processing Unit) can process many things at the same time. While a CPU processes tasks one by one, a GPU can handle hundreds simultaneously.

```
CPU (one task at a time):
Frame 1 → Process → Done
Frame 2 → Process → Done
Frame 3 → Process → Done
Total: 3 units of time

GPU (many tasks at once):
Frame 1 → Process ↘
Frame 2 → Process → All done!
Frame 3 → Process ↗
Total: 1 unit of time
```

### How ExamGuard uses GPUs:

**One GPU can handle 20-30 camera feeds simultaneously** by:

1. **Batching:** Collect frames from 20 cameras, process them all at once
2. **Model sharing:** One copy of YOLO in GPU memory processes all frames
3. **Pipeline overlap:** While GPU processes batch 1, CPU prepares batch 2

```
GPU processes:   [Batch 1: Cams 1-20] [Batch 2: Cams 21-40] [Batch 3: Cams 41-60]
CPU prepares:    [Batch 2 ready]       [Batch 3 ready]        [Batch 4 ready]

They work in parallel = no waiting!
```

### GPU requirements by scale:

| Scale | Cameras | Recommended GPU | Number of GPUs |
|---|---|---|---|
| Small (1-2 halls) | 5-10 | NVIDIA RTX 3060 | 1 |
| Medium (5-10 halls) | 25-50 | NVIDIA RTX 4090 | 2 |
| Large (10-20 halls) | 50-100 | NVIDIA A100 | 2-4 |
| University-wide (50+ halls) | 200+ | NVIDIA A100 cluster | 8+ |

---

## Scaling Table: How ExamGuard Grows

| | Small Setup | Medium Setup | Large Setup |
|---|---|---|---|
| **Exam Halls** | 1-2 | 5-10 | 50+ |
| **Cameras** | 5-10 | 25-50 | 200+ |
| **Students** | 50-100 | 250-500 | 2,500+ |
| **Raw FPS** | 150-300 | 750-1,500 | 6,000+ |
| **With Smart FPS** | 40-80 | 200-400 | 1,600+ |
| **With Edge Processing** | Not needed | 60-120 | 160-400 |
| **GPUs Needed** | 1 (consumer) | 1-2 (prosumer) | 4-8 (server) |
| **Processing Server** | 1 desktop PC | 1 workstation | Server cluster |
| **Dashboard** | 1 monitor | 2-3 monitors | Web dashboard |
| **Edge Devices** | None | Optional | Required |
| **Budget Estimate** | $2,000-5,000 | $10,000-25,000 | $50,000+ |

---

## For Your Project: Start Small

You don't need to handle 200 cameras to learn the concepts. Here's your development path:

```
Step 1: ONE webcam feed (your laptop camera)
        - Learn video processing basics
        - Get YOLO working on live video

Step 2: TWO video files simultaneously
        - Learn multi-stream handling
        - Basic parallel processing

Step 3: FIVE pre-recorded exam videos
        - Simulate a full exam hall
        - Test Person Re-ID

Step 4: Scale up with optimization
        - Add Smart FPS
        - Add GPU batching
        - Profile performance
```

### Mini Project Idea:

**Build a multi-video processor:**
1. Open 4 video files at the same time
2. Run a simple face detector on each
3. Display all 4 with detection boxes
4. Measure: How many FPS can you achieve?
5. Add batching: Does FPS improve?

This teaches you the fundamentals of multi-camera handling without needing actual exam hall cameras.

---

## Key Takeaways

| Strategy | What It Does | Savings |
|---|---|---|
| **Edge Processing** | Process at camera, send only suspicious | 90% bandwidth reduction |
| **Person Re-ID** | Recognize same person across cameras | Avoid duplicate alerts |
| **Smart FPS** | Lower frame rate when nothing happens | 73% processing reduction |
| **GPU Batching** | Process many frames simultaneously | 1 GPU = 20-30 feeds |

Combined, these strategies turn an impossible problem (37 GB/sec of data) into a manageable one that runs on affordable hardware.
