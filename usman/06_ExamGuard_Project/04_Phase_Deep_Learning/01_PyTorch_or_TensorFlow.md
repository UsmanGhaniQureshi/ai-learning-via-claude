# PyTorch or TensorFlow — Your Deep Learning Engine

## What Is This?

You know Scikit-learn from Phase 3? It was great for traditional ML — decision trees, random forests, logistic regression. But now we need **neural networks** — the brain-like models that power image recognition, voice assistants, and self-driving cars.

**PyTorch and TensorFlow are the tools that let you build neural networks.**

Think of it this way:
- Scikit-learn = a regular calculator (handles basic math well)
- PyTorch/TensorFlow = a scientific graphing calculator (handles complex, layered computations)

Both do the same job. Both are free. Both are used by top companies. You just need to pick one.

---

## PyTorch vs TensorFlow — Quick Comparison

| Feature | PyTorch | TensorFlow |
|---------|---------|------------|
| Made by | Meta (Facebook) | Google |
| Learning curve | Easier for beginners | Steeper initially |
| Code style | Feels like regular Python | Has its own way of doing things |
| Debugging | Easy — standard Python debugger works | Harder — runs in "graph mode" |
| Used by | Most researchers, universities | Production systems, Google products |
| Community | Growing fast, dominant in research | Huge, lots of tutorials |
| GPU support | Built-in, easy | Built-in, easy |
| Job market | Increasingly demanded | Still widely used in industry |

### My Recommendation: Start with PyTorch

Why?
1. **Reads like Python** — if you know Python, PyTorch code makes sense immediately
2. **Easier debugging** — when something breaks, you can figure out why
3. **Research standard** — most new AI papers use PyTorch, so latest techniques appear here first
4. **ExamGuard models** — YOLO (our object detection model) is built on PyTorch

You can always learn TensorFlow later. The concepts transfer directly.

---

## WHY This Matters for ExamGuard

Every deep learning component in ExamGuard runs on one of these frameworks:

| ExamGuard Component | What It Does | Framework Needed |
|---------------------|-------------|-----------------|
| CNN for behavior classification | Looks at frames, says "cheating" or "normal" | PyTorch |
| YOLO for object detection | Finds phones, chits, earpieces in frame | PyTorch |
| Face recognition | Identifies which student is which | PyTorch |
| Pose estimation | Tracks body position and movement | PyTorch/TF |
| Gaze estimation | Detects where eyes are looking | PyTorch |

**Without PyTorch or TensorFlow, you literally cannot build ExamGuard.** This is the engine that powers everything from Phase 4 onward.

---

## Real ExamGuard Connection

Here is what happens when a camera captures a frame in your exam hall:

```
Camera captures frame
        |
        v
[OpenCV reads the frame]          <-- Phase 5
        |
        v
[PyTorch CNN processes it]        <-- THIS IS WHERE PYTORCH COMES IN
        |
        v
[Model outputs: "cheating" 87%]   <-- PyTorch calculates this
        |
        v
[Alert sent to supervisor]         <-- Phase 7
```

Every single model prediction — "Is this student cheating?", "Is that a phone?", "Where are they looking?" — is a PyTorch computation happening in milliseconds.

---

## What You Need to Learn

### 1. Tensors — The Building Block
Everything in deep learning is a **tensor** (basically a multi-dimensional array).

```python
import torch

# A single number (0D tensor)
x = torch.tensor(5)

# A list of numbers (1D tensor) — like exam scores
scores = torch.tensor([85, 92, 78, 95])

# A 2D tensor — like a grayscale image (rows x columns of pixel values)
image = torch.tensor([[120, 130, 125],
                       [118, 135, 128],
                       [122, 131, 127]])

# A 3D tensor — like a color image (3 channels x height x width)
color_image = torch.randn(3, 224, 224)  # RGB, 224x224 pixels
```

**ExamGuard connection:** Every camera frame becomes a tensor before any model can process it.

### 2. Building Layers — The Model Architecture
A neural network is layers stacked on top of each other:

```python
import torch.nn as nn

# A simple neural network
model = nn.Sequential(
    nn.Linear(784, 128),    # Input layer: 784 pixels → 128 neurons
    nn.ReLU(),               # Activation: "turn on" important neurons
    nn.Linear(128, 64),     # Hidden layer: 128 → 64 neurons
    nn.ReLU(),
    nn.Linear(64, 2)        # Output: 64 → 2 classes (cheating/normal)
)
```

