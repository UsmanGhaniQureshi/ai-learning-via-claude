"""
Audio Pipeline — Production-grade speech analysis.
Uses: Silero VAD, PYIN (librosa) for pitch, acoustic filler detection,
faster-whisper for transcription with word timestamps.
"""
import numpy as np
import time
import threading
from collections import deque

# ── Lazy-loaded models (singleton pattern, thread-safe) ─────────────
_vad_model = None
_whisper_model = None
_lang_detector_model = None
_vad_lock = threading.Lock()
_whisper_lock = threading.Lock()
_lang_detector_lock = threading.Lock()


def get_vad():
    """Load Silero VAD model (once). Thread-safe."""
    global _vad_model
    # Fast path: already loaded
    if _vad_model is not None:
        return _vad_model
    with _vad_lock:
        # Re-check inside lock (double-checked locking)
        if _vad_model is None:
            import torch
            _vad_model, _ = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                trust_repo=True,
            )
    return _vad_model


def get_whisper():
    """Load faster-whisper model (once).

    Environment variables:
      WHISPER_MODEL (default: "distil-small.en")
        Options:
          tiny.en           — 40MB, fast CPU, poor accuracy
          base.en           — 75MB, CPU-friendly, OK accuracy
          small.en          — 250MB, slow CPU but accurate
          distil-small.en   — 166MB, ~2x faster than small.en, same accuracy  ★
          medium.en         — 770MB, GPU required for speed
          large-v3          — 1.5GB, GPU required, best accuracy

      WHISPER_DEVICE (default: "auto")
        auto | cpu | cuda

      WHISPER_COMPUTE (default: auto-selected)
        int8       — CPU optimized (default on CPU)
        int8_float16 — CPU + some float16 layers
        float16    — GPU default
        float32    — highest quality, slowest

    Production recommendations:
      - AWS CPU instance (t3.large+):  WHISPER_MODEL=distil-small.en
      - AWS GPU instance (g4dn.xlarge): WHISPER_MODEL=small.en WHISPER_DEVICE=cuda
    """
    global _whisper_model
    # Fast path: already loaded
    if _whisper_model is not None:
        return _whisper_model
    with _whisper_lock:
        # Re-check inside lock (double-checked locking)
        if _whisper_model is not None:
            return _whisper_model

        from faster_whisper import WhisperModel
        import os

        model_size = os.environ.get("WHISPER_MODEL", "distil-small.en")
        device = os.environ.get("WHISPER_DEVICE", "auto")

        # Auto-detect device
        if device == "auto":
            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
            except Exception:
                device = "cpu"

        # Auto-select compute type
        default_compute = "float16" if device == "cuda" else "int8"
        compute_type = os.environ.get("WHISPER_COMPUTE", default_compute)

        print(f"[Whisper] Loading {model_size} on {device} ({compute_type})...")
        _whisper_model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            num_workers=1,
        )
        print(f"[Whisper] Model ready.")
    return _whisper_model


def get_language_detector():
    """Load the tiny MULTILINGUAL whisper model used only for
    language detection.

    The production transcription model is `distil-small.en` — fast,
    English-only, no language detection head. To honestly enforce the
    English-only product decision we need a separate, multilingual
    model. `tiny` is ~75 MB on disk, runs ~100ms on CPU, and only
    fires once per session (on the first voiced chunk). It is NEVER
    used for transcription — that stays on the .en model.

    Override the model size with `WHISPER_LANG_DETECTOR_MODEL` if you
    want a smaller / different multilingual model. `tiny` is a good
    default for accuracy/cost; smaller multilingual models don't
    really exist in faster-whisper.
    """
    global _lang_detector_model
    if _lang_detector_model is not None:
        return _lang_detector_model
    with _lang_detector_lock:
        if _lang_detector_model is not None:
            return _lang_detector_model
        from faster_whisper import WhisperModel
        import os

        model_size = os.environ.get("WHISPER_LANG_DETECTOR_MODEL", "tiny")
        device = os.environ.get("WHISPER_DEVICE", "auto")
        if device == "auto":
            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
            except Exception:
                device = "cpu"
        # Always int8 for the detector — accuracy doesn't matter much
        # for language ID, latency does.
        compute_type = "int8" if device == "cpu" else "float16"
        print(f"[LangDetect] Loading {model_size} on {device} ({compute_type})...")
        _lang_detector_model = WhisperModel(
            model_size, device=device, compute_type=compute_type, num_workers=1,
        )
        print(f"[LangDetect] Model ready.")
    return _lang_detector_model


