"""
10-label emotion-detector regression suite.

Verifies the post-relabel detector (calm/bored/monotone → authoritative/
disconnected/flat) under representative input shapes. The contract:

  1. LABELS tuple has exactly the 10 expected names, in the spec'd order.
  2. Every emit `mix` sums to 1.0 (within rounding) and has length 10.
  3. No one-hot collapse — softmax T=2.0 should keep dominant ≤ 80% on
     realistic inputs, runner-ups visible (≥ 5%).
  4. authoritative does NOT collapse into confident on a "controlled,
     declarative, audible, steady" sample.
  5. disconnected does NOT collapse into flat on a "low energy, slow,
     low pitch" sample.
  6. flat does NOT collapse into hesitant on a "neutral content, low
     pitch_std, normal RMS, normal WPM" sample.

Run from repo root:
    python -m tests.test_emotion_labels_10
or from backend/:
    python ../tests/test_emotion_labels_10.py
"""
from __future__ import annotations

import math
import os
import sys

# Allow running either as a module (python -m tests....) or as a script
# (python tests/test_emotion_labels_10.py) — add the backend dir to
# sys.path so `from emotion_detector import ...` works.
_BACKEND = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "backend")
)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from emotion_detector import LABELS, detect_emotion_mix, aggregate_emotion_mixes


EXPECTED_LABELS = (
    "confident", "nervous", "engaged", "disconnected", "authoritative",
    "hesitant", "excited", "flat", "sad", "angry",
)


def _words(text: str) -> list[dict]:
    """Build a faux per-word list shaped like Whisper output."""
    return [{"word": w, "start": i * 0.3, "end": i * 0.3 + 0.25}
            for i, w in enumerate(text.split())]


def _assert_mix_sums_to_one(out, label: str):
    mix = out["mix"]
    assert mix is not None, f"[{label}] mix is None"
    s = sum(mix.values())
    assert abs(s - 1.0) < 0.01, f"[{label}] mix sums to {s}, expected 1.0"
    assert set(mix.keys()) == set(LABELS), (
        f"[{label}] mix keys {set(mix.keys())} != LABELS {set(LABELS)}"
    )


def _assert_no_one_hot(out, label: str, dominant_max: float = 0.80):
    mix = out["mix"]
    top = max(mix.values())
    assert top <= dominant_max, (
        f"[{label}] dominant collapsed to {top:.2f}, expected <= {dominant_max}"
    )
    runner_up = sorted(mix.values(), reverse=True)[1]
    assert runner_up >= 0.03, (
        f"[{label}] runner-up too small ({runner_up:.3f}) -- softmax flattened poorly"
    )


def test_labels_tuple():
    assert LABELS == EXPECTED_LABELS, (
        f"LABELS mismatch:\n  got {LABELS}\n  want {EXPECTED_LABELS}"
    )
    assert len(LABELS) == 10
    # Old labels gone
    for old in ("calm", "bored", "monotone"):
        assert old not in LABELS, f"old label {old!r} still in LABELS"
    # New labels present
    for new in ("authoritative", "disconnected", "flat"):
        assert new in LABELS, f"new label {new!r} missing from LABELS"
    print("[PASS] LABELS tuple matches spec.")


def test_authoritative_dominant_not_confident():
    """Authoritative profile: declarative, audible, steady, WPM in band."""
    out = detect_emotion_mix(
        words=_words(
            "we will deliver this on time we are absolutely committed "
            "the answer is yes and the path is clear we will make it happen"
        ),
        pitch={"mean_hz": 165.0, "std_hz": 18.0, "tremor_score": 0.05},
        rms=0.06,
        rms_std=0.012,
        voiced_s=2.5,
        wpm=135.0,
        lexical_filler_count=0,
        acoustic_filler_count=0,
        word_count=22,
        trembling={"jitter_pct": 0.4, "shimmer_pct": 1.2, "instability": 0.05},
    )
    _assert_mix_sums_to_one(out, "authoritative")
    _assert_no_one_hot(out, "authoritative")
    dom = out["dominant"]
    auth = out["mix"]["authoritative"]
    conf = out["mix"]["confident"]
    assert auth > conf, (
        f"authoritative ({auth:.3f}) should outrank confident ({conf:.3f}) "
        f"on a declarative/audible/steady sample. dominant={dom}, mix={out['mix']}"
    )
    assert dom == "authoritative", (
        f"authoritative profile should dominate, got {dom}: {out['mix']}"
    )
    print(f"[PASS] authoritative wins ({auth:.3f}) over confident ({conf:.3f}).")


