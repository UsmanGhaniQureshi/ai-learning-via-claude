"""
Session recording directory + Library read helpers.

Library queries the `media` table — sessions, uploads, and analyzer audio
all land in Postgres, so all three kinds surface here. URL fields are
computed per source_kind so the frontend can just use them directly.
"""
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import String, cast, or_, select, func

from db import SessionLocal
from models import Media, User
from signed_urls import sign_media_url

# RECORDINGS_DIR is env-configurable (Item 4): in production we point
# this at a mounted persistent disk so live-session video / analyzer
# audio survive container restarts. Default keeps dev behaviour
# (a `recordings/` directory next to this file).
_RECORDINGS_DIR_ENV = os.environ.get("RECORDINGS_DIR")
if _RECORDINGS_DIR_ENV:
    RECORDINGS_DIR = Path(_RECORDINGS_DIR_ENV)
else:
    RECORDINGS_DIR = Path(__file__).parent / "recordings"
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


# Sort options the frontend may pass. Anything else falls back to the
# default newest-first ordering. Whitelisting keeps us out of trouble
# with arbitrary user input being interpreted as a column name.
_SORT_MAP = {
    "created_desc":  Media.created_at.desc(),
    "created_asc":   Media.created_at.asc(),
    # NULLS LAST so unscored rows don't dominate the head/tail of a
    # score-sorted list. Postgres handles NULLS LAST natively.
    "score_desc":    Media.score_avg.desc().nulls_last(),
    "score_asc":     Media.score_avg.asc().nulls_last(),
    "duration_desc": Media.duration_s.desc().nulls_last(),
    "duration_asc":  Media.duration_s.asc().nulls_last(),
}


def _parse_started_at(session_id: str):
    """Parse started_at ISO string from session_{epoch_ms} format if possible."""
    if session_id.startswith("session_"):
        try:
            epoch_ms = int(session_id[len("session_"):])
            return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).isoformat()
        except ValueError:
            return None
    return None