# ── Lexical fillers (detected from transcript) ──────────────────────
# Narrowed to true hesitation/placeholder sounds. The earlier set also
# flagged legitimate discourse markers — "so", "right", "okay", "well",
# "basically", "actually", "literally", "kind of", "sort of" — which
# real presenters use to structure their thinking ("So the key point is
# ..."). Penalising them reads as punishing normal speech.
#
# Kept: canonical fillers ("um", "uh", "erm", "ah") plus overused verbal
# padding ("like", "you know", "i mean"). Everything else is the user's
# style, not a problem to solve.
LEXICAL_FILLERS = {
    "um", "uh", "erm", "ah", "er", "uhm", "hmm", "mm",
    "like", "you know", "i mean",
}

# ── Hallucination phrases that Whisper emits on silence/noise ───────
# Whisper's training set is heavy with YouTube captioning, so given
# near-silent audio it falls back on stock channel-outro phrases. Drop
# any segment whose normalised text matches one of these. Expanded from
# the openai/whisper issue tracker and observed failure cases.
HALLUCINATION_BLACKLIST = {
    # Outros
    "thank you", "thanks", "thanks for watching", "thanks for listening",
    "thank you for watching", "thank you for listening",
    "thank you so much", "thank you very much",
    # Channel prompts
    "please subscribe", "subscribe to the channel",
    "don't forget to subscribe",
    "like and subscribe", "like, comment, and subscribe",
    "hit the like button", "smash the like button",
    "share this video", "comment below",
    # Sign-offs
    "bye", "bye bye", "goodbye", "see you next time",
    "see you in the next video", "until next time",
    "peace", "peace out", "cheers", "take care",
    # Captioning artifacts
    "transcribed by", "transcription by", "transcribed by esv",
    "captions by", "subtitled by",
    "auto generated by", "auto-generated subtitles",
    "music", "[music]", "(music)", "applause", "[applause]",
    # Single-token junk
    "you", "you.", ".", "!", "?", "", "the", "a", "oh", "uh huh",
}


