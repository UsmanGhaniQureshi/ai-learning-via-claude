# Task 03: Live Webcam Detection

## What we're doing

In Task 02, we tested YOLO on ONE photo. Now we run YOLO on **every frame** from your webcam — like a security camera that never blinks.

## How video works (important to understand)

Your webcam captures **30 photos per second** (30 FPS). Each photo is called a "frame."

What our code does:
```
Frame 1 → YOLO: "What's in this?" → "phone 87%, person 92%"
Frame 2 → YOLO: "What's in this?" → "person 91%"
Frame 3 → YOLO: "What's in this?" → "phone 85%, person 93%"
... repeats 30 times per second
```

The result looks like smooth video with boxes appearing around detected objects.

## How to run

1. Make sure your virtual environment is active: `examguard_env\Scripts\activate`
2. Open `live_webcam.ipynb` in VS Code
3. Select kernel: `examguard_env`
4. Place your phone on the desk
5. Run each cell with Shift+Enter
6. **Press 'q' to stop the webcam** when you're done watching

## What to observe

- Do boxes appear around your phone? → Detection working
- Are boxes flickering (appear/disappear)? → Confidence is borderline, we'll fix in Task 04
- What FPS are you getting? → Above 15 = good, above 25 = great
- Does it detect your phone from different angles? → Test by moving the phone around

## New concepts in this task

| Concept | What it means |
|---------|-------------|
| **Frame** | One single image captured from the webcam (30 per second) |
| **FPS** | Frames Per Second — how many frames YOLO processes each second |
| **Video loop** | Code that repeats: capture frame → detect → draw boxes → show → next frame |
| **cv2.imshow()** | OpenCV function that opens a window showing the video |
| **cv2.waitKey()** | Waits for you to press a key (we use 'q' to quit) |

## Next step

After this works → Task 04: Filter only phone detections (ignore chairs, people, etc.)