def test_disconnected_dominant_not_flat():
    """Disconnected profile: low pitch + LOW RMS + slow WPM."""
    out = detect_emotion_mix(
        words=_words("yeah so um i guess things are basically whatever"),
        pitch={"mean_hz": 130.0, "std_hz": 6.0, "tremor_score": 0.05},
        rms=0.014,           # quiet — gates disconnected
        rms_std=0.005,
        voiced_s=2.5,
        wpm=85.0,            # slow — gates disconnected
        lexical_filler_count=2,
        acoustic_filler_count=1,
        word_count=9,
        trembling={"jitter_pct": 0.3, "shimmer_pct": 1.0, "instability": 0.03},
    )
    _assert_mix_sums_to_one(out, "disconnected")
    _assert_no_one_hot(out, "disconnected")
    dom = out["dominant"]
    disc = out["mix"]["disconnected"]
    fl = out["mix"]["flat"]
    assert disc > fl, (
        f"disconnected ({disc:.3f}) should outrank flat ({fl:.3f}) when "
        f"both gates fire. dominant={dom}, mix={out['mix']}"
    )
    assert dom == "disconnected", (
        f"disconnected profile should dominate, got {dom}: {out['mix']}"
    )
    print(f"[PASS] disconnected wins ({disc:.3f}) over flat ({fl:.3f}).")


def test_flat_dominant_not_hesitant():
    """Flat profile: neutral content, low pitch_std, normal RMS, normal WPM."""
    out = detect_emotion_mix(
        words=_words(
            "the meeting will start at three the room is on the second "
            "floor please bring the printed agenda"
        ),
        pitch={"mean_hz": 145.0, "std_hz": 6.0, "tremor_score": 0.05},
        rms=0.05,            # NORMAL — flat allows medium RMS
        rms_std=0.008,
        voiced_s=2.5,
        wpm=140.0,           # NORMAL — flat allows normal WPM
        lexical_filler_count=0,
        acoustic_filler_count=0,
        word_count=18,
        trembling={"jitter_pct": 0.4, "shimmer_pct": 1.2, "instability": 0.05},
    )
    _assert_mix_sums_to_one(out, "flat")
    _assert_no_one_hot(out, "flat")
    dom = out["dominant"]
    flat_w = out["mix"]["flat"]
    hes = out["mix"]["hesitant"]
    assert flat_w > hes, (
        f"flat ({flat_w:.3f}) should outrank hesitant ({hes:.3f}) on a "
        f"neutral/low-pitch_std/normal-RMS/normal-WPM sample. "
        f"dominant={dom}, mix={out['mix']}"
    )
    # Disconnected must NOT win — RMS and WPM are normal.
    disc = out["mix"]["disconnected"]
    assert flat_w > disc, (
        f"flat ({flat_w:.3f}) should outrank disconnected ({disc:.3f}) when "
        f"RMS/WPM are normal. dominant={dom}, mix={out['mix']}"
    )
    print(f"[PASS] flat wins ({flat_w:.3f}) over hesitant ({hes:.3f}) and "
          f"disconnected ({disc:.3f}).")


def test_disconnected_does_not_fire_when_loud():
    """Loud + flat-pitch should be FLAT, not DISCONNECTED."""
    out = detect_emotion_mix(
        words=_words("the report is finished the data is clean we shipped"),
        pitch={"mean_hz": 145.0, "std_hz": 6.0, "tremor_score": 0.05},
        rms=0.07,            # AUDIBLE — disconnected gate should NOT fire
        rms_std=0.015,
        voiced_s=2.5,
        wpm=85.0,            # slow alone is not enough
        lexical_filler_count=0,
        acoustic_filler_count=0,
        word_count=10,
        trembling={"jitter_pct": 0.4, "shimmer_pct": 1.2, "instability": 0.05},
    )
    _assert_mix_sums_to_one(out, "loud-flat")
    flat_w = out["mix"]["flat"]
    disc = out["mix"]["disconnected"]
    assert flat_w > disc, (
        f"loud + flat-pitch should read flat ({flat_w:.3f}) not "
        f"disconnected ({disc:.3f}). mix={out['mix']}"
    )
    print(f"[PASS] loud + flat-pitch reads flat ({flat_w:.3f}) > "
          f"disconnected ({disc:.3f}).")


def test_authoritative_blocked_by_high_fillers():
    """Same prosody as authoritative test, but stuffed with fillers."""
    out = detect_emotion_mix(
        words=_words(
            "um so we will uh deliver this um on time we are uh absolutely "
            "um committed um the answer is um yes"
        ),
        pitch={"mean_hz": 165.0, "std_hz": 18.0, "tremor_score": 0.05},
        rms=0.06,
        rms_std=0.012,
        voiced_s=2.5,
        wpm=135.0,
        lexical_filler_count=6,
        acoustic_filler_count=4,    # high filler rate ~50/100 words
        word_count=20,
        trembling={"jitter_pct": 0.4, "shimmer_pct": 1.2, "instability": 0.05},
    )
    _assert_mix_sums_to_one(out, "authoritative-blocked")
    auth = out["mix"]["authoritative"]
    # Authoritative should not dominate — high filler rate breaks the gate.
    assert out["dominant"] != "authoritative", (
        f"high-filler sample should NOT read authoritative; got "
        f"dominant={out['dominant']}, auth={auth:.3f}"
    )
    print(f"[PASS] high-filler authoritative-shaped prosody does not read "
          f"authoritative (auth={auth:.3f}, dominant={out['dominant']}).")


