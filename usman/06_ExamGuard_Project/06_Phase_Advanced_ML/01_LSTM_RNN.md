# LSTM & RNN — Teaching AI to Understand TIME

## What Is This?

Regular neural networks look at ONE thing at a time. Show it a photo, it tells you what is in the photo. Done.

But what if the answer depends on what happened BEFORE?

Think about reading a sentence:

```
"The cat sat on the ___"
```

You know the answer is probably "mat" or "chair" because you read the PREVIOUS words. You understood the SEQUENCE.

**RNN (Recurrent Neural Network)** = A neural network that has MEMORY. It reads things one by one, and remembers what it saw before.

**LSTM (Long Short-Term Memory)** = An improved RNN that remembers things for a LONGER time. Regular RNN forgets quickly. LSTM has a special "memory cell" that decides what to remember and what to forget.

---

## How Does It Work? (Simple Explanation)

### Regular Neural Network (No Memory)
```
Photo 1 → Model → "Student looking left"
Photo 2 → Model → "Student leaning"
Photo 3 → Model → "Hand moving"

Each photo analyzed SEPARATELY. No connection between them.
```

### LSTM Network (Has Memory)
```
Photo 1 → LSTM → "Student looking left" (remembers this)
Photo 2 → LSTM → "Student leaning" (remembers: looked left, THEN leaned)
Photo 3 → LSTM → "Hand moving" (remembers: looked left, leaned, THEN hand moved)

LSTM says: "This SEQUENCE = cheating pattern!"
```

### The Key Idea: Hidden State

LSTM has a "hidden state" — think of it as a sticky note that gets passed from one step to the next.

```
Step 1: Read frame 1 → Write on sticky note: "looked left"
Step 2: Read frame 2 + sticky note → Update sticky note: "looked left, then leaned"
Step 3: Read frame 3 + sticky note → Update sticky note: "looked left, leaned, hand moved"
Step 4: Read sticky note → CHEATING PATTERN DETECTED
```

### The Three Gates

LSTM has three "gates" that control memory:

1. **Forget Gate** — "Should I forget old information?"
   - Student went back to writing 5 minutes ago? Forget the old glance.

2. **Input Gate** — "Should I remember this new information?"
   - Student looking at neighbor RIGHT NOW? Yes, remember this!

3. **Output Gate** — "What should I tell the next step?"
   - Based on everything remembered, what is the current assessment?

---

## WHY ExamGuard Needs This

### The Problem With Single-Frame Detection

If you only look at ONE frame:
- Student looking left → Could be thinking, looking at clock, stretching
- Student leaning → Could be tired, adjusting seat
- Hand near face → Could be scratching nose

**Each action alone is INNOCENT.**

### The Power of Sequences

But when you see the SEQUENCE:
```
Frame 1-10:  Student writing normally
Frame 11-15: Looks at neighbor's desk (not the clock, not the wall — the DESK)
Frame 16-20: Leans toward neighbor
Frame 21-25: Hand moves to cover their own paper
Frame 26-30: Writes rapidly (copying?)
Frame 31-35: Returns to normal position
```

**This sequence SCREAMS cheating!** No single frame proves it, but the pattern does.

### ExamGuard LSTM Pipeline

```
Camera captures 30 frames per second
         |
         v
Every 10 frames → Extract features using CNN
         |
         v
Feed features to LSTM (sequence of 10 feature vectors)
         |
         v
LSTM outputs: "Cheating probability: 87%"
         |
         v
Because it saw the SEQUENCE, not just one moment
```

---

## Real-World Example

Think about how a human invigilator catches cheating:

They do NOT look at one frozen moment. They WATCH behavior over time:

```
"Hmm, that student glanced at the neighbor..."
"Now they're leaning..."
"Now they're writing fast..."
"OK, that's suspicious. I'm going to watch more closely."
```

LSTM does EXACTLY this — it watches over time and builds suspicion.

---

## What You Need to Learn

### Step 1: Understand Sequence Data
- Time series data (stock prices over days)
- Text data (words in a sentence)
- Video data (frames over time)
- All of these are SEQUENCES where order matters

### Step 2: RNN Basics
```python
# Conceptual RNN (not real code yet)
hidden_state = zeros  # Start with blank memory

for each_frame in video:
    features = CNN(each_frame)  # Extract what's in the frame
    hidden_state = RNN(features, hidden_state)  # Update memory
    prediction = classify(hidden_state)  # What does the sequence mean?
```

### Step 3: Why RNN Fails (Vanishing Gradient)
- RNN forgets things that happened long ago
- After 20+ steps, early information is basically gone
- This is called the "vanishing gradient problem"

### Step 4: LSTM Solves This
```python
import torch
import torch.nn as nn

# Create an LSTM layer
lstm = nn.LSTM(
    input_size=256,    # Size of features from each frame
    hidden_size=128,   # Size of the memory
    num_layers=2,      # Stack 2 LSTM layers
    batch_first=True   # Input shape: (batch, sequence, features)
)

# Feed a sequence of 10 frames
# Each frame has 256 features (from CNN)
input_sequence = torch.randn(1, 10, 256)  # 1 video, 10 frames, 256 features

output, (hidden, cell) = lstm(input_sequence)
# output shape: (1, 10, 128) — prediction at each step
# hidden: final memory state
# cell: final cell state (long-term memory)
```

