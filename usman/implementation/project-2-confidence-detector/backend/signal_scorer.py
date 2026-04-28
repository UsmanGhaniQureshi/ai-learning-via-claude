"""
Signal Scorer — Calibrated, evidence-based scoring functions.
Each method converts raw signals into a 0-100 score.
"""
import numpy as np


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

        The old piecewise curve had a cliff at 180 WPM — a chunk at 181
        WPM got 0 while a chunk at 180 WPM got 40. That produced huge
        false penalties for anyone speaking a bit fast. The curve below
        is smooth and mirror-symmetric around the 140 WPM sweet spot,
        matching the one in scoring_engine._wpm_to_score.

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

        # Sweet spot 130-150, gentle falloff on either side, floor 10.
        if wpm <= 0:
            return 20
        if 130 <= wpm <= 150:
            score = 100
        elif 120 <= wpm <= 160:
            score = 90
        elif 100 <= wpm < 120:
            score = 60 + (wpm - 100) * 1.5     # 60 → 90
        elif 160 < wpm <= 180:
            score = 90 - (wpm - 160) * 1.5     # 90 → 60
        elif 80 <= wpm < 100:
            score = 30 + (wpm - 80) * 1.5      # 30 → 60
        elif 180 < wpm <= 200:
            score = 60 - (wpm - 180) * 1.5     # 60 → 30
        elif wpm < 80:
            score = max(10, int(wpm * 0.375))
        else:  # wpm > 200
            score = max(10, 30 - int((wpm - 200) * 0.5))
        return round(score)

    @staticmethod
    def filler_words(lexical_count, acoustic_count, voiced_s):
        """Score filler word usage.

        lexical_count: fillers found in transcript.
        acoustic_count: filler sounds detected from audio.
        voiced_s: total voiced seconds.

        Returns None when voiced_s < 0.5 — zero fillers in zero
        voiced seconds is "no data," not "perfect 100." The old
        `rate == 0 → 100` shortcut was the silent-speaker bug:
        a user who said nothing got a perfect filler-words score
        and the headline came out a grade A.
        """
        if voiced_s < 0.5:
            return None
        rate = ((lexical_count + acoustic_count) / max(voiced_s, 1)) * 60
        if rate == 0:
            return 100
        elif rate < 2:
            return 90
        elif rate < 5:
            return 75
        elif rate < 10:
            return 55
        elif rate < 20:
            return 30
        else:
            return 10

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

        Monotone = low score, natural variation = high score,
        erratic = drops. Returns None on a silent chunk
        (voiced_s < 0.5) so a silent speaker isn't labelled
        "monotone" (the old behaviour: pitch_std=0 → score 20).
        """
        if voiced_s is not None and voiced_s < 0.5:
            return None
        std = pitch.get("std_hz", 0)
        if std < 5:
            return 20
        elif std < 15:
            return 40 + int((std - 5) * 4)
        elif std < 50:
            return int(80 + (std - 15) * (20 / 35))
        elif std < 80:
            return 100
        else:
            return max(50, 100 - int((std - 80) * 2))

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
