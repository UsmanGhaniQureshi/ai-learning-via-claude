# Courses to Build Systems Like Project-2

> Goal: take these courses in order. By the end you can build Project-2 (and anything like it) without AI help.
>
> Every course listed is either **free** or **free-to-audit**. Paid ones are marked.
> Every course is **practical/project-based** — no theory-only courses made this list.

---

## What Project-2 Is Built From (map your courses to the parts)

| Part of Project-2 | What it uses | Which courses teach this |
|---|---|---|
| Face detection in browser | MediaPipe (pre-trview md file in vs codeview md file in vs codeained CNN) | Tier 1 + Tier 2 (CV) |
| Speech-to-text | Whisper (transformer) | Tier 1 + Tier 3 (Audio/Speech) |
| Voice analysis (pitch/volume) | DSP + librosa | Tier 3 (Audio) |
| Filler detection | NLP pattern matching + later transformers | Tier 4 (NLP) |
| Python backend | FastAPI + async + WebSocket | Tier 5 (Systems) |
| Deployment | Docker + cloud | Tier 6 (MLOps) |

---

## Tier 1 — Deep Learning Foundations (START HERE)

These are the non-negotiables. Everything else depends on these.

### 1. fast.ai — Practical Deep Learning for Coders
- **Instructor:** Jeremy Howard
- **Platform:** fast.ai (free)
- **Length:** ~7 weeks, ~7h/week
- **Why this first:** It is the most *build-first* deep learning course ever made. You train a state-of-the-art image classifier in lesson 1. No math prerequisites. Jeremy's philosophy: code first, theory later.
- **What you'll build:** Image classifiers, tabular models, collaborative filtering, NLP classifiers, segmentation models.
- **Link:** https://course.fast.ai/

### 2. Andrej Karpathy — Neural Networks: Zero to Hero
- **Instructor:** Andrej Karpathy (ex-Tesla AI, OpenAI)
- **Platform:** YouTube (free)
- **Length:** ~10 videos, 2h each (~20h total)
- **Why this:** After fast.ai you understand that DL works. This course shows you **why** by making you code a neural network, then a transformer, **from scratch in Python**. By the last video you build a mini-GPT.
- **What you'll build:** Backprop from scratch, an MLP, a transformer, a mini-GPT.
- **Link:** https://karpathy.ai/zero-to-hero.html

### 3. Andrew Ng — Deep Learning Specialization
- **Instructor:** Andrew Ng
- **Platform:** Coursera (free to audit)
- **Length:** 5 courses, ~3 months at 10h/week
- **Why this:** The canonical theory course. Take it *after* fast.ai so theory has something to attach to. Covers CNNs, sequence models, transformers.
- **What you'll build:** Deep nets from scratch in NumPy, CNNs for image classification, RNNs/LSTMs, a transformer.
- **Link:** https://www.coursera.org/specializations/deep-learning

---

## Tier 2 — Computer Vision (for face/pose detection like MediaPipe)

### 4. Stanford CS231n — Convolutional Neural Networks for Visual Recognition
- **Instructors:** Fei-Fei Li / Andrej Karpathy / Justin Johnson (depends on year)
- **Platform:** Free lectures on YouTube, assignments on cs231n.stanford.edu
- **Length:** ~16 lectures, plus 3 coding assignments
- **Why this:** The foundational CV course. After this, MediaPipe and YOLO stop being black boxes.
- **What you'll build:** Image classifiers from scratch in NumPy, CNNs, object detection, style transfer.
- **Link:** http://cs231n.stanford.edu/ — lectures: search YouTube for `"Stanford CS231n"`

### 5. PyImageSearch — OpenCV + Deep Learning tutorials (free blog, paid course)
- **Instructor:** Adrian Rosebrock
- **Platform:** pyimagesearch.com — free tutorials are excellent; PyImageSearch University is paid.
- **Why this:** Practical CV recipes. Face detection, landmark extraction, pose estimation — the exact stack Project-2's face side uses.
- **What you'll build:** Face detection with OpenCV, eye blink detection, head pose estimation.
- **Link:** https://pyimagesearch.com/

---

## Tier 3 — Audio + Speech ML (for Whisper, VAD, pitch analysis)

### 6. Hugging Face Audio Course
- **Platform:** Hugging Face (free)
- **Length:** ~6 units, ~20h total
- **Why this:** *The* modern practical audio ML course. Covers audio basics, transformers for audio, **Whisper specifically**, and voice-activity detection. Exactly what Project-2's backend uses.
- **What you'll build:** Speech recognition systems, audio classifiers, fine-tune Whisper.
- **Link:** https://huggingface.co/learn/audio-course

### 7. Valerio Velardo — Audio Signal Processing for ML
- **Platform:** YouTube (free) — channel: "The Sound of AI"
- **Length:** ~30 videos, ~20h
- **Why this:** The only channel that teaches the DSP side properly: FFT, mel spectrograms, MFCCs, pitch detection. These are the foundations under librosa and PYIN (the pitch analysis Project-2 uses).
- **What you'll build:** Audio feature extractors, genre classifiers, sound event detectors.
- **Link:** https://www.youtube.com/@ValerioVelardoTheSoundofAI

