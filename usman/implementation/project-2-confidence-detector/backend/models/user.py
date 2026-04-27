"""
User — one row per registered account.

Authentication uses email + password (bcrypt-hashed). Tokens are JWTs
that carry the user's `id` as their `sub` claim, so verifying a token
only requires decoding it — no DB hit per request.

Email is the only login identifier and is unique. Display name is
shown next to comments and in the header. password_hash is bcrypt.
"""
from datetime import datetime
from typing import List, TYPE_CHECKING

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base

if TYPE_CHECKING:
    from .media import Media


class User(Base):
    __tablename__ = "users"

    # uuid4 hex (32 chars) — same convention as Media.id, generated in
    # the auth handler before insert. Plain string PK keeps the schema
    # consistent across both tables.
    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    # bcrypt hash, ~60 chars. Length 255 leaves room for any future
    # algorithm prefix change without another migration.
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Convenience back-ref to the user's recordings. Cascade delete is
    # NOT set — deleting a user must be an explicit operation that the
    # app handles deliberately (see DELETE /api/auth/me when added),
    # because it dominoes through media + segments + files on disk.
    media: Mapped[List["Media"]] = relationship(back_populates="owner")

    def __repr__(self) -> str:
        return f"<User id={self.id!r} email={self.email!r}>"
