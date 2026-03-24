# 10. Math Foundations for ML

> **Part of: How It Works Inside (Topics 9, 10, 11)**

---

### Why ML Needs Math
Without math, the model would be guessing randomly forever. Math is the engine that makes learning possible:
- Need to **represent data** → Vectors
- Need to **compare data** → Dot Product
- Need to **find mistakes** → Derivatives
- Need to **fix mistakes** → Gradient Descent

ML didn't invent new math. It picked the best existing math tools for its problems.

### 1. Vectors — "Convert everything to numbers"
A vector is a list of numbers that describes something. Computers can't read photos or emails — everything must become numbers first.

```
Student = [20, 170, 85, 90]     → age, height, marks, attendance
Photo   = [255, 128, 0, 64...]  → each pixel's color number
House   = [3, 1200, 2, 10]      → bedrooms, sqft, bathrooms, age
```

**When used:** ALWAYS. Step zero of every ML project. No vector = no ML.

### 2. Dot Product — "How similar are two things?"
Multiply matching numbers from two vectors and add them up. Higher result = more similar.

```
Student A = [90, 85, 70]
Student B = [88, 82, 72]
Dot Product = (90×88) + (85×82) + (70×72) = 19,930 (HIGH = similar!)
```

**Important note:** For a fair comparison, vectors should be normalized (scaled to same length) first. Raw dot product can be misleading if one vector has much bigger numbers. In practice, ML libraries handle this automatically.

**Normalization explained:** Normalization = scaling all values to the same range (0 to 1). Why? House size = 1200, age = 5. Without normalization, size dominates just because its numbers are bigger. After normalization: size = 0.6, age = 0.5 — fair comparison. The model can now judge features by their actual importance, not their scale.

**When used:** Recommendations (Netflix/Spotify), KNN, search engines, clustering — whenever comparing two data points.

### 3. Derivatives — "If I change THIS, how much does THAT change?"
**Samosa Shop Analogy:** Price Rs 10 → sell 100. Price Rs 15 → sell 80. Derivative = "4 fewer samosas per Rs 1 increase." That rate of change IS the derivative.

**In ML:** "If I change Weight #347 slightly, does the error go UP or DOWN? By how much?" Derivatives tell the model exactly which weights to change and in which direction.

**Worked Example with Numbers:**
Model predicted house = Rs 20 lakhs. Actual = Rs 50 lakhs. Error = 30.
Derivative says: "If you increase size weight by 0.01, error drops by 15."
"If you increase age weight by 0.01, error drops by 3."
So size weight is the bigger problem — fix it more!

**When used:** Every wrong guess during training — thousands of times.

### 4. Gradient Descent — "Walk downhill to minimum error"
**Blindfolded on a hill:** Feel the ground → which direction is downhill? → take a step → feel again → step again → repeat until you reach the valley (minimum error).

```
Error = 500 → adjust weights → 300 → adjust → 100 → adjust → 2 → TRAINED!
```

**Learning Rate** = step size. Too big → overshoot the valley, zigzag forever. Too small → takes forever. Just right → reaches bottom efficiently.

**Worked Example — One Weight Update:**
```
Weight = 0.5, Learning Rate = 0.1, Gradient = 2.0
New Weight = 0.5 - (0.1 × 2.0) = 0.5 - 0.2 = 0.3
```
That's one step. Repeat 1000 times.

**When used:** THE training method. Every model uses this to learn.

### Local Minima — Getting Stuck in the Wrong Valley
What if there are multiple valleys? You might get stuck in a shallow valley instead of finding the deepest one. Analogy: blindfolded, you reached A valley but not THE deepest. This is called a **local minimum** (vs the **global minimum** which is the true best answer). Solutions: random restarts (try from different starting points), momentum (keep rolling past small bumps).

