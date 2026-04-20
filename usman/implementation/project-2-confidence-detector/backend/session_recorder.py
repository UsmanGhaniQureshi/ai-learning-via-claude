"""
Session Recorder — Records audio to WAV on a background thread.
Zero latency impact on the live analysis pipeline.
"""
import wave
import threading
import json
from datetime import datetime, timezone
import numpy as np
from pathlib import Path

RECORDINGS_DIR = Path(__file__).parent / "recordings"
RECORDINGS_DIR.mkdir(exist_ok=True)


def _parse_started_at(session_id: str):
    """Parse started_at ISO string from session_{epoch_ms} format if possible."""
    if session_id.startswith("session_"):
        try:
            epoch_ms = int(session_id[len("session_"):])
            return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).isoformat()
        except ValueError:
            return None
    return None


class SessionAudioRecorder:
    """
    Receives Float32 PCM chunks from the WebSocket pipeline.
    Writes to WAV on a background thread. Zero latency impact.
    """

    def __init__(self, session_id: str, sr=16000):
        self.session_id = session_id
        self.sr = sr
        self.path = RECORDINGS_DIR / f"{session_id}_audio.wav"
        self._lock = threading.Lock()
        self._wav = wave.open(str(self.path), 'wb')
        self._wav.setnchannels(1)
        self._wav.setsampwidth(2)  # 16-bit PCM
        self._wav.setframerate(sr)
        self._chunk_count = 0
        self._closed = False

    def write_chunk(self, audio: np.ndarray):
        """Write a Float32 audio chunk to the WAV file.
        Converts to 16-bit PCM. Thread-safe."""
        if self._closed:
            return
        pcm16 = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
        with self._lock:
            if not self._closed:
                self._wav.writeframes(pcm16.tobytes())
                self._chunk_count += 1

    def close(self) -> dict:
        """Close the WAV file and return recording metadata."""
        with self._lock:
            if not self._closed:
                self._wav.close()
                self._closed = True
        duration_s = (self._chunk_count * 3)  # Each chunk is ~3 seconds
        return {
            "audio_path": str(self.path),
            "duration_s": duration_s,
            "session_id": self.session_id,
        }

    @staticmethod
    def list_recordings():
        """List all recorded sessions by unioning audio/video/report stems.

        Each entry returns browser-loadable URLs (not disk paths) plus
        duration_s and score from the saved report JSON when available.
        Partial sessions (missing video, missing report, etc.) are listed
        gracefully without raising.
        """
        sessions = {}
        suffixes = (
            ("_audio.wav", "audio"),
            ("_video.webm", "video"),
            ("_report.json", "report"),
        )
        for f in RECORDINGS_DIR.iterdir():
            if not f.is_file():
                continue
            sid = None
            kind = None
            for suffix, k in suffixes:
                if f.name.endswith(suffix):
                    sid = f.name[: -len(suffix)]
                    kind = k
                    break
            if not sid:
                continue
            entry = sessions.setdefault(sid, {
                "session_id": sid,
                "started_at": _parse_started_at(sid),
                "duration_s": None,
                "score": None,
                "has_video": False,
                "has_audio": False,
                "has_report": False,
                "video_url": f"/api/recordings/{sid}/video",
                "audio_url": f"/api/recordings/{sid}/audio",
                "report_url": f"/api/report/{sid}",
            })
            if kind == "audio":
                entry["has_audio"] = True
            elif kind == "video":
                entry["has_video"] = True
            elif kind == "report":
                entry["has_report"] = True
                try:
                    report = json.loads(f.read_text())
                    entry["duration_s"] = report.get("duration_s")
                    entry["score"] = report.get("avg_score")
                except Exception:
                    pass
        return sorted(
            sessions.values(),
            key=lambda x: x.get("started_at") or x["session_id"],
            reverse=True,
        )
