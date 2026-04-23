"""
Session recording directory + Library read helpers.

Library queries the `media` table — sessions, uploads, and analyzer audio
all land in Postgres, so all three kinds surface here. URL fields are
computed per source_kind so the frontend can just use them directly.
"""
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from db import SessionLocal
from models import Media

RECORDINGS_DIR = Path(__file__).parent / "recordings"
RECORDINGS_DIR.mkdir(exist_ok=True)


def _parse_started_at(session_id: str):
    """Parse started_at ISO string from session_{epoch_ms} format if possible."""
    if session_id.startswith("session_"):
        try:
            epoch_ms = int(session_id[len("session_"):])
            return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).isoformat()
        except ValueError:
            return None
    return None


def list_recordings():
    """Return every Media row as a Library entry.

    Per-kind URL wiring:
      - session        → video served from RECORDINGS_DIR via /api/recordings/{id}/video
      - upload         → video served from UPLOAD_DIR via /api/video/{playback_path}
      - analyzer_audio → audio served via /api/analyzer/{id}/audio
    """
    with SessionLocal() as db:
        rows = db.execute(
            select(Media).order_by(Media.created_at.desc())
        ).scalars().all()

        entries = []
        for m in rows:
            entry = {
                "session_id": m.id,
                "kind": m.source_kind,
                "started_at": (
                    m.created_at.isoformat() if m.created_at
                    else _parse_started_at(m.id)
                ),
                "duration_s": m.duration_s,
                "score": m.score_avg,
                "grade": m.score_grade,
                "has_video": bool(m.has_video),
                "has_audio": bool(m.has_audio),
                "has_report": m.report_json is not None,
                "report_url": f"/api/report/{m.id}",
                "original_name": m.original_name,
                "video_url": None,
                "audio_url": None,
            }
            if m.source_kind == "session":
                entry["video_url"] = f"/api/recordings/{m.id}/video"
            elif m.source_kind == "upload" and m.playback_path:
                entry["video_url"] = f"/api/video/{m.playback_path}"
            elif m.source_kind == "analyzer_audio":
                entry["audio_url"] = f"/api/analyzer/{m.id}/audio"

            entries.append(entry)
        return entries
