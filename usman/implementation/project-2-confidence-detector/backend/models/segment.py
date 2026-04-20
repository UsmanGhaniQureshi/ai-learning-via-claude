"""
MediaSegment — one row per analysis moment within a media item.

Three kinds today (column `kind`):
  - 'face'   → a per-~2-second face-engine snapshot (expression, eye %, etc.)
  - 'speech' → a per-3-second chunk result (pace, fillers, speech score)
  - 'word'   → one word from the transcript with absolute start/end ms

Kind-specific detail lives in `extras` (JSONB) — e.g. face rows carry
{eye_contact_pct, tension_score, blink_rate}, speech rows carry
{fillers: [...], wpm}, word rows carry {is_filler, probability}.

Composite index (media_id, t_start_ms) makes "all segments for this
session in time order" a single index scan.
"""
from typing import Optional, Any, TYPE_CHECKING

from sqlalchemy import String, Integer, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base

if TYPE_CHECKING:
    from .media import Media


class MediaSegment(Base):
    __tablename__ = "media_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    media_id: Mapped[str] = mapped_column(
        String, ForeignKey("media.id", ondelete="CASCADE"), index=True
    )
    t_start_ms: Mapped[int] = mapped_column(Integer)
    t_end_ms: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20))  # 'face' | 'speech' | 'word'
    score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    extras: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    media: Mapped["Media"] = relationship(back_populates="segments")

    __table_args__ = (
        # Covers the common query "segments of a media in time order".
        Index("ix_media_segments_media_id_t_start", "media_id", "t_start_ms"),
    )

    def __repr__(self) -> str:
        return (
            f"<MediaSegment media={self.media_id!r} kind={self.kind!r} "
            f"t={self.t_start_ms}-{self.t_end_ms}>"
        )
