"""HMAC-signed media URLs.

Why we don't keep using ?token=<JWT> on media requests:
  - JWTs are minted with a 30-day TTL so the user stays logged in.
  - A 30-day token in a URL is a 30-day capability — copy/paste it into
    a chat and the recipient can replay it for a month.
  - Browser/proxy caches and access logs routinely store full URLs;
    embedding a long-lived JWT there is the wrong kind of durable.

Signed URLs solve all three: the sig is bound to (path, uid, exp) and
the default lifetime is 1 hour. After expiry the URL fails closed and
the frontend regenerates a fresh one from a normal authed API call.

The HMAC binding to `path` means a sig issued for /api/recordings/A
won't unlock /api/recordings/B; binding to `uid` means a sig issued to
user X won't unlock user Y's row even if the path is the same.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import time
from urllib.parse import urlencode


log = logging.getLogger("confidence_detector")

# Default TTL: 1 hour. Long enough for a coach to scrub through a 40-min
# recording without hitting an expired URL mid-seek; short enough that a
# pasted URL stops working before it leaves anyone's clipboard for good.
DEFAULT_TTL_S = 3600


def _resolve_secret() -> tuple[bytes, bool]:
    """Resolve MEDIA_URL_SECRET → bytes, falling back to JWT_SECRET.

    Returns (secret_bytes, used_fallback). The fallback is fine for
    development but operators should set MEDIA_URL_SECRET explicitly in
    production so rotating one secret doesn't invalidate the other.

    Item 5 (Apr 2026): in production (ENV=production) we refuse to use
    the JWT_SECRET fallback — a misconfigured deploy would otherwise
    silently couple media-URL signing to the auth secret, so rotating
    one would invalidate every existing media link.
    """
    explicit = os.environ.get("MEDIA_URL_SECRET")
    if explicit:
        return explicit.encode("utf-8"), False
    env = os.environ.get("ENV", os.environ.get("APP_ENV", "")).lower()
    if env in ("production", "prod"):
        raise RuntimeError(
            "MEDIA_URL_SECRET must be set when ENV=production. Refusing "
            "to fall back to JWT_SECRET — coupling the two secrets means "
            "rotating one invalidates every existing signed media URL."
        )
    # Lazy-import to avoid an auth ↔ signed_urls cycle at module load.
    from auth import JWT_SECRET
    return (JWT_SECRET.encode("utf-8") if isinstance(JWT_SECRET, str) else JWT_SECRET), True


_SECRET, _USING_JWT_FALLBACK = _resolve_secret()
if _USING_JWT_FALLBACK:
    log.warning(
        "signed_urls.using_jwt_secret",
        extra={
            "detail": (
                "MEDIA_URL_SECRET env var is unset — falling back to "
                "JWT_SECRET for media URL signatures. Set MEDIA_URL_SECRET "
                "to a separate random 32+ byte string in production so "
                "rotating one secret doesn't invalidate the other."
            ),
        },
    )


def _digest(payload: bytes) -> str:
    return base64.urlsafe_b64encode(
        hmac.new(_SECRET, payload, hashlib.sha256).digest()
    ).rstrip(b"=").decode("ascii")


def _normalize_path(path: str) -> str:
    """Sign only the path portion — strip any pre-existing query so
    callers that re-sign an already-signed URL don't double-attach."""
    if "?" in path:
        return path.split("?", 1)[0]
    return path


def sign_media_url(path: str, user_id: str, ttl_seconds: int = DEFAULT_TTL_S) -> str:
    """Return `path` with `?sig=&exp=&uid=` appended.

    `path` is the relative API path of the resource ("/api/video/foo.mp4").
    The HMAC binds path + uid + exp so the URL can't be replayed against
    a different path or by a different user, and it expires when `exp`
    is reached.
    """
    if not path or not user_id:
        return path
    base_path = _normalize_path(path)
    exp = int(time.time()) + max(60, int(ttl_seconds))
    msg = f"{base_path}|{user_id}|{exp}".encode("utf-8")
    sig = _digest(msg)
    return f"{base_path}?{urlencode({'sig': sig, 'exp': exp, 'uid': user_id})}"


def verify_media_signature(
    path: str,
    sig: str | None,
    exp: str | int | None,
    uid: str | None,
) -> str | None:
    """Validate a (path, sig, exp, uid) tuple.

    Returns the encoded user_id on success, None on any failure (bad
    sig, expired, missing field, malformed exp). Callers map None → 401.
    """
    if not path or not sig or not exp or not uid:
        return None
    try:
        exp_i = int(exp)
    except (TypeError, ValueError):
        return None
    if exp_i < int(time.time()):
        return None
    base_path = _normalize_path(path)
    msg = f"{base_path}|{uid}|{exp_i}".encode("utf-8")
    expected = _digest(msg)
    # constant-time compare so a timing oracle can't recover the sig.
    if hmac.compare_digest(expected, sig):
        return uid
    return None
