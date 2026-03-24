# 8. Reinforcement Learning — Learning by Trial & Error

> **Part of: Types of Machine Learning — 3 Approaches (Topics 6, 7, 8)**

---

## What is Reinforcement Learning?

An **Agent** learns by trying actions in an **Environment** and getting **Rewards** (good!) or **Penalties** (bad!). We define WHAT success looks like. The model discovers HOW to achieve it.

**Chai Making Analogy:** Mom says "Make chai." Doesn't tell you HOW.
- Attempt 1: Too sweet → Mom frowns (-1)
- Attempt 5: Less sugar → "Better" (+1)
- Attempt 10: Perfect! → Mom smiles (+10)
Nobody gave a recipe. You learned through trial + feedback.

---

## When Do You Need Reinforcement Learning?

### Use RL when your problem looks like THIS:

```
Can I use Supervised instead?
  │
  ├── YES (I have labeled data) → Use Supervised. It's easier and faster.
  │
  └── NO, because:
        │
        ├── Too many possible situations to label?
        │   (Chess has more positions than atoms in the universe)
        │   → RL is the answer
        │
        ├── The answer is a STRATEGY over time, not a single prediction?
        │   (When to hit vs defend across an entire cricket match)
        │   → RL is the answer
        │
        ├── Need to balance competing goals?
        │   (Alert invigilator vs avoid false alarms)
        │   → RL is the answer
        │
        └── Feedback is delayed?
            (Chess: sacrifice queen now → payoff 20 moves later)
            → RL is the answer
```

### DON'T use RL when:
- You have labeled data → **Supervised is easier** (always try supervised first)
- You just need groups → **Unsupervised is simpler**
- RL is the **HARDEST** to train — needs millions of trial rounds
- Only use when Supervised and Unsupervised CAN'T solve it

---

## The 4 Key Terms

| Term | Meaning | Simple Version |
|:-----|:--------|:--------------|
| **Agent** | The learner making decisions | The player |
| **Environment** | The world the agent lives in | The game board |
| **Reward** | "Good job! Do more of this!" (+points) | Points scored |
| **Penalty** | "Bad move! Don't do this!" (-points) | Points lost |

---

## Real-World RL — 6 Problems Walked Through

### Problem 1: YouTube Recommendations
**Why not Supervised?** Can't label "user will like this video" for every user-video combination (billions of possibilities).

| Component | What it is |
|:----------|:----------|
| **Agent** | The recommendation algorithm |
| **Environment** | YouTube — videos, users, watch history |
| **Reward** | User watches full video (+), likes (+), subscribes (++) |
| **Penalty** | User skips in 5 seconds (-), clicks away (-) |
| **What it learns** | YOUR specific taste from billions of behavior signals |
| **Result** | Gets better the more you use it. Knows you better than you know yourself |

---

### Problem 2: Chess AI (AlphaZero)
**Why not Supervised?** Can't label every chess position (more positions than atoms in the universe). Can't write rules for every situation.

| Component | What it is |
|:----------|:----------|
| **Agent** | Chess-playing AI program |
| **Environment** | Chess board with all legal moves (rules given by engineer) |
| **Reward** | Win game = +1, Capture piece = +0.1 |
| **Penalty** | Lose game = -1, Lose piece = -0.1 |
| **What it learns** | Winning STRATEGIES — discovered tactics humans never thought of |
| **Result** | Played millions of games against ITSELF. Beat the world champion engine within 24 hours |

**Important:** AlphaZero was given the basic RULES of chess (how pieces move). It discovered STRATEGIES (when to sacrifice, when to attack) by itself.

---

### Problem 3: Self-Driving Car
**Why not Supervised?** Can't label every possible driving scenario. What if a child + dog + pothole + rain happen at the same time? Can't prepare for all combinations.

| Component | What it is |
|:----------|:----------|
| **Agent** | The driving AI |
| **Environment** | Road with cars, pedestrians, signals, weather |
| **Reward** | Safe driving = +1, Reach destination = +100 |
| **Penalty** | Crash = -1000, Injury = -500, Hard brake = -10 |
| **Priority system** | Human life (-1000) >> Human injury (-500) >> Car damage (-30) |
| **What it learns** | When to brake, swerve, slow down. Plans AHEAD — slows before danger |
| **Result** | Reacts in 0.001 sec (human = 1-2 sec). Detects child near road 5 seconds BEFORE danger. Trained on 10 million simulated emergencies |

---

### Problem 4: ExamGuard Alert System
**Why not Supervised?** Can label "cheating" clips, but can't label WHEN to alert (timing is a strategy). Also need to balance: too many alerts = invigilator ignores them, too few = cheating missed.

