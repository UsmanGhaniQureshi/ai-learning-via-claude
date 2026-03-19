# Section B: Types of Machine Learning — 3 Approaches

> **Topics 6-8 — The 3 ways machines learn: Supervised, Unsupervised, Reinforcement**

---

## What You'll Learn in This Section

Now that you know WHAT ML is (from Section A), this section teaches you HOW machines learn. There are exactly 3 approaches, and real projects often use all 3 together.

| Approach | One-Line Summary | Key Question |
|:---------|:----------------|:-------------|
| **Supervised** | Learning WITH labeled data (teacher gives answers) | "WHAT is this?" |
| **Unsupervised** | Learning WITHOUT labels (find patterns alone) | "What PATTERNS exist?" |
| **Reinforcement** | Learning by trial & error (reward / penalty) | "HOW to do this well?" |

---

## Topics in This Section

| # | Topic | What You'll Learn |
|:--|:------|:-----------------|
| 06 | [Supervised Learning](06_Supervised_Learning.md) | Classification (answer=WORD) vs Regression (answer=NUMBER) + 9 models with real examples |
| 07 | [Unsupervised Learning](07_Unsupervised_Learning.md) | Clustering (group similar) vs Anomaly Detection (spot weird) + 4 models |
| 08 | [Reinforcement Learning](08_Reinforcement_Learning.md) | Agent, Environment, Reward, Penalty + Exploration vs Exploitation + real examples |

---

## Topic 6: Supervised Learning — Models at a Glance

### Classification Models (Answer = WORD)

| Model | What It Does | Real Example | When to Use |
|:------|:------------|:-------------|:------------|
| **Logistic Regression** | Draws a line between 2 groups | 5K emails → Spam or Not Spam | Small data, 2 categories, need fast results |
| **Decision Tree** | Flowchart of Yes/No questions | Bank loan: Income > 50K? → Credit > 700? → APPROVE | Need to EXPLAIN why (banks, hospitals) |
| **Random Forest** | 100+ Decision Trees vote, majority wins | Disease: 73 trees say Dengue, 18 say Malaria → Dengue | Want BEST accuracy, don't mind slower speed |
| **SVM** | Finds the WIDEST gap between groups | Handwriting: Is this letter A or B? | Clear separation between groups, medium data |
| **KNN** | Look at K nearest neighbors, majority wins | 5 nearest houses are Expensive → yours = Expensive | Small data, simple, intuitive |
| **CNN (Deep Learning)** | Layers find visual patterns (edges → shapes → objects) | ExamGuard: camera frame → "student looking at neighbor" → CHEATING | Images / Video — the ONLY option for visual data |

### Regression Models (Answer = NUMBER)

| Model | What It Does | Real Example | When to Use |
|:------|:------------|:-------------|:------------|
| **Linear Regression** | Draws best STRAIGHT line through data | 1000 sqft = Rs 50L, 1500 = Rs 75L → 1400 sqft = Rs 70L | Simple straight relationship, quick first try |
| **Polynomial Regression** | Draws best CURVED line | Crop yield: too little fertilizer = low, right = high, too much = drops! | Relationship clearly curves, not straight |
| **Decision Tree Regression** | YES/NO flowchart that predicts a NUMBER | Property tax: Size>1500? Age<10? City center? → Rs 45,000/year | Need explainable number prediction (gov, tax, finance) |
| **Random Forest Regression** | 100+ trees each predict a number, AVERAGE wins | Delivery time: 100 trees consider distance, traffic, weather → 42 min (±3) | Best accuracy for number prediction, many features |
| **Neural Network Regression** | Many layers process complex patterns | Stock price with 50+ features (price, volume, news, earnings) | Massive data, many features, complex patterns |

