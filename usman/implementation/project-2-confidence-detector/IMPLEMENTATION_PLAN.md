# Presentation Confidence Detector — Implementation Plan

> This document is the BUILD plan. Learning materials are in `usman/07_Confidence_Detector_Project/`.

---

## Platform Decision: TBD

Platform will be chosen after Phase 1 foundations. Options:

| Platform | Pros | Cons |
|:---|:---|:---|
| **Web App** (React + Vite) | You know React, no install needed, instant deploy | Browser limitations (60s speech timeout), Chrome-only for some APIs |
| **Mobile App** (React Native) | You know React, native camera/mic, app store ready | Build complexity, device testing, app store approval |
| **Desktop App** (Electron/Tauri) | Full hardware access, no browser limits, cross-platform | Larger bundle, heavier setup |
| **System App** (Python + Web UI) | You know Python + MediaPipe from ExamGuard, most flexible | Server needed, not easily shareable |
| **Cross-Platform** (Flutter) | One codebase for all platforms | New language (Dart), learning curve |

**Decision will be made together based on what makes sense for the features we need.**

---

## Core Engines (Platform-Independent)

These are the same regardless of platform choice. Only the camera/mic access code changes.

### Engine 1: Expression Detection
```
Input:  468 face landmarks (MediaPipe — runs on every platform)
Output: {
  expression: "tense" | "neutral" | "happy" | "anxious",
  eyeContact: 0-100,
  blinkRate: number (blinks/min),
  nervousnessScore: 0-100
}

Logic: Same distance calculations as ExamGuard
  - Blink rate = eye cycle counting (like mouth cycle counting)
  - Eye contact = iris + head direction (same as gaze detection)
  - Expression = mouth corners + eyebrow + jaw distances
```

### Engine 2: Speech Analysis
```
Input:  Transcript text (from any STT engine)
Output: {
  fillerCount: number,
  fillerRate: number (fillers/min),
  hedgingScore: 0-100,
  repetitions: number,
  pace: number (WPM),
  paceAssessment: "too slow" | "good" | "too fast",
  speechScore: 0-100
}

Logic: Pattern matching against word/phrase lists
  - Filler word list → count matches
  - Hedging phrase list → count matches
  - Consecutive token comparison → repetitions
  - Word count / elapsed time → WPM
```

### Engine 3: Voice Tone
```
Input:  Audio stream (from mic)
Output: {
  volume: dB level,
  pitchVariation: number (monotone detection),
  silenceRatio: % time silent,
  voiceScore: 0-100
}

Logic: Audio frequency analysis
  - Volume from audio amplitude
  - Pitch variation from frequency changes
  - Silence = volume below threshold for > 1 second
```

### Engine 4: AI Deep Analysis (Claude API)
```
Input:  Webcam frame (image) + recent transcript (text)
Output: {
  overallAssessment: string,
  bodyLanguageNotes: string,
  speechNotes: string,
  suggestions: string[],
  confidenceEstimate: 0-100
}

Logic: Send to Claude API every 15-30 seconds
  - Capture frame as base64
  - Bundle with last 30 seconds of transcript
  - Structured JSON response
  - Handle errors, rate limits, slow responses
```

---

## Confidence Scoring Algorithm

```
Expression score   × 0.30  (30% weight)
Speech score       × 0.30  (30% weight)
Eye contact score  × 0.25  (25% weight)
Voice score        × 0.15  (15% weight)

Output: 0-100 unified confidence score
  0-30:   Low confidence
  30-50:  Developing
  50-70:  Moderate
  70-85:  Confident
  85-100: Highly confident
```

---

## Build Sequence

| Sprint | What | Depends On |
|:---|:---|:---|
| 1 | **Choose platform** + project setup | Phase 1 foundations complete |
| 2 | Camera + mic access working | Sprint 1 |
| 3 | Face mesh integration + expression engine | Sprint 2 |
| 4 | Speech-to-text + NLP speech engine | Sprint 2 |
| 5 | Voice tone engine (audio analysis) | Sprint 2 |
| 6 | Confidence scoring algorithm + real-time dashboard | Sprints 3-5 |
| 7 | Claude API integration (periodic deep analysis) | Sprint 6 |
| 8 | Session report page + AI coaching | Sprint 7 |
| 9 | Polish: history, calibration, export | Sprint 8 |

---

## Dependencies (will be finalized after platform choice)

**Always needed (any platform):**
- MediaPipe (face mesh)
- Claude API / Anthropic SDK
- Filler word lists + hedging phrase lists

**Platform-specific:**
- Web: React, Vite, Web Speech API, Web Audio API
- React Native: expo-camera, expo-av, react-native-voice
- Python: OpenCV, pyaudio, FastAPI (if web UI)
- Electron: Same as web + electron framework
- Flutter: camera plugin, speech_to_text, google_mlkit
