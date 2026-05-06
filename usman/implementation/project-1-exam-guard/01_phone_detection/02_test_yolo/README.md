# Step 1: Test YOLO — Can It Detect a Phone?

## What we're doing

YOLO is a pre-trained model that already knows how to detect 80 objects (phone, person, laptop, chair, etc.). We're going to:

1. Load YOLO
2. Give it a photo
3. See if it detects a phone

We're NOT training anything. We're just TESTING the pre-trained model. This is the "10-photo test" from our theory.

## How to run

1. Open your terminal in VS Code
2. Navigate to this folder: `cd "d:/AI Learning/usman/implementation/01_phone_detection"`
3. Run: `jupyter notebook`
4. Your browser will open with a file list
5. Click on `01_test_yolo.ipynb` to open the notebook
6. Run each cell one by one with **Shift+Enter**

## What each cell does

### Cell 1: Import YOLO
Loads the YOLO library into memory. Like opening a toolbox.

### Cell 2: Load the model
Downloads the pre-trained YOLO model (first time only, ~6MB). This model was trained by Ultralytics on millions of images. It already knows what a phone looks like.

### Cell 3: Test on a sample image
We use your webcam to take one photo and ask YOLO: "What do you see?"

### Cell 4: Show results
Displays the image with boxes drawn around detected objects. Each box shows:
- What the object is (e.g., "cell phone")
- How confident YOLO is (e.g., 87%)

## What to look for

- Does YOLO detect your phone? If yes → it works for our use case!
- What confidence percentage? Above 70% = good
- Does it detect other things too? (person, laptop, chair) — that's normal, YOLO detects 80 objects
- Does it miss the phone? Try different angles/lighting

## Next step

After this works → `02_webcam_live.md` (run YOLO on live webcam feed)
