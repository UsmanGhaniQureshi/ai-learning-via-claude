"""
Calibration prompt copy — emotion-elicitation prompts for face
capture, plus the voice-recording prompt.

The prompts are deliberately written as **memory recall** /
**imagined situation** triggers rather than "perform X". Performed
emotions activate different facial muscle groups than genuine
recalled emotions and would produce a wrong baseline. Do not
simplify the wording.

Both dicts are imported by:
  - `main.py` calibration endpoints (returned to the client at /start)
  - the frontend (mirrored copy in calibration UI components — kept
    in sync by reading from `/api/calibration/start`)

Note: the set was reduced to 5 face-elicitable emotions and 1
voice prompt to keep total setup time under ~4 minutes. The 5
emotions cover the presentation-relevant face range
(authoritative/confident/excited on the positive side,
nervous/engaged for the cognitive-load side).

The full detector LABELS tuple in `emotion_detector.py` includes
prosody-only labels (disconnected, flat, hesitant, sad, angry) that
have no recall-able facial signature, so they intentionally do NOT
appear here. The cosine-similarity matcher only needs face profiles
for the 5 labels users actively perform.
"""
from __future__ import annotations


# Per-emotion prompts shown to the user during the face capture phase.
# The keys must match labels in `emotion_detector.LABELS` so the
# downstream cosine-similarity matcher in `calibration_engine.py`
# can use the same label space.
EMOTION_PROMPTS: dict[str, str] = {
    "authoritative": (
        "Imagine you are standing in front of a room and you are the "
        "person everyone is here to listen to. You know the material "
        "cold. Take that posture, that grounded expression, and let "
        "it show."
    ),
    "confident": (
        "Remember a specific moment when you felt completely in "
        "control — when you knew exactly what you were doing and it "
        "went well. Hold that memory and let it show."
    ),
    "excited": (
        "Think about something coming up that you are genuinely "
        "looking forward to. Let yourself feel that anticipation "
        "naturally."
    ),
    "nervous": (
        "You are about to walk on stage in front of 500 people. You "
        "can hear them on the other side of the curtain. You have 30 "
        "seconds. Let that feeling arrive naturally."
    ),
    "engaged": (
        "Think about a problem or topic that you find genuinely "
        "fascinating — something you could talk about for hours. Let "
        "your natural curiosity show."
    ),
}


# Voice prompt shown twice — once with camera ON (Part 2) and once
# with camera OFF (Part 3). Same prompt is used in both parts so we
# can compute the camera-anxiety delta (video-mode signals vs
# audio-mode signals) on identical content.
VOICE_PROMPTS: dict[int, dict[str, str]] = {
    0: {
        "title": "A personal story",
        "text": (
            "Tell us about something you did recently that you "
            "genuinely enjoyed — a trip, an experience, time with "
            "someone. Speak as if you are telling a close friend. "
            "Take your time."
        ),
    },
}
