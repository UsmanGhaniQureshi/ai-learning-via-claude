"""LLM-powered practice coaching via Gemini Flash-Lite.

This module is intentionally optional. If no topic was provided, the
transcript does not match the topic, the Gemini client is unavailable,
or the model returns unusable output, callers fall back to the existing
rule-based wins and improvements.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash-lite"

_client = None
_client_init_attempted = False
_client_unavailable_reason: str | None = None

_TOPIC_STOPWORDS = {
    "this",
    "that",
    "with",
    "from",
    "they",
    "them",
    "have",
    "will",
    "your",
    "when",
    "what",
    "about",
}


def _get_client():
    """Return a cached Gemini client, or None when it cannot be created."""
    global _client, _client_init_attempted, _client_unavailable_reason

    if _client is not None:
        return _client
    if _client_init_attempted:
        return None

    _client_init_attempted = True
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        _client_unavailable_reason = "no_api_key"
        logger.info("[llm_coach] skipping Gemini coaching: GEMINI_API_KEY not set")
        return None

    try:
        from google import genai  # type: ignore

        _client = genai.Client(api_key=api_key)
        _client_unavailable_reason = None
    except Exception as exc:
        _client = None
        _client_unavailable_reason = "client_init_failed"
        logger.warning(f"[llm_coach] failed to init Gemini client: {exc}")
    return _client


def _evaluate_topic_match(
    transcript: str,
    topic_title: str,
    topic_body: str,
) -> tuple[bool, str | None]:
    """Return whether the transcript is relevant to the requested topic."""
    if not transcript or len(transcript.split()) < 10:
        return False, "transcript_too_short"

    topic_text = f"{topic_title} {topic_body}".lower()
    topic_words = set(re.findall(r"\b\w{4,}\b", topic_text))
    topic_words -= _TOPIC_STOPWORDS
    if not topic_words:
        return True, None

    transcript_lower = transcript.lower()
    matches = sum(1 for word in topic_words if word in transcript_lower)
    overlap = matches / max(len(topic_words), 1)
    if overlap >= 0.10:
        return True, None
    return False, "topic_mismatch"


def _format_signal_str(signal_avgs: dict[str, Any]) -> str:
    """One-line summary like 'eye_contact 78, voice_steadiness 65, ...'."""
    parts = []
    for key in (
        "voice_steadiness",
        "eye_contact",
        "speech_pace",
        "filler_words",
        "vocal_variety",
        "expression",
    ):
        value = signal_avgs.get(key)
        if value is None:
            parts.append(f"{key} N/A")
        else:
            parts.append(f"{key} {round(value)}")
    return ", ".join(parts)


def _format_filler_str(filler_breakdown: dict[str, int], total_fillers: int) -> str:
    """Return a compact filler summary for the prompt."""
    if total_fillers == 0:
        return "0 - no filler words detected"
    if not filler_breakdown:
        return f"{total_fillers} total (acoustic only - non-lexical)"
    items = sorted(filler_breakdown.items(), key=lambda item: -item[1])[:5]
    return f"{total_fillers} total - " + ", ".join(f"{word} ({count})" for word, count in items)


def _trim_transcript(transcript_words: list[dict], max_words: int = 350) -> str:
    """Reconstruct a plain-text transcript capped at max_words."""
    words = [word.get("word", "") for word in transcript_words if word.get("word")]
    if not words:
        return ""
    if len(words) <= max_words:
        return " ".join(words)
    head = words[: int(max_words * 0.7)]
    tail = words[-int(max_words * 0.3) :]
    return " ".join(head) + " [trimmed] " + " ".join(tail)


def _coaching_result(
    *,
    coaching: dict | None,
    status: str,
    source: str,
    skip_reason: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "coaching": coaching,
        "status": status,
        "source": source,
        "skip_reason": skip_reason,
        "error": error,
    }


def _strip_json_fence(raw: str) -> str:
    return re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()


def generate_practice_coaching_result(
    report: dict,
    *,
    transcript_words: list[dict],
    prompt_title: str,
    prompt_body: str,
) -> dict[str, Any]:
    """Generate structured coaching and explain whether Gemini was used."""
    topic = (prompt_title or "").strip()
    if not topic:
        logger.info("[llm_coach] skipping Gemini coaching: no practice topic provided")
        return _coaching_result(
            coaching=None,
            status="skipped",
            source="rule_based",
            skip_reason="missing_topic",
        )

    transcript_text = _trim_transcript(transcript_words)
    total_words = len([word for word in transcript_words if word.get("word")])

    topic_match, topic_reason = _evaluate_topic_match(transcript_text, topic, prompt_body or "")
    if not topic_match:
        logger.info(
            "[llm_coach] skipping Gemini coaching for '%s': %s (%s words)",
            topic,
            topic_reason,
            total_words,
        )
        return _coaching_result(
            coaching=None,
            status="skipped",
            source="rule_based",
            skip_reason=topic_reason,
        )

    client = _get_client()
    if client is None:
        return _coaching_result(
            coaching=None,
            status="skipped",
            source="rule_based",
            skip_reason=_client_unavailable_reason or "client_unavailable",
        )

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
        f'You are a public speaking coach reviewing a practice session on the topic: "{topic}".\n\n'
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
        '  "topic_ack": "Acknowledge the topic they practiced and their overall result in one sentence. '
        'Must name the topic and the grade or score.",\n\n'
        '  "english": {\n'
        '    "grade": "A/B/C/D",\n'
        '    "summary": "One sentence on their English quality in this session.",\n'
        '    "wins": [\n'
        '      "Specific English strength seen in their transcript",\n'
        '      "Another specific strength"\n'
        "    ],\n"
        '    "improvements": [\n'
        '      "Specific English issue with example from transcript",\n'
        '      "Another specific issue"\n'
        "    ],\n"
        '    "filler_note": "One line on filler usage with the actual count or words."\n'
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
        '  "next_session": "One concrete action for their next practice on this topic. '
        'Name the topic. Be specific, not generic."\n'
        "}\n\n"
        "Hard rules:\n"
        "- topic_ack must name the topic and their score or grade.\n"
        "- Every win and improvement must reference this session's data.\n"
        "- improvements must each have exactly 2 items.\n"
        "- next_session must mention the topic name.\n"
        "- If transcript does not match the topic, return null.\n"
        "- Under 400 tokens total.\n"
        "- JSON only."
    )

    logger.info(
        "[llm_coach] requesting Gemini coaching for '%s' (%s words, score=%s)",
        topic,
        total_words,
        score_avg,
    )

    try:
        from google.genai import types  # type: ignore

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_budget=0),
                max_output_tokens=600,
                temperature=0.6,
            ),
        )
    except Exception as exc:
        logger.warning(f"[llm_coach] Gemini call failed for '{topic}': {exc}")
        return _coaching_result(
            coaching=None,
            status="failed",
            source="rule_based",
            error="gemini_call_failed",
        )

    raw = (getattr(response, "text", None) or "").strip()
    if not raw:
        logger.warning(f"[llm_coach] Gemini returned empty text for '{topic}'")
        return _coaching_result(
            coaching=None,
            status="failed",
            source="rule_based",
            error="empty_response",
        )

    if raw.lower() == "null":
        logger.info(f"[llm_coach] Gemini returned null for '{topic}'")
        return _coaching_result(
            coaching=None,
            status="skipped",
            source="rule_based",
            skip_reason="model_topic_mismatch",
        )

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        stripped = _strip_json_fence(raw)
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            logger.warning(f"[llm_coach] Gemini returned non-JSON for '{topic}': {raw[:200]}")
            return _coaching_result(
                coaching=None,
                status="failed",
                source="rule_based",
                error="invalid_json",
            )

    if not isinstance(parsed, dict):
        logger.warning(f"[llm_coach] Gemini returned non-object JSON for '{topic}'")
        return _coaching_result(
            coaching=None,
            status="failed",
            source="rule_based",
            error="invalid_shape",
        )

    required = ("topic_ack", "english", "confidence")
    if not all(key in parsed for key in required):
        logger.warning(
            "[llm_coach] Gemini response missing required keys for '%s': %s",
            topic,
            list(parsed.keys()),
        )
        return _coaching_result(
            coaching=None,
            status="failed",
            source="rule_based",
            error="invalid_shape",
        )

    logger.info(
        "[llm_coach] Gemini coaching ready for '%s' via %s",
        topic,
        MODEL_NAME,
    )
    return _coaching_result(
        coaching=parsed,
        status="ready",
        source="gemini",
    )


def generate_practice_coaching(
    report: dict,
    *,
    transcript_words: list[dict],
    prompt_title: str,
    prompt_body: str,
) -> dict | None:
    """Backward-compatible wrapper for older callers."""
    return generate_practice_coaching_result(
        report,
        transcript_words=transcript_words,
        prompt_title=prompt_title,
        prompt_body=prompt_body,
    ).get("coaching")
