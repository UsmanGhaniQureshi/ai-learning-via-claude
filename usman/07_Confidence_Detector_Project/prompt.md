# Learning Prompt — Use This With Any AI Tool

> **Copy-paste this prompt into ChatGPT, Claude (web), Gemini, or any AI assistant to learn about the technologies behind the Presentation Confidence Detector. Modify the [TOPIC] section based on what you want to learn.**

---

## The Prompt

```
You are my personal AI tutor. I am building a "Presentation Confidence Detector" — 
a browser-based app that watches a person present via webcam + microphone and gives 
them a real-time confidence score (0-100) with coaching feedback.

Here is how the system works:

ARCHITECTURE:
- Browser app (React + Vite frontend, Python FastAPI backend)
- Camera captures face → MediaPipe FaceMesh (468 landmarks + 52 blendshapes) → 
  detects expressions, eye contact, blink rate
- Microphone captures audio → Vosk speech-to-text → transcript text
- Transcript → NLP pattern matching → detects filler words (um, uh, like), 
  hedging phrases (I think, maybe, sort of), repetitions, speaking pace (WPM)
- Audio → FFT frequency analysis → detects pitch variation, volume, voice steadiness
- All signals combine → weighted confidence score:
  Face Score × 0.40 + Speech Score × 0.35 + Voice Score × 0.25 = 0-100

WHAT I ALREADY KNOW:
- I built an "ExamGuard" cheating detection system using MediaPipe in Python
- I know React + Vite (built frontends before)
- I know FastAPI (built REST APIs before)
- I know MediaPipe face landmarks, iris tracking, head direction, pose estimation
- I am a beginner in: speech-to-text, NLP, audio processing (FFT), browser-based ML

MY LEARNING STYLE:
- I learn best through building real projects, NOT abstract theory
- Explain WHY before WHAT — I need to understand the reason before the technique
- Use analogies from real life — "it works like a court stenographer"
- Show me real numbers — "blink rate > 25/min = nervous" not just "high blink rate = nervous"
- Don't over-explain things I already know (MediaPipe landmarks, React basics)
- Keep it fast-paced — I don't need baby steps

NOW TEACH ME ABOUT:

[TOPIC — Replace this with what you want to learn. Examples below:]

Option A: "How does the Web Audio API work? I need to extract pitch and volume 
from a microphone stream in real-time. Explain FFT in simple terms, show me how 
frequency maps to pitch, and explain what makes a 'shaky voice' different from a 
'steady voice' in the data."

Option B: "How does Vosk speech-to-text work internally? What model architecture 
does it use? How does it handle different accents? Why is it faster than Whisper 
but less accurate? How do I choose between Vosk models (small vs large)?"

Option C: "How do face blendshapes work in MediaPipe? I know about the 468 landmarks 
but I want to understand the 52 blendshapes. How are they computed from landmarks? 
Why are they more reliable than manual distance calculations for expression detection? 
Which specific blendshapes map to which emotions?"

Option D: "How do I build a real-time dashboard in React that updates smoothly at 
15+ FPS? I have 4 data sources (face engine, speech engine, voice engine, scoring) 
all updating at different rates. How do I avoid re-rendering the entire UI when one 
metric changes? Explain useRef vs useState for real-time data."

Option E: "Explain Exponential Moving Average (EMA) for score smoothing. I'm using 
it to prevent my confidence score from jumping around. What smoothing factor should 
I use? How does it compare to simple moving average? Show me with real numbers how 
different factors (0.1 vs 0.3 vs 0.5) change the responsiveness."

Option F: "I want to understand NLP pattern matching for filler word detection. 
My current system counts every 'like' as a filler, but 'I like pizza' is NOT a 
filler. How do I handle this? What are the approaches: simple word lists, n-gram 
context, POS tagging, or using an LLM? What's the tradeoff between accuracy and 
speed for real-time detection?"

Option G: "Explain how to detect nervousness from voice alone — without looking 
at the face or words. What audio features indicate nervousness? (pitch variation, 
jitter, shimmer, speech rate, pause patterns). How accurate is voice-only 
nervousness detection compared to face-based or text-based detection?"

Option H: "I want to understand confidence scoring algorithms in general. How 
do professional tools like Yoodli and Poised score presentations? What research 
exists on mapping presentation signals to perceived confidence? Are there published 
scoring rubrics I can reference?"

For whatever topic I chose:
1. Start with WHY this matters for my project
2. Explain the concept with a real-world analogy
3. Show me HOW it works with real numbers/examples  
4. Tell me what MISTAKES to watch for
5. If relevant, explain WHY we chose this approach over alternatives
6. End with: what should I learn next?
```

