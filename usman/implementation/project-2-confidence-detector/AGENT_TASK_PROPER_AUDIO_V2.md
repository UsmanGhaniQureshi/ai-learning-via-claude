# 🎙️ AGENT TASK — Production-Grade Speech Intelligence Engine (V2)
# Real signal processing + Session Recording + Post-Session Report + Standalone Audio Tester

You are a senior ML engineer who has built production speech analysis systems.
Your job is to:

1. Replace all patched/fake audio detection with REAL signal processing
2. Record the full audio + video of every session
3. Generate a complete post-session speech report when the user stops
4. Build a STANDALONE audio analysis module that works completely independently
   so it can be tested in isolation without the camera or live session

Read the entire codebase first. Then execute every phase in order.

---

## WHAT IS BEING BUILT

```
┌─────────────────────────────────────────────────────────────────┐
│                        TWO SEPARATE SYSTEMS                      │
│                                                                  │
│  SYSTEM A: Live Session (existing, being improved)               │
│  - Camera + mic active                                           │
│  - Real-time confidence score every 500ms                        │
│  - Records full audio + video to disk                            │
│  - On stop → runs post-session analysis → shows full report      │
│                                                                  │
│  SYSTEM B: Standalone Audio Analyzer (NEW, fully independent)    │
│  - User uploads an audio file OR records directly                │
│  - No camera needed. No live session needed.                     │
│  - Runs the full Poised-style speech analysis pipeline           │
│  - Returns identical report format as System A                   │
│  - Lives at /analyzer route. Can be run and tested alone.        │
└─────────────────────────────────────────────────────────────────┘
```

---

## WHY THE CURRENT APPROACH IS BROKEN

Before writing any code, read all existing audio/speech detection logic and
document every broken pattern. You will find:

- Filler word detection via `.includes("um")` on Whisper output
  → Whisper SUPPRESSES fillers by default. You never see them in the transcript.
  → Fix: word_timestamps=True + condition_on_previous_text=False

- "Confidence from volume" — louder = confident
  → Volume is not confidence. A nervous person shouts too.
  → Fix: Measure CONSISTENCY of volume, not absolute level.

- Pitch from raw FFT
  → FFT gives dominant frequency, not F0 (perceived pitch).
  → Fix: Use PYIN algorithm via librosa.

- Speech pace = word count / total elapsed seconds
  → Includes silence, understates true pace.
  → Fix: Articulation rate = words / voiced seconds (from VAD).

- "Ahh/umm/ehh" filler sounds not detected at all
  → Non-lexical sounds. Whisper drops them. String match finds nothing.
  → Fix: Acoustic classifier on raw audio BEFORE transcription.

- Eye contact from face bounding box center
  → Face center is not gaze direction.
  → Fix: MediaPipe iris landmarks (468-476) for real gaze vector.

---

## PHASE 1 — AUDIO PIPELINE (REAL SIGNAL PROCESSING)

### Architecture

```
Microphone (raw PCM 16kHz mono)
        |
        v
AudioWorkletProcessor (20ms frames, never blocks main thread)
        |
     split
    /       \
VAD          Acoustic Features
(Silero)     - RMS energy
             - ZCR
speech/      - Spectral centroid
silence      - F0 via PYIN
    |              |
    v              v
3s Buffer    Disfluency Detector
    |        Detects ahh/umm/ehh FROM AUDIO not text
    v              |
Whisper            |
tiny.en            |
word_timestamps=T  |
    |              |
    +------+-------+
           |
    Signal Scorer + Aggregator
           |
    WebSocket -> Frontend (500ms)
    SessionRecorder -> disk (continuous)
```

### AudioWorklet (frontend)

```javascript
// audioProcessor.worklet.js
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.FRAME_SIZE = 320; // 20ms at 16kHz
  }
  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;
    this.buffer.push(...input);
    while (this.buffer.length >= this.FRAME_SIZE) {
      const frame = new Float32Array(this.buffer.splice(0, this.FRAME_SIZE));
      this.port.postMessage({ type: 'frame', data: frame }, [frame.buffer]);
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
```

### VAD (Silero)

