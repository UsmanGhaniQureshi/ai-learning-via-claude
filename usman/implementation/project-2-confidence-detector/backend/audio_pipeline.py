"""
Audio Pipeline — Production-grade speech analysis.
Uses: Silero VAD, PYIN (librosa) for pitch, acoustic filler detection,
faster-whisper for transcription with word timestamps.
"""
import numpy as np
import time
from collections import deque

# ── Lazy-loaded models (singleton pattern) ──────────────────────────
_vad_model = None
_whisper_model = None


def get_vad():
    """Load Silero VAD model (once)."""
    global _vad_model
    if _vad_model is None:
        import torch
        _vad_model, _ = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            trust_repo=True,
        )
    return _vad_model


def get_whisper():
    """Load faster-whisper model (once). Uses tiny.en for speed."""
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
    return _whisper_model


# ── Lexical fillers (detected from transcript) ──────────────────────
LEXICAL_FILLERS = {
    "um", "uh", "like", "so", "basically", "literally", "actually",
    "right", "okay", "you know", "i mean", "kind of", "sort of", "well",
}


# ── Acoustic filler detection (from raw audio, NOT text) ────────────
def detect_filler_sounds_acoustic(audio, sr=16000):
    """
    Detects non-lexical fillers (ahh, umm, ehh) from raw audio.
    Acoustic signature: voiced + low spectral centroid + moderate energy.
    This catches what Whisper drops entirely.
    """
    frame_len = int(0.025 * sr)  # 25ms frames
    hop = int(0.010 * sr)        # 10ms hop
    detections = []

    for i in range(0, len(audio) - frame_len, hop):
        frame = audio[i:i + frame_len]
        rms = np.sqrt(np.mean(frame ** 2))
        if rms < 0.005:
            continue

        zcr = np.sum(np.abs(np.diff(np.sign(frame)))) / (2 * len(frame))
        freqs = np.fft.rfftfreq(len(frame), 1 / sr)
        mag = np.abs(np.fft.rfft(frame))
        centroid = float(np.sum(freqs * mag) / (np.sum(mag) + 1e-9))

        # Filler signature: voiced (low ZCR), low centroid, moderate energy
        if zcr < 0.08 and centroid < 600 and 0.01 < rms < 0.15:
            detections.append((i / sr) * 1000)

    # Merge nearby detections into segments (200ms minimum = real filler event)
    if not detections:
        return []

    segments, start, prev = [], detections[0], detections[0]
    for t in detections[1:]:
        if t - prev > 150:
            if prev - start >= 200:
                segments.append({
                    "start_ms": round(start, 1),
                    "end_ms": round(prev, 1),
                    "type": "filler_sound",
                })
            start = t
        prev = t
    if prev - start >= 200:
        segments.append({
            "start_ms": round(start, 1),
            "end_ms": round(prev, 1),
            "type": "filler_sound",
        })
    return segments


# ── Pitch extraction via PYIN ────────────────────────────────────────
def extract_pitch_features(audio, sr=16000):
    """
    Uses PYIN (librosa) — far more accurate than naive FFT for speech F0.
    Also measures voice tremor (4-12 Hz modulation of pitch).
    """
    import librosa
    from scipy.signal import butter, filtfilt

    f0, voiced_flag, _ = librosa.pyin(
        audio,
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C7'),
        sr=sr,
        frame_length=2048,
        hop_length=512,
    )

    voiced_f0 = f0[voiced_flag]
    if len(voiced_f0) < 5:
        return {"mean_hz": 0, "std_hz": 0, "range_hz": 0, "tremor_score": 0}

    def measure_tremor(f0c):
        if len(f0c) < 20:
            return 0.0
        frame_rate = sr / 512
        nyq = frame_rate / 2
        low, high = 4 / nyq, min(12 / nyq, 0.99)
        if low >= high:
            return 0.0
        b, a = butter(2, [low, high], btype='band')
        filtered = filtfilt(b, a, f0c - np.mean(f0c))
        return float(np.clip(
            np.sqrt(np.mean(filtered ** 2)) / (np.std(f0c) + 1e-6), 0, 1
        ))

    return {
        "mean_hz": float(np.mean(voiced_f0)),
        "std_hz": float(np.std(voiced_f0)),
        "range_hz": float(np.ptp(voiced_f0)),
        "tremor_score": measure_tremor(voiced_f0),
    }


# ── VAD: Speech boundary detection ──────────────────────────────────
def detect_speech_boundaries(audio, sr=16000):
    """
    Uses Silero VAD to find speech vs silence segments.
    Returns list of (start_ms, end_ms) tuples for speech segments.
    """
    import torch
    tensor = torch.FloatTensor(audio)
    vad = get_vad()

    # Try silero-vad package first, then torch.hub fallback
    try:
        from silero_vad import get_speech_timestamps
    except ImportError:
        try:
            from utils_vad import get_speech_timestamps
        except ImportError:
            # Final fallback: function may be attached to the model from torch.hub
            get_speech_timestamps = None

    if get_speech_timestamps is not None:
        ts = get_speech_timestamps(
            tensor, vad,
            threshold=0.5,
            sampling_rate=sr,
            min_speech_duration_ms=250,
            min_silence_duration_ms=100,
        )
    else:
        # Fallback: treat entire chunk as speech if no VAD available
        ts = [{'start': 0, 'end': len(audio)}]

    return [(t['start'] / sr * 1000, t['end'] / sr * 1000) for t in ts]


