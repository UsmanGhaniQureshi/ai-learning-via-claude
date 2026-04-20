"""
Database wiring — SQLAlchemy 2.0 engine, session factory, and FastAPI
dependency. All DB access goes through this module.

Reads connection params from env (via python-dotenv, already loaded by
main.py at process start). Assembles a DSN in the psycopg3 dialect that
SQLAlchemy understands.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def _build_database_url() -> str:
    """Assemble the SQLAlchemy URL from DB_* env vars.

    Done here rather than in .env so the file stays readable (separate
    fields instead of one noisy URL) and so the password can be changed
    without touching the URL format.
    """
    host = os.environ.get("DB_HOST", "localhost")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "confidence_detector_app")
    user = os.environ.get("DB_USER", "postgres")
    password = os.environ.get("DB_PASSWORD", "postgres")
    # postgresql+psycopg tells SQLAlchemy to use the psycopg3 driver we
    # installed, not the default psycopg2 (which is NOT in requirements).
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{name}"


DATABASE_URL = _build_database_url()

# echo=False keeps SQL out of stdout by default. Flip to True for debugging.
# pool_pre_ping=True tests the connection on checkout so a dropped Postgres
# (e.g. server restart) produces a reconnect instead of a silent error on
# the next query.
engine = create_engine(DATABASE_URL, echo=False, future=True, pool_pre_ping=True)

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
