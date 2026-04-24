"""Backup script — run daily via cron (or Windows Task Scheduler).

What it does:
  1. `pg_dump` the confidence_detector_app database to a timestamped
     .sql.gz under ./backups/
  2. Archive backend/uploads/ and backend/recordings/ as tarballs under
     the same folder
  3. Prune backups older than 14 days so the backup folder doesn't
     grow forever

Usage:
  python scripts/backup.py                  # uses env vars from backend/.env
  python scripts/backup.py --out /mnt/bkp   # custom output folder
  python scripts/backup.py --keep-days 30   # custom retention

Requires `pg_dump` on PATH. On Windows install the PostgreSQL client
tools and add C:\\Program Files\\PostgreSQL\\<ver>\\bin\\ to PATH.

Intended to be run by the operator, NOT by the application. Do not
import anywhere.
"""
from __future__ import annotations

import argparse
import gzip
import os
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timedelta
from pathlib import Path

# Load backend/.env so DB_* variables are visible without a wrapper.
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
except ImportError:
    pass


def _timestamp() -> str:
    return datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")


def dump_database(out_dir: Path) -> Path:
    host = os.environ.get("DB_HOST", "localhost")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "confidence_detector_app")
    user = os.environ.get("DB_USER", "postgres")
    password = os.environ.get("DB_PASSWORD", "postgres")

    target = out_dir / f"db-{name}-{_timestamp()}.sql.gz"

    # pg_dump reads PGPASSWORD from env. Don't pass the password on the
    # command line (it would show up in `ps`).
    env = os.environ.copy()
    env["PGPASSWORD"] = password

    cmd = [
        "pg_dump",
        "-h", host, "-p", str(port),
        "-U", user, "-d", name,
        "--no-owner", "--no-privileges",
    ]
    print(f"[backup] pg_dump -> {target.name}")
    with gzip.open(target, "wb") as gz:
        proc = subprocess.run(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if proc.returncode != 0:
            target.unlink(missing_ok=True)
            raise RuntimeError(
                f"pg_dump failed (rc={proc.returncode}): "
                f"{proc.stderr.decode('utf-8', 'ignore').strip()}"
            )
        gz.write(proc.stdout)
    return target


def archive_dir(src: Path, out_dir: Path, label: str) -> Path | None:
    if not src.exists() or not any(src.iterdir()):
        print(f"[backup] skipping {label}: empty or missing ({src})")
        return None
    target = out_dir / f"{label}-{_timestamp()}.tar.gz"
    print(f"[backup] tar {src} -> {target.name}")
    with tarfile.open(target, "w:gz") as tf:
        tf.add(src, arcname=src.name)
    return target


def prune_old(out_dir: Path, keep_days: int) -> list[Path]:
    cutoff = datetime.utcnow() - timedelta(days=keep_days)
    removed: list[Path] = []
    for p in out_dir.iterdir():
        if not p.is_file():
            continue
        mtime = datetime.utcfromtimestamp(p.stat().st_mtime)
        if mtime < cutoff:
            p.unlink()
            removed.append(p)
    if removed:
        print(f"[backup] pruned {len(removed)} files older than {keep_days} days")
    return removed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--out",
        default=str(ROOT / "backups"),
        help="Output directory (default: ./backups)",
    )
    ap.add_argument(
        "--keep-days",
        type=int,
        default=14,
        help="Delete backups older than this many days (default: 14)",
    )
    ap.add_argument(
        "--skip-media",
        action="store_true",
        help="Only dump the DB; skip uploads/ and recordings/ tarballs",
    )
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not shutil.which("pg_dump"):
        print(
            "[backup] ERROR: pg_dump not found on PATH. Install the Postgres "
            "client tools and ensure pg_dump is reachable.",
            file=sys.stderr,
        )
        return 1

    try:
        dump_database(out_dir)
        if not args.skip_media:
            archive_dir(BACKEND / "uploads", out_dir, "uploads")
            archive_dir(BACKEND / "recordings", out_dir, "recordings")
        prune_old(out_dir, args.keep_days)
    except Exception as e:
        print(f"[backup] FAILED: {e}", file=sys.stderr)
        return 2
    print("[backup] done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
