FROM python:3.11-slim

# System dependencies for OpenCV, MediaPipe, and FFmpeg.
#
# `libgl1` is the actual OpenGL runtime library OpenCV needs.
# Previously this Dockerfile listed `libgl1-mesa-glx`, which was only
# ever a transitional metapackage that pointed at libgl1. Debian 13
# (trixie) — what `python:3.11-slim` ships on as of 2025 — dropped
# the transitional package entirely, breaking the build with
# "Package 'libgl1-mesa-glx' has no installation candidate".
# `libgl1` works on Debian 11 / 12 / 13 alike, so it's strictly
# better.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
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
