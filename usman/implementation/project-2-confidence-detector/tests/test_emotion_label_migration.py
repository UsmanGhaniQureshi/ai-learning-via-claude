"""Unit tests for the emotion-label remap migration helpers.

Tests the pure-Python remap logic in
backend/migrations/versions/f4a9d3e1b8c2_remap_legacy_emotion_labels.py
without needing a live database. The DB-binding code in `_apply()` is
exercised manually via `alembic upgrade head` against a real Postgres.
"""
from __future__ import annotations

import importlib.util
import os
import sys

# Load the migration module directly — its filename starts with a
# digit so we can't simply `import` it.
_MIG_PATH = os.path.normpath(os.path.join(
    os.path.dirname(__file__), "..",
    "backend", "migrations", "versions",
    "f4a9d3e1b8c2_remap_legacy_emotion_labels.py",
))
_spec = importlib.util.spec_from_file_location("emotion_remap_mig", _MIG_PATH)
_mig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mig)


_FWD = _mig._FWD
_REV = _mig._REV


def test_fwd_and_rev_are_inverse():
    for k, v in _FWD.items():
        assert _REV[v] == k
    assert set(_FWD.keys()) == {"calm", "bored", "monotone"}
    assert set(_FWD.values()) == {"authoritative", "disconnected", "flat"}
    print("[PASS] forward/reverse maps are inverse and cover the right labels.")


def test_remap_mix_simple_rename():
    legacy = {
        "nervous": 0.20, "confident": 0.30, "calm": 0.20,
        "bored": 0.10, "monotone": 0.10, "engaged": 0.10,
    }
    out = _mig._remap_mix(legacy, _FWD)
    assert "calm" not in out
    assert "bored" not in out
    assert "monotone" not in out
    assert "authoritative" in out
    assert "disconnected" in out
    assert "flat" in out
    assert abs(sum(out.values()) - 1.0) < 0.01
    # The 0.20 calm weight should land entirely on authoritative
    # (renormalisation preserves the relative weights).
    assert abs(out["authoritative"] - 0.20) < 0.01
    assert abs(out["disconnected"] - 0.10) < 0.01
    assert abs(out["flat"] - 0.10) < 0.01
    print("[PASS] simple rename remaps weights and keeps sum=1.0.")


def test_remap_mix_collision_sums_weights():
    """If both old AND new keys are present, weights ADD."""
    mixed = {
        "nervous": 0.20,
        "calm": 0.10,
        "authoritative": 0.05,  # already had a new label too
        "bored": 0.30,
        "engaged": 0.35,
    }
    out = _mig._remap_mix(mixed, _FWD)
    assert "calm" not in out
    # calm 0.10 + authoritative 0.05 = 0.15, then renormalise.
    # Total before renorm: 0.20 + 0.10 + 0.05 + 0.30 + 0.35 = 1.00
    # So renormalisation is a no-op here.
    assert abs(out["authoritative"] - 0.15) < 0.01
    assert abs(out["disconnected"] - 0.30) < 0.01
    assert abs(sum(out.values()) - 1.0) < 0.01
    print("[PASS] collision sums weights then renormalises.")


def test_remap_mix_handles_none_and_empty():
    assert _mig._remap_mix(None, _FWD) is None
    assert _mig._remap_mix({}, _FWD) == {}
    print("[PASS] remap_mix handles None and empty.")


def test_remap_mix_idempotent():
    legacy = {"calm": 0.5, "engaged": 0.5}
    once = _mig._remap_mix(legacy, _FWD)
    twice = _mig._remap_mix(once, _FWD)
    assert once == twice
    print("[PASS] remap_mix is idempotent.")


def test_remap_faces_simple_rename():
    legacy = {
        "calm": {"blendshapes_avg": {"a": 0.1}, "frames_used": 30},
        "confident": {"blendshapes_avg": {"b": 0.2}, "frames_used": 40},
    }
    out = _mig._remap_faces(legacy, _FWD)
    assert "calm" not in out
    assert "authoritative" in out
    assert out["authoritative"]["frames_used"] == 30
    assert "confident" in out  # unchanged
    print("[PASS] faces simple rename.")


def test_remap_faces_collision_keeps_new():
    """If both 'calm' and 'authoritative' exist, keep 'authoritative'
    (the user's most recent intentional capture)."""
    mixed = {
        "calm": {"frames_used": 10, "tag": "old"},
        "authoritative": {"frames_used": 30, "tag": "new"},
    }
    out = _mig._remap_faces(mixed, _FWD)
    assert "calm" not in out
    assert out["authoritative"]["tag"] == "new"
    assert out["authoritative"]["frames_used"] == 30
    print("[PASS] faces collision prefers the new-key capture.")


def test_remap_faces_handles_none():
    assert _mig._remap_faces(None, _FWD) is None
    assert _mig._remap_faces({}, _FWD) == {}
    print("[PASS] remap_faces handles None and empty.")


def test_remap_order_simple_rename():
    legacy = ["nervous", "calm", "engaged", "bored", "confident", "monotone"]
    out = _mig._remap_order(legacy, _FWD)
    assert "calm" not in out
    assert "bored" not in out
    assert "monotone" not in out
    assert "authoritative" in out
    assert "disconnected" in out
    assert "flat" in out
    # Order is preserved; calm sits at index 1 originally.
    assert out.index("authoritative") == 1
    print("[PASS] order rename preserves position.")


def test_remap_order_drops_duplicates():
    """If both 'calm' and 'authoritative' are in the order list,
    collapse to a single 'authoritative' (preserving first-seen)."""
    legacy = ["calm", "nervous", "authoritative", "engaged"]
    out = _mig._remap_order(legacy, _FWD)
    # First occurrence wins: "calm" -> "authoritative" at index 0.
    # The later "authoritative" at index 2 is dropped.
    assert out == ["authoritative", "nervous", "engaged"]
    print("[PASS] order drops duplicates after rename.")


def test_remap_order_handles_none():
    assert _mig._remap_order(None, _FWD) is None
    assert _mig._remap_order([], _FWD) == []
    print("[PASS] remap_order handles None and empty.")


def test_round_trip_lossless_when_only_legacy_keys():
    """Forward then reverse on pure-legacy data is lossless."""
    mix = {"calm": 0.4, "bored": 0.3, "monotone": 0.3}
    fwd = _mig._remap_mix(mix, _FWD)
    rev = _mig._remap_mix(fwd, _REV)
    # Within rounding (4 decimals).
    for k, v in mix.items():
        assert abs(rev.get(k, 0) - v) < 0.001, (
            f"round-trip lost data for {k}: {v} -> {rev.get(k)}"
        )
    print("[PASS] forward+reverse on pure-legacy data is lossless.")


if __name__ == "__main__":
    failures = 0
    tests = [
        test_fwd_and_rev_are_inverse,
        test_remap_mix_simple_rename,
        test_remap_mix_collision_sums_weights,
        test_remap_mix_handles_none_and_empty,
        test_remap_mix_idempotent,
        test_remap_faces_simple_rename,
        test_remap_faces_collision_keeps_new,
        test_remap_faces_handles_none,
        test_remap_order_simple_rename,
        test_remap_order_drops_duplicates,
        test_remap_order_handles_none,
        test_round_trip_lossless_when_only_legacy_keys,
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
