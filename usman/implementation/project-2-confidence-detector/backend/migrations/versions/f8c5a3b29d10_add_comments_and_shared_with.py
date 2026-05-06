"""add comments table + media.shared_with array

Revision ID: f8c5a3b29d10
Revises: d7e9b1a2c4f8
Create Date: 2026-04-25 13:00:00.000000

Multi-user collaboration:
  - `comments` table — threaded discussion attached to a Media row.
    `t_s` is a nullable timestamp pointer so a comment can link to a
    specific moment in the recording (frontend will offer a "jump to
    2:34" link when set).
  - `media.shared_with` — JSONB array of user ids the owner has
    granted read+comment access to. Owner stays in user_id; sharing
    just augments the access set.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'f8c5a3b29d10'
down_revision: Union[str, Sequence[str], None] = 'd7e9b1a2c4f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── comments table ──────────────────────────────────────────────
    op.create_table(
        'comments',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('media_id', sa.String(), nullable=False),
        sa.Column('author_user_id', sa.String(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('t_s', sa.Float(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(
            ['media_id'], ['media.id'],
            ondelete='CASCADE',  # delete a media → its comments vanish
        ),
        sa.ForeignKeyConstraint(
            ['author_user_id'], ['users.id'],
            ondelete='CASCADE',  # delete a user → their comments vanish
        ),
    )
    op.create_index(
        'ix_comments_media_id_created_at',
        'comments', ['media_id', 'created_at'],
        unique=False,
    )

    # ── media.shared_with ───────────────────────────────────────────
    # JSONB array of user ids. Nullable; null/empty means "owner only".
    op.add_column('media', sa.Column('shared_with', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('media', 'shared_with')
    op.drop_index('ix_comments_media_id_created_at', table_name='comments')
    op.drop_table('comments')
