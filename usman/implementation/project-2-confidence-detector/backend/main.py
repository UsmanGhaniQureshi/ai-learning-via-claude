"""Confidence Detector — FastAPI Backend. Live + Video Upload + WebSocket + Analyzer."""
import cv2
import time
import os
import shutil
import subprocess
import asyncio
import json
import wave
import uuid
import tempfile
import numpy as np
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from face_engine import FaceEngine
from speech_engine import SpeechEngine
from scoring_engine import ScoringEngine, generate_tips
from audio_analyzer import AudioAnalyzer
from audio_pipeline import AudioPipeline, get_whisper, get_vad
from signal_scorer import SignalScorer
from session_recorder import SessionAudioRecorder, RECORDINGS_DIR
from report_generator import generate_post_session_report

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = 'ffmpeg'

# Configuration from environment
PORT = int(os.environ.get('PORT', 8000))
CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')

app = FastAPI(title="Confidence Detector API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

face_engine = FaceEngine()
speech_engine = SpeechEngine()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB

# Shared state for live mode — face result from MJPEG shared with WebSocket
active_camera = None
camera_lock = asyncio.Lock()
latest_face_result = None


@app.get("/")
def root():
    return {"status": "Confidence Detector API running", "version": "1.0.0"}


@app.get("/health")
def health():
    """Health check endpoint for deployment platforms."""
    models_ok = (face_engine.face_lm is not None and face_engine.pose_lm is not None)
    return {"status": "ok", "models_loaded": models_ok, "version": "1.0.0"}


# ============================================================
# MODE 1: LIVE WEBCAM
# ============================================================
async def generate_live_frames():
    global active_camera, latest_face_result
    async with camera_lock:
        if active_camera is not None:
            active_camera.release()

        cam = cv2.VideoCapture(0)
        cam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cam.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize buffer lag
        active_camera = cam

    face_engine.reset()
    t0 = time.time()
    frame_count = 0
    last_result = None

    try:
        loop = asyncio.get_event_loop()
        while True:
            ok, frame = cam.read()
            if not ok:
                break
            frame = cv2.flip(frame, 1)
            frame_count += 1

            # Run heavy ML inference every 3rd frame in a thread pool
            # so it never blocks the async event loop.
            # Other frames reuse the last result for smooth streaming.
            if frame_count % 3 == 0:
                ts = time.time() - t0
                last_result = await loop.run_in_executor(
                    None, face_engine.process_frame, frame, ts
                )
                latest_face_result = last_result

            frame = face_engine.draw_overlay(frame, last_result)

            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n')
            await asyncio.sleep(0.001)
    except asyncio.CancelledError:
        pass
    finally:
        async with camera_lock:
            cam.release()
            active_camera = None
            latest_face_result = None


@app.get("/api/live")
def live_feed():
    return StreamingResponse(
        generate_live_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/api/stop-live")
def stop_live():
    global active_camera, latest_face_result
    if active_camera is not None:
        active_camera.release()
        active_camera = None
        latest_face_result = None
        return {"status": "camera released"}
    return {"status": "no active camera"}


# ============================================================
# MODE 1B: WEBSOCKET — Real-time scores + audio from client
# ============================================================
@app.websocket("/ws/live")
async def websocket_live(ws: WebSocket):
    """WebSocket endpoint for real-time confidence scoring.
    Client sends: binary audio chunks (16-bit PCM, 16kHz, mono).
    Server sends: JSON score payloads every 500ms."""
    await ws.accept()

    scoring = ScoringEngine()
    speech = SpeechEngine()
    speech.start()
    audio_ana = AudioAnalyzer(sample_rate=16000)
    audio_ana.start()

    last_score_time = 0
    last_transcript = ""

    try:
        while True:
            # Receive audio binary from client browser
            data = await ws.receive_bytes()

            # Process with speech engine (Vosk STT)
            speech_result = speech.process_audio_chunk(data)

            # Process with audio analyzer (volume/pitch/silence)
            try:
                audio_result = audio_ana.analyze_chunk(data)
            except Exception:
                audio_result = None

            # Track transcript
            if speech_result and speech_result.get('type') == 'final':
                last_transcript = speech_result.get('text', '')
            elif speech_result and speech_result.get('type') == 'interim':
                last_transcript = speech_result.get('text', '')

            # Send score update every 500ms
            now = time.time()
            if now - last_score_time >= 0.5:
                # Get latest face result from MJPEG shared state
                face_result = latest_face_result

                # Compute sub-scores and update rolling average
                sub_scores = scoring.compute_sub_scores(
                    face_result=face_result,
                    speech_result=speech_result,
                    audio_result=audio_result,
                )
                scores = scoring.update(sub_scores)

                # Generate tips
                scores['tips'] = generate_tips(scores)
                scores['transcript'] = last_transcript

                await ws.send_json(scores)
                last_score_time = now

    except WebSocketDisconnect:
        pass
    except Exception:
        pass


# ============================================================
# MODE 2: VIDEO UPLOAD + ANALYSIS
# ============================================================
@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    # Save uploaded file with size validation
    filepath = os.path.join(UPLOAD_DIR, file.filename)
    size = 0
    with open(filepath, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)  # Read 1MB at a time
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_SIZE:
                f.close()
                os.remove(filepath)
                return JSONResponse({"error": "File too large (max 500MB)"}, status_code=413)
            f.write(chunk)

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
    face_results_by_time = []
    all_face_scores = []
    evidence_frame_map = {}  # FIX: store frames during main pass to avoid re-processing
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

        if last_result:
            all_face_scores.append(last_result['confidence_score'])

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
                'tension_score': last_result.get('tension_score', 0),
                'face_confidence': last_result['confidence_score'],
            })
            # FIX: Store the overlay frame now instead of re-processing later
            evidence_frame_map[round(ts, 1)] = frame_with_overlay.copy()

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

    # Save evidence frames for timeline (FIX: use stored frames, no re-processing)
    for entry in face_results_by_time:
        ts = entry['timestamp']
        stored_frame = evidence_frame_map.get(ts)
        if stored_frame is not None:
            fname = f"evidence_{int(ts)}.jpg"
            fpath = os.path.join(UPLOAD_DIR, fname)
            cv2.imwrite(fpath, stored_frame)
            entry['evidence_frame'] = fname
    evidence_frame_map.clear()  # Free memory

    # Calculate overall scores using the new ScoringEngine
    avg_face_confidence = 0
    if all_face_scores:
        avg_face_confidence = int(np.mean(all_face_scores))

    # Build average face result for scoring
    avg_face_result = None
    if face_results_by_time:
        avg_face_result = {
            'eye_contact_pct': int(np.mean([r['eye_contact_pct'] for r in face_results_by_time])),
            'expression': max(set(r['expression'] for r in face_results_by_time),
                            key=lambda e: sum(1 for r in face_results_by_time if r['expression'] == e)),
            'tension_score': int(np.mean([r.get('tension_score', 0) for r in face_results_by_time])),
            'posture': 'upright',  # Default, best available
            'fidget_score': 0,
        }

    # Build speech result for scoring
    avg_speech_result = None
    if speech_summary:
        avg_speech_result = {
            'wpm': speech_summary['average_wpm'],
            'filler_rate': speech_summary['filler_rate'],
        }

    # Build audio result for scoring
    avg_audio_result = None
    if speech_summary and speech_summary.get('voice_steadiness') is not None:
        avg_audio_result = {
            'voice_steadiness': speech_summary.get('voice_steadiness', 50),
        }

    # Compute sub-scores via scoring engine
    upload_scoring = ScoringEngine()
    sub_scores = upload_scoring.compute_sub_scores(avg_face_result, avg_speech_result, avg_audio_result)
    final_scores = upload_scoring.update(sub_scores)
    overall_score = final_scores['total']

    # Legacy compat scores
    speech_score = sub_scores.get('filler_words')
    pace_score = sub_scores.get('speech_pace')

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
        'sub_scores': {
            'voiceSteadiness': final_scores['voiceSteadiness'],
            'eyeContact': final_scores['eyeContact'],
            'speechPace': final_scores['speechPace'],
            'fillerWords': final_scores['fillerWords'],
            'vocalVariety': final_scores['vocalVariety'],
            'expression': final_scores['expression'],
        },
        'tips': generate_tips(final_scores),
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