```python
# pip install silero-vad torch torchaudio
from silero_vad import load_silero_vad, get_speech_timestamps
import torch, numpy as np

_vad_model = None
def get_vad():
    global _vad_model
    if _vad_model is None:
        _vad_model, _ = load_silero_vad()
    return _vad_model

def detect_speech_boundaries(audio, sr=16000):
    tensor = torch.FloatTensor(audio)
    ts = get_speech_timestamps(
        tensor, get_vad(),
        threshold=0.5, sampling_rate=sr,
        min_speech_duration_ms=250,
        min_silence_duration_ms=100,
    )
    return [(t['start']/sr*1000, t['end']/sr*1000) for t in ts]
```

### F0 and Tremor (PYIN — proper pitch extraction)

```python
import librosa, numpy as np
from scipy.signal import butter, filtfilt

def extract_pitch_features(audio, sr=16000):
    """
    Uses PYIN — far more accurate than naive FFT for speech F0.
    """
    f0, voiced_flag, _ = librosa.pyin(
        audio,
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C7'),
        sr=sr, frame_length=2048, hop_length=512,
    )
    voiced_f0 = f0[voiced_flag]
    if len(voiced_f0) < 5:
        return {"mean_hz": 0, "std_hz": 0, "range_hz": 0, "tremor_score": 0}

    def measure_tremor(f0c):
        if len(f0c) < 20: return 0.0
        frame_rate = sr / 512
        nyq = frame_rate / 2
        low, high = 4/nyq, min(12/nyq, 0.99)
        b, a = butter(2, [low, high], btype='band')
        filtered = filtfilt(b, a, f0c - np.mean(f0c))
        return float(np.clip(
            np.sqrt(np.mean(filtered**2)) / (np.std(f0c) + 1e-6), 0, 1
        ))

    return {
        "mean_hz":      float(np.mean(voiced_f0)),
        "std_hz":       float(np.std(voiced_f0)),
        "range_hz":     float(np.ptp(voiced_f0)),
        "tremor_score": measure_tremor(voiced_f0),
    }
```

### Filler Sound Detection (from raw audio — NOT from text)

```python
def detect_filler_sounds_acoustic(audio, sr=16000):
    """
    Detects non-lexical fillers (ahh, umm, ehh) from raw audio.
    Acoustic signature: voiced + low spectral centroid + moderate energy.
    This catches what Whisper drops entirely.
    """
    frame_len = int(0.025 * sr)
    hop = int(0.010 * sr)
    detections = []

    for i in range(0, len(audio) - frame_len, hop):
        frame = audio[i:i+frame_len]
        rms = np.sqrt(np.mean(frame**2))
        if rms < 0.005: continue

        zcr = np.sum(np.abs(np.diff(np.sign(frame)))) / (2*len(frame))
        freqs = np.fft.rfftfreq(len(frame), 1/sr)
        mag = np.abs(np.fft.rfft(frame))
        centroid = float(np.sum(freqs * mag) / (np.sum(mag) + 1e-9))

        # Filler signature: voiced (low ZCR), low centroid, moderate energy
        if zcr < 0.08 and centroid < 600 and 0.01 < rms < 0.15:
            detections.append((i / sr) * 1000)

    # Merge nearby detections into segments (200ms minimum = real filler event)
    if not detections: return []
    segments, start, prev = [], detections[0], detections[0]
    for t in detections[1:]:
        if t - prev > 150:
            if prev - start >= 200:
                segments.append({"start_ms": start, "end_ms": prev, "type": "filler_sound"})
            start = t
        prev = t
    if prev - start >= 200:
        segments.append({"start_ms": start, "end_ms": prev, "type": "filler_sound"})
    return segments
```

### Whisper (word timestamps, fillers preserved)

```python
# pip install faster-whisper
from faster_whisper import WhisperModel

_whisper = None
def get_whisper():
    global _whisper
    if _whisper is None:
        _whisper = WhisperModel("tiny.en", device="auto", compute_type="int8")
    return _whisper

LEXICAL_FILLERS = {
    "um","uh","like","so","basically","literally","actually",
    "right","okay","you know","i mean","kind of","sort of","well"
}

def transcribe_chunk(audio, sr=16000):
    segments, _ = get_whisper().transcribe(
        audio, language="en",
        word_timestamps=True,
        condition_on_previous_text=False,  # critical: don't suppress fillers
        vad_filter=False,
        temperature=0.0,
    )
    words = []
    for seg in segments:
        for w in (seg.words or []):
            word = w.word.strip().lower().strip(".,!?")
            words.append({
                "word":        word,
                "start_ms":    w.start * 1000,
                "end_ms":      w.end   * 1000,
                "probability": w.probability,
                "is_filler":   word in LEXICAL_FILLERS,
            })
    return words
```

