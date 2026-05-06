# Study Timeline — 2.5h/day, Alongside My Job

> Start date: **Mon, 20 Apr 2026**
> End date (target): **Sun, 17 Jan 2027** — ~9 months, 39 weeks
> Daily commitment: **2.5 hours average** (range 2h weekdays, 3h weekends)
> Weekly commitment: **15 hours**
> Path follows [`Learning_RoadMap_project2.md`](Learning_RoadMap_project2.md) — the 6-course minimum path.

---

## The Daily Template

Pick one that matches your job's rhythm. Don't design a new one — just pick.

### Option A — Morning learner (recommended if you're a morning person)
| Day | Time | What |
|---|---|---|
| Mon–Fri | 6:00 – 8:00 AM (2h) | Course video + notes |
| Sat | 9:00 AM – 12:00 PM (3h) | Weekly assignment / mini-project |
| Sun | 10:00 AM – 12:00 PM (2h) | Review the week + push code to GitHub |

### Option B — Evening learner
| Day | Time | What |
|---|---|---|
| Mon–Fri | 9:00 – 11:00 PM (2h) | Course video + notes |
| Sat | 3:00 – 6:00 PM (3h) | Weekly assignment / mini-project |
| Sun | 3:00 – 5:00 PM (2h) | Review the week + push code to GitHub |

### Option C — Split (if your job is heavy)
| Day | Time | What |
|---|---|---|
| Mon–Fri | 7:00 – 8:00 AM + 10:00 – 11:00 PM (2h total) | Morning: video. Night: code along. |
| Sat | 10:00 AM – 1:00 PM (3h) | Assignment / mini-project |
| Sun | Rest day — or 2h if you fell behind |

**Weekly total = 15h. One missed day per week is tolerated — that's what Sunday is for.**

---

## Weekly Allocation (how to split 15h within any given week)

| Activity | Hours | Notes |
|---|---|---|
| Course videos + reading | 5h | Take handwritten notes. Paper, not Notion. |
| Code-along / assignments | 5h | Type every line yourself. No copy-paste. |
| Mini-project (applied to Project-2) | 3h | Every week has a tiny build that connects back to Project-2. |
| Review + GitHub push | 2h | Push your week's code + a short README. Weekly. |

---

## Timeline at a Glance (39 weeks)

| Phase | Weeks | Dates | Course | Core Deliverable |
|---|---|---|---|---|
| **0** | 1 | Apr 20 – Apr 26 | Setup + NumPy refresher | Dev env ready, learning repo pushed |
| **1** | 2–9 | Apr 27 – Jun 21 | **fast.ai Practical DL** | Image classifier deployed to Hugging Face Spaces |
| **2** | 10–14 | Jun 22 – Jul 26 | **Karpathy Zero to Hero** | Mini-GPT trained from scratch |
| **3** | 15–18 | Jul 27 – Aug 23 | **HF Audio Course** | Fine-tuned Whisper model |
| **4** | 19–25 | Aug 24 – Oct 11 | **HF NLP Course** | Transcript confidence classifier |
| **5** | 26–30 | Oct 12 – Nov 15 | **Full Stack Deep Learning** | Project-2 re-architected properly |
| **6** | 31–39 | Nov 16 – Jan 17 (2027) | **MLOps Zoomcamp** | Project-2 deployed with monitoring |

---

## Phase 0 — Setup Week (Apr 20 – Apr 26)

**Goal:** zero friction when Phase 1 starts.

