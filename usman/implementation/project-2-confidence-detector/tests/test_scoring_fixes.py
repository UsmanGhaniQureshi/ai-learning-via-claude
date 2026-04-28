"""Unit tests for the scoring-fix audit batch.

Each test pins a specific bug or bias the audit identified, so a
future refactor that re-introduces the bad behaviour fails CI loudly.

Covered:
- Fix 3: SignalScorer.aggregate skips None and renormalizes weights
  (silent chunks + audio-only clips no longer drag the headline).
- Fix 1 + 2: ScoringEngine.compute_sub_scores delegates filler_words
  to SignalScorer with the same per-minute step table the live WS
  path uses (no more lexical-only divide-by-zero, no more
  per-100-words linear formula drift).
- Fix 4: ScoringEngine.compute_sub_scores returns None for missing
  source data instead of 50.

These do NOT exercise ffmpeg / Whisper / face_engine — those are
covered by test_pipeline_regression.py.
"""
from __future__ import annotations

import pytest

from signal_scorer import SignalScorer
from scoring_engine import ScoringEngine


# ───────────────────── Fix 3: aggregate ──────────────────────

def test_aggregate_all_signals_present_unchanged():
    """Sanity: full-data aggregate matches the documented weights."""
    out = SignalScorer.aggregate({
        "voice_steadiness": 80,
        "eye_contact": 90,
        "speech_pace": 70,
        "filler_words": 60,
        "vocal_variety": 50,
    })
    # 0.24*80 + 0.24*90 + 0.20*70 + 0.20*60 + 0.12*50
    # = 19.2 + 21.6 + 14.0 + 12.0 + 6.0 = 72.8 → 73
    assert out == 73


def test_aggregate_skips_none_and_renormalizes():
    """A silent chunk with no speech_pace should NOT be treated as 50."""
    out = SignalScorer.aggregate({
        "voice_steadiness": 80,
        "eye_contact": 90,
        "speech_pace": None,        # silent — no data
        "filler_words": 60,
        "vocal_variety": 50,
    })
    # weights renormalize from (.24+.24+.20+.12)=0.80 base → divide by it
    # = (0.24*80 + 0.24*90 + 0.20*60 + 0.12*50) / 0.80
    # = (19.2 + 21.6 + 12.0 + 6.0) / 0.80
    # = 58.8 / 0.80 = 73.5 → 74
    assert out == 74
    # Old behavior would have been: treat None as 50, no renormalization
    # → 0.24*80 + 0.24*90 + 0.20*50 + 0.20*60 + 0.12*50 = 68.8 → 69
    # The new value (74) is meaningfully higher because the silence
    # isn't being counted as a mediocre 50.


def test_aggregate_audio_only_excludes_face_signals():
    """Audio-only clip: eye_contact + expression are None, headline reflects only audio."""
    out = SignalScorer.aggregate({
        "voice_steadiness": 80,
        "eye_contact": None,        # no face data
        "speech_pace": 70,
        "filler_words": 60,
        "vocal_variety": 50,
    })
    # weights renormalize: (.24+.20+.20+.12) = 0.76 base
    # = (0.24*80 + 0.20*70 + 0.20*60 + 0.12*50) / 0.76
    # = (19.2 + 14.0 + 12.0 + 6.0) / 0.76
    # = 51.2 / 0.76 = 67.4 → 67
    assert out == 67


def test_aggregate_all_none_returns_none():
    """If literally nothing was measured, total is None — not a fake 50."""
    assert SignalScorer.aggregate({}) is None
    assert SignalScorer.aggregate({
        "voice_steadiness": None,
        "eye_contact": None,
        "speech_pace": None,
        "filler_words": None,
        "vocal_variety": None,
    }) is None


# ──────────────────── Fix 1 + 2: filler_words parity ────────────────────

