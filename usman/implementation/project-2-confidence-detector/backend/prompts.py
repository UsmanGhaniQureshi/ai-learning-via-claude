"""
Practice prompts — a small library of topics users can pick from
when starting a practice session, so they never face a blank-page
moment ("the timer started… what do I talk about?").

Stored as a Python constant for now. If/when we want users to add
their own, this becomes a `prompts` table with a writeable endpoint.
The handler returns the list as-is via JSON.

Each prompt has:
  - id              stable string key, used as form value
  - title           short one-line label shown in the dropdown
  - body            a longer suggested framing the user reads before
                    or while recording (rendered as the topic copy)
  - category        for grouping in the picker (Job, Sales, Casual…)
  - suggested_min   how long this prompt usually runs; the duration
                    slider pre-fills to this value when the prompt is
                    selected, but the user can override.
"""

PROMPTS: list[dict] = [
    # ── Job interview prep ─────────────────────────────────────────
    {
        "id": "tell_about_yourself",
        "title": "Tell me about yourself",
        "body": (
            "Give a 90-second introduction covering your role, two "
            "concrete things you've shipped, and what you're looking "
            "for next. Avoid a CV recital — hit the highlights."
        ),
        "category": "Job interview",
        "suggested_min": 2,
    },
    {
        "id": "biggest_failure",
        "title": "Biggest professional failure",
        "body": (
            "Describe a project that didn't work, what specifically "
            "went wrong, what you'd do differently, and one thing "
            "you took into your next project as a result."
        ),
        "category": "Job interview",
        "suggested_min": 3,
    },
    {
        "id": "why_us",
        "title": "Why are you interested in this role?",
        "body": (
            "Tie what you know about the company to two things you "
            "specifically want to learn or contribute. Avoid generic "
            "platitudes (\"great culture\")."
        ),
        "category": "Job interview",
        "suggested_min": 2,
    },

    # ── Storytelling / narrative ──────────────────────────────────
    {
        "id": "elevator_pitch",
        "title": "30-second elevator pitch",
        "body": (
            "Pretend you're meeting a stranger in a lift. In 30 "
            "seconds, explain who you are, what you do, and what "
            "you're working on right now."
        ),
        "category": "Storytelling",
        "suggested_min": 1,
    },
    {
        "id": "explain_to_grandma",
        "title": "Explain your work to your grandmother",
        "body": (
            "Take the most technical thing you've worked on recently. "
            "Explain it in three minutes using zero jargon. Pretend "
            "your audience has never used a computer."
        ),
        "category": "Storytelling",
        "suggested_min": 3,
    },

    # ── Sales / product ───────────────────────────────────────────
    {
        "id": "product_demo",
        "title": "Product demo opening",
        "body": (
            "You have 90 seconds before a customer's attention drifts. "
            "Open a demo: state the problem, name the customer's pain, "
            "and tease the one feature that makes them lean in."
        ),
        "category": "Sales",
        "suggested_min": 2,
    },
    {
        "id": "objection_pricing",
        "title": "Handle a pricing objection",
        "body": (
            "Customer says, 'It's too expensive.' Respond. Don't drop "
            "the price — reframe the conversation around value or risk. "
            "Aim for 90 seconds."
        ),
        "category": "Sales",
        "suggested_min": 2,
    },

    # ── Disagreement / leadership ────────────────────────────────
    {
        "id": "respectful_disagreement",
        "title": "Disagree with a teammate respectfully",
        "body": (
            "Pick a recent decision you didn't fully agree with. "
            "Voice your disagreement out loud — what you'd say, how, "
            "and what alternative you'd propose. Aim to keep the "
            "tone collaborative, not adversarial."
        ),
        "category": "Leadership",
        "suggested_min": 3,
    },
    {
        "id": "give_feedback",
        "title": "Deliver tough feedback",
        "body": (
            "A direct report has been missing deadlines. You have a "
            "1:1 with them in five minutes. Rehearse what you'll "
            "open with, the specific examples, and what you'll ask "
            "of them going forward."
        ),
        "category": "Leadership",
        "suggested_min": 3,
    },

    # ── Casual / personal ─────────────────────────────────────────
    {
        "id": "wedding_speech",
        "title": "Wedding-speech opener",
        "body": (
            "Open a 5-minute wedding speech for a friend you've "
            "known for ten years. Get a laugh in the first 30 "
            "seconds without reading a list of in-jokes."
        ),
        "category": "Casual",
        "suggested_min": 5,
    },
    {
        "id": "conference_intro",
        "title": "Introduce yourself at a meetup",
        "body": (
            "It's an industry meetup with 30 strangers. The host "
            "asks each person to say their name, what they do, and "
            "one thing they're curious about right now. Keep it "
            "under 60 seconds."
        ),
        "category": "Casual",
        "suggested_min": 1,
    },

    # ── Free practice (no prompt) ─────────────────────────────────
    {
        "id": "free",
        "title": "Free practice — no prompt",
        "body": (
            "No script, no topic. Talk about whatever. Useful for "
            "warm-up sessions or when you just want to track your "
            "delivery on a real conversation you're rehearsing."
        ),
        "category": "Free",
        "suggested_min": 5,
    },
]


def list_prompts() -> list[dict]:
    """Return the prompt library. Returns the constant directly — the
    list is small enough that copying is wasteful, and the caller
    isn't expected to mutate it."""
    return PROMPTS
