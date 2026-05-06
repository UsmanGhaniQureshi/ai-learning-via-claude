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
# WHAT THE SCRIPT DOES (in order)
#   1. Pre-flight: confirms compose file + .env exist + .env has no
#      placeholder values left.
#   2. Builds backend + frontend images.
#   3. Pulls pinned postgres + caddy images.
#   4. Brings the stack up (`up -d --remove-orphans`).
#   5. Waits for postgres to accept connections.
#   6. Runs `alembic upgrade head` to apply any pending migrations.
#   7. SELF-DIAGNOSES the deploy:
#        a. Hashes key source files on disk vs inside the running
#           container. If they differ, Docker's build cache served a
#           stale layer — force a `--no-cache` rebuild + recreate +
#           re-migrate. Recovers from the "container has old code"
#           failure mode that's bitten this deploy in the past.
#        b. Probes the DB for expected columns. If a column is
#           missing, re-runs the migration. Recovers from "alembic
#           silently failed but the script kept going" failure modes.
#   8. Hits /health to confirm Caddy + the backend are responding.
#
# Workflow
#   1. (you) git pull origin deployment
#   2. (you) ./deploy.sh
#
# Override knobs
#   FORCE_REBUILD=1 ./deploy.sh    skip the cache, do a full --no-cache
#                                  rebuild from scratch (~5-10 min)
#   SKIP_HEALTH=1 ./deploy.sh      don't curl /health at the end
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

# Always run from the script's own directory so `docker compose` finds
# the right compose file regardless of where the user invoked us from.
cd "$(dirname "$0")"

