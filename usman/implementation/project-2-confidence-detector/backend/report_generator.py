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
    if avg_total is None:
        # Every per-chunk total was None — happens when all signals
        # were None (e.g. silent session that somehow slipped past the
        # insufficient_speech short-circuit, or audio-only-no-face
        # case). Surface "no grade" rather than defaulting to F.
        grade, label = None, None
    else:
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

    # Skip None signals — they mean "no measurement," not "low score."
    if signal_avgs["eye_contact"] is not None and signal_avgs["eye_contact"] < 55:
        insights.append(
            "Eye contact was weak — you looked away from camera frequently."
        )

    if signal_avgs["voice_steadiness"] is not None and signal_avgs["voice_steadiness"] < 55:
        insights.append(
            "Voice trembling detected — nervousness was audible."
        )

    if signal_avgs["vocal_variety"] is not None and signal_avgs["vocal_variety"] < 50:
        insights.append(
            "Delivery was monotone. Vary your pitch to stay engaging."
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

    base_report = {
        "session_id": session_id,
        "duration_s": duration_s,
        "avg_score": avg_total,
        "peak_score": peak_total,
        "lowest_score": lowest_total,
        "grade": grade,
        "grade_label": label,
        "signal_averages": signal_avgs,
        "signal_baseline_adjusted": signal_baseline_adjusted,
        "user_baseline": user_baseline,
        "baseline_note": baseline_note,
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
    }

    # ── LLM coaching (Gemini Flash-Lite) ─────────────────────────────
    # Runs only when a topic was supplied (practice session) and the
    # report is otherwise scoreable. Off-topic transcripts and missing
    # API keys both return None → coaching_status="skipped" so the
    # frontend's <CoachingPanel> stays hidden and the rule-based
    # insights/action_items above render instead.
    coaching = None
    coaching_status = "skipped"
    if prompt_meta and prompt_meta.get("title"):
        try:
            from llm_coach import generate_practice_coaching
            coaching = generate_practice_coaching(
                base_report,
                transcript_words=all_words,
                prompt_title=prompt_meta.get("title", ""),
                prompt_body=prompt_meta.get("body", ""),
            )
            coaching_status = "ready" if coaching else "skipped"
        except Exception as e:
            # Never let an LLM failure block the numeric report.
            import logging as _logging
            _logging.getLogger(__name__).warning(f"[llm_coach] failed: {e}")
            coaching_status = "failed"
    base_report["coaching"] = coaching
    base_report["coaching_status"] = coaching_status

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
