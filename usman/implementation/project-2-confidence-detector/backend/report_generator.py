"""
Post-Session Report Generator.
Produces a comprehensive speech analysis report from session snapshots.
Used by both live sessions (on stop) and standalone audio analyzer.
"""

# Signals that the per-user baseline applies to. Both eye_contact and
# expression are face-only and intentionally excluded — too noisy
# across recordings to ground a personal mean. Filler_words and the
# 3 audio signals are stable enough.
_BASELINE_SIGNALS = (
    "voice_steadiness",
    "speech_pace",
    "filler_words",
    "vocal_variety",
)


# Calibration signals compared in build_calibration_adjusted. Order
# preserved so the per-signal panel renders consistently across
# pipelines.
_CALIB_SIGNALS = (
    "wpm", "pitch_mean", "pitch_std", "rms",
    "filler_rate", "jitter_pct", "shimmer_pct",
    "voice_steadiness", "vocal_variety",
)


def build_calibration_adjusted(user_baseline, session_raw_values):
    """Build the `calibration_adjusted` block.

    Pure function — no I/O, no closures. Used by both
    `generate_post_session_report` (live + audio paths) and the
    upload-video pipeline at main.py:_run_upload_pipeline_sync, so
    every entry point produces the same shape.

    Returns None when the user has not completed Personal Setup
    (`user_baseline` lacks a `calibration` block) — the caller
    surfaces None as `calibration_adjusted` so the frontend renders
    no panel.

    Args:
        user_baseline: dict from main.py:_fetch_user_baseline. When
            calibration is complete this contains a `calibration`
            sub-dict with tolerance_bands, rolling_baseline,
            raw_baselines, baseline_confidence, etc.
        session_raw_values: dict mapping calibration signal names to
            this session's measured raw value. Keys (any subset):
            wpm, pitch_mean, pitch_std, rms, filler_rate, jitter_pct,
            shimmer_pct, voice_steadiness, vocal_variety. Missing or
            None values are simply skipped in the per-signal panel.
    """
    if not isinstance(user_baseline, dict):
        return None
    cal = user_baseline.get("calibration")
    # Match the original inline truthy-check semantics: None, missing,
    # OR an empty dict all skip the block. An empty dict shouldn't
    # occur in practice (`_fetch_user_baseline` either sets the full
    # block or omits the key entirely) but guard regardless.
    if not cal or not isinstance(cal, dict):
        return None

    bands = cal.get("tolerance_bands") or {}
    rolling = cal.get("rolling_baseline") or {}
    raw_baselines = cal.get("raw_baselines") or {}

    per_signal_view: dict = {}
    for raw_sig in _CALIB_SIGNALS:
        base_value = (
            rolling.get(raw_sig)
            if raw_sig in rolling else raw_baselines.get(raw_sig)
        )
        sess_value = session_raw_values.get(raw_sig)
        if base_value is None or sess_value is None:
            continue
        band = bands.get(raw_sig) or {}
        delta = float(sess_value) - float(base_value)
        within_band = None
        if band:
            within_band = bool(
                band.get("lower", float("-inf")) <= sess_value <= band.get("upper", float("inf"))
            )
        direction = "above" if delta > 0 else "below" if delta < 0 else "equal"
        per_signal_view[raw_sig] = {
            "personal_baseline": round(float(base_value), 2),
            "session_value": round(float(sess_value), 2),
            "delta": round(delta, 2),
            "direction": direction,
            "within_tolerance_band": within_band,
            "tolerance_band": band or None,
        }

    sessions_since = max(0, int(cal.get("session_count") or 0))
    return {
        "is_complete": True,
        "calibration_version": cal.get("calibration_version"),
        "sessions_since_calibration": sessions_since,
        "baseline_confidence": cal.get("baseline_confidence"),
        "camera_anxiety_detected": bool(cal.get("camera_anxiety_detected")),
        "camera_anxiety_delta": cal.get("camera_anxiety_delta"),
        "blend_ratio": cal.get("blend_ratio"),
        "reliable_signals": cal.get("reliable_signals") or [],
        "provisional_signals": cal.get("provisional_signals") or [],
        "per_signal": per_signal_view,
    }


# Canonical grade table — single source of truth for backend AND frontend.
# Each tuple is (min_score_inclusive, letter, label). Iterated in descending
# threshold order. The frontend at frontend/src/pages/Result.jsx mirrors
# these exact thresholds and letters so the same numeric score yields the
# same letter in every UI surface.
GRADE_TABLE = [
    (90, "A+", "Exceptional"),
    (80, "A", "Confident"),
    (70, "B+", "Strong"),
    (60, "B", "Good"),
    (50, "C", "Developing"),
    (40, "D", "Needs work"),
    (0, "F", "Keep practicing"),
]


