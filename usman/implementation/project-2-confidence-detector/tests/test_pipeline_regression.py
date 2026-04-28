"""End-to-end regression test for the audio pipeline.

Loads `tests/fixtures/sample_30s.wav` (real speech, deterministic),
chunks it the same way the live + analyzer paths do, runs every chunk
through `AudioPipeline.process_chunk`, then aggregates via
`generate_post_session_report` and asserts the resulting
`signal_averages` stay within ±5 absolute points of a baseline JSON.

First run on a fresh checkout: writes the baseline file (and prints a
note so the developer knows what happened).
Subsequent runs: compare and fail loudly if any signal drifts by more
than the tolerance.

Why this exists: the audio pipeline ties together VAD, PYIN, Whisper,
acoustic-filler detection, and the SignalScorer. Many of the audit's
prior "silent regressions" (180-WPM cliff, silent-chunk averaging,
filler-set scope) only surfaced through manual upload tests. A single
green fixture catches whole classes of those before they ship.

Tolerance is ±5 (not ±0) because PYIN and Whisper carry small
numerical jitter across hardware. The point is to detect signal-level
drift, not bit-perfect equality.
"""
from __future__ import annotations

import json
import wave
from pathlib import Path

import numpy as np
import pytest

# tests/conftest.py already added backend/ to sys.path.
from audio_pipeline import AudioPipeline  # noqa: E402
from report_generator import generate_post_session_report  # noqa: E402


FIXTURE = Path(__file__).parent / "fixtures" / "sample_30s.wav"
BASELINE = Path(__file__).parent / "fixtures" / "sample_30s_baseline.json"

# Per-signal max absolute drift before failing.
TOLERANCE = 5

# These are the keys we lock down. eye_contact + expression are
# face-dependent; on an audio-only fixture they default to 50 and
# carry no real signal, so we exclude them from the regression.
TRACKED_SIGNALS = (
    "voice_steadiness",
    "speech_pace",
    "filler_words",
    "vocal_variety",
)


def _load_wav_float32(path: Path) -> tuple[np.ndarray, int]:
    """Load a 16-bit PCM mono WAV as float32 in [-1, 1]. Matches the
    shape AudioPipeline expects (same path the streaming ffmpeg pipe
    in main.py produces)."""
    with wave.open(str(path), "rb") as w:
        n_channels = w.getnchannels()
        sample_width = w.getsampwidth()
        sr = w.getframerate()
        frames = w.readframes(w.getnframes())

    assert n_channels == 1, f"fixture must be mono, got {n_channels} channels"
    assert sample_width == 2, f"fixture must be 16-bit PCM, got {sample_width*8}-bit"
    assert sr == 16000, f"fixture must be 16 kHz, got {sr} Hz"

    audio_int16 = np.frombuffer(frames, dtype=np.int16)
    audio_f32 = audio_int16.astype(np.float32) / 32768.0
    return audio_f32, sr


def _run_pipeline_on_fixture() -> dict:
    """Run the full pipeline on the fixture and return the report."""
    assert FIXTURE.exists(), (
        f"Fixture missing: {FIXTURE}. The repo should ship a 30-s "
        "deterministic clean-speech WAV here."
    )
    audio, sr = _load_wav_float32(FIXTURE)
    chunk_samples = sr * 3
    pipeline = AudioPipeline()
    snapshots: list[dict] = []

    # Same chunking convention as main.py's streaming handler. Final
    # partial chunk is zero-padded; AudioPipeline's gates discard
    # padded silence so the score isn't biased.
    for i in range(0, len(audio), chunk_samples):
        chunk = audio[i:i + chunk_samples]
        if len(chunk) < chunk_samples:
            chunk = np.pad(chunk, (0, chunk_samples - len(chunk)))
        snapshots.append(pipeline.process_chunk(chunk, sr=sr))

    report = generate_post_session_report(snapshots, "regression-test")
    return report


def test_audio_pipeline_signals_within_tolerance():
    report = _run_pipeline_on_fixture()
    sig = report["signal_averages"]

    # Bootstrap mode — first run on a fresh checkout writes the
    # baseline. We still assert the report SHAPE so a later schema
    # break doesn't slip through unnoticed.
    if not BASELINE.exists():
        for k in TRACKED_SIGNALS:
            assert k in sig, f"signal {k!r} missing from report — schema drift?"
            assert isinstance(sig[k], (int, float)), (
                f"signal {k!r} value is {type(sig[k]).__name__}, expected int/float"
            )
        # Persist only the tracked signals (and the avg total for sanity).
        baseline_payload = {
            **{k: sig[k] for k in TRACKED_SIGNALS},
            "_avg_score": report.get("avg_score"),
            "_note": (
                "Regression baseline. Re-generate with `make test` after "
                "a deliberate algorithmic change; otherwise edits here "
                "are bugs."
            ),
        }
        BASELINE.write_text(json.dumps(baseline_payload, indent=2))
        pytest.skip(
            f"Wrote initial baseline to {BASELINE.name}. Re-run the "
            "test to verify it passes against itself."
        )

    baseline = json.loads(BASELINE.read_text())
    drifts = {}
    for k in TRACKED_SIGNALS:
        actual = sig[k]
        expected = baseline[k]
        delta = abs(actual - expected)
        drifts[k] = (actual, expected, delta)

    failures = [
        f"  {k}: {actual} vs baseline {expected} (Δ={delta}) > tolerance ±{TOLERANCE}"
        for k, (actual, expected, delta) in drifts.items()
        if delta > TOLERANCE
    ]
    if failures:
        pytest.fail(
            "Audio pipeline signal regression detected. To accept the new "
            "values as the baseline, delete tests/fixtures/sample_30s_baseline.json "
            "and re-run.\n\n" + "\n".join(failures)
        )