| Component | What it is |
|:----------|:----------|
| **Agent** | The alert decision system |
| **Environment** | Exam hall cameras, student behaviors |
| **Reward** | Correct alert (caught real cheating) = +100, Correct silence (ignored normal) = +10 |
| **Penalty** | False alarm (flagged innocent) = -50, Missed cheating (didn't flag) = -200 |
| **What it learns over time** | Glance at neighbor 0.5 sec → IGNORE (just looking). Stare 5 sec + lean → ALERT. Stare + neighbor covering paper → HIGH PRIORITY |
| **Why -200 for missed?** | Missing real cheating is WORSE than a false alarm. System learns to be cautious but not paranoid |

---

### Problem 5: Robot Learning to Walk
**Why not Supervised?** Can't label every possible joint angle and balance position. The robot has to discover balance through thousands of falls.

| Component | What it is |
|:----------|:----------|
| **Agent** | The robot |
| **Environment** | Floor, gravity, obstacles |
| **Reward** | Stay upright = +1, Move forward = +5, Reach goal = +100 |
| **Penalty** | Fall = -10, Hit wall = -5 |
| **Training progression** | Episode 1: falls instantly. Episode 100: 3 shaky steps. Episode 1000: walks across room. Episode 10,000: walks on any terrain |

---

### Problem 6: Game AI (Flappy Bird / Atari)
**Why not Supervised?** Can't label the "best action" for every possible game state.

| Component | What it is |
|:----------|:----------|
| **Agent** | Game-playing AI |
| **Environment** | The game world (pipes, enemies, obstacles) |
| **Reward** | Score points (+), Pass obstacle (+), Win level (++) |
| **Penalty** | Die (-), Lose life (-) |
| **Training progression** | Game 1: random taps → dies instantly. Game 1000: learns timing. Game 10,000: plays PERFECTLY. Atari: beats human world records |

---

## Key Concept: Exploration vs Exploitation

The MOST important concept in RL:

| | Exploitation | Exploration |
|:--|:-----------|:-----------|
| **What** | Stick with what works | Try something new |
| **Example** | "Same restaurant every day — food is good" | "New restaurant? Might be amazing... or terrible" |
| **Risk** | Miss something better | Waste time on something worse |
| **RL need** | Use best known strategy | Try random actions to discover better strategies |

**Why it matters:** If the agent ONLY exploits → it gets stuck with a "good enough" strategy, never discovers the BEST one. If it ONLY explores → it keeps trying random things forever, never uses what it learned. The agent must BALANCE both.

**ExamGuard example:** Alert system found that flagging students who look away for 3+ seconds works okay (70% correct). Should it keep using this (exploit) or try a different threshold like 5 seconds (explore)? Maybe 5 seconds is actually 85% correct — but it won't know unless it tries.

---

## How All 3 Types Compare — The Final Picture

| | Supervised | Unsupervised | Reinforcement |
|:--|:----------|:------------|:-------------|
| **Data** | Labeled (answers given) | No labels | No labels, just rewards |
| **Question** | "WHAT is this?" | "What PATTERNS exist?" | "HOW to do this well?" |
| **Output** | Prediction (word or number) | Groups or anomalies | Strategy (sequence of decisions) |
| **Time** | One prediction at a time | One analysis at a time | Decisions over TIME (plans ahead) |
| **Difficulty** | Easiest | Medium | Hardest |
| **Try first?** | YES — always try supervised first | If no labels | Only if supervised/unsupervised can't solve it |

### ExamGuard Uses ALL 3 Together:

| Component | Type | What it does |
|:----------|:-----|:------------|
| Camera recognizes cheating | **Supervised** (CNN) | Trained on 10K labeled clips: "cheating" vs "normal" |
| Spots unusual behavior | **Unsupervised** (Autoencoder) | Learns normal, flags anything different |
| Decides when to alert | **Reinforcement** | Balances correct alerts (+100) vs false alarms (-50) |

**Supervised = WHAT is happening?**
**Unsupervised = What PATTERNS are unusual?**
**Reinforcement = HOW to respond over time?**

---

## Mini Summary

**When to use RL:**
- Can't label all possible situations → RL
- Need a STRATEGY over time (not just one prediction) → RL
- Need to balance competing goals (alert vs ignore) → RL
- Feedback is delayed (sacrifice now, win later) → RL

**When NOT:** If you have labels → supervised. If you need groups → unsupervised. RL is last resort (hardest to train).

**Golden rule:** Always try Supervised first → then Unsupervised → RL only when the others can't solve it.

---

> 📝 *Quiz Q&A → see [../AI_ML_Quiz_QnA.md](../AI_ML_Quiz_QnA.md)*
> 📂 *Detailed examples → see [../04_Reinforcement/](../04_Reinforcement/)*
