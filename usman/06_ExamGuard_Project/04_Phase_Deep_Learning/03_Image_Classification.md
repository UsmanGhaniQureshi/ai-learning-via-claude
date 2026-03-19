# Image Classification — Teaching AI to Categorize What It Sees

## What Is This?

Image classification is the task of training a model to look at an image and say **what category it belongs to**.

You do this every day without thinking:
- You see a cat → your brain says "cat"
- You see a car → your brain says "car"
- You see a student looking at their neighbor's paper → your brain says "cheating"

Image classification teaches a computer to do the same thing. You show it thousands of labeled examples, and it learns the patterns.

---

## WHY This Matters for ExamGuard

ExamGuard's core job is classification. Every single frame from every camera needs to be classified:

```
Frame from Camera 2, Seat 15, 10:23:45 AM
        |
        v
 Image Classification Model
        |
        v
 "CHEATING" (confidence: 87%)
        |
        v
 Alert sent to supervisor
```

This is not a "nice feature." This IS ExamGuard. The entire system is an image classification pipeline running on live video.

### What ExamGuard Needs to Classify:

| Input | Output Categories | Confidence Needed |
|-------|------------------|-------------------|
| Student behavior frame | Normal / Suspicious / Cheating | 90%+ for cheating alert |
| Detected object crop | Phone / Chit / Earpiece / Harmless | 85%+ for object alert |
| Face crop | Registered student / Unknown person | 95%+ for identity match |
| Gaze direction | Own paper / Neighbor / Room / Phone | 80%+ for gaze tracking |

---

## The Complete Image Classification Pipeline

This is the exact workflow you will follow for ExamGuard:

```
Step 1: COLLECT IMAGES
    Record exam footage → Extract frames → 10,000+ frames needed

Step 2: LABEL THEM
    Human reviews each frame → Tags as "cheating" or "normal"
    This is tedious but CRITICAL — garbage labels = garbage model

Step 3: PREPROCESS
    Resize all to 224x224 → Normalize pixel values → Split 80/10/10

Step 4: TRAIN CNN
    Feed batches through model → Calculate loss → Update weights → Repeat

Step 5: EVALUATE
    Test on unseen images → Check accuracy, precision, recall
    Need 90%+ accuracy and LOW false positives

Step 6: DEPLOY
    Save model → Load in ExamGuard → Process live frames
```

---

## Step-by-Step Breakdown

### Step 1: Collect Images

For ExamGuard, you need frames from exam cameras showing different behaviors:

```
data/
  cheating/
    frame_0001.jpg    (student looking at neighbor)
    frame_0002.jpg    (student with phone under desk)
    frame_0003.jpg    (passing chit to neighbor)
    ...
    frame_5000.jpg
  normal/
    frame_0001.jpg    (student writing on own paper)
    frame_0002.jpg    (student thinking, looking up)
    frame_0003.jpg    (student reading question paper)
    ...
    frame_5000.jpg
```

**How many images?**
- Minimum viable: 1,000 per category (2,000 total)
- Good: 5,000 per category (10,000 total)
- Great: 10,000+ per category (20,000+ total)
- With data augmentation (next lesson): multiply all by 5x

### Step 2: Label Them

```python
# Images in folders ARE the labels!
# PyTorch's ImageFolder reads folder names as class labels:

from torchvision import datasets

data = datasets.ImageFolder('data/')
print(data.classes)        # ['cheating', 'normal']
print(data.class_to_idx)   # {'cheating': 0, 'normal': 1}
```

**ExamGuard labeling challenge:** Some frames are ambiguous. Is a student looking up "thinking" (normal) or "looking at the board to copy" (cheating)? You need clear labeling guidelines.

### Step 3: Preprocess

```python
from torchvision import transforms

# Every image gets the same treatment:
transform = transforms.Compose([
    transforms.Resize((224, 224)),           # Same size for all
    transforms.ToTensor(),                    # Pixels 0-255 → 0.0-1.0
    transforms.Normalize(                     # Standard normalization
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])
```

**Why 224x224?** Most pre-trained models expect this size. It is a good balance between detail and speed.

**Split the data:**
```
Total: 10,000 images
  Training:   8,000 (80%) — model learns from these
  Validation: 1,000 (10%) — tune hyperparameters
  Testing:    1,000 (10%) — final accuracy check (NEVER train on these)
```

### Step 4: Train

```python
from torch.utils.data import DataLoader, random_split

# Split dataset
train_size = int(0.8 * len(dataset))
val_size = int(0.1 * len(dataset))
test_size = len(dataset) - train_size - val_size

train_data, val_data, test_data = random_split(dataset, [train_size, val_size, test_size])

# Create data loaders (feeds batches to model)
train_loader = DataLoader(train_data, batch_size=32, shuffle=True)
val_loader = DataLoader(val_data, batch_size=32, shuffle=False)
test_loader = DataLoader(test_data, batch_size=32, shuffle=False)
```

**Batch size 32** means the model sees 32 images at a time. Too small = slow. Too big = runs out of GPU memory.

### Step 5: The Training Loop

