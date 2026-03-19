# Autoencoders — Teaching AI What "Normal" Looks Like

## What Is This?

Imagine you study 1000 photos of cats. You get SO good at drawing cats from memory that you can recreate any cat photo almost perfectly.

Now someone shows you a photo of a DOG and asks you to recreate it. You have never studied dogs. Your recreation looks TERRIBLE — it looks like a weird cat-dog hybrid.

**That terrible recreation = the system telling you "this is NOT what I was trained on!"**

An **Autoencoder** is a neural network that does exactly this:
1. Takes an input (like a video frame)
2. COMPRESSES it into a tiny representation
3. RECREATES the original from that tiny version
4. Compares the recreation to the original

If the recreation is good → the input was NORMAL (similar to training data).
If the recreation is bad → the input was ABNORMAL (different from training data).

---

## How Does It Work?

### The Architecture

```
INPUT (full image) → ENCODER → BOTTLENECK → DECODER → OUTPUT (recreated image)
    224x224           Shrink     Just 32       Expand      224x224
    = 150,528         down       numbers!      back up     = 150,528
    numbers                                                numbers
```

### Think of It Like This

```
Original photo (high detail)
    |
    v
ENCODER: Summarize in 10 words
    |
    v
"Student sitting, writing, head down, pen moving, paper centered"
    |
    v
DECODER: Recreate photo from those 10 words
    |
    v
Recreated photo (close to original, but not perfect)
```

If the original was a NORMAL student writing, the 10-word summary captures it well, and recreation is close.

If the original was a student doing something WEIRD (standing on desk?), the 10-word summary cannot capture it, and recreation is terrible.

### The Three Parts

**1. Encoder (Compressor)**
- Takes the full input
- Squeezes it down to a tiny representation
- Forces the network to learn what is IMPORTANT

**2. Bottleneck (The Tiny Middle)**
- Just a small number of values (like 32 or 64 numbers)
- This is the "compressed summary" of the input
- FORCES the network to learn only the ESSENTIAL patterns

**3. Decoder (Reconstructor)**
- Takes the tiny representation
- Tries to rebuild the original input
- The better the training, the better the reconstruction

---

## WHY ExamGuard Needs This

### The Problem: Unknown Cheating Methods

You can train a model to recognize specific cheating:
- Looking at neighbor (known method)
- Using phone (known method)
- Passing notes (known method)

But what about CREATIVE cheating you have NEVER seen?
- Tapping desk in Morse code to communicate
- Using a smartwatch disguised as regular watch
- Coughing patterns as signals
- Touching specific body parts as coded answers

**You cannot train a classifier for methods you have not seen!**

### The Autoencoder Solution

Instead of learning "what cheating looks like," learn "what NORMAL looks like."

```
Training (before exam):
- Feed 10,000 clips of NORMAL student behavior
- Autoencoder learns to compress and recreate normal behavior perfectly

During exam:
- Feed live video frames
- Autoencoder tries to recreate each frame
- If recreation error is LOW → Normal behavior → Ignore
- If recreation error is HIGH → Something unusual → FLAG IT
```

### ExamGuard Example

```
Normal behavior (trained on):          Reconstruction error: 0.02 (LOW)
- Student writing                       → Normal. No alert.
- Student looking at own paper
- Student stretching occasionally

Unusual behavior (never trained on):   Reconstruction error: 0.45 (HIGH)
- Student tapping desk rhythmically     → FLAGGED! Unusual pattern.
- Student touching ear repeatedly       → FLAGGED! Possible earpiece.
- Student making hand signals           → FLAGGED! Unknown behavior.
```

**The autoencoder does not need to know WHAT the cheating method is. It just knows "this is NOT normal."**

---

## Real-World Connection

This is exactly how credit card fraud detection works:

1. Bank learns your NORMAL spending pattern (coffee shop, grocery store, gas station)
2. Someone uses your card at a luxury store in another country
3. System says "I cannot reconstruct this as normal behavior" → FLAGGED

