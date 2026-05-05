"""remap legacy emotion labels (calm/bored/monotone -> authoritative/disconnected/flat)

Revision ID: f4a9d3e1b8c2
Revises: c8a4d1f5e632
Create Date: 2026-05-06 00:00:00.000000

The emotion-detector LABELS tuple was changed:
    OLD: nervous, confident, excited, calm,    hesitant, monotone,
         engaged, bored,         angry, sad
    NEW: confident, nervous, engaged, disconnected, authoritative,
         hesitant, excited, flat,    sad, angry

Three labels were removed and three new ones added. Three columns on
`user_calibration_profiles` carry per-label data:
  - emotion_faces        — dict[label -> face_capture_dict]
  - emotion_mix_baseline — dict[label -> float weight (sums to 1.0)]
  - emotion_order        — list[str] of labels in shuffled order

This migration remaps the three legacy keys to their nearest new
equivalents on existing rows so calibrated users do not lose their
captured baseline:

    calm     -> authoritative   (a controlled, grounded face / tone)
    bored    -> disconnected    (face slack, low-energy tone)
    monotone -> flat            (uninflected delivery)

Idempotent: safe to re-run. If a row already has the new key, the
legacy weight is ADDED to it (and renormalized for emotion_mix_baseline);
the legacy face capture is DROPPED in favour of the new one (we
prefer the user's most recent intentional capture).

Downgrade is lossy: any data captured after the upgrade with the new
labels gets renamed to the old ones, since the model code expects
the old label set when running on the older revision.
"""
from __future__ import annotations

import json
from typing import Sequence, Union

# alembic + sqlalchemy are imported lazily inside `_apply` so the
# pure-Python remap helpers can be unit-tested in environments
# without alembic installed (the helpers don't touch the DB).


revision: str = 'f4a9d3e1b8c2'
down_revision: Union[str, Sequence[str], None] = 'c8a4d1f5e632'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Forward map (used in upgrade)
_FWD = {
    "calm": "authoritative",
    "bored": "disconnected",
    "monotone": "flat",
}

# Reverse map (used in downgrade)
_REV = {v: k for k, v in _FWD.items()}


def _remap_mix(mix, mapping):
    """Rename keys in a {label: float} dict, summing on collision.

    Renormalizes the resulting dict so values sum to 1.0 (within
    rounding). Returns a new dict; does not mutate the input.
    """
    if not isinstance(mix, dict) or not mix:
        return mix
    out: dict = {}
    for k, v in mix.items():
        new_k = mapping.get(k, k)
        try:
            fv = float(v)
        except (TypeError, ValueError):
            continue
        out[new_k] = out.get(new_k, 0.0) + fv
    s = sum(out.values())
    if s > 0:
        out = {k: round(v / s, 4) for k, v in out.items()}
    return out


def _remap_faces(faces, mapping):
    """Rename keys in a {label: face_capture_dict} dict.

    On collision (both old and new keys present in the source dict),
    prefer the NEW key's capture — it is the user's most recent
    intentional capture after recalibrating against the new label
    set. Returns a new dict; does not mutate the input.
    """
    if not isinstance(faces, dict) or not faces:
        return faces
    out: dict = {}
    # First pass: copy entries whose keys are not being renamed,
    # plus any new-key entries already present in the source.
    for k, v in faces.items():
        if k not in mapping:
            out[k] = v
    # Second pass: rename old keys to new ones, but only if the
    # new key is not already present (preserve recent capture).
    for old_k, new_k in mapping.items():
        if old_k in faces and new_k not in out:
            out[new_k] = faces[old_k]
    return out


def _remap_order(order, mapping):
    """Rename entries in a list[str] of label names. Drops duplicates
    that result from the rename (e.g. both 'calm' and 'authoritative'
    in the same list collapses to one 'authoritative')."""
    if not isinstance(order, list):
        return order
    seen: set = set()
    out: list = []
    for label in order:
        if not isinstance(label, str):
            continue
        new = mapping.get(label, label)
        if new in seen:
            continue
        seen.add(new)
        out.append(new)
    return out


def _apply(mapping):
    """Apply the rename across all three JSONB columns on every row."""
    from alembic import op
    import sqlalchemy as sa

    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, emotion_faces, emotion_mix_baseline, emotion_order "
        "FROM user_calibration_profiles"
    )).fetchall()

    updated = 0
    for row in rows:
        rid, faces, mix, order = row
        new_faces = _remap_faces(faces, mapping) if faces is not None else None
        new_mix = _remap_mix(mix, mapping) if mix is not None else None
        new_order = _remap_order(order, mapping) if order is not None else None

        # Skip if nothing changed.
        if new_faces == faces and new_mix == mix and new_order == order:
            continue

        bind.execute(
            sa.text(
                "UPDATE user_calibration_profiles SET "
                "emotion_faces = CAST(:f AS jsonb), "
                "emotion_mix_baseline = CAST(:m AS jsonb), "
                "emotion_order = CAST(:o AS jsonb) "
                "WHERE id = :id"
            ),
            {
                "id": rid,
                "f": json.dumps(new_faces) if new_faces is not None else None,
                "m": json.dumps(new_mix) if new_mix is not None else None,
                "o": json.dumps(new_order) if new_order is not None else None,
            },
        )
        updated += 1

    print(f"[migration] remapped legacy emotion labels on {updated} row(s).")


def upgrade() -> None:
    _apply(_FWD)


def downgrade() -> None:
    _apply(_REV)
