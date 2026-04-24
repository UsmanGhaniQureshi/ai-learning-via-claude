"""add (kind, score) composite index on media_segments

Revision ID: b2a1f4c97d52
Revises: 44cd48371b07
Create Date: 2026-04-24 19:00:00.000000

Supports analytics queries that filter by segment kind and then by score
threshold — e.g. "all low-face-score segments", "all low-speech-pace
segments", "score distribution by kind". Without this index those were
full table scans the moment media_segments got non-trivial.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b2a1f4c97d52'
down_revision: Union[str, Sequence[str], None] = '44cd48371b07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_media_segments_kind_score',
        'media_segments',
        ['kind', 'score'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_media_segments_kind_score', table_name='media_segments')
