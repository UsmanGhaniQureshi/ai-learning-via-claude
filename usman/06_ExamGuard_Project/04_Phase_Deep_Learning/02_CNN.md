# CNN — Convolutional Neural Network (THE Image Model)

## What Is This?

A **Convolutional Neural Network (CNN)** is a special type of neural network designed specifically to understand images. While a regular neural network sees an image as a flat list of numbers, a CNN sees it as a 2D picture — just like your eyes do.

Think of it this way:
- Regular neural network = reading a book with all the words in one long line (confusing)
- CNN = reading a book with proper paragraphs and pages (makes sense)

CNNs are **the** standard model for any task involving images. If you are working with pictures or video, you are using a CNN.

---

## WHY This Is CORE to ExamGuard

**This is not optional. This is not "nice to have." CNN is the HEART of ExamGuard.**

Every single camera frame in your exam monitoring system goes through a CNN. Here is what happens:

```
Camera captures frame of exam hall
        |
        v
  CNN Layer 1: Detect edges (lines, curves)
        |
        v
  CNN Layer 2: Detect shapes (circles, rectangles)
        |
        v
  CNN Layer 3: Detect body parts (hands, heads, shoulders)
        |
        v
  CNN Layer 4: Detect behaviors (looking sideways, hand extended)
        |
        v
  OUTPUT: "Student looking at neighbor's paper" → CHEATING FLAG
```

Without CNN, ExamGuard is blind. It cannot see anything in the camera feeds.

---

## How CNN Works — Step by Step

### The Big Picture

```
Input Image (224x224 pixels)
    |
    v
[Convolution Layers] → Find patterns (edges, textures, shapes)
    |
    v
[Pooling Layers] → Shrink the data (keep important stuff, throw away noise)
    |
    v
[Fully Connected Layers] → Make the final decision
    |
    v
Output: "cheating" (87%) or "normal" (13%)
```

### Step 1: Convolution — Pattern Detection

A convolution is like sliding a magnifying glass over the image, looking for specific patterns.

```
Image (a small 5x5 section):          Filter (3x3, looking for vertical edge):
1  1  1  0  0                          1  0 -1
1  1  1  0  0                          1  0 -1
1  1  1  0  0                          1  0 -1
1  1  1  0  0
1  1  1  0  0

The filter slides across the image, multiplying and adding at each position.
Where it finds a vertical edge → HIGH number (strong match)
Where there is no edge → LOW number (weak match)
```

**ExamGuard connection:** Early filters detect edges of bodies, phones, papers. Later filters detect complex shapes like "hand holding a phone" or "head turned sideways."

### Step 2: Activation (ReLU) — Keep the Good Stuff

After convolution, we apply ReLU: if the value is negative, make it 0. If positive, keep it.

```
Before ReLU: [-2, 5, -1, 3, 0, -4, 8]
After ReLU:  [ 0, 5,  0, 3, 0,  0, 8]
```

This helps the network focus on what IS there, not what is NOT there.

### Step 3: Pooling — Shrink Without Losing Meaning

Max Pooling takes a small area and keeps only the highest value.

```
Before pooling (4x4):     After MaxPool 2x2 (2x2):
6  8  2  4                 8  4
3  1  5  7      →          3  9
2  3  1  9
4  0  6  2
```

**Why shrink?** A 1080p frame is 1920x1080 = 2 million pixels. Without pooling, the model would be impossibly slow. Pooling keeps the important features while making computation manageable.

**ExamGuard connection:** We need to process 30+ frames per second. Pooling makes the CNN fast enough for real-time monitoring.

### Step 4: Fully Connected — Make the Decision

After convolution and pooling extract features, the fully connected layers act like a traditional classifier:

```
Features extracted by CNN: [head_turned: 0.9, hand_extended: 0.7, eyes_sideways: 0.8]
        |
        v
Fully Connected Layer → Combines all features
        |
        v
Output: cheating = 0.87, normal = 0.13
```

---

## Key Numbers You Need to Know

### Filters (Number of Feature Detectors)
```python
nn.Conv2d(in_channels=3, out_channels=32, ...)
#                                     ^^
#                          32 different patterns to look for
```
- Layer 1: 32 filters (basic edges, colors)
- Layer 2: 64 filters (shapes, textures)
- Layer 3: 128 filters (complex patterns)

### Kernel Size (How Big the Magnifying Glass Is)
```python
nn.Conv2d(..., kernel_size=3)  # 3x3 filter — most common, good for details
nn.Conv2d(..., kernel_size=5)  # 5x5 filter — bigger patterns, less common
nn.Conv2d(..., kernel_size=7)  # 7x7 filter — only in first layer sometimes
```
**Rule of thumb:** Use 3x3 for almost everything. It is the standard.

### Stride (How Far the Filter Moves Each Step)
```python
nn.Conv2d(..., stride=1)  # Moves 1 pixel at a time — detailed but slow
nn.Conv2d(..., stride=2)  # Moves 2 pixels at a time — faster but less detail
```

### Padding (Handle the Edges)
```python
nn.Conv2d(..., padding=1)  # Adds border of zeros so output size = input size
nn.Conv2d(..., padding=0)  # No border, output shrinks each layer
```
**Rule of thumb:** Use `padding=1` with `kernel_size=3` to keep dimensions clean.

---

## ExamGuard CNN Architecture

Here is what a real ExamGuard behavior classifier CNN might look like:

