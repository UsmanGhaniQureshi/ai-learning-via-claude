"""
Signal Scorer — Calibrated, evidence-based scoring functions.
Each method converts raw signals into a 0-100 score.
"""
import math
import numpy as np


# Bug A (Apr 2026): the lexical detector (Whisper transcript) and the
# acoustic detector (raw-audio spectral heuristic) often fire on the
# SAME filler event — Whisper transcribes "um" at 1500-1700 ms and
# the acoustic detector finds the same hump at 1480-1720 ms. Summing
# the two counts double-charged the user. We now treat lexical as the
# primary signal and only count an acoustic detection if it does NOT
# overlap any lexical filler. The 150 ms tolerance below absorbs
# normal misalignment between Whisper word timestamps and the spectral
# detector's centroid windows.
_FILLER_OVERLAP_TOLERANCE_MS = 150


def dedup_filler_counts(
    lexical_filler_words: list[dict] | None,
    acoustic_filler_segments: list[dict] | None,
) -> tuple[int, int]:
    """Return (lexical_count, deduped_acoustic_count).

    Each input is a list of dicts with ``start_ms`` and ``end_ms``
    (lexical also has ``word``; acoustic also has ``type``). Both share
    the same chunk-local time base.

    Two events overlap if their time ranges intersect after expanding
    each by ``_FILLER_OVERLAP_TOLERANCE_MS / 2`` on each side. We do
    NOT mutate the inputs — just return the counts.
    """
    lex = list(lexical_filler_words or [])
    acu = list(acoustic_filler_segments or [])
    if not acu:
        return len(lex), 0
    if not lex:
        return 0, len(acu)

    pad = _FILLER_OVERLAP_TOLERANCE_MS / 2

    def _overlaps_any(seg, others):
        s_lo = (seg.get("start_ms") or 0) - pad
        s_hi = (seg.get("end_ms") or 0) + pad
        for o in others:
            o_lo = (o.get("start_ms") or 0) - pad
            o_hi = (o.get("end_ms") or 0) + pad
            # Two intervals [a,b] and [c,d] overlap iff a <= d AND c <= b.
            if s_lo <= o_hi and o_lo <= s_hi:
                return True
        return False

    deduped_acoustic = sum(
        1 for seg in acu if not _overlaps_any(seg, lex)
    )
    return len(lex), deduped_acoustic