---

## Tier 4 — NLP (for transcript analysis + filler detection done properly)

### 8. Hugging Face NLP Course
- **Platform:** Hugging Face (free)
- **Length:** ~12 chapters, ~40h total
- **Why this:** The best practical modern NLP course. Transformers, fine-tuning, deploying NLP models — everything you'd need to upgrade Project-2's "count the ums" pattern matcher into a real confidence-from-language model.
- **What you'll build:** Text classifiers, named entity recognition, summarization, deploy models to a Space.
- **Link:** https://huggingface.co/learn/nlp-course

### 9. Stanford CS224n — NLP with Deep Learning (optional, theory-heavier)
- **Instructor:** Christopher Manning
- **Platform:** Free YouTube
- **Why this:** Skip unless you want the deep theory. For Project-2 purposes, the Hugging Face course above is sufficient.
- **Link:** https://web.stanford.edu/class/cs224n/

---

## Tier 5 — Building the System (backend + real-time + full-stack AI)

### 10. Full Stack Deep Learning
- **Instructors:** Sergey Karayev, Josh Tobin, Charles Frye
- **Platform:** Free (fullstackdeeplearning.com)
- **Length:** ~10 lectures, plus labs
- **Why this:** The only course that teaches how to go from "I trained a model in Colab" to "I deployed a real AI product with a frontend, backend, monitoring, and feedback loops." Exactly the gap between being able to train a model and being able to ship Project-2.
- **What you'll build:** A full stack ML app: data pipeline → training → serving → monitoring.
- **Link:** https://fullstackdeeplearning.com/

### 11. Made With ML
- **Instructor:** Goku Mohandas
- **Platform:** Free (madewithml.com)
- **Length:** ~2-3 weeks
- **Why this:** Teaches the full MLOps loop: design, develop, deploy, iterate. Extremely practical, well-structured.
- **Link:** https://madewithml.com/

### 12. TestDriven.io — FastAPI courses (paid, but worth it for Project-2's backend)
- **Platform:** testdriven.io
- **Why this:** Project-2's backend is FastAPI + WebSockets + async. TestDriven has the best focused FastAPI + WebSocket tutorials on the internet.
- **Free alternative:** the official FastAPI docs at https://fastapi.tiangolo.com/tutorial/ — read WebSockets + Background Tasks + Dependencies sections. Honestly, for FastAPI the official docs are so good they rival a paid course.

---

## Tier 6 — Deployment + MLOps (for when Project-2 goes live)

### 13. MLOps Zoomcamp
- **Platform:** DataTalksClub (free, runs yearly, material always available on GitHub)
- **Length:** ~9 weeks
- **Why this:** Teaches experiment tracking, model registry, orchestration, deployment, monitoring. Free and rigorous.
- **Link:** https://github.com/DataTalksClub/mlops-zoomcamp

### 14. MIT 6.S191 — Introduction to Deep Learning
- **Platform:** MIT (free YouTube + course site)
- **Length:** ~10 lectures
- **Why this:** A short, modern, fast-moving DL overview. Good as a refresher or as a *first* course if you want something lighter than Andrew Ng before jumping into fast.ai.
- **Link:** http://introtodeeplearning.com/

---

## The Order — If You Only Take 6 Courses

This is the minimum path to building Project-2-class systems without help:

1. **fast.ai Practical Deep Learning** — build first, understand later.
2. **Karpathy Zero to Hero** — now understand what's happening inside.
3. **Hugging Face Audio Course** — the speech/Whisper stack in Project-2.
4. **Hugging Face NLP Course** — the transcript side of Project-2.
5. **Full Stack Deep Learning** — how to actually ship AI products.
6. **MLOps Zoomcamp** — how to keep them running.

Total: ~6 months at 10h/week. This is the shortest real path.

---

## Channels to Watch on the Side (Free, YouTube)

| Channel | What they teach | Watch when |
|---|---|---|
| **3Blue1Brown — Neural Networks playlist** | Visual intuition for backprop, CNNs, transformers | Before fast.ai |
| **StatQuest (Josh Starmer)** | Every ML/stats concept explained simply | Whenever an algorithm doesn't click |
| **Andrej Karpathy** | Beyond Zero-to-Hero — LLM interviews, deep dives | Ongoing |
| **Yannic Kilcher** | New paper explainers, solid depth | When you want to read papers |
| **Two Minute Papers** | New AI research, super short | Weekly dopamine |
| **Valerio Velardo (Sound of AI)** | Audio + ML specifically | During Tier 3 |

---

## Rules

1. **Don't buy a course before finishing the previous one.**
2. **Build the assignments for real, in your own GitHub repo.** Not in Colab-that-dies.
3. **When stuck, watch StatQuest / 3Blue1Brown first, Claude last.**
4. **Pick a final project at the start of each tier and keep upgrading Project-2 with it.** After Tier 3, your Project-2 speech analysis should be fine-tuned Whisper, not stock. After Tier 4, your filler detection should be a classifier, not a regex.
5. **Finish before moving on.** A half-done fast.ai course is worth less than a finished MIT 6.S191.
