"""
Session recording directory + Library read helpers.

Phase 2: Library now reads from the `media` table, not from disk
enumeration. Still exposes RECORDINGS_DIR because the WEBM + report JSON
files still land there (until Phase 2 Step 11 stops writing the report).
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
    """Return Library entries from the media table.

    Only sessions (source_kind = 'session') show up in the Library today —
    upload-mode analyses aren't the same UX. If we later want them in
    Library too, remove the where-clause below.
    """
    with SessionLocal() as db:
        rows = db.execute(
            select(Media)
            .where(Media.source_kind == "session")
            .order_by(Media.created_at.desc())
        ).scalars().all()

        return [
            {
                "session_id": m.id,
                # Prefer DB created_at; fall back to parsing the session_id
                # for rows imported from Phase 1 JSON (no created_at set).
                "started_at": (
                    m.created_at.isoformat() if m.created_at
                    else _parse_started_at(m.id)
                ),
                "duration_s": m.duration_s,
                "score": m.score_avg,
                "grade": m.score_grade,
                "has_video": bool(m.has_video),
                "has_report": True,  # If the media row exists, the report does too.
                "video_url": f"/api/recordings/{m.id}/video",
                "report_url": f"/api/report/{m.id}",
            }
            for m in rows
        ]
