# Confidence Detector v2.0

AI-powered presentation confidence analysis. Three modes:

1. **Live Practice** — webcam + microphone with real-time confidence scoring
   and a synced replay after you stop.
2. **Analyze Recording** — upload a pre-recorded video and get back a full
   report with a Poised-style playback view (video + live score panel +
   word-level transcript synced to `video.currentTime`).
3. **Speech Analyzer** — audio-only analysis, no camera needed.
4. **Library** — browse and replay every past session.

Scoring uses six signals (eye contact, voice steadiness, speech pace,
filler words, vocal variety, expression) with a weighted formula and a
rolling 5-second average.

---

## Prerequisites

| | Requirement | Notes |
|---|---|---|
| **OS** | Windows / macOS / Linux | Tested on Windows 11. |
| **Python** | 3.10+ | 3.10 is what the pinned venv under `detector_env/` uses. |
| **Node.js** | 18+ | Vite 8 + React 19. |
| **FFmpeg** | on `PATH` **or** installed via `imageio-ffmpeg` (pulled in by `requirements.txt`) | Used for audio extraction and video re-encoding. |
| **PostgreSQL** | 15+ | Phase 2 stores media + per-moment analysis in Postgres. |

---

## One-time setup

### 1. Clone and create a Python venv

From the project root (`project-2-confidence-detector/`):

```bash
# Create the venv
python -m venv detector_env

# Activate it
#   Windows PowerShell
detector_env\Scripts\Activate.ps1
#   Windows Git Bash / WSL
source detector_env/Scripts/activate
#   macOS / Linux
source detector_env/bin/activate

# Install all Python deps
pip install -r requirements.txt
```

### 2. Install and start Postgres

Download Postgres from postgresql.org (use the EDB installer on Windows).
Remember the `postgres` superuser password you set during install.

Open **SQL Shell (psql)** (or `psql -U postgres` from a terminal) and run:

```sql
CREATE DATABASE confidence_detector_app;
\q
```

Verify you can connect:

```bash
psql -U postgres -d confidence_detector_app -h localhost
# type \q to exit
```

### 3. Create `backend/.env`

Copy the template from the project root and fill in real values:

```bash
cp .env.example backend/.env
```

Open `backend/.env` and set at minimum:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=confidence_detector_app
DB_USER=postgres
DB_PASSWORD=postgres
```

(Change the password to whatever you set in Postgres.)

### 4. Apply database migrations

With the venv still active:

```bash
cd backend
alembic upgrade head
cd ..
```

This creates the `media` and `media_segments` tables. You only need to
run this again when migrations change — see [backend/README.md](backend/README.md)
for the day-to-day Alembic workflow.

### 5. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Run the app

Two terminals, venv active in the backend one.

**Terminal 1 — backend**

```bash
# With detector_env active, from the project root:
cd backend
python main.py
```

First run preloads the Whisper + Silero VAD models — expect 30–60 s
before "Application startup complete." appears. Backend listens on
`http://localhost:8000` (Docs at `/docs`).

**Terminal 2 — frontend**

```bash
cd frontend
npm run dev
```

Vite dev server listens on `http://localhost:5173`.

Open `http://localhost:5173` in Chrome/Edge/Firefox. The four mode cards
(Live Practice / Analyze Recording / Speech Analyzer / Library) appear
on the home screen.

---

## Architecture

```
Browser (React + Vite)
  │
  │── WS  /ws/session/{id}  ──── live audio + face scores; receives per-chunk JSON
  │── POST /api/upload      ──── upload a video, returns full report JSON
  │── POST /api/analyze-audio ── audio-only analysis
  │── POST /api/session/upload-video ── saves live-session MediaRecorder blob
  │── GET  /api/recordings         ── Library list
  │── GET  /api/recordings/{id}/video ── playback for a past session
  │── GET  /api/report/{id}        ── full session report
  │
FastAPI Backend (Python)
  │
  ├── FaceEngine      ── MediaPipe FaceLandmarker (52 blendshapes) + PoseLandmarker
  ├── AudioPipeline   ── faster-whisper + Silero VAD + PYIN pitch + acoustic fillers
  ├── ScoringEngine   ── weighted formula + rolling average + contextual tips
  ├── SessionRecorder ── directory helpers + Library query (DB-backed)
  │
  └── SQLAlchemy 2.0 + Alembic → PostgreSQL
       ├── media           — one row per media item (+ cached score + report JSONB)
       └── media_segments  — one row per analysis moment (face / speech / word)
```

