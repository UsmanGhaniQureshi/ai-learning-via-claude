"""
Session Recorder — Records audio to WAV on a background thread.
Zero latency impact on the live analysis pipeline.
"""
import wave
import threading
import numpy as np
from pathlib import Path

RECORDINGS_DIR = Path(__file__).parent / "recordings"
RECORDINGS_DIR.mkdir(exist_ok=True)


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
        """List all recorded sessions."""
        recordings = []
        for f in RECORDINGS_DIR.glob("*_audio.wav"):
            session_id = f.stem.replace("_audio", "")
            size_mb = round(f.stat().st_size / 1e6, 2)
            recordings.append({
                "session_id": session_id,
                "filename": f.name,
                "path": str(f),
                "size_mb": size_mb,
            })
        return sorted(recordings, key=lambda x: x['filename'], reverse=True)
