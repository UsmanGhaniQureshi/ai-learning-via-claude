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

from sqlalchemy import String, Integer, Float, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base

if TYPE_CHECKING:
    from .segment import MediaSegment


class Media(Base):
    __tablename__ = "media"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_kind: Mapped[str] = mapped_column(String(20))
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

    def __repr__(self) -> str:
        return f"<Media id={self.id!r} kind={self.source_kind!r}>"
