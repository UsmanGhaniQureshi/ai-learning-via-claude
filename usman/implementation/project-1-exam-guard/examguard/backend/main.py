"""ExamGuard FastAPI Backend — Multi-student, Live + Video upload with playback."""
import cv2
import time
import os
import shutil
import subprocess
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from detector import ExamGuardDetector

# Get ffmpeg path from imageio_ffmpeg (bundled binary)
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = 'ffmpeg'  # Fall back to system ffmpeg

app = FastAPI(title="ExamGuard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = ExamGuardDetector()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.get("/")
def root():
    return {"status": "ExamGuard API running", "version": "0.1"}


# ============================================================
# MODE 1: LIVE WEBCAM
# ============================================================
import asyncio

active_camera = None  # Track the active camera so we can release it


async def generate_live_frames():
    global active_camera
    # Release any previous camera that's still open
    if active_camera is not None:
        active_camera.release()
    cam = cv2.VideoCapture(0)
    cam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    active_camera = cam
    detector.reset()
    t0 = time.time()
    try:
        while True:
            ok, frame = cam.read()
            if not ok:
                break
            frame = cv2.flip(frame, 1)
            results = detector.process_frame(frame, time.time() - t0)
            frame = detector.draw_overlays(frame, results)
            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n')
            # Give the event loop a chance to detect client disconnect
            await asyncio.sleep(0.01)
    except asyncio.CancelledError:
        pass
    finally:
        cam.release()
        active_camera = None
        print("[Camera] Released.")


@app.get("/api/live")
def live_feed():
    return StreamingResponse(
        generate_live_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/api/stop-live")
def stop_live():
    """Explicitly stop the live camera (called by frontend on exit)."""
    global active_camera
    if active_camera is not None:
        active_camera.release()
        active_camera = None
        return {"status": "camera released"}
    return {"status": "no active camera"}


# ============================================================
# MODE 2: VIDEO UPLOAD + PROCESSED VIDEO OUTPUT
# ============================================================
@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    # Save uploaded file
    filepath = os.path.join(UPLOAD_DIR, file.filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    cap = cv2.VideoCapture(filepath)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Output processed video with overlays
    output_name = f"processed_{file.filename}"
    # Ensure .mp4 extension for browser compatibility
    if not output_name.endswith('.mp4'):
        output_name = output_name.rsplit('.', 1)[0] + '.mp4'
    output_path = os.path.join(UPLOAD_DIR, output_name)

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    detector.reset()
    alerts = []
    fc = 0
    process_every = 3
    last_alert_time = {}
    last_results = []  # Store last detection for non-processed frames

    while True:
        ok, frame = cap.read()
        if not ok: break
        fc += 1
        ts = fc / fps

        # Run detection every Nth frame
        if fc % process_every == 0:
            last_results = detector.process_frame(frame, ts)

        # Draw overlays on EVERY frame (using last detection results)
        frame_with_overlay = detector.draw_overlays(frame.copy(), last_results)

        # Write to output video
        writer.write(frame_with_overlay)

        # Log alerts
        for r in last_results:
            sid = r['student_id']
            if r['total_score'] >= detector.SUSPICIOUS:
                last_t = last_alert_time.get(sid, 0)
                if ts - last_t >= 2.0:
                    last_alert_time[sid] = ts

                    evidence_name = f"evidence_s{sid}_{fc}.jpg"
                    cv2.imwrite(os.path.join(UPLOAD_DIR, evidence_name), frame_with_overlay)

                    alerts.append({
                        'student_id': sid,
                        'timestamp': round(ts, 1),
                        'time_display': f"{int(ts)//60:02d}:{int(ts)%60:02d}",
                        'score': r['total_score'],
                        'verdict': r['verdict'],
                        'head': r['head']['direction'],
                        'eyes': r['eyes']['direction'],
                        'body': r['body']['direction'],
                        'talking': r['talking']['status'],
                        'evidence_frame': evidence_name
                    })

    cap.release()
    writer.release()

    # Convert to browser-compatible format using ffmpeg if available
    web_name = f"web_{output_name}"
    web_path = os.path.join(UPLOAD_DIR, web_name)
    try:
        subprocess.run(
            [FFMPEG, '-y', '-i', output_path, '-c:v', 'libx264',
             '-preset', 'fast', '-movflags', '+faststart', web_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=300
        )
        ffmpeg_ok = os.path.exists(web_path) and os.path.getsize(web_path) > 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        ffmpeg_ok = False

    video_serve = web_name if ffmpeg_ok else output_name

    # Build per-student summary
    all_student_ids = set()
    student_alert_counts = {}
    student_max_scores = {}
    student_worst_verdicts = {}
    verdict_rank = {'ALL CLEAR': 0, 'MILD WARNING': 1, 'SUSPICIOUS': 2, 'HIGH ALERT': 3}

    for a in alerts:
        sid = a['student_id']
        all_student_ids.add(sid)
        student_alert_counts[sid] = student_alert_counts.get(sid, 0) + 1
        if a['score'] > student_max_scores.get(sid, 0):
            student_max_scores[sid] = a['score']
            student_worst_verdicts[sid] = a['verdict']

    # Also count students seen with no alerts (from last_results)
    for r in last_results:
        all_student_ids.add(r['student_id'])

    student_summaries = []
    for sid in sorted(all_student_ids):
        student_summaries.append({
            'student_id': sid,
            'alert_count': student_alert_counts.get(sid, 0),
            'max_score': student_max_scores.get(sid, 0),
            'worst_verdict': student_worst_verdicts.get(sid, 'ALL CLEAR'),
            'status': 'CHEATING DETECTED' if student_alert_counts.get(sid, 0) > 0 else 'CLEAN'
        })

    return JSONResponse({
        'filename': file.filename,
        'duration': round(duration, 1),
        'total_frames': total_frames,
        'frames_analyzed': fc // process_every,
        'students_detected': len(all_student_ids),
        'total_alerts': len(alerts),
        'processed_video': video_serve,
        'student_summaries': student_summaries,
        'alerts': alerts
    })


@app.get("/api/video/{filename}")
def serve_video(filename: str):
    """Serve processed video for browser playback."""
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        return JSONResponse({"error": "Not found"}, status_code=404)
    return FileResponse(filepath, media_type="video/mp4")


@app.get("/api/evidence/{filename}")
def get_evidence(filename: str):
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        return JSONResponse({"error": "Not found"}, status_code=404)
    return FileResponse(filepath, media_type="image/jpeg")


if __name__ == "__main__":
    import uvicorn
    print("=" * 45)
    print("  ExamGuard API Server v0.1")
    print("  Multi-student + Video playback")
    print("  http://localhost:8000")
    print("  Docs: http://localhost:8000/docs")
    print("=" * 45)
    uvicorn.run(app, host="0.0.0.0", port=8000)
