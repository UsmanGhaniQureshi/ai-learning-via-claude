"""
CalibrationProfile — one row per user, captured during the one-shot
Personal Setup flow (Phase 6). Holds:

- Per-emotion face captures (averaged blendshapes per emotion).
  The exact emotion set is defined by EMOTION_PROMPTS in
  calibration_prompts.py (currently 5 emotions).
- Per-signal voice baselines (mean + std + min/max) computed from
  paired video+audio recordings of 60 s each. Prompt set defined by
  VOICE_PROMPTS in calibration_prompts.py (currently 1 prompt =
  2 recordings).
- Per-signal tolerance bands (mean ± 1.5 σ) used at scoring time
  to flag whether a session value is within the user's normal range.
- Camera-anxiety analysis comparing video-mode vs audio-mode signals.
- A rolling EWMA-updated baseline that drifts toward recent session
  values without re-running the full calibration.
- Lists of which signals are "reliable" (use personal baseline fully)
  vs "provisional" (blend 50/50 with universal thresholds).

The table holds at most one row per user (`user_id` UNIQUE). A user
resetting calibration overwrites the same row; `calibration_version`
ticks up so cached reports referencing an older calibration can be
detected as stale.
"""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class CalibrationProfile(Base):
    __tablename__ = "user_calibration_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"),
        unique=True, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(),
    )

    # Bumped on every reset/redo of calibration so any cached reports
    # that reference an older calibration version can be invalidated.
    calibration_version: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1",
    )
    is_complete: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false",
    )

    # ── Emotion face capture ────────────────────────────────────
    # `emotion_order`: list[str] — the per-user shuffled order of the
    # active emotion set (count comes from EMOTION_PROMPTS). Stored so
    # a resumed session can continue from where the user left off
    # without re-shuffling.
    # `emotion_faces`: dict[emotion_label -> face_capture_dict]
    #   face_capture_dict shape:
    #     {
    #       "blendshapes_avg": {category_name: float, ...}  # all 52
    #       "eye_contact_pct": float,
    #       "tension_score":   float,
    #       "blink_rate":      float,
    #       "gaze_direction":  str,
    #       "calibration_quality": float,
    #       "frames_used":     int,
    #     }
    emotion_order: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    emotion_faces: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    # ── Voice signal baselines ──────────────────────────────────
    voice_wpm_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    voice_wpm_std:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    voice_wpm_min:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    voice_wpm_max:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    voice_pitch_mean_baseline: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    voice_pitch_std_baseline:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    voice_pitch_std_variability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    voice_rms_baseline: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    voice_filler_rate_baseline: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    voice_filler_rate_std:      Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    voice_jitter_baseline:    Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    voice_shimmer_baseline:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    voice_steadiness_baseline: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vocal_variety_baseline:   Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # 10-label emotion mix the user defaulted to during the open-prompt
    # voice recordings — their "neutral" emotional baseline.
    # Shape: { "nervous": 0.10, "confident": 0.25, ... }
    emotion_mix_baseline: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    # Per-signal tolerance bands.
    # Shape: { signal_name: { "lower": float, "upper": float } }
    tolerance_bands: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    # 0.0–1.0 — overall reliability of the captured baseline.
    baseline_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Camera-anxiety analysis: compares the average of video-mode
    # recordings against the average of audio-only recordings. The
    # delta dict has per-signal entries:
    #   { "wpm_delta": float, "pitch_std_delta": float,
    #     "filler_rate_delta": float, "steadiness_delta": float }
    camera_anxiety_delta: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    camera_anxiety_detected: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false",
    )

    # Rolling EWMA-updated baseline that the per-session finalize hook
    # drifts toward recent session values. Same shape as the per-signal
    # baseline columns above but bundled as a single dict so we can
    # iterate signals without adding more columns.
    session_count: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0",
    )
    rolling_baseline: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    # The raw per-recording extractions kept for diagnostics + for the
    # /complete endpoint's aggregation pass. Each entry shape:
    #   { "mode": "video"|"audio", "prompt_index": int,
    #     "wpm": float, "pitch_mean": float, ... }
    calibration_recordings: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    # Signal classification: trust personal baseline fully (reliable),
    # blend 50/50 with universal threshold (provisional).
    reliable_signals:    Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    provisional_signals: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<CalibrationProfile user_id={self.user_id!r} "
            f"v={self.calibration_version} complete={self.is_complete}>"
        )
