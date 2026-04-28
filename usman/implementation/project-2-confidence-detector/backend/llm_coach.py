"""LLM-powered practice coaching via Gemini Flash-Lite.

Called from `report_generator.generate_post_session_report` AFTER the
rule-based numeric report is built. Adds three keys to the returned
report dict:

    coaching        : dict | None — the structured coaching JSON
    coaching_status : str         — "ready" | "skipped" | "failed"
    coaching_error  : str | None  — short reason when status != "ready"

The frontend's `<CoachingPanel>` mounts only when `coaching_status ==
"ready"`. Other statuses suppress the panel and let the existing
rule-based insights/action_items render instead.

Why a separate module:
- Keeps the LLM I/O + prompt out of the otherwise pure-numeric
  `report_generator.py`.
- The whole module is a no-op on import if `GEMINI_API_KEY` isn't set
  — `generate_practice_coaching` returns None and the report carries
  `coaching_status: "failed"` with reason "no api key configured".

Cost note: Gemini 2.5 Flash-Lite at the time this was written is
~$0.10 per 1M input tokens and ~$0.40 per 1M output. A typical
coaching call is ~1500 input + ~300 output, so ≈$0.0003 per session.
We cap output to 600 tokens and force JSON output to keep cost stable.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

# Lazy-imported inside `_get_client` so the module imports cleanly even
# if google-genai isn't installed in some environment (the report path
# still works; coaching just stays "failed").
_client = None
_client_init_attempted = False


def _get_client():
    """Return a cached Gemini client, or None if init isn't possible.

    Lazy: we don't even attempt the import / init until the first
    coaching call. That way `import llm_coach` is free everywhere
    else (tests, the rest of the report path, etc.).
    """
    global _client, _client_init_attempted
    if _client is not None or _client_init_attempted:
        return _client
    _client_init_attempted = True
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.info("[llm_coach] GEMINI_API_KEY not set; coaching disabled")
        return None
    try:
        from google import genai  # type: ignore
        _client = genai.Client(api_key=api_key)
    except Exception as e:
        logger.warning(f"[llm_coach] failed to init Gemini client: {e}")
        _client = None
    return _client


# ─────────────────────────── topic-relevance gate ───────────────────────────

# Common-English stop set — would otherwise inflate apparent overlap on
# any transcript. Matches the gate the audit prescribed.
_TOPIC_STOPWORDS = {
    "this", "that", "with", "from", "they", "them",
    "have", "will", "your", "when", "what", "about",
}


def _transcript_matches_topic(
    transcript: str,
    topic_title: str,
    topic_body: str,
) -> bool:
    """Returns False if the transcript is clearly off-topic.

    Uses simple keyword overlap — no extra API call. Words shorter
    than 4 chars and the stopword set are excluded so the overlap is
    measured on content words, not function words.
    """
    if not transcript or len(transcript.split()) < 10:
        return False

    topic_text = f"{topic_title} {topic_body}".lower()
    topic_words = set(re.findall(r"\b\w{4,}\b", topic_text))
    topic_words -= _TOPIC_STOPWORDS
    if not topic_words:
        # Free practice / topic_body too short to extract keywords.
        # Don't gate — let the LLM judge.
        return True

    transcript_lower = transcript.lower()
    matches = sum(1 for w in topic_words if w in transcript_lower)
    overlap = matches / max(len(topic_words), 1)
    return overlap >= 0.10


# ─────────────────────────── prompt assembly helpers ───────────────────────────


def _format_signal_str(signal_avgs: dict[str, Any]) -> str:
    """One-line summary like 'eye_contact 78, voice_steadiness 65, ...'."""
    parts = []
    for key in (
        "voice_steadiness", "eye_contact", "speech_pace",
        "filler_words", "vocal_variety", "expression",
    ):
        v = signal_avgs.get(key)
        if v is None:
            parts.append(f"{key} N/A")
        else:
            parts.append(f"{key} {round(v)}")
    return ", ".join(parts)


def _format_filler_str(filler_breakdown: dict[str, int], total_fillers: int) -> str:
    """E.g. '14 total — um (6), like (4), uh (2)'. Empty string when zero."""
    if total_fillers == 0:
        return "0 — no filler words detected"
    if not filler_breakdown:
        return f"{total_fillers} total (acoustic only — non-lexical)"
    items = sorted(filler_breakdown.items(), key=lambda x: -x[1])[:5]
    return f"{total_fillers} total — " + ", ".join(f"{w} ({c})" for w, c in items)


def _trim_transcript(transcript_words: list[dict], max_words: int = 350) -> str:
    """Reconstruct a plain-text transcript, capped at max_words.

    Long sessions can run 1000+ words; we keep the first 250 + last 100
    so the LLM sees the opener and the close (where confidence usually
    dips) without burning input tokens on the middle.
    """
    words = [w.get("word", "") for w in transcript_words if w.get("word")]
    if not words:
        return ""
    if len(words) <= max_words:
        return " ".join(words)
    head = words[: int(max_words * 0.7)]
    tail = words[-int(max_words * 0.3):]
    return " ".join(head) + " […trimmed…] " + " ".join(tail)


# ─────────────────────────── public entry point ───────────────────────────


def generate_practice_coaching(
    report: dict,
    *,
    transcript_words: list[dict],
    prompt_title: str,
    prompt_body: str,
) -> dict | None:
    """Generate structured coaching from a finished report.

    Args:
      report: the dict produced by generate_post_session_report — must
              be a SCOREABLE one (avg_score not None, no
              insufficient_speech / unsupported_language flags).
      transcript_words: raw word dicts from the audio pipeline (with
              `word`, `is_filler`, etc.) — passed in separately because
              the report's flat `transcript` list is also fine but the
              raw shape is cheaper to format.
      prompt_title: the topic the user practiced (e.g. "Job interview").
              Required — empty string returns None.
      prompt_body: the topic brief shown in PracticeSetup. May be empty.

    Returns:
      dict matching the schema in the system prompt below, or None if:
      - prompt_title is empty (not a practice session)
      - transcript is off-topic (gate)
      - GEMINI_API_KEY not set
      - LLM call failed / returned non-JSON / returned null
    """
    if not prompt_title or not prompt_title.strip():
        return None

    transcript_text = _trim_transcript(transcript_words)
    total_words = len([w for w in transcript_words if w.get("word")])

    if not _transcript_matches_topic(transcript_text, prompt_title, prompt_body or ""):
        logger.info(
            f"[llm_coach] transcript off-topic for '{prompt_title}' "
            f"({total_words} words); skipping coaching"
        )
        return None

    client = _get_client()
    if client is None:
        return None

    score_avg = report.get("avg_score")
    grade = report.get("grade") or "?"
    signal_str = _format_signal_str(report.get("signal_averages") or {})
    filler_str = _format_filler_str(
        report.get("filler_breakdown") or {},
        int(report.get("total_fillers") or 0),
    )
    pace = report.get("pace") or {}
    wpm = pace.get("avg_wpm") or 0

    prompt = (
        f'You are a public speaking coach reviewing a practice '
        f'session on the topic: "{prompt_title}".\n\n'
        f"Topic brief: {(prompt_body or '')[:150]}\n\n"
        f"Transcript ({total_words} words, key sections):\n"
        f"{transcript_text}\n\n"
        f"Session data:\n"
        f"- Overall score: {score_avg}/100 (grade {grade})\n"
        f"- {signal_str}\n"
        f"- Top fillers: {filler_str}\n"
        f"- Pace: {round(wpm)} WPM\n\n"
        "Return ONLY this JSON, no markdown, no extra text:\n"
        "{\n"
        '  "topic_ack": "Acknowledge the topic they practiced AND their '
        "overall result in one sentence. Must name the topic and the "
        'grade/score.",\n\n'
        '  "english": {\n'
        '    "grade": "A/B/C/D",\n'
        '    "summary": "One sentence on their English quality in THIS session.",\n'
        '    "wins": [\n'
        '      "Specific English strength seen in their transcript",\n'
        '      "Another specific strength"\n'
        "    ],\n"
        '    "improvements": [\n'
        '      "Specific English issue with example from transcript",\n'
        '      "Another specific issue"\n'
        "    ],\n"
        '    "filler_note": "One line on filler usage with the actual count/words."\n'
        "  },\n\n"
        '  "confidence": {\n'
        '    "grade": "A/B/C/D",\n'
        '    "summary": "One sentence on their confidence delivery using the actual score.",\n'
        '    "wins": [\n'
        '      "Specific confidence win tied to a signal name and number",\n'
        '      "Another win"\n'
        "    ],\n"
        '    "improvements": [\n'
        '      "Specific confidence issue tied to a signal name and number",\n'
        '      "Another issue"\n'
        "    ],\n"
        '    "weakest_signal": "the single signal name with lowest score"\n'
        "  },\n\n"
        '  "next_session": "One concrete action for their NEXT practice on '
        'THIS topic. Name the topic. Be specific not generic."\n'
        "}\n\n"
        "Hard rules:\n"
        "- topic_ack MUST name the topic and their score/grade.\n"
        "- Every win and improvement must reference THIS session's data.\n"
        "- improvements must each have exactly 2 items — never skip.\n"
        "- next_session must mention the topic name.\n"
        "- If transcript does not match the topic, return null.\n"
        "- Under 400 tokens total.\n"
        "- JSON only."
    )

    try:
        from google.genai import types  # type: ignore
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                # thinking_budget=0 keeps Flash-Lite in non-thinking
                # mode — matches the project's "fast and cheap" rule.
                thinking_config=types.ThinkingConfig(thinking_budget=0),
                max_output_tokens=600,
                temperature=0.6,
            ),
        )
    except Exception as e:
        logger.warning(f"[llm_coach] gemini call failed: {e}")
        return None

    raw = (getattr(response, "text", None) or "").strip()
    if not raw:
        logger.warning("[llm_coach] gemini returned empty text")
        return None
    if raw.lower() == "null":
        # The prompt instructs the model to return literal null when the
        # transcript doesn't match the topic. Treat as "skipped".
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Strip a possible markdown code fence (Flash-Lite usually
        # respects response_mime_type=json, but belt-and-braces).
        stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            logger.warning(f"[llm_coach] non-JSON response: {raw[:200]}")
            return None

    if not isinstance(parsed, dict):
        return None
    # Minimal shape validation. We don't reject on missing optional
    # fields — the frontend handles partials — but the three top-level
    # blocks the user explicitly asked for must exist.
    required = ("topic_ack", "english", "confidence")
    if not all(k in parsed for k in required):
        logger.warning(f"[llm_coach] response missing required keys: {list(parsed.keys())}")
        return None

    return parsed
