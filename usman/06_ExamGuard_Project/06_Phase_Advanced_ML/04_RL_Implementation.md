# Reinforcement Learning — Training the Decision-Making Brain

## What Is This?

Every other AI model you have learned so far answers ONE question:
- CNN: "What is in this image?"
- LSTM: "What is happening over time?"
- Autoencoder: "Is this normal or abnormal?"

But none of them answer the REAL question:

**"What should I DO about it?"**

Should the system:
- Send an alert NOW?
- Wait and watch more?
- Mark it as low priority?
- Sound a high-priority alarm?
- Ignore it completely?

**Reinforcement Learning (RL)** trains an agent to make DECISIONS by trying things and learning from the results.

---

## How Does It Work?

### The Concept: Learning Like a Child

A child touches a hot stove:
```
Action: Touch stove
Result: PAIN (-100 reward)
Lesson: Do NOT touch stove again
```

A child eats candy:
```
Action: Eat candy
Result: DELICIOUS (+50 reward)
Lesson: Eat candy when available
```

The child learns WHICH ACTIONS lead to GOOD results and which lead to BAD results.

RL works the SAME way:
```
Agent (the AI) is in a SITUATION (state)
Agent takes an ACTION
Environment gives a REWARD (positive or negative)
Agent learns which actions give the best rewards
```

### The Four Key Parts

```
1. AGENT      = The decision maker (ExamGuard's alert system)
2. STATE      = Current situation (what the cameras are showing)
3. ACTION     = What the agent decides to do (alert, ignore, watch more)
4. REWARD     = Feedback on how good the action was (+100 or -50)
```

---

## WHY ExamGuard Needs This

### The Problem: Too Many Decisions

Every second, the system sees dozens of behaviors across all cameras. For each one:

```
Student glanced at neighbor for 0.5 seconds
→ Should I alert? Most invigilators would say NO — it is a quick glance.

Student stared at neighbor for 5 seconds
→ Should I alert? Maybe — it is getting suspicious.

Student stared at neighbor for 5 seconds AND leaned toward them
→ Should I alert? YES — this is very likely cheating.

Student stared at neighbor AND neighbor covered their paper
→ Should I alert? DEFINITELY — both students involved.
```

A simple threshold (like "alert if confidence > 80%") is too crude. The CONTEXT matters.

### The RL Solution

Train an agent that learns the BEST action for every situation:

```
State: [gaze_at_neighbor=0.5sec, lean=none, hand=writing]
Agent's learned action: IGNORE (just a quick glance)
Reward: +10 (correct — it was indeed innocent)

State: [gaze_at_neighbor=5sec, lean=toward_neighbor, hand=not_writing]
Agent's learned action: HIGH PRIORITY ALERT
Reward: +100 (correct — invigilator confirmed cheating)

State: [gaze_at_clock=3sec, lean=back, hand=stretching]
Agent's learned action: IGNORE
Reward: +10 (correct — student was just checking time)
```

Over thousands of training episodes, the agent learns the PERFECT policy.

---

## ExamGuard Reward System

### Actions the Agent Can Take

```
Action 0: IGNORE           → Do nothing, keep monitoring
Action 1: WATCH_CLOSER     → Increase monitoring on this student
Action 2: LOW_ALERT        → Flag to invigilator as "worth a look"
Action 3: MEDIUM_ALERT     → Flag as "probably suspicious"
Action 4: HIGH_ALERT       → Flag as "very likely cheating — check immediately"
```

### Reward Values

```
Correct alert (AI alerts, human confirms cheating):
  HIGH_ALERT on real cheating   → +100
  MEDIUM_ALERT on real cheating → +70
  LOW_ALERT on real cheating    → +30

Correct silence (AI ignores, nothing was wrong):
  IGNORE on normal behavior     → +10

False alarm (AI alerts, but nothing was wrong):
  HIGH_ALERT on normal behavior → -50  (wastes invigilator time)
  MEDIUM_ALERT on normal        → -30
  LOW_ALERT on normal           → -10

Missed cheating (AI ignores, but it WAS cheating):
  IGNORE on real cheating       → -200 (WORST outcome!)
```

### Why These Numbers?

- Missing cheating (-200) is MUCH worse than a false alarm (-50)
- So the agent learns to be CAUTIOUS — better to flag and be wrong than miss real cheating
- But false alarms still have a penalty, so it does not alert on everything
- WATCH_CLOSER has no penalty — it is a safe "middle ground"

---

## What the Agent Learns

After training, the agent develops nuanced behavior:

