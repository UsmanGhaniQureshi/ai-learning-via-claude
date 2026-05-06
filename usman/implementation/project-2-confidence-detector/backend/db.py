"""
Database wiring — SQLAlchemy 2.0 engine, session factory, and FastAPI
dependency. All DB access goes through this module.

Reads connection params from env (via python-dotenv, already loaded by
main.py at process start). Assembles a DSN in the psycopg3 dialect that
SQLAlchemy understands.
"""
import os
from urllib.parse import quote_plus
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def _build_database_url() -> str:
    """Assemble the SQLAlchemy URL from DB_* env vars.

    Done here rather than in .env so the file stays readable (separate
    fields instead of one noisy URL) and so the password can be changed
    without touching the URL format.

    `user` and `password` are URL-encoded via `quote_plus` so passwords
    containing URL-reserved characters (@, :, /, ?, #, &, =, space)
    don't break the DSN parser. Without this, a password like
    `abc@123f.com` produced
    `postgresql+psycopg://cd_app:abc@123f.com@postgres:5432/...`
    and psycopg split at the first `@`, treating `123f.com@postgres`
    as the host and failing DNS resolution. The postgres container
    receives the unencoded password via the POSTGRES_PASSWORD env
    var, so authentication still works on the wire.
    """
    host = os.environ.get("DB_HOST", "localhost")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "confidence_detector_app")
    user = os.environ.get("DB_USER", "postgres")
    password = os.environ.get("DB_PASSWORD", "postgres")
    user_q = quote_plus(user)
    password_q = quote_plus(password)
    # postgresql+psycopg tells SQLAlchemy to use the psycopg3 driver we
    # installed, not the default psycopg2 (which is NOT in requirements).
    return f"postgresql+psycopg://{user_q}:{password_q}@{host}:{port}/{name}"


DATABASE_URL = _build_database_url()

# echo=False keeps SQL out of stdout by default. Flip to True for debugging.
#
# Pool tuning (env-configurable so a small dev box can stay tight and
# a production box can size up without code changes):
#   pool_pre_ping=True   — validate each checkout so a restarted Postgres
#                          produces a reconnect, not a 500 on next query.
#   DB_POOL_SIZE=50      — comfortable for ~100 concurrent users mixing
#                          live WS + uploads + library browsing. The
#                          previous 10 saturated under modest load.
#   DB_POOL_MAX_OVERFLOW=100 — short bursts (e.g. WS disconnect storm,
#                          login spike) get temporary slots above
#                          pool_size without raising "no more connections".
#                          Tune your Postgres `max_connections` to be
#                          larger than (workers × (pool_size + overflow)).
#   pool_recycle=1800    — recycle connections every 30 min so long-lived
#                          idle sockets don't get dropped by the network
#                          or by Postgres's own idle-transaction timeout.
_DB_POOL_SIZE = int(os.environ.get("DB_POOL_SIZE", "50"))
_DB_POOL_MAX_OVERFLOW = int(os.environ.get("DB_POOL_MAX_OVERFLOW", "100"))

engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    pool_size=_DB_POOL_SIZE,
    max_overflow=_DB_POOL_MAX_OVERFLOW,
    pool_recycle=1800,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Every ORM model inherits from this. Alembic reads its .metadata
    to autogenerate migrations that match the current Python models."""
    pass


def get_db():
    """FastAPI dependency. Yields a session, guarantees it's closed
    whether the handler succeeds or raises.

    Usage:
        @app.get("/api/x")
        def handler(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