### Step 5: Full ExamGuard LSTM Model
```python
class ExamGuardLSTM(nn.Module):
    def __init__(self):
        super().__init__()
        # CNN to extract features from each frame
        self.cnn = models.resnet18(pretrained=True)
        self.cnn.fc = nn.Linear(512, 256)  # Reduce to 256 features

        # LSTM to understand the sequence
        self.lstm = nn.LSTM(
            input_size=256,
            hidden_size=128,
            num_layers=2,
            batch_first=True
        )

        # Final classification
        self.classifier = nn.Linear(128, 2)  # Normal vs Cheating

    def forward(self, video_frames):
        # video_frames shape: (batch, 10_frames, 3, 224, 224)
        batch_size, seq_len = video_frames.shape[:2]

        # Extract features from each frame
        features = []
        for t in range(seq_len):
            frame_features = self.cnn(video_frames[:, t])
            features.append(frame_features)

        features = torch.stack(features, dim=1)  # (batch, 10, 256)

        # Feed sequence to LSTM
        lstm_out, _ = self.lstm(features)

        # Use the LAST output (after seeing all frames)
        last_output = lstm_out[:, -1, :]  # (batch, 128)

        # Classify
        prediction = self.classifier(last_output)
        return prediction  # Normal or Cheating
```

### Step 6: Key Concepts to Master
- **Sequence length**: How many frames to look at (10? 30? 60?)
- **Hidden size**: How much memory the LSTM has
- **Num layers**: Stacking LSTMs for deeper understanding
- **Bidirectional**: Looking at sequence forward AND backward
- **Attention**: Focusing on the MOST IMPORTANT frames in the sequence

---

## Mini Project: Next Word Predictor

Build this to understand how sequences work before applying to video.

### Goal
Train a model to predict the next word in a sentence.

### Steps

**Step 1: Prepare Data**
```python
text = "the cat sat on the mat the dog sat on the rug"
words = text.split()
# Create vocabulary
vocab = list(set(words))
word_to_idx = {word: i for i, word in enumerate(vocab)}
idx_to_word = {i: word for word, i in word_to_idx.items()}
```

**Step 2: Create Sequences**
```python
# Use 3 words to predict the 4th
sequences = []
for i in range(len(words) - 3):
    input_words = [word_to_idx[w] for w in words[i:i+3]]
    target_word = word_to_idx[words[i+3]]
    sequences.append((input_words, target_word))

# Example: ["the", "cat", "sat"] → "on"
```

**Step 3: Build LSTM Model**
```python
class NextWordLSTM(nn.Module):
    def __init__(self, vocab_size, embed_size, hidden_size):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_size)
        self.lstm = nn.LSTM(embed_size, hidden_size, batch_first=True)
        self.fc = nn.Linear(hidden_size, vocab_size)

    def forward(self, x):
        embeds = self.embedding(x)
        lstm_out, _ = self.lstm(embeds)
        last_output = lstm_out[:, -1, :]
        prediction = self.fc(last_output)
        return prediction
```

**Step 4: Train**
```python
model = NextWordLSTM(vocab_size=len(vocab), embed_size=32, hidden_size=64)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
criterion = nn.CrossEntropyLoss()

for epoch in range(100):
    for input_seq, target in sequences:
        input_tensor = torch.tensor([input_seq])
        target_tensor = torch.tensor([target])

        output = model(input_tensor)
        loss = criterion(output, target_tensor)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
```

**Step 5: Test**
```python
test_input = ["the", "cat", "sat"]
input_tensor = torch.tensor([[word_to_idx[w] for w in test_input]])
output = model(input_tensor)
predicted_idx = output.argmax(dim=1).item()
print(f"Predicted next word: {idx_to_word[predicted_idx]}")
# Should predict "on"!
```

### What This Teaches You
- How sequences are processed one step at a time
- How LSTM maintains memory across steps
- How to train on sequential data
- The same concept applies to video frames in ExamGuard

---

## Connection to ExamGuard

| Next Word Predictor | ExamGuard |
|---|---|
| Input: 3 words | Input: 10 video frames |
| Each word = embedding vector | Each frame = CNN feature vector |
| LSTM reads word by word | LSTM reads frame by frame |
| Output: next word | Output: cheating or normal |
| Memory: remembers previous words | Memory: remembers previous behaviors |

**The skill is IDENTICAL — only the data type changes.**

---

## Key Takeaways

1. **LSTM understands TIME** — it does not just see one moment, it sees the whole story
2. **Cheating is a sequence** — no single frame proves it, but the pattern over time does
3. **Hidden state = memory** — LSTM remembers what it saw before
4. **Three gates control memory** — forget old stuff, remember new stuff, output relevant stuff
5. **Start with text sequences** — easier to understand before jumping to video
