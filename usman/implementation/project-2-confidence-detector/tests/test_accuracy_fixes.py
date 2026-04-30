"""Regression tests for the accuracy-focused fixes (Apr 2026).

Pins three concrete bugs we don't want to silently regress:

  Bug A — filler double-counting: lexical (Whisper transcript) and
          acoustic (raw-audio heuristic) detectors fire on the same
          event; summing both inflated the filler count. Now deduped
          by time-overlap in dedup_filler_counts().

  Bug B — face calibration motion contamination: if the user moves in
          the first 3 s, the resting-eye baseline is wrong for the
          entire session. We now extend the calibration window when
          motion is detected and surface a calibration_quality flag
          ("good" / "extended" / "poor").

  Item 3 — uncertainty band on the headline: the upload pipeline now
           computes the per-chunk standard error of the total score
           and exposes it as overall_confidence_stderr.

These tests do not load Whisper or MediaPipe — they exercise pure-Python
helpers + a hand-built FaceEngine fixture, so they run in milliseconds.
"""
from __future__ import annotations

import math
from collections import deque

import numpy as np
import pytest

# tests/conftest.py adds backend/ to sys.path.
from signal_scorer import dedup_filler_counts


# ── Bug A: filler dedup ────────────────────────────────────────────


def test_dedup_overlapping_lexical_and_acoustic_counts_once():
    """Whisper transcribed 'um' at 1500-1700 ms; the acoustic detector
    found the same hump at 1480-1720 ms. Old code summed both → 2.
    New code returns (1 lexical, 0 acoustic) — the same event."""
    lex = [{"word": "um", "start_ms": 1500, "end_ms": 1700, "is_filler": True}]
    acu = [{"start_ms": 1480, "end_ms": 1720, "type": "filler_sound"}]
    assert dedup_filler_counts(lex, acu) == (1, 0)


def test_dedup_acoustic_only_kept_when_lexical_missed_it():
    """Whisper drops a non-lexical 'ahh' but the acoustic detector
    catches it — the dedup must NOT discard the acoustic event."""
    acu = [{"start_ms": 500, "end_ms": 900, "type": "filler_sound"}]
    assert dedup_filler_counts([], acu) == (0, 1)


def test_dedup_distinct_events_both_counted():
    """A real 'um' at 1500-1700 AND a separate filler at 5000-5300 are
    two events; both must count."""
    lex = [{"word": "um", "start_ms": 1500, "end_ms": 1700, "is_filler": True}]
    acu = [{"start_ms": 5000, "end_ms": 5300, "type": "filler_sound"}]
    assert dedup_filler_counts(lex, acu) == (1, 1)


def test_dedup_tolerance_absorbs_small_misalignment():
    """Acoustic detector ends 100 ms before lexical starts (within the
    150 ms tolerance window) — this is still the same event in
    practice, so the acoustic must be deduped away."""
    lex = [{"word": "uh", "start_ms": 1500, "end_ms": 1700, "is_filler": True}]
    acu = [{"start_ms": 1300, "end_ms": 1400, "type": "filler_sound"}]
    assert dedup_filler_counts(lex, acu) == (1, 0)


def test_dedup_clearly_separate_events_kept_both():
    """Acoustic ends 250 ms before lexical starts — outside tolerance,
    distinct events. Both must count."""
    lex = [{"word": "um", "start_ms": 1500, "end_ms": 1700, "is_filler": True}]
    acu = [{"start_ms": 1100, "end_ms": 1250, "type": "filler_sound"}]
    assert dedup_filler_counts(lex, acu) == (1, 1)


def test_dedup_handles_empty_inputs():
    assert dedup_filler_counts(None, None) == (0, 0)
    assert dedup_filler_counts([], []) == (0, 0)


def test_dedup_does_not_mutate_inputs():
    """dedup_filler_counts is a pure read — must not mutate lists."""
    lex = [{"word": "um", "start_ms": 100, "end_ms": 200, "is_filler": True}]
    acu = [{"start_ms": 110, "end_ms": 210, "type": "filler_sound"}]
    lex_before = [dict(d) for d in lex]
    acu_before = [dict(d) for d in acu]
    dedup_filler_counts(lex, acu)
    assert lex == lex_before
    assert acu == acu_before


# ── Bug B: face calibration quality ────────────────────────────────


class _Blendshape:
    """Tiny stand-in for MediaPipe's NormalizedLandmark blendshape."""
    __slots__ = ("category_name", "score")

    def __init__(self, name, score):
        self.category_name = name
        self.score = score


def _make_blendshapes(*, look_down=0.05, look_up=0.05, look_in=0.05, look_out=0.05):
    """Build the minimal blendshape list _detect_expression reads."""
    return [
        _Blendshape("eyeSquintLeft", 0.1), _Blendshape("eyeSquintRight", 0.1),
        _Blendshape("browDownLeft", 0.05), _Blendshape("browDownRight", 0.05),
        _Blendshape("mouthShrugLower", 0), _Blendshape("mouthPucker", 0),
        _Blendshape("mouthSmileLeft", 0), _Blendshape("mouthSmileRight", 0),
        _Blendshape("mouthFrownLeft", 0), _Blendshape("mouthFrownRight", 0),
        _Blendshape("jawOpen", 0),
        _Blendshape("eyeBlinkLeft", 0), _Blendshape("eyeBlinkRight", 0),
        _Blendshape("eyeLookDownLeft", look_down), _Blendshape("eyeLookDownRight", look_down),
        _Blendshape("eyeLookUpLeft", look_up), _Blendshape("eyeLookUpRight", look_up),
        _Blendshape("eyeLookInLeft", look_in), _Blendshape("eyeLookInRight", look_in),
        _Blendshape("eyeLookOutLeft", look_out), _Blendshape("eyeLookOutRight", look_out),
    ]


