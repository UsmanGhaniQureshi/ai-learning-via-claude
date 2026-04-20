"""Scoring Engine — Evidence-based weighted confidence scoring with rolling average."""
import time
from collections import deque


# Unified weights — matches signal_scorer.py (V2 specification)
WEIGHTS = {
    'voice_steadiness': 0.22,
    'eye_contact': 0.22,
    'speech_pace': 0.18,
    'filler_words': 0.18,
    'vocal_variety': 0.12,
    'expression': 0.08,
}

# Rolling window: 10 entries at 500ms intervals = 5 seconds of smoothing
ROLLING_WINDOW = 10


class ScoringEngine:
    """Computes weighted confidence score from 6 sub-signals with rolling average."""

    def __init__(self):
        self.history = {key: deque(maxlen=ROLLING_WINDOW) for key in WEIGHTS}
        self.total_history = deque(maxlen=ROLLING_WINDOW)

    def compute_sub_scores(self, face_result=None, speech_result=None, audio_result=None):
        """Convert raw signal data into 6 sub-scores (each 0-100).
        Returns dict with each sub-score. Defaults to 50 if signal unavailable."""

        scores = {}

        # --- Voice Steadiness (0.22) ---
        if audio_result and audio_result.get('voice_steadiness') is not None:
            scores['voice_steadiness'] = max(0, min(100, audio_result['voice_steadiness']))
        else:
            scores['voice_steadiness'] = 50

        # --- Eye Contact (0.22) ---
        if face_result and face_result.get('eye_contact_pct') is not None:
            scores['eye_contact'] = max(0, min(100, face_result['eye_contact_pct']))
        else:
            scores['eye_contact'] = 50

        # --- Speech Pace (0.18) ---
        if speech_result and speech_result.get('wpm') is not None:
            scores['speech_pace'] = _wpm_to_score(speech_result['wpm'])
        else:
            scores['speech_pace'] = 50

        # --- Filler Words (0.18) ---
        if speech_result and speech_result.get('filler_rate') is not None:
            filler_rate = speech_result['filler_rate']
            scores['filler_words'] = max(0, min(100, int(100 - filler_rate * 10)))
        else:
            scores['filler_words'] = 50

        # --- Vocal Variety (0.12) ---
        # Derived from pitch standard deviation. Monotone = low, natural = high.
        if audio_result and audio_result.get('pitch_std') is not None:
            std = audio_result['pitch_std']
            if std < 5:
                scores['vocal_variety'] = 20
            elif std < 15:
                scores['vocal_variety'] = 40 + int((std - 5) * 4)
            elif std < 50:
                scores['vocal_variety'] = int(80 + (std - 15) * (20 / 35))
            elif std < 80:
                scores['vocal_variety'] = 100
            else:
                scores['vocal_variety'] = max(50, 100 - int((std - 80) * 2))
        else:
            scores['vocal_variety'] = 50

        # --- Expression (0.08) ---
        if face_result and face_result.get('expression'):
            expr = face_result['expression']
            expr_scores = {
                'happy': 90, 'speaking': 80, 'focused': 70,
                'neutral': 60, 'calibrating': 50,
                'surprised': 40, 'sad': 30, 'angry': 20,
            }
            scores['expression'] = expr_scores.get(expr, 50)
        else:
            scores['expression'] = 50

        return scores

    def update(self, sub_scores):
        """Push sub-scores into rolling average and compute weighted total.
        Returns smoothed scores + weighted total."""

        # Push each sub-score into its rolling deque
        for key in WEIGHTS:
            value = sub_scores.get(key, 50)
            self.history[key].append(value)

        # Compute rolling averages
        smoothed = {}
        for key in WEIGHTS:
            if self.history[key]:
                smoothed[key] = int(sum(self.history[key]) / len(self.history[key]))
            else:
                smoothed[key] = 50

        # Weighted total
        total = sum(smoothed[key] * WEIGHTS[key] for key in WEIGHTS)
        total = max(0, min(100, int(total)))

        self.total_history.append(total)

        return {
            'total': total,
            'voiceSteadiness': smoothed['voice_steadiness'],
            'eyeContact': smoothed['eye_contact'],
            'speechPace': smoothed['speech_pace'],
            'fillerWords': smoothed['filler_words'],
            'vocalVariety': smoothed['vocal_variety'],
            'expression': smoothed['expression'],
            'timestamp': time.time(),
        }

    def reset(self):
        """Clear all history."""
        for key in self.history:
            self.history[key].clear()
        self.total_history.clear()


def generate_tips(scores):
    """Generate 1-3 contextual feedback tips based on lowest-scoring signals."""
    tips = []

    tip_map = [
        ('voiceSteadiness', 50, "Try to keep your voice volume and pitch steady"),
        ('eyeContact', 50, "Look directly at the camera to maintain eye contact"),
        ('speechPace', 50, "Aim for 120-160 words per minute — adjust your speed"),
        ('fillerWords', 60, "Reduce filler words like 'um', 'uh', and 'like'"),
        ('vocalVariety', 50, "Vary your pitch — emphasise key words to avoid monotone"),
        ('expression', 50, "Relax your face — try a slight natural smile"),
    ]

    for key, threshold, tip in tip_map:
        if scores.get(key, 50) < threshold:
            tips.append(tip)
        if len(tips) >= 3:
            break

    # If all scores are good, give encouragement
    if not tips and scores.get('total', 50) >= 70:
        tips.append("Great job! You're presenting with confidence")

    return tips


def _wpm_to_score(wpm):
    """Convert words-per-minute to a 0-100 score.
    Bell curve: 120-160 WPM = 80-100. Drops linearly outside."""
    if wpm <= 0:
        return 20

    # Optimal range: 120-160 WPM
    if 130 <= wpm <= 150:
        return 100
    elif 120 <= wpm <= 160:
        return 90
    elif 100 <= wpm < 120:
        # Linear from 60 to 90 as WPM goes 100->120
        return 60 + int((wpm - 100) * 1.5)
    elif 160 < wpm <= 180:
        # Linear from 90 to 60 as WPM goes 160->180
        return 90 - int((wpm - 160) * 1.5)
    elif 80 <= wpm < 100:
        # Linear from 30 to 60
        return 30 + int((wpm - 80) * 1.5)
    elif 180 < wpm <= 200:
        # Linear from 60 to 30
        return 60 - int((wpm - 180) * 1.5)
    elif wpm < 80:
        return max(10, int(wpm * 0.375))
    else:  # wpm > 200
        return max(10, 30 - int((wpm - 200) * 0.5))