### Signal Scoring (calibrated, evidence-based)

```python
class SignalScorer:

    @staticmethod
    def eye_contact(gaze_scores, face_ratio):
        if face_ratio < 0.5: return 0
        if not gaze_scores:  return 50
        weights = np.linspace(0.5, 1.0, len(gaze_scores))
        return round(min(100, float(np.average(gaze_scores, weights=weights))))

    @staticmethod
    def voice_steadiness(pitch, rms_std):
        tremor_penalty = pitch.get("tremor_score", 0) * 70
        volume_penalty = min(30, (rms_std / 0.06) * 30)
        return max(0, round(100 - tremor_penalty - volume_penalty))

    @staticmethod
    def speech_pace(words, vad_segments):
        voiced_s = max(sum(e-s for s,e in vad_segments) / 1000, 0.1)
        count = len([w for w in words if len(w["word"]) > 1])
        wpm = (count / voiced_s) * 60
        if   130 <= wpm <= 160: score = 100
        elif 110 <= wpm <  130: score = 70 + (wpm-110)*1.5
        elif 160 <  wpm <= 180: score = 100 - (wpm-160)*3
        elif wpm > 180:         score = max(0, 100-(wpm-160)*5)
        elif 80  <= wpm <  110: score = 40 + (wpm-80)
        else:                   score = max(0, wpm*0.5)
        return {"wpm": round(wpm, 1), "score": round(score)}

    @staticmethod
    def filler_words(lexical_count, acoustic_count, voiced_s):
        rate = ((lexical_count + acoustic_count) / max(voiced_s, 1)) * 60
        if   rate == 0:  return 100
        elif rate < 2:   return 90
        elif rate < 5:   return 75
        elif rate < 10:  return 55
        elif rate < 20:  return 30
        else:            return 10

    @staticmethod
    def vocal_variety(pitch):
        std = pitch.get("std_hz", 0)
        if   std < 5:  return 20
        elif std < 15: return 40 + int((std-5)*4)
        elif std < 50: return int(80 + (std-15)*(20/35))
        elif std < 80: return 100
        else:          return max(50, 100-int((std-80)*2))

    @staticmethod
    def aggregate(signals):
        weights = {
            "voice_steadiness": 0.22,
            "eye_contact":      0.22,
            "speech_pace":      0.18,
            "filler_words":     0.18,
            "vocal_variety":    0.12,
            "expression":       0.08,
        }
        return round(sum(signals.get(k, 50) * w for k, w in weights.items()))
```

---

## PHASE 2 — SESSION RECORDING (AUDIO + VIDEO)

Every live session is recorded to disk silently.
Recording must never block or slow down the live analysis pipeline.

### 2A — Backend: Audio Recorder

```python
# session_recorder.py
import wave, threading, numpy as np, time
from pathlib import Path

RECORDINGS_DIR = Path("recordings")
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
        self._wav.setsampwidth(2)       # 16-bit PCM
        self._wav.setframerate(sr)
        self._chunk_count = 0

    def write_chunk(self, audio: np.ndarray):
        pcm16 = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
        with self._lock:
            self._wav.writeframes(pcm16.tobytes())
            self._chunk_count += 1

    def close(self) -> dict:
        with self._lock:
            self._wav.close()
        return {
            "audio_path": str(self.path),
            "duration_s": self._chunk_count * 3,
            "session_id": self.session_id,
        }
```

### 2B — Frontend: Video + Audio Recorder

