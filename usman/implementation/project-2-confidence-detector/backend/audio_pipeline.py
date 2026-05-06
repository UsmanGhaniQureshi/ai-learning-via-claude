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

# Fix 1: Whisper inference is gated to one concurrent call across the
# whole process. faster-whisper / ctranslate2 already uses `num_workers`
# threads internally for its own decoding; running multiple Python-level
# transcribe() calls simultaneously would multiply RSS by N (each call
# allocates its own KV-cache and feature buffers) and starve those
# internal worker threads of CPU. The chunk-level ThreadPoolExecutor in
# the audio worker submits 4 chunks at a time so PYIN / acoustic-
# fillers run in parallel; the Whisper transcribe call inside each
# chunk acquires this lock, runs serially, and lets the next worker
# proceed. A `Lock` is functionally identical to `Semaphore(1)` here
# but cheaper and clearer in intent.
_whisper_call_lock = threading.Lock()

# Fix 1: Silero VAD is a TorchScript LSTM with INTERNAL hidden state
# (`self._state` on the model) that is mutated on every call to
# `get_speech_timestamps`. Concurrent calls from worker threads race
# on that state and crash with TorchScript "RuntimeError: NYI" when
# the LSTM hidden tensor's shape gets out of sync with the cell tensor.
# Gate it the same way as Whisper. VAD is fast (~20–30 ms / 3 s chunk)
# so serialising costs <1 s of total wall time across 44 chunks while
# the parallel workers keep doing PYIN / fillers / trembling.
_vad_call_lock = threading.Lock()


def get_vad():
    """Load Silero VAD model (once). Thread-safe.

    Uses the `silero-vad` PyPI package (pinned in requirements.txt),
    which bundles the model weights — no `torch.hub.load(...)` trip
    to GitHub at runtime. The hub path was fragile in production:
    a partial download leaves `~/.cache/torch/hub/snakers4_silero-vad_master/`
    on disk but missing `hubconf.py`, after which every subsequent
    load fails with FileNotFoundError until the cache dir is wiped.
    The PyPI loader has no filesystem cache and no network call.
    """
    global _vad_model
    # Fast path: already loaded
    if _vad_model is not None:
        return _vad_model
    with _vad_lock:
        # Re-check inside lock (double-checked locking)
        if _vad_model is None:
            from silero_vad import load_silero_vad
            _vad_model = load_silero_vad()
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
        # Fix 1: num_workers raised from 1 → 4 so ctranslate2 can use
        # multiple threads for its OWN decoding (encoder, attention,
        # generation). This is internal to one transcribe() call —
        # not concurrent calls (those are still gated by
        # `_whisper_call_lock`). On a 4-core CPU this typically
        # halves per-call wall time without hurting accuracy.
        _whisper_model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            num_workers=4,
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
    "um", "uh", "uhh", "erm", "ah", "er", "uhm", "hmm", "mm",
    "like", "you know", "i mean",
}

# Audit Fix 3: multi-word filler phrases. LEXICAL_FILLERS contains
# "you know" / "i mean" but Whisper outputs single tokens, so the
# `word in LEXICAL_FILLERS` check at the per-word stage never matched
# — these phrases were silently undercounted in the score's filler
# signal. This helper post-processes the words list and tags adjacent
# pairs as fillers. The emotion mixer also catches them via its own
# regex (in emotion_detector._count_phrase_hits), but the score's
# filler_words signal needs the per-word `is_filler` flag set.
_MULTIWORD_FILLER_PAIRS = (
    ("you", "know"),
    ("i", "mean"),
)


