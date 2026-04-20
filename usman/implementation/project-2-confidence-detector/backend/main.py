"""Confidence Detector — FastAPI Backend. Live + Video Upload + WebSocket + Analyzer."""
import os
# Fix OpenMP conflict on Windows (torch/numpy/mediapipe each bundle their own)
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
# Disable HuggingFace symlink warning (Windows doesn't support by default)
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
# Silence HF anonymous-download warning (downloads still work fine)
import warnings
warnings.filterwarnings("ignore", message=".*sending unauthenticated requests.*")
warnings.filterwarnings("ignore", category=UserWarning, module="huggingface_hub")

# Load .env file from backend/ directory if it exists
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import cv2
import time
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
from scoring_engine import ScoringEngine, generate_tips
from audio_pipeline import AudioPipeline, get_whisper, get_vad
from signal_scorer import SignalScorer
from session_recorder import list_recordings as _list_session_recordings, RECORDINGS_DIR
from report_generator import generate_post_session_report
from db import SessionLocal
from models import Media, MediaSegment


# Same grade thresholds as generate_post_session_report — kept inline here
# because upload_video does not call that function but still needs to cache
# a grade on the media row for the Library page.
_GRADE_TABLE = [
    (90, "A+"), (80, "A"), (70, "B+"),
    (60, "B"), (50, "C"), (40, "D"), (0, "F"),
]


def _grade_for(score: int) -> str:
    for threshold, grade in _GRADE_TABLE:
        if score >= threshold:
            return grade
    return "F"


def _persist_media_and_segments(
    *,
    media_id: str,
    source_kind: str,
    original_name: str | None,
    stored_path: str | None,
    playback_path: str | None,
    duration_s: float | None,
    has_video: bool,
    has_audio: bool,
    score_avg: int | None,
    face_timeline: list[dict],
    speech_timeline: list[dict],
    report_json: dict | None = None,
) -> None:
    """Dual-write helper — called from upload + session paths.

    Wrapped in a broad try/except by callers so a DB failure cannot kill
    the main response while Phase 2 is still dual-writing alongside the
    JSON files.
    """
    grade = _grade_for(score_avg) if score_avg is not None else None

    with SessionLocal() as db:
        media = Media(
            id=media_id,
            source_kind=source_kind,
            original_name=original_name,
            stored_path=stored_path,
            playback_path=playback_path,
            duration_s=duration_s,
            has_video=has_video,
            has_audio=has_audio,
            score_avg=score_avg,
            score_grade=grade,
            report_json=report_json,
        )
        db.add(media)
        db.flush()

        segments: list[MediaSegment] = []

        # Face rows — one per ~2-second sample.
        for entry in face_timeline or []:
            t_start = int(float(entry.get("timestamp", 0)) * 1000)
            segments.append(MediaSegment(
                media_id=media_id,
                t_start_ms=t_start,
                t_end_ms=t_start + 2000,
                kind="face",
                score=entry.get("face_confidence"),
                label=entry.get("expression"),
                extras={
                    "eye_contact_pct": entry.get("eye_contact_pct"),
                    "blink_rate": entry.get("blink_rate"),
                    "tension_score": entry.get("tension_score"),
                },
            ))

        # Speech rows — one per 3-second chunk + one row per transcribed word.
        for entry in speech_timeline or []:
            t_start = int(float(entry.get("timestamp", 0)) * 1000)
            segments.append(MediaSegment(
                media_id=media_id,
                t_start_ms=t_start,
                t_end_ms=t_start + 3000,
                kind="speech",
                score=entry.get("speech_score"),
                label=(entry.get("text") or "")[:500],
                extras={
                    "fillers": entry.get("fillers", []),
                    "hedges": entry.get("hedges", []),
                },
            ))
            for w in entry.get("words", []) or []:
                segments.append(MediaSegment(
                    media_id=media_id,
                    t_start_ms=int(w.get("start_ms", 0)),
                    t_end_ms=int(w.get("end_ms", 0)),
                    kind="word",
                    score=None,
                    label=w.get("word"),
                    extras={"is_filler": bool(w.get("is_filler"))},
                ))

        if segments:
            db.add_all(segments)
        db.commit()

# Hedging phrases swept over the Whisper transcript in the upload flow.
# Whisper drops these structurally, so we surface them via a regex pass.
HEDGING_PHRASES = [
    'i think', 'i believe', 'i feel like', 'i guess',
    'maybe', 'probably', 'perhaps',
    'sort of', 'kind of', 'a little bit',
    "i'm not sure", 'i could be wrong', 'correct me if',
    "if i'm not mistaken",
    'sorry but', 'sorry',
]

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

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB


