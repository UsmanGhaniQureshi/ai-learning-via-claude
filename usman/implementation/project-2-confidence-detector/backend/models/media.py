"""
Media — one row per analysed media item.

Currently three kinds (`source_kind`):
  - 'upload'         → user-uploaded video analysed by /api/upload
  - 'session'        → live practice session recorded via WebSocket
  - 'analyzer_audio' → audio-only clip submitted to /api/analyze-audio

`id` is a text PK because existing callers already generate string ids
(`session_<epoch_ms>` from the frontend, `uuid.uuid4().hex[:8]` from the
upload handler). Keeping the types as-is avoids backward-compat work.
"""
from datetime import datetime
from typing import Any, List, Optional, TYPE_CHECKING

from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base

if TYPE_CHECKING:
    from .segment import MediaSegment
    from .user import User


class Media(Base):
    __tablename__ = "media"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_kind: Mapped[str] = mapped_column(String(20))
    # Owner of this recording. Nullable for back-compat with rows that
    # existed before multi-user was introduced — those are migrated to
    # the seeded `default@local` user by the same migration that adds
    # this column. New rows MUST have a user_id (enforced in the
    # upload/session handlers).
    user_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    original_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    stored_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    playback_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    duration_s: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    has_video: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    has_audio: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    score_avg: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_grade: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)

    # Background-pipeline state. Defaults to 'completed' on the column so
    # legacy rows (created before the async pipeline existed) are
    # indistinguishable from finished new rows for the status endpoint.
    # New uploads insert with status='pending' and a BackgroundTask
    # advances pending → processing → completed/failed.
    processing_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="completed", server_default="completed",
        index=True,
    )
    processing_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-supplied metadata for Library organisation. All nullable so
    # existing rows stay valid; new rows can pre-fill `topic` from the
    # practice-setup choice (Phase 2) but `title` and `tags` are always
    # user-written, never auto-derived.
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    topic: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tags: Mapped[Optional[list[str]]] = mapped_column(JSONB, nullable=True)

    # JSONB array of user ids the owner has granted read+comment
    # access to. Owner stays the canonical "who can edit/delete";
    # sharing only augments the read+comment circle.
    shared_with: Mapped[Optional[list[str]]] = mapped_column(JSONB, nullable=True)

    # SHA-256 of the uploaded file bytes. Used to dedupe re-uploads of the
    # same video — when a hit occurs, the upload handler returns the
    # existing row's result instead of reprocessing.
    content_sha256: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )

    # Full session report blob (session mode only). Sidesteps hand-
    # reconstructing the rich report shape the frontend already consumes.
    # media_segments still exists for future queryable analytics.
    report_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    # One Media has many MediaSegment rows. Cascade delete means removing
    # a media row automatically removes every segment tied to it, without
    # a second query.
    segments: Mapped[List["MediaSegment"]] = relationship(
        back_populates="media",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Back-ref to the owning user. Loaded lazily — most queries don't
    # need the user object since they already filter by user_id.
    owner: Mapped[Optional["User"]] = relationship(back_populates="media")

    def __repr__(self) -> str:
        return f"<Media id={self.id!r} kind={self.source_kind!r}>"
