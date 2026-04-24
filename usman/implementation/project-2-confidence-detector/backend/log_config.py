"""Structured JSON logging.

Emits one JSON object per log line so logs are greppable, aggregatable
in tools like Loki / CloudWatch Logs Insights, and trivially parseable
into dashboards.

Why JSON and not plain text:
  - `{"level":"ERROR","event":"upload_failed","media_id":"abc123"}` is
    queryable as structured data (field filters, aggregations). A plain
    "[ERROR] upload failed for abc123" is not.
  - Consistent field names across every log line make alerting rules
    stable even when human-readable wording changes.

Usage:
    from log_config import configure_logging, get_logger
    configure_logging()
    log = get_logger(__name__)
    log.info("upload.start", extra={"media_id": m_id, "bytes": size})

Any key in `extra` is merged into the JSON record at the top level —
don't reuse reserved fields (level, event, time, logger).
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone


_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "taskName",
    # "message" is reserved in LogRecord — Python's logging raises
    # KeyError if a caller tries to shadow it via `extra=`. Keeping it
    # here means our formatter never tries to re-use that name either.
    "message",
}


class JsonFormatter(logging.Formatter):
    """Serialize each LogRecord as a single-line JSON object.

    Fields always present: time (ISO 8601 UTC), level, logger, event.
    Any ``extra=`` dict passed by the caller is merged at top-level
    after reserved-name filtering.
    """

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        payload: dict = {
            "time": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        if record.exc_info:
            payload["traceback"] = self.formatException(record.exc_info)
        # Merge any `extra={...}` fields the caller attached.
        for key, val in record.__dict__.items():
            if key in _RESERVED or key in payload or key.startswith("_"):
                continue
            # Best-effort serialisation; fall back to repr for weird types.
            try:
                json.dumps(val)
                payload[key] = val
            except (TypeError, ValueError):
                payload[key] = repr(val)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    """Install the JSON formatter on the root logger and set level.

    Level is read from LOG_LEVEL env; default INFO. Uvicorn's own
    access / error loggers are also reparented so their records flow
    through the same formatter.

    Idempotent: calling twice won't stack handlers.
    """
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    # Clear any handlers a previous call installed.
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)

    # Reparent common third-party loggers so their messages hit the
    # same JSON pipeline. We set propagate=True and strip their own
    # handlers so the root handler is the only emitter.
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "sqlalchemy.engine"):
        lg = logging.getLogger(name)
        for h in list(lg.handlers):
            lg.removeHandler(h)
        lg.propagate = True


def get_logger(name: str) -> logging.Logger:
    """Shortcut — returns a logger with the right name. Use __name__
    at the call site so log lines carry the module they came from."""
    return logging.getLogger(name)
