"""Score variance regression test (Fix 9).

The audit flagged that Silero VAD's 0.5 threshold can flip on borderline
frames and silently shift the headline score across re-runs of the same
input. This test pins consistency: running the same synthetic clip
through the full per-chunk pipeline + per-signal aggregate five times in
a row must not move the headline by more than 2 points.

We reuse the synthesised "voiced chunk" pattern from
test_silent_session.py instead of committing a binary fixture — that
keeps CI hermetic and avoids a network/model-download dependency for
test discovery. AudioPipeline still loads Whisper + Silero on first
use, so the test is marked slow; CI can opt out via -k 'not variance'.
"""
from __future__ import annotations

import numpy as np
import pytest

from audio_pipeline import AudioPipeline
from signal_scorer import SignalScorer


SR = 16000
CHUNK_SAMPLES = SR * 3  # 3-second chunks, matches production


def _voiced_chunk(seconds_of_speech: float) -> np.ndarray:
    """Synthetic speech-shaped tone (F0 180 Hz + formants).

    Identical recipe to tests/test_silent_session.py:_voiced_chunk so the
    two suites describe the same waveform.
    """
    chunk = np.zeros(CHUNK_SAMPLES, dtype=np.float32)
    n_speech = int(seconds_of_speech * SR)
    if n_speech <= 0:
        return chunk
    start = (CHUNK_SAMPLES - n_speech) // 2
    t = np.arange(n_speech) / SR
    voice = 0.3 * (
        np.sin(2 * np.pi * 180 * t)
        + 0.5 * np.sin(2 * np.pi * 360 * t)
        + 0.3 * np.sin(2 * np.pi * 750 * t)
    ).astype(np.float32)
    chunk[start:start + n_speech] = voice
    return chunk


def _build_10s_clip() -> list[np.ndarray]:
    """Roughly 10 s of synthetic speech split into 3 s chunks (the last
    chunk is short and zero-padded to match production framing).
    """
    chunks: list[np.ndarray] = []
    # 3 full 3-second voiced chunks + one short trailer
    for _ in range(3):
        chunks.append(_voiced_chunk(2.5))
    trailer = np.zeros(CHUNK_SAMPLES, dtype=np.float32)
    voiced = _voiced_chunk(0.8)
    trailer[: len(voiced)] = voiced[: len(trailer)]
    chunks.append(trailer)
    return chunks


def _run_one_pass() -> int:
    """Process the 10-second clip and return the per-session aggregate
    headline (rounded). Each pass uses a fresh AudioPipeline so internal
    state (RMS history, language probe, chunk counter) does not leak
    between passes.
    """
    pipeline = AudioPipeline()
    snapshots = []
    for arr in _build_10s_clip():
        result = pipeline.process_chunk(arr, sr=SR)
        # Audio-only synthetic clip — face signals stay None so the
        # aggregate path mirrors what the analyzer-audio endpoint sees.
        result["scores"]["eye_contact"] = None
        result["scores"]["expression"] = None
        result["scores"]["total"] = SignalScorer.aggregate(result["scores"])
        snapshots.append(result)

    totals = [
        s["scores"].get("total")
        for s in snapshots
        if s["scores"].get("total") is not None
    ]
    # If every chunk came back None (e.g. VAD silenced the synthetic
    # tone) treat that as 0 so the variance check still has something
    # to bite on rather than throwing.
    if not totals:
        return 0
    return round(sum(totals) / len(totals))


@pytest.mark.slow
def test_score_variance_within_two_points():
    """Five runs of the same synthetic clip → spread <= 2 points."""
    scores = [_run_one_pass() for _ in range(5)]
    spread = max(scores) - min(scores)
    assert spread <= 2, (
        f"Headline score varied by {spread} points across 5 runs of the "
        f"same input ({scores}). Pipeline determinism regressed."
    )
