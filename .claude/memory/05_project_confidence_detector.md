---
name: Confidence Detector Project
description: Project 2 — Presentation Confidence Detector, platform TBD (web/mobile/desktop/system), detects confidence via face + speech + voice + AI
type: project
---

## Project 2: Presentation Confidence Detector

System that watches user present via camera + mic, detects confidence in real-time, gives coaching feedback.

### Location
- Learning materials: `usman/07_Confidence_Detector_Project/`
- Implementation: `usman/implementation/project-2-confidence-detector/`

### Status
- Phase 1 Foundations: 4 MD files written (camera access, speech-to-text, computer vision, NLP) — all platform-agnostic
- Platform: NOT DECIDED YET — options: web, React Native, Electron/Tauri, Python, Flutter
- Implementation: Plan written (platform-agnostic engines), no code yet

### Key Decisions Pending
- Platform choice (after Phase 1 review)
- STT engine (Web Speech API vs Whisper vs Vosk vs cloud)
- Styling approach per platform

### 4 Detection Engines (platform-independent)
1. Expression Detection — face landmarks → nervousness score (same math as ExamGuard)
2. Speech Analysis — transcript → fillers, hedging, pace, repetitions (pattern matching)
3. Voice Tone — audio → pitch, volume, shakiness (audio frequency analysis)
4. AI Deep Analysis — Claude API → multimodal confidence assessment (periodic)
