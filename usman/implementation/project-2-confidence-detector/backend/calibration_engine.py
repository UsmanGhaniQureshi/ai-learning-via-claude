"""
Calibration engine — personal-baseline matching for the face channel.

Provides:
  - `match_emotion_to_profile(frame_blendshapes, emotion_faces_profile)`
      Matches a single frame's blendshape vector against the user's
      stored per-emotion blendshape averages using cosine similarity.
      Returns the closest-matching emotion + raw similarities.

Why cosine, not Euclidean:
  - Different users activate facial muscles to different INTENSITIES
    even when expressing the same emotion. Euclidean distance is
    sensitive to magnitude — it would mark a "subtly happy" user as
    far from a "very happy" template even though the activated
    muscle pattern is identical.
  - Cosine similarity compares the DIRECTION of activation across
    the 52-dimensional blendshape vector and is scale-invariant.
    This is the right invariance for "did the same set of muscles
    fire?".

Vector ordering:
  Both the live frame's blendshapes and the stored profile use
  MediaPipe's standard 52 face blendshape category names as keys
  (`browInnerUp`, `eyeBlinkLeft`, etc.). The matcher takes the
  intersection of keys present in both, so a small schema drift
  (e.g. MediaPipe adds a category) doesn't crash the call —
  unmatched keys are simply skipped.

Pure Python + numpy. No new model downloads.
"""
from __future__ import annotations

import math
from typing import Iterable, Mapping

import numpy as np


def _blendshapes_to_vector(
    blendshapes: Mapping[str, float] | Iterable,
    keys: list[str],
) -> np.ndarray:
    """Project a blendshape dict (or list of `(name, score)` tuples /
    objects with `.category_name`/`.score`) onto the supplied key
    order. Missing keys default to 0.0.
    """
    if isinstance(blendshapes, Mapping):
        get = blendshapes.get
    else:
        # MediaPipe returns a list of objects with `category_name`
        # and `score` attributes. Normalise to dict-style access.
        d: dict[str, float] = {}
        for item in (blendshapes or []):
            name = getattr(item, "category_name", None) or (
                item[0] if isinstance(item, tuple) else None
            )
            score = getattr(item, "score", None)
            if score is None and isinstance(item, tuple) and len(item) > 1:
                score = item[1]
            if name is not None and score is not None:
                d[str(name)] = float(score)
        get = d.get

    vec = np.zeros(len(keys), dtype=np.float64)
    for i, k in enumerate(keys):
        v = get(k, 0.0)
        try:
            vec[i] = float(v)
        except (TypeError, ValueError):
            vec[i] = 0.0
    return vec


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity in [-1, 1]. Returns 0.0 on a zero vector to
    avoid NaN — a frame with all-zero blendshapes shouldn't push the
    matcher toward any emotion.
    """
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na <= 1e-9 or nb <= 1e-9:
        return 0.0
    sim = float(np.dot(a, b) / (na * nb))
    if math.isnan(sim) or math.isinf(sim):
        return 0.0
    return max(-1.0, min(1.0, sim))


def match_emotion_to_profile(
    frame_blendshapes,
    emotion_faces_profile: Mapping[str, Mapping] | None,
) -> dict:
    """Match a single frame's blendshapes against the user's stored
    per-emotion averages.

    Args:
        frame_blendshapes: list of MediaPipe blendshape category
            objects (each has `.category_name` and `.score`), or a
            dict {name: score}. Empty / None is allowed and produces
            a no-match result.
        emotion_faces_profile: the `emotion_faces` JSONB blob from
            `CalibrationProfile`. Keys are emotion labels; values are
            dicts with at least a `blendshapes_avg` sub-dict. Pass
            `None` (no calibration profile) to short-circuit.

    Returns:
        {
            "matched_emotion":  str | None,
            "similarity":       float in [-1, 1],
            "all_similarities": { emotion_label: float, ... },
        }

    `matched_emotion` is None when:
      - the profile is missing or empty,
      - the frame has no blendshapes,
      - every per-emotion similarity came back at exactly 0.0
        (degenerate input).
    """
    out: dict = {
        "matched_emotion": None,
        "similarity": 0.0,
        "all_similarities": {},
    }
    if not emotion_faces_profile:
        return out

    # Build a stable key list from the union of all keys present on
    # any emotion profile's `blendshapes_avg`. This becomes the axis
    # ordering for both the frame vector and each emotion vector.
    keys: list[str] = []
    seen: set[str] = set()
    for face in emotion_faces_profile.values():
        avg = (face or {}).get("blendshapes_avg") or {}
        for k in avg.keys():
            if k not in seen:
                seen.add(k)
                keys.append(k)
    if not keys:
        return out

    frame_vec = _blendshapes_to_vector(frame_blendshapes or [], keys)
    if not np.any(frame_vec):
        return out

    sims: dict[str, float] = {}
    best_label: str | None = None
    best_sim = -2.0
    for label, face in emotion_faces_profile.items():
        avg = (face or {}).get("blendshapes_avg") or {}
        if not avg:
            continue
        emo_vec = _blendshapes_to_vector(avg, keys)
        s = _cosine_similarity(frame_vec, emo_vec)
        sims[label] = round(s, 4)
        if s > best_sim:
            best_sim = s
            best_label = label

    out["all_similarities"] = sims
    if best_label is not None and best_sim > 0.0:
        out["matched_emotion"] = best_label
        out["similarity"] = round(best_sim, 4)
    return out


def average_blendshapes(per_frame_blendshapes: list) -> dict[str, float]:
    """Average a list of MediaPipe blendshape vectors into a single
    dict. Used by the emotion capture endpoint to collapse 5 fps × 10 s
    = 50 frames into one stored vector per emotion.

    Each input element is expected to be a list of MediaPipe
    blendshape objects (with `category_name` + `score`). Frames with
    no blendshapes are skipped.
    """
    accum: dict[str, list[float]] = {}
    for frame_bs in per_frame_blendshapes or []:
        if not frame_bs:
            continue
        for item in frame_bs:
            name = getattr(item, "category_name", None)
            score = getattr(item, "score", None)
            if name is None or score is None:
                continue
            accum.setdefault(name, []).append(float(score))
    if not accum:
        return {}
    return {k: round(sum(vs) / len(vs), 4) for k, vs in accum.items()}