def _tag_multiword_fillers(words):
    """Mark `is_filler=True` on adjacent token pairs that form a
    multi-word filler phrase (e.g. "you know", "i mean"). Mutates the
    dicts in `words` in place AND returns the list so callers can use
    either style. Tokens are matched after lowercasing the `word`
    field; transcribe_chunk has already lowercased its outputs.
    """
    if not words:
        return words
    n = len(words)
    for i in range(n - 1):
        first = (words[i].get("word") or "").lower()
        second = (words[i + 1].get("word") or "").lower()
        for a, b in _MULTIWORD_FILLER_PAIRS:
            if first == a and second == b:
                words[i]["is_filler"] = True
                words[i + 1]["is_filler"] = True
                break
    return words

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

    Fix 6: vectorised. The previous implementation looped over ~300
    frames per chunk and called `np.fft.rfft` once per frame, which
    Python-level overhead made into one of the hotter spots in the
    audio pipeline. The math here is byte-identical: same 25 ms
    rectangular window, same 10 ms hop, same RMS / ZCR / spectral-
    centroid formulae, same thresholds. The only change is that
    `np.fft.rfft` runs ONCE on a (n_frames, frame_len) view of the
    audio (numpy dispatches to FFTW under the hood and reuses one FFT
    plan across all rows) and the per-frame statistics are computed
    with vector ops.
    """
    frame_len = int(0.025 * sr)  # 25ms frames
    hop = int(0.010 * sr)        # 10ms hop
    if len(audio) < frame_len:
        return []

    # Build a (n_frames, frame_len) view via stride-tricks. No copy,
    # no FFT — just a view onto the raw buffer at hop-spaced offsets.
    n_frames = (len(audio) - frame_len) // hop + 1
    frames = np.lib.stride_tricks.sliding_window_view(audio, frame_len)[::hop]
    frames = frames[:n_frames]

    # Per-frame RMS, ZCR, spectral centroid — all vectorised.
    rms = np.sqrt(np.mean(frames * frames, axis=1))
    zcr = np.sum(np.abs(np.diff(np.sign(frames), axis=1)), axis=1) / (2 * frame_len)
    freqs = np.fft.rfftfreq(frame_len, 1 / sr)
    mag = np.abs(np.fft.rfft(frames, axis=1))
    mag_sum = np.sum(mag, axis=1)
    # Same `+1e-9` guard against divide-by-zero on a fully-silent frame
    # that the original loop applied.
    centroid = np.sum(freqs[None, :] * mag, axis=1) / (mag_sum + 1e-9)

    # Same gate as the loop: voiced (low ZCR) + low centroid + moderate
    # energy. The 0.005 RMS pre-filter is folded into the AND below
    # since the vectorised path doesn't have an early-continue.
    mask = (
        (rms >= 0.005)
        & (zcr < 0.08)
        & (centroid < 600)
        & (rms > 0.01)
        & (rms < 0.15)
    )
    detection_idxs = np.flatnonzero(mask)
    detections = [(int(i) * hop / sr) * 1000 for i in detection_idxs]

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


# Fix 5: outer PYIN hop length, exported so callers can slice the
# returned f0 array per rolling window without re-running PYIN inside
# `compute_voice_trembling`. Must stay in sync with the `hop_length`
# kwarg in `extract_pitch_features`. 512 samples @ 16 kHz = 32 ms per
# F0 frame, so a 200 ms trembling window holds ~6–7 outer F0 frames.
PYIN_OUTER_HOP = 512


# ── Voice trembling: jitter + shimmer over rolling windows ─────────
def compute_voice_trembling(audio, sr=16000, vad_segments=None,
                            window_ms=200, hop_ms=100,
                            f0_array=None, voiced_flag_array=None):
    """Detect voice trembling/shivering via period-to-period jitter
    (pitch instability) and amplitude shimmer (loudness instability)
    over short rolling windows.

    Spec: 100-300ms windows. We use 200 ms windows hopped by 100 ms,
    which gives a smooth instability curve while keeping the per-window
    pitch estimate stable enough for short utterances.

    Audit Fix 3: rolling windows are now optionally VAD-gated.
    `vad_segments` is the list of `(start_ms, end_ms)` voiced
    intervals returned by `detect_speech_boundaries`. When supplied,
    a window is only processed if it overlaps a voiced segment by at
    least 50% of its length. Without this gate, fan / HVAC / cyclic
    background noise that clears the 0.005 RMS floor was being fed
    into PYIN, which would lock onto its pseudo-periodicity and
    return unstable F0 — producing false trembling flags. Empty
    `vad_segments == []` means "no voiced regions in this chunk"
    and skips ALL windows, returning a clean no-measurement result.
    Passing `None` (the default) preserves the pre-fix behaviour
    for any caller that doesn't have VAD output available.

    Definitions (Praat-style, "local"):
      jitter (local)  = mean(|T_i - T_{i-1}|) / mean(T)            [%]
      shimmer (local) = mean(|A_i - A_{i-1}|) / mean(A)            [%]

    where T_i is the i-th glottal period (1 / F0_i) and A_i is the
    peak amplitude of the i-th cycle. Both are computed inside each
    rolling window, then averaged across windows that contained
    enough voiced cycles to be reliable.

    Threshold (Praat reference):
      jitter (local) > 1.040%  → outside normal range
      shimmer (local) > 3.810% → outside normal range
    We flag `is_trembling=True` when EITHER metric exceeds its
    threshold AND a derived `instability` score (combined, normalised
    to 0-1) is above 0.35. The threshold-pair gate removes false
    positives from a single noisy window.

    Returns:
        {
          "jitter_pct":   float,   # 0-30 typical, normal speech 0.5-1.5
          "shimmer_pct":  float,   # 0-30 typical, normal speech 1-4
          "instability":  float,   # 0-1 combined score
          "is_trembling": bool,
          "windows":      int,     # number of windows that contributed
        }
    """
    import librosa

    if audio is None or len(audio) < int(0.2 * sr):
        return {
            "jitter_pct": 0.0,
            "shimmer_pct": 0.0,
            "instability": 0.0,
            "is_trembling": False,
            "windows": 0,
        }

    win = int(window_ms / 1000 * sr)
    hop = int(hop_ms / 1000 * sr)
    win = max(win, int(0.1 * sr))
    hop = max(hop, int(0.05 * sr))

    jitters: list[float] = []
    shimmers: list[float] = []
    valid_windows = 0

    for start in range(0, len(audio) - win + 1, hop):
        seg = audio[start:start + win]
        seg_rms = float(np.sqrt(np.mean(seg ** 2)))
        if seg_rms < 0.005:
            continue  # skip silent windows

        # Audit Fix 3: VAD overlap gate. The 0.005 RMS floor lets
        # quiet cyclic noise (fans, HVAC) through, which PYIN then
        # treats as voice. If the caller supplied vad_segments, only
        # process windows that genuinely overlap voiced speech by
        # ≥50% of their duration.
        if vad_segments is not None:
            win_start_ms = (start / sr) * 1000.0
            win_end_ms = win_start_ms + window_ms
            overlap_ms = 0.0
            for seg_start_ms, seg_end_ms in vad_segments:
                overlap_ms += max(
                    0.0,
                    min(seg_end_ms, win_end_ms)
                    - max(seg_start_ms, win_start_ms),
                )
            if overlap_ms < 0.5 * window_ms:
                continue  # window sits in silence/noise, not speech

        # --- Pitch periods for this window ---
        # Fix 5: when the caller passes the chunk-level f0_array (and
        # matching voiced_flag_array) from the outer PYIN run in
        # `extract_pitch_features`, slice it instead of running a fresh
        # per-window PYIN. The outer PYIN runs once per chunk; without
        # this fix it ran one MORE time per rolling window
        # (≈21 PYIN calls per chunk × 44 chunks = ≈924 PYIN calls per
        # 2-min video). Slicing the outer array preserves the
        # jitter/shimmer math byte-for-byte — only the source of the
        # F0 samples changes.
        if f0_array is not None and voiced_flag_array is not None:
            frame_dur_s = PYIN_OUTER_HOP / sr  # 32 ms
            f0_lo = int((start / sr) / frame_dur_s)
            f0_hi = int(np.ceil((start + win) / sr / frame_dur_s))
            f0_lo = max(0, f0_lo)
            f0_hi = min(len(f0_array), f0_hi)
            if f0_hi <= f0_lo:
                continue
            f0_window = f0_array[f0_lo:f0_hi]
            voiced_window = voiced_flag_array[f0_lo:f0_hi]
            # `f0` is what the legacy PYIN call returned: voiced-only.
            f0 = f0_window[voiced_window]
        else:
            # Legacy path — kept for callers that don't yet pass the
            # chunk-level F0 array (live WS, audio analyzer paths
            # routed elsewhere).
            try:
                f0, voiced_flag, _ = librosa.pyin(
                    seg,
                    fmin=librosa.note_to_hz('C2'),
                    fmax=librosa.note_to_hz('C7'),
                    sr=sr,
                    frame_length=min(1024, max(256, win // 2)),
                    hop_length=max(64, win // 16),
                )
            except Exception:
                continue
            f0 = f0[voiced_flag] if f0 is not None else None
        if f0 is None or len(f0) < 4:
            continue
        # Drop NaN / inf entries that PYIN can leave in `voiced=True`
        # frames at the edges of the window. This was previously done
        # AFTER the period inversion below, but with the slicing path
        # the F0 array can contain raw NaNs at unvoiced edges so we
        # filter here too — math is identical.
        f0 = f0[np.isfinite(f0)]
        if len(f0) < 4:
            continue

        periods = 1.0 / f0  # seconds
        # Drop NaNs / infs introduced by pyin on edge frames.
        periods = periods[np.isfinite(periods)]
        if len(periods) < 4:
            continue

        mean_T = float(np.mean(periods))
        if mean_T <= 0:
            continue
        # Local jitter (%): mean(|T_i - T_{i-1}|) / mean(T) * 100.
        jitter_local = float(np.mean(np.abs(np.diff(periods)))) / mean_T * 100.0

        # --- Cycle-peak amplitudes for shimmer ---
        # Approximate per-cycle peak: split the window into len(periods)
        # equal sub-segments and take the absolute peak of each. Crude
        # but stable when F0 is ~constant inside one window.
        n_cycles = len(periods)
        seg_per_cycle = len(seg) // max(n_cycles, 1)
        if seg_per_cycle < 4:
            continue
        peaks = np.array([
            float(np.max(np.abs(seg[i * seg_per_cycle:(i + 1) * seg_per_cycle])))
            for i in range(n_cycles)
            if (i + 1) * seg_per_cycle <= len(seg)
        ])
        peaks = peaks[peaks > 0]
        if len(peaks) < 4:
            continue
        mean_A = float(np.mean(peaks))
        # Reject windows that are too quiet to measure shimmer reliably.
        # On near-silent audio the cycle-peak-to-peak ratio is dominated
        # by noise, not real voice shimmer — and the user-visible
        # artefact is shimmer values 5-10× the physiological maximum,
        # which then inflates `instability` and the `nervous` emotion
        # label. A clean recording from a quiet speaker (peak ~0.04+)
        # passes this gate; only sub-noise-floor windows get skipped.
        # The cap on `shimmer_local` is a second-line defence: real
        # human voice shimmer rarely exceeds ~10%, so anything above
        # 15 is noise artifact and shouldn't drive the score upward.
        MIN_PEAK_AMP = 0.01
        SHIMMER_PHYS_MAX = 15.0
        if mean_A < MIN_PEAK_AMP:
            continue
        shimmer_local = float(np.mean(np.abs(np.diff(peaks)))) / mean_A * 100.0
        shimmer_local = min(shimmer_local, SHIMMER_PHYS_MAX)

        jitters.append(jitter_local)
        shimmers.append(shimmer_local)
        valid_windows += 1

    if valid_windows == 0:
        return {
            "jitter_pct": 0.0,
            "shimmer_pct": 0.0,
            "instability": 0.0,
            "is_trembling": False,
            "windows": 0,
        }

    jitter_avg = float(np.mean(jitters))
    shimmer_avg = float(np.mean(shimmers))

    # Combined instability score, 0-1. We anchor 1.0 at "clearly
    # outside normal" (jitter ~3%, shimmer ~10%) and 0.0 at the Praat
    # normal-speech band. The square-root keeps the curve responsive
    # at low values rather than flat-zero up to threshold.
    j_norm = max(0.0, (jitter_avg - 0.5) / 2.5)   # 0.5%→0, 3%→1
    s_norm = max(0.0, (shimmer_avg - 2.0) / 8.0)  # 2%→0, 10%→1
    instability = float(np.clip(0.6 * min(j_norm, 1.5) + 0.4 * min(s_norm, 1.5), 0.0, 1.0))

    # Praat thresholds with a small margin so single-window noise
    # doesn't trip the flag.
    PRAAT_JITTER = 1.04
    PRAAT_SHIMMER = 3.81
    is_trembling = (
        (jitter_avg > PRAAT_JITTER or shimmer_avg > PRAAT_SHIMMER)
        and instability > 0.35
    )

    return {
        "jitter_pct": round(jitter_avg, 3),
        "shimmer_pct": round(shimmer_avg, 3),
        "instability": round(instability, 3),
        "is_trembling": bool(is_trembling),
        "windows": int(valid_windows),
    }


# ── Pitch extraction via PYIN ────────────────────────────────────────
def extract_pitch_features(audio, sr=16000, vad_segments=None,
                           return_raw=False):
    """
    Uses PYIN (librosa) — far more accurate than naive FFT for speech F0.
    Also measures voice tremor (4-12 Hz modulation of pitch).

    Structural Fix 2: when `vad_segments` is supplied we additionally
    return `segment_pitch_means` — one entry per voiced segment,
    holding the mean F0 across the frames that fall inside that
    segment. The downstream report builder uses these values to
    detect inter-segment pitch jumps consistent with multiple
    speakers (heuristic, not real diarisation). PYIN runs once for
    everything; the per-segment slicing is pure numpy indexing.

    Fix 5: when `return_raw=True` we also include the per-frame F0
    array and voiced_flag in the result under `_f0` and
    `_voiced_flag`. Callers (e.g. `compute_voice_trembling`) can
    slice these per rolling window instead of running a fresh PYIN
    inside their own window loop. Underscore-prefixed keys to make
    it clear the caller is responsible for popping them BEFORE the
    dict is JSON-serialized — numpy arrays do not survive
    `json.dumps`.
    """
    import librosa
    from scipy.signal import butter, filtfilt

    PYIN_HOP = PYIN_OUTER_HOP  # see PYIN_OUTER_HOP comment above
    f0, voiced_flag, _ = librosa.pyin(
        audio,
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C7'),
        sr=sr,
        frame_length=2048,
        hop_length=PYIN_HOP,
    )

    voiced_f0 = f0[voiced_flag]
    # Audit Fix 8: minimum voiced-frame count for a stable pitch std
    # estimate is 15 frames (~150ms at the default PYIN frame rate),
    # not 5. Five frames is roughly 50ms — far too little to compute
    # a meaningful standard deviation; brief vocalisations were
    # producing noisy vocal_variety scores instead of "no data".
    if len(voiced_f0) < 15:
        out = {
            "mean_hz": 0,
            "std_hz": 0,
            "range_hz": 0,
            "tremor_score": 0,
            "segment_pitch_means": [],
        }
        if return_raw:
            out["_f0"] = f0
            out["_voiced_flag"] = voiced_flag
        return out

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

    # Structural Fix 2: per-VAD-segment pitch means. Each PYIN frame
    # i covers approximately [i * PYIN_HOP / sr, (i+1) * PYIN_HOP / sr]
    # seconds. We walk vad_segments and average voiced F0 inside
    # each. Skipped if vad_segments is None (callers that don't
    # provide it just don't get the field). At least 5 voiced frames
    # are required per segment for a stable mean, otherwise the
    # segment is omitted.
    segment_pitch_means: list[float] = []
    if vad_segments:
        frame_dur_s = PYIN_HOP / sr
        for seg_start_ms, seg_end_ms in vad_segments:
            f0_lo = int((seg_start_ms / 1000.0) / frame_dur_s)
            f0_hi = int(np.ceil((seg_end_ms / 1000.0) / frame_dur_s))
            f0_lo = max(0, f0_lo)
            f0_hi = min(len(f0), f0_hi)
            if f0_hi <= f0_lo:
                continue
            seg_f0 = f0[f0_lo:f0_hi]
            seg_voiced = voiced_flag[f0_lo:f0_hi]
            seg_f0_voiced = seg_f0[seg_voiced]
            seg_f0_voiced = seg_f0_voiced[np.isfinite(seg_f0_voiced)]
            if len(seg_f0_voiced) < 5:
                continue
            segment_pitch_means.append(float(np.mean(seg_f0_voiced)))

    out = {
        "mean_hz": float(np.mean(voiced_f0)),
        "std_hz": float(np.std(voiced_f0)),
        "range_hz": float(np.ptp(voiced_f0)),
        "tremor_score": measure_tremor(voiced_f0),
        "segment_pitch_means": segment_pitch_means,
    }
    if return_raw:
        out["_f0"] = f0
        out["_voiced_flag"] = voiced_flag
    return out


# ── VAD: Speech boundary detection ──────────────────────────────────
def detect_speech_boundaries(audio, sr=16000):
    """
    Uses Silero VAD to find speech vs silence segments.
    Returns list of (start_ms, end_ms) tuples for speech segments.

    Audit Fix 10: the VAD threshold is now overridable via the
    `VAD_THRESHOLD` environment variable (default 0.5). Operators
    deploying in noisy environments (open offices, outdoor capture)
    can raise it to reduce false-voiced detections without a code
    change.
    """
    import os
    import torch
    tensor = torch.FloatTensor(audio)
    vad = get_vad()

    try:
        vad_threshold = float(os.environ.get("VAD_THRESHOLD", "0.5"))
    except ValueError:
        vad_threshold = 0.5

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
        # Fix 1: Silero VAD's TorchScript LSTM keeps hidden state
        # (`self._state`) on the model object. Concurrent threads
        # racing on that state crash with "RuntimeError: NYI" when
        # the h/c tensor shapes desync. Serialise the call.
        with _vad_call_lock:
            ts = get_speech_timestamps(
                tensor, vad,
                threshold=vad_threshold,
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

    # Fix 1: gate the transcribe call behind a single process-wide lock.
    # The chunk-level ThreadPoolExecutor in the audio worker submits up
    # to 4 chunks concurrently — VAD / PYIN / acoustic-fillers all run
    # in parallel — but only one chunk at a time enters Whisper. Inside
    # the lock the call is allowed to use its full `num_workers=4` of
    # internal ctranslate2 threading.
    #
    # Fix 1: explicit beam_size=1 (greedy). faster-whisper's library
    # default is 5; greedy is ~2.5–4× faster at temperature 0 with
    # negligible WER difference on clean presentation speech (and
    # WPM / filler counts are unchanged within tolerance — verified in
    # accuracy tests). Operators can flip back to beam=5 for known-noisy
    # deployments via the WHISPER_BEAM env var.
    try:
        beam_size = int(os.environ.get("WHISPER_BEAM", "1"))
    except ValueError:
        beam_size = 1
    with _whisper_call_lock:
        segments, info = whisper.transcribe(
            audio, language=language_kwarg,
            beam_size=beam_size,
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
        # Materialise the generator inside the lock so iteration over
        # `segments` below does not race with another thread's
        # transcribe() call. faster-whisper's segment generator runs
        # decoding lazily — the actual ctranslate2 work happens as we
        # iterate, not when transcribe() returns.
        segments = list(segments)

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

    # Audit Fix 3: tag adjacent ("you","know") and ("i","mean") pairs
    # as fillers so the score's filler_words signal counts them.
    # Without this the per-word `is_filler` flag never fires for
    # multi-word entries in LEXICAL_FILLERS, even though the emotion
    # mixer detects them via regex.
    _tag_multiword_fillers(words)

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


def measure_silence_noise_rms(audio, vad_segments, sr=16000):
    """Measure background-noise RMS during the SILENCE portions of a chunk.

    Approach: build a boolean mask of "this sample is inside a VAD speech
    segment", invert it, and compute RMS over the unvoiced samples only.
    During real silence (no fan, no chair creak, no traffic) this comes
    out near 0. Noisy environments push it up — a typing keyboard runs
    around 0.01-0.02, an open window with traffic around 0.02-0.05.

    Returns None when there is < 0.4 s of silence in the chunk
    (essentially "they were talking the entire 3 s, can't measure
    background noise"). Callers then carry the previous chunk's
    estimate forward via the caller-side rolling history.
    """
    if len(audio) == 0:
        return None
    n = len(audio)
    speech_mask = np.zeros(n, dtype=bool)
    for start_ms, end_ms in vad_segments or []:
        i0 = max(0, int(start_ms / 1000 * sr))
        i1 = min(n, int(end_ms / 1000 * sr))
        if i1 > i0:
            speech_mask[i0:i1] = True
    silent = audio[~speech_mask]
    # Need at least 0.4 s of silence to get a stable RMS estimate.
    if len(silent) < int(0.4 * sr):
        return None
    return float(np.sqrt(np.mean(silent ** 2)))


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

        # Fix 1: locks to make `process_chunk` safe to call from
        # multiple worker threads (the upload worker submits up to 4
        # chunks concurrently to a ThreadPoolExecutor). _state_lock
        # guards the rolling history + counters; _lang_probe_lock
        # ensures the multilingual `tiny` probe runs at most once
        # per session even when 4 chunks all reach the gate at the
        # same time.
        self._state_lock = threading.Lock()
        self._lang_probe_lock = threading.Lock()

        # English-only product gate. Multi-strike confirmation: we
        # probe each `has_meaningful_speech` chunk with the
        # multilingual `tiny` whisper model until we either confirm
        # English (one English detection) or rack up TWO CONSECUTIVE
        # non-English detections at high confidence. Audit Fix 5
        # raised the per-strike threshold from 0.6 → 0.85 and added
        # the consecutive-strike requirement so heavily-accented
        # English speakers — who occasionally probe as Hindi/Spanish
        # at 0.65-0.80 confidence on a single chunk — are not
        # falsely refused.
        self._lang_probe_strikes = 0   # consecutive non-English detections
        self._lang_probe_done = False  # True = English confirmed OR rejected
        self._unsupported_language = None  # None = English (or not yet decided)

        # Last good measurement of silence-window RMS (background
        # noise estimator). Carried across chunks so a chunk where
        # the user spoke the full 3 s still has a sensible noise
        # value. None until the first chunk with measurable silence.
        self._last_silence_rms = None

    def process_chunk(self, audio, sr=16000):
        """
        Process a single 3-second audio chunk.
        Returns dict with raw features, transcript words, and computed scores.
        """
        elapsed = time.time() - self.start_time

        # 1. VAD — speech boundaries (stateless, parallel-safe)
        vad_segments = detect_speech_boundaries(audio, sr)
        voiced_ms = sum(e - s for s, e in vad_segments)
        voiced_s = voiced_ms / 1000

        # 2. Audio features (stateless)
        features = extract_audio_features(audio, sr)

        # 2b. Background-noise RMS during the silence portions of the
        # chunk. Drives the live-HUD "Noise Level" status. Falls back
        # to the last good measurement when this chunk had no
        # measurable silence (user spoke the full 3 s).
        silence_rms_measured = measure_silence_noise_rms(audio, vad_segments, sr)

        # Fix 1: rolling-history + chunk-counter mutations under a
        # state lock so multiple worker threads (in the upload
        # ThreadPoolExecutor) cannot race. We compute rms_std INSIDE
        # the lock so the std is consistent with the deque snapshot
        # we just appended to. _last_silence_rms is also updated here
        # because the carry-forward used by the live HUD depends on
        # the most recent measurable chunk.
        with self._state_lock:
            self.chunk_count += 1
            self.rms_history.append(features['rms'])
            rms_std = (
                float(np.std(list(self.rms_history)))
                if len(self.rms_history) > 2 else 0
            )
            if silence_rms_measured is not None:
                self._last_silence_rms = silence_rms_measured
            silence_rms_carry = self._last_silence_rms
        silence_rms = (
            silence_rms_measured if silence_rms_measured is not None
            else silence_rms_carry
        )

        # 3. Pitch analysis via PYIN. Pass vad_segments through so
        # extract_pitch_features can also produce per-segment pitch
        # means (Structural Fix 2 — feeds the multi-speaker heuristic
        # in report_generator). Fix 5: also request the raw F0 array
        # so compute_voice_trembling can slice it per rolling window
        # instead of running ~20 fresh PYIN calls per chunk.
        try:
            pitch = extract_pitch_features(
                audio, sr, vad_segments=vad_segments, return_raw=True,
            )
        except Exception:
            pitch = {
                "mean_hz": 0, "std_hz": 0, "range_hz": 0,
                "tremor_score": 0, "segment_pitch_means": [],
            }
        # Fix 5: peel off the raw arrays before storing `pitch` in the
        # JSON-serialisable raw dict. Numpy arrays cannot survive
        # JSONB persistence; the trembling code consumes them and
        # they are discarded.
        f0_for_trembling = pitch.pop("_f0", None)
        voiced_flag_for_trembling = pitch.pop("_voiced_flag", None)

        # 3b. Voice trembling — jitter + shimmer over rolling 200ms windows.
        # Surfaced as both a confidence-score penalty and a UI-visible
        # signal alongside fillers / repetition / pace.
        # Audit Fix 3: pass the already-computed vad_segments so the
        # detector only processes windows that overlap real voiced
        # speech by ≥50%. Stops fan/HVAC noise from triggering false
        # trembling flags.
        # Fix 5: pass f0_array + voiced_flag so the rolling-window
        # loop slices instead of re-running PYIN per window.
        try:
            trembling = compute_voice_trembling(
                audio, sr,
                vad_segments=vad_segments,
                f0_array=f0_for_trembling,
                voiced_flag_array=voiced_flag_for_trembling,
            )
        except Exception:
            trembling = {
                "jitter_pct": 0.0, "shimmer_pct": 0.0,
                "instability": 0.0, "is_trembling": False, "windows": 0,
            }

        # 4. Acoustic filler detection (from raw audio, not text)
        acoustic_fillers = detect_filler_sounds_acoustic(audio, sr)
        with self._state_lock:
            self.total_acoustic_fillers.extend(acoustic_fillers)

        # 5. Whisper transcription — ONLY if VAD detected meaningful speech.
        # Gate has two halves:
        #   - voiced_s >= 1.2: at least 1.2 s of the 3 s chunk was voiced
        #     per Silero VAD. Filters out chunks that are mostly silence.
        #   - rms_energy > 0.012: the chunk has enough audio energy to be
        #     real speech. Any tighter than this and quietly-recorded
        #     mics (built-in laptop / desk-phone style) below the 0.02
        #     threshold lose every chunk to skip-Whisper, which leaves
        #     huge gaps in the transcript shown on the result screen.
        #
        # History: this was 0.012 originally, tightened to 0.02 after a
        # round of "thank you for watching" Whisper hallucinations on
        # near-silent webcams. The HALLUCINATION_BLACKLIST below catches
        # those phrases at the segment level, so we can hold the gate at
        # 0.012 without re-introducing them. Apr 2026: added
        # `dynaudnorm` to the upload pipeline ffmpeg so quiet recordings
        # are level-normalised before they reach this gate; live WS
        # audio still arrives un-normalised (autoGainControl=false) and
        # benefits directly from the 0.02 → 0.012 relaxation.
        words = []
        language = "en"
        language_probability = 1.0
        low_confidence = False
        rms_energy = features['rms']
        has_meaningful_speech = voiced_s >= 1.2 and rms_energy > 0.012

        # English-only language gate. Multi-strike probe: keep
        # probing each `has_meaningful_speech` chunk until we either
        # confirm English (any English detection) or accumulate TWO
        # CONSECUTIVE non-English detections at confidence > 0.85.
        # Audit Fix 5 raised the threshold from 0.6 → 0.85 and added
        # the strike requirement so accented English speakers, who
        # occasionally probe as Hindi/Spanish at 0.65-0.80 on a
        # single chunk, are not refused on a single false positive.
        # The production transcription model is .en (no detection
        # head), so we route through `tiny` multilingual just for
        # this probe.
        # Fix 1: gate the probe behind _lang_probe_lock with a double-
        # check so concurrent worker threads don't all run the
        # multilingual `tiny` model in parallel — only the first
        # thread to acquire the lock runs the probe; the rest re-check
        # `_lang_probe_done` after acquiring and skip when they see
        # the gate has flipped.
        if not self._lang_probe_done and has_meaningful_speech:
            with self._lang_probe_lock:
                if not self._lang_probe_done:
                    try:
                        detector = get_language_detector()
                        # Item 8 fix: `WhisperModel` has no `detect_language()`
                        # method (the previous call silently raised AttributeError
                        # on every probe, leaving the English-only gate disabled
                        # for all sessions). The canonical faster-whisper
                        # language-ID path is `model.transcribe(...)` — `info`
                        # is populated synchronously with `.language` and
                        # `.language_probability`. We deliberately do NOT iterate
                        # the returned segments generator: language detection
                        # finishes before any decoding work, so discarding the
                        # generator avoids paying for a full transcription on
                        # the multilingual tiny model.
                        _segments, info = detector.transcribe(
                            audio,
                            beam_size=1,
                            vad_filter=False,
                            without_timestamps=True,
                        )
                        lang = getattr(info, "language", None)
                        prob = float(getattr(info, "language_probability", 0.0) or 0.0)
                        if lang and lang != "en" and prob > 0.85:
                            # Strike. Two in a row → reject the session.
                            self._lang_probe_strikes += 1
                            if self._lang_probe_strikes >= 2:
                                self._unsupported_language = lang
                                self._lang_probe_done = True
                        else:
                            # English (or low-confidence non-English) —
                            # confirm English and stop probing. A single
                            # confident English read is enough.
                            self._lang_probe_strikes = 0
                            self._lang_probe_done = True
                    except Exception as e:
                        # Detector failure shouldn't kill the session —
                        # log and carry on as if English.
                        print(f"[LangDetect] probe failed: {e}")
                        self._lang_probe_done = True

        if has_meaningful_speech:
            try:
                result = transcribe_chunk(audio, sr)
                words = result["words"]
                language = result["language"]
                language_probability = result["language_probability"]
                low_confidence = result["low_confidence"]
            except Exception:
                words = []
        with self._state_lock:
            self.total_words.extend(words)

        # 6. Count lexical fillers in this chunk
        lexical_fillers = [w for w in words if w['is_filler']]

        # 7. Articulation rate (words per voiced second, not total time)
        word_count = len([w for w in words if len(w['word']) > 1])
        wpm = (word_count / max(voiced_s, 0.1)) * 60 if voiced_s > 0.5 else 0

        # Fix 11: per-chunk Whisper transcript-confidence aggregate.
        # Average the per-word probabilities (already capped above the
        # 0.05 accent-fairness cutoff in transcribe_chunk) so callers
        # can show "transcript was X% recognised" alongside the score.
        # This is a TRANSCRIPT quality signal, not a speaker-confidence
        # signal — the report layer must keep it out of the headline.
        kept_probs = [
            float(w.get("probability") or 0.0)
            for w in words
            if (w.get("probability") or 0.0) >= 0.05
        ]
        chunk_transcript_confidence = (
            round(sum(kept_probs) / len(kept_probs), 2) if kept_probs else None
        )

        # 9. Compute scores (imported from signal_scorer)
        from signal_scorer import SignalScorer, dedup_filler_counts
        # Bug A: dedup lexical + acoustic filler events by time overlap
        # before scoring. The two detectors fire on the same audio,
        # often catching the same filler — counting both was double-
        # charging users. dedup_filler_counts treats lexical as the
        # primary count and only retains acoustic events that don't
        # overlap any lexical filler word.
        lex_count, acu_count_deduped = dedup_filler_counts(
            lexical_filler_words=lexical_fillers,
            acoustic_filler_segments=acoustic_fillers,
        )

        # 7b. Multi-label emotion mix — combines lexical (fillers,
        # hedges, repetitions, assertive/excited tokens) with prosodic
        # signals (pitch mean/std, rms, wpm, tremor, jitter, shimmer).
        # Sums to 1.0 by construction; never binary.
        try:
            from emotion_detector import detect_emotion_mix
            emotion = detect_emotion_mix(
                words=words,
                pitch=pitch,
                rms=features['rms'],
                rms_std=rms_std,
                voiced_s=voiced_s,
                wpm=wpm,
                # Use the dedup-aware counts from `dedup_filler_counts`
                # above. Lexical and acoustic detectors regularly
                # double-fire on the same filler ("um" transcribed by
                # Whisper + same hump caught spectrally); without this
                # the emotion mixer over-counts fillers and biases
                # `nervous` / `hesitant` upwards. SignalScorer.filler_words
                # already uses these deduped counts — emotion_detector
                # was the last consumer still on the raw lengths.
                lexical_filler_count=lex_count,
                acoustic_filler_count=acu_count_deduped,
                word_count=word_count,
                trembling=trembling,
            )
        except Exception:
            emotion = {
                "mix": None, "dominant": None, "dominant_pct": None,
                "evidence": {}, "available_signals": [],
            }

        # 8. Compile raw signals for scorer
        raw = {
            "rms": features['rms'],
            "rms_std": rms_std,
            "zcr": features['zcr'],
            "spectral_centroid": features['spectral_centroid'],
            # Background-noise RMS measured over silence-only samples.
            # Drives the live-HUD "Noise Level" status. None when no
            # chunk in the session has yielded a measurable silence
            # window yet.
            "silence_rms": (
                round(silence_rms, 6) if silence_rms is not None else None
            ),
            "pitch": pitch,
            # Voice trembling — separate from `pitch.tremor_score` (which
            # is a low-frequency F0 modulation index). This block is the
            # period-to-period jitter+shimmer pair, on rolling 200ms
            # windows, that gets the dedicated UI signal + confidence
            # penalty.
            "trembling": trembling,
            "vad_segments": vad_segments,
            "voiced_s": round(voiced_s, 2),
            "acoustic_fillers": acoustic_fillers,
            # Dedup-aware count surfaced for the upload aggregator. The
            # raw event lists above stay as the unmodified ground truth
            # so a downstream consumer that wants to render filler
            # markers on a timeline sees every event. Only the COUNT
            # used for scoring goes through dedup.
            "acoustic_filler_count_deduped": acu_count_deduped,
            "lexical_fillers": [w['word'] for w in lexical_fillers],
            "lexical_filler_count": lex_count,
            "word_count": word_count,
            "wpm": round(wpm, 1),
            "timestamp": round(elapsed, 1),
            "language": language,
            "language_probability": language_probability,
            "language_low_confidence": low_confidence,
            "transcript_confidence": chunk_transcript_confidence,
        }

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
                lex_count, acu_count_deduped, voiced_s,
                word_count=word_count,
            ),
            "vocal_variety": SignalScorer.vocal_variety(pitch, voiced_s=voiced_s),
            # eye_contact and expression filled by caller (face engine
            # or, when no face data, left as None — see SignalScorer.aggregate
            # which now renormalizes around any None signals).
            "eye_contact": 50,
            "expression": 50,
            # Voice-trembling score (0-100). Pure UI signal — the
            # confidence-score penalty is applied separately inside
            # SignalScorer.aggregate based on `raw.trembling`.
            "voice_trembling": SignalScorer.voice_trembling(
                trembling, voiced_s=voiced_s,
            ),
        }
        scores["total"] = SignalScorer.aggregate(scores, trembling=trembling)

        return {
            "scores": scores,
            "raw": raw,
            # Multi-label emotion mix (sums to 1.0). Top-level so the
            # WS broadcaster, report_generator, and frontend SignalBars
            # can read it without digging through `raw`.
            "emotion": emotion,
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
        # Audit Fix 5: matching reset for the multi-strike probe state.
        self._lang_probe_strikes = 0
        self._lang_probe_done = False
        self._unsupported_language = None
        self._last_silence_rms = None