```
INPUT: Exam frame (3 x 224 x 224) — color image, 224x224 pixels

Conv Block 1: 3 → 32 filters, 3x3    → ReLU → MaxPool    Output: 32 x 112 x 112
Conv Block 2: 32 → 64 filters, 3x3   → ReLU → MaxPool    Output: 64 x 56 x 56
Conv Block 3: 64 → 128 filters, 3x3  → ReLU → MaxPool    Output: 128 x 28 x 28
Conv Block 4: 128 → 256 filters, 3x3 → ReLU → MaxPool    Output: 256 x 14 x 14

Flatten: 256 x 14 x 14 = 50,176 numbers

Fully Connected 1: 50,176 → 512   → ReLU → Dropout(0.5)
Fully Connected 2: 512 → 2        → Softmax

OUTPUT: [cheating: 0.87, normal: 0.13]
```

---

## Building a CNN in PyTorch

```python
import torch
import torch.nn as nn

class ExamBehaviorCNN(nn.Module):
    def __init__(self):
        super().__init__()

        # Feature extraction layers (find patterns in images)
        self.features = nn.Sequential(
            # Block 1: Find edges and basic patterns
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),          # 224x224 → 112x112

            # Block 2: Find shapes
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),          # 112x112 → 56x56

            # Block 3: Find body parts and objects
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),          # 56x56 → 28x28
        )

        # Classification layers (make the decision)
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128 * 28 * 28, 512),
            nn.ReLU(),
            nn.Dropout(0.5),             # Prevent overfitting
            nn.Linear(512, 2)            # 2 classes: cheating, normal
        )

    def forward(self, x):
        x = self.features(x)
        x = self.classifier(x)
        return x

# Create the model
model = ExamBehaviorCNN()

# Test with a fake exam frame
fake_frame = torch.randn(1, 3, 224, 224)  # 1 image, 3 colors, 224x224
output = model(fake_frame)
print(output)  # tensor([[ 0.23, -0.15]])
# Apply softmax to get probabilities
probs = torch.softmax(output, dim=1)
print(f"Cheating: {probs[0][0]:.1%}, Normal: {probs[0][1]:.1%}")
```

---

## Mini Project: Cats vs Dogs Classifier

**Goal:** Build a CNN that looks at a photo and says "cat" or "dog."

**Why this specific project?** Because "cats vs dogs" transfers directly to "cheating vs normal" — same code, different labels.

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms
from torch.utils.data import DataLoader
import os

# Step 1: Prepare data
# Download a cats vs dogs dataset (or use torchvision.datasets)
# Organize folders like:
#   data/train/cats/   (1000 cat images)
#   data/train/dogs/   (1000 dog images)
#   data/test/cats/    (200 cat images)
#   data/test/dogs/    (200 dog images)

transform = transforms.Compose([
    transforms.Resize((224, 224)),       # All images same size
    transforms.ToTensor(),               # Convert to tensor
    transforms.Normalize([0.485, 0.456, 0.406],  # Standard normalization
                         [0.229, 0.224, 0.225])
])

train_data = datasets.ImageFolder('data/train', transform=transform)
test_data = datasets.ImageFolder('data/test', transform=transform)

train_loader = DataLoader(train_data, batch_size=32, shuffle=True)
test_loader = DataLoader(test_data, batch_size=32, shuffle=False)

print(f"Classes: {train_data.classes}")  # ['cats', 'dogs']
print(f"Training images: {len(train_data)}")
print(f"Test images: {len(test_data)}")

# Step 2: Build CNN (same structure as ExamGuard!)
class CatDogCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2, 2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2, 2),
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2, 2),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128 * 28 * 28, 512),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(512, 2)
        )

    def forward(self, x):
        return self.classifier(self.features(x))

model = CatDogCNN()
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)

# Step 3: Train
loss_fn = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

for epoch in range(10):
    model.train()
    running_loss = 0
    correct = 0
    total = 0

    for images, labels in train_loader:
        images, labels = images.to(device), labels.to(device)

        predictions = model(images)
        loss = loss_fn(predictions, labels)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        running_loss += loss.item()
        correct += (predictions.argmax(1) == labels).sum().item()
        total += labels.size(0)

    print(f"Epoch {epoch+1}/10 | Loss: {running_loss/len(train_loader):.4f} | "
          f"Accuracy: {100*correct/total:.1f}%")

# Step 4: Test
model.eval()
correct = 0
total = 0

with torch.no_grad():
    for images, labels in test_loader:
        images, labels = images.to(device), labels.to(device)
        predictions = model(images)
        correct += (predictions.argmax(1) == labels).sum().item()
        total += labels.size(0)

print(f"\nTest Accuracy: {100*correct/total:.1f}%")

# Step 5: Save the model
torch.save(model.state_dict(), 'cat_dog_cnn.pth')
```

### After This Project, You Will:
- Understand how CNNs see images layer by layer
- Know how to structure image data for training
- Be able to build a CNN from scratch in PyTorch
- Be ready to swap "cats/dogs" with "cheating/normal" for ExamGuard

---

## How This Becomes ExamGuard

| Cats vs Dogs Project | ExamGuard System |
|---------------------|-----------------|
| Cat images | "Cheating" frames from exam cameras |
| Dog images | "Normal" frames from exam cameras |
| CatDogCNN model | ExamBehaviorCNN model |
| "cat" or "dog" output | "cheating" or "normal" output |
| Run once on a photo | Run 30 times per second on live video |

The architecture is identical. The only difference is the data and the stakes.

---

## Key Takeaway

CNN is not just another model — it is THE model that makes ExamGuard possible. Every camera frame in every exam hall passes through a CNN. Without understanding CNNs, you cannot build, debug, or improve ExamGuard. This is the single most important model in your entire project.