# ============================================================
# MODE 3: SESSION WebSocket (V2 — production audio pipeline)
# ============================================================
@app.websocket("/ws/session/{session_id}")
async def session_ws(ws: WebSocket, session_id: str):
    """
    Production session WebSocket.
    Client sends: Float32 PCM audio chunks (3 seconds each).
    Server sends: JSON score payloads per chunk + final report on disconnect.
    Records all audio to disk.
    """
    await ws.accept()

    pipeline = AudioPipeline()
    audio_recorder = SessionAudioRecorder(session_id)
    snapshots = []

    try:
        async for message in ws.iter_bytes():
            audio = np.frombuffer(message, dtype=np.float32)

            # Write to disk (non-blocking, thread-safe)
            audio_recorder.write_chunk(audio)

            # Run live analysis in thread pool (never blocks event loop)
            result = await asyncio.get_event_loop().run_in_executor(
                None, pipeline.process_chunk, audio
            )

            # Inject face data if available
            face_result = latest_face_result
            if face_result:
                result["scores"]["eye_contact"] = face_result.get("eye_contact_pct", 50)
                expr = face_result.get("expression", "neutral")
                expr_scores = {
                    'happy': 90, 'speaking': 80, 'focused': 70,
                    'neutral': 60, 'calibrating': 50,
                    'surprised': 40, 'sad': 30, 'angry': 20,
                }
                result["scores"]["expression"] = expr_scores.get(expr, 50)
                result["scores"]["total"] = SignalScorer.aggregate(result["scores"])

            snapshots.append(result)
            await ws.send_json(result)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        # Session ended — close WAV, generate report
        recording_info = audio_recorder.close()
        report = generate_post_session_report(snapshots, session_id)
        report["recording"] = recording_info

        # Save report JSON to disk
        report_path = RECORDINGS_DIR / f"{session_id}_report.json"
        report_path.write_text(json.dumps(report, indent=2))

        # Try to send final report (client may already be gone)
        try:
            await ws.send_json({"type": "session_ended", "report": report})
        except Exception:
            pass


