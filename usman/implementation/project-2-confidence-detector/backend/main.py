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

import base64
import cv2
import hashlib
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
from fastapi import Request, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from face_engine import FaceEngine
from scoring_engine import ScoringEngine, generate_tips
from audio_pipeline import AudioPipeline, get_whisper, get_vad
from signal_scorer import SignalScorer
from session_recorder import list_recordings as _list_session_recordings, RECORDINGS_DIR
from report_generator import generate_post_session_report
from sqlalchemy import select, text
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
import re

from db import SessionLocal, engine as _db_engine
from models import Media, MediaSegment, User, Comment
from log_config import configure_logging, get_logger

# Install the JSON formatter as early as possible so every subsequent
# log line (including uvicorn access logs) flows through it.
configure_logging()
log = get_logger("confidence_detector")


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


# ── Path-traversal guard ────────────────────────────────────────────────
# Every endpoint that consumes a media/session id and uses it to build a
# filesystem path must run the id through this first. Accepts only what
# our own id generators produce: a-z, A-Z, 0-9, underscore, dot, 1-80 chars.
# Rejects: "../", "/", "\", control chars, anything longer than 80.
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_\.]{1,80}$")


def _safe_media_id(media_id: str) -> bool:
    """Return True iff the id is safe to interpolate into a filesystem path."""
    if not isinstance(media_id, str):
        return False
    return bool(_SAFE_ID_RE.match(media_id))


def _persist_media_and_segments(
    *,
    media_id: str,
    source_kind: str,
    user_id: str | None,
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
    content_sha256: str | None = None,
    title: str | None = None,
) -> None:
    """Dual-write helper — called from upload + session paths.

    `user_id` is required for new rows (every recording belongs to one
    user). The parameter is technically Optional because the legacy
    backfill migration produced rows without one, but every new persist
    call must supply it. Callers that don't have a user_id are buggy.

    Wrapped in a broad try/except by callers so a DB failure cannot kill
    the main response while Phase 2 is still dual-writing alongside the
    JSON files.
    """
    grade = _grade_for(score_avg) if score_avg is not None else None

    with SessionLocal() as db:
        media = Media(
            id=media_id,
            source_kind=source_kind,
            user_id=user_id,
            original_name=original_name,
            stored_path=stored_path,
            playback_path=playback_path,
            duration_s=duration_s,
            has_video=has_video,
            has_audio=has_audio,
            score_avg=score_avg,
            score_grade=grade,
            report_json=report_json,
            content_sha256=content_sha256,
            # Default title — caller decides what makes sense (filename
            # stem for uploads, "Recording <ts> - Video/Audio" for
            # live captures). Trimmed + length-capped to match the
            # PATCH /api/media/{id} validation, so the user can't end
            # up with a default that breaks future edits.
            title=(title.strip()[:200] if isinstance(title, str) and title.strip() else None),
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

# CORS origins — default to local dev only. In production set CORS_ORIGINS
# to a comma-separated list of explicit origins ("https://app.example.com").
# Using "*" is supported for deliberate public-API deployments but is NEVER
# compatible with credential-bearing requests (cookies) — keep that in mind
# before adding auth.
_DEFAULT_CORS = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", _DEFAULT_CORS).split(",")
    if o.strip()
]

# Shout loudly if the operator has set CORS_ORIGINS=*. Wildcard CORS:
#   - lets any website on the internet call this backend from a browser
#   - is incompatible with credentialed requests, so if you later add
#     cookie auth it will silently break
# Keep wildcard only for deliberate throwaway demo deploys.
if "*" in CORS_ORIGINS:
    log.warning(
        "cors.wildcard_enabled",
        extra={
            "origins": CORS_ORIGINS,
            "detail": (
                "CORS_ORIGINS='*' — every origin can call this backend. "
                "Set CORS_ORIGINS to a comma-separated allow-list before "
                "production."
            ),
        },
    )

