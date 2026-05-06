FROM python:3.11-slim

# System dependencies for OpenCV, MediaPipe, and FFmpeg.
#
# OpenGL stack required by MediaPipe's GPU-capable backends:
#   libgl1     — desktop OpenGL (libGL.so.1) for OpenCV image ops
#   libgles2   — OpenGL ES 2.0 (libGLESv2.so.2) for MediaPipe's
#                face_landmarker / pose_landmarker; without this,
#                the pipeline raises
#                "OSError: libGLESv2.so.2: cannot open shared object
#                 file" at FaceEngine init and the upload pipeline
#                hangs silently
#   libegl1    — EGL (libEGL.so.1), required to bind the GLES
#                context. Sister-library to libgles2; missing it
#                produces a similar OSError on first frame.
#
# Note on history: this file previously listed `libgl1-mesa-glx`,
# which was a Debian 11/12 transitional metapackage. Debian 13
# (trixie — what `python:3.11-slim` now ships on) dropped that
# alias entirely, so we use the canonical package names instead.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libgles2 \
    libegl1 \
    libglib2.0-0 \
    ffmpeg \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Download models if not present
COPY scripts/download_models.sh /app/scripts/
RUN chmod +x /app/scripts/download_models.sh && bash /app/scripts/download_models.sh /app

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 8000

# --workers 4 matches a 4-core VPS (one worker per core). Each worker
# loads its own Whisper + MediaPipe model (~250 MB RSS each) so size
# this against your box's RAM as well as core count. Tune via the
# UVICORN_WORKERS env if you want to override at runtime.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-4}"]