### 3. Forward Pass — Making a Prediction
```python
# Feed an image through the model
input_image = torch.randn(1, 784)   # One flattened image
output = model(input_image)          # Forward pass
print(output)                        # tensor([[ 0.85, -0.32]])
# First number high → "cheating", Second number high → "normal"
```

### 4. Loss Functions — How Wrong Was the Prediction?
```python
loss_fn = nn.CrossEntropyLoss()

prediction = model(input_image)
actual_label = torch.tensor([0])     # 0 = cheating, 1 = normal

loss = loss_fn(prediction, actual_label)
print(f"Error: {loss.item():.4f}")   # Lower = better
```

### 5. Optimizers — How the Model Learns
```python
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

# Training loop (simplified)
for epoch in range(100):
    prediction = model(input_image)
    loss = loss_fn(prediction, actual_label)

    optimizer.zero_grad()   # Reset gradients
    loss.backward()         # Calculate how to improve
    optimizer.step()        # Actually improve the model
```

### 6. GPU Acceleration
```python
# Move model and data to GPU for 10-50x speed boost
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)
input_image = input_image.to(device)
```

**ExamGuard connection:** Processing 120 frames/second requires GPU acceleration.

---

## The Complete Training Flow

```
1. PREPARE DATA
   Images of cheating/normal → Convert to tensors → Split train/test

2. BUILD MODEL
   Define layers → Choose activation functions

3. TRAIN
   Feed images → Model predicts → Calculate error → Adjust weights → Repeat 1000x

4. EVALUATE
   Test on unseen images → Check accuracy → Good enough? → Deploy

5. DEPLOY
   Save model → Load in ExamGuard → Process live camera frames
```

---

## Mini Project: Handwritten Digit Classifier (MNIST)

**Goal:** Build your first neural network that recognizes handwritten digits (0-9).

**Why this project?** It is the "Hello World" of deep learning. Simple enough to learn on, complex enough to teach real concepts.

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms
from torch.utils.data import DataLoader

# Step 1: Load the MNIST dataset (60,000 training images of digits)
transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize((0.5,), (0.5,))
])

train_data = datasets.MNIST(root='./data', train=True, download=True, transform=transform)
test_data = datasets.MNIST(root='./data', train=False, download=True, transform=transform)

train_loader = DataLoader(train_data, batch_size=64, shuffle=True)
test_loader = DataLoader(test_data, batch_size=64, shuffle=False)

# Step 2: Build the neural network
class DigitClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.network = nn.Sequential(
            nn.Flatten(),               # 28x28 image → 784 numbers
            nn.Linear(784, 256),        # First hidden layer
            nn.ReLU(),
            nn.Linear(256, 128),        # Second hidden layer
            nn.ReLU(),
            nn.Linear(128, 10)          # Output: 10 digits (0-9)
        )

    def forward(self, x):
        return self.network(x)

model = DigitClassifier()

# Step 3: Set up training
loss_fn = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

# Step 4: Train the model
for epoch in range(5):
    model.train()
    total_loss = 0
    correct = 0
    total = 0

    for images, labels in train_loader:
        # Forward pass
        predictions = model(images)
        loss = loss_fn(predictions, labels)

        # Backward pass
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        total_loss += loss.item()
        correct += (predictions.argmax(1) == labels).sum().item()
        total += labels.size(0)

    accuracy = 100 * correct / total
    print(f"Epoch {epoch+1}/5 | Loss: {total_loss:.2f} | Accuracy: {accuracy:.1f}%")

# Step 5: Test on unseen data
model.eval()
correct = 0
total = 0

with torch.no_grad():
    for images, labels in test_loader:
        predictions = model(images)
        correct += (predictions.argmax(1) == labels).sum().item()
        total += labels.size(0)

print(f"\nTest Accuracy: {100 * correct / total:.1f}%")
# Expected: ~97% accuracy!

# Step 6: Save the model (just like you will save ExamGuard models)
torch.save(model.state_dict(), 'digit_classifier.pth')
print("Model saved!")
```

### What You Will Learn From This Project:
- How to load and prepare image datasets
- How to build a neural network from scratch
- The complete training loop (forward → loss → backward → update)
- How to evaluate accuracy on test data
- How to save a trained model

### Connection to ExamGuard:
Replace "digits 0-9" with "cheating vs normal" and you have the same workflow ExamGuard uses. Same code structure, different data, different labels.

---

## Key Takeaway

PyTorch is not just a library — it is the foundation that every ExamGuard AI model is built on. Every frame analysis, every detection, every classification runs through PyTorch. Master the basics here, and everything in Phases 4 and 5 will click into place.