def test_filler_words_signal_scorer_canonical_step_table():
    """Pin the canonical step table — the live WS path uses this directly."""
    # rate = 0/min → 100
    assert SignalScorer.filler_words(lexical_count=0, acoustic_count=0, voiced_s=60) == 100
    # 1.5/min (under 2/min tier) → 90
    assert SignalScorer.filler_words(lexical_count=1, acoustic_count=0, voiced_s=40) == 90
    # 4/min (under 5/min tier) → 75
    assert SignalScorer.filler_words(lexical_count=4, acoustic_count=0, voiced_s=60) == 75
    # 25/min (over 20/min tier) → 10
    assert SignalScorer.filler_words(lexical_count=25, acoustic_count=0, voiced_s=60) == 10


def test_scoring_engine_filler_words_delegates_to_signal_scorer():
    """Live (signal_scorer) and upload (scoring_engine) paths must agree."""
    engine = ScoringEngine()
    # 3 fillers across 60 voiced seconds = 3/min — strictly inside the
    # `< 5/min` tier → SignalScorer canonical score 75. Both paths
    # MUST agree on the same value or the bug is back.
    sub = engine.compute_sub_scores(
        face_result=None,
        speech_result={
            "wpm": 140,
            "lexical_filler_count": 2,
            "acoustic_filler_count": 1,
            "voiced_s": 60.0,
        },
        audio_result=None,
    )
    canonical = SignalScorer.filler_words(
        lexical_count=2, acoustic_count=1, voiced_s=60.0,
    )
    assert sub["filler_words"] == canonical == 75


def test_scoring_engine_filler_words_no_division_by_zero():
    """Fix 1: a clip with 0 transcribed words but some acoustic fillers
    must NOT score 100 (the old `100 - 0*10 = 100` bug). Returns None
    when the inputs aren't enough to compute a real rate."""
    engine = ScoringEngine()
    sub = engine.compute_sub_scores(
        face_result=None,
        speech_result={
            "wpm": 0,
            "lexical_filler_count": 0,
            "acoustic_filler_count": 5,
            "voiced_s": 0,            # no voiced speech detected
        },
        audio_result=None,
    )
    assert sub["filler_words"] is None  # no data — skipped, not faked perfect


# ────────────────── Fix 4: missing data returns None ──────────────────

def test_scoring_engine_missing_face_returns_none():
    """Audio-only clip: eye_contact + expression must be None, not 50."""
    engine = ScoringEngine()
    sub = engine.compute_sub_scores(
        face_result=None,
        speech_result={"wpm": 140, "lexical_filler_count": 0,
                       "acoustic_filler_count": 0, "voiced_s": 30},
        audio_result={"voice_steadiness": 80, "pitch_std": 25},
    )
    assert sub["eye_contact"] is None
    assert sub["expression"] is None
    # The audio-derived signals stayed real numbers
    assert sub["voice_steadiness"] == 80
    assert sub["vocal_variety"] is not None
    assert sub["filler_words"] == 100


def test_scoring_engine_missing_audio_returns_none():
    """No audio result: voice_steadiness + vocal_variety + speech_pace
    + filler_words must be None."""
    engine = ScoringEngine()
    sub = engine.compute_sub_scores(
        face_result={"eye_contact_pct": 85, "expression": "focused"},
        speech_result=None,
        audio_result=None,
    )
    assert sub["voice_steadiness"] is None
    assert sub["speech_pace"] is None
    assert sub["filler_words"] is None
    assert sub["vocal_variety"] is None
    assert sub["eye_contact"] == 85


def test_scoring_engine_update_renormalizes_with_missing_signals():
    """End-to-end: ScoringEngine.update should flow Nones through and
    produce a renormalized total, never a fake 50-anchored number."""
    engine = ScoringEngine()
    final = engine.update({
        "voice_steadiness": 80,
        "eye_contact": None,
        "speech_pace": 70,
        "filler_words": 60,
        "vocal_variety": 50,
        "expression": None,
    })
    # Same as test_aggregate_audio_only_excludes_face_signals: 67
    assert final["total"] == 67
    assert final["eyeContact"] is None
    assert final["expression"] is None
    assert final["voiceSteadiness"] == 80
