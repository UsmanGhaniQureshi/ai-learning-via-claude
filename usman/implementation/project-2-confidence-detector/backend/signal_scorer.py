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
    def voice_steadiness(pitch, rms_std):
        """Score voice steadiness from pitch tremor and volume consistency.
        pitch: dict with tremor_score (0-1).
        rms_std: standard deviation of RMS energy over time."""
        tremor_penalty = pitch.get("tremor_score", 0) * 70
        volume_penalty = min(30, (rms_std / 0.06) * 30)
        return max(0, round(100 - tremor_penalty - volume_penalty))

    @staticmethod
    def speech_pace(words, vad_segments):
        """Score speech pace using articulation rate (words per voiced second).
        words: list of word dicts from whisper transcription.
        vad_segments: list of (start_ms, end_ms) speech segments."""
        voiced_s = max(sum(e - s for s, e in vad_segments) / 1000, 0.1)
        count = len([w for w in words if len(w.get("word", "")) > 1])
        wpm = (count / voiced_s) * 60

        if 130 <= wpm <= 160:
            score = 100
        elif 110 <= wpm < 130:
            score = 70 + (wpm - 110) * 1.5
        elif 160 < wpm <= 180:
            score = 100 - (wpm - 160) * 3
        elif wpm > 180:
            score = max(0, 100 - (wpm - 160) * 5)
        elif 80 <= wpm < 110:
            score = 40 + (wpm - 80)
        else:
            score = max(0, wpm * 0.5)

        return round(score)

    @staticmethod
    def filler_words(lexical_count, acoustic_count, voiced_s):
        """Score filler word usage.
        lexical_count: fillers found in transcript.
        acoustic_count: filler sounds detected from audio.
        voiced_s: total voiced seconds."""
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
    def vocal_variety(pitch):
        """Score vocal variety from pitch standard deviation.
        Monotone = low score, natural variation = high score, erratic = drops."""
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
        Uses research-informed weights for presentation confidence."""
        weights = {
            "voice_steadiness": 0.22,
            "eye_contact": 0.22,
            "speech_pace": 0.18,
            "filler_words": 0.18,
            "vocal_variety": 0.12,
            "expression": 0.08,
        }
        return round(sum(signals.get(k, 50) * w for k, w in weights.items()))