```javascript
// videoRecorder.js
export class SessionVideoRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.blob = null;
  }

  async start(stream) {
    // stream = the SAME MediaStream used for the live camera feed
    // Reuse it — do not request a second getUserMedia
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 500_000,  // 500kbps — sufficient for face analysis
      audioBitsPerSecond: 64_000,
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(1000); // collect a chunk every 1s
  }

  stop() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        this.blob = new Blob(this.chunks, { type: 'video/webm' });
        resolve(this.blob);
      };
      this.mediaRecorder.stop();
    });
  }

  async uploadToServer(sessionId) {
    const formData = new FormData();
    formData.append('video', this.blob, `${sessionId}_video.webm`);
    formData.append('session_id', sessionId);
    const res = await fetch('/api/session/upload-video', {
      method: 'POST',
      body: formData,
    });
    return res.json();
  }

  downloadLocally(sessionId) {
    const url = URL.createObjectURL(this.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_${sessionId}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

### 2C — Backend: Video Upload Route

```python
from fastapi import UploadFile, File, Form
import shutil

@app.post("/api/session/upload-video")
async def upload_video(
    video: UploadFile = File(...),
    session_id: str = Form(...),
):
    path = RECORDINGS_DIR / f"{session_id}_video.webm"
    with open(path, "wb") as f:
        shutil.copyfileobj(video.file, f)
    size_mb = round(path.stat().st_size / 1e6, 2)
    return {"status": "saved", "path": str(path), "size_mb": size_mb}
```

### 2D — WebSocket Session: Recording + Report on Stop

```python
import asyncio, uuid, json, numpy as np
from fastapi import WebSocket

@app.websocket("/ws/session/{session_id}")
async def session_ws(ws: WebSocket, session_id: str):
    await ws.accept()

    pipeline       = AudioPipeline(get_whisper(), get_vad())
    audio_recorder = SessionAudioRecorder(session_id)
    snapshots      = []   # time-series for post-session report

    try:
        async for message in ws.iter_bytes():
            audio = np.frombuffer(message, dtype=np.float32)

            # Write to disk (non-blocking)
            audio_recorder.write_chunk(audio)

            # Run live analysis in thread pool (never blocks event loop)
            result = await asyncio.get_event_loop().run_in_executor(
                None, pipeline.process_chunk, audio
            )

            # Store snapshot
            snapshots.append(result)

            # Send live score
            await ws.send_json(result)

    except Exception:
        pass
    finally:
        # Session ended — close WAV, generate report
        recording_info = audio_recorder.close()
        report = generate_post_session_report(snapshots, session_id)
        report["recording"] = recording_info

        # Save report JSON
        report_path = RECORDINGS_DIR / f"{session_id}_report.json"
        report_path.write_text(json.dumps(report, indent=2))

        # Send final report to frontend
        await ws.send_json({"type": "session_ended", "report": report})
