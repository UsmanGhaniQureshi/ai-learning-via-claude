# Step 0: Setup — Development Environment

## What are we setting up and WHY?

| Thing | What it is | Why we need it |
|-------|-----------|----------------|
| **Virtual Environment** | A separate Python folder just for ExamGuard | Keeps our packages isolated. No conflicts with other projects. |
| **requirements.txt** | A list of all packages we need | One command installs everything. Friends can set up instantly. |
| **ultralytics** | Contains YOLO — detects objects in images | This IS our phone detector. Pre-trained on millions of images. |
| **opencv-python** | Opens cameras, reads images, shows video | We need it to grab frames from your webcam. |
| **jupyter + notebook** | Interactive coding environment | Run code piece by piece, see results instantly. |
| **matplotlib** | Displays images and charts | Shows detection results inside the notebook. |

---

## Step-by-Step Setup

### 1. Open VS Code Terminal

Press **Ctrl+`** (backtick) to open the terminal in VS Code.

### 2. Navigate to the implementation folder

```
cd "d:\AI Learning\usman\implementation"
```

### 3. Create a Virtual Environment

```
python -m venv examguard_env
```

**What this does:** Creates a folder called `examguard_env` containing a fresh Python installation. All packages we install will go HERE, not into your global Python.

### 4. Activate the Virtual Environment

```
examguard_env\Scripts\activate
```

**What this does:** Tells your terminal "from now on, use the ExamGuard Python, not the global one." You'll see `(examguard_env)` appear at the start of your terminal line — that means it's active.

### 5. Install all packages

```
pip install -r requirements.txt
```

**What this does:** Reads `requirements.txt` and installs every package listed. One command, everything installed.

### 6. Verify everything works

```
python -c "from ultralytics import YOLO; print('YOLO: OK')"
python -c "import cv2; print('OpenCV: OK')"
python -c "import jupyter; print('Jupyter: OK')"
```

You should see:
```
YOLO: OK
OpenCV: OK
Jupyter: OK
```

---

## For Your Friends (or Future You)

When someone clones this project from GitHub, they just run:

```
cd implementation
python -m venv examguard_env
examguard_env\Scripts\activate
pip install -r requirements.txt
```

4 commands and they're ready to go. No guessing which packages to install.

---

## Virtual Environment Quick Reference

| Command | What it does |
|---------|-------------|
| `python -m venv examguard_env` | Create the environment (once) |
| `examguard_env\Scripts\activate` | Activate it (every time you open terminal) |
| `deactivate` | Exit the environment |
| `pip install -r requirements.txt` | Install all packages |
| `pip freeze > requirements.txt` | Save current packages to file (when you add new ones) |

---

## Important Notes

- **Always activate** the environment before working: `examguard_env\Scripts\activate`
- If you see `(examguard_env)` in your terminal = you're in the right environment
- If you DON'T see it = you're using global Python, activate first!
- The `examguard_env` folder is NOT uploaded to GitHub (we'll add it to `.gitignore`)

---

## Next Step

After setup is complete → open `01_test_yolo.md` and `01_test_yolo.ipynb`