# ============================================================
# MODE 4: STANDALONE AUDIO ANALYZER
# ============================================================
@app.post("/api/analyze-audio")
async def analyze_audio_file(
    audio_file: UploadFile = File(...),
    session_label: str = Form(default="uploaded"),
):
    """
    Accepts any audio file (WAV, MP3, M4A, WebM, OGG).
    Runs full speech intelligence pipeline.
    Returns identical report to a live session.
    No camera. No WebSocket. Fully standalone.
    """
    import librosa

    session_id = str(uuid.uuid4())[:8]
    suffix = Path(audio_file.filename).suffix or ".webm"
    tmp = Path(tempfile.gettempdir()) / f"analyze_{session_id}{suffix}"

    with open(tmp, "wb") as f:
        shutil.copyfileobj(audio_file.file, f)

    try:
        # Load + resample to 16kHz mono (librosa handles any format)
        audio, _ = librosa.load(str(tmp), sr=16000, mono=True)
    except Exception as e:
        return JSONResponse(
            {"error": f"Could not load audio file: {str(e)}"},
            status_code=400,
        )
    finally:
        tmp.unlink(missing_ok=True)

    # Split into 3s chunks (same as live pipeline)
    chunk_size = 16000 * 3
    chunks = []
    for i in range(0, len(audio), chunk_size):
        chunk = audio[i:i + chunk_size]
        if len(chunk) < chunk_size:
            chunk = np.pad(chunk, (0, chunk_size - len(chunk)))
        chunks.append(chunk)

    # Run same pipeline on each chunk
    pipeline = AudioPipeline()
    snapshots = []
    for chunk in chunks:
        result = pipeline.process_chunk(chunk)
        # Audio-only: no face data, set to neutral
        result["scores"]["eye_contact"] = 50
        result["scores"]["expression"] = 50
        result["scores"]["total"] = SignalScorer.aggregate(result["scores"])
        snapshots.append(result)

    report = generate_post_session_report(snapshots, session_id)
    report["source"] = "file_upload"
    report["filename"] = audio_file.filename
    report["note"] = "Eye contact and expression scores not available for audio-only files."

    return report


@app.post("/api/session/upload-video")
async def upload_session_video(
    video: UploadFile = File(...),
    session_id: str = Form(...),
):
    """Save video recording from a live session."""
    path = RECORDINGS_DIR / f"{session_id}_video.webm"
    with open(path, "wb") as f:
        shutil.copyfileobj(video.file, f)
    size_mb = round(path.stat().st_size / 1e6, 2)
    return {"status": "saved", "path": str(path), "size_mb": size_mb}


@app.get("/api/recordings")
def list_recordings():
    """List all recorded session audio files."""
    return SessionAudioRecorder.list_recordings()


@app.get("/api/report/{session_id}")
def get_session_report(session_id: str):
    """Get a saved session report by session ID."""
    report_path = RECORDINGS_DIR / f"{session_id}_report.json"
    if not report_path.exists():
        return JSONResponse({"error": "Report not found"}, status_code=404)
    return json.loads(report_path.read_text())


if __name__ == "__main__":
    import uvicorn
    print("=" * 55)
    print("  Confidence Detector API v2.0.0")
    print("  Live + Upload + Session + Analyzer")
    print(f"  http://localhost:{PORT}")
    print(f"  Docs: http://localhost:{PORT}/docs")
    print(f"  Health: http://localhost:{PORT}/health")
    print(f"  WebSocket: ws://localhost:{PORT}/ws/session/<id>")
    print(f"  Analyzer: POST /api/analyze-audio")
    print("=" * 55)
    uvicorn.run(app, host="0.0.0.0", port=PORT)
