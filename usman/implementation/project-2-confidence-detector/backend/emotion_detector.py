"""
Emotion Detector — multi-label, weighted speaker-emotion scoring.

Combines LEXICAL signals (transcript words: fillers, hedges, assertives,
repetitions, exclamations) with PROSODIC signals (pitch mean/std,
energy, speech rate, voice tremor / jitter / shimmer) to produce a
weighted probability distribution over a fixed label set:

    confident, nervous, engaged, disconnected, authoritative,
    hesitant, excited, flat, sad, angry

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

Label definitions
-----------------
- AUTHORITATIVE: controlled, audible, declarative delivery — the
  "commanding presenter" tone. Steady RMS, pitch_std in the 15-25 Hz
  band, WPM 120-150, low jitter/shimmer/fillers, lots of assertive
  tokens. Distinct from CONFIDENT (which is broader / more permissive
  on prosody) by requiring audible energy AND moderate pitch range.
- DISCONNECTED: low energy + slow + flat pitch — the speaker has
  checked out. Gated by BOTH low pitch_std AND low RMS. If RMS is
  audible the delivery is FLAT, not disconnected; if WPM is normal
  the delivery is FLAT too.
- FLAT: uninflected delivery without the disengagement signal. Low
  pitch_std (< 10) is the only requirement; energy and rate can be
  anywhere. The "neutral lecture" tone — present but flat-pitched.
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

# Assertive / committed phrases — increase confident AND authoritative.
ASSERTIVE_PHRASES = {
    "definitely", "absolutely", "clearly", "certain", "certainly",
    "obviously", "for sure", "without doubt", "no doubt",
    "i know", "we know", "i'm confident", "im confident",
    "exactly", "precisely",
}

# Declarative / commanding sentence-starters — fire authoritative
# specifically. These differ from ASSERTIVE_PHRASES (which are
# in-sentence conviction markers) — these are the "stand and
# declare" tokens of someone setting the agenda.
DECLARATIVE_TOKENS = {
    "we will", "we must", "we need", "we are", "the answer is",
    "the truth is", "the fact is", "the point is", "let me be clear",
    "make no mistake", "the reality", "i will", "i am going to",
    "here's what",
}

# High-arousal words / intensifiers — increase excited.
EXCITED_TOKENS = {
    "amazing", "awesome", "incredible", "fantastic", "love",
    "thrilled", "excited", "wow", "great", "huge", "massive",
    "super", "really", "so",  # bare intensifiers count weakly
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
ENGAGED_TOKENS = {
    "imagine", "picture", "look", "ask yourself", "consider",
    "notice", "let me show", "let's", "think about", "watch",
    "here's the thing",
}

# Generic / placeholder lexical patterns — disconnected speakers fall
# into "yeah... so... um... I guess..." sequences. These individual
# tokens are not damning on their own; what fires DISCONNECTED is
# their prevalence combined with low-RMS / slow-WPM prosody.
GENERIC_FILLER_TOKENS = {
    "yeah", "so", "um", "uh", "like", "anyway", "whatever",
    "i mean", "i guess", "or something", "stuff", "things",
    "basically",
}


LABELS = (
    "confident", "nervous", "engaged", "disconnected", "authoritative",
    "hesitant", "excited", "flat", "sad", "angry",
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
    """Map pitch mean to a 0-1 arousal index."""
    if pitch_mean_hz <= 0:
        return 0.0
    return 1.0 / (1.0 + math.exp(-0.04 * (pitch_mean_hz - 200.0)))


def _wpm_arousal(wpm: float) -> float:
    """0-1 arousal index from speech rate. Peaks above 200 WPM."""
    if wpm <= 0:
        return 0.0
    return max(0.0, min(1.0, (wpm - 100.0) / 150.0))


def _softmax(scores: dict[str, float], temperature: float = 2.5) -> dict[str, float]:
    """Numerically stable softmax with temperature."""
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
    """
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
    declarative_hits = _count_phrase_hits(text, DECLARATIVE_TOKENS)
    excite_hits = _count_phrase_hits(text, EXCITED_TOKENS)
    angry_hits = _count_phrase_hits(text, ANGRY_TOKENS)
    sad_hits = _count_phrase_hits(text, SAD_TOKENS)
    engaged_hits = _count_phrase_hits(text, ENGAGED_TOKENS)
    generic_hits = _count_phrase_hits(text, GENERIC_FILLER_TOKENS)
    repetition = _repetition_rate(words or [])

    # Filler rate per 100 real words.
    filler_rate = 0.0
    if word_count > 0:
        filler_rate = (lexical_filler_count + acoustic_filler_count) / word_count * 100

    denom_words = max(word_count, 1)
    hedge_density = hedge_hits / denom_words * 100
    assert_density = assert_hits / denom_words * 100
    declarative_density = declarative_hits / denom_words * 100
    excite_density = excite_hits / denom_words * 100
    angry_density = angry_hits / denom_words * 100
    sad_density = sad_hits / denom_words * 100
    engaged_density = engaged_hits / denom_words * 100
    generic_density = generic_hits / denom_words * 100

    # ── Prosodic evidence ──────────────────────────────────────────
    pitch_arousal_v = _pitch_arousal(pitch_mean)
    wpm_arousal_v = _wpm_arousal(wpm)
    # Vocal variety score from pitch SD: monotone <5, natural 15-50,
    # animated 50+. Map to 0-1 where >50 is animated.
    variety = max(0.0, min(1.0, (pitch_std - 5.0) / 50.0))

    # ── Per-label evidence aggregation ─────────────────────────────
    confident = 0.0
    nervous = 0.0
    engaged = 0.0
    disconnected = 0.0
    authoritative = 0.0
    hesitant = 0.0
    excited = 0.0
    flat = 0.0
    sad = 0.0
    angry = 0.0

    # --- Lexical contribution ---
    if has_lex:
        # Fillers are the strongest single nervous/hesitant signal.
        nervous += min(filler_rate, 20.0) * 0.10        # up to +2
        hesitant += min(filler_rate, 20.0) * 0.16       # up to +3.2
        # Hedges → uncertain → hesitant + nervous.
        hesitant += min(hedge_density, 15.0) * 0.25     # up to +3.75
        nervous += min(hedge_density, 15.0) * 0.10      # up to +1.5
        # Assertives → confident.
        confident += min(assert_density, 15.0) * 0.20   # up to +3.0
        # Excited tokens → excited.
        excited += min(excite_density, 15.0) * 0.18

        # Repetition is loop-on-same-phrase nervousness.
        nervous += min(repetition, 0.20) * 12.0         # up to +2.4
        hesitant += min(repetition, 0.20) * 8.0
        # Confidence baseline boost when speaking with low fillers AND
        # no hedging — "well-spoken" stretches deserve credit. Gated
        # on pitch_std > 10 so a flat-pitch reader doesn't read as
        # confident just because they're not stumbling.
        if (
            filler_rate < 3 and hedge_density < 2 and word_count >= 3
            and pitch_std > 10
        ):
            confident += 1.5

        # New-label lexical contributions.
        engaged += min(engaged_density, 15.0) * 0.18
        angry += min(angry_density, 15.0) * 0.20
        angry += min(repetition, 0.20) * 6.0
        sad += min(sad_density, 15.0) * 0.20
        sad += min(hedge_density, 15.0) * 0.06

        # AUTHORITATIVE lexical: assertives + declarative structures +
        # absence of hedging. The lexical contribution is gated by
        # filler rate — an authoritative tone is not what a stumbling
        # speaker projects, regardless of word choice.
        # Coefficients tuned so authoritative + prosody peaks around
        # 6-7 raw on a strong sample, keeping softmax dominant in the
        # 60-75% band against a confident runner-up at ~15-25%.
        if filler_rate < 4:
            authoritative += min(assert_density, 15.0) * 0.15
            authoritative += min(declarative_density, 15.0) * 0.20
            # Bonus for declarative-heavy content with NO hedging.
            if declarative_density >= 1 and hedge_density < 1.5:
                authoritative += 0.6

        # DISCONNECTED lexical: generic filler structures + absence of
        # engaged/assertive tokens + low word density. Word density
        # is computed against voiced time (sparse speech for the
        # voiced duration → checked-out delivery).
        if voiced_s > 0.5:
            words_per_voiced_s = word_count / voiced_s
        else:
            words_per_voiced_s = 0.0
        if engaged_density < 0.5 and assert_density < 0.5:
            disconnected += min(generic_density, 20.0) * 0.10
            # Sparse speech (under ~1.8 wps) reads as low engagement.
            if words_per_voiced_s < 1.8:
                disconnected += (1.8 - words_per_voiced_s) * 0.8

        # FLAT lexical: purely neutral content — the LACK of the
        # arousal-bearing token sets pushes flat. We only fire when
        # the speaker is actively producing words yet none of them
        # carry colour.
        if word_count >= 3:
            colourless = (
                excite_density < 0.5
                and engaged_density < 0.5
                and assert_density < 0.5
                and hedge_density < 0.5
                and angry_density < 0.5
                and sad_density < 0.5
            )
            if colourless:
                flat += 1.0

    # --- Prosodic contribution ---
    if has_prosody:
        # Tremor / jitter / shimmer all push nervous.
        nervous += tremor * 4.0
        nervous += min(jitter, 4.0) * 0.5
        nervous += min(shimmer, 12.0) * 0.18
        nervous += instability * 2.0

        # Raised pitch under stress → nervous.
        nervous += pitch_arousal_v * 1.3

        # Fast WPM with high arousal → excited.
        excited += wpm_arousal_v * 2.0
        excited += variety * 1.4
        # Loud + varied energy → excited.
        excited += min(rms, 0.10) * 8.0
        excited += min(rms_std, 0.05) * 12.0

        # Steady pitch + moderate WPM + low tremor → confident.
        steadiness = max(0.0, 1.0 - tremor - min(instability, 1.0) * 0.5)
        wpm_centeredness = max(0.0, 1.0 - abs(wpm - 145.0) / 70.0)
        confident += steadiness * 1.6
        confident += wpm_centeredness * 1.5
        if 12.0 <= pitch_std <= 60.0 and tremor < 0.25:
            confident += 1.0

        # Slow WPM + many fillers → hesitant prosody too.
        if wpm < 100 and has_lex and filler_rate > 3:
            hesitant += 2.5
        if wpm < 110 and has_lex and hedge_density > 4:
            hesitant += 1.5

        # engaged: variety + centred WPM + audible energy variation.
        engaged += variety * 1.6
        engaged += wpm_centeredness * 1.0
        engaged += min(rms_std, 0.04) * 25.0
        if has_lex and filler_rate < 3 and variety > 0.4:
            engaged += 0.6

        # angry: loud + sharp swings + raised pitch + fast rate.
        angry += min(rms, 0.10) * 22.0
        angry += min(rms_std, 0.05) * 35.0
        angry += pitch_arousal_v * 2.0
        angry += wpm_arousal_v * 1.2
        angry -= (1.0 - min(rms, 0.10) * 10.0) * 0.8
        if angry < 0:
            angry = 0.0

        # sad: low pitch + slow WPM + quiet + subdued variety.
        sad += max(0.0, 1.0 - pitch_arousal_v) * 1.2
        sad += max(0.0, 1.0 - wpm_arousal_v) * 1.0
        if rms < 0.04:
            sad += (0.04 - rms) * 18.0
        if pitch_std < 12.0:
            sad += (12.0 - pitch_std) * 0.06

        # ── AUTHORITATIVE prosody ─────────────────────────────────
        # Gate: requires audible RMS AND non-flat pitch. The
        # "commanding presenter" needs to be heard and varied.
        # Filler rate cap also blocks the lexical path above; here
        # we add prosodic mass when conditions match.
        authoritative_gate = rms > 0.03 and pitch_std > 12.0
        if authoritative_gate and (not has_lex or filler_rate < 4):
            # Pitch_std band 15-25 = the controlled-but-varied zone.
            # Triangular peak: 15-25 -> 1.2, 12-15 / 25-35 ramp.
            if 15.0 <= pitch_std <= 25.0:
                authoritative += 1.2
            elif 12.0 < pitch_std < 15.0:
                authoritative += (pitch_std - 12.0) / 3.0 * 1.2
            elif 25.0 < pitch_std < 35.0:
                authoritative += max(0.0, (35.0 - pitch_std) / 10.0) * 1.2
            # WPM 120-150 sweet spot: deliberate yet alive.
            if 120.0 <= wpm <= 150.0:
                authoritative += 1.0
            elif 110.0 < wpm < 120.0:
                authoritative += (wpm - 110.0) / 10.0 * 1.0
            elif 150.0 < wpm < 165.0:
                authoritative += max(0.0, (165.0 - wpm) / 15.0) * 1.0
            # Steady RMS (low rms_std relative to mean).
            if rms_std < 0.020:
                authoritative += (0.020 - rms_std) * 40.0
            # Low jitter / shimmer.
            if jitter < 1.0:
                authoritative += (1.0 - jitter) * 0.3
            if shimmer < 3.0:
                authoritative += (3.0 - shimmer) * 0.08

        # ── DISCONNECTED prosody ──────────────────────────────────
        # Gate: BOTH low pitch_std AND low RMS. Either alone is not
        # enough — a flat pitch with audible energy is FLAT (not
        # disconnected); a quiet voice with normal pitch range is
        # SAD (or just a quiet speaker), not disconnected. Plus a
        # WPM check: normal-rate delivery is FLAT, not disconnected.
        disconnected_gate = (
            pitch_std < 12.0 and rms < 0.025
            and (wpm <= 0 or wpm < 110.0)
        )
        if disconnected_gate:
            # Pitch flatness contributes.
            disconnected += (12.0 - pitch_std) * 0.30
            # Quietness contributes.
            disconnected += (0.025 - rms) * 100.0
            # Slow rate contributes (only when WPM is positive).
            if wpm > 0 and wpm < 110.0:
                disconnected += (110.0 - wpm) * 0.05
            # Steady silence (low rms_std) further deepens.
            if rms_std < 0.012:
                disconnected += (0.012 - rms_std) * 60.0
            # Fixed bonus when all three conditions align cleanly:
            # without this, the lexical hesitant signal (which fires
            # on the same slow-WPM + filler combo) drowns disconnected
            # out, but the speaker is absent rather than stumbling.
            if wpm > 0 and wpm < 100.0 and rms < 0.020:
                disconnected += 2.0
            # Attenuate hesitant when the disconnected gate fully
            # fires — a checked-out speaker is not "hesitating"; they
            # have nothing to commit to. Without this, the
            # filler_rate * 0.16 contribution to hesitant beats
            # disconnected on identical samples.
            if wpm > 0 and wpm < 100.0 and rms < 0.020:
                hesitant *= 0.5

        # ── FLAT prosody ──────────────────────────────────────────
        # Gate: pitch_std < 10. Energy and rate are NOT gates — flat
        # is "uninflected" not "quiet" and not "slow". A speaker
        # reading a phone book at 145 WPM with normal volume reads
        # as FLAT, not as confident or hesitant.
        if pitch_std < 10.0:
            flat += (10.0 - pitch_std) * 0.50
            if rms_std < 0.012:
                flat += (0.012 - rms_std) * 60.0
            # Penalise excited / engaged when flat fires hard.
            if pitch_std < 7.0:
                excited *= 0.4
                engaged *= 0.5

        # Disconnected and flat ARE related but the gate keeps them
        # apart on real samples: disconnected REQUIRES low RMS and
        # slow-or-zero WPM. If flat fires AND disconnected does not
        # (energy or pace was normal), that's the right outcome.

    raw = {
        "confident": confident,
        "nervous": nervous,
        "engaged": engaged,
        "disconnected": disconnected,
        "authoritative": authoritative,
        "hesitant": hesitant,
        "excited": excited,
        "flat": flat,
        "sad": sad,
        "angry": angry,
    }
    # Softmax with a softening temperature. T=2.0 puts the dominant
    # label in the 50-60% band with runner-ups around 15-25%.
    mix = _softmax(raw, temperature=2.0)

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
                "declarative_density": round(declarative_density, 2),
                "engaged_density": round(engaged_density, 2),
                "generic_density": round(generic_density, 2),
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
                "rms_std": round(rms_std, 4),
            },
        },
        "available_signals": (
            (["lexical"] if has_lex else [])
            + (["prosodic"] if has_prosody else [])
        ),
    }


def aggregate_emotion_mixes(per_chunk_mixes: list[dict]) -> dict:
    """Combine per-chunk emotion mixes into a session-level mix.

    Weights each chunk by 1.0 (uniform). Skips chunks where mix is
    None. Iterates the current LABELS tuple — old-schema mixes that
    contained labels not in the current tuple (legacy `calm`,
    `bored`, `monotone`) silently drop their weight.
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