class SignalScorer:
    """Static scoring methods for each confidence signal."""

    @staticmethod
    def eye_contact(gaze_scores, face_ratio=1.0):
        """Score eye contact from gaze tracking data.
        gaze_scores: list of per-frame eye contact scores (0-100).
        face_ratio: fraction of frames where face was detected (0-1)."""
        if face_ratio < 0.5:
            return 0
        if not gaze_scores:
            return 50
        weights = np.linspace(0.5, 1.0, len(gaze_scores))
        return round(min(100, float(np.average(gaze_scores, weights=weights))))

    @staticmethod
    def voice_steadiness(pitch, rms_std, voiced_s=None):
        """Score voice steadiness from pitch tremor and volume consistency.
        pitch: dict with tremor_score (0-1).
        rms_std: standard deviation of RMS energy over time.
        voiced_s: total voiced seconds in the source chunk. When < 0.5
            we return None (no voice = nothing to score). The old
            "treat tremor=0 + rms_std=0 as a perfect 100" was the
            silent-speaker bug — silence was being rewarded.
        """
        if voiced_s is not None and voiced_s < 0.5:
            return None
        tremor_penalty = pitch.get("tremor_score", 0) * 70
        volume_penalty = min(30, (rms_std / 0.06) * 30)
        return max(0, round(100 - tremor_penalty - volume_penalty))

    @staticmethod
    def speech_pace(words, vad_segments):
        """Score speech pace using articulation rate (words per voiced second).

        Smooth tent function peaking at 150 WPM with a gentle
        exponential falloff above (Fix 10) — widened from the old
        130-150 plateau to fairly accommodate Indian-English /
        Spanish-influenced speakers who naturally run 170-190 WPM.
        Mirrors scoring_engine._wpm_to_score so the live-WS path and
        the upload path produce identical scores for the same audio.

        Anchors: wpm=100 → ~82, wpm=150 → 100, wpm=190 → ~88, wpm=240 → ~72.

        Returns None for chunks with no meaningful speech (voiced_s<0.5)
        so callers can exclude silence from the aggregate rather than
        averaging a zero that drags everything down.
        """
        voiced_s = sum(e - s for s, e in vad_segments) / 1000
        # Reject silence/near-silence chunks. Caller decides what to do.
        if voiced_s < 0.5:
            return None

        count = len([w for w in words if len(w.get("word", "")) > 1])
        wpm = (count / voiced_s) * 60

        if wpm <= 0:
            return 20
        if wpm <= 150:
            score = 100 * (wpm / 150) ** 0.5
        else:
            score = 100 * math.exp(-0.003 * (wpm - 150))
        return max(0, min(100, round(score)))

    @staticmethod
    def filler_words(lexical_count, acoustic_count, voiced_s, word_count=None):
        """Score filler word usage as a smooth exponential decay.

        lexical_count: fillers found in transcript.
        acoustic_count: filler sounds detected from audio.
        voiced_s:      total voiced seconds (kept for the silent-chunk
                       gate — without it we'd reward silence).
        word_count:    total real (non-filler) word count. When
                       supplied (Fix 4), the rate is computed as
                       fillers per 100 words rather than per voiced
                       minute. Slow deliberate speakers and fast
                       packed speakers should NOT share a denominator.

        Returns None when voiced_s < 0.5 — zero fillers in zero
        voiced seconds is "no data," not "perfect 100." The old
        `rate == 0 → 100` step-table also gave gameable plateaus
        (5.0/min and 4.9/min jumped 55→75); the smooth curve here
        removes that.
        """
        if voiced_s < 0.5:
            return None
        filler_count = lexical_count + acoustic_count
        # Fix 4: per-100-words denominator. Falls back to per-voiced-
        # minute only if the caller cannot provide word_count (legacy
        # paths). The divisor in the exponential is tuned to each
        # denominator so the same ground-truth filler rate produces
        # comparable scores across the two regimes.
        if word_count is not None:
            if word_count <= 0:
                return None
            rate = (filler_count / word_count) * 100
            score = 100 * math.exp(-rate / 3)
        else:
            rate = (filler_count / max(voiced_s, 1)) * 60
            score = 100 * math.exp(-rate / 5)
        return max(0, min(100, round(score)))

    @staticmethod
    def silence_penalty(vad_segments, chunk_duration_ms=3000):
        """Calculate penalty for silence gaps >2 seconds within a chunk.
        Returns penalty to subtract from speech_pace score (0-30)."""
        if not vad_segments:
            return 15  # No speech at all = moderate penalty

        # Calculate silence gaps between speech segments
        sorted_segs = sorted(vad_segments, key=lambda x: x[0])
        total_silence_ms = 0

        # Gap before first speech
        if sorted_segs[0][0] > 2000:
            total_silence_ms += sorted_segs[0][0]

        # Gaps between speech segments
        for i in range(1, len(sorted_segs)):
            gap = sorted_segs[i][0] - sorted_segs[i - 1][1]
            if gap > 2000:  # Only penalize gaps > 2 seconds
                total_silence_ms += gap

        # Gap after last speech
        remaining = chunk_duration_ms - sorted_segs[-1][1]
        if remaining > 2000:
            total_silence_ms += remaining

        # Penalty: 5 points per 2 seconds of silence, max 30
        penalty = min(30, int((total_silence_ms / 2000) * 5))
        return penalty

    @staticmethod
    def vocal_variety(pitch, voiced_s=None):
        """Score vocal variety from pitch standard deviation.

        Smooth logistic curve centred at std_hz=30 with k=0.08:
            score = 100 / (1 + exp(-0.08 * (std_hz - 30)))
        Anchor checks: 10 → ~18, 30 → 50, 60 → ~91. The previous
        piecewise version had a flat 100 plateau across 50-80 Hz
        which made small differences inside the plateau invisible.

        Returns None on a silent chunk (voiced_s < 0.5) so a silent
        speaker isn't labelled "monotone".
        """
        if voiced_s is not None and voiced_s < 0.5:
            return None
        std = pitch.get("std_hz", 0)
        score = 100.0 / (1.0 + math.exp(-0.08 * (std - 30)))
        return max(0, min(100, round(score)))

    @staticmethod
    def aggregate(signals):
        """Compute weighted aggregate confidence score.

        Expression is deliberately excluded — its mapping (happy 90,
        neutral 60, sad 30, ...) is arbitrary and culturally biased.
        The remaining 5 weights sum to 1.0 after redistributing the
        old 0.08 expression weight. Must stay in sync with the
        WEIGHTS dict in scoring_engine.py.

        `None` for a signal means "no data was available" (silent
        chunk for speech_pace, no face for eye_contact, non-English
        clip for the speech-derived signals, etc.). We SKIP missing
        signals and renormalize the remaining weights instead of
        treating them as neutral 50 — the old "treat None as 50"
        logic dragged thoughtful pauses and audio-only clips toward
        50 even when the available signals were excellent. Returns
        None if every signal is None (caller / session aggregator
        already handles that case).
        """
        weights = {
            "voice_steadiness": 0.24,
            "eye_contact": 0.24,
            "speech_pace": 0.20,
            "filler_words": 0.20,
            "vocal_variety": 0.12,
        }
        # Refuse to compute a "face-only" headline. When every audio
        # signal is None (silent chunk, mic dead, language unsupported)
        # the renormaliser would otherwise let eye_contact carry 100%
        # of the weight — a silent user looking at the camera scored 100.
        # Returning None forces callers to label the chunk as "no
        # speech" rather than fabricate a confident headline from face
        # alone. analyzer_audio (audio-only) is unaffected — its audio
        # signals are populated and eye_contact is the missing one.
        AUDIO_KEYS = ("voice_steadiness", "speech_pace", "filler_words", "vocal_variety")
        if not any(signals.get(k) is not None for k in AUDIO_KEYS):
            return None

        weighted_sum = 0.0
        weight_total = 0.0
        for k, w in weights.items():
            v = signals.get(k)
            if v is None:
                continue
            weighted_sum += v * w
            weight_total += w
        if weight_total <= 0:
            return None
        return round(weighted_sum / weight_total)
