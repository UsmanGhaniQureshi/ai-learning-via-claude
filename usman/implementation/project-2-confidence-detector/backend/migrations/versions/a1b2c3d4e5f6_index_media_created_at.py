"""index media.created_at for library list-by-date queries

Revision ID: a1b2c3d4e5f6
Revises: f4a9d3e1b8c2
Create Date: 2026-05-06 00:30:00.000000

The Library page lists a user's recordings by recency:

    SELECT ... FROM media
    WHERE user_id = :uid AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT N

`user_id` is already indexed, but for users with thousands of rows
the post-filter sort by `created_at` table-scans the matching slice.
A bare `created_at` index lets PostgreSQL use a bitmap-AND with the
existing `user_id` index and avoid the sort altogether.

This migration adds only the index — no schema change. Safe to run
on a live DB; PostgreSQL builds B-tree indexes online by default.
For a very large `media` table (tens of millions of rows), prefer
`CREATE INDEX CONCURRENTLY` to avoid the brief write lock — alembic
doesn't expose that flag directly so do it manually with `psql` if
needed:

    CREATE INDEX CONCURRENTLY ix_media_created_at ON media(created_at);
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f4a9d3e1b8c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_media_created_at', 'media', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_media_created_at', table_name='media')