def _normalise_phrase(text: str) -> str:
    """Lowercase, strip surrounding whitespace and trailing punctuation."""
    return text.strip().lower().rstrip(".,!?").strip()


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

    Hallucination guards:
    - vad_filter=True: skip silent regions (prevents "thanks for watching" hallucinations)
    - no_speech_threshold=0.6: reject chunks model thinks are silent
    - log_prob_threshold=-1.0: reject low-confidence transcriptions
    - compression_ratio_threshold=2.4: reject repetitive hallucinations
    - Reject low-probability words at the output stage

    Language handling:
    - On English-only models (names ending in ".en") we always pass
      language="en" — the model has no detect head.
    - On multilingual models, if WHISPER_AUTODETECT is set we let Whisper
      detect the language and surface (language, language_probability)
      on the returned dict so callers can warn users about non-English
      speech or low-confidence detections. Otherwise we default to "en".

    Returns: {"words": [...], "language": str, "language_probability": float,
              "low_confidence": bool}
    """
    import os
    whisper = get_whisper()

    auto = os.environ.get("WHISPER_AUTODETECT", "").lower() in ("1", "true", "yes")
    model_name = os.environ.get("WHISPER_MODEL", "distil-small.en")
    english_only_model = model_name.endswith(".en")
    language_kwarg = None if (auto and not english_only_model) else "en"

    # Per-word probability cutoff. Whisper assigns lower probabilities to
    # accented English (Indian, Nigerian, Singaporean, etc.) even when the
    # transcription is correct — so a tight cutoff silently drops real
    # words for non-native speakers, which then deflates their WPM /
    # filler_rate denominators and biases the scoring against them.
    #
    # Default lowered from 0.15 → 0.05 for accent fairness: a previous
    # audit measured native US-English words coming back at 0.4-0.9
    # probability, while accented English words landed in the 0.08-0.12
    # range even when transcribed correctly. The 0.15 cutoff was
    # systematically dropping legitimate words from non-native speakers,
    # cutting their `total_words` denominator and inflating the apparent
    # filler rate. 0.05 still excludes random-noise hallucinations
    # (which rarely clear 0.03) but keeps real accented speech in.
    # Operators can still override with the WHISPER_WORD_PROB_MIN env
    # var if they need it stricter for a specific deployment.
    try:
        word_prob_min = float(os.environ.get("WHISPER_WORD_PROB_MIN", "0.05"))
    except ValueError:
        word_prob_min = 0.05

    segments, info = whisper.transcribe(
        audio, language=language_kwarg,
        word_timestamps=True,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 700, "threshold": 0.6},
        no_speech_threshold=0.85,
        log_prob_threshold=-0.7,
        compression_ratio_threshold=2.2,
        initial_prompt="",
        temperature=0.0,
    )

    detected_lang = getattr(info, "language", "en") or "en"
    detected_prob = float(getattr(info, "language_probability", 1.0) or 1.0)
    # English-only models lie about language_probability (always ~1.0 for
    # "en") because they have no choice. Only trust the signal when we
    # actually asked Whisper to detect.
    low_confidence = False
    if auto and not english_only_model:
        low_confidence = (detected_lang != "en") or (detected_prob < 0.5)

    words = []
    for seg in segments:
        # Reject low-quality segments (likely hallucinations on silence/noise)
        if hasattr(seg, 'compression_ratio') and seg.compression_ratio > 2.2:
            continue
        if hasattr(seg, 'avg_logprob') and seg.avg_logprob < -0.7:
            continue
        if hasattr(seg, 'no_speech_prob') and seg.no_speech_prob > 0.6:
            continue
        # Reject blacklisted hallucination phrases
        seg_text = _normalise_phrase(getattr(seg, 'text', ''))
        if seg_text in HALLUCINATION_BLACKLIST:
            continue
        for w in (seg.words or []):
            word = w.word.strip().lower().strip(".,!?")
            if not word:
                continue
            # Reject very low probability words (likely hallucinations).
            # Threshold is accent-fairness-tuned (see word_prob_min above).
            if w.probability < word_prob_min:
                continue
            words.append({
                "word": word,
                "start_ms": round(w.start * 1000, 1),
                "end_ms": round(w.end * 1000, 1),
                "probability": round(w.probability, 3),
                "is_filler": word in LEXICAL_FILLERS,
            })

    # If detection says non-English with high confidence, drop the
    # transcript: the English-only heuristics (filler set, hedges, WPM
    # tiers) are meaningless against another language and shipping
    # transliterated garbage harms more than an empty transcript.
    if auto and not english_only_model and detected_lang != "en" and detected_prob >= 0.7:
        words = []

    return {
        "words": words,
        "language": detected_lang,
        "language_probability": round(detected_prob, 3),
        "low_confidence": low_confidence,
    }


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

        # English-only product gate. We probe the FIRST voiced chunk of
        # each session with the multilingual `tiny` whisper model. If
        # the result is non-English with confidence > 0.6, every
        # subsequent chunk emits `unsupported_language` so callers can
        # short-circuit scoring. The probe runs at most once per
        # session (instance-level cache) to keep CPU cost down.
        self._language_probed = False
        self._unsupported_language = None  # None = English (or not yet probed)

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

        # 5. Whisper transcription — ONLY if VAD detected meaningful speech.
        # Strict gate: most webcams have an ambient noise floor that easily
        # cleared the previous (voiced_s>=0.4, rms>0.005) check, which led
        # to padded silence being fed into Whisper and hallucinated as
        # "thank you for watching". With voiced_s>=0.8s of a 3s chunk and
        # rms>0.012, real speech still passes while breathing/typing/HVAC
        # do not. Skip Whisper entirely on failure.
        words = []
        language = "en"
        language_probability = 1.0
        low_confidence = False
        rms_energy = features['rms']
        has_meaningful_speech = voiced_s >= 0.8 and rms_energy > 0.012

        # English-only language gate (Batch 2). Run the multilingual
        # detector ONCE per session on the first chunk that has real
        # speech. The production transcription model is .en (no
        # detection head), so we route through `tiny` multilingual
        # just for this probe. If non-English with confidence > 0.6,
        # mark the session unsupported and every downstream caller
        # bails out (WS stops broadcasting scores, upload + analyzer
        # short-circuit at finalize).
        if not self._language_probed and has_meaningful_speech:
            try:
                detector = get_language_detector()
                lang, prob, _all = detector.detect_language(audio)
                if lang and lang != "en" and float(prob or 0.0) > 0.6:
                    self._unsupported_language = lang
            except Exception as e:
                # Detector failure shouldn't kill the session — log and
                # carry on as if English. The transcript will still be
                # garbage if it's actually non-English, but that's no
                # worse than the pre-Batch-2 status quo.
                print(f"[LangDetect] probe failed: {e}")
            self._language_probed = True

        if has_meaningful_speech:
            try:
                result = transcribe_chunk(audio, sr)
                words = result["words"]
                language = result["language"]
                language_probability = result["language_probability"]
                low_confidence = result["low_confidence"]
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
            "language": language,
            "language_probability": language_probability,
            "language_low_confidence": low_confidence,
        }

        # 9. Compute scores (imported from signal_scorer)
        from signal_scorer import SignalScorer
        pace_score = SignalScorer.speech_pace(words, vad_segments)
        # speech_pace returns None for silence/near-silence chunks so we
        # can exclude them from the session-wide average rather than let
        # a hard zero drag it down. For display in this chunk we fall
        # back to None → the aggregate skipper handles it; downstream
        # consumers use `50` only when they explicitly want a default.
        if pace_score is not None:
            # Apply silence gap penalty only when we actually scored
            # pace (>2 s gaps in a speaking chunk still deserve the
            # penalty — the silence_penalty sees the real vad_segments).
            silence_pen = SignalScorer.silence_penalty(vad_segments, chunk_duration_ms=3000)
            pace_score = max(0, pace_score - silence_pen)

        # Pass voiced_s through to every audio-derived scorer so a
        # silent chunk yields None (no measurement), not a fake
        # number. The aggregate() then renormalizes the remaining
        # weights — and on a fully silent chunk every audio signal
        # is None, so total is None too. This is the single biggest
        # accuracy fix for the "silent user scores 70+" failure.
        scores = {
            "voice_steadiness": SignalScorer.voice_steadiness(pitch, rms_std, voiced_s=voiced_s),
            "speech_pace": pace_score,
            "filler_words": SignalScorer.filler_words(
                len(lexical_fillers), len(acoustic_fillers), voiced_s
            ),
            "vocal_variety": SignalScorer.vocal_variety(pitch, voiced_s=voiced_s),
            # eye_contact and expression filled by caller (face engine
            # or, when no face data, left as None — see SignalScorer.aggregate
            # which now renormalizes around any None signals).
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
            # `detected_language` from Whisper is always "en" because
            # the production transcription model is .en — it doesn't
            # actually detect. The honest answer comes from
            # `unsupported_language` below, which is set by the
            # multilingual probe in process_chunk.
            "detected_language": language,
            "language_confidence": language_probability,
            # English-only product gate. None means "looked English (or
            # not yet probed)"; a string is the detected non-English
            # language code (e.g. "hi", "es", "ar"). Once set on an
            # AudioPipeline instance, it stays set for every
            # subsequent chunk so callers can short-circuit at any
            # point in the session.
            "unsupported_language": self._unsupported_language,
        }

    def reset(self):
        """Reset pipeline state for a new session."""
        self.rms_history.clear()
        self.chunk_count = 0
        self.total_words = []
        self.total_acoustic_fillers = []
        self.start_time = time.time()
        self._language_probed = False
        self._unsupported_language = None
