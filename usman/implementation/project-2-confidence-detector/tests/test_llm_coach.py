"""Unit tests for the LLM coaching module.

We DON'T hit Gemini in CI — every test that would require a real API
call is gated on env or stubbed. Coverage:

- topic-relevance gate (no API call needed)
- prompt-title required (returns None when missing)
- API-key absent → returns None gracefully
- report_generator integrates the field (coaching_status="skipped" on
  the no-key path)
"""
from __future__ import annotations

import os
import pytest

from llm_coach import (
    _evaluate_topic_match,
    generate_practice_coaching,
)


# Adapter so the original boolean-style assertions still read cleanly.
# `_evaluate_topic_match` now returns (matches, reason); we only care
# about the boolean here — the reason is exercised separately below.
def _transcript_matches_topic(transcript, *, topic_title, topic_body):
    matched, _reason = _evaluate_topic_match(transcript, topic_title, topic_body)
    return matched
from report_generator import generate_post_session_report


# ───────────────────────── topic-relevance gate ─────────────────────────


def test_topic_match_too_short_transcript():
    """Under 10 words is not enough signal — bail."""
    assert _transcript_matches_topic(
        "Hello world",
        topic_title="Job interview",
        topic_body="Tell me about a time you led a team.",
    ) is False


def test_topic_match_clear_overlap():
    """A transcript that mentions the topic vocabulary clears the gate."""
    transcript = (
        "Last quarter at Acme I led a team of four engineers through "
        "an onboarding redesign. Tell me how I handled the project."
    )
    assert _transcript_matches_topic(
        transcript,
        topic_title="Job interview — leadership",
        topic_body="Tell me about a time you led a team",
    ) is True


def test_topic_match_clearly_off_topic():
    """A long transcript with zero topic vocabulary should fail the gate."""
    transcript = (
        "I went to the grocery store and bought apples and milk. The "
        "weather was sunny and the dog barked at every passing car. I "
        "decided to take the long way home today."
    )
    assert _transcript_matches_topic(
        transcript,
        topic_title="Wedding speech for my brother",
        topic_body="Toast the bride and groom on their special day",
    ) is False


def test_topic_match_empty_topic_body_lets_it_through():
    """Free-practice / topic_body too short to extract keywords:
    the gate stops gating and lets the LLM judge."""
    transcript = (
        "I want to talk about something completely random tonight, "
        "covering several different ideas across multiple unrelated areas."
    )
    assert _transcript_matches_topic(
        transcript,
        topic_title="x",     # too short to yield keywords
        topic_body="",
    ) is True


# ───────────────────────── public entry point gates ─────────────────────────


def test_generate_practice_coaching_empty_title_returns_none():
    """No topic_title → not a practice session → return None."""
    fake_words = [{"word": "hello"}] * 30
    out = generate_practice_coaching(
        report={},
        transcript_words=fake_words,
        prompt_title="",
        prompt_body="",
    )
    assert out is None


def test_generate_practice_coaching_off_topic_returns_none():
    """The relevance gate fires before the LLM does."""
    transcript_words = [
        {"word": "the"}, {"word": "weather"}, {"word": "is"},
        {"word": "very"}, {"word": "sunny"}, {"word": "today"},
        {"word": "and"}, {"word": "the"}, {"word": "dog"},
        {"word": "is"}, {"word": "barking"}, {"word": "loudly"},
    ]
    out = generate_practice_coaching(
        report={"avg_score": 70, "grade": "B"},
        transcript_words=transcript_words,
        prompt_title="Wedding speech",
        prompt_body="Toast the bride and groom and tell a story about them",
    )
    assert out is None


def test_generate_practice_coaching_no_api_key_returns_none(monkeypatch):
    """When GEMINI_API_KEY isn't set, generate_practice_coaching must
    bail gracefully — it must NOT raise, even when the gate passes."""
    # Force "no key" semantics. We also reset the cached client so the
    # lazy init picks up the missing env on this test run.
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    import llm_coach
    monkeypatch.setattr(llm_coach, "_client", None)
    monkeypatch.setattr(llm_coach, "_client_init_attempted", False)

    transcript_words = [
        {"word": w} for w in
        "I led the team through a major release last quarter and "
        "managed the timeline carefully despite two key engineers "
        "leaving partway".split()
    ]
    out = generate_practice_coaching(
        report={"avg_score": 70, "grade": "B"},
        transcript_words=transcript_words,
        prompt_title="Job interview leadership",
        prompt_body="Tell me about a time you led a team through a difficult release",
    )
    assert out is None  # graceful skip, not a crash


# ───────────────────────── integration with report_generator ─────────────────────────


def test_report_generator_fills_coaching_skipped_when_no_topic():
    """No prompt_meta → coaching is None and coaching_status is 'skipped'."""
    snapshots = _scoreable_snapshots()
    report = generate_post_session_report(snapshots, "no-topic-test")
    assert report.get("coaching") is None
    assert report.get("coaching_status") == "skipped"


def test_report_generator_fills_coaching_skipped_when_no_api_key(monkeypatch):
    """prompt_meta with a topic but no API key → coaching is None
    and coaching_status is 'skipped' (graceful, not 'failed')."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    import llm_coach
    monkeypatch.setattr(llm_coach, "_client", None)
    monkeypatch.setattr(llm_coach, "_client_init_attempted", False)

    snapshots = _scoreable_snapshots()
    report = generate_post_session_report(
        snapshots, "no-key-test",
        prompt_meta={"title": "Job interview leadership",
                     "body": "Tell me about a time you led a team"},
    )
    assert report.get("coaching") is None
    assert report.get("coaching_status") == "skipped"


def test_report_generator_short_circuits_carry_coaching_skipped():
    """insufficient_speech and unsupported_language reports must also
    expose coaching=null + coaching_status='skipped' so the frontend
    handles every shape uniformly."""
    # All-silent → insufficient_speech
    silent_snaps = [
        {"scores": {k: None for k in (
            "voice_steadiness", "eye_contact", "speech_pace",
            "filler_words", "vocal_variety", "expression", "total",
        )}, "raw": {"voiced_s": 0}, "transcript_words": []}
        for _ in range(3)
    ]
    report = generate_post_session_report(silent_snaps, "silent-test")
    assert report.get("insufficient_speech") is True
    assert report.get("coaching") is None
    assert report.get("coaching_status") == "skipped"


# ───────────────────────── helpers ─────────────────────────


def _scoreable_snapshots():
    """Build the minimum snapshot list that passes the
    insufficient_speech + unsupported_language gates and produces a
    real report — so the LLM coaching branch is reached. Uses 4
    chunks × 2 s voiced × 5 stub words = 8 s voiced + 20 words, which
    clears both 5-s and 8-word thresholds."""
    fake_words = [
        {"word": w, "start_ms": i * 200, "end_ms": i * 200 + 150,
         "is_filler": False, "probability": 0.95}
        for i, w in enumerate(["this", "is", "a", "real", "session"])
    ]
    return [
        {
            "scores": {
                "voice_steadiness": 75,
                "eye_contact": 80,
                "speech_pace": 75,
                "filler_words": 90,
                "vocal_variety": 65,
                "expression": 60,
                "total": 75,
            },
            "raw": {"voiced_s": 2.0, "lexical_fillers": [],
                    "acoustic_fillers": [], "pitch": {"std_hz": 25}},
            "transcript_words": list(fake_words),
        }
        for _ in range(4)
    ]
