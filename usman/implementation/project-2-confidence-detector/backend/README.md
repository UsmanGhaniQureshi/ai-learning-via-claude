# Backend — Confidence Detector

FastAPI backend. Uses Postgres via SQLAlchemy 2.0 + Alembic for schema
migrations.

## Prerequisites

- **Python 3.10+** (the pinned venv under `detector_env/` is 3.10).
- **Postgres 15+** running on `localhost:5432`.
- A database exists for this app:
  ```sql
  -- run once, as postgres superuser
  CREATE DATABASE confidence_detector_app;
  ```
- `backend/.env` has the DB_* vars. See `../.env.example`.

## Install

Dependencies live in **`../requirements.txt`** (project root). There is
deliberately no separate `backend/requirements.txt` — the root file is
the single source of truth consumed by Docker, Render, Railway, and
local dev.

From the project root (`project-2-confidence-detector/`):

```bash
# First-time only — create the venv
python -m venv detector_env

# Activate (Windows PowerShell)
detector_env\Scripts\Activate.ps1
# Or Git Bash
source detector_env/Scripts/activate

# Install dependencies
pip install -r requirements.txt
```

Or from `backend/` once the venv is active:

```bash
pip install -r ../requirements.txt
```

## Database migrations (Alembic)

All `alembic` commands run from **inside `backend/`**. The DB connection
is read from `backend/.env` via `migrations/env.py`, so you don't pass
the URL on the command line.

### Day-to-day workflow

| What you want | Command |
|---|---|
| **Apply every pending migration** (set up a fresh DB, or pull new migrations from git) | `alembic upgrade head` |
| **Roll back one migration** | `alembic downgrade -1` |
| **Roll back to a specific revision** | `alembic downgrade <revision_id>` |
| **Show the DB's current revision** | `alembic current` |
| **Show full migration history** | `alembic history` |
| **Auto-generate a migration** (after you change a model in `models/`) | `alembic revision --autogenerate -m "short description"` |
| **Write a hand-written migration** (custom SQL, data backfill, etc.) | `alembic revision -m "short description"` then edit the new file in `migrations/versions/` |

### Typical loop when you change a model

```bash
cd backend
alembic revision --autogenerate -m "add user.email column"   # creates versions/xxxx_*.py
# open the new file, verify upgrade() + downgrade() look right, edit if needed
alembic upgrade head                                          # applies it to your DB
```

### First-time setup on a fresh machine

```bash
cd backend
alembic upgrade head   # brings a fresh DB up to the latest schema
```

### ⚠️ Destructive — only during dev

```bash
# Drop every table, including alembic_version. Will force a full rebuild.
alembic downgrade base
alembic upgrade head
```

## Run the backend

```bash
cd backend
python main.py
```

The server comes up on `http://localhost:8000` (override with `PORT` env
var). Whisper + Silero VAD preload at startup — first run takes 30–60s
to download the models.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health` | Readiness check (models loaded?). |
| `POST` | `/api/upload` | Analyse an uploaded video. |
| `POST` | `/api/analyze-audio` | Audio-only analysis (stateless — does not touch the DB). |
| `WS`   | `/ws/session/{session_id}` | Live practice session. |
| `POST` | `/api/session/upload-video` | Save the MediaRecorder blob after a live session. |
| `GET`  | `/api/recordings` | Library list (DB-backed). |
| `GET`  | `/api/recordings/{session_id}/video` | Stream the saved session video. |
| `GET`  | `/api/report/{session_id}` | Full session report (DB-backed). |
| `GET`  | `/api/video/{filename}` | Serve the processed upload mp4. |

## Project layout

```
backend/
├── main.py                    # FastAPI app + all HTTP/WS routes
├── db.py                      # engine, SessionLocal, Base, get_db()
├── models/
│   ├── __init__.py            # re-exports Media, MediaSegment
│   ├── media.py               # Media table
│   └── segment.py             # MediaSegment table (JSONB extras)
├── migrations/                # Alembic — created by `alembic init migrations`
│   ├── env.py                 # wired to Base + DB_* env vars
│   └── versions/              # one file per migration
├── alembic.ini                # Alembic config (URL set at runtime)
├── face_engine.py             # MediaPipe face/pose + blendshapes
├── audio_pipeline.py          # faster-whisper + Silero VAD + PYIN
├── scoring_engine.py          # sub-score weighting + tips
├── signal_scorer.py           # per-chunk signal aggregation
├── session_recorder.py        # Library list query + RECORDINGS_DIR
├── report_generator.py        # post-session report builder
├── .env                       # gitignored local secrets (DB password etc.)
├── recordings/                # session webm videos (gitignored)
└── uploads/                   # uploaded videos + re-encoded mp4s (gitignored)
```

## Troubleshooting

### `OperationalError: connection refused`
Postgres isn't running, or `DB_HOST`/`DB_PORT` is wrong in `.env`.

### `ModuleNotFoundError: No module named 'db'` (only from Alembic)
You're running `alembic` from outside `backend/`. `cd backend/` first.

### `Target database is not up to date`
Someone else pushed a new migration. Run `alembic upgrade head`.

### `Can't locate revision identified by 'xxx'`
Your DB is at a revision that no longer exists in `migrations/versions/`
(e.g. someone force-pushed). Options: nuke the DB and `upgrade head`,
or `DELETE FROM alembic_version` and `upgrade head`.
