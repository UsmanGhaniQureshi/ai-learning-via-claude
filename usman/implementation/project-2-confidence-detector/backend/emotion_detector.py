"""
Emotion Detector — multi-label, weighted speaker-emotion scoring.

Combines LEXICAL signals (transcript words: fillers, hedges, assertives,
repetitions, exclamations) with PROSODIC signals (pitch mean/std,
energy, speech rate, voice tremor / jitter / shimmer) to produce a
weighted probability distribution over a fixed label set:

    nervous, confident, excited, calm, hesitant, monotone

Key design decisions
--------------------
1. NEVER binary. We compute raw "evidence" scores per label, then
   softmax-normalize so the result is always a probability mix that
   sums to 1.0.
2. Lexical and prosodic signals contribute INDEPENDENTLY to each label
   — both must be available for a high-confidence reading. A
   transcript-only or audio-only path produces a softer mix.
3. The thresholds are calibrated against empirical anchors from the
   audio_pipeline (pitch SD ~30 = expressive, tremor 0.0-1.0, WPM
   peak 150). They are NOT learned — this is a rule-based mixer, not
   a classifier. Treat the percentages as relative weights, not
   ground truth.

The output is consumed by `report_generator.py` (session-level mix),
the live WS broadcaster (per-chunk mix), and the frontend
SignalBars / EmotionMix card.
"""
from __future__ import annotations

import math
import re
from collections import Counter


# Hedging / uncertainty phrases — increase nervous + hesitant.
HEDGE_PHRASES = {
    "maybe", "perhaps", "possibly", "might", "i guess", "i think",
    "sort of", "kind of", "kinda", "sorta", "i suppose",
    "not sure", "i'm not sure", "im not sure",
    "probably", "i mean", "you know", "if that makes sense",
    "or something", "or whatever",
}

# Assertive / committed phrases — increase confident.
ASSERTIVE_PHRASES = {
    "definitely", "absolutely", "clearly", "certain", "certainly",
    "obviously", "for sure", "without doubt", "no doubt",
    "i know", "we know", "i'm confident", "im confident",
    "exactly", "precisely",
}

# High-arousal words / intensifiers — increase excited.
EXCITED_TOKENS = {
    "amazing", "awesome", "incredible", "fantastic", "love",
    "thrilled", "excited", "wow", "great", "huge", "massive",
    "super", "really", "so",  # bare intensifiers count weakly
}

# Calm-marker phrases — slow, deliberate language.
CALM_TOKENS = {
    "consider", "notice", "observe", "let's", "first", "next",
    "then", "finally", "in summary", "remember",
}

# Angry / heated tokens — sharp negatives, intensifiers, dismissals.
# Intentional overlap with HEDGE_PHRASES is avoided ("don't" is here,
# not in HEDGE_PHRASES) but overlap with negation is fine — the
# prosody (loud + raised pitch + fast WPM) carries most of the angry
# signal. Lexicon is kept small and obvious; aggressive expansion
# would false-positive on neutral negation ("we don't have time today").
ANGRY_TOKENS = {
    "never", "wrong", "stop", "ridiculous", "terrible", "awful",
    "hate", "stupid", "no way", "don't", "can't believe",
    "absolutely not", "outrageous", "unacceptable",
}

# Sad / subdued tokens. Includes regret-coded phrases the speaker
# uses when delivery is downbeat. Multi-word entries match with word
# boundaries via _count_phrase_hits.
SAD_TOKENS = {
    "unfortunately", "sorry", "miss", "lost", "regret", "wish",
    "hard", "difficult", "i'm sorry", "i feel", "sadly",
    "we lost", "i lost",
}

# Engaged tokens — audience-direct verbs that cue connection.
# Some entries (`consider`, `notice`, `let's`) intentionally overlap
# with CALM_TOKENS; calm and engaged speakers cue the audience the
# same way and the prosody (variety + energy variation) splits them.
ENGAGED_TOKENS = {
    "imagine", "picture", "look", "ask yourself", "consider",
    "notice", "let me show", "let's", "think about", "watch",
    "here's the thing",
}

LABELS = (
    "nervous", "confident", "excited", "calm", "hesitant", "monotone",
    "engaged", "bored", "angry", "sad",
)


def _join_words(words: list[dict]) -> str:
    return " ".join((w.get("word") or "").lower() for w in words or [])


