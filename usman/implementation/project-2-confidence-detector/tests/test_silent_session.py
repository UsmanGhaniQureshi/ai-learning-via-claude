"""End-to-end test for the silent-session gate (Batch 1).

Generates synthetic audio with controlled amounts of speech, runs it
through `AudioPipeline.process_chunk` and `generate_post_session_report`,
and asserts the new `insufficient_speech` flag fires when total voiced
seconds across the session is below 3 s.

The audit found that a 30-s silent recording was scoring 82/100 ("A").
This test pins the fix so a regression that re-introduces the bug
fails CI loudly.

We don't depend on ffmpeg-binary or the network — `_make_silent` and
`_make_speech_burst` build synthetic int16 PCM in memory and feed it
straight to the pipeline.
"""
from __future__ import annotations

import math
import numpy as np
import pytest

from audio_pipeline import AudioPipeline
from report_generator import generate_post_session_report
from signal_scorer import SignalScorer


SR = 16000
CHUNK_SAMPLES = SR * 3   # 3 s chunks, matches production


def _silent_chunk() -> np.ndarray:
    """3 s of pure zeros, float32."""
    return np.zeros(CHUNK_SAMPLES, dtype=np.float32)


def _voiced_chunk(seconds_of_speech: float) -> np.ndarray:
    """3 s window with `seconds_of_speech` of synthetic speech-shaped
    noise placed in the middle, surrounded by silence.

    Real Whisper-grade speech is hard to synthesise without TTS, but
    we don't need transcription quality — we only need the VAD +
    voiced_s estimate to register that audio is present. Wideband
    pink-ish noise shaped at speech-like frequencies (~150-1000 Hz)
    crosses Silero VAD's threshold reliably.
    """
    chunk = np.zeros(CHUNK_SAMPLES, dtype=np.float32)
    n_speech = int(seconds_of_speech * SR)
    if n_speech <= 0:
        return chunk
    start = (CHUNK_SAMPLES - n_speech) // 2
    # Synthetic vowel-like waveform: F0=180 Hz with formants mixed in.
    # Amplitude 0.3 keeps it well clear of clipping but loud enough
    # for VAD to flag as speech.
    t = np.arange(n_speech) / SR
    voice = 0.3 * (
        np.sin(2 * np.pi * 180 * t)
        + 0.5 * np.sin(2 * np.pi * 360 * t)
        + 0.3 * np.sin(2 * np.pi * 750 * t)
    ).astype(np.float32)
    chunk[start:start + n_speech] = voice
    return chunk


# ── per-signal scorer gates ─────────────────────────────────────────


def test_voice_steadiness_returns_none_on_silent_chunk():
    pitch = {"tremor_score": 0, "std_hz": 0}
    assert SignalScorer.voice_steadiness(pitch, rms_std=0, voiced_s=0) is None


def test_voice_steadiness_still_scores_when_voiced():
    pitch = {"tremor_score": 0.1, "std_hz": 25}
    assert SignalScorer.voice_steadiness(pitch, rms_std=0.02, voiced_s=2.5) is not None


def test_filler_words_returns_none_on_silent_chunk():
    """The audit's biggest find: silent chunks were getting 100."""
    assert SignalScorer.filler_words(0, 0, voiced_s=0) is None
    assert SignalScorer.filler_words(0, 0, voiced_s=0.4) is None  # below 0.5 gate


def test_filler_words_real_score_when_voiced():
    # 0 fillers in 5 voiced seconds = perfect 100
    assert SignalScorer.filler_words(0, 0, voiced_s=5) == 100


def test_vocal_variety_returns_none_on_silent_chunk():
    """Silent chunks were being labelled 'monotone' (score 20)."""
    assert SignalScorer.vocal_variety({"std_hz": 0}, voiced_s=0) is None
    assert SignalScorer.vocal_variety({"std_hz": 0}, voiced_s=0.49) is None