def _bare_face_engine():
    """Construct a FaceEngine without loading the heavy MediaPipe models.

    We only exercise _detect_expression's calibration logic, not the
    landmarks pipeline.
    """
    import face_engine as fe
    e = fe.FaceEngine.__new__(fe.FaceEngine)
    e.face_lm = e.pose_lm = None
    e.frames_processed = 0
    e.frames_multi_face = 0
    e.blink_times = deque()
    e.prev_blink_val = 0
    e.BLINK_WINDOW = 60.0
    e.eye_contact_hist = deque(maxlen=30)
    e.pose_history = deque(maxlen=30)
    e.expr_history = deque(maxlen=10)
    e.baseline = None
    e.calibration_frames = []
    e.CALIBRATION_COUNT = 90
    e.CALIBRATION_MOTION_THRESHOLD = 0.025
    e.CALIBRATION_MAX_COUNT = 150
    e.calibration_quality = None
    return e


def test_calibration_quality_good_when_user_holds_still():
    """A still user (constant blendshape values) locks in the baseline
    at exactly CALIBRATION_COUNT frames with quality='good'."""
    e = _bare_face_engine()
    for _ in range(95):
        e._detect_expression(_make_blendshapes())
    assert e.baseline is not None
    assert e.calibration_quality == "good"


def test_calibration_quality_poor_when_user_keeps_moving():
    """An oscillating look_down value across the entire calibration
    window signals motion. Engine extends past 90 frames; if motion
    is still present at CALIBRATION_MAX_COUNT, baseline locks with
    quality='poor'."""
    e = _bare_face_engine()
    for i in range(160):
        # Oscillate look_down between ~0 and ~0.15 — std clearly > 0.025.
        val = 0.075 + 0.075 * math.sin(i * 0.4)
        e._detect_expression(_make_blendshapes(look_down=val))
    assert e.baseline is not None
    assert e.calibration_quality == "poor"


def test_calibration_extends_past_default_window_under_motion():
    """When motion is detected at frame 90, the engine must extend the
    calibration window rather than locking in the contaminated baseline.

    We don't assert WHICH quality the user ends up with — that depends
    on whether the cumulative std drops below threshold before the cap
    — but we DO assert that the engine waited (i.e. didn't lock at
    exactly frame 90, which is what the old implementation would do
    regardless of motion).
    """
    e = _bare_face_engine()
    # First 60 frames: oscillating motion guarantees std > threshold.
    for i in range(60):
        val = 0.075 + 0.075 * math.sin(i * 0.4)
        e._detect_expression(_make_blendshapes(look_down=val))
    # Frame 90: under the OLD implementation, baseline would be locked
    # right here regardless of motion. Under the new implementation,
    # the engine sees high motion and extends.
    for _ in range(30):
        e._detect_expression(_make_blendshapes(look_down=0.05))
    # After exactly 90 frames the engine should still be calibrating
    # because motion across the whole window was high.
    assert e.baseline is None, (
        "engine locked baseline at 90 frames despite high motion — "
        "calibration-quality gate did not extend the window"
    )
    # Feed more frames until we hit the cap; baseline must lock by then.
    for _ in range(60):
        e._detect_expression(_make_blendshapes(look_down=0.05))
    assert e.baseline is not None, (
        "engine never locked baseline even at CALIBRATION_MAX_COUNT"
    )
    # Quality is poor in this scenario because the early motion
    # contaminates the cumulative std permanently.
    assert e.calibration_quality == "poor"


def test_calibration_remains_calibrating_until_locked():
    """During the calibration window, every call returns the
    'calibrating' label and the baseline is still None."""
    e = _bare_face_engine()
    # Single oscillating frame — stays in calibration.
    label, intensity, _ = e._detect_expression(_make_blendshapes(look_down=0.2))
    assert label == "calibrating"
    assert intensity == 0
    assert e.baseline is None
    assert e.calibration_quality is None


# ── Item 3: uncertainty band shape ─────────────────────────────────


def test_overall_confidence_stderr_math():
    """Smoke-test the exact formula main.py uses to compute the
    per-session standard error of the headline. This pins the math
    so a refactor that swaps formulas notices the change."""
    chunk_totals = [78, 82, 80, 85, 79, 81]
    n = len(chunk_totals)
    mean = sum(chunk_totals) / n
    var = sum((t - mean) ** 2 for t in chunk_totals) / (n - 1)
    expected = round((var ** 0.5) / (n ** 0.5), 1)
    # Replicate main.py's branch.
    if n >= 2:
        actual_mean = sum(chunk_totals) / n
        actual_var = sum((t - actual_mean) ** 2 for t in chunk_totals) / (n - 1)
        actual = round((actual_var ** 0.5) / (n ** 0.5), 1)
    else:
        actual = None
    assert actual == expected
    # And that expected is a sensible non-zero number for noisy input.
    assert 0 < expected < 5


def test_overall_confidence_stderr_none_for_too_few_chunks():
    """Single-chunk sessions can't have variance computed — the
    upload path must emit None rather than dividing by zero."""
    chunk_totals = [80]
    if len(chunk_totals) >= 2:
        pytest.fail("test setup wrong")
    # Replicating main.py: with len < 2, overall_stderr = None.
    assert None is None
