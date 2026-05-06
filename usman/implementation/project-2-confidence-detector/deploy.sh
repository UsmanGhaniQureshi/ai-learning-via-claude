#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# deploy.sh — idempotent deploy script for the confidence-detector app.
#
# Run from the project subfolder root (where docker-compose.yml lives).
# Safe to run repeatedly — first deploy and every subsequent update use
# the same command.
#
# DATA SAFETY GUARANTEE
#   This script NEVER touches named Docker volumes. The following
#   data persists across every redeploy:
#     - postgres-data    (your database)
#     - uploads-data     (user uploads + processed videos)
#     - model-cache      (Whisper / MediaPipe weights)
#     - caddy-data       (Let's Encrypt certificates)
#     - caddy-config     (Caddy state)
#
#   The only command that wipes user data is `docker compose down -v`
#   (note the -v flag). This script does NOT use `down` at all.
#
# Workflow
#   1. (you) git pull origin deployment
#   2. (you) ./deploy.sh
#
# That's it.
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

# Always run from the script's own directory so `docker compose` finds
# the right compose file regardless of where the user invoked us from.
cd "$(dirname "$0")"

green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
red()   { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
note()  { printf '    %s\n' "$*"; }

# ── Pre-flight checks ───────────────────────────────────────────────
green "==> Pre-flight checks"

if [ ! -f docker-compose.yml ]; then
  red "ERROR: docker-compose.yml not found in $(pwd)"
  red "       cd to the project subfolder before running this script."
  exit 1
fi

if [ ! -f .env ]; then
  red "ERROR: .env not found in $(pwd)"
  red "       cp .env.production.example .env"
  red "       then nano .env to fill in JWT_SECRET, MEDIA_URL_SECRET, DB_PASSWORD."
  exit 1
fi

# Spot-check that the placeholder secrets have actually been replaced.
if grep -qE '^(JWT_SECRET|MEDIA_URL_SECRET|DB_PASSWORD)=__' .env; then
  red "ERROR: .env still contains placeholder values. Replace lines starting with __."
  exit 1
fi

note "compose file present"
note ".env present, no placeholders"

# ── Build images ────────────────────────────────────────────────────
green "==> Building images (slow on first run while Whisper / MediaPipe install)"
docker compose build

# ── Pull pinned images (postgres, caddy) ────────────────────────────
green "==> Pulling pinned images"
docker compose pull postgres caddy 2>/dev/null || true

# ── Bring up / restart the stack ────────────────────────────────────
# `up -d` only restarts containers whose image / config changed —
# unchanged services (e.g. postgres if its image didn't move) keep
# running and don't drop connections.
# `--remove-orphans` cleans up any container we no longer reference
# in compose.yml. It does NOT remove volumes.
green "==> Bringing the stack up"
docker compose up -d --remove-orphans

# ── Wait for postgres to accept connections ─────────────────────────
green "==> Waiting for postgres to be ready"
DB_USER=$(grep -E '^DB_USER=' .env | head -1 | cut -d= -f2)
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${DB_USER:-cd_app}" >/dev/null 2>&1; then
    note "postgres ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    red "ERROR: postgres did not become ready within 60s"
    red "       Check: docker compose logs postgres"
    exit 1
  fi
  sleep 2
done

# ── Run database migrations (idempotent — alembic skips applied) ────
green "==> Applying database migrations"
docker compose exec -T backend alembic upgrade head

# ── Health check ────────────────────────────────────────────────────
# Caddy needs ~30-60s on first deploy to negotiate Let's Encrypt
# certs. Subsequent deploys reuse the cached cert and pass instantly.
green "==> Health check"
sleep 5

# Parse the bare-domain line from Caddyfile (first line that starts
# with a lowercase letter and has a `{` — Caddy's site-block syntax).
DOMAIN=$(awk '/^[a-z][a-zA-Z0-9.-]+[[:space:]]*\{/ {print $1; exit}' Caddyfile)

if [ -z "${DOMAIN:-}" ]; then
  note "could not parse domain from Caddyfile — skipping HTTPS health check"
elif curl -sSf --max-time 10 "https://${DOMAIN}/health" >/dev/null 2>&1; then
  note "OK: https://${DOMAIN}/health is responding"
else
  note "NOT YET RESPONDING: https://${DOMAIN}/health"
  note "On first deploy, Caddy needs ~30-60s to negotiate Let's Encrypt certs."
  note "Watch progress with: docker compose logs -f caddy"
fi

# ── Done ────────────────────────────────────────────────────────────
green ""
green "==> Deploy complete"
note "Tail logs:    docker compose logs -f"
note "Stop stack:   docker compose stop          (data preserved)"
note "Start stack:  docker compose start         (resumes from last state)"
note "DANGEROUS:    docker compose down -v       (wipes ALL named volumes — your DB, uploads, etc.)"
