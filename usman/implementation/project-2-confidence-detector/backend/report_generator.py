"""
Post-Session Report Generator.
Produces a comprehensive speech analysis report from session snapshots.
Used by both live sessions (on stop) and standalone audio analyzer.
"""


def generate_post_session_report(snapshots: list, session_id: str) -> dict:
    """
    Generate a detailed post-session report from pipeline snapshots.

    snapshots: list of dicts from AudioPipeline.process_chunk()
    session_id: unique session identifier
    Returns: full report dict with grades, insights, timeline, transcript
    """
    if not snapshots:
        return {"error": "No data recorded", "session_id": session_id}

    all_scores = [s["scores"] for s in snapshots]
    all_raw = [s["raw"] for s in snapshots]
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
    duration_s = len(snapshots) * 3

    def avg(key):
        # Exclude None values — these mean "signal not available for
        # this chunk" (e.g. speech_pace on a silent chunk). Previously
        # Nones became 0 via .get(key, 0) and dragged the session
        # average down; a speaker with a quiet pause shouldn't have
        # their pace score halved because of it.
        vals = [s.get(key) for s in all_scores if s.get(key) is not None]
        if not vals:
            return 0
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
    peak_total = max((s.get("total", 0) for s in all_scores), default=0)
    lowest_total = min((s.get("total", 0) for s in all_scores), default=0)

    signal_avgs = {
        "voice_steadiness": avg("voice_steadiness"),
        "eye_contact": avg("eye_contact"),
        "speech_pace": avg("speech_pace"),
        "filler_words": avg("filler_words"),
        "vocal_variety": avg("vocal_variety"),
        "expression": avg("expression"),
    }

    signal_stderrs = {
        "voice_steadiness": stderr("voice_steadiness"),
        "eye_contact": stderr("eye_contact"),
        "speech_pace": stderr("speech_pace"),
        "filler_words": stderr("filler_words"),
        "vocal_variety": stderr("vocal_variety"),
        "expression": stderr("expression"),
        "total": stderr("total"),
    }

    # ── Filler word breakdown ────────────────────────────────────────
    filler_counts = {}
    for w in all_words:
        if w.get("is_filler"):
            filler_counts[w["word"]] = filler_counts.get(w["word"], 0) + 1

    total_acoustic = sum(
        len(s.get("acoustic_fillers", [])) for s in all_raw
    )
    total_fillers = sum(filler_counts.values()) + total_acoustic

    # ── Language confidence (Whisper auto-detect) ───────────────────
    # Majority vote across chunks: if most voiced chunks detected a
    # non-English language (or low confidence), flag the whole session
    # so the UI can warn the user that the analysis may be unreliable.
    voiced_chunks = [r for r in all_raw if r.get("voiced_s", 0) >= 0.8]
    langs = [r.get("language", "en") for r in voiced_chunks]
    low_conf_flags = [bool(r.get("language_low_confidence")) for r in voiced_chunks]
    non_en_count = sum(1 for L in langs if L and L != "en")
    low_conf_count = sum(1 for f in low_conf_flags if f)
    language_warning = None
    dominant_language = "en"
    if voiced_chunks:
        if non_en_count > len(voiced_chunks) // 2:
            # Most chunks weren't English — pick the most common non-en language.
            from collections import Counter
            dominant_language = Counter(
                L for L in langs if L and L != "en"
            ).most_common(1)[0][0]
            language_warning = (
                f"Detected speech as '{dominant_language}', not English. "
                "Scoring is optimised for English — results may be unreliable."
            )
        elif low_conf_count > len(voiced_chunks) // 2:
            language_warning = (
                "Language detection confidence was low across most of the "
                "session. The transcript and scores may be unreliable."
            )

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
    grade_table = [
        (90, "A+", "Exceptional"),
        (80, "A", "Confident"),
        (70, "B+", "Strong"),
        (60, "B", "Good"),
        (50, "C", "Developing"),
        (40, "D", "Needs work"),
        (0, "F", "Keep practicing"),
    ]
    grade, label = "F", "Keep practicing"
    for threshold, g, l in grade_table:
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

    if signal_avgs["eye_contact"] < 55:
        insights.append(
            "Eye contact was weak — you looked away from camera frequently."
        )

    if signal_avgs["voice_steadiness"] < 55:
        insights.append(
            "Voice trembling detected — nervousness was audible."
        )

    if signal_avgs["vocal_variety"] < 50:
        insights.append(
            "Delivery was monotone. Vary your pitch to stay engaging."
        )

    # Find worst confidence dip with timestamp
    for i in range(5, len(all_scores)):
        window_avg = sum(all_scores[j]["total"] for j in range(i - 5, i)) / 5
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
    sorted_signals = sorted(signal_avgs.items(), key=lambda x: x[1])
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
        }
        for i, s in enumerate(all_scores)
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

    return {
        "session_id": session_id,
        "duration_s": duration_s,
        "avg_score": avg_total,
        "peak_score": peak_total,
        "lowest_score": lowest_total,
        "grade": grade,
        "grade_label": label,
        "signal_averages": signal_avgs,
        "signal_stderrs": signal_stderrs,
        "signal_reasons": signal_reasons,
        "weakest_signal": sorted_signals[0][0] if sorted_signals else "unknown",
        "filler_breakdown": filler_counts,
        "total_fillers": total_fillers,
        "acoustic_fillers": total_acoustic,
        "pace": pace,
        "insights": insights,
        "action_items": action_items,
        "timeline": timeline,
        "transcript": transcript,
        "language": dominant_language,
        "language_warning": language_warning,
    }