### SGD — Faster Gradient Descent in Practice
In practice, gradient descent doesn't process ALL data at once (too slow). Instead:
- **SGD (Stochastic Gradient Descent)** = updates weights after each single example. Fast but noisy.
- **Mini-batch Gradient Descent** = updates after small groups (32 or 64 examples). Best of both worlds.
Much faster than full-batch, works just as well.

### How All 4 Connect
```
1. Data enters as VECTORS (numbers)
2. Model multiplies features × weights → makes prediction
3. Prediction WRONG → calculate error
4. DERIVATIVES find which weights caused the error
5. GRADIENT DESCENT adjusts weights (walk toward less error)
6. LEARNING RATE controls step size
7. Repeat thousands of times → model trained!
```

**4-word version:** SPEAK (vectors) → COMPARE (dot product) → FIND (derivatives) → FIX (gradient descent)

### Key Terms
| Term | Definition |
|:-----|:-----------|
| **Vector** | A list of numbers describing something — ML's language for data |
| **Dot Product** | Multiply matching numbers & add — similarity score between two vectors |
| **Derivative** | How much output changes when input changes slightly — tells model what to fix |
| **Gradient** | Direction of steepest change — "which way is downhill?" (just a fancy word for "slope" or "steepness") |
| **Matrix** | A table of numbers (rows × columns). When you have MANY vectors together, they form a matrix. Neural networks do matrix multiplication — multiply entire tables of weights × inputs at once. Python/NumPy handles this automatically |
| **Gradient Descent** | Walk step by step toward minimum error — adjusting weights each step |
| **Learning Rate** | Step size in gradient descent — too big = overshoot, too small = slow |

### How Training & Testing Works

**Train-Test Split:** Don't use ALL data for training. Split first:
- 80% → Training (model learns from these)
- 20% → Testing (model has NEVER seen these, already has correct answers)

Computer automatically compares predictions vs actual answers on test data → gives accuracy score. No human checks each entry.

**Testing by ML type:**
| Type | How to test |
|:-----|:-----------|
| **Supervised** | Computer compares predictions vs labels on test data (automatic) |
| **Unsupervised** | Human checks if groups make sense + math similarity score |
| **Reinforcement** | Measure performance — win rate, score, crashes |

### Overfitting — The Biggest Danger
Model **memorizes** training data instead of learning patterns. Like a student who memorizes practice questions word-by-word but fails the real exam with slightly different questions.

- 99% on training data + 30% on test data = **Overfitting!**
- Good model learns the **pattern**, not the exact data
- Bad data = low accuracy on BOTH training and test
- Overfitting = high training accuracy but low test accuracy

### Underfitting — The Opposite Problem
**Underfitting** = model is too SIMPLE to capture patterns. Like a student who studied for 5 minutes — doesn't know enough.
- Low accuracy on training data AND test data = **Underfitting!**
- Overfitting = memorized. Underfitting = didn't learn enough. Good model = balanced.
- Causes: too few layers, not enough training time, too few features

### Why Getting the Model Right Matters
| Bad data | → garbage in = garbage out (wrong predictions everywhere) |
|:---------|:----------------------------------------------------------|
| **Not enough data** | → weak patterns, fails on new data |
| **Overfitting** | → memorized, can't handle anything new |

ML engineers spend: 60% on data quality, 30% on training/testing, 10% on model structure.

### Mini Summary
- Vectors = convert data to numbers (ALWAYS first step)
- Dot Product = compare similarity (high = similar, low = different)
- Derivatives = find which weights are wrong
- Gradient Descent = fix weights step by step (walk downhill to less error)
- Learning Rate = step size (too big = overshoot, too small = slow)
- Train/Test Split = 80/20 — test data checks accuracy automatically
- Overfitting = memorized training data, fails on new data (biggest danger)

---

> 📝 *Quiz Q&A & my questions for this topic → see [../AI_ML_Quiz_QnA.md](../AI_ML_Quiz_QnA.md)*
> 📺 *Video resources → see [resources.md](resources.md)*