def test_vocal_variety_still_scores_when_voiced():
    assert SignalScorer.vocal_variety({"std_hz": 25}, voiced_s=2) is not None


# ── full-pipeline session-level gate ────────────────────────────────


def _run_session(chunks):
    """Process a list of np.float32 chunks through AudioPipeline and
    feed the snapshots into generate_post_session_report. Returns the
    final report dict."""
    pipeline = AudioPipeline()
    snapshots = [pipeline.process_chunk(c, sr=SR) for c in chunks]
    return generate_post_session_report(snapshots, "silent-session-test")


def test_30s_silent_session_marked_insufficient_speech():
    """The headline regression: 30-s silent recording must NOT score."""
    report = _run_session([_silent_chunk() for _ in range(10)])
    assert report.get("insufficient_speech") is True
    assert report.get("avg_score") is None
    assert report.get("grade") is None
    # Every per-signal average should be None (no data on any chunk).
    for sig in (
        "voice_steadiness", "eye_contact", "speech_pace",
        "filler_words", "vocal_variety", "expression",
    ):
        assert report["signal_averages"][sig] is None, (
            f"signal_averages.{sig} must be None on a silent session, "
            f"got {report['signal_averages'][sig]!r}"
        )
    assert "status_message" in report
    assert report.get("coaching_status") == "skipped"


def test_session_with_one_second_of_speech_still_insufficient():
    """1 s of speech across a 30-s session is still under the 3-s gate."""
    chunks = [_silent_chunk() for _ in range(9)]
    chunks.append(_voiced_chunk(1.0))   # 1 s of speech in chunk 10
    report = _run_session(chunks)
    assert report.get("insufficient_speech") is True
    assert report.get("avg_score") is None


def test_session_with_enough_voiced_seconds_is_scored():
    """5 s of voiced speech (across 2 chunks) beats the 3-s gate.

    Bypasses Silero VAD by injecting voiced_s directly into snapshot
    dicts — the gate's input is `r['voiced_s']` from the audio
    pipeline, and what we want to pin here is the report-generator
    threshold logic, not Silero's per-chunk voicing accuracy.
    """
    snapshots = []
    # 8 chunks (24 s) total: 6 silent, 2 voiced at 2.5 s each.
    for i in range(8):
        is_voiced = i in (3, 4)
        snapshots.append({
            "scores": {
                "voice_steadiness": 70 if is_voiced else None,
                "eye_contact": 80,
                "speech_pace": 75 if is_voiced else None,
                "filler_words": 90 if is_voiced else None,
                "vocal_variety": 65 if is_voiced else None,
                "expression": 60,
                "total": 75 if is_voiced else 50,
            },
            "raw": {"voiced_s": 2.5 if is_voiced else 0},
            "transcript_words": [],
        })
    report = generate_post_session_report(snapshots, "voiced-test")
    assert report.get("insufficient_speech") is not True
    assert report.get("avg_score") is not None


# ── avg() returning None semantics ──────────────────────────────────


def test_avg_returns_none_when_all_signals_are_none():
    """avg() previously returned 0 for empty inputs, displaying as
    "0/100" instead of "N/A". Pin the fix."""
    # Build a fake snapshots list where every score is None.
    snapshots = [
        {
            "scores": {k: None for k in (
                "voice_steadiness", "eye_contact", "speech_pace",
                "filler_words", "vocal_variety", "expression", "total",
            )},
            "raw": {"voiced_s": 1.5},   # avoids insufficient_speech short-circuit
            "transcript_words": [],
        }
        for _ in range(2)
    ]
    # Sum voiced_s = 3.0 → just above the 3.0 threshold → not
    # insufficient. avg() should return None for every signal.
    report = generate_post_session_report(snapshots, "avg-none-test")
    assert report.get("insufficient_speech") is not True
    for sig in ("voice_steadiness", "eye_contact", "speech_pace",
                "filler_words", "vocal_variety", "expression"):
        assert report["signal_averages"][sig] is None
