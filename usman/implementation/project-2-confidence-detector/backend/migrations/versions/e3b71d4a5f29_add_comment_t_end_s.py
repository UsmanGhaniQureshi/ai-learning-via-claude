"""add comments.t_end_s for ranged anchors

Revision ID: e3b71d4a5f29
Revises: a1f5e2c8b094
Create Date: 2026-04-27 12:30:00.000000

A comment now optionally spans a range of the recording — coach-style
"from 1:23 to 1:45 your eye contact dropped". When set, frontend
renders a "▶ 1:23 → 1:45" button that seeks to the start AND auto-
pauses at the end on click.

`t_s` (the existing single-moment anchor) stays as-is — a comment is:
  - General        : t_s = NULL,        t_end_s = NULL
  - Single moment  : t_s = 12.5,        t_end_s = NULL
  - Ranged         : t_s = 83.0,        t_end_s = 105.0  (must be > t_s)

Validation that t_end_s > t_s is enforced in the POST endpoint, not
the schema, so a bad migration of legacy data wouldn't fail-closed.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3b71d4a5f29'
down_revision: Union[str, Sequence[str], None] = 'a1f5e2c8b094'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('comments', sa.Column('t_end_s', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('comments', 't_end_s')