def test_no_one_hot_on_balanced_input():
    """Mixed signals — should produce a real distribution, not 95/5/0..."""
    out = detect_emotion_mix(
        words=_words("we will probably look at this and consider what to do"),
        pitch={"mean_hz": 175.0, "std_hz": 22.0, "tremor_score": 0.10},
        rms=0.05,
        rms_std=0.018,
        voiced_s=3.0,
        wpm=130.0,
        lexical_filler_count=1,
        acoustic_filler_count=0,
        word_count=12,
        trembling={"jitter_pct": 0.5, "shimmer_pct": 1.5, "instability": 0.10},
    )
    _assert_mix_sums_to_one(out, "balanced")
    _assert_no_one_hot(out, "balanced", dominant_max=0.65)
    # At least 4 labels should have ≥ 3% mass (no collapse to a tiny set)
    nonzero = sum(1 for v in out["mix"].values() if v >= 0.03)
    assert nonzero >= 4, (
        f"balanced input collapsed to {nonzero} visible labels; "
        f"expected ≥ 4. mix={out['mix']}"
    )
    print(f"[PASS] balanced input keeps {nonzero} labels visible "
          f"(top={max(out['mix'].values()):.3f}).")


def test_silent_chunk_returns_none():
    out = detect_emotion_mix(
        words=None,
        pitch=None,
        rms=0.0,
        rms_std=0.0,
        voiced_s=0.0,
        wpm=0.0,
        lexical_filler_count=0,
        acoustic_filler_count=0,
        word_count=0,
    )
    assert out["mix"] is None
    assert out["dominant"] is None
    print("[PASS] silent chunk returns mix=None.")


def test_aggregate_session_mix_sums_to_one():
    """Aggregating multiple per-chunk mixes still sums to 1.0."""
    chunks = []
    for _ in range(5):
        out = detect_emotion_mix(
            words=_words("we will deliver this on time"),
            pitch={"mean_hz": 165.0, "std_hz": 18.0, "tremor_score": 0.05},
            rms=0.06, rms_std=0.012, voiced_s=2.5, wpm=135.0,
            lexical_filler_count=0, acoustic_filler_count=0, word_count=6,
            trembling={"jitter_pct": 0.4, "shimmer_pct": 1.2, "instability": 0.05},
        )
        chunks.append(out)
    agg = aggregate_emotion_mixes(chunks)
    s = sum(agg["mix"].values())
    assert abs(s - 1.0) < 0.01, f"session mix sums to {s}"
    assert agg["dominant"] == "authoritative", (
        f"session-level: expected authoritative, got {agg['dominant']}: {agg['mix']}"
    )
    print(f"[PASS] session aggregate sums to {s:.3f}, dominant={agg['dominant']}.")


def test_aggregate_drops_legacy_labels():
    """Old-schema mixes carrying calm/bored/monotone keys must be
    silently dropped (the new LABELS doesn't include them)."""
    legacy = {
        "mix": {
            "nervous": 0.20, "confident": 0.20, "calm": 0.30,
            "bored": 0.10, "monotone": 0.10, "engaged": 0.10,
        },
    }
    fresh = {
        "mix": {k: 0.10 for k in LABELS},  # equal mass
    }
    agg = aggregate_emotion_mixes([legacy, fresh])
    s = sum(agg["mix"].values())
    assert abs(s - 1.0) < 0.01
    # Legacy keys must not appear in the output mix.
    assert all(k in LABELS for k in agg["mix"].keys())
    print(f"[PASS] legacy mix keys dropped; aggregate sums to {s:.3f}.")


if __name__ == "__main__":
    failures = 0
    tests = [
        test_labels_tuple,
        test_authoritative_dominant_not_confident,
        test_disconnected_dominant_not_flat,
        test_flat_dominant_not_hesitant,
        test_disconnected_does_not_fire_when_loud,
        test_authoritative_blocked_by_high_fillers,
        test_no_one_hot_on_balanced_input,
        test_silent_chunk_returns_none,
        test_aggregate_session_mix_sums_to_one,
        test_aggregate_drops_legacy_labels,
    ]
    for t in tests:
        try:
            t()
        except AssertionError as e:
            failures += 1
            print(f"[FAIL] {t.__name__}: {e}")
        except Exception as e:
            failures += 1
            print(f"[ERROR] {t.__name__}: {type(e).__name__}: {e}")
    if failures:
        print(f"\n{failures} test(s) failed.")
        sys.exit(1)
    print(f"\nAll {len(tests)} tests passed.")
