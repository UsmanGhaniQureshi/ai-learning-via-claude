"""Audio Analyzer — Volume consistency, pitch variance, and silence gap detection.
Uses numpy only (no additional dependencies)."""
import numpy as np
from collections import deque
import time


class AudioAnalyzer:
    """Analyzes raw audio for voice steadiness signals: volume, pitch, silence."""

    def __init__(self, sample_rate=16000):
        self.sample_rate = sample_rate

        # Volume tracking (RMS values over time)
        self.rms_history = deque(maxlen=40)  # ~10 seconds at 250ms chunks

        # Pitch tracking (fundamental frequency estimates)
        self.pitch_history = deque(maxlen=40)

        # Silence tracking
        self.silence_threshold = 200  # RMS below this = silence
        self.silence_start = None
        self.silence_gaps = []  # list of {start, duration}
        self.last_speech_time = None

        # Timing
        self.start_time = None
        self.chunks_processed = 0

    def start(self):
        """Reset for a new session."""
        self.rms_history.clear()
        self.pitch_history.clear()
        self.silence_gaps = []
        self.silence_start = None
        self.last_speech_time = None
        self.start_time = time.time()
        self.chunks_processed = 0

    def analyze_chunk(self, pcm_data, sample_rate=None):
        """Analyze a chunk of raw 16-bit PCM audio.
        pcm_data: bytes (16-bit signed integers, mono)
        Returns dict with volume, pitch, and silence info."""

        if sample_rate is None:
            sample_rate = self.sample_rate

        if self.start_time is None:
            self.start_time = time.time()

        self.chunks_processed += 1
        elapsed = time.time() - self.start_time

        # Convert bytes to numpy array of int16
        try:
            samples = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float64)
        except (ValueError, TypeError):
            return self._empty_result(elapsed)

        if len(samples) == 0:
            return self._empty_result(elapsed)

        # --- RMS Volume ---
        rms = np.sqrt(np.mean(samples ** 2))
        self.rms_history.append(rms)

        # --- Silence Detection ---
        is_silent = rms < self.silence_threshold
        if is_silent:
            if self.silence_start is None:
                self.silence_start = elapsed
        else:
            if self.silence_start is not None:
                gap_duration = elapsed - self.silence_start
                if gap_duration >= 2.0:  # Only record gaps > 2 seconds
                    self.silence_gaps.append({
                        'start': round(self.silence_start, 1),
                        'duration': round(gap_duration, 1),
                    })
                self.silence_start = None
            self.last_speech_time = elapsed

        # --- Pitch Estimation (autocorrelation method) ---
        pitch = self._estimate_pitch(samples, sample_rate)
        if pitch is not None and pitch > 0:
            self.pitch_history.append(pitch)

        # --- Compute scores ---
        volume_consistency = self._compute_volume_consistency()
        pitch_variance_score = self._compute_pitch_score()
        voice_steadiness = self._compute_voice_steadiness(volume_consistency, pitch_variance_score)

        return {
            'rms': round(rms, 1),
            'pitch_hz': round(pitch, 1) if pitch else None,
            'is_silent': is_silent,
            'volume_consistency': volume_consistency,
            'pitch_score': pitch_variance_score,
            'voice_steadiness': voice_steadiness,
            'silence_gap_count': len(self.silence_gaps),
            'timestamp': round(elapsed, 1),
        }

    def _estimate_pitch(self, samples, sample_rate):
        """Estimate fundamental frequency using autocorrelation.
        Returns pitch in Hz or None if unvoiced/silent."""

        # Need enough samples for reliable pitch detection
        if len(samples) < 256:
            return None

        # Normalize
        if np.max(np.abs(samples)) < 100:  # Too quiet to detect pitch
            return None

        samples = samples - np.mean(samples)

        # Autocorrelation via numpy
        # Only compute for lag range corresponding to 80-400 Hz
        min_lag = int(sample_rate / 400)  # 400 Hz -> lag 40 at 16kHz
        max_lag = int(sample_rate / 80)   # 80 Hz -> lag 200 at 16kHz

        if max_lag >= len(samples):
            max_lag = len(samples) - 1

        if min_lag >= max_lag:
            return None

        # Compute autocorrelation for the relevant lag range
        autocorr = np.correlate(samples[:max_lag * 2], samples[:max_lag * 2], mode='full')
        autocorr = autocorr[len(autocorr) // 2:]  # Take positive lags only

        if len(autocorr) <= max_lag:
            return None

        # Find the peak in the valid range
        search_range = autocorr[min_lag:max_lag + 1]
        if len(search_range) == 0:
            return None

        peak_idx = np.argmax(search_range) + min_lag

        # Check if the peak is significant (>0.3 of zero-lag value)
        if autocorr[0] == 0 or autocorr[peak_idx] / autocorr[0] < 0.3:
            return None

        pitch = sample_rate / peak_idx
        return pitch

    def _compute_volume_consistency(self):
        """Compute volume consistency score (0-100).
        Low coefficient of variation = steady volume = high score."""
        if len(self.rms_history) < 3:
            return 50

        values = list(self.rms_history)
        # Filter out silent frames for consistency calculation
        voiced = [v for v in values if v > self.silence_threshold]
        if len(voiced) < 3:
            return 50

        mean_rms = np.mean(voiced)
        if mean_rms < 1:
            return 50

        cv = np.std(voiced) / mean_rms  # Coefficient of variation

        # CV < 0.2 = very steady (score 100)
        # CV > 0.8 = very unsteady (score 20)
        score = max(20, min(100, int(100 - cv * 100)))
        return score

    def _compute_pitch_score(self):
        """Compute pitch variance score (0-100).
        Moderate variance = natural speech = high score.
        Very low = monotone = low. Very high = nervous = low."""
        if len(self.pitch_history) < 5:
            return 50

        pitches = list(self.pitch_history)
        mean_pitch = np.mean(pitches)
        if mean_pitch < 1:
            return 50

        # Normalized pitch variance (relative to mean)
        cv = np.std(pitches) / mean_pitch

        # Sweet spot: CV around 0.05-0.15 (natural speech variation)
        # Too low (<0.03): monotone
        # Too high (>0.25): nervous/erratic
        if 0.05 <= cv <= 0.15:
            score = 90
        elif 0.03 <= cv < 0.05:
            score = 60  # Slightly monotone
        elif 0.15 < cv <= 0.25:
            score = 65  # Slightly erratic
        elif cv < 0.03:
            score = 35  # Very monotone
        else:
            score = 30  # Very erratic

        return score

    def _compute_voice_steadiness(self, volume_score, pitch_score):
        """Combine volume + pitch into overall voice steadiness (0-100).
        Volume consistency: 60% weight
        Pitch naturalness: 40% weight"""
        return int(volume_score * 0.6 + pitch_score * 0.4)

    def get_voice_steadiness_score(self):
        """Get current voice steadiness score."""
        vol = self._compute_volume_consistency()
        pitch = self._compute_pitch_score()
        return self._compute_voice_steadiness(vol, pitch)

    def get_silence_gaps(self):
        """Get all detected silence gaps (>2 seconds)."""
        # Check if currently in a silence gap
        result = list(self.silence_gaps)
        if self.silence_start is not None:
            elapsed = time.time() - self.start_time if self.start_time else 0
            current_gap = elapsed - self.silence_start
            if current_gap >= 2.0:
                result.append({
                    'start': round(self.silence_start, 1),
                    'duration': round(current_gap, 1),
                })
        return result

    def get_summary(self):
        """Get overall audio analysis summary."""
        return {
            'volume_consistency': self._compute_volume_consistency(),
            'pitch_score': self._compute_pitch_score(),
            'voice_steadiness': self.get_voice_steadiness_score(),
            'silence_gaps': self.get_silence_gaps(),
            'silence_gap_count': len(self.get_silence_gaps()),
            'chunks_processed': self.chunks_processed,
        }

    def _empty_result(self, elapsed):
        return {
            'rms': 0, 'pitch_hz': None, 'is_silent': True,
            'volume_consistency': 50, 'pitch_score': 50,
            'voice_steadiness': 50, 'silence_gap_count': len(self.silence_gaps),
            'timestamp': round(elapsed, 1),
        }

    def reset(self):
        """Clear all state."""
        self.rms_history.clear()
        self.pitch_history.clear()
        self.silence_gaps = []
        self.silence_start = None
        self.last_speech_time = None
        self.start_time = None
        self.chunks_processed = 0