ExamGuard does the same thing but with VIDEO instead of transactions.

---

## What You Need to Learn

### Step 1: Basic Autoencoder Structure

```python
import torch
import torch.nn as nn

class BasicAutoencoder(nn.Module):
    def __init__(self):
        super().__init__()

        # ENCODER: Compress input
        self.encoder = nn.Sequential(
            nn.Linear(784, 256),    # 784 input features → 256
            nn.ReLU(),
            nn.Linear(256, 64),     # 256 → 64
            nn.ReLU(),
            nn.Linear(64, 32),      # 64 → 32 (bottleneck!)
            nn.ReLU()
        )

        # DECODER: Reconstruct from compressed
        self.decoder = nn.Sequential(
            nn.Linear(32, 64),      # 32 → 64
            nn.ReLU(),
            nn.Linear(64, 256),     # 64 → 256
            nn.ReLU(),
            nn.Linear(256, 784),    # 256 → 784 (same as input!)
            nn.Sigmoid()            # Output between 0 and 1
        )

    def forward(self, x):
        compressed = self.encoder(x)    # Compress
        reconstructed = self.decoder(compressed)  # Reconstruct
        return reconstructed
```

### Step 2: Training the Autoencoder

```python
model = BasicAutoencoder()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
criterion = nn.MSELoss()  # Mean Squared Error — how different is output from input?

for epoch in range(50):
    for batch in normal_data_loader:  # ONLY normal data!
        # The input IS the target (we want to recreate the input)
        output = model(batch)
        loss = criterion(output, batch)  # Compare output to input

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    print(f"Epoch {epoch}: Reconstruction error = {loss.item():.4f}")
```

### Step 3: Using It for Anomaly Detection

```python
def detect_anomaly(model, new_data, threshold=0.1):
    """
    If reconstruction error > threshold → ANOMALY
    """
    model.eval()
    with torch.no_grad():
        reconstructed = model(new_data)
        error = torch.mean((new_data - reconstructed) ** 2, dim=1)

        for i, err in enumerate(error):
            if err > threshold:
                print(f"Sample {i}: ERROR={err:.4f} → ANOMALY DETECTED!")
            else:
                print(f"Sample {i}: ERROR={err:.4f} → Normal")
```

### Step 4: Convolutional Autoencoder (For Images)

```python
class ConvAutoencoder(nn.Module):
    def __init__(self):
        super().__init__()

        # ENCODER: Image → compressed
        self.encoder = nn.Sequential(
            nn.Conv2d(3, 32, 3, stride=2, padding=1),   # 224→112
            nn.ReLU(),
            nn.Conv2d(32, 64, 3, stride=2, padding=1),  # 112→56
            nn.ReLU(),
            nn.Conv2d(64, 128, 3, stride=2, padding=1), # 56→28
            nn.ReLU(),
            nn.Conv2d(128, 256, 3, stride=2, padding=1),# 28→14
            nn.ReLU()
        )

        # DECODER: Compressed → image
        self.decoder = nn.Sequential(
            nn.ConvTranspose2d(256, 128, 3, stride=2, padding=1, output_padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(128, 64, 3, stride=2, padding=1, output_padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(64, 32, 3, stride=2, padding=1, output_padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(32, 3, 3, stride=2, padding=1, output_padding=1),
            nn.Sigmoid()
        )

    def forward(self, x):
        compressed = self.encoder(x)
        reconstructed = self.decoder(compressed)
        return reconstructed
```

### Step 5: Setting the Right Threshold

This is the HARDEST part. Too sensitive = too many false alarms. Too loose = misses anomalies.

```python
# After training, measure error on NORMAL validation data
normal_errors = []
for batch in normal_validation_data:
    reconstructed = model(batch)
    error = torch.mean((batch - reconstructed) ** 2, dim=1)
    normal_errors.extend(error.tolist())

# Set threshold at 95th percentile of normal errors
# This means 5% of NORMAL data will be flagged (acceptable)
import numpy as np
threshold = np.percentile(normal_errors, 95)
print(f"Threshold set at: {threshold:.4f}")

# Anything with error ABOVE this threshold = anomaly
```