# ── Whisper transcription with word timestamps ──────────────────────
def transcribe_chunk(audio, sr=16000):
    """
    Transcribe audio with faster-whisper.
    word_timestamps=True + condition_on_previous_text=False
    to preserve fillers that Whisper normally suppresses.
    """
    whisper = get_whisper()
    segments, _ = whisper.transcribe(
        audio, language="en",
        word_timestamps=True,
        condition_on_previous_text=False,
        vad_filter=False,
        temperature=0.0,
    )

    words = []
    for seg in segments:
        for w in (seg.words or []):
            word = w.word.strip().lower().strip(".,!?")
            if not word:
                continue
            words.append({
                "word": word,
                "start_ms": round(w.start * 1000, 1),
                "end_ms": round(w.end * 1000, 1),
                "probability": round(w.probability, 3),
                "is_filler": word in LEXICAL_FILLERS,
            })
    return words


# ── Audio feature extraction (per-chunk) ─────────────────────────────
def extract_audio_features(audio, sr=16000):
    """Extract RMS, ZCR, spectral centroid from an audio chunk."""
    rms = float(np.sqrt(np.mean(audio ** 2)))
    zcr = float(np.mean(np.abs(np.diff(np.sign(audio)))) / 2)

    freqs = np.fft.rfftfreq(len(audio), 1 / sr)
    mag = np.abs(np.fft.rfft(audio))
    centroid = float(np.sum(freqs * mag) / (np.sum(mag) + 1e-9))

    return {
        "rms": round(rms, 6),
        "zcr": round(zcr, 4),
        "spectral_centroid": round(centroid, 1),
    }


# ══════════════════════════════════════════════════════════════════════
# MAIN PIPELINE CLASS
# ══════════════════════════════════════════════════════════════════════
class AudioPipeline:
    """
    Processes 3-second audio chunks through the full analysis pipeline.
    Designed for both live (WebSocket) and batch (file upload) use.
    """

    def __init__(self):
        # Pre-load models
        self._whisper = get_whisper()
        self._vad = get_vad()

        # Rolling state
        self.rms_history = deque(maxlen=20)
        self.chunk_count = 0
        self.total_words = []
        self.total_acoustic_fillers = []
        self.start_time = time.time()

    def process_chunk(self, audio, sr=16000):
        """
        Process a single 3-second audio chunk.
        Returns dict with raw features, transcript words, and computed scores.
        """
        self.chunk_count += 1
        elapsed = time.time() - self.start_time

        # 1. VAD — speech boundaries
        vad_segments = detect_speech_boundaries(audio, sr)
        voiced_ms = sum(e - s for s, e in vad_segments)
        voiced_s = voiced_ms / 1000

        # 2. Audio features
        features = extract_audio_features(audio, sr)
        self.rms_history.append(features['rms'])
        rms_std = float(np.std(list(self.rms_history))) if len(self.rms_history) > 2 else 0

        # 3. Pitch analysis via PYIN
        try:
            pitch = extract_pitch_features(audio, sr)
        except Exception:
            pitch = {"mean_hz": 0, "std_hz": 0, "range_hz": 0, "tremor_score": 0}

        # 4. Acoustic filler detection (from raw audio, not text)
        acoustic_fillers = detect_filler_sounds_acoustic(audio, sr)
        self.total_acoustic_fillers.extend(acoustic_fillers)

        # 5. Whisper transcription with word timestamps
        try:
            words = transcribe_chunk(audio, sr)
        except Exception:
            words = []
        self.total_words.extend(words)

        # 6. Count lexical fillers in this chunk
        lexical_fillers = [w for w in words if w['is_filler']]

        # 7. Articulation rate (words per voiced second, not total time)
        word_count = len([w for w in words if len(w['word']) > 1])
        wpm = (word_count / max(voiced_s, 0.1)) * 60 if voiced_s > 0.5 else 0

        # 8. Compile raw signals for scorer
        raw = {
            "rms": features['rms'],
            "rms_std": rms_std,
            "zcr": features['zcr'],
            "spectral_centroid": features['spectral_centroid'],
            "pitch": pitch,
            "vad_segments": vad_segments,
            "voiced_s": round(voiced_s, 2),
            "acoustic_fillers": acoustic_fillers,
            "lexical_fillers": [w['word'] for w in lexical_fillers],
            "word_count": word_count,
            "wpm": round(wpm, 1),
            "timestamp": round(elapsed, 1),
        }

        # 9. Compute scores (imported from signal_scorer)
        from signal_scorer import SignalScorer
        pace_score = SignalScorer.speech_pace(words, vad_segments)
        # Apply silence gap penalty (>2s gaps reduce speech pace score)
        silence_pen = SignalScorer.silence_penalty(vad_segments, chunk_duration_ms=3000)
        pace_score = max(0, pace_score - silence_pen)

        scores = {
            "voice_steadiness": SignalScorer.voice_steadiness(pitch, rms_std),
            "speech_pace": pace_score,
            "filler_words": SignalScorer.filler_words(
                len(lexical_fillers), len(acoustic_fillers), voiced_s
            ),
            "vocal_variety": SignalScorer.vocal_variety(pitch),
            # eye_contact and expression filled by caller (face engine or default 50)
            "eye_contact": 50,
            "expression": 50,
        }
        scores["total"] = SignalScorer.aggregate(scores)

        return {
            "scores": scores,
            "raw": raw,
            "transcript_words": words,
            "transcript_text": " ".join(w['word'] for w in words),
            "chunk_index": self.chunk_count,
        }

    def reset(self):
        """Reset pipeline state for a new session."""
        self.rms_history.clear()
        self.chunk_count = 0
        self.total_words = []
        self.total_acoustic_fillers = []
        self.start_time = time.time()
