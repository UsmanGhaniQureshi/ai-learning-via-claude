AGENT TASK — Confidence Detector: Full Audit, Fix & Deploy
You are an expert full-stack AI engineer. Your job is to:

Read and fully understand the existing codebase in this folder
Audit it deeply for bugs, accuracy issues, and missing features
Implement all fixes and improvements in-place
Prepare it for live deployment with a complete deployment config

Do NOT ask for clarification. Read the code, reason about it, and act.

PHASE 1 — CODEBASE DISCOVERY
Start by mapping the entire project:
- List all files and folders recursively
- Read every source file (entry point, scoring logic, routes, models, config, frontend)
- Read package.json / requirements.txt / pyproject.toml to understand dependencies
- Read any .env.example or config files
- Check if there is a frontend folder and read it too
After reading, write a AUDIT_REPORT.md file in this directory with:
Sections to include in AUDIT_REPORT.md:
1. Architecture Summary

What stack is being used (language, framework, libraries)?
How is the app structured (monolith, frontend + backend, WebSocket, REST)?
How is the confidence score calculated? Describe the exact formula/pipeline.

2. Signal Sources Detected
List every signal currently being used to compute the confidence score:

 Facial expression analysis (which model/library?)
 Eye gaze / eye contact detection
 Voice analysis (volume, pitch, trembling)
 Speech transcription (filler word detection)
 Posture / body language
 Other signals?

For each signal: Is it actually working? Is the value being used in scoring? Is it accurate?
3. Bugs Found
List every bug, broken feature, or non-functional code with:

File name + line number
What the bug is
Why it causes inaccuracy or failure
Severity: CRITICAL / HIGH / MEDIUM / LOW

4. Accuracy Issues

Is the scoring formula evidence-based or arbitrary?
Are signals weighted correctly?
Are there race conditions, missing null checks, or stale data issues?
Is the score updating at the right frequency?

5. Performance Issues

Any blocking calls on the main thread?
Any model loading that should be cached?
Any memory leaks or unnecessary re-renders?

6. Missing Features (High Priority)
List features that would meaningfully improve accuracy and user experience.
7. Deployment Blockers
List everything that must be fixed before the app can go live.

PHASE 2 — IMPROVEMENTS TO IMPLEMENT
After writing the audit, implement ALL of the following. Do not skip any.
2A — Scoring Engine Overhaul
Replace or upgrade the confidence scoring logic with this evidence-based weighted formula:
Confidence Score (0–100) =
  (Eye Contact Score     × 0.25) +
  (Voice Steadiness Score × 0.25) +
  (Speech Pace Score     × 0.20) +
  (Filler Word Score     × 0.15) +
  (Facial Tension Score  × 0.10) +
  (Posture Score         × 0.05)
Rules:

Each sub-score must be in range 0–100 before weighting
Apply a rolling average over the last 5 seconds to smooth jitter
Score must update every 500ms minimum
Never return null/undefined — default to 50 if a signal is unavailable
Each sub-score must be exposed separately in the API response (not just the total)

2B — Face & Expression Analysis
If using MediaPipe or similar:

Ensure eye contact / gaze direction is detected, not just face presence
Detect brow furrow (anxiety signal) using landmark distances
Detect smile vs neutral vs tense expression
Detect if face is turned away (low eye contact = lower score)

If no face model exists yet:

Integrate MediaPipe FaceLandmarker (free, runs in browser or via Python)
Use landmarks: eye openness, gaze direction, mouth corners, brow position

2C — Voice Analysis
Must detect and score ALL of the following:

Speech pace (words per minute) — target range: 120–160 WPM = high score
Filler words — "um", "uh", "like", "you know", "basically", "literally", "so" — each one reduces score
Voice volume consistency — large drops or spikes = nervous signal
Pitch variance — monotone = low score, natural variance = high score
Silence gaps — pauses > 2s reduce score

If no speech model exists yet:

Integrate Whisper (whisper-tiny or whisper-base) via openai-whisper Python package or whisper.cpp
Process audio in 3-second chunks for near real-time transcription
Run filler word detection on each chunk

2D — Real-Time WebSocket
Ensure the score is delivered via WebSocket (not polling):

Score payload must include: { total, eyeContact, voice, speech, fillerWords, expression, posture, timestamp }
Frontend must receive updates every 500ms
WebSocket must reconnect automatically on disconnect

2E — Frontend Score Display
Ensure the UI shows:

A large animated score gauge (0–100) that changes smoothly
Individual signal bars — one for each signal source
A live feedback tip — e.g. "Slow down your speech", "Maintain eye contact", "Avoid filler words"
A session history graph — score over time during the session
Color coding: 0–40 red, 41–70 amber, 71–100 green

2F — Code Quality Fixes

Fix all CRITICAL and HIGH bugs found in Phase 1
Add null/undefined guards on all signal inputs
Add try/catch around all model inference calls
Add loading states in the UI
Add a camera/microphone permission error screen


PHASE 3 — DEPLOYMENT PREPARATION
3A — Environment Configuration
Create or update .env.example with all required variables:
PORT=8000
WHISPER_MODEL=base
MEDIAPIPE_MODEL_PATH=./models/
CORS_ORIGINS=http://localhost:3000
3B — Docker Setup
Create a Dockerfile for the backend:
dockerfile# Use appropriate base image for the stack (Python or Node)
# Install all dependencies
# Copy source
# Expose port
# Start command
Create docker-compose.yml:
yaml# backend service
# frontend service (if separate)
# shared network
# volume for model caching
3C — Deployment Config Files
Create config files for at least TWO of these platforms (choose based on the stack):
Option A — Render.com (render.yaml):
yamlservices:
  - type: web
    name: confidence-detector-backend
    env: python  # or node
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: WHISPER_MODEL
        value: base
Option B — Railway (railway.json):
json{
  "build": { "builder": "NIXPACKS" },
  "deploy": { "startCommand": "...", "healthcheckPath": "/health" }
}
Option C — Fly.io (fly.toml):
tomlapp = "confidence-detector"
[http_service]
  internal_port = 8000
  force_https = true
3D — Health Check Endpoint
Add a /health endpoint that returns:
json{ "status": "ok", "models_loaded": true, "version": "1.0.0" }
3E — Model Download Script
Create scripts/download_models.sh (or .py) that:

Downloads Whisper model weights on first run
Downloads MediaPipe model files if needed
Caches them in a /models directory

3F — README Update
Update or create README.md with:

What the app does
How to run locally (step by step)
How to deploy on Render / Railway / Fly.io
Environment variables explained
Architecture diagram in plain text (ASCII is fine)


PHASE 4 — FINAL VERIFICATION
After all changes:

Run the app and verify it starts without errors
Test the WebSocket — does the score update in real time?
Test each signal — does each one actually affect the score?
Check the formula — does a confident person score higher than a nervous one?
Check deployment config — does docker-compose up work end to end?

Write a CHANGES_MADE.md file summarising:

Every file modified and why
Every bug fixed
Every new feature added
How to deploy (3 commands or less)


CONSTRAINTS

Use only free and open-source models (MediaPipe, Whisper, wav2vec2, etc.)
Do not call any paid APIs
Keep inference fast — target < 200ms per scoring cycle
Do not break existing working functionality — improve on top of it
Prefer in-browser processing for face/pose (MediaPipe JS) to reduce server load


SUCCESS CRITERIA
The app is considered complete when:

 Real-time score updates every 500ms via WebSocket
 Score is visibly different between a confident and nervous person
 Each signal source has its own visible sub-score
 Live feedback tips are shown to the user
 App deploys successfully via Docker or platform config
 README explains deployment in under 5 minutes