"""Confidence Detector — FastAPI Backend. Live + Video Upload modes."""
import cv2
import time
import os
import shutil
import subprocess
import asyncio
import json
import wave
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from face_engine import FaceEngine
from speech_engine import SpeechEngine

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = 'ffmpeg'

app = FastAPI(title="Confidence Detector API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

face_engine = FaceEngine()
speech_engine = SpeechEngine()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

active_camera = None


@app.get("/")
def root():
    return {"status": "Confidence Detector API running", "version": "0.1"}


# ============================================================
# MODE 1: LIVE WEBCAM
# ============================================================
async def generate_live_frames():
    global active_camera
    if active_camera is not None:
        active_camera.release()

    cam = cv2.VideoCapture(0)
    cam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    active_camera = cam
    face_engine.reset()
    t0 = time.time()

    try:
        while True:
            ok, frame = cam.read()
            if not ok:
                break
            frame = cv2.flip(frame, 1)

            result = face_engine.process_frame(frame, time.time() - t0)
            frame = face_engine.draw_overlay(frame, result)

            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n')
            await asyncio.sleep(0.01)
    except asyncio.CancelledError:
        pass
    finally:
        cam.release()
        active_camera = None


@app.get("/api/live")
def live_feed():
    return StreamingResponse(
        generate_live_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/api/stop-live")
def stop_live():
    global active_camera
    if active_camera is not None:
        active_camera.release()
        active_camera = None
        return {"status": "camera released"}
    return {"status": "no active camera"}


# ============================================================
# MODE 2: VIDEO UPLOAD + ANALYSIS
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

    # Extract audio for speech analysis
    audio_path = os.path.join(UPLOAD_DIR, f"audio_{file.filename}.wav")
    try:
        subprocess.run(
            [FFMPEG, '-y', '-i', filepath, '-ar', '16000', '-ac', '1',
             '-f', 'wav', audio_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        has_audio = os.path.exists(audio_path) and os.path.getsize(audio_path) > 1000
    except (FileNotFoundError, subprocess.TimeoutExpired):
        has_audio = False

    # Process video frames with face engine
    output_name = f"processed_{file.filename}"
    if not output_name.endswith('.mp4'):
        output_name = output_name.rsplit('.', 1)[0] + '.mp4'
    output_path = os.path.join(UPLOAD_DIR, output_name)

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    face_engine.reset()
    timeline = []
    face_results_by_time = []
    process_every = 2
    fc = 0
    last_result = None

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        fc += 1
        ts = fc / fps

        if fc % process_every == 0:
            last_result = face_engine.process_frame(frame, ts)

        frame_with_overlay = face_engine.draw_overlay(frame.copy(), last_result)
        writer.write(frame_with_overlay)

        # Log face data at intervals
        if last_result and fc % (int(fps) * 2) == 0:  # every 2 seconds
            face_results_by_time.append({
                'timestamp': round(ts, 1),
                'time_display': f"{int(ts)//60:02d}:{int(ts)%60:02d}",
                'expression': last_result['expression'],
                'eye_contact_pct': last_result['eye_contact_pct'],
                'blink_rate': last_result['blink_rate'],
                'face_confidence': last_result['confidence_score'],
            })

    cap.release()
    writer.release()

    # Process audio with speech engine
    speech_summary = None
    speech_timeline = []
    if has_audio:
        se = SpeechEngine()
        se.start()
        results = se.process_audio_file(audio_path)
        speech_summary = se.get_summary()

        for r in results:
            if r.get('type') == 'final':
                speech_timeline.append({
                    'timestamp': r.get('timestamp', 0),
                    'text': r['text'],
                    'fillers': r.get('fillers_in_chunk', []),
                    'hedges': r.get('hedges_in_chunk', []),
                    'speech_score': r.get('speech_score', 100),
                })

    # Convert to browser-compatible video
    web_name = f"web_{output_name}"
    web_path = os.path.join(UPLOAD_DIR, web_name)
    try:
        subprocess.run(
            [FFMPEG, '-y', '-i', output_path, '-c:v', 'libx264',
             '-preset', 'fast', '-movflags', '+faststart', web_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
        ffmpeg_ok = os.path.exists(web_path) and os.path.getsize(web_path) > 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        ffmpeg_ok = False
    video_serve = web_name if ffmpeg_ok else output_name

    # Save evidence frames for timeline
    evidence_frames = []
    cap2 = cv2.VideoCapture(filepath)
    for entry in face_results_by_time:
        ts = entry['timestamp']
        cap2.set(cv2.CAP_PROP_POS_FRAMES, int(ts * fps))
        ok, frame = cap2.read()
        if ok:
            fname = f"evidence_{int(ts)}.jpg"
            fpath = os.path.join(UPLOAD_DIR, fname)
            # Re-run detection for this frame overlay
            result = face_engine.process_frame(frame, ts)
            frame = face_engine.draw_overlay(frame, result)
            cv2.imwrite(fpath, frame)
            entry['evidence_frame'] = fname
    cap2.release()

    # Calculate overall scores
    avg_face_confidence = 0
    if face_results_by_time:
        avg_face_confidence = int(np.mean([r['face_confidence'] for r in face_results_by_time]))

    overall_score = avg_face_confidence
    if speech_summary:
        speech_score = max(0, 100 - int(
            min(40, speech_summary['filler_rate'] * 5) +
            min(30, speech_summary['total_hedges'] * 3) +
            min(15, speech_summary['total_repetitions'] * 5)))
        # Combined: face 40%, speech 40%, pace 20%
        pace_score = 100
        wpm = speech_summary['average_wpm']
        if wpm < 100 or wpm > 180:
            pace_score = 50
        elif wpm < 130 or wpm > 160:
            pace_score = 75
        overall_score = int(avg_face_confidence * 0.4 + speech_score * 0.4 + pace_score * 0.2)
    else:
        speech_score = None
        pace_score = None

    # Cleanup temp audio
    if has_audio and os.path.exists(audio_path):
        os.remove(audio_path)

    return JSONResponse({
        'filename': file.filename,
        'duration': round(duration, 1),
        'total_frames': total_frames,
        'has_audio': has_audio,
        'processed_video': video_serve,
        'overall_confidence': overall_score,
        'face_confidence': avg_face_confidence,
        'speech_score': speech_score,
        'pace_score': pace_score,
        'speech_summary': speech_summary,
        'face_timeline': face_results_by_time,
        'speech_timeline': speech_timeline,
    })


@app.get("/api/video/{filename}")
def serve_video(filename: str):
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
    print("=" * 50)
    print("  Confidence Detector API v0.1")
    print("  Live + Video Upload")
    print("  http://localhost:8000")
    print("  Docs: http://localhost:8000/docs")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)