def _count_phrase_hits(text: str, phrases: set[str]) -> int:
    if not text:
        return 0
    hits = 0
    for p in phrases:
        if " " in p:
            # multi-word phrase: substring match with word boundaries
            if re.search(rf"\b{re.escape(p)}\b", text):
                hits += 1
        else:
            # single-word: boundary match
            hits += len(re.findall(rf"\b{re.escape(p)}\b", text))
    return hits


def _repetition_rate(words: list[dict]) -> float:
    """Fraction of consecutive duplicate tokens or repeated bigrams.

    Nervous / hesitant speakers loop on the same phrase ("the the",
    "we need to we need to") far more than confident ones. The metric
    is normalized to total token count so it doesn't track length.
    """
    toks = [(w.get("word") or "").lower() for w in words or []]
    toks = [t for t in toks if t]
    if len(toks) < 2:
        return 0.0
    # consecutive duplicates
    dup = sum(1 for i in range(1, len(toks)) if toks[i] == toks[i - 1])
    # repeated bigrams (ngram count > 1)
    bigrams = list(zip(toks, toks[1:]))
    bigram_counts = Counter(bigrams)
    repeated_bigrams = sum(c - 1 for c in bigram_counts.values() if c > 1)
    return float(dup + repeated_bigrams) / float(len(toks))


def _pitch_arousal(pitch_mean_hz: float) -> float:
    """Map pitch mean to a 0-1 arousal index.

    Speakers don't share an absolute neutral pitch, so this is a
    coarse one-size mapping centred at 175 Hz. Above 230 Hz is the
    "voice raised under stress" zone, below 130 Hz is "deliberate /
    grounded delivery". Output is clamped to [0, 1].
    """
    if pitch_mean_hz <= 0:
        return 0.0
    # Logistic centred at 200 Hz with k=0.03 → 130:0.1, 175:0.3, 230:0.7
    return 1.0 / (1.0 + math.exp(-0.04 * (pitch_mean_hz - 200.0)))


def _wpm_arousal(wpm: float) -> float:
    """0-1 arousal index from speech rate. Peaks above 200 WPM."""
    if wpm <= 0:
        return 0.0
    # Linear ramp: 100 WPM → 0.0, 200 WPM → 0.7, 250+ → 1.0
    return max(0.0, min(1.0, (wpm - 100.0) / 150.0))


def _softmax(scores: dict[str, float], temperature: float = 2.5) -> dict[str, float]:
    """Numerically stable softmax with temperature.

    Higher temperature softens the distribution so runner-up emotions
    keep visible mass. With T=2.5 a strong "nervous" signal still
    lands around 50-65% with the next strongest emotion at 15-25% and
    a long tail summing to ~15%, matching the spec example
    "60% nervous, 30% confident, 10% excited".
    """
    if not scores:
        return {}
    max_v = max(scores.values())
    exps = {k: math.exp((v - max_v) / max(temperature, 1e-3)) for k, v in scores.items()}
    s = sum(exps.values()) or 1.0
    return {k: v / s for k, v in exps.items()}


