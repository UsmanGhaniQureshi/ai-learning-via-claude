"""
Comment — one row per discussion message attached to a Media.

Composition rules:
  - `media_id` FK with CASCADE delete: if the recording is deleted,
    its comments go with it. No orphans.
  - `author_user_id` FK with CASCADE delete: if a user is deleted
    their comments vanish too. We don't try to preserve them as
    "anonymous" — that's not a feature anyone asked for and complicates
    the model.
  - `t_s` is nullable: when set, the frontend renders a "jump to MM:SS"
    link that seeks the audio playback. When null, the comment is
    just a general note on the recording.
  - `t_end_s` is also nullable. When set alongside `t_s`, the comment
    anchors a RANGE of the recording — clicking the comment seeks to
    `t_s` and auto-pauses at `t_end_s`. Useful for coach-style "from
    1:23 to 1:45 your eye contact dropped" feedback.
  - `updated_at` ticks on every edit so the UI can show "(edited)" if
    it differs from `created_at` by more than a small jitter window.

Authorisation lives in the endpoint handlers (auth.py + main.py),
not on the model — keeping the ORM dumb means it can be reused by
admin tooling without auth checks.
"""
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base

if TYPE_CHECKING:
    from .media import Media
    from .user import User


class Comment(Base):
    __tablename__ = "comments"

    # uuid4 hex (32 chars) — same convention as Media + User ids.
    id: Mapped[str] = mapped_column(String, primary_key=True)
    media_id: Mapped[str] = mapped_column(
        String, ForeignKey("media.id", ondelete="CASCADE"), nullable=False
    )
    author_user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Timestamp pointer into the recording, in seconds. Nullable —
    # general comments don't anchor to a moment.
    t_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Optional END of the anchored range. When set alongside t_s, the
    # comment spans [t_s, t_end_s]. Click → seek + auto-pause at end.
    # Validated > t_s in the POST endpoint.
    t_end_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Convenience back-refs. Loaded lazily; the comment endpoints
    # explicitly query the User row when they need the author's name
    # for the response payload, since we want a single SELECT not an
    # N+1 lazy-load per comment.
    media: Mapped["Media"] = relationship()
    author: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<Comment id={self.id!r} media={self.media_id!r}>"