# Track ready state — backend isn't "ready" for sessions until models are loaded
_models_ready = False


@app.on_event("startup")
async def warmup_models():
    """Pre-load all ML models at startup BEFORE accepting requests.
    This prevents the first user from paying the model-load cost
    AND prevents race conditions during model download."""
    global _models_ready
    loop = asyncio.get_event_loop()

    def preload():
        try:
            print("[Startup] Pre-loading Whisper (this may take a minute on first run)...")
            get_whisper()
            print("[Startup] Pre-loading Silero VAD...")
            get_vad()
            print("[Startup] All models ready. Backend is live.")
            return True
        except Exception as e:
            print(f"[Startup] Model preload FAILED: {e}")
            return False

    # Run model loading in thread pool, but AWAIT it so startup blocks
    # until models are ready. Clients will see 503 until then.
    ok = await loop.run_in_executor(None, preload)
    _models_ready = bool(ok)


@app.get("/")
def root():
    return {"status": "Confidence Detector API running", "version": "2.0.0"}


@app.get("/health")
def health():
    """Health check endpoint for deployment platforms.
    Returns 200 with ready=true only when all models are loaded."""
    models_ok = (face_engine.face_lm is not None and face_engine.pose_lm is not None)
    ready = _models_ready and models_ok
    return {
        "status": "ok" if ready else "loading",
        "models_loaded": models_ok,
        "ready": ready,
        "version": "2.0.0",
    }


