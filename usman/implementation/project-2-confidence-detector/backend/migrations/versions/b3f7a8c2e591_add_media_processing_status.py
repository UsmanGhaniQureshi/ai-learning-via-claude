"""add media processing_status + processing_error for async upload pipeline

Revision ID: b3f7a8c2e591
Revises: e3b71d4a5f29
Create Date: 2026-04-28 09:00:00.000000

The /api/upload handler used to do all 30-120 s of ffmpeg + face + speech
work inline on the FastAPI event loop. That blocked the worker from
serving health checks, other uploads, or even cancelling a hung request.

The new pipeline returns 202 immediately after saving bytes to disk and
runs the heavy work in a BackgroundTask, with the row's
`processing_status` advancing pending → processing → completed (or
→ failed with a `processing_error` string the frontend can display).

The column defaults to 'completed' so every PRE-EXISTING row — which
already has a populated report_json — appears finished to the new
status endpoint. Only NEW rows go through the pending/processing
phases.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3f7a8c2e591'
down_revision: Union[str, Sequence[str], None] = 'e3b71d4a5f29'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'media',
        sa.Column(
            'processing_status',
            sa.String(length=20),
            nullable=False,
            server_default='completed',
        ),
    )
    op.add_column(
        'media',
        sa.Column('processing_error', sa.Text(), nullable=True),
    )
    # Index so the "what's still running for this user" query is cheap.
    op.create_index(
        'ix_media_processing_status', 'media', ['processing_status']
    )


def downgrade() -> None:
    op.drop_index('ix_media_processing_status', table_name='media')
    op.drop_column('media', 'processing_error')
    op.drop_column('media', 'processing_status')
