"""add media.processing_progress for SSE-backed real-time progress

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-06 17:00:00.000000

Adds a single nullable Integer column `processing_progress` (0..100)
to the `media` table. Used by the SSE-streamed progress endpoint
`/api/media/{id}/progress-stream` so all uvicorn workers read the
same value. Replaces the previous per-process in-memory dict which
was visible to only ~25 % of polling requests on a 4-worker setup.

Forward-only schema change. NULL default preserves all existing
rows untouched — frontend treats NULL as "indeterminate" and shows
a spinner instead of a percent bar.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'media',
        sa.Column('processing_progress', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('media', 'processing_progress')