green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
red()   { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
note()  { printf '    %s\n' "$*"; }

FORCE_REBUILD="${FORCE_REBUILD:-0}"
SKIP_HEALTH="${SKIP_HEALTH:-0}"

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

# Postgres credentials are NOT parsed here in bash. Compose reads
# `.env` with its own parser (which correctly strips inline `#`
# comments when whitespace precedes the `#`) and exports them to
# the postgres container as `$POSTGRES_USER` / `$POSTGRES_DB`.
# Every `psql` / `pg_isready` call below runs INSIDE that container
# so it picks up those vars directly — no host-side bash parsing
# of `.env` to get wrong.

note "compose file present"
note ".env present, no placeholders"

# ── Build images ────────────────────────────────────────────────────
BUILD_FLAGS=""
if [ "$FORCE_REBUILD" = "1" ]; then
  green "==> Building images (FORCE_REBUILD=1, --no-cache)"
  BUILD_FLAGS="--no-cache"
else
  green "==> Building images (slow on first run while Whisper / MediaPipe install)"
fi
docker compose build $BUILD_FLAGS

# ── Pull pinned images (postgres, caddy) ────────────────────────────
green "==> Pulling pinned images"
docker compose pull postgres caddy 2>/dev/null || true

# ── Bring up / restart the stack ────────────────────────────────────
# `--force-recreate` ALWAYS recreates the backend + frontend containers
# from the freshly-built images, even if Compose thinks the image
# hash didn't change. Defensive: protects against the failure mode
# where Docker's BuildKit reuses a cached layer that yields an
# image with the same hash, so plain `up -d` thinks nothing changed
# and the running container keeps the old code. Postgres + caddy
# don't get force-recreated because they're pinned images and
# recreating them costs a few seconds for no reason.
# `--remove-orphans` cleans up any container we no longer reference
# in compose.yml. It does NOT remove volumes.
green "==> Bringing the stack up (force-recreate backend + frontend)"
docker compose up -d --remove-orphans \
    --force-recreate --no-deps backend frontend
docker compose up -d --remove-orphans   # ensure postgres + caddy are also up

# ── Wait for postgres to accept connections ─────────────────────────
green "==> Waiting for postgres to be ready"
for i in $(seq 1 30); do
  if docker compose exec -T postgres bash -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
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

# ── Run database migrations ─────────────────────────────────────────
green "==> Applying database migrations"
docker compose exec -T backend alembic upgrade head

# ── SELF-DIAGNOSE: container source vs on-disk source ───────────────
# Hash a few canary files inside the running container and compare
# to the on-disk versions. If they differ, Docker's BuildKit layer
# cache served a stale `COPY backend/ .` layer (a real failure mode
# we've hit). Recover by forcing a --no-cache rebuild of just the
# backend (frontend changes are picked up reliably; backend is the
# one that's bitten us).
green "==> Verifying container source matches on-disk source"
NEED_FORCE_REBUILD=0
for f in main.py models/media.py; do
  LOCAL_HASH=$(sha256sum "backend/$f" | cut -d' ' -f1)
  # `2>/dev/null || true` so a missing file in the container is treated
  # as "mismatch" (instead of failing the whole script).
  CONTAINER_HASH=$(docker compose exec -T backend sha256sum "$f" 2>/dev/null | cut -d' ' -f1 || echo "")
  if [ -z "$CONTAINER_HASH" ]; then
    note "MISMATCH: $f is missing from the container"
    NEED_FORCE_REBUILD=1
  elif [ "$LOCAL_HASH" != "$CONTAINER_HASH" ]; then
    note "MISMATCH: $f differs between host and container"
    note "  host:      $LOCAL_HASH"
    note "  container: $CONTAINER_HASH"
    NEED_FORCE_REBUILD=1
  else
    note "OK: $f"
  fi
done

if [ "$NEED_FORCE_REBUILD" = "1" ] && [ "$FORCE_REBUILD" != "1" ]; then
  red "Container source is stale despite the build step — forcing --no-cache rebuild of backend"
  note "(This usually means Docker's layer cache picked up a stale COPY layer.)"
  docker compose build --no-cache backend
  docker compose up -d --force-recreate backend
  # Backend container restarts; give it a beat before re-running migrations.
  sleep 3
  for i in $(seq 1 15); do
    if docker compose exec -T backend python -c "import sys" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  green "==> Re-applying migrations after rebuild"
  docker compose exec -T backend alembic upgrade head
elif [ "$NEED_FORCE_REBUILD" = "1" ]; then
  red "FORCE_REBUILD=1 already set, container is still stale — manual investigation needed."
  red "  Try: docker system prune -af  (DANGEROUS — wipes ALL caches; safe but slow next build)"
  exit 1
fi

# ── SELF-DIAGNOSE: DB schema has expected columns ───────────────────
# Probe Postgres for one column added by recent migrations. If it's
# missing, the migration silently failed earlier (or the row caches
# fooled us). Re-run it. This is cheap and idempotent — alembic skips
# already-applied migrations.
green "==> Verifying DB schema"
# Run psql INSIDE the postgres container so it picks up
# `$POSTGRES_USER` / `$POSTGRES_DB` from the env Compose set on it.
# Avoids host-side bash parsing of `.env` (which mishandled inline
# `#` comments and produced a false "column missing" alarm).
PROBE_PROCESSING_PROGRESS='psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='\''media'\'' AND column_name='\''processing_progress'\''"'
HAS_PROCESSING_PROGRESS=$(
  docker compose exec -T postgres bash -c "$PROBE_PROCESSING_PROGRESS" \
    2>/dev/null | tr -d '[:space:]' || echo ""
)
if [ "$HAS_PROCESSING_PROGRESS" != "1" ]; then
  red "WARNING: media.processing_progress column missing from DB"
  note "Re-running alembic upgrade head"
  docker compose exec -T backend alembic upgrade head
  # Re-probe — if it's still missing, fail loudly.
  HAS_PROCESSING_PROGRESS=$(
    docker compose exec -T postgres bash -c "$PROBE_PROCESSING_PROGRESS" \
      2>/dev/null | tr -d '[:space:]' || echo ""
  )
  if [ "$HAS_PROCESSING_PROGRESS" != "1" ]; then
    red "ERROR: column STILL missing after re-running migrations."
    red "       Check: docker compose exec backend alembic current"
    red "              docker compose exec backend alembic history"
    exit 1
  fi
fi
note "OK: media.processing_progress column present"

# ── Health check ────────────────────────────────────────────────────
# Caddy needs ~30-60s on first deploy to negotiate Let's Encrypt
# certs. Subsequent deploys reuse the cached cert and pass instantly.
if [ "$SKIP_HEALTH" = "1" ]; then
  note "SKIP_HEALTH=1 — skipping /health curl"
else
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
fi

# ── Done ────────────────────────────────────────────────────────────
green ""
green "==> Deploy complete"
note "Tail logs:        docker compose logs -f"
note "Backend logs:     docker compose logs -f backend"
note "Stop stack:       docker compose stop          (data preserved)"
note "Start stack:      docker compose start         (resumes from last state)"
note "Force fresh:      FORCE_REBUILD=1 ./deploy.sh  (--no-cache rebuild)"
note "DANGEROUS:        docker compose down -v       (wipes ALL named volumes)"