def detect_emotion_mix(
    *,
    words: list[dict] | None,
    pitch: dict | None,
    rms: float,
    rms_std: float,
    voiced_s: float,
    wpm: float,
    lexical_filler_count: int,
    acoustic_filler_count: int,
    word_count: int,
    trembling: dict | None = None,
) -> dict:
    """Return a weighted multi-label emotion result.

    Output shape:
        {
          "mix": {"nervous": 0.55, "confident": 0.20, ...},  # sums to 1.0
          "dominant": "nervous",
          "dominant_pct": 55,
          "evidence": {                       # diagnostic — what fed which label
              "lexical": {...}, "prosodic": {...}
          },
          "available_signals": ["lexical", "prosodic"]
              # absent when transcript empty / silent chunk
        }

    Returns ``{"mix": None, ...}`` when neither modality has enough
    data (silent chunk + no transcript).

    Parameters intentionally use keyword-only style — every caller
    passes a dozen pieces of context and positional ordering would be
    error-prone.
    """
    # Both modalities can be missing. We track which we used so the
    # caller can disclose "audio-only" or "transcript-only" mixes.
    has_lex = bool(words) and word_count > 0
    has_prosody = voiced_s >= 0.5

    # Hard floor: silent chunk with no transcript → no emotion data.
    if not has_lex and not has_prosody:
        return {
            "mix": None,
            "dominant": None,
            "dominant_pct": None,
            "evidence": {},
            "available_signals": [],
        }

    pitch = pitch or {}
    pitch_mean = float(pitch.get("mean_hz") or 0.0)
    pitch_std = float(pitch.get("std_hz") or 0.0)
    tremor = float(pitch.get("tremor_score") or 0.0)

    # Trembling jitter/shimmer feed nervous strongly when available.
    jitter = float((trembling or {}).get("jitter_pct") or 0.0)   # %
    shimmer = float((trembling or {}).get("shimmer_pct") or 0.0)  # %
    instability = float((trembling or {}).get("instability") or 0.0)  # 0-1

    # ── Lexical evidence ───────────────────────────────────────────
    text = _join_words(words or [])
    hedge_hits = _count_phrase_hits(text, HEDGE_PHRASES)
    assert_hits = _count_phrase_hits(text, ASSERTIVE_PHRASES)
    excite_hits = _count_phrase_hits(text, EXCITED_TOKENS)
    calm_hits = _count_phrase_hits(text, CALM_TOKENS)
    angry_hits = _count_phrase_hits(text, ANGRY_TOKENS)
    sad_hits = _count_phrase_hits(text, SAD_TOKENS)
    engaged_hits = _count_phrase_hits(text, ENGAGED_TOKENS)
    repetition = _repetition_rate(words or [])

    # Filler rate per 100 real words. Caller supplies the dedup-aware
    # counts so we don't double-count overlapping lexical+acoustic
    # detections.
    filler_rate = 0.0
    if word_count > 0:
        filler_rate = (lexical_filler_count + acoustic_filler_count) / word_count * 100

    # Hedge / assertive density (per 100 words) — same denominator as
    # filler_rate so the magnitudes are comparable.
    denom_words = max(word_count, 1)
    hedge_density = hedge_hits / denom_words * 100
    assert_density = assert_hits / denom_words * 100
    excite_density = excite_hits / denom_words * 100
    calm_density = calm_hits / denom_words * 100
    angry_density = angry_hits / denom_words * 100
    sad_density = sad_hits / denom_words * 100
    engaged_density = engaged_hits / denom_words * 100

    # ── Prosodic evidence ──────────────────────────────────────────
    pitch_arousal = _pitch_arousal(pitch_mean)
    wpm_arousal = _wpm_arousal(wpm)
    # Vocal variety score from pitch SD: monotone <5, natural 15-50,
    # animated 50+. Map to 0-1 where >50 is animated.
    variety = max(0.0, min(1.0, (pitch_std - 5.0) / 50.0))

    # ── Per-label evidence aggregation ─────────────────────────────
    # Each label gets a raw score in arbitrary units; softmax fixes the
    # scale. Coefficients were tuned by hand against sample sessions —
    # see the docstring for the calibration story.

    nervous = 0.0
    confident = 0.0
    excited = 0.0
    calm = 0.0
    hesitant = 0.0
    monotone = 0.0
    engaged = 0.0
    bored = 0.0
    angry = 0.0
    sad = 0.0

    # --- Lexical contribution ---
    if has_lex:
        # Fillers are the strongest single nervous/hesitant signal.
        nervous += min(filler_rate, 20.0) * 0.10        # up to +2
        hesitant += min(filler_rate, 20.0) * 0.16       # up to +3.2
        # Hedges → uncertain → hesitant + nervous. Hedge phrases tip
        # the result toward hesitant more than nervous because the
        # nervous bias is already carried by prosody (tremor /
        # jitter / shimmer).
        hesitant += min(hedge_density, 15.0) * 0.25     # up to +3.75
        nervous += min(hedge_density, 15.0) * 0.10      # up to +1.5
        # Assertives → confident.
        confident += min(assert_density, 15.0) * 0.20   # up to +3.0
        # Excited tokens → excited.
        excited += min(excite_density, 15.0) * 0.18
        # Calm tokens → calm.
        calm += min(calm_density, 15.0) * 0.18
        # Repetition is loop-on-same-phrase nervousness.
        nervous += min(repetition, 0.20) * 12.0         # up to +2.4
        hesitant += min(repetition, 0.20) * 8.0
        # Confidence baseline boost when speaking with low fillers AND
        # no hedging — "well-spoken" stretches deserve credit. Gated
        # on pitch_std > 10 so a monotone reader doesn't read as
        # "confident" just because they're not stumbling over their
        # words; a flat-pitch delivery is monotone, not confident.
        if (
            filler_rate < 3 and hedge_density < 2 and word_count >= 3
            and pitch_std > 10
        ):
            confident += 1.5
            calm += 0.6

        # New-label lexical contributions (engaged / angry / sad).
        # `bored` is intentionally prosody-only — its lexicon overlaps
        # too much with calm / monotone to add anything useful.
        engaged += min(engaged_density, 15.0) * 0.18
        angry += min(angry_density, 15.0) * 0.20
        angry += min(repetition, 0.20) * 6.0   # stress repetition
        sad += min(sad_density, 15.0) * 0.20
        sad += min(hedge_density, 15.0) * 0.06  # hedging often reads as dejected

    # --- Prosodic contribution ---
    if has_prosody:
        # Tremor / jitter / shimmer all push nervous.
        nervous += tremor * 4.0
        nervous += min(jitter, 4.0) * 0.5
        nervous += min(shimmer, 12.0) * 0.18
        nervous += instability * 2.0

        # Raised pitch under stress → nervous. Pitch arousal rolls in
        # against the speaker's natural baseline; we don't have one
        # per-speaker so this is a coarse global mapping.
        nervous += pitch_arousal * 1.3

        # Fast WPM with high arousal → excited.
        excited += wpm_arousal * 2.0
        excited += variety * 1.4
        # Loud + varied energy → excited.
        excited += min(rms, 0.10) * 8.0
        excited += min(rms_std, 0.05) * 12.0

        # Steady pitch + moderate WPM + low tremor → confident.
        steadiness = max(0.0, 1.0 - tremor - min(instability, 1.0) * 0.5)
        wpm_centeredness = max(0.0, 1.0 - abs(wpm - 145.0) / 70.0)
        confident += steadiness * 1.6
        confident += wpm_centeredness * 1.5
        # Solid voice with reasonable variety adds confidence.
        if 12.0 <= pitch_std <= 60.0 and tremor < 0.25:
            confident += 1.0

        # Calm = low tremor + low arousal + moderate steady volume.
        # Gated on pitch_std > 8: a flat-pitch delivery is monotone,
        # not calm — calm reads as "controlled, varied a bit, slow"
        # not "deadpan". Without this gate the (1-pitch_arousal) term
        # dominated on any low-pitch sample and out-scored monotone.
        if pitch_std > 8:
            calm += (1.0 - pitch_arousal) * 1.2
            calm += (1.0 - wpm_arousal) * 1.0
            calm += (1.0 - tremor) * 0.9

        # Monotone = very low pitch SD AND/OR low RMS variation.
        # Pitch coefficient bumped 0.25 → 0.40 so a clearly flat
        # delivery (pitch_std ≤ 5) decisively reads as monotone
        # rather than tying with calm/sad.
        if pitch_std < 12.0:
            monotone += (12.0 - pitch_std) * 0.40
        if rms_std < 0.012:
            monotone += (0.012 - rms_std) * 80.0
        # Penalise excited when monotone evidence is strong.
        if pitch_std < 8.0 and wpm_arousal < 0.3:
            excited *= 0.4

        # Slow WPM + many fillers → hesitant prosody too. Bigger
        # bump than before because filler_rate * 0.16 alone wasn't
        # enough to outpace the nervous prosody on a hedgy speaker
        # whose pitch was also slightly raised.
        if wpm < 100 and has_lex and filler_rate > 3:
            hesitant += 2.5
        # Many hedges + slow speech → hesitant even without filler
        # density (a careful, qualifying speaker at low WPM).
        if wpm < 110 and has_lex and hedge_density > 4:
            hesitant += 1.5

        # ── New-label prosodic contributions ───────────────────────
        # engaged: variety + centred WPM + audible energy variation,
        # with a small bonus for clean delivery (low fillers + good
        # variety) so engaged separates from confident.
        engaged += variety * 1.6
        engaged += wpm_centeredness * 1.0
        engaged += min(rms_std, 0.04) * 25.0
        if has_lex and filler_rate < 3 and variety > 0.4:
            engaged += 0.6

        # bored: prosody-only signal. A bored speaker is monotone AND
        # (quiet OR slow) — pitch flatness alone is "monotone", not
        # "bored". The pitch_std term only fires here if energy or
        # rate is ALSO depressed, otherwise pitch flatness reads as
        # monotone. Penalise with variety so a varied delivery
        # cannot read as bored.
        low_energy = rms < 0.025
        slow_rate = wpm > 0 and wpm < 100
        if low_energy:
            bored += (0.025 - rms) * 100.0
        if rms_std < 0.012:
            bored += (0.012 - rms_std) * 100.0
        if slow_rate:
            bored += (100.0 - wpm) * 0.06
        # Pitch-flatness contribution gated on energy/rate evidence:
        # without it, this collapses to a duplicate of `monotone`.
        if pitch_std < 12.0 and (low_energy or slow_rate):
            bored += (12.0 - pitch_std) * 0.30
        bored -= variety * 0.6

        # angry: loud + sharp swings + raised pitch + fast rate.
        # Penalise when energy is low — angry without volume is rare
        # and we don't want a soft-spoken speaker reading as angry
        # because they used the word "wrong" once.
        angry += min(rms, 0.10) * 22.0
        angry += min(rms_std, 0.05) * 35.0
        angry += pitch_arousal * 2.0
        angry += wpm_arousal * 1.2
        angry -= (1.0 - min(rms, 0.10) * 10.0) * 0.8
        if angry < 0:
            angry = 0.0

        # sad: low pitch + slow WPM + quiet + subdued variety.
        # Note we use `1 - pitch_arousal` (instead of mirroring
        # bored's pitch_std term) because sadness is about the
        # speaker's mean pitch sitting low, not about being monotone.
        sad += max(0.0, 1.0 - pitch_arousal) * 1.2
        sad += max(0.0, 1.0 - wpm_arousal) * 1.0
        if rms < 0.04:
            sad += (0.04 - rms) * 18.0
        if pitch_std < 12.0:
            sad += (12.0 - pitch_std) * 0.06

    raw = {
        "nervous": nervous,
        "confident": confident,
        "excited": excited,
        "calm": calm,
        "hesitant": hesitant,
        "monotone": monotone,
        "engaged": engaged,
        "bored": bored,
        "angry": angry,
        "sad": sad,
    }
    # Softmax with a softening temperature. Lowered 2.5 → 2.0 when
    # the label set grew from 6 → 10: with 10 outputs the higher
    # temperature flattens too far, so the dominant label drifted to
    # 25-30% even on clearly biased samples. T=2.0 puts the dominant
    # label back into the 50-60% band with runner-ups around 15-25%,
    # matching the spec example "60/30/10" the original 6-label
    # detector produced.
    mix = _softmax(raw, temperature=2.0)

    # Round to one decimal so it serializes cleanly.
    rounded = {k: round(v, 3) for k, v in mix.items()}
    dominant = max(rounded, key=rounded.get) if rounded else None
    dominant_pct = int(round((rounded.get(dominant) or 0.0) * 100)) if dominant else None

    return {
        "mix": rounded,
        "dominant": dominant,
        "dominant_pct": dominant_pct,
        "evidence": {
            "lexical": {
                "filler_rate_pct": round(filler_rate, 2),
                "hedge_density": round(hedge_density, 2),
                "assertive_density": round(assert_density, 2),
                "repetition_rate": round(repetition, 3),
            },
            "prosodic": {
                "pitch_mean_hz": round(pitch_mean, 1),
                "pitch_std_hz": round(pitch_std, 1),
                "tremor": round(tremor, 3),
                "jitter_pct": round(jitter, 2),
                "shimmer_pct": round(shimmer, 2),
                "wpm": round(wpm, 1),
                "rms": round(rms, 4),
            },
        },
        "available_signals": (
            (["lexical"] if has_lex else [])
            + (["prosodic"] if has_prosody else [])
        ),
    }


def aggregate_emotion_mixes(per_chunk_mixes: list[dict]) -> dict:
    """Combine per-chunk emotion mixes into a session-level mix.

    Weights each chunk by 1.0 (uniform). Could be enhanced later to
    weight by voiced_s, but uniform keeps the math obvious and the
    user-facing percentages are stable. Skips chunks where mix is None.
    """
    if not per_chunk_mixes:
        return {"mix": None, "dominant": None, "dominant_pct": None}
    sums: dict[str, float] = {k: 0.0 for k in LABELS}
    n = 0
    for m in per_chunk_mixes:
        if not m or not m.get("mix"):
            continue
        for k in LABELS:
            sums[k] += float(m["mix"].get(k, 0.0))
        n += 1
    if n == 0:
        return {"mix": None, "dominant": None, "dominant_pct": None}
    averaged = {k: round(v / n, 3) for k, v in sums.items()}
    # Renormalize after rounding so it sums to 1.0 exactly.
    s = sum(averaged.values()) or 1.0
    averaged = {k: round(v / s, 3) for k, v in averaged.items()}
    dom = max(averaged, key=averaged.get)
    return {
        "mix": averaged,
        "dominant": dom,
        "dominant_pct": int(round(averaged[dom] * 100)),
    }