```python
import torch
import torch.nn as nn
import torch.optim as optim

model = ExamBehaviorCNN()  # From the CNN lesson
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)

loss_fn = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

best_val_accuracy = 0

for epoch in range(20):
    # --- TRAINING ---
    model.train()
    train_loss = 0
    train_correct = 0

    for images, labels in train_loader:
        images, labels = images.to(device), labels.to(device)

        predictions = model(images)
        loss = loss_fn(predictions, labels)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        train_loss += loss.item()
        train_correct += (predictions.argmax(1) == labels).sum().item()

    train_acc = 100 * train_correct / len(train_data)

    # --- VALIDATION ---
    model.eval()
    val_correct = 0

    with torch.no_grad():
        for images, labels in val_loader:
            images, labels = images.to(device), labels.to(device)
            predictions = model(images)
            val_correct += (predictions.argmax(1) == labels).sum().item()

    val_acc = 100 * val_correct / len(val_data)

    print(f"Epoch {epoch+1}/20 | Train Acc: {train_acc:.1f}% | Val Acc: {val_acc:.1f}%")

    # --- SAVE BEST MODEL ---
    if val_acc > best_val_accuracy:
        best_val_accuracy = val_acc
        torch.save(model.state_dict(), 'best_exam_model.pth')
        print(f"  *** New best model saved! Val accuracy: {val_acc:.1f}% ***")
```

### Step 6: Evaluate and Save

```python
# Load best model
model.load_state_dict(torch.load('best_exam_model.pth'))
model.eval()

# Test on completely unseen data
test_correct = 0
total = 0
all_predictions = []
all_labels = []

with torch.no_grad():
    for images, labels in test_loader:
        images, labels = images.to(device), labels.to(device)
        predictions = model(images)

        test_correct += (predictions.argmax(1) == labels).sum().item()
        total += labels.size(0)

        all_predictions.extend(predictions.argmax(1).cpu().numpy())
        all_labels.extend(labels.cpu().numpy())

print(f"Final Test Accuracy: {100 * test_correct / total:.1f}%")

# Detailed metrics
from sklearn.metrics import classification_report
print(classification_report(all_labels, all_predictions,
                            target_names=['cheating', 'normal']))
```

**ExamGuard accuracy targets:**
- Overall accuracy: 90%+
- Cheating recall: 95%+ (catch almost ALL cheaters)
- Normal precision: 95%+ (do not falsely accuse innocent students)

---

## Common Problems and Solutions

| Problem | Symptom | Solution |
|---------|---------|----------|
| Overfitting | Train accuracy 99%, test accuracy 60% | Add dropout, get more data, use augmentation |
| Underfitting | Train accuracy 55%, test accuracy 52% | Use bigger model, train longer, lower learning rate |
| Class imbalance | 9000 normal, 1000 cheating | Oversample cheating, use weighted loss function |
| Bad labels | Accuracy plateaus at 70% | Review and clean up labels |

---

## Mini Project: Exam Behavior Classifier (3 Categories)

**Goal:** Classify exam behavior images into: Normal, Suspicious, Cheating.

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms
from torch.utils.data import DataLoader, random_split

# Data structure:
# exam_data/
#   normal/        (student writing, reading, thinking)
#   suspicious/    (looking around briefly, stretching toward neighbor)
#   cheating/      (phone out, passing note, copying from neighbor)

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

dataset = datasets.ImageFolder('exam_data/', transform=transform)
print(f"Classes: {dataset.classes}")       # ['cheating', 'normal', 'suspicious']
print(f"Total images: {len(dataset)}")

# Split
train_size = int(0.8 * len(dataset))
test_size = len(dataset) - train_size
train_data, test_data = random_split(dataset, [train_size, test_size])

train_loader = DataLoader(train_data, batch_size=32, shuffle=True)
test_loader = DataLoader(test_data, batch_size=32, shuffle=False)

# Model — note the output is 3 classes now, not 2!
class ExamClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(128, 256, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(256 * 14 * 14, 512),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(512, 3)    # 3 classes: normal, suspicious, cheating
        )

    def forward(self, x):
        return self.classifier(self.features(x))

model = ExamClassifier()
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)

loss_fn = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

# Train
for epoch in range(15):
    model.train()
    correct = 0
    total = 0

    for images, labels in train_loader:
        images, labels = images.to(device), labels.to(device)
        preds = model(images)
        loss = loss_fn(preds, labels)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        correct += (preds.argmax(1) == labels).sum().item()
        total += labels.size(0)

    print(f"Epoch {epoch+1}/15 | Train Accuracy: {100*correct/total:.1f}%")

# Test
model.eval()
correct = 0
total = 0

with torch.no_grad():
    for images, labels in test_loader:
        images, labels = images.to(device), labels.to(device)
        preds = model(images)
        correct += (preds.argmax(1) == labels).sum().item()
        total += labels.size(0)

print(f"\nTest Accuracy: {100*correct/total:.1f}%")
torch.save(model.state_dict(), 'exam_classifier_3class.pth')
```

### Why 3 Categories Instead of 2?

In real ExamGuard:
- **Normal (no alert):** Student writing, reading, thinking
- **Suspicious (soft alert):** Looking around briefly, leaning toward neighbor — supervisor gets a yellow flag
- **Cheating (hard alert):** Phone visible, passing notes, clearly copying — supervisor gets a red flag with evidence clip

This 3-tier system reduces false positives. A brief glance around is suspicious, not cheating. Only sustained or clear violations trigger the full alert.

---

## Key Takeaway

Image classification is the fundamental task of ExamGuard. You collect exam frames, label them, train a CNN to classify them, and deploy it on live video. The pipeline you learn here is the exact pipeline you will use in the real system. Master this, and you have mastered ExamGuard's core intelligence.
