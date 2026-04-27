"""add media.title, topic, tags

Revision ID: d7e9b1a2c4f8
Revises: c4d8e3f29b81
Create Date: 2026-04-25 11:00:00.000000

User-supplied metadata for organising the Library:
  - title: short display name. Falls back to original_name in the UI
    when null.
  - topic: free-text or chosen from the practice prompts list (e.g.
    "Job interview"). Used to group related sessions.
  - tags: free-form labels (JSONB array) like ["interview", "demo-day"].
    Library search/filter will key off these.

All three are nullable — pre-existing rows stay valid as `null`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'd7e9b1a2c4f8'
down_revision: Union[str, Sequence[str], None] = 'c4d8e3f29b81'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('media', sa.Column('title', sa.String(length=200), nullable=True))
    op.add_column('media', sa.Column('topic', sa.String(length=120), nullable=True))
    op.add_column('media', sa.Column('tags', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('media', 'tags')
    op.drop_column('media', 'topic')
    op.drop_column('media', 'title')