### Week 1 (Apr 20 – Apr 26)
- [ ] Mon: Install Python 3.11+, VS Code, Jupyter, Git. Confirm all work.
- [ ] Tue: Install PyTorch (CPU-only is fine if you have no GPU). Run `import torch; torch.randn(3,3)` — no errors.
- [ ] Wed: Create GitHub repo `usman-learning-journey`. Push a `README.md`.
- [ ] Thu: Open free **Hugging Face** account. Open free **Kaggle** account. Open free **Google Colab** (for GPU).
- [ ] Fri: NumPy refresher — [NumPy quickstart](https://numpy.org/doc/stable/user/quickstart.html). Do all the examples.
- [ ] Sat: Do one Kaggle tutorial: "Titanic: Machine Learning from Disaster." Just follow along.
- [ ] Sun: Write a 1-page plan in your repo: "Why I'm doing this, what I will have built in 9 months."

**End-of-Phase Checkpoint:** you can open a Colab notebook with a GPU, run PyTorch code, push to GitHub, all in under 5 minutes.

---

## Phase 1 — fast.ai Practical Deep Learning (Apr 27 – Jun 21)

**Course:** [course.fast.ai](https://course.fast.ai/) — Jeremy Howard's Practical Deep Learning for Coders.
**Length:** 7 lessons + 1 buffer week.
**Connects to Project-2:** teaches you how pretrained CNNs (like MediaPipe's face model) are built and fine-tuned.

### Week 2 — Lesson 1: Your first model (Apr 27 – May 3)
- **Mon–Fri (2h/day):** Watch Lesson 1. Code along. Train a cat-vs-dog classifier.
- **Sat (3h):** Re-do Lesson 1 with a different dataset — try classifying 5 types of public-speaking postures using images you scrape.
- **Sun (2h):** Push to GitHub. Write "What I learned this week" section.
- **Weekly build (Project-2 tie-in):** Train an image classifier that distinguishes "confident posture" vs "slumped posture" from 50 photos of yourself.

### Week 3 — Lesson 2: Deployment (May 4 – May 10)
- **Mon–Fri:** Watch Lesson 2. Code along.
- **Sat:** Deploy last week's classifier to Hugging Face Spaces. Get a public URL.
- **Sun:** Write a blog post (in the repo's README) explaining what you built.
- **Weekly build:** Your model is now live on the internet. Share the URL with yourself in a text message.

### Week 4 — Lesson 3: Neural net foundations (May 11 – May 17)
- Watch Lesson 3. Code gradient descent from scratch.
- **Weekly build:** Implement a 2-layer neural network in pure NumPy. No PyTorch.

### Week 5 — Lesson 4: NLP (May 18 – May 24)
- Watch Lesson 4. Fine-tune a text classifier.
- **Weekly build:** Classify 100 sentences as "confident speech" or "hedged speech" using fast.ai.

### Week 6 — Lesson 5: From-scratch model (May 25 – May 31)
- Watch Lesson 5. Build a tabular model from scratch.
- **Weekly build:** Take the filler-counts from your Project-2 reports and predict a confidence label.

### Week 7 — Lesson 6: Random forests (Jun 1 – Jun 7)
- Watch Lesson 6.
- **Weekly build:** Random forest predicting confidence from your Project-2 stats.

### Week 8 — Lesson 7: Collaborative filtering + NLP deep dive (Jun 8 – Jun 14)
- Watch Lesson 7.
- **Weekly build:** Put together a notebook that uses fast.ai end-to-end on a Project-2 feature.

### Week 9 — Buffer + consolidation (Jun 15 – Jun 21)
- Re-watch any lesson that didn't click.
- Finish any unfinished assignment.
- Write a **Phase 1 retrospective** in your repo: "3 things I understand now. 3 things still foggy."

**Phase 1 Checkpoint (by Jun 21):** you have trained, fine-tuned, and deployed 3+ models. You can explain what a learning rate, a loss function, and a fine-tune are — without notes.

---

## Phase 2 — Karpathy Zero to Hero (Jun 22 – Jul 26)

**Course:** [karpathy.ai/zero-to-hero](https://karpathy.ai/zero-to-hero.html)
**Length:** 10 videos + 1 buffer week.
**Connects to Project-2:** teaches you what's inside Whisper and every other transformer.

### Week 10 — Videos 1–2: Micrograd + Bigrams (Jun 22 – Jun 28)
- Code along with Video 1 (micrograd — build autograd from scratch).
- Code along with Video 2 (bigrams).
- **Build:** Your own micrograd repo on GitHub.

### Week 11 — Videos 3–4: MLP + Activations (Jun 29 – Jul 5)
- Videos 3 and 4. Code along.
- **Build:** A name generator MLP, working end-to-end.

### Week 12 — Videos 5–6: Backprop + Batchnorm (Jul 6 – Jul 12)
- Videos 5 and 6.
- **Build:** Add batch norm to your MLP. Compare training speed before/after.

### Week 13 — Videos 7–8: WaveNet + GPT (Jul 13 – Jul 19)
- Videos 7 and 8 — **this is where the mini-GPT starts**.
- **Build:** Your mini-GPT repo, trained on a public-speaking transcript dataset (scrape 100 TED talks).

### Week 14 — Video 9–10 + buffer (Jul 20 – Jul 26)
- Finish remaining videos.
- **Build:** Generate 20 "confident opening sentences" from your mini-GPT.
- Phase 2 retrospective.

**Phase 2 Checkpoint (by Jul 26):** you have coded backprop, an MLP, and a transformer *from scratch*. You can explain what an attention head does without looking at code.

---

## Phase 3 — Hugging Face Audio Course (Jul 27 – Aug 23)

**Course:** [huggingface.co/learn/audio-course](https://huggingface.co/learn/audio-course)
**Length:** 6 units + 1 buffer week.
**Connects to Project-2:** this is the speech-analysis half of Project-2, taught properly.

### Week 15 — Units 1–2: Audio fundamentals + classification (Jul 27 – Aug 2)
- Mel spectrograms, MFCCs, audio loading in Python.
- **Build:** A classifier that detects your voice vs silence in a WAV file.

### Week 16 — Units 3–4: Audio transformers + ASR (Aug 3 – Aug 9)
- Transformer architectures for audio.
- **Build:** Run Whisper on a 1-minute self-recording. Compare `tiny.en` vs `base.en` vs `small.en` accuracy.

### Week 17 — Unit 5: Fine-tuning Whisper (Aug 10 – Aug 16)
- Fine-tune Whisper on a custom dataset.
- **Build:** Fine-tune Whisper on 10 minutes of your own speech. Measure accuracy improvement.

### Week 18 — Unit 6 + buffer: Deployment + consolidation (Aug 17 – Aug 23)
- Deploy Whisper to a Space.
- **Build:** Upload your fine-tuned Whisper to Hugging Face. Public URL.
- Phase 3 retrospective.

**Phase 3 Checkpoint (by Aug 23):** you have a fine-tuned Whisper model live on the internet that transcribes your voice better than stock. You can explain what a mel spectrogram is and why audio models use one.

---

## Phase 4 — Hugging Face NLP Course (Aug 24 – Oct 11)

**Course:** [huggingface.co/learn/nlp-course](https://huggingface.co/learn/nlp-course)
**Length:** 12 chapters + 1 buffer week (7 weeks total).
**Connects to Project-2:** replace "count the ums" with a proper confidence-from-transcript classifier.

### Week 19 — Chapters 1–2 (Aug 24 – Aug 30)
- Transformers intro, tokenization.
- **Build:** Use a pre-trained sentiment model on 20 TED-talk openings.

### Week 20 — Chapter 3 (Aug 31 – Sep 6)
- Fine-tuning a pretrained model.
- **Build:** Fine-tune DistilBERT on "confident" vs "hedged" sentences.

### Week 21 — Chapter 4 (Sep 7 – Sep 13)
- Sharing models to Hub.
- **Build:** Upload your confidence classifier to Hugging Face.

### Week 22 — Chapters 5–6 (Sep 14 – Sep 20)
- Datasets library, tokenizers library.
- **Build:** Build your own labeled dataset of 200 sentences.

### Week 23 — Chapter 7 (Sep 21 – Sep 27)
- Main NLP tasks (NER, QA, summarization).
- **Build:** Add an NER that flags hedging phrases in Project-2 transcripts.

### Week 24 — Chapter 8–9 (Sep 28 – Oct 4)
- Troubleshooting, deploying demos (Gradio).
- **Build:** Live demo: user types a sentence, your model predicts a confidence score.

### Week 25 — Buffer + consolidation (Oct 5 – Oct 11)
- Phase 4 retrospective.
- **Milestone:** Swap Project-2's filler regex for your fine-tuned confidence classifier.

**Phase 4 Checkpoint (by Oct 11):** Project-2 no longer uses regex for confidence — it uses your own fine-tuned model. You can explain what fine-tuning actually changes in a model.

---

## Phase 5 — Full Stack Deep Learning (Oct 12 – Nov 15)

**Course:** [fullstackdeeplearning.com](https://fullstackdeeplearning.com/)
**Length:** 10 lectures + 1 buffer week (5 weeks total).
**Connects to Project-2:** re-architect Project-2 like a real product, not a prototype.

### Week 26 — Lectures 1–2 (Oct 12 – Oct 18)
- Course vision, project lifecycle.
- **Build:** Write a proper PRD for Project-2 v2.

### Week 27 — Lectures 3–4 (Oct 19 – Oct 25)
- Infrastructure, data management.
- **Build:** Set up proper data pipelines for Project-2's session data.

### Week 28 — Lectures 5–6 (Oct 26 – Nov 1)
- Model development, troubleshooting.
- **Build:** Proper experiment tracking for Project-2's model experiments (Weights & Biases).

### Week 29 — Lectures 7–8 (Nov 2 – Nov 8)
- Testing, deployment.
- **Build:** Add automated tests to Project-2's backend.

### Week 30 — Lectures 9–10 + buffer (Nov 9 – Nov 15)
- Monitoring, continual learning.
- Phase 5 retrospective.

**Phase 5 Checkpoint (by Nov 15):** Project-2 has tests, experiment tracking, a proper data layer, and a monitoring plan. You can explain why "it works on my machine" isn't enough for an ML product.

---

## Phase 6 — MLOps Zoomcamp (Nov 16 – Jan 17, 2027)

**Course:** [github.com/DataTalksClub/mlops-zoomcamp](https://github.com/DataTalksClub/mlops-zoomcamp)
**Length:** 9 modules + 1 buffer week (10 weeks total).
**Connects to Project-2:** ship Project-2 to the real internet with a full MLOps stack.

### Week 31 — Module 1: Intro (Nov 16 – Nov 22)
- MLOps maturity model.
- **Build:** Dockerize Project-2's backend.

### Week 32 — Module 2: Experiment tracking (Nov 23 – Nov 29)
- MLflow.
- **Build:** Track every Project-2 experiment in MLflow.

### Week 33 — Module 3: Orchestration (Nov 30 – Dec 6)
- Prefect / Airflow.
- **Build:** Orchestrated retraining pipeline for your confidence classifier.

### Week 34 — Module 4: Deployment (Dec 7 – Dec 13)
- Batch + online serving.
- **Build:** Project-2 deployed to a real cloud (Fly.io, Railway, or HF Spaces).

### Week 35 — Module 5: Monitoring (Dec 14 – Dec 20)
- Evidently, Grafana.
- **Build:** Dashboard showing Project-2's live inference stats.

### Week 36 — Module 6: Best practices (Dec 21 – Dec 27) — **light week, holidays**
- CI/CD, testing, pre-commit.
- **Build:** GitHub Actions pipeline for Project-2.

### Weeks 37–38 — Capstone project (Dec 28 – Jan 10)
- Build a capstone using everything you've learned.
- **Capstone = Project-2 v2, fully deployed, fully monitored, publicly shareable.**

### Week 39 — Final buffer + retrospective (Jan 11 – Jan 17)
- Polish the capstone.
- Write a final blog post: "What I built in 9 months."

**Final Checkpoint (Jan 17, 2027):** Project-2 v2 is live on the internet, used by at least 10 real people, has a monitoring dashboard, and runs on retraining pipelines. You can point to the repo and say "I built this."

---

## Rules for Staying on Track

1. **Never skip Sunday review.** 2 hours. Push code + write what you learned. If you skip this, you will not remember the week.
2. **Paper notes > digital notes.** Buy one notebook. Fill it. You retain ~3x more from handwriting.
3. **If you fall a week behind:** use the next buffer week to catch up. Don't compress.
4. **If you fall two weeks behind:** move the end date. Don't skip phases.
5. **Job crunch? Drop to 1h/day for that week.** Consistency > intensity.
6. **No Claude until you've spent 20 minutes being stuck.** Stack Overflow, YouTube, then docs, then Claude.
7. **Public accountability:** tweet or post one thing per week. "Week 7 done — here's what I built."
8. **No course-hopping.** Finish one before starting the next.

---

## How to Know You're Ahead / Behind

- **Ahead:** finishing a week's material on Friday instead of Sunday.
  → Use the spare time to go deeper on that week's topic. Don't start the next week early.
- **On track:** finishing weekly build by Sunday night.
- **Behind:** can't finish the assignment by Sunday.
  → Skip that week's mini-project (not the lesson). Never skip a lesson.

---

## Tooling Shortlist (set once, use for 9 months)

| Tool | Purpose | Setup week |
|---|---|---|
| VS Code + Jupyter | Code editor | Week 1 |
| Git + GitHub | Version control | Week 1 |
| Google Colab | Free GPU | Week 1 |
| Hugging Face account | Models + Spaces | Week 1 |
| Kaggle account | Datasets + competitions | Week 1 |
| MLflow | Experiment tracking | Week 32 |
| Weights & Biases (free tier) | Experiment tracking alt | Week 28 |
| Fly.io or Railway | Free-tier deployment | Week 34 |

---

## Your Next Three Actions (today)

1. Block 6:00–8:00 AM (or your chosen slot) in your calendar for the next 9 months — recurring event.
2. Buy the paper notebook.
3. Open https://course.fast.ai/ in a tab and bookmark it. Don't start yet. Your first session is **Monday, 27 April 2026, 6:00 AM**.