```
Scenario 1: Quick glance at neighbor (0.5 seconds)
  State: [gaze_duration=0.5, lean=0, hand_movement=writing]
  Action: IGNORE
  Why: Too brief, student went right back to writing

Scenario 2: Extended stare at neighbor (5 seconds)
  State: [gaze_duration=5.0, lean=0, hand_movement=stopped]
  Action: WATCH_CLOSER
  Why: Suspicious but not enough evidence yet

Scenario 3: Stare + lean toward neighbor
  State: [gaze_duration=5.0, lean=15_degrees, hand_movement=stopped]
  Action: MEDIUM_ALERT
  Why: Multiple indicators suggest cheating

Scenario 4: Stare + lean + neighbor covers paper
  State: [gaze_duration=5.0, lean=15, neighbor_covering=True]
  Action: HIGH_ALERT
  Why: Very strong evidence — both students involved

Scenario 5: Student looks around room frequently but briefly
  State: [gaze_changes=high, duration_each=0.3, pattern=random]
  Action: IGNORE
  Why: Probably just anxious/nervous, not targeting anyone
```

---

## How to Implement RL

### Step 1: Define the Environment

```python
import gymnasium as gym
import numpy as np

class ExamGuardEnv(gym.Env):
    """
    Custom environment for ExamGuard alert decisions.
    """
    def __init__(self):
        super().__init__()

        # State space: what the agent sees
        # [gaze_duration, lean_angle, hand_activity, mouth_movement,
        #  neighbor_distance, time_since_last_alert, confidence_score]
        self.observation_space = gym.spaces.Box(
            low=np.array([0, -30, 0, 0, 0, 0, 0]),
            high=np.array([30, 30, 5, 1, 100, 300, 1]),
            dtype=np.float32
        )

        # Action space: what the agent can do
        # 0=ignore, 1=watch, 2=low alert, 3=medium alert, 4=high alert
        self.action_space = gym.spaces.Discrete(5)

    def reset(self, seed=None):
        """Start a new monitoring episode."""
        # Generate a random scenario
        self.state = self._generate_scenario()
        self.is_cheating = self._determine_ground_truth()
        return self.state, {}

    def step(self, action):
        """Agent takes an action, environment gives reward."""
        reward = self._calculate_reward(action, self.is_cheating)

        # Move to next time step
        self.state = self._generate_scenario()
        self.is_cheating = self._determine_ground_truth()

        done = False  # Episode continues
        return self.state, reward, done, False, {}

    def _calculate_reward(self, action, is_cheating):
        """Reward based on action and ground truth."""
        if is_cheating:
            # Cheating IS happening
            rewards = {
                0: -200,   # Ignored cheating — TERRIBLE
                1: -50,    # Just watching — not enough
                2: +30,    # Low alert — caught it, but low urgency
                3: +70,    # Medium alert — good
                4: +100,   # High alert — perfect response
            }
        else:
            # Nothing is happening (normal behavior)
            rewards = {
                0: +10,    # Correctly ignored — good
                1: +5,     # Watching closer — slight waste but OK
                2: -10,    # Low alert — minor false alarm
                3: -30,    # Medium alert — wasting time
                4: -50,    # High alert — major false alarm
            }
        return rewards[action]
```

### Step 2: Train Using Stable Baselines3

```python
from stable_baselines3 import PPO

# Create environment
env = ExamGuardEnv()

# Create RL agent (PPO algorithm — good general-purpose RL)
model = PPO(
    "MlpPolicy",      # Use a simple neural network
    env,
    verbose=1,
    learning_rate=0.0003,
    n_steps=2048,
    batch_size=64,
    n_epochs=10,
    gamma=0.99         # How much agent values future rewards
)

# Train for 100,000 steps
model.learn(total_timesteps=100_000)

# Save the trained agent
model.save("examguard_alert_agent")
```

### Step 3: Use the Trained Agent

```python
# Load trained agent
model = PPO.load("examguard_alert_agent")

# In real-time: get state from cameras, ask agent what to do
state = get_current_state_from_cameras()  # [gaze, lean, hand, ...]

action, _ = model.predict(state)

action_names = {0: "IGNORE", 1: "WATCH", 2: "LOW ALERT",
                3: "MEDIUM ALERT", 4: "HIGH ALERT"}
print(f"Agent decision: {action_names[action]}")
```

### Step 4: Improve with Real Feedback

```python
# After pilot testing, use real invigilator feedback as rewards
# "Was this alert correct?" → Yes (+100) or No (-50)
# Retrain the agent with this real-world feedback
# Each cycle makes the agent smarter
```

---

## Libraries You Need

### Stable Baselines3
```bash
pip install stable-baselines3
```
- Pre-built RL algorithms (PPO, DQN, A2C, SAC)
- Easy to use, well documented
- Works with custom environments

### OpenAI Gymnasium
```bash
pip install gymnasium
```
- Framework for creating RL environments
- Standard interface that all RL libraries use
- Comes with practice environments (CartPole, etc.)

