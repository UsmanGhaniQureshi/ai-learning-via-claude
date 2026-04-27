"""rename default user email from .local to .example so it can log in

Revision ID: a1f5e2c8b094
Revises: f8c5a3b29d10
Create Date: 2026-04-25 15:00:00.000000

The original migration (c4d8e3f29b81) seeded the legacy-data owner as
`default@local`. Pydantic's EmailStr (used by /api/auth/login) calls
email-validator which rejects `.local` as a non-deliverable TLD,
making the seeded account un-loginable. This migration renames it to
`default@example.com` (an IANA reserved TLD that email-validator
accepts) so operators upgrading from a fresh install can actually log
in to view the legacy data.

Idempotent: only updates if the row still has the old email.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1f5e2c8b094'
down_revision: Union[str, Sequence[str], None] = 'f8c5a3b29d10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE users "
            "SET email = 'default@example.com', name = 'Legacy library' "
            "WHERE id = '00000000000000000000000000000000' "
            "  AND email = 'default@local'"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE users "
            "SET email = 'default@local', name = 'Default User' "
            "WHERE id = '00000000000000000000000000000000' "
            "  AND email = 'default@example.com'"
        )
    )