```

---

## PHASE 3 — POST-SESSION REPORT GENERATOR

Triggered automatically when session ends. Also used by the standalone analyzer.

```python
def generate_post_session_report(snapshots: list, session_id: str) -> dict:
    if not snapshots:
        return {"error": "No data recorded"}

    all_scores = [s["scores"] for s in snapshots]
    all_raw    = [s["raw"]    for s in snapshots]
    all_words  = [w for s in snapshots for w in s.get("transcript_words", [])]
    duration_s = len(snapshots) * 3

    def avg(key):
        vals = [s.get(key, 0) for s in all_scores]
        return round(sum(vals) / max(len(vals), 1))

    avg_total    = avg("total")
    peak_total   = max((s.get("total", 0) for s in all_scores), default=0)
    lowest_total = min((s.get("total", 0) for s in all_scores), default=0)

    signal_avgs = {
        "voice_steadiness": avg("voice_steadiness"),
        "eye_contact":      avg("eye_contact"),
        "speech_pace":      avg("speech_pace"),
        "filler_words":     avg("filler_words"),
        "vocal_variety":    avg("vocal_variety"),
        "expression":       avg("expression"),
    }

    # Filler word breakdown
    filler_counts = {}
    for w in all_words:
        if w.get("is_filler"):
            filler_counts[w["word"]] = filler_counts.get(w["word"], 0) + 1
    total_acoustic = sum(
        len(s["raw"].get("acoustic_fillers", [])) for s in snapshots
    )
    total_fillers = sum(filler_counts.values()) + total_acoustic

    # Pace stats
    wpms = [s.get("wpm", 0) for s in all_raw if s.get("wpm", 0) > 0]
    pace = {
        "avg_wpm":      round(sum(wpms) / max(len(wpms), 1), 1),
        "too_fast_pct": round(sum(1 for w in wpms if w > 180) / max(len(wpms),1) * 100),
        "too_slow_pct": round(sum(1 for w in wpms if 0 < w < 80) / max(len(wpms),1) * 100),
        "ideal_pct":    round(sum(1 for w in wpms if 130<=w<=160) / max(len(wpms),1) * 100),
    }

    # Grade
    grade, label = next(
        (g, l) for threshold, g, l in [
            (90,"A+","Exceptional"),(80,"A","Confident"),(70,"B+","Strong"),
            (60,"B","Good"),(50,"C","Developing"),(40,"D","Needs work"),(0,"F","Keep practicing")
        ] if avg_total >= threshold
    )

    # Specific insights (not generic)
    insights = []
    if total_fillers > 0:
        top = max(filler_counts, key=filler_counts.get, default="um")
        insights.append(
            f"You used filler words {total_fillers} times. "
            f"Most common: '{top}' ({filler_counts.get(top,0)}x)."
        )
    if pace["too_fast_pct"] > 20:
        insights.append(
            f"You spoke too fast {pace['too_fast_pct']}% of the time "
            f"(avg {pace['avg_wpm']} WPM, ideal is 130-160)."
        )
    if signal_avgs["eye_contact"] < 55:
        insights.append("Eye contact was weak — you looked away from camera frequently.")
    if signal_avgs["voice_steadiness"] < 55:
        insights.append("Voice trembling detected — nervousness was audible.")
    if signal_avgs["vocal_variety"] < 50:
        insights.append("Delivery was monotone. Vary your pitch to stay engaging.")

    # Find worst confidence dip with timestamp
    for i in range(5, len(all_scores)):
        window_avg = sum(all_scores[j]["total"] for j in range(i-5,i)) / 5
        drop = window_avg - all_scores[i]["total"]
        if drop > 20:
            mins, secs = divmod(i*3, 60)
            insights.append(
                f"Biggest confidence drop at {mins}:{secs:02d} "
                f"— score fell {round(drop)} points."
            )
            break  # only report worst one

    # Action items
    weakest = min(signal_avgs, key=signal_avgs.get)
    action_map = {
        "filler_words":     "Replace fillers with a deliberate 1-second pause.",
        "eye_contact":      "Look at the camera lens, not your screen or notes.",
        "voice_steadiness": "Breathe deeply before speaking. Slow exhale before key sentences.",
        "speech_pace":      f"Slow down — avg was {pace['avg_wpm']} WPM, aim for 130-160.",
        "vocal_variety":    "Emphasise 2-3 key words per sentence. Avoid one flat pitch.",
        "expression":       "Relax your brow. Unclench your jaw. Neutral face reads as calm.",
    }
    sorted_signals = sorted(signal_avgs.items(), key=lambda x: x[1])
    action_items = [action_map.get(k, "") for k, _ in sorted_signals[:2] if k in action_map]

    # Score timeline (one point per 3s chunk)
    timeline = [
        {
            "t_s":             i * 3,
            "total":           s.get("total", 0),
            "eye_contact":     s.get("eye_contact", 0),
            "voice_steadiness":s.get("voice_steadiness", 0),
            "speech_pace":     s.get("speech_pace", 0),
            "filler_words":    s.get("filler_words", 0),
        }
        for i, s in enumerate(all_scores)
    ]

    # Full transcript
    transcript = [
        {
            "word":      w["word"],
            "start_ms":  w.get("start_ms", 0),
            "is_filler": w.get("is_filler", False),
        }
        for w in all_words
    ]

    return {
        "session_id":       session_id,
        "duration_s":       duration_s,
        "avg_score":        avg_total,
        "peak_score":       peak_total,
        "lowest_score":     lowest_total,
        "grade":            grade,
        "grade_label":      label,
        "signal_averages":  signal_avgs,
        "weakest_signal":   weakest,
        "filler_breakdown": filler_counts,
        "total_fillers":    total_fillers,
        "pace":             pace,
        "insights":         insights,
        "action_items":     action_items,
        "timeline":         timeline,
        "transcript":       transcript,
    }
