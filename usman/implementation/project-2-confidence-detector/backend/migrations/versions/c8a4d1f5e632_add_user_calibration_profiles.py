"""add user_calibration_profiles table

Revision ID: c8a4d1f5e632
Revises: b3f7a8c2e591
Create Date: 2026-05-05 00:00:00.000000

Personal Calibration System (Phase 6):
  - One-shot per-user baseline captured during onboarding
  - 10 emotion face captures (10 s each)
  - 3 voice prompts × 60 s with camera ON
  - 3 voice prompts × 60 s with camera OFF
  - Aggregated baselines + tolerance bands stored as JSONB

The table holds at most one row per user (`user_id` UNIQUE). A
user resetting calibration just overwrites the same row — we keep
`calibration_version` so any cached reports referencing an older
calibration can be detected as stale.

JSONB blobs are used for the structured data (tolerance bands,
emotion face profile, recording history) so we can iterate on the
schema without a migration each time.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'c8a4d1f5e632'
down_revision: Union[str, Sequence[str], None] = 'b3f7a8c2e591'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_calibration_profiles',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.text('now()'), nullable=False,
        ),
        sa.Column(
            'calibration_version', sa.Integer(),
            server_default=sa.text('1'), nullable=False,
        ),
        sa.Column(
            'is_complete', sa.Boolean(),
            server_default=sa.text('false'), nullable=False,
        ),

        # Per-user shuffled emotion order + per-emotion face capture
        # results (averaged blendshapes + gaze + tension).
        sa.Column('emotion_order', JSONB(), nullable=True),
        sa.Column('emotion_faces', JSONB(), nullable=True),

        # Voice signal baselines (mean + variability per signal).
        sa.Column('voice_wpm_mean', sa.Float(), nullable=True),
        sa.Column('voice_wpm_std', sa.Float(), nullable=True),
        sa.Column('voice_wpm_min', sa.Float(), nullable=True),
        sa.Column('voice_wpm_max', sa.Float(), nullable=True),

        sa.Column('voice_pitch_mean_baseline', sa.Float(), nullable=True),
        sa.Column('voice_pitch_std_baseline', sa.Float(), nullable=True),
        sa.Column('voice_pitch_std_variability', sa.Float(), nullable=True),

        sa.Column('voice_rms_baseline', sa.Float(), nullable=True),

        sa.Column('voice_filler_rate_baseline', sa.Float(), nullable=True),
        sa.Column('voice_filler_rate_std', sa.Float(), nullable=True),

        sa.Column('voice_jitter_baseline', sa.Float(), nullable=True),
        sa.Column('voice_shimmer_baseline', sa.Float(), nullable=True),
        sa.Column('voice_steadiness_baseline', sa.Float(), nullable=True),
        sa.Column('vocal_variety_baseline', sa.Float(), nullable=True),

        # 10-label emotion mix the user landed on most often during
        # the open-prompt voice recordings — used as their "neutral"
        # emotion distribution.
        sa.Column('emotion_mix_baseline', JSONB(), nullable=True),

        # Per-signal lower / upper tolerance bands keyed by signal
        # name. Computed as mean ± 1.5 std.
        sa.Column('tolerance_bands', JSONB(), nullable=True),

        # 0.0–1.0 overall confidence in the baseline (mean of
        # 1 - cv across signals, clamped).
        sa.Column('baseline_confidence', sa.Float(), nullable=True),

        # Camera-anxiety analysis: per-signal delta between video
        # mode and audio-only mode recordings + boolean flag.
        sa.Column('camera_anxiety_delta', JSONB(), nullable=True),
        sa.Column(
            'camera_anxiety_detected', sa.Boolean(),
            server_default=sa.text('false'), nullable=False,
        ),

        # Per-user session counter (increments after each finished
        # practice session) — drives the calibration vs session
        # blending ratio in _fetch_user_baseline.
        sa.Column(
            'session_count', sa.Integer(),
            server_default=sa.text('0'), nullable=False,
        ),

        # EWMA-updated rolling baseline that drifts towards the
        # user's recent session values over time.
        sa.Column('rolling_baseline', JSONB(), nullable=True),

        # The raw per-recording extractions kept for diagnostics +
        # for the `complete` step's aggregation.
        sa.Column('calibration_recordings', JSONB(), nullable=True),

        # Lists of signal names — which baselines we trust fully
        # (`reliable`) vs which still blend with universal thresholds
        # (`provisional`). Recomputed by /complete and again on each
        # rolling update.
        sa.Column('reliable_signals', JSONB(), nullable=True),
        sa.Column('provisional_signals', JSONB(), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_calibration_user'),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'],
            ondelete='CASCADE',  # delete a user → wipe their calibration
        ),
    )

    # Lookup index on user_id (the unique constraint already creates
    # a unique index, so this is a bit redundant; alembic naming
    # consistency only).
    op.create_index(
        'ix_calibration_user_id',
        'user_calibration_profiles',
        ['user_id'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        'ix_calibration_user_id',
        table_name='user_calibration_profiles',
    )
    op.drop_table('user_calibration_profiles')
