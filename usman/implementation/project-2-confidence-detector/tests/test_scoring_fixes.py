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
from scoring_engine import ScoringEngine, generate_tips


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


def test_aggregate_face_only_returns_none_not_face_dominated():
    """The Batch-5 fix: a silent user with their face on camera was
    scoring 100 because every audio signal was None and eye_contact
    was renormalized to 100% of the weight. After the fix the live
    chunk aggregate must be None when no audio signal is present —
    the live UI then keeps the gauge at its baseline rather than
    fabricating a "100" headline from face alone.
    """
    out = SignalScorer.aggregate({
        "voice_steadiness": None,
        "eye_contact": 100,        # user looking at the camera
        "speech_pace": None,
        "filler_words": None,
        "vocal_variety": None,
    })
    assert out is None
    # Same shape with expression also present: still None — we look
    # only at the four AUDIO signals to decide.
    out2 = SignalScorer.aggregate({
        "voice_steadiness": None,
        "eye_contact": 80,
        "speech_pace": None,
        "filler_words": None,
        "vocal_variety": None,
        "expression": 90,
    })
    assert out2 is None


def test_aggregate_one_audio_signal_present_is_enough():
    """Belt-and-braces: a single voiced audio signal lets the
    headline compute. We never want the gate to be so strict that
    real speech with one missing signal returns None."""
    out = SignalScorer.aggregate({
        "voice_steadiness": 80,
        "eye_contact": 90,
        "speech_pace": None,
        "filler_words": None,
        "vocal_variety": None,
    })
    assert out is not None
    # 0.24*80 + 0.24*90 = 40.8, divided by (0.24+0.24) = 0.48 → 85
    assert out == 85


# ──────────────────── Fix 1 + 2: filler_words parity ────────────────────

def test_filler_words_signal_scorer_smooth_curve_legacy_path():
    """Pin the smooth-curve contract for the legacy per-voiced-minute path
    (Fix 3 replaced the step table with `100 * exp(-rate/5)` for callers
    that don't pass word_count). The new curve has no plateaus, so a
    drop from 5.0 to 4.9 fillers/min no longer jumps the score."""
    # rate = 0/min → 100
    assert SignalScorer.filler_words(lexical_count=0, acoustic_count=0, voiced_s=60) == 100
    # 1.5/min: round(100 * exp(-1.5/5)) = 74
    assert SignalScorer.filler_words(lexical_count=1, acoustic_count=0, voiced_s=40) == 74
    # 4/min: round(100 * exp(-4/5)) = 45
    assert SignalScorer.filler_words(lexical_count=4, acoustic_count=0, voiced_s=60) == 45
    # 25/min: round(100 * exp(-25/5)) ≈ 1
    assert SignalScorer.filler_words(lexical_count=25, acoustic_count=0, voiced_s=60) == 1


def test_filler_words_signal_scorer_per_100_words_path():
    """Pin the Fix 4 per-100-words contract: when callers thread
    word_count through, the rate becomes (fillers/words)*100 and the
    curve uses divisor 3. A slow speaker (60 wpm, 6 fillers/min) and a
    fast speaker (200 wpm, 6 fillers/min) now score very differently."""
    # rate = 0/100w → 100
    assert SignalScorer.filler_words(0, 0, voiced_s=60, word_count=100) == 100
    # rate = 3/100w: round(100 * exp(-3/3)) = 37
    assert SignalScorer.filler_words(3, 0, voiced_s=60, word_count=100) == 37
    # 6 fillers in a 60-word minute (slow) vs 200-word minute (fast)
    slow = SignalScorer.filler_words(6, 0, voiced_s=60, word_count=60)
    fast = SignalScorer.filler_words(6, 0, voiced_s=60, word_count=200)
    assert slow < fast, "fast speaker should score higher with same filler count"
    # word_count=0 → no real words → None (no data)
    assert SignalScorer.filler_words(0, 0, voiced_s=60, word_count=0) is None


def test_scoring_engine_filler_words_delegates_to_signal_scorer():
    """Live (signal_scorer) and upload (scoring_engine) paths must agree.

    3 fillers across 60 voiced seconds = 3/min. Under the Fix 3 smooth
    curve (legacy per-voiced-minute path, no word_count): score =
    round(100 * exp(-3/5)) = 55. Both paths MUST produce the same
    number — this test catches drift between them, not a specific
    value. The exact 55 is only there to keep regressions loud."""
    engine = ScoringEngine()
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
    assert sub["filler_words"] == canonical == 55


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


# ────────────────── generate_tips: None-safe comparison ──────────────────


def test_generate_tips_handles_none_signals():
    """Reproduces the upload-pipeline crash:
       'TypeError: < not supported between NoneType and int'.

    `dict.get(key, 50)` only returns 50 when the key is MISSING — not
    when the value is explicitly None. After Batch-5 made missing
    signals return None, generate_tips broke on the first None signal.
    Fix: skip None signals when generating tips. This pins the fix.
    """
    # Audio-only upload shape: face signals are None.
    scores = {
        'voiceSteadiness': 80,
        'eyeContact': None,
        'speechPace': 75,
        'fillerWords': 90,
        'vocalVariety': 65,
        'expression': None,
        'total': 78,
    }
    # Must NOT raise. Must return a list.
    tips = generate_tips(scores)
    assert isinstance(tips, list)
    # Every measured signal here is >= its tip threshold, so the only
    # tip that fires is the encouragement (total=78 >= 70).
    assert tips == ["Great job! You're presenting with confidence"]


def test_generate_tips_total_none_does_not_crash():
    """Also handle the all-Nones case (silent + no-face clip)."""
    scores = {
        'voiceSteadiness': None, 'eyeContact': None, 'speechPace': None,
        'fillerWords': None, 'vocalVariety': None, 'expression': None,
        'total': None,
    }
    tips = generate_tips(scores)
    assert tips == []


def test_generate_tips_low_score_with_none_neighbors():
    """Mixed: some scores low, some None. Should tip on the low ones,
    skip the Nones."""
    scores = {
        'voiceSteadiness': None,         # skipped
        'eyeContact': 30,                # below 50 threshold
        'speechPace': None,              # skipped
        'fillerWords': 40,               # below 60 threshold
        'vocalVariety': 90,              # not below 50
        'expression': None,              # skipped
        'total': 40,
    }
    tips = generate_tips(scores)
    assert "Look directly at the camera to maintain eye contact" in tips
    assert "Reduce filler words like 'um', 'uh', and 'like'" in tips