# ============================================================
# MODE 1: VIDEO UPLOAD + ANALYSIS (legacy offline mode)
# ============================================================
@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    # Per-upload id namespaces all artifacts (extracted audio, processed video,
    # evidence frames) so concurrent uploads — or repeat uploads of files with
    # the same name — don't overwrite each other's outputs.
    upload_id = uuid.uuid4().hex[:8]
    audio_extraction_error = None
    video_encode_error = None

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

    # If processing fails mid-way, the saved source file must not linger.
    # A single outer try/except around the full pipeline catches every
    # uncaught exception, deletes the source, then re-raises so FastAPI
    # still produces its 500 response.
    try:
        cap = cv2.VideoCapture(filepath)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Extract audio directly into memory via an ffmpeg stdout pipe —
        # no intermediate WAV on disk. -f s16le = raw signed 16-bit LE PCM,
        # matches what AudioPipeline.process_chunk() expects after scaling.
        # Capture stderr so a missing/broken ffmpeg surfaces a real error
        # instead of silently producing has_audio=False.
        has_audio = False
        audio_data = None
        try:
            proc = subprocess.run(
                [FFMPEG, '-i', filepath, '-ar', '16000', '-ac', '1',
                 '-f', 's16le', '-', '-loglevel', 'error'],
                capture_output=True, timeout=120)
            # Minimum ~1000 samples ≈ 62 ms at 16 kHz mono 16-bit = 2000 bytes.
            if proc.returncode == 0 and len(proc.stdout) > 2000:
                audio_int16 = np.frombuffer(proc.stdout, dtype=np.int16)
                audio_data = audio_int16.astype(np.float32) / 32768.0
                has_audio = True
            else:
                tail = (proc.stderr or b"").decode("utf-8", errors="ignore").splitlines()[-3:]
                audio_extraction_error = (
                    "ffmpeg produced no usable audio. " + " | ".join(tail)
                ).strip()
        except FileNotFoundError:
            audio_extraction_error = "ffmpeg binary not found on the server."
        except subprocess.TimeoutExpired:
            audio_extraction_error = "ffmpeg timed out after 120s extracting audio."

        # Process video frames with face engine
        output_name = f"processed_{upload_id}.mp4"
        output_path = os.path.join(UPLOAD_DIR, output_name)

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        face_engine.reset()
        face_results_by_time = []
        all_face_scores = []
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

        cap.release()
        writer.release()

        # Process audio with the production AudioPipeline (faster-whisper + VAD
        # + PYIN + acoustic filler detection). Same pipeline the live and
        # analyzer modes use. audio_data already loaded from ffmpeg stdout pipe.
        speech_summary = None
        speech_timeline = []
        if has_audio:
            if audio_data is not None and len(audio_data) > 0:
                # Split into 3-second chunks (same as live + analyzer paths).
                # The final chunk is zero-padded; this is offline analysis of a
                # known recording so the live silence-padding pathology doesn't
                # apply (the chunk gate inside process_chunk still catches it).
                chunk_size = 16000 * 3
                pipeline = AudioPipeline()
                snapshots = []
                for i in range(0, len(audio_data), chunk_size):
                    chunk = audio_data[i:i + chunk_size]
                    if len(chunk) < chunk_size:
                        chunk = np.pad(chunk, (0, chunk_size - len(chunk)))
                    snapshots.append(pipeline.process_chunk(chunk, sr=16000))

                # ── Aggregate snapshots into the legacy speech_summary shape ──
                all_words = [
                    w for s in snapshots for w in s.get("transcript_words", [])
                ]
                lex_fillers = [w["word"] for w in all_words if w.get("is_filler")]
                acoustic_fillers_total = sum(
                    len(s["raw"].get("acoustic_fillers", [])) for s in snapshots
                )
                full_transcript = " ".join(
                    s.get("transcript_text", "") for s in snapshots
                ).strip()
                full_transcript = " ".join(full_transcript.split())
                total_words = len([w for w in all_words if len(w["word"]) > 1])

                wpms = [
                    s["raw"]["wpm"] for s in snapshots
                    if s["raw"].get("voiced_s", 0) > 0.5 and s["raw"].get("wpm", 0) > 0
                ]
                average_wpm = int(sum(wpms) / len(wpms)) if wpms else 0

                total_fillers = len(lex_fillers) + acoustic_fillers_total
                filler_rate = (
                    round(total_fillers / total_words * 100, 1)
                    if total_words > 0 else 0.0
                )

                # Hedge sweep — Whisper doesn't expose hedge phrases structurally
                ft_lower = full_transcript.lower()
                hedges_found = []
                for phrase in HEDGING_PHRASES:
                    hedges_found.extend([phrase] * ft_lower.count(phrase))

                words_in_text = ft_lower.split()
                total_reps = sum(
                    1 for i in range(1, len(words_in_text))
                    if words_in_text[i] == words_in_text[i - 1]
                )

                steadiness_vals = [
                    s["scores"].get("voice_steadiness", 50) for s in snapshots
                ]
                voice_steadiness = (
                    int(sum(steadiness_vals) / len(steadiness_vals))
                    if steadiness_vals else 50
                )

                # Pitch std drives vocal_variety in scoring_engine — without it
                # the upload report's vocal_variety was always exactly 50.
                pitch_stds = [
                    s["raw"].get("pitch", {}).get("std_hz", 0) for s in snapshots
                ]
                pitch_stds = [p for p in pitch_stds if p > 0]
                avg_pitch_std = (
                    sum(pitch_stds) / len(pitch_stds) if pitch_stds else 0
                )

                # Volume consistency — invert coefficient of variation of RMS
                rms_means = [s["raw"].get("rms", 0) for s in snapshots]
                rms_stds = [s["raw"].get("rms_std", 0) for s in snapshots]
                avg_rms = sum(rms_means) / len(rms_means) if rms_means else 0
                avg_rms_std = sum(rms_stds) / len(rms_stds) if rms_stds else 0
                if avg_rms > 0:
                    cv = avg_rms_std / avg_rms
                    volume_consistency = max(20, min(100, int(100 - cv * 100)))
                else:
                    volume_consistency = 50

                # Pitch score — natural speech variation lands in CV 0.05-0.15
                pitch_means = [
                    s["raw"].get("pitch", {}).get("mean_hz", 0) for s in snapshots
                ]
                pitch_means = [p for p in pitch_means if p > 0]
                avg_pitch_mean = (
                    sum(pitch_means) / len(pitch_means) if pitch_means else 0
                )
                if avg_pitch_mean > 0 and avg_pitch_std > 0:
                    cv_pitch = avg_pitch_std / avg_pitch_mean
                    if 0.05 <= cv_pitch <= 0.15:
                        pitch_score = 90
                    elif 0.03 <= cv_pitch < 0.05 or 0.15 < cv_pitch <= 0.25:
                        pitch_score = 60
                    else:
                        pitch_score = 35
                else:
                    pitch_score = 50

                # Silence gaps — derived from per-chunk vad_segments
                silence_gaps = []
                last_speech_end_ms = 0
                chunk_offset_ms = 0
                for s in snapshots:
                    for seg_start, seg_end in s["raw"].get("vad_segments", []):
                        gap_start_ms = chunk_offset_ms + seg_start
                        gap_size_ms = gap_start_ms - last_speech_end_ms
                        if gap_size_ms > 2000 and last_speech_end_ms > 0:
                            silence_gaps.append({
                                "start": round(last_speech_end_ms / 1000, 1),
                                "duration": round(gap_size_ms / 1000, 1),
                            })
                        last_speech_end_ms = chunk_offset_ms + seg_end
                    chunk_offset_ms += 3000

                speech_summary = {
                    'full_transcript': full_transcript,
                    'duration': round(duration, 1),
                    'total_words': total_words,
                    'total_fillers': total_fillers,
                    'total_hedges': len(hedges_found),
                    'total_repetitions': total_reps,
                    'filler_rate': filler_rate,
                    'average_wpm': average_wpm,
                    'filler_words': lex_fillers,
                    'hedge_phrases': hedges_found,
                    'voice_steadiness': voice_steadiness,
                    'volume_consistency': volume_consistency,
                    'pitch_score': pitch_score,
                    'pitch_std': round(avg_pitch_std, 2),
                    'silence_gaps': silence_gaps,
                    'silence_gap_count': len(silence_gaps),
                }

                for i, s in enumerate(snapshots):
                    text = s.get("transcript_text", "").strip()
                    if not text:
                        continue
                    # Shift per-word timestamps into absolute video time so the
                    # frontend can highlight the active word as the <video> plays.
                    chunk_offset_ms = i * 3000
                    words_abs = [
                        {
                            'word': w['word'],
                            'start_ms': round(w['start_ms'] + chunk_offset_ms, 1),
                            'end_ms': round(w['end_ms'] + chunk_offset_ms, 1),
                            'is_filler': bool(w.get('is_filler', False)),
                        }
                        for w in s.get('transcript_words', [])
                    ]
                    speech_timeline.append({
                        'timestamp': i * 3,
                        'text': text,
                        'fillers': s["raw"].get("lexical_fillers", []),
                        'hedges': [],
                        'speech_score': s["scores"].get("total", 50),
                        'words': words_abs,
                    })

        # Convert to browser-compatible video.
        # cv2.VideoWriter writes video only — no audio — so the overlay
        # file has a silent video track. Splice the SOURCE video's audio
        # back in here with -map, otherwise the preview plays silent.
        web_name = f"web_{output_name}"
        web_path = os.path.join(UPLOAD_DIR, web_name)
        reencode_cmd = [FFMPEG, '-y', '-i', output_path]
        if has_audio:
            # Second input is the original source file; take its audio track.
            reencode_cmd.extend([
                '-i', filepath,
                '-map', '0:v:0',     # video from the overlay file
                '-map', '1:a:0?',    # audio from source; ? = optional
                '-c:a', 'aac',
                '-shortest',         # end when shorter stream ends
            ])
        reencode_cmd.extend([
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-movflags', '+faststart',
            web_path,
        ])
        try:
            proc = subprocess.run(
                reencode_cmd,
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=300)
            ffmpeg_ok = os.path.exists(web_path) and os.path.getsize(web_path) > 0
            if not ffmpeg_ok:
                tail = (proc.stderr or b"").decode("utf-8", errors="ignore").splitlines()[-3:]
                video_encode_error = (
                    "ffmpeg re-encode failed; serving raw output. " + " | ".join(tail)
                ).strip()
        except FileNotFoundError:
            ffmpeg_ok = False
            video_encode_error = "ffmpeg binary not found for re-encode."
        except subprocess.TimeoutExpired:
            ffmpeg_ok = False
            video_encode_error = "ffmpeg re-encode timed out after 300s."
        video_serve = web_name if ffmpeg_ok else output_name

        # The mp4v overlay file is only useful as a libx264 fallback.
        # On the happy path it's already been re-encoded — delete it to save
        # ~100-200 MB per upload. On failure, keep it; video_serve still points
        # at it and the frontend gets a video_encode_error banner.
        if ffmpeg_ok:
            try:
                os.unlink(output_path)
            except OSError:
                pass

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

        # Build audio result for scoring. pitch_std is what the scoring engine
        # actually reads for vocal_variety — without it, vocal_variety always
        # defaulted to 50 in this path.
        avg_audio_result = None
        if speech_summary and speech_summary.get('voice_steadiness') is not None:
            avg_audio_result = {
                'voice_steadiness': speech_summary.get('voice_steadiness', 50),
                'pitch_std': speech_summary.get('pitch_std', 0),
            }

        # Compute sub-scores via scoring engine
        upload_scoring = ScoringEngine()
        sub_scores = upload_scoring.compute_sub_scores(avg_face_result, avg_speech_result, avg_audio_result)
        final_scores = upload_scoring.update(sub_scores)
        overall_score = final_scores['total']

        # Legacy compat scores
        speech_score = sub_scores.get('filler_words')
        pace_score = sub_scores.get('speech_pace')

        # Phase 2: persist Media + MediaSegment rows. No JSON file fallback —
        # the DB is the source of truth. Failure here is logged so the
        # response still returns successfully, but Library + Report endpoints
        # won't see this upload. Warn loudly in logs.
        try:
            _persist_media_and_segments(
                media_id=upload_id,
                source_kind="upload",
                original_name=file.filename,
                stored_path=file.filename,
                playback_path=video_serve,
                duration_s=float(duration),
                has_video=len(all_face_scores) > 0,
                has_audio=has_audio,
                score_avg=overall_score,
                face_timeline=face_results_by_time,
                speech_timeline=speech_timeline,
            )
        except Exception as e:
            print(f"[warn] DB dual-write failed for upload {upload_id}: {e}")

        return JSONResponse({
            'filename': file.filename,
            'duration': round(duration, 1),
            'total_frames': total_frames,
            'has_audio': has_audio,
            'no_face_detected': len(all_face_scores) == 0,
            'audio_extraction_error': audio_extraction_error,
            'video_encode_error': video_encode_error,
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
    except Exception:
        # Processing failed mid-way — delete the orphaned source file before
        # re-raising so FastAPI still produces its 500 response.
        try:
            os.unlink(filepath)
        except OSError:
            pass
        raise


@app.get("/api/video/{filename}")
def serve_video(filename: str):
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        return JSONResponse({"error": "Not found"}, status_code=404)
    return FileResponse(filepath, media_type="video/mp4")


# ============================================================
# MODE 3: SESSION WebSocket (V2 — production audio pipeline)
# ============================================================
@app.websocket("/ws/session/{session_id}")
async def session_ws(ws: WebSocket, session_id: str):
    """
    Production session WebSocket.
    Client sends:
      - Binary: Float32 PCM audio chunks (~3 seconds at 16kHz)
      - Text/JSON: {"type": "face", "scores": {"eye_contact": 0-100, "expression": 0-100, ...}}
    Server sends:
      - Per-chunk JSON with scores + transcript
      - Final {"type": "session_ended", "report": {...}} on disconnect
    """
    await ws.accept()

    # Reject if models aren't ready yet (startup still in progress)
    if not _models_ready:
        await ws.send_json({
            "type": "error",
            "message": "Backend is still loading models. Please wait 30-60s and try again."
        })
        await ws.close()
        return

    pipeline = AudioPipeline()
    snapshots = []
    latest_browser_face = {}  # Face scores from browser MediaPipe
    client_requested_stop = False

    async def finalize_and_send_report():
        """Generate report and send via WebSocket while still open."""
        # Audio already lives inside the uploaded WEBM — no separate WAV.
        recording_info = {
            "session_id": session_id,
            "video_url": f"/api/recordings/{session_id}/video",
        }
        report = generate_post_session_report(snapshots, session_id)
        report["recording"] = recording_info
        # Phase 2: report JSON is now stored inside Media.report_json via
        # _persist_media_and_segments below. No on-disk {session_id}_report.json.

        # Phase 2: reshape snapshots into the face_timeline + speech_timeline
        # dicts _persist_media_and_segments expects, then write to DB (the
        # only persistence now). Failure is logged and sent to the client
        # via ws.send_json so the user sees a real error; no JSON fallback.
        try:
            face_tl = [
                {
                    "timestamp": i * 3,
                    "face_confidence": snap["scores"].get("total", 50),
                    "expression": None,
                    "eye_contact_pct": snap["scores"].get("eye_contact"),
                    "blink_rate": None,
                    "tension_score": None,
                }
                for i, snap in enumerate(snapshots)
            ]
            speech_tl = []
            for i, snap in enumerate(snapshots):
                chunk_offset_ms = i * 3000
                speech_tl.append({
                    "timestamp": i * 3,
                    "text": snap.get("transcript_text", ""),
                    "fillers": snap.get("raw", {}).get("lexical_fillers", []),
                    "hedges": [],
                    "speech_score": snap["scores"].get("speech_pace", 50),
                    # Shift per-chunk word timestamps to absolute so the
                    # DB stores one consistent time base across all rows.
                    "words": [
                        {
                            "word": w.get("word"),
                            "start_ms": int(w.get("start_ms", 0) + chunk_offset_ms),
                            "end_ms": int(w.get("end_ms", 0) + chunk_offset_ms),
                            "is_filler": bool(w.get("is_filler")),
                        }
                        for w in snap.get("transcript_words", [])
                    ],
                })
            _persist_media_and_segments(
                media_id=session_id,
                source_kind="session",
                original_name=None,
                stored_path=None,
                playback_path=f"{session_id}_video.webm",
                duration_s=float(report.get("duration_s") or (len(snapshots) * 3)),
                has_video=(RECORDINGS_DIR / f"{session_id}_video.webm").exists(),
                has_audio=True,
                score_avg=report.get("avg_score"),
                face_timeline=face_tl,
                speech_timeline=speech_tl,
                report_json=report,
            )
        except Exception as e:
            print(f"[warn] DB dual-write failed for session {session_id}: {e}")

        try:
            await ws.send_json({"type": "session_ended", "report": report})
        except Exception:
            pass

    try:
        while True:
            message = await ws.receive()
            if message.get('type') == 'websocket.disconnect':
                break

            if message.get('bytes') is not None:
                # Binary audio chunk (Float32 PCM, ~3s at 16kHz)
                audio = np.frombuffer(message['bytes'], dtype=np.float32)

                result = await asyncio.get_event_loop().run_in_executor(
                    None, pipeline.process_chunk, audio
                )

                if latest_browser_face:
                    result["scores"]["eye_contact"] = latest_browser_face.get("eye_contact", 50)
                    result["scores"]["expression"] = latest_browser_face.get("expression", 50)
                    result["scores"]["total"] = SignalScorer.aggregate(result["scores"])

                snapshots.append(result)
                await ws.send_json(result)

            elif message.get('text') is not None:
                try:
                    data = json.loads(message['text'])
                    if data.get('type') == 'face':
                        latest_browser_face = data.get('scores', {})
                    elif data.get('type') == 'stop_session':
                        # Client explicitly requested stop — finalize NOW while WS is still open
                        await finalize_and_send_report()
                        client_requested_stop = True
                        break
                except Exception:
                    pass

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        # Fallback: if client just closed WS without sending stop_session,
        # still generate + save the report (it will be retrievable via HTTP)
        if not client_requested_stop:
            try:
                await finalize_and_send_report()
            except Exception:
                pass
        try:
            await ws.close()
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
    """Save video recording from a live session.
    Streams to disk with a 500 MB cap; returns a browser-loadable URL."""
    path = RECORDINGS_DIR / f"{session_id}_video.webm"
    size = 0
    with open(path, "wb") as f:
        while True:
            chunk = await video.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_SIZE:
                f.close()
                path.unlink(missing_ok=True)
                return JSONResponse(
                    {"error": "File too large (max 500MB)"}, status_code=413
                )
            f.write(chunk)
    size_mb = round(size / 1e6, 2)
    return {
        "status": "saved",
        "video_url": f"/api/recordings/{session_id}/video",
        "size_mb": size_mb,
    }


@app.get("/api/recordings")
def list_recordings():
    """List all recorded session audio files."""
    return _list_session_recordings()


@app.get("/api/recordings/{session_id}/video")
def get_recording_video(session_id: str):
    path = RECORDINGS_DIR / f"{session_id}_video.webm"
    if not path.exists():
        return JSONResponse({"error": "Not found"}, status_code=404)
    return FileResponse(str(path), media_type="video/webm")


@app.get("/api/report/{session_id}")
def get_session_report(session_id: str):
    """Get a saved session report by session ID.

    Phase 2: reads from Media.report_json in Postgres. The per-session
    JSON file still exists on disk as a dual-write backup but is not
    consulted — DB is the source of truth now.
    """
    with SessionLocal() as db:
        media = db.get(Media, session_id)
        if media is None or media.report_json is None:
            return JSONResponse({"error": "Report not found"}, status_code=404)
        return media.report_json


if __name__ == "__main__":
    import uvicorn
    print("=" * 55)
    print("  Confidence Detector API v2.0.0")
    print("  Session + Upload + Analyzer (browser-native live)")
    print(f"  http://localhost:{PORT}")
    print(f"  Docs: http://localhost:{PORT}/docs")
    print(f"  Health: http://localhost:{PORT}/health")
    print(f"  WebSocket: ws://localhost:{PORT}/ws/session/<id>")
    print(f"  Analyzer: POST /api/analyze-audio")
    print("=" * 55)
    uvicorn.run(app, host="0.0.0.0", port=PORT)
