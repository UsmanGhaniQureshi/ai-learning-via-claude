#!/bin/bash
# Download models for Confidence Detector
# Usage: bash scripts/download_models.sh [target_dir]
# Models are downloaded only if not already present.

TARGET_DIR="${1:-.}"

echo "=== Confidence Detector — Model Download ==="
echo "Target directory: $TARGET_DIR"

# MediaPipe Face Landmarker
FACE_MODEL="$TARGET_DIR/face_landmarker.task"
if [ ! -f "$FACE_MODEL" ]; then
    echo "Downloading MediaPipe Face Landmarker..."
    wget -q -O "$FACE_MODEL" \
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
    echo "  -> face_landmarker.task downloaded"
else
    echo "  -> face_landmarker.task already exists"
fi

# MediaPipe Pose Landmarker
POSE_MODEL="$TARGET_DIR/pose_landmarker.task"
if [ ! -f "$POSE_MODEL" ]; then
    echo "Downloading MediaPipe Pose Landmarker..."
    wget -q -O "$POSE_MODEL" \
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
    echo "  -> pose_landmarker.task downloaded"
else
    echo "  -> pose_landmarker.task already exists"
fi

# Vosk Speech Model (small English)
VOSK_DIR="$TARGET_DIR/vosk-model"
if [ ! -d "$VOSK_DIR" ]; then
    echo "Downloading Vosk small English model..."
    VOSK_ZIP="/tmp/vosk-model-small-en-us-0.15.zip"
    wget -q -O "$VOSK_ZIP" \
        "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
    unzip -q "$VOSK_ZIP" -d "$TARGET_DIR"
    mv "$TARGET_DIR/vosk-model-small-en-us-0.15" "$VOSK_DIR"
    rm -f "$VOSK_ZIP"
    echo "  -> vosk-model downloaded and extracted"
else
    echo "  -> vosk-model already exists"
fi

echo "=== All models ready ==="
