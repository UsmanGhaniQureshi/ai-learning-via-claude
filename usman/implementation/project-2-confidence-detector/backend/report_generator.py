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
        vals = [s.get(key, 0) for s in all_scores]
        return round(sum(vals) / max(len(vals), 1))

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

    # ── Filler word breakdown ────────────────────────────────────────
    filler_counts = {}
    for w in all_words:
        if w.get("is_filler"):
            filler_counts[w["word"]] = filler_counts.get(w["word"], 0) + 1

    total_acoustic = sum(
        len(s.get("acoustic_fillers", [])) for s in all_raw
    )
    total_fillers = sum(filler_counts.values()) + total_acoustic

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
    timeline = [
        {
            "t_s": i * 3,
            "total": s.get("total", 0),
            "eye_contact": s.get("eye_contact", 0),
            "voice_steadiness": s.get("voice_steadiness", 0),
            "speech_pace": s.get("speech_pace", 0),
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
        "weakest_signal": sorted_signals[0][0] if sorted_signals else "unknown",
        "filler_breakdown": filler_counts,
        "total_fillers": total_fillers,
        "acoustic_fillers": total_acoustic,
        "pace": pace,
        "insights": insights,
        "action_items": action_items,
        "timeline": timeline,
        "transcript": transcript,
    }