### Quick Decision:
- **Start with Logistic Regression (classification) or Linear Regression (regression)** → if accuracy low → try Random Forest → still low → try CNN/Neural Network
- **Images or Video? → CNN is the ONLY option** (simple models can't handle pixels)
- **Need to explain WHY? → Decision Tree** (shows step-by-step reasoning)

---

## Topic 7: Unsupervised Learning — Models at a Glance

### Clustering Models (Group Similar Things)

| Model | What It Does | Real Example | When to Use |
|:------|:------------|:-------------|:------------|
| **K-Means** | Groups data into K clusters (YOU pick K) | Mall: 10K customers → 3 groups: Budget / Premium / Deal Hunters | Know roughly how many groups you want |
| **DBSCAN** | Finds groups NATURALLY + flags outliers | 200 delivery trucks → 4 route clusters + 2 outlier trucks going wrong places | Don't know how many groups, expect outliers |

### Anomaly Detection Models (Spot the Weird One)

| Model | What It Does | Real Example | When to Use |
|:------|:------------|:-------------|:------------|
| **Isolation Forest** | Isolates unusual data points quickly | 1M credit card transactions → Rs 5L in Dubai at 3AM = isolated in 2 questions = FRAUD | Find rare events (fraud, defects, attacks) |
| **Autoencoder** | Learns what "normal" looks like, flags anything different | 10K good brake pad photos → defective pad = can't recreate = FLAG | Catch ANY deviation, even never-seen-before anomalies |

### Quick Decision:
- **Know how many groups? → K-Means.** Don't know? → **DBSCAN**
- **Find rare/weird events? → Isolation Forest.** Learn normal and catch anything different? → **Autoencoder**

---

## Topic 8: Reinforcement Learning — Key Concepts

### The 4 Key Terms

| Term | Meaning | Bicycle Example | ExamGuard Example |
|:-----|:--------|:---------------|:-----------------|
| **Agent** | The learner | You learning to ride | The alert decision system |
| **Environment** | The world it operates in | Road, traffic, weather | Exam hall cameras |
| **Reward** | Good feedback (+points) | Balanced! Moved forward! | Correct alert: +100 |
| **Penalty** | Bad feedback (-points) | Fell down! Hit a wall! | False alarm: -50, Missed cheating: -200 |

### Real-World RL Examples

| Example | Agent | What It Learns | Result |
|:--------|:------|:--------------|:-------|
| **YouTube** | Recommendation algorithm | YOUR taste from watching behavior | Suggests videos you actually like |
| **Chess AI (AlphaZero)** | Chess program playing vs itself | Winning strategies (given basic rules) | Beat world champion in 24 hours |
| **Self-Driving Car** | Driving AI | Safe navigation (human life = highest priority) | 0.001 sec reaction vs human 1-2 sec |
| **ExamGuard** | Alert system | When to flag vs ignore | Glance 0.5s = ignore, Stare 5s + lean = ALERT |

### Key Concept: Exploration vs Exploitation
- **Exploitation:** Stick with what works ("Same restaurant, food is good")
- **Exploration:** Try something new ("New restaurant? Might be amazing!")
- RL agent must BALANCE both — do what works + try new things

---

## How to Remember the 3 Types

### Cricket Analogy

| Type | Cricket | Question |
|:-----|:--------|:---------|
| **Supervised** | Recognizing ball, bat, helmet (labeled objects) | "WHAT is this?" |
| **Unsupervised** | Discovering fielding patterns nobody pointed out | "What PATTERNS exist?" |
| **Reinforcement** | Learning WHEN to hit vs defend over many matches | "HOW to play well?" |

### ExamGuard Uses ALL 3 Together

| Component | ML Type | What It Does |
|:----------|:--------|:------------|
| Camera recognizes cheating | **Supervised** (CNN) | Trained on 10K labeled clips: cheating vs normal |
| Spots unusual behavior | **Unsupervised** (Autoencoder) | Learns normal, flags anything different |
| Decides when to alert | **Reinforcement** | Balances correct alerts vs false alarms |

---

## After This Section

You'll know the 3 ways machines learn and which models to use for each. Next, in **Section C**, you'll go deeper into HOW it all works internally (Neural Networks + Math).

---

> 📂 *Previous: [Section A — Understanding AI & ML](00_Section_A_Understanding_AI_ML.md)*
> 📂 *Next: [Section C — How It Works Inside](08b_Section_C_How_It_Works.md)*
