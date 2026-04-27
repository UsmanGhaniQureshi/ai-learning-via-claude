"""
Authentication utilities — password hashing, JWT issue/verify, and the
FastAPI dependency that turns a Bearer token into a User row.

Why bcrypt directly (not passlib): passlib 1.7's startup probe calls
bcrypt.hashpw with a 73-byte test string to detect a libc bug, which
trips bcrypt 5.x's hard 72-byte limit and crashes import. Using the
bcrypt library directly sidesteps that mess.

Why JWT (not server-side sessions): stateless. Verifying a token only
requires decoding it with the secret — no per-request DB hit. The
token's `sub` claim carries the user_id; `exp` enforces lifetime.

Tokens last 30 days by default. The frontend stores the token in
localStorage and sends it as `Authorization: Bearer <token>`. On
expiry the server returns 401 and the frontend redirects to /login.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from db import SessionLocal
from models import User


# ── Configuration ──────────────────────────────────────────────────
# JWT_SECRET MUST be set in production. The fallback below is a
# development convenience so a fresh clone runs without env setup;
# it deliberately looks unsafe so anyone reading logs notices.
_DEFAULT_SECRET = "dev-only-please-set-JWT_SECRET-in-production"
JWT_SECRET = os.environ.get("JWT_SECRET", _DEFAULT_SECRET)
JWT_ALGORITHM = "HS256"
JWT_TTL = timedelta(days=int(os.environ.get("JWT_TTL_DAYS", "30")))


# ── Password hashing ───────────────────────────────────────────────
def hash_password(password: str) -> str:
    """Bcrypt-hash a password. 12 rounds is the 2026 sweet spot (~250 ms
    on a modern CPU — slow enough to deter brute force, fast enough not
    to feel laggy on register/login). Always handle bytes/str at the
    boundary; the hash itself is ASCII-safe."""
    if not isinstance(password, str):
        raise TypeError("password must be a str")
    # bcrypt's 72-byte cap: silently truncating long passwords lets a
    # user pass "<71 bytes><differing tail>" and still authenticate,
    # which is a footgun. Reject explicitly instead.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("password too long (max 72 bytes after UTF-8 encoding)")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    """Constant-time check. Returns False on any error rather than
    raising — login handlers want a boolean."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


# ── JWT ────────────────────────────────────────────────────────────
def create_access_token(user_id: str) -> str:
    """Issue a JWT carrying the user's id as `sub` plus expiry."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + JWT_TTL).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode + verify. Returns None on any failure (expired, bad
    signature, malformed) so callers can return a clean 401."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except (jwt.InvalidTokenError, jwt.ExpiredSignatureError):
        return None


def new_user_id() -> str:
    """User ids follow the same convention as Media ids — full uuid4
    hex. Done in code (not DB default) so we don't need a server-side
    extension and so we can hand the id back to the client at register
    time without a SELECT."""
    return uuid.uuid4().hex


# ── FastAPI dependency ─────────────────────────────────────────────
def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> User:
    """Resolve `Authorization: Bearer <token>` to a User row.

    Raises 401 on:
      - missing header
      - malformed Bearer prefix
      - decode failure (bad signature, expired, etc.)
      - user_id from token no longer exists in DB

    Used as a FastAPI dependency on every protected endpoint:
        @app.get("/api/something")
        def handler(user: User = Depends(get_current_user)):
            ...
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization[7:].strip()
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload["sub"]
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User no longer exists",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Detach so caller can use it after the session closes — the
        # only fields they touch (id, email, name) are already loaded.
        db.expunge(user)
        return user


def get_current_user_optional(
    authorization: Optional[str] = Header(default=None),
) -> Optional[User]:
    """Same as get_current_user but returns None instead of 401-ing.
    Used by endpoints that want to know who the caller is *if* they're
    logged in but don't require it (none today, but useful for shared
    public pages later)."""
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None


def get_current_user_for_media(
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = None,
) -> User:
    """Auth for endpoints whose response goes into a browser <video> /
    <audio> / <img> tag.

    Why this exists: those tags issue a plain GET when their `src` is
    set — they CANNOT attach an Authorization header. So requiring
    `Authorization: Bearer <token>` (the normal `get_current_user`
    dependency) makes the tag silently fail with a 401 and the user
    sees an unplayable video.

    The fix is to ALSO accept the token via the `?token=` query
    parameter, the same convention the WebSocket handler uses.
    Frontend builds the URL via the `mediaUrl()` helper in
    `frontend/src/config.js` which appends the current token.

    Order of preference: Authorization header first (so a future
    desktop client / cURL test still works), then `?token=`.

    Same 401 behaviour, same WWW-Authenticate header on failure as the
    standard dependency.
    """
    # Try header first — preserves the canonical Bearer-token UX for
    # any non-browser caller.
    if authorization and authorization.lower().startswith("bearer "):
        return get_current_user(authorization)

    # Fall back to query param. Build a synthetic Authorization value
    # so we can reuse the existing get_current_user logic verbatim.
    if token:
        return get_current_user(f"Bearer {token}")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing token (header `Authorization: Bearer …` or query `?token=…`).",
        headers={"WWW-Authenticate": "Bearer"},
    )


# ── Access control helpers ─────────────────────────────────────────
def media_readable_by(user_id: str, media) -> bool:
    """Return True iff the given user can READ this Media row.

    Read = owner OR explicitly shared-with. The shared_with list lets
    the owner grant a friend / coach access to the report + comments
    without giving up ownership. We deliberately don't expose this as
    a multi-tier permission system — there's just "owner" (full
    edit/delete/share) and "shared-with" (read + comment).

    Used to gate every endpoint that returns a Media's bytes or
    metadata. Still returns 404 (not 403) on failure to keep ids
    un-enumerable.
    """
    if media is None:
        return False
    if media.user_id == user_id:
        return True
    shared = media.shared_with or []
    return user_id in shared


def media_owned_by(user_id: str, media) -> bool:
    """Owner-only ops: edit metadata, delete, trim, share, unshare.
    Comments by shared-with users go through media_readable_by."""
    return media is not None and media.user_id == user_id
