"""add users table + media.user_id (backfill legacy rows)

Revision ID: c4d8e3f29b81
Revises: b2a1f4c97d52
Create Date: 2026-04-25 09:00:00.000000

Multi-user foundation. Adds:
  - `users` table (id, email, name, password_hash, created_at)
  - `media.user_id` FK (nullable so existing rows stay valid)

Backfill: creates a single seeded user `default@local` and assigns
every pre-existing Media row to it. This way users who upgrade don't
lose their library — it all shows up under the default account, and
they can log in with the seeded creds (printed below) until they
register a real account.

The seeded password is `change-me`. Anyone with shell access to the
DB can rotate it; no production deploy should leave it as-is.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d8e3f29b81'
down_revision: Union[str, Sequence[str], None] = 'b2a1f4c97d52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Seeded user identity. Password is hashed at upgrade() time using
# passlib so the resulting bcrypt hash is real and verifies against
# "change-me". An offline-precomputed hash would be fragile — bcrypt
# embeds a random salt, and a hand-written hash would silently fail
# to verify, locking the default account out.
DEFAULT_USER_ID = "00000000000000000000000000000000"
DEFAULT_USER_EMAIL = "default@local"
DEFAULT_USER_NAME = "Default User"
DEFAULT_USER_PASSWORD = "change-me"


def upgrade() -> None:
    # 1. Create the users table.
    op.create_table(
        'users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # 2. Seed the default user BEFORE adding the FK so the backfill
    #    UPDATE below has a valid target. Use the bcrypt library
    #    directly — passlib 1.7's startup probe is incompatible with
    #    bcrypt 5.x (see auth.py for the same pattern).
    import bcrypt
    pw_hash = bcrypt.hashpw(
        DEFAULT_USER_PASSWORD.encode("utf-8"),
        bcrypt.gensalt(rounds=12),
    ).decode("ascii")
    op.execute(
        sa.text(
            "INSERT INTO users (id, email, name, password_hash) "
            "VALUES (:id, :email, :name, :pw)"
        ).bindparams(
            id=DEFAULT_USER_ID,
            email=DEFAULT_USER_EMAIL,
            name=DEFAULT_USER_NAME,
            pw=pw_hash,
        )
    )

    # 3. Add the user_id column to media (nullable for now so the ALTER
    #    doesn't fail on existing rows).
    op.add_column('media', sa.Column('user_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_media_user_id'), 'media', ['user_id'], unique=False)
    op.create_foreign_key(
        'fk_media_user_id',
        'media',
        'users',
        ['user_id'],
        ['id'],
        ondelete='CASCADE',
    )

    # 4. Backfill: every pre-existing Media row goes to the default user.
    op.execute(
        sa.text("UPDATE media SET user_id = :uid WHERE user_id IS NULL")
        .bindparams(uid=DEFAULT_USER_ID)
    )


def downgrade() -> None:
    op.drop_constraint('fk_media_user_id', 'media', type_='foreignkey')
    op.drop_index(op.f('ix_media_user_id'), table_name='media')
    op.drop_column('media', 'user_id')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