def list_recordings(
    limit: int = 50,
    offset: int = 0,
    user_id: str | None = None,
    *,
    q: str | None = None,
    sort: str = "created_desc",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    min_score: int | None = None,
    max_score: int | None = None,
    tag: str | None = None,
):
    """Return a page of Media rows as Library entries + total count.

    Filtering / sorting is composed below; the same set of WHERE
    clauses is applied to both the count and the list query so `total`
    reflects the *filtered* size, which is what the "N of M" UI label
    needs.

    Args:
        limit: max rows per page (hard-capped at 200 in the handler)
        offset: number of rows to skip
        user_id: when provided, restrict to recordings owned by this user
        q: case-insensitive substring match across title, original_name,
            topic, and the JSON-encoded tags list
        sort: one of _SORT_MAP keys; falls back to created_desc
        date_from / date_to: inclusive timestamp bounds on created_at
        min_score / max_score: inclusive bounds on score_avg
        tag: exact-match against an individual tag inside tags[]

    Returns: { "items": [...], "total": N, "limit": L, "offset": O }
    """
    with SessionLocal() as db:
        # Build one list of WHERE clauses, apply to both count and list.
        # Doing it twice keeps the queries simple and avoids a temp
        # table or CTE for what's a small page.
        wheres = []
        if user_id is not None:
            # Include rows the user owns OR has been shared on. The
            # JSONB `?` operator tests array element membership, which
            # is the right semantic here ("is my id in the
            # shared_with array?"). Falls back to OR so an owned row
            # without shared_with still matches.
            wheres.append(
                or_(
                    Media.user_id == user_id,
                    Media.shared_with.op("?")(user_id),
                )
            )
        if q:
            pat = f"%{q.strip()}%"
            # Case-insensitive search across the user-facing text fields.
            # tags is JSONB; casting to String gives us the JSON literal
            # ("[\"foo\",\"bar\"]") which ILIKE matches just fine for
            # substring search and saves us a jsonb_array_elements
            # join. Catches "interview" inside both tags=["interview"]
            # and tags=["job-interview"], which is what users want.
            wheres.append(
                or_(
                    Media.title.ilike(pat),
                    Media.original_name.ilike(pat),
                    Media.topic.ilike(pat),
                    cast(Media.tags, String).ilike(pat),
                )
            )
        if date_from is not None:
            wheres.append(Media.created_at >= date_from)
        if date_to is not None:
            wheres.append(Media.created_at <= date_to)
        if min_score is not None:
            wheres.append(Media.score_avg >= min_score)
        if max_score is not None:
            wheres.append(Media.score_avg <= max_score)
        if tag:
            # JSONB containment: matches when the tags array contains
            # this exact string. Faster + more precise than substring.
            wheres.append(Media.tags.op("@>")([tag.strip().lower()]))

        order = _SORT_MAP.get(sort, _SORT_MAP["created_desc"])

        count_q = select(func.count(Media.id))
        list_q = select(Media).order_by(order)
        for w in wheres:
            count_q = count_q.where(w)
            list_q = list_q.where(w)

        total = db.execute(count_q).scalar() or 0
        rows = db.execute(list_q.limit(limit).offset(offset)).scalars().all()

        # Pre-fetch owner names for shared rows so we can render a
        # "Shared by X" badge without an N+1 lookup. Only relevant
        # when caller is not the row's user_id.
        owners_needed: set[str] = set()
        if user_id is not None:
            for m in rows:
                if m.user_id and m.user_id != user_id:
                    owners_needed.add(m.user_id)
        owners_by_id: dict[str, User] = {}
        if owners_needed:
            for u in db.query(User).filter(User.id.in_(owners_needed)).all():
                owners_by_id[u.id] = u

        entries = []
        for m in rows:
            rj = m.report_json or {}
            unscoreable = bool(
                rj.get("insufficient_speech") or rj.get("unsupported_language")
            )
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
                "processing_status": m.processing_status,
                "processing_error": m.processing_error,
                "status_message": rj.get("status_message"),
                "insufficient_speech": bool(rj.get("insufficient_speech")),
                "unsupported_language": bool(rj.get("unsupported_language")),
                "unscoreable": unscoreable,
                "report_url": f"/api/report/{m.id}",
                "original_name": m.original_name,
                # User-supplied metadata for Library display.
                "title": m.title,
                "topic": m.topic,
                "tags": m.tags or [],
                # Sharing context — `shared_by` is non-null when the
                # current user is NOT the owner (i.e. this row is in
                # their Library because someone shared it with them).
                # Frontend renders a "Shared by X" badge in that case.
                "is_owner": user_id is None or m.user_id == user_id,
                "shared_by": (
                    {
                        "id": owners_by_id[m.user_id].id,
                        "name": owners_by_id[m.user_id].name,
                        "email": owners_by_id[m.user_id].email,
                    }
                    if user_id is not None and m.user_id != user_id and m.user_id in owners_by_id
                    else None
                ),
                "video_url": None,
                "audio_url": None,
            }
            # Sign URLs for the CALLING user. Each Library row carries
            # its own short-lived capability — when a recipient opens
            # the same row they get a sig bound to their uid, not the
            # owner's. user_id may be None for legacy/unauth callers
            # (kept for back-compat); skip signing in that case so the
            # caller still gets a usable-shape URL.
            url_user = user_id or (m.user_id or "")
            if m.source_kind == "session":
                path = f"/api/recordings/{m.id}/video"
                entry["video_url"] = sign_media_url(path, url_user) if url_user else path
            elif m.source_kind == "upload" and m.playback_path:
                path = f"/api/video/{m.playback_path}"
                entry["video_url"] = sign_media_url(path, url_user) if url_user else path
            elif m.source_kind == "analyzer_audio":
                path = f"/api/analyzer/{m.id}/audio"
                entry["audio_url"] = sign_media_url(path, url_user) if url_user else path

            entries.append(entry)
        return {
            "items": entries,
            "total": int(total),
            "limit": limit,
            "offset": offset,
        }