Files and segments per media item on disk:

| Mode | What lands on disk |
|---|---|
| **Upload** | `backend/uploads/{filename}` (source) + `backend/uploads/web_{upload_id}.mp4` (browser-friendly re-encode with the overlay and the original audio spliced in). **No** evidence JPEGs. |
| **Live session** | `backend/recordings/{session_id}_video.webm` (MediaRecorder blob). **No** separate audio WAV, **no** report JSON file (both live in Postgres now). |
| **Analyzer** | Temp file in OS tempdir, deleted after processing. |

---

## Scoring

```
Confidence (0-100) =
  Voice Steadiness   × 0.22 +
  Eye Contact        × 0.22 +
  Speech Pace        × 0.18 +
  Filler Words       × 0.18 +
  Vocal Variety      × 0.12 +
  Expression         × 0.08
```

Six sub-scores, each 0–100. Smoothed with a 10-entry rolling window
(≈5 s at 500 ms updates).

---

## Environment variables

Only the database variables are strictly required. Everything else has a
sensible default.

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | **Required.** Postgres host. |
| `DB_PORT` | `5432` | Postgres port. |
| `DB_NAME` | `confidence_detector_app` | **Required.** Database name. |
| `DB_USER` | `postgres` | **Required.** DB user. |
| `DB_PASSWORD` | `postgres` | **Required.** DB password. |
| `PORT` | `8000` | Backend HTTP port. |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins. |
| `WHISPER_MODEL` | `distil-small.en` | Any faster-whisper model slug. |
| `WHISPER_DEVICE` | `auto` | `auto` / `cpu` / `cuda`. |
| `HF_TOKEN` | *(unset)* | Only needed if you hit HuggingFace download rate limits. |

---

## API endpoints (current)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | API status. |
| `GET` | `/health` | Readiness check — `ready: true` once models load. |
| `POST` | `/api/upload` | Analyse an uploaded video. Returns the full JSON report. |
| `POST` | `/api/analyze-audio` | Audio-only analysis. Stateless — no DB write. |
| `WS` | `/ws/session/{session_id}` | Live practice session stream. |
| `POST` | `/api/session/upload-video` | Save the MediaRecorder blob after a live session. |
| `GET` | `/api/recordings` | Library list (DB-backed). |
| `GET` | `/api/recordings/{session_id}/video` | Stream the saved session video. |
| `GET` | `/api/report/{session_id}` | Full session report (DB-backed). |
| `GET` | `/api/video/{filename}` | Serve the processed upload mp4. |

Endpoints from v1.0 that no longer exist: `/api/live`, `/api/stop-live`,
`/ws/live`, `/api/evidence/{filename}`.

---

## Tech stack

- **Backend:** Python 3.10, FastAPI, SQLAlchemy 2.0, Alembic, psycopg 3,
  MediaPipe, OpenCV, faster-whisper, Silero VAD, librosa, PyTorch 2.4+.
- **Database:** PostgreSQL 15+.
- **Frontend:** React 19, Vite 8, MediaPipe FaceLandmarker (browser-side).
- **Models:** MediaPipe Face + Pose Landmarker (bundled), faster-whisper
  `distil-small.en` (downloaded on first run, ~166 MB), Silero VAD
  (downloaded on first run via `torch.hub`).

All free and open-source. No paid APIs.

---

## Troubleshooting

**Backend won't start — `OperationalError: connection refused`**
Postgres isn't running, or your `DB_HOST`/`DB_PORT` in `backend/.env`
are wrong. Start the service: `net start postgresql-x64-17` (Windows) or
`brew services start postgresql@16` (macOS).

**Alembic error: `Target database is not up to date`**
Someone added a migration. Run `cd backend && alembic upgrade head`.

**`ModuleNotFoundError: No module named 'db'` when running `alembic`**
You're running `alembic` from the project root. It needs to run from
`backend/`. `cd backend` first.

**First upload takes forever**
The `faster-whisper` model downloads on first use (~166 MB). Subsequent
uploads are fast.

**`A module that was compiled using NumPy 1.x ...` warning on startup**
Old torch/torchaudio against new NumPy. Fix: `pip install --upgrade "torch>=2.4" "torchaudio>=2.4"`.

---

## Further docs

- [backend/README.md](backend/README.md) — day-to-day Alembic workflow,
  endpoint table, project layout, troubleshooting specific to the backend.
- [AUDIT_REPORT_V2.md](AUDIT_REPORT_V2.md) — full audit + design decisions
  that shaped the current architecture.