app = FastAPI(title="Confidence Detector API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── JWT-based authentication ────────────────────────────────────
# Auth is now per-endpoint via FastAPI's `Depends(get_current_user)`.
# Each protected handler declares the dependency and receives a `User`
# object; unauthenticated callers get a 401 with a clean WWW-Authenticate
# header. Public endpoints (login, register, health, root, docs) simply
# don't include the dependency.
#
# The previous global X-API-Key middleware was removed because:
#   - middleware-level checks tangled with per-endpoint exemption lists
#   - real user identity (User row) was never threaded through anyway
#   - JWT verification needs to be selective: /api/auth/login MUST be
#     reachable without a token
#
# The frontend stores the JWT in localStorage and sends it as
# Authorization: Bearer <token> via apiFetch.
#
# WebSocket auth is handled inside the session_ws handler — it reads
# `?token=` from the query string, decodes it, and rejects with a 4401
# close code on failure (browsers can't set custom headers on WS
# upgrades, so query-string is the only option).
from auth import (
    JWT_SECRET, _DEFAULT_SECRET,
    decode_token, get_current_user, get_current_user_for_media,
    media_readable_by, media_owned_by,
)
if JWT_SECRET == _DEFAULT_SECRET:
    log.warning(
        "auth.jwt_secret_default",
        extra={
            "detail": (
                "JWT_SECRET is the dev default. Set JWT_SECRET env var "
                "to a random 32+ byte string before deploying to "
                "production — otherwise tokens are forgeable by anyone "
                "who reads this codebase."
            ),
        },
    )


# ── Rate limiting (slowapi) ─────────────────────────────────────
# Keyed by X-API-Key when present, else by client IP. Limits are
# deliberately generous for dev and prevent only obvious abuse.
# Tune via env or edit per-route decorators (@limiter.limit("10/hour")).
def _rate_limit_key(request: Request) -> str:
    key = request.headers.get("X-API-Key")
    if key:
        return f"key:{key}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=_rate_limit_key,
    default_limits=["120/minute"],
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# NOTE: FaceEngine is instantiated per-request inside upload_video — the
# instance keeps per-session mutable state (baseline, blink_times, etc.)
# that MUST NOT be shared across concurrent requests. The old global
# `face_engine = FaceEngine()` was a correctness bug waiting for the
# second simultaneous user.

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
            log.info("startup.models.loading", extra={"model": "whisper"})
            get_whisper()
            log.info("startup.models.loading", extra={"model": "silero_vad"})
            get_vad()
            log.info("startup.models.loading", extra={"model": "face_engine"})
            # Probe: instantiate once to surface a missing .task file at
            # startup rather than on the first upload. Discard immediately
            # — actual uploads create their own per-request instance.
            FaceEngine()
            log.info("startup.models.ready")
            return True
        except Exception as e:
            log.exception("startup.models.failed", extra={"error": str(e)})
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
    Returns 200 with ready=true only when models AND DB are reachable.
    Load balancers should treat ready=false as "do not route traffic".

    The FaceEngine is instantiated per-request now, so model readiness is
    represented by the `_models_ready` flag set after warmup_models() has
    finished preloading Whisper + VAD + verifying FaceEngine can load.
    """
    # Cheap DB round-trip so a Postgres outage trips this check. Without
    # this, load balancers happily route traffic to an app that will 500
    # on the first query.
    db_ok = False
    db_error = None
    try:
        with _db_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        db_error = str(e)[:200]

    ready = _models_ready and db_ok
    return {
        "status": "ok" if ready else "loading",
        "models_loaded": _models_ready,
        "db_connected": db_ok,
        "db_error": db_error,
        "ready": ready,
        "version": "2.0.0",
    }


# ============================================================
# AUTH — register / login / me
# ============================================================
class RegisterPayload(BaseModel):
    email: EmailStr
    name: str
    password: str


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    token: str
    user: dict


@app.post("/api/auth/register", response_model=TokenResponse)
@limiter.limit("10/hour")
def register(request: Request, payload: RegisterPayload):
    """Create a new account and return a JWT.

    Email uniqueness is enforced at the DB level (unique index). On
    conflict we return 409 with a generic "already registered" message
    so we don't leak which emails are present (mild enumeration guard;
    the login flow's distinct error messages would defeat it, but no
    point making it free).
    """
    from auth import hash_password, create_access_token, new_user_id
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    try:
        pw_hash = hash_password(payload.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    user_id = new_user_id()
    with SessionLocal() as db:
        existing = db.query(User).filter(User.email == payload.email).first()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="An account with that email already exists.",
            )
        user = User(
            id=user_id,
            email=str(payload.email).lower(),
            name=name,
            password_hash=pw_hash,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return TokenResponse(
            token=create_access_token(user.id),
            user={"id": user.id, "email": user.email, "name": user.name},
        )


@app.post("/api/auth/login", response_model=TokenResponse)
@limiter.limit("20/hour")
def login(request: Request, payload: LoginPayload):
    """Verify credentials and return a JWT.

    Returns 401 with a deliberately vague message on either bad email
    OR bad password. Distinguishing the two would let an attacker
    enumerate registered emails.
    """
    from auth import verify_password, create_access_token
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == str(payload.email).lower()).first()
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password.",
            )
        return TokenResponse(
            token=create_access_token(user.id),
            user={"id": user.id, "email": user.email, "name": user.name},
        )


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)):
    """Return the current user. Frontend uses this on app boot to
    decide whether to show login or the main UI."""
    return {"id": user.id, "email": user.email, "name": user.name}


# ============================================================
# PROMPTS — practice topic library
# ============================================================
@app.get("/api/prompts")
def get_prompts(user: User = Depends(get_current_user)):
    """Return the practice-prompt library. Auth-required so the list
    isn't world-scrapable, even though the content is non-sensitive
    today — keeps the policy uniform across endpoints.

    Response shape: [{id, title, body, category, suggested_min}, ...]
    """
    from prompts import list_prompts
    return list_prompts()


# Logout is intentionally not a server endpoint. JWT is stateless;
# "logout" is the client dropping its token from localStorage. A real
# server-side logout would require a token-blacklist table, which
# isn't worth the complexity at this scale.


# ============================================================
# MODE 1: VIDEO UPLOAD + ANALYSIS (legacy offline mode)
# ============================================================
@app.post("/api/upload")
@limiter.limit("10/hour")
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    # Per-upload id namespaces all artifacts (extracted audio, processed video,
    # evidence frames) so concurrent uploads — or repeat uploads of files with
    # the same name — don't overwrite each other's outputs.
    # Full 32-char uuid4 hex = 128 bits of entropy. The previous 8-char
    # id had a 50% collision probability at ~65k rows (birthday bound)
    # which would surface as a 500 on Media.id unique-constraint
    # violation. The full hex effectively eliminates that risk.
    upload_id = uuid.uuid4().hex
    audio_extraction_error = None
    video_encode_error = None

    # Save uploaded file with size validation AND compute sha256 as we go.
    #
    # Store under {upload_id}{safe_ext} rather than the user-supplied
    # filename. This:
    #   - prevents two uploads with the same name from overwriting each
    #     other's source file on disk;
    #   - closes the path-traversal hole (file.filename is user input and
    #     could contain "../..");
    #   - keeps a clean 1:1 relationship between upload_id and stored bytes.
    # The original filename is preserved in `original_name` (display only).
    #
    # The sha256 is stored on the Media row as a content fingerprint for
    # future analytics (e.g. "you've uploaded this before") but is NOT
    # used to short-circuit processing — every upload runs the full
    # pipeline so the user sees a predictable spinner → result flow.
    original_name = file.filename or "upload"
    safe_ext = Path(original_name).suffix.lower()
    # Allow only a small set of suffixes so a nonsense one can't pollute disk.
    if safe_ext not in {".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".ogv"}:
        safe_ext = ".mp4"
    filepath = os.path.join(UPLOAD_DIR, f"{upload_id}{safe_ext}")
    size = 0
    hasher = hashlib.sha256()
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
            hasher.update(chunk)
            f.write(chunk)
    content_sha256 = hasher.hexdigest()

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

        # Reject clips shorter than 3 seconds with a clean 400 rather
        # than processing them. Below 3 s: a single chunk is zero-padded
        # to fill AudioPipeline's window, which skews pitch / WPM stats
        # by ~2× (denominator is padded silence). We'd rather tell the
        # user to re-record than silently publish garbage numbers.
        if duration > 0 and duration < 3.0:
            cap.release()
            try: os.unlink(filepath)
            except OSError: pass
            return JSONResponse(
                {
                    "error": "Recording too short",
                    "detail": (
                        f"The clip is {duration:.1f} s. "
                        "Please upload at least 3 s of footage so the "
                        "speech and face analysis have enough signal to "
                        "produce meaningful scores."
                    ),
                },
                status_code=400,
            )

        # Stream audio through ffmpeg's stdout in 3-second windows and
        # process each window through AudioPipeline as it arrives, so the
        # full waveform is never resident in RAM. For a 3-hour upload the
        # old capture_output=True path peaked at ~1 GB (int16 bytes + the
        # float32 view). This path never holds more than a single chunk
        # at a time.
        has_audio = False
        snapshots: list[dict] = []
        try:
            # Hardening against malformed / malicious media files:
            #   -err_detect crccheck+bitstream  — bail on structural errors
            #       early instead of pushing garbage bytes through decode
            #       libraries that historically had RCE CVEs. Must appear
            #       BEFORE -i (it's an input-demuxer flag).
            #   -fflags +discardcorrupt         — drop corrupt frames
            #       rather than propagating them. Also input-side.
            #
            # Note: we deliberately DO NOT pass -max_muxing_queue_size
            # here. That's an output-muxer option and ffmpeg rejects it
            # on raw-PCM pipes (which have no real mux). It only helps
            # on complex A+V re-encodes — see the re-encode call later
            # in this handler where it's used correctly.
            proc = subprocess.Popen(
                [FFMPEG,
                 '-err_detect', 'crccheck+bitstream',
                 '-fflags', '+discardcorrupt',
                 '-i', filepath,
                 '-ar', '16000', '-ac', '1',
                 '-f', 's16le', '-', '-loglevel', 'error'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
        except FileNotFoundError:
            audio_extraction_error = "ffmpeg binary not found on the server."
            proc = None
        if proc is not None:
            chunk_samples = 16000 * 3  # 3 seconds
            chunk_bytes = chunk_samples * 2  # int16 = 2 bytes per sample
            pipeline = AudioPipeline()

            def _stream_and_process_sync():
                nonlocal has_audio
                total_bytes = 0
                leftover = b""
                try:
                    while True:
                        need = chunk_bytes - len(leftover)
                        data = proc.stdout.read(need) if need > 0 else b""
                        if not data:
                            break
                        total_bytes += len(data)
                        buf = leftover + data
                        while len(buf) >= chunk_bytes:
                            piece = buf[:chunk_bytes]
                            buf = buf[chunk_bytes:]
                            arr = np.frombuffer(piece, dtype=np.int16).astype(np.float32) / 32768.0
                            snapshots.append(pipeline.process_chunk(arr, sr=16000))
                        leftover = buf
                    if leftover:
                        arr = np.frombuffer(leftover, dtype=np.int16).astype(np.float32) / 32768.0
                        if len(arr) < chunk_samples:
                            arr = np.pad(arr, (0, chunk_samples - len(arr)))
                        snapshots.append(pipeline.process_chunk(arr, sr=16000))
                    try:
                        rc = proc.wait(timeout=30)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        rc = -1
                    err_tail = ""
                    if proc.stderr:
                        err_tail = proc.stderr.read().decode("utf-8", errors="ignore")
                    # Minimum ~1000 samples ≈ 62 ms = 2000 bytes.
                    if rc == 0 and total_bytes > 2000:
                        has_audio = True
                        return None
                    tail_lines = err_tail.splitlines()[-3:]
                    return (
                        "ffmpeg produced no usable audio. " + " | ".join(tail_lines)
                    ).strip()
                finally:
                    try: proc.stdout.close()
                    except Exception: pass
                    try: proc.stderr.close()
                    except Exception: pass

            audio_extraction_error = await asyncio.get_event_loop().run_in_executor(
                None, _stream_and_process_sync
            )

        # Process video frames with face engine
        output_name = f"processed_{upload_id}.mp4"
        output_path = os.path.join(UPLOAD_DIR, output_name)

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        # Per-request FaceEngine instance. CRITICAL: sharing a single
        # instance across concurrent requests corrupts blink_times /
        # baseline / eye_contact_hist between users. Instantiation costs
        # ~0.5-1.5s (MediaPipe model load) which is negligible compared
        # to the 30-120s video processing that follows.
        face_engine = FaceEngine()

        # The frame loop is the single biggest blocking cost in the
        # upload pipeline — MediaPipe + cv2 writes for a 60-s clip run
        # 30-120 s of pure CPU. Run it inside a worker thread via
        # run_in_executor so the FastAPI event loop can continue to
        # serve health checks, WebSockets, and other uploads.
        def _frame_loop_sync():
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
                    # Capture a tiny base64 JPEG thumbnail from the same frame we
                    # already have in memory. Width 120 px preserves aspect. Embedded
                    # in the response so the frontend renders it instantly via
                    # <img src="data:image/jpeg;base64,..."> — no separate request,
                    # no CORS, no persistent file. ~3-8 KB per thumb.
                    thumb_data_url = None
                    try:
                        h, w = frame_with_overlay.shape[:2]
                        thumb_w = 120
                        thumb_h = max(1, int(h * thumb_w / w))
                        thumb = cv2.resize(
                            frame_with_overlay, (thumb_w, thumb_h),
                            interpolation=cv2.INTER_AREA,
                        )
                        ok_enc, buf = cv2.imencode(
                            ".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 72]
                        )
                        if ok_enc:
                            thumb_data_url = (
                                "data:image/jpeg;base64,"
                                + base64.b64encode(buf.tobytes()).decode("ascii")
                            )
                    except Exception:
                        thumb_data_url = None

                    face_results_by_time.append({
                        'timestamp': round(ts, 1),
                        'time_display': f"{int(ts)//60:02d}:{int(ts)%60:02d}",
                        'expression': last_result['expression'],
                        'eye_contact_pct': last_result['eye_contact_pct'],
                        'blink_rate': last_result['blink_rate'],
                        'tension_score': last_result.get('tension_score', 0),
                        'face_confidence': last_result['confidence_score'],
                        'thumb': thumb_data_url,
                    })

            cap.release()
            writer.release()
            return face_results_by_time, all_face_scores

        face_results_by_time, all_face_scores = await asyncio.get_event_loop().run_in_executor(
            None, _frame_loop_sync
        )

        # Snapshots were already produced during streaming audio extraction
        # above — AudioPipeline processed each 3s window as it came off
        # ffmpeg's stdout. Nothing more to do here besides aggregation.
        speech_summary = None
        speech_timeline = []
        if has_audio:
            if snapshots:
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
        # Same hardening flags as the audio-extract Popen above. The
        # re-encode touches user-controlled bytes again (second pass
        # over the source-plus-overlay), so apply the same guards.
        reencode_cmd = [
            FFMPEG,
            '-err_detect', 'crccheck+bitstream',
            '-fflags', '+discardcorrupt',
            '-y', '-i', output_path,
        ]
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
        # ffmpeg re-encode is a subprocess.run that can take 30-90s on long
        # clips — another event-loop blocker. Dispatch to a worker thread.
        def _reencode_sync():
            try:
                proc = subprocess.run(
                    reencode_cmd,
                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=300)
                ok = os.path.exists(web_path) and os.path.getsize(web_path) > 0
                if not ok:
                    tail = (proc.stderr or b"").decode("utf-8", errors="ignore").splitlines()[-3:]
                    err = (
                        "ffmpeg re-encode failed; serving raw output. "
                        + " | ".join(tail)
                    ).strip()
                    return False, err
                return True, None
            except FileNotFoundError:
                return False, "ffmpeg binary not found for re-encode."
            except subprocess.TimeoutExpired:
                return False, "ffmpeg re-encode timed out after 300s."

        ffmpeg_ok, _ffmpeg_err = await asyncio.get_event_loop().run_in_executor(
            None, _reencode_sync
        )
        if _ffmpeg_err is not None:
            video_encode_error = _ffmpeg_err
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

        # Build the response once so we can both return it AND store it in
        # Media.report_json for the Library / /api/report/{id} endpoint.
        # Multi-face warning: if more than 10% of processed frames saw a
        # second person in shot, surface a warning so the user knows the
        # scores were computed on whichever face MediaPipe picked first
        # — which might not be them.
        multi_face_warning = None
        if face_engine.frames_processed > 0:
            multi_face_pct = round(
                100 * face_engine.frames_multi_face / face_engine.frames_processed
            )
            if multi_face_pct >= 10:
                multi_face_warning = (
                    f"A second face was in frame {multi_face_pct}% of the time. "
                    "Scores are based on whichever face MediaPipe detected first — "
                    "which may not be you."
                )

        response_payload = {
            'media_id': upload_id,
            'filename': original_name,
            'duration': round(duration, 1),
            'total_frames': total_frames,
            'has_audio': has_audio,
            'no_face_detected': len(all_face_scores) == 0,
            'multi_face_warning': multi_face_warning,
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
        }

        # Phase 2: persist Media + MediaSegment rows. Failure here is logged
        # so the response still returns successfully, but Library + Report
        # endpoints won't see this upload. Warn loudly in logs.
        #
        # Strip base64 thumbs before saving: each `face_timeline[n].thumb`
        # is ~3-8 KB, and at 1 thumb per 2 s of video a 10-minute clip
        # racks up ~900 KB of inline base64 in report_json. That bloats
        # every GET /api/report/{id} response forever. The fresh upload
        # response still carries them (user expects to see evidence on
        # first view); subsequent Library revisits render placeholders.
        slim_face_timeline = [
            {k: v for k, v in e.items() if k != 'thumb'}
            for e in face_results_by_time
        ]
        slim_report = {**response_payload, 'face_timeline': slim_face_timeline}
        try:
            _persist_media_and_segments(
                media_id=upload_id,
                source_kind="upload",
                user_id=user.id,
                original_name=original_name,
                stored_path=f"{upload_id}{safe_ext}",
                playback_path=video_serve,
                duration_s=float(duration),
                has_video=len(all_face_scores) > 0,
                has_audio=has_audio,
                score_avg=overall_score,
                face_timeline=face_results_by_time,
                speech_timeline=speech_timeline,
                report_json=slim_report,
                content_sha256=content_sha256,
                # Default title = uploaded filename minus extension.
                # The user can rename via the inline editor later.
                title=Path(original_name).stem if original_name else None,
            )
        except Exception as e:
            log.warning(
                "db.dual_write_failed",
                extra={"media_id": upload_id, "source": "upload", "error": str(e)},
            )

        return JSONResponse(response_payload)
    except Exception:
        # Processing failed mid-way — delete the orphaned source file before
        # re-raising so FastAPI still produces its 500 response.
        try:
            os.unlink(filepath)
        except OSError:
            pass
        raise


def _serve_with_range(request: Request, path: str, media_type: str):
    """Serve a file with HTTP Range support so browsers can scrub videos.

    Starlette's FileResponse (<= 0.38.x) ignores Range headers, which makes
    <video>/<audio> elements unseekable in many browsers. This helper parses
    the Range header, returns 206 Partial Content with a correct Content-Range,
    and streams only the requested byte slice.
    """
    if not os.path.exists(path):
        return JSONResponse({"error": "Not found"}, status_code=404)

    file_size = os.path.getsize(path)
    range_header = request.headers.get("range") or request.headers.get("Range")

    # No Range header — full file with Accept-Ranges so the browser knows
    # it CAN seek and issues a Range request on the next click.
    if not range_header:
        def full_iter():
            with open(path, "rb") as f:
                while True:
                    chunk = f.read(1024 * 1024)
                    if not chunk:
                        break
                    yield chunk
        return StreamingResponse(
            full_iter(),
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )

    # Parse "bytes=start-end"
    try:
        units, _, rng = range_header.partition("=")
        if units.strip().lower() != "bytes":
            raise ValueError("unsupported unit")
        start_s, _, end_s = rng.partition("-")
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else file_size - 1
    except Exception:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

    if start < 0 or end >= file_size or start > end:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

    length = end - start + 1

    def range_iter():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            chunk_size = 1024 * 1024
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        range_iter(),
        status_code=206,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(length),
        },
    )


@app.get("/api/video/{filename}")
def serve_video(
    filename: str,
    request: Request,
    user: User = Depends(get_current_user_for_media),
):
    # Guard against ../ etc. before building a filesystem path. The
    # filename is user-controlled via the URL.
    if not _safe_media_id(filename):
        return JSONResponse({"error": "Invalid filename"}, status_code=400)
    # Look up the Media row by playback_path; allow access if the
    # caller owns it OR has been shared on it. Without this check
    # anyone could read any uploaded video by guessing filenames.
    with SessionLocal() as db:
        m = db.query(Media).filter(Media.playback_path == filename).first()
        if not media_readable_by(user.id, m):
            return JSONResponse({"error": "Not found"}, status_code=404)
    filepath = os.path.join(UPLOAD_DIR, filename)
    return _serve_with_range(request, filepath, media_type="video/mp4")


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

    ?kind query param (default "session"):
      - "session"        → Live Practice flow; persisted as video, video_url served.
      - "analyzer_audio" → Live Audio Analyzer flow; persisted as audio-only,
                           audio_url served.
    """
    # Auth check must happen BEFORE accept() so an unauthorised client
    # gets a clean 4401 close-frame reason rather than an accepted socket
    # that immediately disconnects. Browsers can't set custom headers on
    # the WS upgrade, so we accept the JWT via the `?token=` query param.
    token = ws.query_params.get("token") or ""
    payload = decode_token(token) if token else None
    if not payload or "sub" not in payload:
        await ws.close(code=4401)
        return
    ws_user_id: str = payload["sub"]
    # Confirm the user still exists in the DB. Without this, a token
    # issued to a since-deleted account would still pass the decode.
    with SessionLocal() as db:
        if db.get(User, ws_user_id) is None:
            await ws.close(code=4401)
            return

    await ws.accept()

    # Guard against path-traversal patterns in session_id before any
    # filesystem path is built from it.
    if not _safe_media_id(session_id):
        await ws.send_json({"type": "error", "message": "Invalid session id"})
        await ws.close()
        return

    # Reject if models aren't ready yet (startup still in progress)
    if not _models_ready:
        await ws.send_json({
            "type": "error",
            "message": "Backend is still loading models. Please wait 30-60s and try again."
        })
        await ws.close()
        return

    kind = ws.query_params.get("kind", "session")
    if kind not in ("session", "analyzer_audio"):
        kind = "session"

    pipeline = AudioPipeline()
    snapshots = []
    latest_browser_face = {}  # Face scores from browser MediaPipe
    client_requested_stop = False
    _finalized = False  # Guard against double-finalize races.

    async def finalize_and_send_report():
        """Generate report and send via WebSocket while still open.

        Idempotent: if called twice (e.g. once from an explicit stop_session
        and again from the finally-block fallback when the client also
        disconnects), the second call is a no-op. Prevents unique-constraint
        violations from a duplicate Media insert and keeps the report stable.
        """
        nonlocal _finalized
        if _finalized:
            return
        _finalized = True

        if kind == "analyzer_audio":
            recording_info = {
                "media_id": session_id,
                "audio_url": f"/api/analyzer/{session_id}/audio",
            }
        else:
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
            # Audio-only analyzer rows don't have a video file. Their
            # playback file is whichever audio extension the client
            # uploaded (saved by /api/session/upload-audio as analyzer_<id>.<ext>).
            if kind == "analyzer_audio":
                audio_matches = list(RECORDINGS_DIR.glob(f"{session_id}.*"))
                playback = audio_matches[0].name if audio_matches else None
                has_video = False
                has_audio = True
                source_kind = "analyzer_audio"
                # Face timeline is meaningless for audio-only; skip it.
                face_rows = []
            else:
                playback = f"{session_id}_video.webm"
                has_video = (RECORDINGS_DIR / playback).exists()
                has_audio = True
                source_kind = "session"
                face_rows = face_tl

            # Attach speech_timeline to the report so AudioPlaybackReview
            # (and any future consumer) can always reach absolute-timestamped
            # words, regardless of how transcript was built.
            report["speech_timeline"] = speech_tl

            # Default title for a LIVE recording: timestamped, with the
            # medium ("Video" / "Audio") suffixed so a quick Library
            # scan tells you what kind of practice it was. UTC because
            # the server doesn't know the user's timezone; we mark it
            # explicitly so the value isn't mis-read locally.
            from datetime import datetime as _dt, timezone as _tz
            ts = _dt.now(_tz.utc).strftime("%Y-%m-%d %H:%M UTC")
            medium_suffix = "Audio" if source_kind == "analyzer_audio" else "Video"
            default_title = f"Recording {ts} - {medium_suffix}"

            _persist_media_and_segments(
                media_id=session_id,
                source_kind=source_kind,
                user_id=ws_user_id,
                original_name=None,
                stored_path=None,
                playback_path=playback,
                duration_s=float(report.get("duration_s") or (len(snapshots) * 3)),
                has_video=has_video,
                has_audio=has_audio,
                score_avg=report.get("avg_score"),
                face_timeline=face_rows,
                speech_timeline=speech_tl,
                report_json=report,
                title=default_title,
            )
        except Exception as e:
            log.warning(
                "db.dual_write_failed",
                extra={"media_id": session_id, "source": "session", "error": str(e)},
            )

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
@limiter.limit("10/hour")
async def analyze_audio_file(
    request: Request,
    audio_file: UploadFile = File(...),
    session_label: str = Form(default="uploaded"),
    user: User = Depends(get_current_user),
):
    """
    Accepts any audio file (WAV, MP3, M4A, WebM, OGG).
    Runs full speech intelligence pipeline.
    Persists a Media row (source_kind='analyzer_audio') so the Library
    lists this analysis alongside uploads and live sessions. The audio
    file itself is saved to RECORDINGS_DIR for later playback.
    """
    media_id = f"analyzer_{uuid.uuid4().hex}"
    suffix = Path(audio_file.filename or "recording.webm").suffix or ".webm"
    saved_name = f"{media_id}{suffix}"
    saved_path = RECORDINGS_DIR / saved_name

    # Stream to disk, computing sha256 as a content fingerprint for the row.
    hasher = hashlib.sha256()
    with open(saved_path, "wb") as f:
        while True:
            chunk_bytes = await audio_file.read(1024 * 1024)
            if not chunk_bytes:
                break
            hasher.update(chunk_bytes)
            f.write(chunk_bytes)
    content_sha256 = hasher.hexdigest()

    # Every analyzer run is processed fresh. sha256 is stored on the row
    # as a fingerprint (see upload_video for rationale) but NOT used to
    # short-circuit — predictable spinner → result is preferred over the
    # "sometimes instant" dedup behaviour.

    # Stream through ffmpeg stdout in 3-second windows, pipelining each
    # window into AudioPipeline as it arrives. librosa.load() — the old
    # path — materialised the entire waveform at 16 kHz float32, which
    # OOMs on hour-scale uploads (~230 MB/hour). This approach keeps at
    # most one 3-second chunk (~192 KB) in memory at a time.
    chunk_samples = 16000 * 3
    chunk_bytes = chunk_samples * 2  # int16 = 2 bytes per sample
    pipeline = AudioPipeline()
    snapshots: list[dict] = []

    try:
        # Same hardening flags as upload_video — input-side only. No
        # -max_muxing_queue_size on raw-PCM pipes (see that handler's
        # comment for why).
        proc = subprocess.Popen(
            [FFMPEG,
             '-err_detect', 'crccheck+bitstream',
             '-fflags', '+discardcorrupt',
             '-i', str(saved_path),
             '-ar', '16000', '-ac', '1',
             '-f', 's16le', '-', '-loglevel', 'error'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        try: saved_path.unlink()
        except OSError: pass
        return JSONResponse(
            {"error": "ffmpeg binary not found on the server."},
            status_code=500,
        )

    def _stream_and_process_sync():
        total_bytes = 0
        leftover = b""
        try:
            while True:
                need = chunk_bytes - len(leftover)
                data = proc.stdout.read(need) if need > 0 else b""
                if not data:
                    break
                total_bytes += len(data)
                buf = leftover + data
                while len(buf) >= chunk_bytes:
                    piece = buf[:chunk_bytes]
                    buf = buf[chunk_bytes:]
                    arr = np.frombuffer(piece, dtype=np.int16).astype(np.float32) / 32768.0
                    result = pipeline.process_chunk(arr, sr=16000)
                    # Audio-only: no face data, set to neutral
                    result["scores"]["eye_contact"] = 50
                    result["scores"]["expression"] = 50
                    result["scores"]["total"] = SignalScorer.aggregate(result["scores"])
                    snapshots.append(result)
                leftover = buf
            if leftover:
                arr = np.frombuffer(leftover, dtype=np.int16).astype(np.float32) / 32768.0
                if len(arr) < chunk_samples:
                    arr = np.pad(arr, (0, chunk_samples - len(arr)))
                result = pipeline.process_chunk(arr, sr=16000)
                result["scores"]["eye_contact"] = 50
                result["scores"]["expression"] = 50
                result["scores"]["total"] = SignalScorer.aggregate(result["scores"])
                snapshots.append(result)
            try:
                rc = proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                proc.kill()
                rc = -1
            err_tail = proc.stderr.read().decode("utf-8", errors="ignore") if proc.stderr else ""
            if rc != 0 or total_bytes < 2000:
                tail_lines = err_tail.splitlines()[-3:]
                return "Could not decode audio. " + " | ".join(tail_lines)
            # Reject clips shorter than 3 s. Below that, a single chunk
            # is padded with silence which skews pitch/WPM stats by ~2×.
            # 3 s × 16000 Hz × 2 bytes/sample = 96000 bytes.
            if total_bytes < 96000:
                seconds = total_bytes / (16000 * 2)
                return (
                    f"Audio is too short ({seconds:.1f} s). Please "
                    "upload at least 3 s so speech analysis has enough "
                    "signal to produce meaningful scores."
                )
            return None
        finally:
            try: proc.stdout.close()
            except Exception: pass
            try: proc.stderr.close()
            except Exception: pass

    decode_error = await asyncio.get_event_loop().run_in_executor(
        None, _stream_and_process_sync
    )
    if decode_error:
        try: saved_path.unlink()
        except OSError: pass
        return JSONResponse({"error": decode_error}, status_code=400)

    report = generate_post_session_report(snapshots, media_id)
    report["media_id"] = media_id
    report["source"] = "file_upload"
    report["filename"] = audio_file.filename
    report["note"] = "Eye contact and expression scores not available for audio-only files."
    report["recording"] = {
        "media_id": media_id,
        "audio_url": f"/api/analyzer/{media_id}/audio",
    }

    # Build timelines so Library listings + report retrieval round-trip.
    speech_tl = []
    for i, s in enumerate(snapshots):
        chunk_offset_ms = i * 3000
        speech_tl.append({
            "timestamp": i * 3,
            "text": s.get("transcript_text", ""),
            "fillers": s.get("raw", {}).get("lexical_fillers", []),
            "hedges": [],
            "speech_score": s["scores"].get("speech_pace", 50),
            "words": [
                {
                    "word": w.get("word"),
                    "start_ms": int(w.get("start_ms", 0) + chunk_offset_ms),
                    "end_ms": int(w.get("end_ms", 0) + chunk_offset_ms),
                    "is_filler": bool(w.get("is_filler")),
                }
                for w in s.get("transcript_words", [])
            ],
        })

    # Attach speech_timeline to the stored report so AudioPlaybackReview
    # can always reach absolute-timestamped words even if report.transcript
    # is ever off.
    report["speech_timeline"] = speech_tl

    # Default title for an UPLOADED audio file: filename without
    # extension (matches video-upload convention). For LIVE audio
    # captures the WS handler sets a "Recording <ts> - Audio" title
    # instead — see session_ws's finalize block.
    default_title = (
        Path(audio_file.filename).stem
        if audio_file.filename else None
    )
    try:
        _persist_media_and_segments(
            media_id=media_id,
            source_kind="analyzer_audio",
            user_id=user.id,
            original_name=audio_file.filename,
            stored_path=saved_name,
            playback_path=saved_name,
            duration_s=float(report.get("duration_s") or (len(snapshots) * 3)),
            has_video=False,
            has_audio=True,
            score_avg=report.get("avg_score"),
            face_timeline=[],  # no face rows for audio-only
            speech_timeline=speech_tl,
            report_json=report,
            content_sha256=content_sha256,
            title=default_title,
        )
    except Exception as e:
        log.warning(
            "db.dual_write_failed",
            extra={"media_id": media_id, "source": "analyzer_audio", "error": str(e)},
        )

    return report


@app.get("/api/analyzer/{media_id}/audio")
def get_analyzer_audio(
    media_id: str,
    request: Request,
    user: User = Depends(get_current_user_for_media),
):
    """Serve the saved analyzer audio by media_id. Suffix-agnostic:
    finds whichever file starts with the id in the recordings dir.
    Owner-only."""
    # Guard against glob patterns / .. in user-supplied id.
    if not _safe_media_id(media_id):
        return JSONResponse({"error": "Invalid media id"}, status_code=400)
    with SessionLocal() as db:
        m = db.get(Media, media_id)
        if not media_readable_by(user.id, m):
            return JSONResponse({"error": "Not found"}, status_code=404)
    matches = list(RECORDINGS_DIR.glob(f"{media_id}.*"))
    if not matches:
        return JSONResponse({"error": "Not found"}, status_code=404)
    path = matches[0]
    # Best-effort MIME — browsers handle most audio/* types via HTMLAudioElement.
    suffix = path.suffix.lower()
    mime = {
        ".webm": "audio/webm",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
    }.get(suffix, "application/octet-stream")
    return _serve_with_range(request, str(path), media_type=mime)


@app.post("/api/session/upload-video")
@limiter.limit("30/hour")
async def upload_session_video(
    request: Request,
    video: UploadFile = File(...),
    session_id: str = Form(...),
    user: User = Depends(get_current_user),
):
    """Save video recording from a live session.
    Streams to disk with a 500 MB cap; returns a browser-loadable URL.

    Requires authentication. Note: the Media row is created by the WS
    finalize handler, not here — this endpoint just lands the file. We
    don't pre-check ownership of the session_id because the WS handler
    that owns it has already validated the user. A misbehaving caller
    can at worst write a file to a session_id that no Media row will
    ever reference, which becomes orphaned-file noise (cleaned up by
    the next backup script run)."""
    if not _safe_media_id(session_id):
        return JSONResponse({"error": "Invalid session id"}, status_code=400)
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


@app.post("/api/session/upload-audio")
@limiter.limit("30/hour")
async def upload_session_audio(
    request: Request,
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    user: User = Depends(get_current_user),
):
    """Save an audio recording from a live audio analyzer session.
    Authentication required. See upload_session_video for the
    rationale on not pre-checking session_id ownership.

    Files land as `{session_id}.{ext}` in RECORDINGS_DIR, which
    /api/analyzer/{id}/audio already serves. Keeping the extension lets us
    serve with a correct MIME (webm/wav/mp3/etc.) on read.
    """
    if not _safe_media_id(session_id):
        return JSONResponse({"error": "Invalid session id"}, status_code=400)
    suffix = Path(audio.filename or "recording.webm").suffix.lower()
    if suffix not in {".webm", ".wav", ".mp3", ".m4a", ".ogg"}:
        suffix = ".webm"
    path = RECORDINGS_DIR / f"{session_id}{suffix}"
    size = 0
    with open(path, "wb") as f:
        while True:
            chunk = await audio.read(1024 * 1024)
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

    # The WS finalize runs BEFORE this upload arrives, so the Media row's
    # playback_path was written as None or a guess. Correct it now that we
    # know the filename we actually saved. Best-effort — failure here
    # doesn't block the 200 response because audio_url is computed from
    # kind + id anyway.
    try:
        with SessionLocal() as db:
            m = db.get(Media, session_id)
            # Owner-only: silently skip if the row belongs to someone
            # else (a misbehaving caller racing the upload). The 200
            # below still fires — the file is on disk, but it won't
            # update the wrong user's row.
            if m is not None and m.user_id == user.id and m.playback_path != path.name:
                m.playback_path = path.name
                m.has_audio = True
                db.commit()
    except Exception as e:
        log.warning(
            "db.playback_path_update_failed",
            extra={"media_id": session_id, "error": str(e)},
        )

    return {
        "status": "saved",
        "audio_url": f"/api/analyzer/{session_id}/audio",
        "size_mb": size_mb,
    }


@app.get("/api/recordings")
def list_recordings(
    limit: int = 50,
    offset: int = 0,
    q: str | None = None,
    sort: str = "created_desc",
    date_from: str | None = None,
    date_to: str | None = None,
    min_score: int | None = None,
    max_score: int | None = None,
    tag: str | None = None,
    user: User = Depends(get_current_user),
):
    """Paginated, filterable list of the current user's Library.

    Response shape: { items: [...], total, limit, offset }.

    Query params (all optional):
      - q          substring search across title / original_name /
                   topic / tags. Case-insensitive.
      - sort       created_desc (default) | created_asc | score_desc |
                   score_asc | duration_desc | duration_asc.
      - date_from  ISO 8601 timestamp; recordings created before this
                   are excluded.
      - date_to    ISO 8601 timestamp; recordings created after this
                   are excluded.
      - min_score  inclusive lower bound on score_avg (0-100).
      - max_score  inclusive upper bound on score_avg.
      - tag        exact tag match (lower-cased server-side).

    `limit` is clamped to [1, 200] so a misbehaving client can't force
    a megabyte-scale payload. `offset` is non-negative; negatives are
    treated as 0. `total` reflects the FILTERED count, not the global
    one — which is what the "N of M" UI label needs.

    Scoped to the authenticated user — other users' recordings never
    appear in the response, with or without filters.
    """
    from datetime import datetime as _dt

    def _parse_dt(s: str | None) -> _dt | None:
        if not s:
            return None
        try:
            # fromisoformat handles both naive and aware ISO strings
            # in 3.11+. Frontend always sends UTC ISO so this is safe.
            return _dt.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None

    limit = max(1, min(200, int(limit)))
    offset = max(0, int(offset))
    return _list_session_recordings(
        limit=limit,
        offset=offset,
        user_id=user.id,
        q=q,
        sort=sort,
        date_from=_parse_dt(date_from),
        date_to=_parse_dt(date_to),
        min_score=min_score,
        max_score=max_score,
        tag=tag,
    )


@app.get("/api/recordings/{session_id}/video")
def get_recording_video(
    session_id: str,
    request: Request,
    user: User = Depends(get_current_user_for_media),
):
    if not _safe_media_id(session_id):
        return JSONResponse({"error": "Invalid session id"}, status_code=400)
    with SessionLocal() as db:
        m = db.get(Media, session_id)
        if not media_readable_by(user.id, m):
            return JSONResponse({"error": "Not found"}, status_code=404)
    path = RECORDINGS_DIR / f"{session_id}_video.webm"
    return _serve_with_range(request, str(path), media_type="video/webm")


@app.get("/api/report/{session_id}")
def get_session_report(
    session_id: str,
    user: User = Depends(get_current_user),
):
    """Get a saved media report by its id, scoped to the current user.

    Returns the stored Media.report_json payload, spread at the top level,
    with `kind` and `media_id` added so the /result/:id frontend can branch
    between upload / session / analyzer_audio shapes without sniffing.

    Returns 404 not just when the row doesn't exist, but also when it
    exists but belongs to another user. Returning a "this isn't yours"
    distinct from "not found" would let an attacker enumerate which
    media ids are real across the whole product.
    """
    if not _safe_media_id(session_id):
        return JSONResponse({"error": "Invalid session id"}, status_code=400)
    with SessionLocal() as db:
        media = db.get(Media, session_id)
        if media is None or media.report_json is None or not media_readable_by(user.id, media):
            return JSONResponse({"error": "Report not found"}, status_code=404)
        payload = dict(media.report_json)
        payload["kind"] = media.source_kind
        payload["media_id"] = media.id
        # User-supplied metadata: surface so the Result page can render
        # editable fields without a second round-trip.
        payload["title"] = media.title
        payload["topic"] = media.topic
        payload["tags"] = media.tags or []
        # Latest persisted duration — a trim updates this; if the
        # report_json has its own duration_s it stays for the chart but
        # the canonical "how long is the file now" is here.
        payload["duration_s_current"] = media.duration_s
        # Sharing context — the frontend uses these to decide whether
        # to render the editor + share modal (owner) or a "shared by
        # X" badge + read-only metadata (recipient).
        payload["is_owner"] = media.user_id == user.id
        payload["shared_with"] = media.shared_with or []
        if media.user_id != user.id:
            owner = db.get(User, media.user_id)
            payload["shared_by"] = (
                {"id": owner.id, "name": owner.name, "email": owner.email}
                if owner else None
            )
        else:
            payload["shared_by"] = None
        return payload


@app.patch("/api/media/{media_id}")
def update_media_metadata(
    media_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
):
    """Edit user-supplied metadata on a recording.

    Accepts any subset of {title, topic, tags}; only present keys are
    updated. Owner-only — returns 404 (not 403) on cross-user attempts
    so other users' media-ids stay un-enumerable.

    Validation:
      - title: trimmed; max 200 chars; empty string clears it (null)
      - topic: trimmed; max 120 chars; empty string clears it
      - tags : array of strings, each ≤ 40 chars; max 20 tags;
               whitespace-only entries are dropped; lower-cased and
               de-duplicated to keep the Library tag-cloud sane.
    """
    if not _safe_media_id(media_id):
        return JSONResponse({"error": "Invalid media id"}, status_code=400)
    if not isinstance(payload, dict):
        return JSONResponse({"error": "Body must be a JSON object."}, status_code=400)

    updates: dict = {}

    if "title" in payload:
        v = payload["title"]
        if v is None or v == "":
            updates["title"] = None
        elif isinstance(v, str):
            t = v.strip()[:200]
            updates["title"] = t or None
        else:
            return JSONResponse({"error": "title must be a string."}, status_code=400)

    if "topic" in payload:
        v = payload["topic"]
        if v is None or v == "":
            updates["topic"] = None
        elif isinstance(v, str):
            updates["topic"] = v.strip()[:120] or None
        else:
            return JSONResponse({"error": "topic must be a string."}, status_code=400)

    if "tags" in payload:
        v = payload["tags"]
        if v is None:
            updates["tags"] = None
        elif isinstance(v, list):
            cleaned: list[str] = []
            seen: set[str] = set()
            for raw in v:
                if not isinstance(raw, str):
                    continue
                t = raw.strip().lower()[:40]
                if not t or t in seen:
                    continue
                seen.add(t)
                cleaned.append(t)
                if len(cleaned) >= 20:
                    break
            updates["tags"] = cleaned or None
        else:
            return JSONResponse({"error": "tags must be an array."}, status_code=400)

    if not updates:
        return JSONResponse({"error": "No editable fields supplied."}, status_code=400)

    with SessionLocal() as db:
        media = db.get(Media, media_id)
        if media is None or media.user_id != user.id:
            return JSONResponse({"error": "Media not found"}, status_code=404)
        for k, v in updates.items():
            setattr(media, k, v)
        db.commit()
        return {
            "media_id": media.id,
            "title": media.title,
            "topic": media.topic,
            "tags": media.tags or [],
        }


@app.post("/api/media/{media_id}/discard")
def discard_media(
    media_id: str,
    user: User = Depends(get_current_user),
):
    """Re-take helper — exact same effect as DELETE but framed as a
    deliberate workflow choice ("I want to redo this take, throw the
    last one away"). The frontend uses this from the Result page so the
    Library never accumulates throwaway practice attempts.

    Reuses the DELETE handler verbatim — owner-only, files cleaned up
    best-effort. Returns the same shape.
    """
    return delete_media(media_id, user)


@app.post("/api/media/{media_id}/trim")
async def trim_media(
    media_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
):
    """Cut the playback file in-place to [start_s, end_s].

    Uses ffmpeg's stream-copy mode (-c copy), so the operation is fast
    (no re-encode) and lossless. Audio + video tracks are kept as-is.

    Scope (intentional, documented in the response):
      - This trims the FILE the user plays back. duration_s is updated.
      - The CHUNK SCORES (the timeline, signal_averages, etc.) reflect
        the ORIGINAL recording, not the trimmed segment. Recomputing
        those would require re-running the audio + face pipelines,
        which is a much bigger feature and lives behind a future
        "Re-analyze trimmed clip" button.
      - The Result page surfaces this caveat so users aren't misled.

    Validation:
      - start_s ≥ 0
      - end_s   > start_s
      - end_s   ≤ current duration_s (clamped)
      - trimmed length ≥ 3 s (matches the upload pipeline's min)
    """
    if not _safe_media_id(media_id):
        return JSONResponse({"error": "Invalid media id"}, status_code=400)
    try:
        start_s = float(payload.get("start_s", 0))
        end_s = float(payload.get("end_s", 0))
    except (TypeError, ValueError):
        return JSONResponse({"error": "start_s and end_s must be numbers."}, status_code=400)

    with SessionLocal() as db:
        media = db.get(Media, media_id)
        if media is None or media.user_id != user.id:
            return JSONResponse({"error": "Media not found"}, status_code=404)
        kind = media.source_kind
        playback = media.playback_path
        current_duration = float(media.duration_s or 0)

    # Resolve the file to trim. Layout differs per kind.
    if kind == "upload":
        if not playback:
            return JSONResponse({"error": "No playback file to trim."}, status_code=400)
        src = Path(UPLOAD_DIR) / playback
    elif kind == "session":
        src = RECORDINGS_DIR / f"{media_id}_video.webm"
    elif kind == "analyzer_audio":
        # Suffix-agnostic — find whichever file matches.
        matches = list(RECORDINGS_DIR.glob(f"{media_id}.*"))
        if not matches:
            return JSONResponse({"error": "No playback file to trim."}, status_code=400)
        src = matches[0]
    else:
        return JSONResponse({"error": f"Trim not supported for kind '{kind}'."}, status_code=400)
    if not src.is_file():
        return JSONResponse({"error": "Playback file is missing on disk."}, status_code=404)

    # When the DB doesn't know the duration (legacy or partially-failed
    # row), fall back to ffprobe so we still have a real upper bound.
    # Without this the only failure would be ffmpeg producing a zero-byte
    # output later — handled, but a clear 400 here is better UX.
    if current_duration <= 0:
        try:
            probe = subprocess.run(
                [FFMPEG, "-i", str(src), "-hide_banner"],
                capture_output=True, timeout=10,
            )
            # ffmpeg writes "Duration: HH:MM:SS.xx" to stderr; parse it.
            stderr = (probe.stderr or b"").decode("utf-8", errors="ignore")
            import re as _re
            m = _re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", stderr)
            if m:
                h, mi, se = m.groups()
                current_duration = int(h) * 3600 + int(mi) * 60 + float(se)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
    # Clamp to file bounds, validate ordering + minimum length.
    if current_duration > 0:
        end_s = min(end_s, current_duration)
    else:
        # Still no duration after probing → reject rather than feed
        # ffmpeg arbitrary bounds.
        return JSONResponse(
            {"error": "Could not determine recording duration; cannot trim safely."},
            status_code=400,
        )
    if start_s < 0:
        start_s = 0.0
    new_len = end_s - start_s
    if new_len < 3.0:
        return JSONResponse(
            {"error": "Trimmed clip must be at least 3 seconds."},
            status_code=400,
        )

    # Write to a temp file in the same directory, then atomic-rename.
    # Doing the rename means a crash mid-trim leaves the original file
    # intact rather than half-written garbage.
    tmp = src.with_suffix(src.suffix + ".trim.tmp")
    cmd = [
        FFMPEG, "-y",
        "-err_detect", "crccheck+bitstream",
        "-fflags", "+discardcorrupt",
        "-i", str(src),
        "-ss", f"{start_s:.3f}",
        "-to", f"{end_s:.3f}",
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        str(tmp),
    ]

    def _run_ffmpeg_sync():
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=120,
            )
            if proc.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
                tail = (proc.stderr or b"").decode("utf-8", errors="ignore").splitlines()[-3:]
                return "ffmpeg trim failed: " + " | ".join(tail)
            return None
        except FileNotFoundError:
            return "ffmpeg binary not found on the server."
        except subprocess.TimeoutExpired:
            return "ffmpeg trim timed out after 120 s."

    err = await asyncio.get_event_loop().run_in_executor(None, _run_ffmpeg_sync)
    if err is not None:
        try: tmp.unlink(missing_ok=True)
        except OSError: pass
        return JSONResponse({"error": err}, status_code=500)

    # Atomic-replace the original. os.replace works across drives and
    # is atomic on the same volume.
    try:
        os.replace(tmp, src)
    except OSError as e:
        try: tmp.unlink(missing_ok=True)
        except OSError: pass
        return JSONResponse({"error": f"Could not replace original file: {e}"}, status_code=500)

    # Persist the new duration. We deliberately leave score_avg /
    # report_json unchanged — those reflect the original recording.
    with SessionLocal() as db:
        media = db.get(Media, media_id)
        if media is not None:
            media.duration_s = round(new_len, 2)
            db.commit()

    log.info(
        "media.trim",
        extra={
            "media_id": media_id,
            "kind": kind,
            "start_s": round(start_s, 2),
            "end_s": round(end_s, 2),
            "new_duration_s": round(new_len, 2),
        },
    )

    return {
        "status": "trimmed",
        "media_id": media_id,
        "duration_s": round(new_len, 2),
        "scores_recomputed": False,
        "note": (
            "Playback file was trimmed. Scores still reflect the original "
            "recording — they were not recomputed for the trimmed segment."
        ),
    }


# ============================================================
# SHARE — owner grants/revokes read+comment access by email
# ============================================================
def _user_brief(u: User) -> dict:
    """Standard short-form user shape used in share + comment payloads.
    Never includes password_hash or anything sensitive."""
    return {"id": u.id, "name": u.name, "email": u.email}


@app.get("/api/media/{media_id}/shares")
def list_shares(media_id: str, user: User = Depends(get_current_user)):
    """List the users this Media is shared with. Owner-only.

    Returns [{id, name, email}, ...] in the same order they were added.
    Used by the Share modal to render the existing access list with a
    Revoke button next to each entry.
    """
    if not _safe_media_id(media_id):
        return JSONResponse({"error": "Invalid media id"}, status_code=400)
    with SessionLocal() as db:
        m = db.get(Media, media_id)
        if not media_owned_by(user.id, m):
            return JSONResponse({"error": "Media not found"}, status_code=404)
        ids = m.shared_with or []
        if not ids:
            return []
        rows = db.query(User).filter(User.id.in_(ids)).all()
        # Preserve original ordering (DB query doesn't honour the
        # array order otherwise).
        by_id = {u.id: u for u in rows}
        return [_user_brief(by_id[i]) for i in ids if i in by_id]


@app.post("/api/media/{media_id}/share")
def share_media(
    media_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
):
    """Grant another user read+comment access by email.

    Body: { "email": "friend@example.com" }

    Only the owner can share. The target email must already correspond
    to a registered account — we don't auto-invite people in this
    iteration. Sharing is idempotent (re-sharing is a no-op).

    Returns the updated full list of share recipients so the Share
    modal can re-render without a follow-up GET.
    """
    if not _safe_media_id(media_id):
        return JSONResponse({"error": "Invalid media id"}, status_code=400)
    target_email = (payload.get("email") or "").strip().lower()
    if not target_email:
        return JSONResponse({"error": "Email is required."}, status_code=400)

    with SessionLocal() as db:
        m = db.get(Media, media_id)
        if not media_owned_by(user.id, m):
            return JSONResponse({"error": "Media not found"}, status_code=404)
        target = db.query(User).filter(User.email == target_email).first()
        if target is None:
            return JSONResponse(
                {"error": "No account with that email. Ask them to sign up first."},
                status_code=404,
            )
        if target.id == user.id:
            return JSONResponse(
                {"error": "You already own this recording."},
                status_code=400,
            )
        current = list(m.shared_with or [])
        if target.id not in current:
            current.append(target.id)
            m.shared_with = current
            db.commit()
        # Always re-fetch the names for the response to keep the
        # client's modal in sync.
        rows = db.query(User).filter(User.id.in_(current)).all() if current else []
        by_id = {u.id: u for u in rows}
        return {
            "media_id": media_id,
            "shared_with": [_user_brief(by_id[i]) for i in current if i in by_id],
        }


@app.delete("/api/media/{media_id}/share/{recipient_id}")
def unshare_media(
    media_id: str,
    recipient_id: str,
    user: User = Depends(get_current_user),
):
    """Revoke a previously-granted share. Owner-only.

    Idempotent: removing an id that wasn't in the list is a no-op,
    not a 404 — the end state ("recipient does not have access") is
    the same either way.
    """
    if not _safe_media_id(media_id):
        return JSONResponse({"error": "Invalid media id"}, status_code=400)
    with SessionLocal() as db:
        m = db.get(Media, media_id)
        if not media_owned_by(user.id, m):
            return JSONResponse({"error": "Media not found"}, status_code=404)
        current = [x for x in (m.shared_with or []) if x != recipient_id]
        m.shared_with = current or None
        db.commit()
        return {"media_id": media_id, "shared_with_count": len(current)}


# ============================================================
# COMMENTS — threaded discussion attached to a Media
# ============================================================
def _comment_dict(c: Comment, author: User | None) -> dict:
    """Standard comment payload. The author lookup is done by the
    caller — we don't lazy-load to avoid N+1 selects on the list
    endpoint."""
    return {
        "id": c.id,
        "media_id": c.media_id,
        "author": _user_brief(author) if author else None,
        "body": c.body,
        "t_s": c.t_s,
        "t_end_s": c.t_end_s,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        "edited": (
            c.updated_at and c.created_at
            and (c.updated_at - c.created_at).total_seconds() > 1
        ),
    }


@app.get("/api/media/{media_id}/comments")
def list_comments(
    media_id: str,
    user: User = Depends(get_current_user),
):
    """Return all comments on a Media, oldest-first.

    Visible to anyone with read access (owner or shared-with). One
    SELECT for the comments + one for the authors (joined by id),
    keeps it cheap regardless of thread length.
    """
    if not _safe_media_id(media_id):
        return JSONResponse({"error": "Invalid media id"}, status_code=400)
    with SessionLocal() as db:
        m = db.get(Media, media_id)
        if not media_readable_by(user.id, m):
            return JSONResponse({"error": "Media not found"}, status_code=404)
        comments = (
            db.query(Comment)
              .filter(Comment.media_id == media_id)
              .order_by(Comment.created_at.asc())
              .all()
        )
        if not comments:
            return []
        author_ids = {c.author_user_id for c in comments}
        authors = {u.id: u for u in db.query(User).filter(User.id.in_(author_ids)).all()}
        return [_comment_dict(c, authors.get(c.author_user_id)) for c in comments]


@app.post("/api/media/{media_id}/comments")
@limiter.limit("60/hour")
def create_comment(
    media_id: str,
    payload: dict,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Post a new comment. Visible to anyone with read access.

    Body: {
        "body":    "...",       (required)
        "t_s":     12.5,        (optional — single-moment anchor)
        "t_end_s": 28.0         (optional — when set, comment spans
                                 the range [t_s, t_end_s]; click in
                                 the UI seeks AND auto-pauses at end)
    }

    Body is required, max 5000 chars. `t_s` is clamped to >= 0;
    upper-bound clamping (against the recording's actual duration) is
    NOT enforced here — a comment timestamped past end-of-recording
    just won't seek anywhere useful, which is honest UX, and it lets
    a future "trim" not invalidate older comments.

    Validation rules for the range:
      - t_end_s without t_s = error (a range needs both endpoints).
      - t_end_s must be > t_s (zero-length ranges are nonsense).
    """
    if not _safe_media_id(media_id):
        return JSONResponse({"error": "Invalid media id"}, status_code=400)
    body_text = (payload.get("body") or "").strip()
    if not body_text:
        return JSONResponse({"error": "Comment body is required."}, status_code=400)
    if len(body_text) > 5000:
        return JSONResponse({"error": "Comment too long (max 5000 chars)."}, status_code=400)
    t_s = payload.get("t_s")
    if t_s is not None:
        try:
            t_s = max(0.0, float(t_s))
        except (TypeError, ValueError):
            return JSONResponse({"error": "t_s must be a number."}, status_code=400)
    t_end_s = payload.get("t_end_s")
    if t_end_s is not None:
        try:
            t_end_s = max(0.0, float(t_end_s))
        except (TypeError, ValueError):
            return JSONResponse({"error": "t_end_s must be a number."}, status_code=400)
        if t_s is None:
            return JSONResponse(
                {"error": "t_end_s requires t_s as the start of the range."},
                status_code=400,
            )
        if t_end_s <= t_s:
            return JSONResponse(
                {"error": "t_end_s must be greater than t_s."},
                status_code=400,
            )

    with SessionLocal() as db:
        m = db.get(Media, media_id)
        if not media_readable_by(user.id, m):
            return JSONResponse({"error": "Media not found"}, status_code=404)
        c = Comment(
            id=uuid.uuid4().hex,
            media_id=media_id,
            author_user_id=user.id,
            body=body_text,
            t_s=t_s,
            t_end_s=t_end_s,
        )
        db.add(c)
        db.commit()
        db.refresh(c)
        return _comment_dict(c, user)


@app.patch("/api/comments/{comment_id}")
def update_comment(
    comment_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
):
    """Edit a comment's body. Author-only — even the media owner
    can't edit someone else's comment (only delete it).

    Body: { "body": "..." }  (t_s edits not supported — re-create
    the comment if you want to re-anchor it).
    """
    if not _safe_media_id(comment_id):
        return JSONResponse({"error": "Invalid comment id"}, status_code=400)
    body_text = (payload.get("body") or "").strip()
    if not body_text:
        return JSONResponse({"error": "Comment body is required."}, status_code=400)
    if len(body_text) > 5000:
        return JSONResponse({"error": "Comment too long (max 5000 chars)."}, status_code=400)

    with SessionLocal() as db:
        c = db.get(Comment, comment_id)
        if c is None or c.author_user_id != user.id:
            return JSONResponse({"error": "Comment not found"}, status_code=404)
        c.body = body_text
        from datetime import datetime as _dt, timezone as _tz
        c.updated_at = _dt.now(_tz.utc)
        db.commit()
        db.refresh(c)
        return _comment_dict(c, user)


@app.delete("/api/comments/{comment_id}")
def delete_comment(
    comment_id: str,
    user: User = Depends(get_current_user),
):
    """Delete a comment. Allowed by:
      - the comment's author, OR
      - the owner of the Media the comment is on (so the owner can
        moderate their own discussion thread).
    """
    if not _safe_media_id(comment_id):
        return JSONResponse({"error": "Invalid comment id"}, status_code=400)
    with SessionLocal() as db:
        c = db.get(Comment, comment_id)
        if c is None:
            return JSONResponse({"error": "Comment not found"}, status_code=404)
        # Allow if author OR media owner.
        is_author = c.author_user_id == user.id
        is_media_owner = False
        if not is_author:
            m = db.get(Media, c.media_id)
            is_media_owner = media_owned_by(user.id, m)
        if not (is_author or is_media_owner):
            return JSONResponse({"error": "Comment not found"}, status_code=404)
        db.delete(c)
        db.commit()
        return {"status": "deleted", "id": comment_id}


@app.get("/api/report/{session_id}/csv")
def export_report_csv(
    session_id: str,
    user: User = Depends(get_current_user),
):
    """Download the per-chunk score timeline as CSV. Owner-only."""
    import csv
    import io

    if not _safe_media_id(session_id):
        return JSONResponse({"error": "Invalid session id"}, status_code=400)

    with SessionLocal() as db:
        media = db.get(Media, session_id)
        if media is None or media.report_json is None or not media_readable_by(user.id, media):
            return JSONResponse({"error": "Report not found"}, status_code=404)
        report = media.report_json
        timeline = report.get("timeline")
        if not timeline:
            return JSONResponse(
                {"error": "No per-chunk timeline in this report (upload-kind reports don't expose one)."},
                status_code=404,
            )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "t_s", "total", "voice_steadiness", "eye_contact",
        "speech_pace", "filler_words", "vocal_variety",
    ])
    for row in timeline:
        w.writerow([
            row.get("t_s", 0),
            row.get("total", 0),
            row.get("voice_steadiness", 0),
            row.get("eye_contact", 0),
            row.get("speech_pace", 0),
            row.get("filler_words", 0),
            row.get("vocal_variety", 0),
        ])
    csv_bytes = buf.getvalue().encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{session_id}.csv"',
            "Content-Length": str(len(csv_bytes)),
        },
    )


@app.delete("/api/media/{media_id}")
def delete_media(
    media_id: str,
    user: User = Depends(get_current_user),
):
    """Hard-delete a media row + its segments + its on-disk files.

    Why this exists:
      - GDPR / "right to erasure": once a user records something they
        regret, they need a way to get rid of it without psql.
      - Housekeeping: the Library can grow forever otherwise.

    Owner-only. Returns 404 (not 403) when the row exists but isn't
    yours, so other users' media ids stay un-enumerable.

    What it deletes:
      - Media row (cascades to media_segments via FK)
      - Any file under uploads/ matching stored_path + the processed
        `web_<id>.mp4` / `processed_<id>.mp4` variants
      - Any file under recordings/ matching `<id>.*` or `<id>_video.webm`

    Best-effort on files: a missing or already-deleted file is NOT an
    error. We want the UX side ("it's gone from my Library") to
    succeed even if disk state is slightly out of sync.
    """
    if not _safe_media_id(media_id):
        return JSONResponse({"error": "Invalid media id"}, status_code=400)

    removed = {"db_row": False, "files": []}

    with SessionLocal() as db:
        media = db.get(Media, media_id)
        if media is None or media.user_id != user.id:
            return JSONResponse({"error": "Media not found"}, status_code=404)
        # Snapshot filesystem paths before dropping the row.
        stored_path = media.stored_path
        playback_path = media.playback_path
        source_kind = media.source_kind
        db.delete(media)
        db.commit()
        removed["db_row"] = True

    # Collect candidate file paths. We use a set because stored_path and
    # playback_path are often the same string.
    candidates: set[Path] = set()
    uploads_dir = Path(UPLOAD_DIR)
    for name in (stored_path, playback_path):
        if name:
            candidates.add(uploads_dir / name)
    # Processed / re-encoded variants live alongside the source.
    candidates.add(uploads_dir / f"processed_{media_id}.mp4")
    candidates.add(uploads_dir / f"web_{media_id}.mp4")
    # Session recordings land here.
    candidates.add(RECORDINGS_DIR / f"{media_id}_video.webm")
    for p in RECORDINGS_DIR.glob(f"{media_id}.*"):
        candidates.add(p)

    for p in candidates:
        try:
            if p.is_file():
                p.unlink()
                removed["files"].append(p.name)
        except OSError:
            # A file may be momentarily locked by another handler (e.g.
            # an in-flight range request). Don't fail the whole delete
            # for that — the next cron / retry can clean it up.
            pass

    return {"status": "deleted", "media_id": media_id, "removed": removed}


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
