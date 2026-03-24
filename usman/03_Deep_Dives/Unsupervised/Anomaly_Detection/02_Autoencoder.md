# Autoencoder (for Anomaly Detection)

## What It Does

An Autoencoder is a neural network that learns to **copy its input to its output** — but through a tight bottleneck. It learns what "normal" looks like by compressing and recreating normal data. When you give it something **abnormal,** it can't recreate it properly — the copy comes out wrong. That high "recreation error" tells you something is off.

---

## Real-World Example

### Problem: Factory Quality Control

A car parts factory produces **10,000 brake pads per day.** About 99.5% are perfect, but 0.5% (50 pads) have tiny defects — cracks, uneven surfaces, wrong thickness.

Hiring humans to inspect every single brake pad is:
- Expensive (need many inspectors)
- Slow (can't keep up with production speed)
- Unreliable (humans get tired and miss defects)

### Solution: Train an Autoencoder on GOOD Products

**Step 1: Training (only on NORMAL brake pads)**
- Feed the autoencoder 10,000 photos of PERFECT brake pads
- It learns to compress and recreate these images perfectly
- After training, it becomes an EXPERT at recreating normal brake pads

**Step 2: Testing New Products**

| New Brake Pad | Autoencoder's Copy | Error | Result |
|---------------|--------------------|-------|--------|
| Perfect pad | Perfect copy | Low (0.02) | PASS |
| Perfect pad | Perfect copy | Low (0.03) | PASS |
| Cracked pad | Blurry, wrong crack area | HIGH (0.85) | **DEFECTIVE!** |
| Perfect pad | Perfect copy | Low (0.01) | PASS |
| Thin pad | Wrong thickness in copy | HIGH (0.72) | **DEFECTIVE!** |

The autoencoder has never SEEN a cracked brake pad. It only knows "normal." So when it tries to recreate a cracked one, it fails — because it doesn't know how to copy cracks. That failure IS the detection!

---

## How It Works (The Photocopy Machine Analogy)

Imagine a very special **photocopy machine** that was ONLY trained to copy one thing: **cats.**

It has seen 10,000 cat photos and become perfect at copying cats.

### Give It a Cat Photo:
```
Original: 🐱        →  Photocopy Machine  →  Copy: 🐱
                         (trained on cats)
Result: PERFECT COPY! Error is very low.
"This is normal — I know how to copy cats!"
```

### Give It a Dog Photo:
```
Original: 🐕        →  Photocopy Machine  →  Copy: 🐱???
                         (trained on cats)           (blurry, weird, wrong)
Result: TERRIBLE COPY! Error is very high.
"I don't know what this is — it doesn't match anything I've learned!"
```

### The Trick:
- The machine was NEVER taught what a "bad copy" means
- It was NEVER shown dogs
- It just knows cats SO well that anything else comes out wrong
- **High error = "I've never seen anything like this" = ANOMALY**

### The Bottleneck (Why It Works):
Think of it like a **telephone game with only 5 words:**
- Original message: "The big brown cat sits on the warm soft mat" (10 words)
- You can only pass 5 words: "brown cat sits warm mat"
- Receiver recreates: "The brown cat sits on the warm mat" — pretty close!

But if the original was about something totally different:
- Original message: "The rocket launched into deep outer space today"
- You try to compress to 5 words: "rocket launched deep space today"
- Receiver (who only knows cat sentences) recreates: "The cat launched into deep mat space" — WRONG!

The bottleneck forces the autoencoder to learn only the ESSENTIAL patterns of normal data. Anything abnormal can't squeeze through properly.

---

## Autoencoder Structure (Simple Version)

```
INPUT          ENCODER         BOTTLENECK        DECODER          OUTPUT
(full data)    (compress)      (small summary)   (expand)         (recreation)

[100 numbers]  → [50] → [20] → [5 numbers] → [20] → [50] → [100 numbers]
                                     ↑
                              Only 5 numbers
                              to represent
                              the WHOLE input!

If input is normal:  Output ≈ Input    (low error → NORMAL)
If input is weird:   Output ≠ Input    (high error → ANOMALY!)
```

---

## When to Use Autoencoders

- **You only have "normal" data** — you know what good looks like, but don't have many examples of bad
- **You want to learn what "normal" is** — and flag ANYTHING that deviates
- **Image-based anomaly detection** — factory defects, medical scans, security footage
- **The anomalies are unknown** — you can't list all possible ways something could go wrong
- **Complex, high-dimensional data** — images, sensor data, network logs

## When NOT to Use Autoencoders

- **You have labeled data** — if you know which examples are normal and which are anomalous, use supervised learning (like Random Forest or CNN). It will be more accurate.
- **Simple data with few features** — Isolation Forest is simpler and works great for tabular data. Autoencoders are overkill for simple data.
- **You need fast training** — autoencoders are neural networks and take longer to train than simpler methods
- **You don't have enough normal data** — need thousands of normal examples to learn what "normal" really is

---

## ExamGuard AI Connection

### How Autoencoders Help ExamGuard

Train the autoencoder on **thousands of clips of NORMAL exam behavior:**

**Training Data (all normal):**
- Student writing on paper
- Student reading question paper
- Student looking up to think
- Student drinking water
- Student stretching briefly
- Student raising hand to ask doubt

After training, the autoencoder becomes an expert at recreating "normal exam behavior."

### Testing During Live Exam:

| Student Behavior | Autoencoder Can Recreate? | Error | Result |
|-----------------|--------------------------|-------|--------|
| Writing on paper | YES — perfect recreation | 0.05 | NORMAL |
| Looking up thinking | YES — perfect recreation | 0.08 | NORMAL |
| Repeatedly touching ear | NO — blurry, wrong recreation | 0.78 | **SUSPICIOUS** (earpiece?) |
| Hand under desk 3 min | NO — doesn't match any normal pattern | 0.82 | **SUSPICIOUS** (phone?) |
| Two students synced movements | NO — never seen coordinated behavior | 0.91 | **HIGH ALERT!** |

### Why Autoencoders Are Perfect for ExamGuard:

1. **New cheating methods:** Students invent creative ways to cheat. The autoencoder doesn't need to know WHAT cheating looks like — it just knows what NORMAL looks like. Anything else = suspicious.

2. **Easy to get training data:** You only need NORMAL exam footage. No need to stage fake cheating scenarios for training.

3. **Catches the unknown:** A supervised model can only catch cheating methods it was trained on. An autoencoder catches ANYTHING unusual — even methods nobody has thought of.

---

## Autoencoder vs Isolation Forest — Which to Use?

| Feature | Isolation Forest | Autoencoder |
|---------|-----------------|-------------|
| **Data type** | Numbers (tabular data) | Images, video, complex data |
| **Training time** | Very fast | Slow (neural network) |
| **Accuracy on images** | Lower | Higher |
| **Simplicity** | Simple, easy to use | Complex, needs tuning |
| **Needs GPU?** | No | Yes (for images) |
| **Best for ExamGuard** | Flagging unusual student stats | Analyzing camera footage |

**In ExamGuard, use BOTH:**
- Isolation Forest → for numeric data (time spent looking away, number of head turns)
- Autoencoder → for camera footage (does this VIDEO look normal?)

---

## Key Terms

| Term | Meaning | Example |
|------|---------|---------|
| **Autoencoder** | Neural network that learns to copy input through a bottleneck | Learns to recreate normal brake pad images |
| **Encoder** | First half — compresses input into a small summary | 100 features → 5 features |
| **Decoder** | Second half — recreates original from the small summary | 5 features → 100 features |
| **Bottleneck** | The narrow middle — forces the network to learn only essential patterns | Only 5 numbers to represent the whole input |
| **Reconstruction Error** | How different the output is from the input | Low error = normal, high error = anomaly |
| **Threshold** | The error level above which you flag something as anomalous | Error > 0.7 = flag as suspicious |
| **Latent Space** | The compressed representation in the bottleneck | The "essence" of what normal looks like |

---

## Quick Summary

```
Autoencoder in one line:
"Learn to copy normal things perfectly. When the copy is bad, the input is abnormal."

Input:  10,000 photos of GOOD brake pads (training) → 1 new photo (testing)
Output: "This new photo has error 0.85 → DEFECTIVE!"

You provide:  Lots of NORMAL examples
It learns:    What "normal" looks like
It detects:   Anything that ISN'T normal (high reconstruction error)

Think: Photocopy machine trained only on cats.
       Give it a dog → bad copy → "This isn't a cat!"
```