def generate_post_session_report(
    snapshots: list,
    session_id: str,
    user_baseline: dict | None = None,
    prompt_meta: dict | None = None,
) -> dict:
    """
    Generate a detailed post-session report from pipeline snapshots.

    snapshots: list of dicts from AudioPipeline.process_chunk()
    session_id: unique session identifier
    user_baseline: optional dict produced by main.py:_fetch_user_baseline,
        shape:
          { "ready": bool, "n_sessions": int,
            "voice_steadiness": {"mean": 75.2, "std": 8.4, "n": 5}, ... }
        When present and ready=True, the report adds
        `signal_baseline_adjusted` — per-signal scores that compare THIS
        session against the user's own running mean (z-scored, mapped
        onto a 0-100 scale anchored at 50 = the user's personal average).
        The absolute `signal_averages` is always returned alongside; the
        baseline_adjusted score is purely additive.

    Returns: full report dict with grades, insights, timeline, transcript,
    and (optionally) the baseline-adjusted scores.
    """
    if not snapshots:
        return {"error": "No data recorded", "session_id": session_id}

    all_scores = [s["scores"] for s in snapshots]
    all_raw = [s["raw"] for s in snapshots]

    signal_keys = (
        "voice_steadiness", "eye_contact", "speech_pace",
        "filler_words", "vocal_variety", "expression",
    )
    duration_s = len(snapshots) * 3

    # English-only product gate (Batch 2). The audio_pipeline probes
    # the first voiced chunk with a multilingual detector and, on
    # non-English input, sets `unsupported_language` on every chunk
    # from that point forward. Surface that here as a hard
    # short-circuit — the English-trained scorers can't be trusted on
    # other languages, so we refuse to score rather than producing
    # nonsense numbers. The `unsupported_language` field on each
    # snapshot is identical (set once per session), so we just take
    # the first non-None value.
    unsupported_lang = next(
        (s.get("unsupported_language") for s in snapshots
         if s.get("unsupported_language")),
        None,
    )
    if unsupported_lang:
        return {
            "session_id": session_id,
            "unsupported_language": unsupported_lang,
            "avg_score": None,
            "grade": None,
            "grade_label": None,
            "signal_averages": {k: None for k in signal_keys},
            "signal_stderrs": {},
            "signal_reasons": {},
            "coaching": None,
            "coaching_status": "skipped",
            "coaching_source": "rule_based",
            "coaching_skip_reason": "unsupported_language",
            "coaching_error": None,
            "wins": [],
            "improvements": [],
            "status_message": (
                "This recording doesn't appear to be in English. The app "
                "currently supports English only — please try again "
                "speaking in English."
            ),
            "duration_s": duration_s,
            "transcript": [],
            "timeline": [],
        }

    # Session-level "did anything happen?" gate. Two conditions: enough
    # voiced seconds AND enough transcribed words. Either failing
    # produces an `insufficient_speech` report instead of a fake
    # number. The voiced-seconds-only gate (3 s) wasn't enough on its
    # own — ambient noise (AC / fan / keyboard) regularly cleared the
    # per-chunk VAD threshold, accumulated past 3 s across a minute,
    # and let Whisper's hallucinated phrases ("thank you", "you")
    # masquerade as real speech in the report. Requiring at least 8
    # transcribed words across the whole session catches this: a noisy
    # silent room produces 0-3 hallucinated tokens, never 8+. Raising
    # the time floor to 5 s also helps — 3 s of voiced audio is one
    # chunk, well within ambient-noise margin. The status_message text
    # is exactly what the UI renders in place of the score gauge.
    INSUFFICIENT_SPEECH_THRESHOLD_S = 5.0
    MIN_TOTAL_WORDS = 8
    total_voiced_s = sum(r.get("voiced_s", 0) for r in all_raw)
    total_words = sum(len(s.get("transcript_words", [])) for s in snapshots)
    if total_voiced_s < INSUFFICIENT_SPEECH_THRESHOLD_S or total_words < MIN_TOTAL_WORDS:
        return {
            "session_id": session_id,
            "insufficient_speech": True,
            "avg_score": None,
            "grade": None,
            "grade_label": None,
            "signal_averages": {k: None for k in signal_keys},
            "signal_stderrs": {},
            "signal_reasons": {},
            "coaching": None,
            "coaching_status": "skipped",
            "coaching_source": "rule_based",
            "coaching_skip_reason": "insufficient_speech",
            "coaching_error": None,
            "wins": [],
            "improvements": [],
            "status_message": (
                "Not enough speech to score. Try recording again and "
                "speak for at least a few seconds."
            ),
            "duration_s": duration_s,
            "total_voiced_s": round(total_voiced_s, 2),
            "transcript": [],
            "timeline": [],
        }
    # Shift per-word timestamps into ABSOLUTE media time (each chunk is 3s,
    # so chunk i contributes offset i*3000ms). Without this, word 0 of every
    # chunk has start_ms=0, and AudioPlaybackReview can't sync past the
    # first chunk.
    all_words = []
    for i, snap in enumerate(snapshots):
        offset = i * 3000
        for w in snap.get("transcript_words", []):
            all_words.append({
                "word": w.get("word"),
                "start_ms": (w.get("start_ms") or 0) + offset,
                "end_ms": (w.get("end_ms") or 0) + offset,
                "is_filler": w.get("is_filler", False),
                "probability": w.get("probability"),
            })

    def avg(key):
        # Exclude None values — these mean "signal not available for
        # this chunk" (e.g. speech_pace on a silent chunk). Returns
        # None when no chunks contributed data — was previously 0,
        # which displayed as "0/100" instead of "N/A" in the UI and
        # made silent sessions look like the user scored a flat zero.
        vals = [s.get(key) for s in all_scores if s.get(key) is not None]
        if not vals:
            return None
        return round(sum(vals) / len(vals))

    def stderr(key):
        """Standard error of the mean: std / sqrt(N).

        Quantifies per-chunk variability around the headline average —
        NOT ground-truth accuracy. Use it as "how steady was this signal
        across the session?" If stderr is small the session was
        consistent; if large, the signal swung a lot and the average
        hides that.
        """
        vals = [s.get(key) for s in all_scores if s.get(key) is not None]
        n = len(vals)
        if n < 2:
            return 0
        mean = sum(vals) / n
        var = sum((v - mean) ** 2 for v in vals) / (n - 1)
        return round((var ** 0.5) / (n ** 0.5), 1)

    avg_total = avg("total")
    # Filter Nones — per-chunk total is now None when every signal in
    # that chunk was None (e.g. silent chunk with no face data). Old
    # default of 0 would compare wrong (max/min on Nones throws).
    _totals = [s.get("total") for s in all_scores if s.get("total") is not None]
    peak_total = max(_totals, default=0)
    lowest_total = min(_totals, default=0)

    signal_avgs = {
        "voice_steadiness": avg("voice_steadiness"),
        "eye_contact": avg("eye_contact"),
        "speech_pace": avg("speech_pace"),
        "filler_words": avg("filler_words"),
        "vocal_variety": avg("vocal_variety"),
        "expression": avg("expression"),
        # New signal: voice trembling (jitter+shimmer-derived). Its
        # 0-100 score is shown in the UI alongside the other signals;
        # the session-level penalty applied to the headline number is
        # already baked in per-chunk by SignalScorer.aggregate.
        "voice_trembling": avg("voice_trembling"),
        "blink_rate": None,
        "tension_score": None,
    }

    signal_stderrs = {
        "voice_steadiness": stderr("voice_steadiness"),
        "eye_contact": stderr("eye_contact"),
        "speech_pace": stderr("speech_pace"),
        "filler_words": stderr("filler_words"),
        "vocal_variety": stderr("vocal_variety"),
        "expression": stderr("expression"),
        "voice_trembling": stderr("voice_trembling"),
        "total": stderr("total"),
    }

    # ── Voice trembling aggregate ────────────────────────────────────
    # The per-chunk detector returns jitter, shimmer, instability and an
    # is_trembling flag. We bubble up the SESSION-level numbers so the
    # report UI can show a single "voice was trembling for X% of the
    # session" line. Same denominator (total chunks) so the percentages
    # are comparable across sessions of different lengths.
    trembling_chunks = [r.get("trembling") for r in all_raw if r.get("trembling")]
    n_chunks = max(len(all_raw), 1)
    if trembling_chunks:
        avg_jitter = round(
            sum(float(t.get("jitter_pct") or 0) for t in trembling_chunks)
            / max(len(trembling_chunks), 1), 2,
        )
        avg_shimmer = round(
            sum(float(t.get("shimmer_pct") or 0) for t in trembling_chunks)
            / max(len(trembling_chunks), 1), 2,
        )
        avg_instability = round(
            sum(float(t.get("instability") or 0) for t in trembling_chunks)
            / max(len(trembling_chunks), 1), 3,
        )
        trembling_chunk_count = sum(
            1 for t in trembling_chunks if t.get("is_trembling")
        )
        trembling_summary = {
            "avg_jitter_pct": avg_jitter,
            "avg_shimmer_pct": avg_shimmer,
            "avg_instability": avg_instability,
            "trembling_chunk_count": trembling_chunk_count,
            "trembling_chunk_pct": round(trembling_chunk_count / n_chunks * 100, 1),
            "is_trembling_session": trembling_chunk_count >= max(2, n_chunks // 4),
        }
    else:
        trembling_summary = {
            "avg_jitter_pct": 0.0,
            "avg_shimmer_pct": 0.0,
            "avg_instability": 0.0,
            "trembling_chunk_count": 0,
            "trembling_chunk_pct": 0.0,
            "is_trembling_session": False,
        }

    # ── Emotion mix aggregate ───────────────────────────────────────
    # Combine per-chunk multi-label probabilities into a single session
    # mix that sums to 1.0. Frontend renders this as a stacked bar /
    # legend ("60% nervous, 30% confident, 10% excited").
    try:
        from emotion_detector import aggregate_emotion_mixes
        emotion_summary = aggregate_emotion_mixes(
            [s.get("emotion") for s in snapshots if s.get("emotion")]
        )
    except Exception:
        emotion_summary = {"mix": None, "dominant": None, "dominant_pct": None}

    # ── Quiet-recording flag (Audit Fix 7) ──────────────────────────
    # The audit highlighted that `dynaudnorm=p=0.9:m=8` in the upload
    # ffmpeg pipeline can boost quiet recordings by up to 8x, so the
    # voice_steadiness and trembling numbers reflect post-AGC
    # artefacts rather than the speaker's real delivery. We do NOT
    # remove dynaudnorm (without it, every soft chunk would lose
    # against the 0.012 RMS gate downstream). Instead we surface a
    # boolean the UI can render as a "Low mic volume — steadiness
    # reflects normalised audio" badge.
    #
    # For live WS the chunk RMS arrives un-normalised, so 0.02 is the
    # right pre-norm cutoff. Upload paths see post-norm RMS; the
    # caller (main.py upload_video) overrides the threshold to 0.04
    # there. Both surface the same field shape.
    chunk_rms_vals = [
        r.get("rms") for r in all_raw
        if isinstance(r.get("rms"), (int, float))
    ]
    median_chunk_rms = (
        sorted(chunk_rms_vals)[len(chunk_rms_vals) // 2]
        if chunk_rms_vals else None
    )
    quiet_recording = (
        median_chunk_rms is not None and median_chunk_rms < 0.02
    )

    # ── Session pitch-std median + naturally-narrow-pitch disclosure ──
    # Structural Fix 1: a speaker with a naturally narrow pitch range
    # gets penalised by the absolute pitch_std-based vocal_variety
    # scorer and the "flat" emotion label. We don't re-score per-chunk
    # (would require plumbing per-user baselines through all four
    # pipelines); instead we surface:
    #   * `session_pitch_std_median` — this session's median chunk
    #     pitch_std in Hz, available as an input to the user
    #     baseline computed by main.py:_fetch_user_baseline.
    #   * `naturally_narrow_pitch` — True when a returning user has a
    #     historical pitch_std median below 8 Hz across their last
    #     ≥3 sessions (Praat's "narrow pitch" tier). The frontend
    #     renders an explainer so the user understands their
    #     flat / vocal_variety reading is calibrated information,
    #     not a value judgement.
    chunk_pitch_stds = [
        float(r.get("pitch", {}).get("std_hz") or 0.0)
        for r in all_raw
        if r.get("pitch") and (r["pitch"].get("std_hz") or 0) > 0
    ]
    if chunk_pitch_stds:
        _sorted_p = sorted(chunk_pitch_stds)
        session_pitch_std_median = round(_sorted_p[len(_sorted_p) // 2], 2)
    else:
        session_pitch_std_median = None

    naturally_narrow_pitch = False
    if isinstance(user_baseline, dict) and user_baseline.get("ready"):
        ub_pitch = user_baseline.get("pitch_std_median")
        if (
            isinstance(ub_pitch, dict)
            and ub_pitch.get("n", 0) >= 3
            and isinstance(ub_pitch.get("mean"), (int, float))
            and ub_pitch["mean"] < 8.0
        ):
            naturally_narrow_pitch = True

    # ── Multi-speaker heuristic (Structural Fix 2) ──────────────────
    # Concatenate per-VAD-segment pitch means across the session in
    # time order, count consecutive jumps > 80 Hz. The 80 Hz
    # threshold approximates the gap between adult-male and
    # adult-female pitch anchors; consecutive voiced segments from a
    # single speaker rarely jump that much. We require BOTH a high
    # absolute jump count (≥4) AND a high jump rate per voiced
    # minute (>6) so a 2-segment recording with one outlier doesn't
    # trigger. This is NOT diarisation — it's a "the audio looks
    # like more than one person" heuristic. The frontend renders a
    # disclosure, never gates scoring.
    _MULTISPEAKER_JUMP_HZ = 80.0
    _MULTISPEAKER_MIN_JUMPS = 4
    _MULTISPEAKER_MIN_RATE_PER_MIN = 6.0
    _all_segment_means: list[float] = []
    for r in all_raw:
        seg_means = (r.get("pitch") or {}).get("segment_pitch_means") or []
        for v in seg_means:
            if isinstance(v, (int, float)) and v > 0:
                _all_segment_means.append(float(v))
    multi_speaker_jump_count = 0
    for i in range(1, len(_all_segment_means)):
        if abs(_all_segment_means[i] - _all_segment_means[i - 1]) > _MULTISPEAKER_JUMP_HZ:
            multi_speaker_jump_count += 1
    voiced_minutes = max(total_voiced_s / 60.0, 1e-3)
    multi_speaker_jump_rate = multi_speaker_jump_count / voiced_minutes
    multiple_speakers_suspected = (
        multi_speaker_jump_count >= _MULTISPEAKER_MIN_JUMPS
        and multi_speaker_jump_rate > _MULTISPEAKER_MIN_RATE_PER_MIN
    )

    # ── Filler word breakdown ────────────────────────────────────────
    filler_counts = {}
    for w in all_words:
        if w.get("is_filler"):
            filler_counts[w["word"]] = filler_counts.get(w["word"], 0) + 1

    total_acoustic = sum(
        len(s.get("acoustic_fillers", [])) for s in all_raw
    )
    total_fillers = sum(filler_counts.values()) + total_acoustic

    # NOTE: this used to majority-vote per-chunk `language` from
    # Whisper to set a `language_warning`, but the production
    # transcription model is `.en` — Whisper always reports "en"
    # with confidence 1.0 — so the gate never fired. Replaced by
    # the upstream `unsupported_language` short-circuit at the top
    # of this function (Batch 2), which uses a real multilingual
    # probe in audio_pipeline and refuses to score rather than
    # warning + scoring anyway.
    voiced_chunks = [r for r in all_raw if r.get("voiced_s", 0) >= 0.8]

    # ── Pace statistics ──────────────────────────────────────────────
    wpms = [s.get("wpm", 0) for s in all_raw if s.get("wpm", 0) > 0]
    pace = {
        "avg_wpm": round(sum(wpms) / max(len(wpms), 1), 1),
        "too_fast_pct": round(
            sum(1 for w in wpms if w > 180) / max(len(wpms), 1) * 100
        ),
        "too_slow_pct": round(
            sum(1 for w in wpms if 0 < w < 80) / max(len(wpms), 1) * 100
        ),
        "ideal_pct": round(
            sum(1 for w in wpms if 130 <= w <= 160) / max(len(wpms), 1) * 100
        ),
    }

    # ── Per-signal explanation ──────────────────────────────────────
    # Every number in signal_averages gets a one-liner explaining WHY
    # it is what it is, drawn from the underlying aggregate statistics.
    # A score without an explanation is a black box users can't argue
    # with. "scored 45 because filler_rate was 12% (avg 3)" gives them
    # something concrete to improve on.
    pitch_stds = [r.get("pitch", {}).get("std_hz", 0) for r in all_raw]
    pitch_stds_nonzero = [p for p in pitch_stds if p > 0]
    avg_pitch_std = (
        sum(pitch_stds_nonzero) / len(pitch_stds_nonzero)
        if pitch_stds_nonzero else 0
    )
    voiced_total_s = sum(r.get("voiced_s", 0) for r in all_raw)
    filler_rate_pct = (
        round(total_fillers / max(duration_s, 1) * 60, 1)
        if duration_s > 0 else 0.0
    )

    def _explain_score(score):
        if score is None: return "no data"
        if score >= 80: return "strong"
        if score >= 65: return "solid"
        if score >= 50: return "developing"
        if score >= 35: return "below average"
        return "weak"

    signal_reasons = {
        "voice_steadiness": (
            f"{_explain_score(signal_avgs['voice_steadiness'])}: "
            f"pitch SD {avg_pitch_std:.1f} Hz across {len(voiced_chunks)} voiced "
            f"chunks"
        ),
        "eye_contact": (
            f"{_explain_score(signal_avgs['eye_contact'])}: averaged across "
            f"face-detected frames"
        ),
        "speech_pace": (
            f"{_explain_score(signal_avgs['speech_pace'])}: avg {pace['avg_wpm']} WPM"
            + (f", {pace['too_fast_pct']}% too fast" if pace['too_fast_pct'] > 15 else "")
            + (f", {pace['too_slow_pct']}% too slow" if pace['too_slow_pct'] > 15 else "")
            + (" (ideal 130-160)" if pace['avg_wpm'] else "")
        ),
        "filler_words": (
            f"{_explain_score(signal_avgs['filler_words'])}: "
            f"{total_fillers} fillers total ({filler_rate_pct}/min) — "
            f"{sum(filler_counts.values())} lexical, {total_acoustic} acoustic"
        ),
        "vocal_variety": (
            f"{_explain_score(signal_avgs['vocal_variety'])}: pitch SD "
            f"{avg_pitch_std:.1f} Hz (monotone <5, natural 15-50, animated 50+)"
        ),
        "expression": (
            f"{_explain_score(signal_avgs['expression'])}: excluded from "
            f"total score — display only"
        ),
    }

    # ── Grade ────────────────────────────────────────────────────────
    # GRADE_TABLE is defined at module top — keep it the only place the
    # thresholds live. The frontend mirrors the same constants.
    grade, label = "F", "Keep practicing"
    if avg_total is None:
        # Every per-chunk total was None — happens when all signals
        # were None (e.g. silent session that somehow slipped past the
        # insufficient_speech short-circuit, or audio-only-no-face
        # case). Surface "no grade" rather than defaulting to F.
        grade, label = None, None
    else:
        for threshold, g, l in GRADE_TABLE:
            if avg_total >= threshold:
                grade, label = g, l
                break

    # ── Specific insights (not generic) ──────────────────────────────
    insights = []

    if total_fillers > 0:
        top = max(filler_counts, key=filler_counts.get, default="um") if filler_counts else "um"
        top_count = filler_counts.get(top, 0)
        insights.append(
            f"You used filler words {total_fillers} times. "
            f"Most common: '{top}' ({top_count}x)."
        )

    if total_acoustic > 0:
        insights.append(
            f"Detected {total_acoustic} non-lexical filler sounds "
            f"(ahh/umm/ehh) from audio analysis."
        )

    if pace["too_fast_pct"] > 20:
        insights.append(
            f"You spoke too fast {pace['too_fast_pct']}% of the time "
            f"(avg {pace['avg_wpm']} WPM, ideal is 130-160)."
        )

    if pace["too_slow_pct"] > 20:
        insights.append(
            f"You spoke too slowly {pace['too_slow_pct']}% of the time "
            f"(avg {pace['avg_wpm']} WPM, ideal is 130-160)."
        )

    # Skip None signals — they mean "no measurement," not "low score."
    if signal_avgs["eye_contact"] is not None and signal_avgs["eye_contact"] < 55:
        insights.append(
            "Eye contact was weak — you looked away from camera frequently."
        )

    if signal_avgs["voice_steadiness"] is not None and signal_avgs["voice_steadiness"] < 55:
        insights.append(
            "Voice trembling detected — nervousness was audible."
        )

    # Dedicated trembling insight (jitter+shimmer detector, separate
    # from the broader voice_steadiness signal). Surfaces the % of the
    # session where the speaker's voice was actively shivering, plus a
    # nudge to slow down + breathe.
    if trembling_summary.get("is_trembling_session"):
        pct = trembling_summary.get("trembling_chunk_pct", 0)
        insights.append(
            f"Voice was trembling/shivering during {pct}% of the session "
            f"(jitter {trembling_summary['avg_jitter_pct']}%, "
            f"shimmer {trembling_summary['avg_shimmer_pct']}%). "
            "This is a strong nervousness signal — try a slow breath "
            "before key sentences."
        )

    # Dominant-emotion insight. Skipped when the mix is None (silent
    # session) or the dominant label is benign (confident / engaged /
    # authoritative at low confidence wouldn't be useful for the
    # user to see).
    em_mix = (emotion_summary or {}).get("mix")
    em_dom = (emotion_summary or {}).get("dominant")
    em_pct = (emotion_summary or {}).get("dominant_pct")
    if em_mix and em_dom and em_pct is not None and em_pct >= 40:
        if em_dom in ("nervous", "hesitant"):
            insights.append(
                f"Tone read as {em_dom} for ~{em_pct}% of the session. "
                "Mix in confident phrasing and steady pacing to balance it."
            )
        elif em_dom == "flat":
            insights.append(
                f"Delivery was uninflected for ~{em_pct}% of the session. "
                "Vary your pitch on key words — even a small lift makes the "
                "audience lean in."
            )
        elif em_dom == "excited":
            insights.append(
                f"Energy was high ({em_pct}% excited). Make sure your "
                "audience can keep up — drop into measured pacing for the "
                "key points."
            )
        elif em_dom == "disconnected":
            insights.append(
                f"Energy was low and pace slow for ~{em_pct}% of the session. "
                "Add audience cues — questions, contrasts, varied pace — to "
                "re-engage."
            )
        elif em_dom == "sad":
            insights.append(
                f"Tone read low / subdued ({em_pct}% sad). If that wasn't "
                "the intent, lift your pitch and energy on key sentences."
            )
        elif em_dom == "angry":
            insights.append(
                f"Tone read sharp / heated ({em_pct}% angry). Consider "
                "softening delivery on contentious points unless the "
                "heat is intentional."
            )
        # `engaged`, `confident`, `authoritative` are positive labels —
        # no insight, the headline + signal bars already say "good job".

    if signal_avgs["vocal_variety"] is not None and signal_avgs["vocal_variety"] < 50:
        insights.append(
            "Delivery was flat / uninflected. Vary your pitch to stay engaging."
        )

    # Find worst confidence dip with timestamp. Skip if any per-chunk
    # total in the comparison window is None (chunks with no measurable
    # signals) — comparing across None windows produces meaningless
    # "drops".
    for i in range(5, len(all_scores)):
        window_totals = [all_scores[j].get("total") for j in range(i - 5, i)]
        if any(t is None for t in window_totals) or all_scores[i].get("total") is None:
            continue
        window_avg = sum(window_totals) / 5
        drop = window_avg - all_scores[i]["total"]
        if drop > 20:
            mins, secs = divmod(i * 3, 60)
            insights.append(
                f"Biggest confidence drop at {mins}:{secs:02d} "
                f"— score fell {round(drop)} points."
            )
            break  # only report worst one

    # ── Action items ─────────────────────────────────────────────────
    action_map = {
        "filler_words": "Replace fillers with a deliberate 1-second pause.",
        "eye_contact": "Look at the camera lens, not your screen or notes.",
        "voice_steadiness": "Breathe deeply before speaking. Slow exhale before key sentences.",
        "speech_pace": f"Slow down — avg was {pace['avg_wpm']} WPM, aim for 130-160.",
        "vocal_variety": "Emphasise 2-3 key words per sentence. Avoid one flat pitch.",
        "expression": "Relax your brow. Unclench your jaw. Neutral face reads as calm.",
    }
    # Skip Nones — only sort over signals that actually scored. The
    # weakest two get an action item; if every signal is None (no
    # data at all) action_items just stays empty, which is correct.
    _scored = [(k, v) for k, v in signal_avgs.items() if v is not None]
    sorted_signals = sorted(_scored, key=lambda x: x[1])
    action_items = [
        action_map[k] for k, _ in sorted_signals[:2] if k in action_map
    ]

    # ── Score timeline (one point per 3s chunk) ──────────────────────
    # speech_pace may be None on silent chunks; expose as null in the
    # payload so the frontend chart can render a gap rather than a
    # misleading zero dip.
    def _or_null(v):
        return v if v is not None else None
    timeline = [
        {
            "t_s": i * 3,
            "total": s.get("total", 0),
            "eye_contact": s.get("eye_contact", 0),
            "voice_steadiness": s.get("voice_steadiness", 0),
            "speech_pace": _or_null(s.get("speech_pace")),
            "filler_words": s.get("filler_words", 0),
            "vocal_variety": s.get("vocal_variety", 0),
            "voice_trembling": _or_null(s.get("voice_trembling")),
            # Dominant emotion + its weight at this chunk; the full
            # mix lives in `emotion_timeline` below for callers that
            # want to render a stacked area chart.
            "emotion_dominant": (snapshots[i].get("emotion") or {}).get("dominant"),
            "emotion_dominant_pct": (snapshots[i].get("emotion") or {}).get("dominant_pct"),
        }
        for i, s in enumerate(all_scores)
    ]
    emotion_timeline = [
        {
            "t_s": i * 3,
            "mix": (snap.get("emotion") or {}).get("mix"),
            "dominant": (snap.get("emotion") or {}).get("dominant"),
            "dominant_pct": (snap.get("emotion") or {}).get("dominant_pct"),
        }
        for i, snap in enumerate(snapshots)
    ]

    # ── Full transcript with filler markers ──────────────────────────
    transcript = [
        {
            "word": w["word"],
            "start_ms": w.get("start_ms", 0),
            "is_filler": w.get("is_filler", False),
        }
        for w in all_words
    ]

    # ── Baseline-adjusted scores ───────────────────────────────────
    # Compares THIS session's per-signal averages to the user's own
    # running mean (their last 5 completed sessions, computed by the
    # caller). Score is a z-score anchored at 50:
    #   z=0  → 50 (right at the user's personal average)
    #   z=+1 → 65 (one std above their average — improving)
    #   z=-1 → 35 (one std below — regressing)
    #   clamped to [0, 100].
    # Std is floored at 1.0 so a near-flat history doesn't divide by
    # ~0 and produce wild values.
    #
    # Returned ALONGSIDE signal_averages, never replacing it. The
    # frontend can show "you scored 78 on pace (62 vs your average,
    # +12 since last)" — both numbers stay meaningful.
    signal_baseline_adjusted = None
    baseline_note = None
    if user_baseline is not None:
        n_seen = int(user_baseline.get("n_sessions", 0) or 0)
        if user_baseline.get("ready"):
            signal_baseline_adjusted = {}
            for sig in _BASELINE_SIGNALS:
                stats = user_baseline.get(sig)
                this_avg = signal_avgs.get(sig)
                if not stats or not isinstance(this_avg, (int, float)):
                    continue
                if stats.get("n", 0) < 3:
                    continue
                std = max(float(stats.get("std", 0) or 0), 1.0)
                mean = float(stats.get("mean", 0))
                z = (this_avg - mean) / std
                signal_baseline_adjusted[sig] = max(0, min(100, round(50 + z * 15)))
            baseline_note = (
                f"Personalized scoring based on your last {n_seen} sessions. "
                "50 = your personal average; +15 per standard deviation."
            )
        else:
            # Caller fetched the baseline but found too few sessions.
            # Note it explicitly so the UI can show "X more sessions
            # needed for personalized scoring" copy without guessing.
            baseline_note = (
                f"Need at least 3 prior sessions for personalized scoring "
                f"(you have {n_seen})."
            )

    # ── Calibration-adjusted block (Phase 6) ───────────────────────
    # Per-signal comparison of THIS session against the user's
    # personal calibration baseline + tolerance bands. Surfaced
    # alongside (not replacing) `signal_baseline_adjusted` above —
    # the z-score-against-history view stays valuable even when a
    # calibration profile exists. Only built when the caller's
    # `user_baseline` carries a `calibration` block (set by
    # main.py:_fetch_user_baseline when a complete profile exists).
    # The build_calibration_adjusted helper at the top of this file
    # is also called directly from the upload-video pipeline (which
    # bypasses generate_post_session_report) so the calibration
    # block reaches every report consistently.
    _pitch_mean_session = None
    _pitch_means = [
        (r.get("pitch") or {}).get("mean_hz") or 0
        for r in all_raw
    ]
    _pitch_means_nonzero = [p for p in _pitch_means if p > 0]
    if _pitch_means_nonzero:
        _pitch_mean_session = sum(_pitch_means_nonzero) / len(_pitch_means_nonzero)

    calibration_adjusted = build_calibration_adjusted(
        user_baseline,
        {
            "wpm": pace.get("avg_wpm"),
            "pitch_mean": _pitch_mean_session,
            "pitch_std": session_pitch_std_median,
            "rms": median_chunk_rms,
            "filler_rate": filler_rate_pct,
            "jitter_pct": trembling_summary.get("avg_jitter_pct"),
            "shimmer_pct": trembling_summary.get("avg_shimmer_pct"),
            "voice_steadiness": signal_avgs.get("voice_steadiness"),
            "vocal_variety": signal_avgs.get("vocal_variety"),
        },
    )

    # Fix 11: session-level Whisper transcript-confidence — mean of
    # per-word probabilities (above the 0.05 accent-fairness cutoff)
    # across the whole session. Surfaced as a transcript-quality
    # indicator only; deliberately NOT folded into the headline score.
    chunk_transcript_confs = [
        r.get("transcript_confidence") for r in all_raw
        if isinstance(r.get("transcript_confidence"), (int, float))
    ]
    transcript_confidence = (
        round(sum(chunk_transcript_confs) / len(chunk_transcript_confs), 2)
        if chunk_transcript_confs else None
    )

    # Pass-through of the per-chunk overlay-status block the WS / upload
    # / analyzer pipelines now attach to each snapshot. The result-screen
    # HUD overlay reads this array indexed by `t_s` (chunk index × 3 s).
    live_hud_timeline = [
        ({**snap["live_hud"], "t_s": i * 3}
         if snap.get("live_hud") else None)
        for i, snap in enumerate(snapshots)
    ]

    base_report = {
        "session_id": session_id,
        "duration_s": duration_s,
        "avg_score": avg_total,
        "peak_score": peak_total,
        "lowest_score": lowest_total,
        "grade": grade,
        "grade_label": label,
        "signal_averages": signal_avgs,
        "transcript_confidence": transcript_confidence,
        "live_hud_timeline": live_hud_timeline,
        "signal_baseline_adjusted": signal_baseline_adjusted,
        "user_baseline": user_baseline,
        "baseline_note": baseline_note,
        # Phase 6 — calibration-adjusted view. Empty when the user
        # hasn't completed Personal Setup yet. Frontend reads this
        # for the "How this compares to your natural style" panel.
        "calibration_adjusted": calibration_adjusted,
        "signal_stderrs": signal_stderrs,
        "signal_reasons": signal_reasons,
        "weakest_signal": sorted_signals[0][0] if sorted_signals else "unknown",
        "filler_breakdown": filler_counts,
        "total_fillers": total_fillers,
        "acoustic_fillers": total_acoustic,
        "pace": pace,
        "insights": insights,
        "action_items": action_items,
        # Top-level wins / improvements — always present on every
        # scoreable report so the frontend can render the "What went
        # well" + "What to Improve" cards uniformly across all modes.
        # Defaults to the rule-based insights / action_items here, then
        # GETS OVERWRITTEN below if Gemini coaching comes back ready
        # (LLM english+confidence improvements merged into one flat list
        # for the always-visible card; the structured per-side list is
        # still available via report["coaching"] for CoachingPanel).
        "wins": list(insights or []),
        "improvements": list(action_items or []),
        "timeline": timeline,
        "transcript": transcript,
        # Voice trembling (jitter + shimmer) — session-level rollup of
        # the per-chunk detector. Frontend renders a "Voice Trembling"
        # row in SignalBars and (if `is_trembling_session`) a callout in
        # the insights panel. The penalty applied to the headline score
        # is already baked in per-chunk; this object is for display
        # only.
        "voice_trembling": trembling_summary,
        # Multi-label emotion mix — session aggregate plus the per-chunk
        # timeline. Frontend renders the session mix as a stacked
        # legend ("60% nervous, 30% confident, 10% excited") and uses
        # the timeline for the result-screen tooltip on the score chart.
        "emotion": emotion_summary,
        "emotion_timeline": emotion_timeline,
        # Audit Fix 7: surface a boolean for the UI to render a
        # "Low mic volume detected — steadiness score reflects
        # normalised audio" badge. Median pre-normalisation RMS
        # below 0.02 triggers the flag for the live + audio-upload
        # paths that go through report_generator. Upload Video
        # produces its own version in main.py with a different
        # threshold to account for ffmpeg dynaudnorm boosting.
        "quiet_recording": quiet_recording,
        "median_chunk_rms": (
            round(median_chunk_rms, 4) if median_chunk_rms is not None else None
        ),
        # Structural Fix 1: per-session median raw pitch std (Hz). Fed
        # into the per-user baseline by main.py:_fetch_user_baseline,
        # which then drives the disclosure flag below on subsequent
        # sessions. Always emitted, even on first sessions where
        # `naturally_narrow_pitch` will be False because the baseline
        # isn't ready yet.
        "session_pitch_std_median": session_pitch_std_median,
        "naturally_narrow_pitch": naturally_narrow_pitch,
        # Structural Fix 2: multi-speaker heuristic. UI renders an
        # advisory ("Multiple voices detected — score may not reflect
        # a single speaker") when this is True. Score is NOT gated;
        # disclosure only.
        "multiple_speakers_suspected": multiple_speakers_suspected,
        "multi_speaker_jump_count": multi_speaker_jump_count,
        "multi_speaker_jump_rate_per_min": round(multi_speaker_jump_rate, 2),
    }

    # ── LLM coaching (Gemini Flash-Lite) ─────────────────────────────
    # Runs only when a topic was supplied (practice session) and the
    # report is otherwise scoreable. We keep the numeric report usable
    # even when Gemini is skipped or fails, and surface source/reason
    # metadata so the caller can tell whether the coaching came from
    # Gemini or the local rule-based fallback.
    coaching = None
    coaching_status = "skipped"
    coaching_source = "rule_based"
    coaching_skip_reason = "missing_topic"
    coaching_error = None
    if prompt_meta and prompt_meta.get("title"):
        try:
            from llm_coach import generate_practice_coaching_result
            coaching_result = generate_practice_coaching_result(
                base_report,
                transcript_words=all_words,
                prompt_title=prompt_meta.get("title", ""),
                prompt_body=prompt_meta.get("body", ""),
            )
            coaching = coaching_result.get("coaching")
            coaching_status = coaching_result.get("status") or "skipped"
            coaching_source = coaching_result.get("source") or "rule_based"
            coaching_skip_reason = coaching_result.get("skip_reason")
            coaching_error = coaching_result.get("error")
        except Exception as e:
            # Never let an LLM failure block the numeric report.
            import logging as _logging
            _logging.getLogger(__name__).warning(f"[llm_coach] failed: {e}")
            coaching_status = "failed"
            coaching_source = "rule_based"
            coaching_skip_reason = None
            coaching_error = "coaching_pipeline_failed"
    base_report["coaching"] = coaching
    base_report["coaching_status"] = coaching_status
    base_report["coaching_source"] = coaching_source
    base_report["coaching_skip_reason"] = coaching_skip_reason
    base_report["coaching_error"] = coaching_error
    # Surface the topic so the UI's mismatch banner can name it
    # ("The transcript didn't cover '<topic>'.").
    if prompt_meta and prompt_meta.get("title"):
        base_report["topic"] = prompt_meta["title"]

    # If Gemini produced structured coaching, prefer its wins +
    # improvements over the rule-based ones for the top-level fields.
    # We merge english + confidence into flat lists because the
    # always-visible UI cards render them as a single bullet list.
    # The structured per-side breakdown stays accessible via
    # report["coaching"] for CoachingPanel.
    if coaching_status == "ready" and coaching:
        en = coaching.get("english") or {}
        cf = coaching.get("confidence") or {}
        merged_wins = []
        for w in (en.get("wins") or []) + (cf.get("wins") or []):
            if isinstance(w, str) and w.strip():
                merged_wins.append(w.strip())
        merged_imps = []
        for imp in (en.get("improvements") or []) + (cf.get("improvements") or []):
            if isinstance(imp, str) and imp.strip():
                merged_imps.append(imp.strip())
        if merged_wins:
            base_report["wins"] = merged_wins
        if merged_imps:
            base_report["improvements"] = merged_imps
    return base_report
