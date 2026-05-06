"""Shared pytest setup.

The backend modules import each other with bare names (e.g. `from auth
import ...`), expecting `backend/` to be on sys.path. Tests live one
level up at the repo root, so we insert backend/ into sys.path here
once for the whole suite.

Also sets WHISPER_AUTODETECT=1 so the language-detection regression
captures real Whisper language probability values (Task 2 will rely on
this signal).
"""
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = REPO_ROOT / "backend"

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# Honour the operator's .env if it exists, but don't fail if not.
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(BACKEND / ".env")
except ImportError:
    pass

# Ensure deterministic Whisper behaviour. The regression fixture is
# English-only; setting these explicitly keeps the test stable across
# environments where the operator may have flipped the env vars.
os.environ.setdefault("WHISPER_AUTODETECT", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