---

## Mini Project: CartPole Balancing

Before building ExamGuard's RL system, learn RL basics with the classic CartPole problem.

### What Is CartPole?
A pole is balanced on a cart. You can push the cart LEFT or RIGHT. Goal: keep the pole from falling.

```
         |
         |   ← Pole (keep this upright!)
    _____|_____
   |   CART    |
   |___________|
   ←   LEFT    RIGHT   →
```

### Step-by-Step

**Step 1: Install Libraries**
```bash
pip install stable-baselines3 gymnasium
```

**Step 2: See the Environment**
```python
import gymnasium as gym

env = gym.make("CartPole-v1", render_mode="human")

state, info = env.reset()
print(f"State: {state}")
# State = [cart_position, cart_velocity, pole_angle, pole_velocity]

for _ in range(100):
    action = env.action_space.sample()  # Random action (0=left, 1=right)
    state, reward, done, truncated, info = env.step(action)
    if done:
        state, info = env.reset()

env.close()
# You will see the cart moving randomly and the pole falling quickly
```

**Step 3: Train an RL Agent**
```python
from stable_baselines3 import PPO

env = gym.make("CartPole-v1")

# Create agent
model = PPO("MlpPolicy", env, verbose=1)

# Train (this takes about 1 minute)
model.learn(total_timesteps=50_000)

print("Training complete!")
```

**Step 4: Watch the Trained Agent**
```python
env = gym.make("CartPole-v1", render_mode="human")

state, info = env.reset()
total_reward = 0

for _ in range(500):
    action, _ = model.predict(state)  # Agent decides (not random!)
    state, reward, done, truncated, info = env.step(action)
    total_reward += reward
    if done:
        print(f"Episode reward: {total_reward}")
        state, info = env.reset()
        total_reward = 0

env.close()
# The pole should stay balanced much longer now!
```

**Step 5: Compare Before and After**
```python
# Test random agent (no training)
random_rewards = []
for _ in range(100):
    state, _ = env.reset()
    episode_reward = 0
    done = False
    while not done:
        action = env.action_space.sample()
        state, reward, done, _, _ = env.step(action)
        episode_reward += reward
    random_rewards.append(episode_reward)

print(f"Random agent average: {sum(random_rewards)/len(random_rewards):.1f}")
# Usually around 20-30

# Test trained agent
trained_rewards = []
for _ in range(100):
    state, _ = env.reset()
    episode_reward = 0
    done = False
    while not done:
        action, _ = model.predict(state)
        state, reward, done, _, _ = env.step(action)
        episode_reward += reward
    trained_rewards.append(episode_reward)

print(f"Trained agent average: {sum(trained_rewards)/len(trained_rewards):.1f}")
# Usually 400-500 (maximum is 500)
```

### What This Teaches You

| CartPole | ExamGuard |
|---|---|
| State: cart position, pole angle | State: gaze, lean, hand movement |
| Actions: push left or right | Actions: ignore, watch, alert |
| Reward: +1 for each step balanced | Reward: +100 for correct alert |
| Penalty: episode ends if pole falls | Penalty: -200 for missed cheating |
| Goal: keep pole balanced longest | Goal: make best alert decisions |

---

## Key Concepts to Master

### 1. Policy
The agent's STRATEGY — "given this state, what action should I take?"
```
Policy: If gaze_duration > 3 AND lean > 10 → MEDIUM_ALERT
        If gaze_duration < 1 → IGNORE
```

### 2. Value Function
"How good is this state?" — estimated total future reward from here.
```
State where student is writing normally → High value (safe, no penalty coming)
State where student staring at neighbor → Low value (missed cheating penalty coming)
```

### 3. Exploration vs Exploitation
- Exploration: Try random actions to discover new strategies
- Exploitation: Use the best known strategy
- Balance: Start with lots of exploration, gradually shift to exploitation

### 4. Discount Factor (Gamma)
- How much the agent values FUTURE rewards vs IMMEDIATE rewards
- Gamma = 0.99: Future matters almost as much as now
- Gamma = 0.5: Agent is short-sighted
- ExamGuard: Use high gamma (0.99) because missed cheating penalty comes LATER

---

## Key Takeaways

1. **RL learns DECISIONS, not classifications** — it decides WHAT TO DO, not just what it sees
2. **Reward design is critical** — the rewards define what the agent optimizes for
3. **Missing cheating must be penalized MORE than false alarms** — this shapes cautious behavior
4. **The agent learns nuance** — quick glance vs long stare vs stare+lean get different responses
5. **Start with CartPole** — learn the RL framework before building the ExamGuard environment
6. **Stable Baselines3 + Gymnasium** — the standard tools for RL in Python
