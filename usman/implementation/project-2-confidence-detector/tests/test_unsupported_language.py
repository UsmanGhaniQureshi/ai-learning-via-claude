"""Tests for the English-only product gate (Batch 2).

The audit found that the previous "language_warning" path was dead
code under production defaults — the .en transcription model can
never report a non-English language, so the gate condition
`lang != "en"` was unreachable. Batch 2 replaces it with a real
multilingual probe + a hard-enforcing short-circuit.

These tests pin the new gate's behaviour without requiring the
actual ~75 MB multilingual whisper model to load. They construct
synthetic snapshots with `unsupported_language` set on each
result (which is what the AudioPipeline now does once the probe
fires) and verify:
  - report_generator short-circuits with avg_score=None,
    unsupported_language=<code>, status_message set
  - report_generator's unsupported short-circuit takes precedence
    over insufficient_speech (a non-English clip is "fail because
    not English", not "fail because too short")

A separate end-to-end test using a real Hindi clip is left out of
this file — it requires either gTTS + network, or a committed audio
fixture, plus a 75 MB model download to actually probe. Add when CI
has a large-fixture story.
"""
from __future__ import annotations

import pytest

from report_generator import generate_post_session_report


SIGNAL_KEYS = (
    "voice_steadiness", "eye_contact", "speech_pace",
    "filler_words", "vocal_variety", "expression",
)


def _snap(*, voiced_s=2.0, lang=None, scores=None):
    """Build a snapshot dict in the shape AudioPipeline.process_chunk
    returns. `lang` is the value the multilingual probe would set on
    every chunk after the first voiced one (None = English / not
    probed)."""
    return {
        "scores": scores or {k: 70 for k in (*SIGNAL_KEYS, "total")},
        "raw": {"voiced_s": voiced_s},
        "transcript_words": [],
        "unsupported_language": lang,
    }


# ───────────────────────── short-circuit fires ─────────────────────────

def test_report_short_circuits_on_unsupported_language():
    """Hindi probe → report comes back as unscoreable with a clear
    status_message. avg_score is None so the UI renders the explainer
    card instead of a misleading number."""
    snapshots = [_snap(voiced_s=2.0, lang="hi") for _ in range(5)]
    report = generate_post_session_report(snapshots, "hindi-test")
    assert report.get("unsupported_language") == "hi"
    assert report.get("avg_score") is None
    assert report.get("grade") is None
    for sig in SIGNAL_KEYS:
        assert report["signal_averages"][sig] is None, (
            f"signal_averages.{sig} must be None on a non-English session"
        )
    assert isinstance(report.get("status_message"), str)
    assert "english" in report["status_message"].lower()
    assert report.get("coaching_status") == "skipped"


def test_unsupported_language_takes_precedence_over_insufficient_speech():
    """If a clip is BOTH non-English AND short on voiced seconds, we
    report the language failure (more actionable) — the user needs to
    re-record in English, not just speak more of whatever they were
    speaking."""
    # 3 chunks × 0.3s voiced = 0.9s total (under the insufficient
    # threshold) AND non-English on every chunk.
    snapshots = [_snap(voiced_s=0.3, lang="es") for _ in range(3)]
    report = generate_post_session_report(snapshots, "spanish-short")
    assert report.get("unsupported_language") == "es"
    assert report.get("insufficient_speech") is not True


def test_first_chunk_silent_then_non_english_still_fires():
    """The probe runs on the first VOICED chunk, not literally chunk 0.
    A session that opens with a few seconds of silence then switches
    to non-English speech still hits the gate."""
    snapshots = [
        _snap(voiced_s=0.0, lang=None),     # silent — probe didn't fire yet
        _snap(voiced_s=0.0, lang=None),
        _snap(voiced_s=2.5, lang="ar"),     # first voiced chunk → probe says "ar"
        _snap(voiced_s=2.5, lang="ar"),     # cached on the same instance
    ]
    report = generate_post_session_report(snapshots, "arabic-late-start")
    assert report.get("unsupported_language") == "ar"
    assert report.get("avg_score") is None


def test_english_session_not_flagged_as_unsupported():
    """Sanity check: when no chunk reports unsupported_language, the
    gate doesn't fire and a normal report is produced."""
    snapshots = [_snap(voiced_s=2.0, lang=None) for _ in range(4)]
    report = generate_post_session_report(snapshots, "english-test")
    assert report.get("unsupported_language") is None
    # Should produce a real report (not a short-circuit).
    assert report.get("avg_score") is not None


# ──────────────────── per-chunk plumbing ────────────────────

def test_audio_pipeline_emits_unsupported_language_field():
    """Smoke check: AudioPipeline.process_chunk's result MUST include
    the `unsupported_language` field so report_generator can read it.
    The field should be None on a fresh instance that hasn't probed."""
    from audio_pipeline import AudioPipeline
    import numpy as np
    pipe = AudioPipeline()
    silent = np.zeros(16000 * 3, dtype=np.float32)
    result = pipe.process_chunk(silent, sr=16000)
    assert "unsupported_language" in result
    # Silent chunk → probe doesn't run → still None.
    assert result["unsupported_language"] is None


def test_audio_pipeline_reset_clears_language_state():
    """Calling reset() on a pipeline instance (used between sessions
    on a shared instance) must clear the language state so the next
    session probes fresh."""
    from audio_pipeline import AudioPipeline
    pipe = AudioPipeline()
    pipe._language_probed = True
    pipe._unsupported_language = "hi"
    pipe.reset()
    assert pipe._language_probed is False
    assert pipe._unsupported_language is None
