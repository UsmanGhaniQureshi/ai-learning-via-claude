"""End-to-end tests for the sharing + comments endpoints.

We use FastAPI's TestClient against the real `app` so the auth
dependency, JSON validation, and DB integration are all exercised
exactly as they run in production. The tests insert users + Media
rows directly via SessionLocal because going through /api/upload
would require running the full ffmpeg + face + speech pipeline
(covered by test_pipeline_regression.py).

Each test uses uuid-stamped emails + media ids so parallel runs
don't collide, and the `make_world` fixture cleans up after itself
via Postgres CASCADE on the FKs.

If you add a sharing or comment endpoint, add at least one test
here; the brief calls for ~15 cases covering owner add/remove,
non-owner can't share, recipient view but no edit/delete, recipient
sees in /api/recordings, comment by anyone with access, only author
can edit own, range filter, and delete-cascade-comments.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from main import app, limiter
from db import SessionLocal
from models import Media, User, Comment
from auth import hash_password


# Disable rate limits for the whole test session — slowapi caps
# /api/auth/register at 10/hour and /api/media/{id}/comments at
# 60/hour, both of which are blown well before this suite finishes.
# Production behaviour is unaffected; this only mutates the in-process
# limiter the TestClient is talking to.
limiter.enabled = False


client = TestClient(app)


def _register_user(email: str | None = None) -> tuple[str, str, str]:
    """Create a user via the public /api/auth/register endpoint and
    return (user_id, email, jwt). Mirrors the real signup flow so the
    JWT is identical to what the frontend would receive."""
    email = email or f"u-{uuid.uuid4().hex[:12]}@example.com"
    res = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Pa55w0rd!xyz", "name": "Tester"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    return data["user"]["id"], email, data["token"]


def _make_media(owner_id: str, *, kind: str = "session", title: str = "Test recording") -> str:
    """Insert a minimum-viable completed Media row owned by `owner_id`.

    We bypass the upload pipeline because the goal here is to test
    sharing + comments, not the audio/video processing already covered
    by test_pipeline_regression.py.
    """
    media_id = f"sess_{uuid.uuid4().hex}"
    with SessionLocal() as db:
        db.add(Media(
            id=media_id,
            source_kind=kind,
            user_id=owner_id,
            duration_s=12.0,
            has_video=True,
            has_audio=True,
            score_avg=70,
            title=title,
            report_json={"avg_score": 70, "marker": "test"},
            processing_status="completed",
        ))
        db.commit()
    return media_id


def _delete_media(media_id: str) -> None:
    with SessionLocal() as db:
        m = db.get(Media, media_id)
        if m is not None:
            db.delete(m)
            db.commit()


def _delete_user(user_id: str) -> None:
    with SessionLocal() as db:
        u = db.get(User, user_id)
        if u is not None:
            db.delete(u)
            db.commit()


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def world():
    """Owner + recipient + outsider + one Media. Cleans up cascades."""
    owner_id, owner_email, owner_tok = _register_user()
    recip_id, recip_email, recip_tok = _register_user()
    outsider_id, outsider_email, outsider_tok = _register_user()
    media_id = _make_media(owner_id)
    try:
        yield {
            "owner": {"id": owner_id, "email": owner_email, "tok": owner_tok},
            "recipient": {"id": recip_id, "email": recip_email, "tok": recip_tok},
            "outsider": {"id": outsider_id, "email": outsider_email, "tok": outsider_tok},
            "media_id": media_id,
        }
    finally:
        _delete_media(media_id)
        _delete_user(owner_id)
        _delete_user(recip_id)
        _delete_user(outsider_id)


# ────────────────────────── SHARING ──────────────────────────

def test_owner_can_share_media(world):
    res = client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["media_id"] == world["media_id"]
    ids = [u["id"] for u in body["shared_with"]]
    assert world["recipient"]["id"] in ids


def test_share_with_unknown_email_404s(world):
    res = client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": f"ghost-{uuid.uuid4().hex[:8]}@example.com"},
        headers=_h(world["owner"]["tok"]),
    )
    assert res.status_code == 404


def test_owner_cant_share_with_self(world):
    res = client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["owner"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    assert res.status_code == 400


def test_non_owner_cannot_share(world):
    # Outsider has NO relationship to the media — share attempt must 404.
    res = client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["outsider"]["tok"]),
    )
    assert res.status_code == 404


def test_recipient_cannot_share(world):
    # Even after being shared on the media, a recipient can't reshare —
    # owner-only operation.
    client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    res = client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["outsider"]["email"]},
        headers=_h(world["recipient"]["tok"]),
    )
    assert res.status_code == 404


def test_owner_can_revoke_share(world):
    client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    res = client.delete(
        f"/api/media/{world['media_id']}/share/{world['recipient']['id']}",
        headers=_h(world["owner"]["tok"]),
    )
    assert res.status_code == 200
    assert res.json()["shared_with_count"] == 0


def test_recipient_sees_media_in_recordings_list(world):
    client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    res = client.get("/api/recordings", headers=_h(world["recipient"]["tok"]))
    assert res.status_code == 200
    ids = [r["session_id"] for r in res.json()["items"]]
    assert world["media_id"] in ids


def test_outsider_cannot_read_report(world):
    res = client.get(
        f"/api/report/{world['media_id']}",
        headers=_h(world["outsider"]["tok"]),
    )
    # 404 not 403 — un-enumerable id design (see media_readable_by docstring).
    assert res.status_code == 404


def test_recipient_can_read_report_after_share(world):
    client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    res = client.get(
        f"/api/report/{world['media_id']}",
        headers=_h(world["recipient"]["tok"]),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["is_owner"] is False
    assert body["shared_by"] is not None


# ────────────────────────── COMMENTS ──────────────────────────

def _post_comment(world, who: str, body: str, **kwargs) -> dict:
    res = client.post(
        f"/api/media/{world['media_id']}/comments",
        json={"body": body, **kwargs},
        headers=_h(world[who]["tok"]),
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_owner_can_post_comment(world):
    c = _post_comment(world, "owner", "First comment")
    assert c["body"] == "First comment"
    assert c["author"]["id"] == world["owner"]["id"]


def test_recipient_can_comment_after_share(world):
    client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    c = _post_comment(world, "recipient", "Looks good!")
    assert c["author"]["id"] == world["recipient"]["id"]


def test_outsider_cannot_comment(world):
    res = client.post(
        f"/api/media/{world['media_id']}/comments",
        json={"body": "should be blocked"},
        headers=_h(world["outsider"]["tok"]),
    )
    assert res.status_code == 404


def test_only_author_can_edit_own_comment(world):
    client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    c = _post_comment(world, "recipient", "original")
    # Owner of the media tries to edit recipient's comment → 404 (author-only).
    res = client.patch(
        f"/api/comments/{c['id']}",
        json={"body": "owner-edit"},
        headers=_h(world["owner"]["tok"]),
    )
    assert res.status_code == 404
    # Recipient (the author) edits their own → 200.
    res = client.patch(
        f"/api/comments/{c['id']}",
        json={"body": "edited by author"},
        headers=_h(world["recipient"]["tok"]),
    )
    assert res.status_code == 200
    assert res.json()["body"] == "edited by author"


def test_media_owner_can_delete_any_comment(world):
    client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    c = _post_comment(world, "recipient", "spam to moderate")
    # Media owner moderates a recipient's comment → allowed.
    res = client.delete(
        f"/api/comments/{c['id']}",
        headers=_h(world["owner"]["tok"]),
    )
    assert res.status_code == 200


def test_ranged_comment_validation(world):
    # t_end_s without t_s → 400.
    res = client.post(
        f"/api/media/{world['media_id']}/comments",
        json={"body": "ranged?", "t_end_s": 5.0},
        headers=_h(world["owner"]["tok"]),
    )
    assert res.status_code == 400
    # t_end_s <= t_s → 400.
    res = client.post(
        f"/api/media/{world['media_id']}/comments",
        json={"body": "bad range", "t_s": 10.0, "t_end_s": 5.0},
        headers=_h(world["owner"]["tok"]),
    )
    assert res.status_code == 400
    # Valid range → 200.
    c = _post_comment(world, "owner", "ranged ok", t_s=1.0, t_end_s=4.0)
    assert c["t_s"] == 1.0 and c["t_end_s"] == 4.0


def test_deleting_media_cascades_comments(world):
    c = _post_comment(world, "owner", "will be cascaded")
    comment_id = c["id"]
    _delete_media(world["media_id"])
    with SessionLocal() as db:
        assert db.get(Comment, comment_id) is None
    # Mark the fixture's media_id as already deleted so teardown doesn't
    # complain or double-delete (best-effort: cleanup helper is no-op
    # for missing rows so this is harmless either way).
    world["media_id"] = "<already-deleted>"


def test_comment_list_visible_to_recipient(world):
    _post_comment(world, "owner", "owner-comment")
    client.post(
        f"/api/media/{world['media_id']}/share",
        json={"email": world["recipient"]["email"]},
        headers=_h(world["owner"]["tok"]),
    )
    res = client.get(
        f"/api/media/{world['media_id']}/comments",
        headers=_h(world["recipient"]["tok"]),
    )
    assert res.status_code == 200
    bodies = [c["body"] for c in res.json()]
    assert "owner-comment" in bodies
