"""Scoring Engine — Evidence-based weighted confidence scoring with rolling average."""
import time
from collections import deque

from signal_scorer import SignalScorer


# Unified weights — matches signal_scorer.py.
#
# Expression is deliberately excluded from the aggregate. The mapping
# {happy 90, speaking 80, focused 70, neutral 60, surprised 40, sad 30,
# angry 20} is arbitrary and culturally biased — a neutral-faced user
# and a smiling user of otherwise equal confidence got scores 30 points
# apart. Keep the signal in the UI for awareness, but don't let it move
# the headline number. The remaining 5 weights sum to 1.0 after
# redistributing the old 0.08 expression weight proportionally.
WEIGHTS = {
    'voice_steadiness': 0.24,
    'eye_contact': 0.24,
    'speech_pace': 0.20,
    'filler_words': 0.20,
    'vocal_variety': 0.12,
}

# Signals tracked in rolling history and echoed back in the update()
# response for UI display. Superset of WEIGHTS: expression appears here
# but not in WEIGHTS, so it renders in the UI without biasing the total.
DISPLAYED_SIGNALS = list(WEIGHTS.keys()) + ['expression']

# Rolling window: 4 entries at 500ms intervals = 2 seconds of smoothing.
# Was 10 (5s). 5s of lag meant a user's score still reflected what they
# were doing five seconds ago, which is the opposite of "real-time"
# feedback. 2s still removes per-chunk jitter without masking behaviour.
ROLLING_WINDOW = 4


class ScoringEngine:
    """Computes weighted confidence score from 6 sub-signals with rolling average."""

    def __init__(self):
        self.history = {key: deque(maxlen=ROLLING_WINDOW) for key in DISPLAYED_SIGNALS}
        self.total_history = deque(maxlen=ROLLING_WINDOW)

    def compute_sub_scores(self, face_result=None, speech_result=None, audio_result=None):
        """Convert raw signal data into 6 sub-scores (each 0-100).

        Returns dict with each sub-score. Missing source data → None
        (NOT 50) so the aggregate can skip it and renormalize. The
        old "default to 50" behaviour silently faked eye_contact for
        audio-only clips and speech signals for non-English clips,
        producing inflated/misleading headlines.
        """
        scores = {}

        # --- Voice Steadiness ---
        if audio_result and audio_result.get('voice_steadiness') is not None:
            scores['voice_steadiness'] = max(0, min(100, audio_result['voice_steadiness']))
        else:
            scores['voice_steadiness'] = None

        # --- Eye Contact ---
        if face_result and face_result.get('eye_contact_pct') is not None:
            scores['eye_contact'] = max(0, min(100, face_result['eye_contact_pct']))
        else:
            scores['eye_contact'] = None

        # --- Speech Pace ---
        if speech_result and speech_result.get('wpm') is not None:
            scores['speech_pace'] = _wpm_to_score(speech_result['wpm'])
        else:
            scores['speech_pace'] = None

        # --- Filler Words (0.20) ---
        # Single source of truth: delegate to SignalScorer so the live
        # WS path and the upload path produce the same score for the
        # same speech. The old local formula `100 - filler_rate * 10`
        # operated on the per-100-words filler percentage, while
        # SignalScorer uses the canonical fillers-per-voiced-minute
        # step table — different units and different curves, so the
        # same audio scored differently depending on which code path
        # ran. Caller must pass `lexical_filler_count`,
        # `acoustic_filler_count`, and `voiced_s` for the canonical
        # formula. Falls back to None (no data) if the inputs are
        # missing — the new aggregate() skips Nones.
        if (
            speech_result
            and speech_result.get('voiced_s') is not None
            and speech_result.get('voiced_s') > 0
            and speech_result.get('lexical_filler_count') is not None
            and speech_result.get('acoustic_filler_count') is not None
        ):
            scores['filler_words'] = SignalScorer.filler_words(
                lexical_count=speech_result['lexical_filler_count'],
                acoustic_count=speech_result['acoustic_filler_count'],
                voiced_s=speech_result['voiced_s'],
            )
        else:
            scores['filler_words'] = None

        # --- Vocal Variety ---
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
            scores['vocal_variety'] = None

        # --- Expression (display-only — excluded from total) ---
        if face_result and face_result.get('expression'):
            expr = face_result['expression']
            expr_scores = {
                'happy': 90, 'speaking': 80, 'focused': 70,
                'neutral': 60, 'calibrating': 50,
                'surprised': 40, 'sad': 30, 'angry': 20,
            }
            scores['expression'] = expr_scores.get(expr, 50)
        else:
            scores['expression'] = None

        return scores

    def update(self, sub_scores):
        """Push sub-scores into rolling average and compute weighted total.

        `None` for a signal means "no data" — we DON'T push it into
        the history (so the rolling average reflects only real
        measurements) and we EXCLUDE it from the weighted total via
        renormalization. This keeps a clip with no face data from
        getting a fake eye_contact=50 contribution that inflates the
        headline by ~12 points.
        """
        for key in DISPLAYED_SIGNALS:
            value = sub_scores.get(key)
            if value is None:
                continue
            self.history[key].append(value)

        # Rolling averages — None when the deque is still empty
        # (signal has never had data this session). Preserves the "no
        # data" semantics through to the aggregate below and the UI.
        smoothed = {}
        for key in DISPLAYED_SIGNALS:
            if self.history[key]:
                smoothed[key] = int(sum(self.history[key]) / len(self.history[key]))
            else:
                smoothed[key] = None

        # Weighted total — expression intentionally excluded; missing
        # signals (None) are skipped and remaining weights are
        # renormalized so the headline reflects only what was actually
        # measured. If every weighted signal is None the total is 50
        # (neutral display value — not stored in history).
        weighted_sum = 0.0
        weight_total = 0.0
        for key, w in WEIGHTS.items():
            v = smoothed[key]
            if v is None:
                continue
            weighted_sum += v * w
            weight_total += w
        if weight_total > 0:
            total = max(0, min(100, int(round(weighted_sum / weight_total))))
            self.total_history.append(total)
        else:
            total = 50

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
    """Generate 1-3 contextual feedback tips based on lowest-scoring signals.

    `None` means "no data was available for this signal" (e.g., audio-only
    clip → eyeContact is None; silent clip → voiceSteadiness is None).
    We skip those rather than tipping on missing data — `None < 50` raises
    TypeError in Python, which is what surfaced as the upload-pipeline
    error before this guard was added.
    """
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
        score = scores.get(key)
        if score is None:
            continue
        if score < threshold:
            tips.append(tip)
        if len(tips) >= 3:
            break

    # If all measured scores are good, give encouragement.
    total = scores.get('total')
    if not tips and total is not None and total >= 70:
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