---

## Mini Project: Anomaly Detection on Handwritten Digits

### Goal
Train an autoencoder on the digit "1". Then test it with other digits — it should flag them as anomalies.

### Step-by-Step

**Step 1: Load Data**
```python
from torchvision import datasets, transforms

transform = transforms.Compose([
    transforms.ToTensor()
])

mnist = datasets.MNIST(root='./data', train=True, download=True, transform=transform)

# Filter only digit "1" for training (this is our "normal")
normal_data = [img for img, label in mnist if label == 1]
print(f"Training on {len(normal_data)} images of digit 1")
```

**Step 2: Build Simple Autoencoder**
```python
class DigitAutoencoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Flatten(),
            nn.Linear(28*28, 128),
            nn.ReLU(),
            nn.Linear(128, 32),  # Bottleneck: 32 numbers
            nn.ReLU()
        )
        self.decoder = nn.Sequential(
            nn.Linear(32, 128),
            nn.ReLU(),
            nn.Linear(128, 28*28),
            nn.Sigmoid(),
            nn.Unflatten(1, (1, 28, 28))
        )

    def forward(self, x):
        compressed = self.encoder(x)
        reconstructed = self.decoder(compressed)
        return reconstructed
```

**Step 3: Train on Normal Data Only**
```python
# Train ONLY on digit "1"
model = DigitAutoencoder()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
criterion = nn.MSELoss()

for epoch in range(20):
    total_loss = 0
    for img in DataLoader(normal_data, batch_size=64, shuffle=True):
        output = model(img)
        loss = criterion(output, img)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    print(f"Epoch {epoch}: Loss = {total_loss/len(normal_data):.6f}")
```

**Step 4: Test with Different Digits**
```python
# Test with digit 1 (normal) — should have LOW error
# Test with digit 7 (anomaly) — should have HIGH error
# Test with digit 3 (anomaly) — should have HIGH error

test_data = datasets.MNIST(root='./data', train=False, transform=transform)

for digit in [1, 3, 5, 7, 9]:
    digit_samples = [img for img, label in test_data if label == digit][:100]
    errors = []
    for img in digit_samples:
        img = img.unsqueeze(0)
        reconstructed = model(img)
        error = torch.mean((img - reconstructed) ** 2).item()
        errors.append(error)

    avg_error = sum(errors) / len(errors)
    status = "NORMAL" if digit == 1 else "ANOMALY"
    print(f"Digit {digit}: Avg Error = {avg_error:.4f} → Expected: {status}")
```

**Expected Output:**
```
Digit 1: Avg Error = 0.0023 → Expected: NORMAL    (low error — it knows this!)
Digit 3: Avg Error = 0.0187 → Expected: ANOMALY   (high error — never seen this)
Digit 5: Avg Error = 0.0215 → Expected: ANOMALY   (high error)
Digit 7: Avg Error = 0.0098 → Expected: ANOMALY   (medium — 7 looks a bit like 1)
Digit 9: Avg Error = 0.0145 → Expected: ANOMALY   (high error)
```

---

## Connection to ExamGuard

| Digit Autoencoder | ExamGuard Autoencoder |
|---|---|
| Trained on digit "1" | Trained on normal student behavior |
| Tests new digits | Tests live video frames |
| High error = not digit 1 | High error = not normal behavior |
| Catches ANY non-1 digit | Catches ANY unusual behavior |
| No need to know what digit 3 looks like | No need to know what the cheating method is |

---

## Key Takeaways

1. **Autoencoders learn to compress and recreate** — the bottleneck forces them to learn patterns
2. **Train on NORMAL only** — the magic is that anomalies are detected automatically
3. **Reconstruction error = anomaly score** — high error means "I have never seen anything like this"
4. **Catches UNKNOWN cheating methods** — does not need to be trained on specific cheating
5. **Threshold setting is critical** — too low means too many false alarms, too high means missed catches