```

---

## PHASE 4 — STANDALONE AUDIO ANALYZER (FULLY INDEPENDENT)

This is a completely separate module.
It works WITHOUT live session, WITHOUT camera, WITHOUT WebSocket.
Input: any audio file. Output: same report as Phase 3.
Route: /analyzer

### 4A — Backend: File Analysis Endpoint

```python
# In main.py
from fastapi import UploadFile, File, Form
import librosa, numpy as np, uuid, tempfile
from pathlib import Path

@app.post("/api/analyze-audio")
async def analyze_audio_file(
    audio_file: UploadFile = File(...),
    session_label: str = Form(default="uploaded"),
):
    """
    Accepts any audio file (WAV, MP3, M4A, WebM, OGG).
    Runs full speech intelligence pipeline.
    Returns identical report to a live session.
    No camera. No WebSocket. Fully standalone.
    """
    session_id = str(uuid.uuid4())[:8]
    suffix = Path(audio_file.filename).suffix or ".webm"
    tmp = Path(tempfile.gettempdir()) / f"analyze_{session_id}{suffix}"

    with open(tmp, "wb") as f:
        shutil.copyfileobj(audio_file.file, f)

    try:
        # Load + resample to 16kHz mono (librosa handles any format)
        audio, _ = librosa.load(str(tmp), sr=16000, mono=True)
    finally:
        tmp.unlink(missing_ok=True)

    # Split into 3s chunks (same as live pipeline)
    chunk_size = 16000 * 3
    chunks = []
    for i in range(0, len(audio), chunk_size):
        chunk = audio[i:i+chunk_size]
        if len(chunk) < chunk_size:
            chunk = np.pad(chunk, (0, chunk_size - len(chunk)))
        chunks.append(chunk)

    # Run same pipeline on each chunk
    pipeline = AudioPipeline(get_whisper(), get_vad())
    snapshots = []
    for chunk in chunks:
        result = pipeline.process_chunk(chunk)
        # Audio-only: no face data, set to neutral
        result["scores"]["eye_contact"] = 50
        result["scores"]["expression"]  = 50
        result["scores"]["total"] = SignalScorer.aggregate(result["scores"])
        snapshots.append(result)

    report = generate_post_session_report(snapshots, session_id)
    report["source"]   = "file_upload"
    report["filename"] = audio_file.filename
    report["note"]     = "Eye contact and expression scores not available for audio-only files."

    return report
```

### 4B — Standalone Frontend Page

Build `/analyzer` as a completely independent page.
Zero dependency on live session code or camera.

Layout:

```
+----------------------------------------------------------+
|  Speech Analyzer                                         |
|  Test your speech — no camera needed                     |
|                                                          |
|  [ Upload audio file ]     [ Record now ]                |
|  WAV / MP3 / M4A / WebM / OGG                           |
|                                                          |
|  -- or use a past session recording --                   |
|  [ recordings/abc123_audio.wav ]    [ Analyze ]          |
+----------------------------------------------------------+
|  (after upload / recording)                              |
|                                                          |
|  Analyzing...  [spinner]                                 |
|                                                          |
+----------------------------------------------------------+
|  (after analysis)                                        |
|                                                          |
|  Grade: B+   Score: 74   Duration: 2:34                  |
|                                                          |
|  [Score timeline graph]                                  |
|  [Signal breakdown bars]                                 |
|  [Filler word breakdown table]                           |
|  [Pace analysis: X% too fast, Y% ideal]                  |
|  [Insights]                                              |
|  [Action items]                                          |
|  [Transcript — fillers highlighted red]                  |
|                                                          |
|  [ Download Report JSON ]  [ Copy Transcript ]           |
+----------------------------------------------------------+
```

Requirements:
- Loads with ZERO camera permissions
- Record button uses getUserMedia({ audio: true }) only (no video)
- Shows upload progress bar during file upload
- Shows "Analyzing..." spinner while backend processes
- Report uses the SAME components as the post-session live report
- "Download Report JSON" exports the raw report object
- "Copy Transcript" copies plain text with (filler) markers

### 4C — In-Browser Audio Recorder (for /analyzer page)

```javascript
// analyzerRecorder.js — audio only, completely independent
export class AnalyzerRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
  }

  async start() {
    // Request audio only — no camera permission needed
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 64_000,
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(1000);
  }

  stop() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.stream.getTracks().forEach(t => t.stop()); // release mic
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }

  async analyze(blob, label = "recording") {
    const formData = new FormData();
    formData.append('audio_file', blob, `${label}.webm`);
    formData.append('session_label', label);

    const res = await fetch('/api/analyze-audio', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
    return res.json(); // returns full report — same format as live session
  }
}
```

---

## PHASE 5 — FILE STRUCTURE

```
project/
  backend/
    main.py                    update: add /api/analyze-audio, /api/session/upload-video
    audio_pipeline.py          NEW: AudioPipeline class (VAD + pitch + Whisper + scoring)
    session_recorder.py        NEW: SessionAudioRecorder class
    report_generator.py        NEW: generate_post_session_report()
    signal_scorer.py           NEW: SignalScorer class
    recordings/                NEW: all recorded files go here
      .gitkeep
    requirements.txt           update

  frontend/src/
    pages/
      LiveSession.jsx           update: add VideoRecorder, show report modal on session end
      Analyzer.jsx              NEW: standalone analyzer page (no camera dependency)
    
    components/
      SessionReport.jsx         NEW: shared report UI (used by both pages)
      ScoreTimeline.jsx         NEW: score graph with event markers
      TranscriptView.jsx        NEW: full transcript with filler highlights
      SignalBars.jsx            NEW: 6 animated signal bars
      ReportInsights.jsx        NEW: insights + action items cards
      VideoRecorder.js          NEW: SessionVideoRecorder class
      AnalyzerRecorder.js       NEW: audio-only recorder for /analyzer
    
    router.jsx                  add /analyzer route