---

## Quick Topic Prompts (Copy-Paste Ready)

### For Learning Speech-to-Text:
```
Teach me how speech-to-text works for my Presentation Confidence Detector. 
I'm using Vosk (offline STT). Explain: How does audio become text? What is 
an acoustic model vs language model? Why does Vosk struggle with accents? 
How do interim vs final results work? What is the Word Error Rate and how 
good is Vosk compared to Whisper and Google STT?
```

### For Learning Audio/FFT:
```
Teach me the Web Audio API for my Presentation Confidence Detector. I need 
to extract pitch and volume from a live microphone stream in the browser. 
Explain: What is FFT in simple terms? How do I get pitch from frequency data? 
What frequencies correspond to human voice (80-400 Hz)? How do I detect a 
"shaky voice" vs "steady voice" from the FFT output? What is the AnalyserNode 
and how often should I sample it?
```

### For Learning NLP/Text Analysis:
```
Teach me NLP pattern matching for my Presentation Confidence Detector. I'm 
analyzing transcripts for filler words and hedging phrases. Explain: How does 
tokenization work? What's the difference between word-level and phrase-level 
matching? How do I handle "like" (filler) vs "like" (verb)? What is POS tagging 
and would it help? How do I calculate Words Per Minute accurately when speech 
has pauses? What's a good filler rate threshold and why?
```

### For Learning Face Blendshapes:
```
Teach me MediaPipe face blendshapes for my Confidence Detector. I already know 
the 468 landmarks from building ExamGuard (cheating detection). Now I need to 
understand the 52 blendshapes. Explain: How are blendshapes computed from 
landmarks? What is FACS (Facial Action Coding System)? Which blendshapes map 
to smile, frown, worry, surprise? Why did my manual distance calculations fail 
for smile detection but blendshapes work? What thresholds should I use for 
each expression?
```

### For Learning Real-Time UI:
```
Teach me how to build a real-time dashboard in React for my Presentation 
Confidence Detector. I have 4 engines (face, speech, voice, scoring) updating 
at different rates (face=30fps, speech=per-sentence, voice=continuous, 
scoring=every-2-seconds). Explain: How do I prevent the whole UI from 
re-rendering when one metric changes? When should I use useRef vs useState? 
How do Web Workers help? How do I animate a confidence meter smoothly? What 
is requestAnimationFrame and when should I use it vs setInterval?
```

### For Understanding Scoring:
```
Teach me about weighted scoring algorithms for my Presentation Confidence 
Detector. I combine: Face Score × 0.40 + Speech Score × 0.35 + Voice Score × 0.25. 
Explain: Why not equal weights? How do I calibrate weights with real data? 
What is Exponential Moving Average and why does it help with score smoothing? 
How do professional tools (Yoodli, Poised) approach scoring? What research 
exists on mapping body language + speech signals to perceived confidence?
```

### For Learning Deployment:
```
Teach me how to deploy my Presentation Confidence Detector as a web app. 
It has a React frontend + Python FastAPI backend. The frontend uses MediaPipe JS 
(in-browser ML), Web Speech API, and Web Audio API. The backend uses Vosk for 
STT and MediaPipe Python for face analysis. Explain: Should I run ML in browser 
or on server? How do I handle the camera stream efficiently? What hosting 
options exist for a Python backend? How do I handle HTTPS (required for camera 
access)? Can this be a PWA (Progressive Web App)?
```

---

## How to Use This

1. **Pick a topic** from the quick prompts above (or write your own using the main template)
2. **Paste into** ChatGPT, Claude (web), Gemini, or any AI
3. **Follow up** with specific questions — "Show me a worked example with real numbers" or "What mistakes do beginners make here?"
4. **Come back here** and build — use what you learned in the actual implementation

**Tip:** The main prompt template at the top gives the AI your FULL context (what you're building, what you know, how you learn). This means every answer will be tailored to YOUR project, not generic tutorials.