```

---

## PHASE 6 — REQUIREMENTS

```
# requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-multipart==0.0.9
faster-whisper==1.0.3
silero-vad==5.1
torch==2.3.0
torchaudio==2.3.0
librosa==0.10.2
scipy==1.13.0
numpy==1.26.4
```

---

## PHASE 7 — TEST PLAN FOR STANDALONE ANALYZER

Run these 6 tests in order after implementation:

```
TEST 1 — Upload a clean WAV file
  Input:  recordings/any_session_audio.wav
  Expect: grade A or B, filler_words score > 70, transcript appears

TEST 2 — Upload a file heavy with "um/uh"
  Input:  record yourself saying "um" every 3 seconds for 60 seconds
  Expect: total_fillers > 15, filler_words score < 35

TEST 3 — Test acoustic filler detection (the hard one)
  Input:  record 30s of "ahhhhh" and "mmmmmm" sounds (no actual words)
  Expect: acoustic_fillers > 5 in raw, filler_words score < 40
  Note:   Whisper will transcribe nothing — detection must come from audio

TEST 4 — Record directly on /analyzer page
  Action: click Record Now, speak 30s, click Stop
  Expect: no camera permission popup, transcript + score appears
  Verify: stream.getVideoTracks().length === 0

TEST 5 — Fast speech
  Input:  record yourself speaking at 200+ WPM (auctioneer pace)
  Expect: speech_pace score < 40, avg_wpm > 190

TEST 6 — Re-analyze past live session
  Action: upload recordings/{session_id}_audio.wav from a past session
  Expect: report roughly matches the post-session report from that live session
  Tolerance: scores within 10 points (slight diff because live uses face signals)
```

---

## SUCCESS CRITERIA

- [ ] Every live session saves audio WAV to recordings/ automatically
- [ ] Every live session saves video WebM to recordings/ on Stop
- [ ] Post-session report appears on screen within 3s of clicking Stop
- [ ] Report shows: grade, timeline graph, signal bars, filler table, transcript
- [ ] /analyzer loads with ZERO camera permission request
- [ ] /analyzer accepts WAV, MP3, M4A, WebM, OGG file uploads
- [ ] /analyzer record button uses audio only (no video)
- [ ] Filler sounds detected from audio directly (not from transcript text)
- [ ] Transcript shows words with fillers highlighted in red
- [ ] Re-analyzing a past session recording gives a consistent report
- [ ] Report JSON downloadable from /analyzer
- [ ] All scoring uses calibrated functions — not arbitrary hardcoded penalties
