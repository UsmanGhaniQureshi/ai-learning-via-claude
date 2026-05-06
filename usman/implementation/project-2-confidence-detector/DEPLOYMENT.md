# Deploying to a Contabo VPS

End-to-end runbook for `confidence-detector.logicsbay.com` on
Ubuntu 22.04 / 24.04. Strictly linear: do the steps in order, no
skipping around.

**You'll need:**

- A Contabo VPS (recommended: VPS M shared — 6 vCPU / 16 GB RAM)
- Its IPv4 address (from the Contabo control panel)
- SSH credentials Contabo emailed at provisioning
- Control of `logicsbay.com` DNS (to add the subdomain A record)
- A GitHub Personal Access Token if the repo is private

**First-time deploy: ~20 min. Subsequent updates: ~1-2 min via `./deploy.sh`.**

> ## Data safety guarantee
>
> The `deploy.sh` script and every command in the **Updates** section
> below **never touch named Docker volumes**. Across every redeploy:
>
> | Volume | What's in it |
> |---|---|
> | `confidence-detector_postgres-data` | Your database (users, sessions, reports) |
> | `confidence-detector_uploads-data` | User uploads + processed videos |
> | `confidence-detector_model-cache` | Whisper / MediaPipe weights (~200 MB) |
> | `confidence-detector_caddy-data` | Let's Encrypt TLS certs |
> | `confidence-detector_caddy-config` | Caddy state |
>
> The **only** command that wipes user data is `docker compose down -v`
> (the `-v` removes volumes). It's flagged in red below and not in
> any normal workflow.

---

## 1. Install Docker on the VPS (~5 min)

SSH in (Contabo's default image lets you run as root, which the
Docker install instructions below assume):

```bash
ssh root@<your-vps-ip>
```

Install Docker + Docker Compose:

```bash
apt update
apt install -y ca-certificates curl gnupg lsb-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
```

Verify:

```bash
docker run --rm hello-world      # should print "Hello from Docker!"
docker compose version            # 2.x
```

**While the build runs, do step 2 in another tab — DNS propagation is slow.**

---

## 2. Point DNS at the VPS (~2 min, can run in parallel)

In your `logicsbay.com` registrar's control panel, add an **A record
specifically for the subdomain** — subdomains do NOT inherit A
records from the apex:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `confidence-detector` | `<your-vps-ip>` | 300 |

Verify from your laptop (not the VPS) once propagation kicks in:

```bash
dig +short confidence-detector.logicsbay.com   # should return your VPS IP
```

Don't continue past step 4 until this resolves correctly — Caddy's
auto-HTTPS depends on it.

---

## 3. Clone the repo (~1 min)

The deployable app lives at `usman/implementation/project-2-confidence-detector/`
inside the repo, not at the repo root. The flow below `cd`s straight
into that subfolder and stays there.

```bash
cd ~

# Public repo:
git clone <your-repo-url> confidence-detector

# OR private repo via Personal Access Token (Settings → Developer
# settings → Personal access tokens → Fine-grained, scope:
# "Contents: read" on this repo only, 90-day expiry):
git clone https://<your-username>:<your-pat>@github.com/<owner>/<repo>.git confidence-detector

cd confidence-detector/usman/implementation/project-2-confidence-detector
```

Optional convenience alias (saves typing the long path on every reconnect):

```bash
echo "alias cdapp='cd ~/confidence-detector/usman/implementation/project-2-confidence-detector'" >> ~/.bashrc
source ~/.bashrc
```

---

## 4. Switch to the `deployment` branch + pull latest (~10 sec)

```bash
git checkout deployment
git pull origin deployment
```

Sanity check — you should see the deploy artifacts:

```bash
ls Caddyfile docker-compose.yml deploy.sh .env.production.example
```

The `Caddyfile` on this branch is already pinned to
`confidence-detector.logicsbay.com` — no editing required unless
you're redeploying somewhere else.

---

## 5. Configure `.env` (~2 min)

Copy the template:

```bash
cp .env.production.example .env
```

Generate two random secrets — copy each into the right slot in `.env`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # → JWT_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # → MEDIA_URL_SECRET
```

Open `.env` and fill in **at minimum**:

```bash
nano .env
```

```
ENV=production
COMPOSE_PROJECT_NAME=confidence-detector   # leave as-is
JWT_SECRET=<first-random-secret-from-above>
MEDIA_URL_SECRET=<second-random-secret-from-above>

DB_HOST=postgres                       # leave as-is
DB_PORT=5432
DB_NAME=confidence_detector_app
DB_USER=cd_app
DB_PASSWORD=<pick-a-strong-password>

# CPU-realistic tuning for VPS M shared (6 vCPU, 16 GB RAM):
WHISPER_MODEL=base.en                  # ~2× faster Whisper, negligible accuracy loss
MAX_LIVE_SESSIONS=12                   # CPU-realistic for 6 vCPU
UVICORN_WORKERS=4
DB_POOL_SIZE=50
DB_POOL_MAX_OVERFLOW=100
```

Optional: `GEMINI_API_KEY=<your-key>` for Gemini-powered coaching tips.

Save (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

`.env` is in `.gitignore` — never commit the filled-in version.

---

## 6. Run `./deploy.sh` (~10-15 min on first run; ~1-2 min thereafter)

```bash
./deploy.sh
```

The script:

1. Verifies `docker-compose.yml` and `.env` are present and `.env`
   has no placeholder values left.
2. Builds the backend + frontend images (slow on first run because
   Whisper + MediaPipe install).
3. Pulls the pinned `postgres` and `caddy` images.
4. Brings the stack up with `docker compose up -d --remove-orphans`.
5. Waits for postgres to accept connections.
6. Runs `alembic upgrade head` to apply any pending DB migrations.
7. Hits `https://confidence-detector.logicsbay.com/health` to confirm
   Caddy + the backend are responding.

If the final health check says "NOT YET RESPONDING", that's normal
on first run — Caddy is still negotiating Let's Encrypt certs. Wait
60 seconds and re-run `./deploy.sh` (it's idempotent), or watch
progress with `docker compose logs -f caddy`.

---

## 7. Verify in a browser

Open `https://confidence-detector.logicsbay.com` in your laptop's
browser. You should see the login screen with a green-padlock TLS
cert. Register, log in, and try a live practice session — the
browser will ask for mic + camera permission (only granted over
HTTPS, which is why we did all this).

---

## 8. Set up a daily cleanup cron (~1 min, optional)

Without this, user uploads accumulate forever. Purge anything older
than 30 days:

```bash
crontab -e
```

Append:

```
0 3 * * *  find /var/lib/docker/volumes/confidence-detector_uploads-data/_data -type f -mtime +30 -delete
```

This affects only files inside the uploads volume; the database,
certs, and model cache are untouched.

---

# Updates

When you ship a new commit to the `deployment` branch:

```bash
cd ~/confidence-detector/usman/implementation/project-2-confidence-detector
git pull origin deployment
./deploy.sh
```

That's it. The script is idempotent — only changed images rebuild,
unchanged services keep running, the DB and uploads survive.

---

# Troubleshooting

### Caddy says "could not get certificate"

- DNS not propagated: `dig +short confidence-detector.logicsbay.com` must return your VPS IP from your laptop
- Ports blocked: if you've enabled `ufw`, run `ufw allow 80,443/tcp`
- Hit Let's Encrypt rate limits (5 cert requests per domain per week): wait 1 hour and retry

### Backend exits at startup with "JWT_SECRET must be set"

`.env` is missing or has placeholder values. Re-check step 5.

### "We didn't pick up any audio in this recording"

The user's mic was actually silent, or the input is too quiet for
the silence-detection threshold. Lower it in `.env`:

```
SILENT_INPUT_THRESHOLD_DB=-55
```

Then `./deploy.sh` to apply.

### "We didn't detect enough speech in this recording"

Silero VAD couldn't find half a second of voiced audio in the first
30 seconds of the clip. For a quiet speaker, lower the threshold:

```
EARLY_BAIL_VOICED_S=0.2
```

Then `./deploy.sh`.

### Library shows old failed rows with raw ffmpeg errors

Click the **Delete** button on each. Those rows pre-date the
sanitiser; new failures show a friendly message.

### Whisper queue lag during many simultaneous live sessions

Lower `MAX_LIVE_SESSIONS` in `.env` (recommend 12 on VPS M shared)
then `./deploy.sh`.

### CPU steal time (htop shows red bars on shared VPS)

You're hitting Contabo's noisy-neighbor problem. Either:
1. Wait it out (most spikes resolve in an hour)
2. Set `WHISPER_MODEL=tiny.en` in `.env` and `./deploy.sh` for the
   duration (less CPU per chunk; recoverable later)
3. Migrate to **Cloud VPS M** (better-isolated hardware) via Contabo support

### Disk filling up

Verify the cleanup cron is actually running:
```bash
grep CRON /var/log/syslog | tail -5
```

Force a one-shot cleanup:
```bash
docker volume inspect confidence-detector_uploads-data --format '{{.Mountpoint}}'
find <that-path> -type f -mtime +7 -delete
```

---

# Common operations

### Tail logs
```bash
docker compose logs -f                         # everything
docker compose logs -f backend                 # just backend
docker compose logs --since 1h backend         # last hour only
```

### Restart one service (no data loss)
```bash
docker compose restart backend
```

### Stop / start the whole stack (no data loss)
```bash
docker compose stop                            # graceful stop, keeps volumes
docker compose start                           # resume
```

### Connect to Postgres for debugging
```bash
docker compose exec postgres psql -U cd_app confidence_detector_app
```

### Back up the database
```bash
mkdir -p ~/backups
docker compose exec postgres pg_dump -U cd_app confidence_detector_app | \
    gzip > ~/backups/db_$(date +%Y%m%d).sql.gz
```

(You'll want this on a daily cron too.)

### ⚠️ DANGER — wipe ALL data (do NOT run this casually)

```bash
# This DELETES the DB, all uploads, certs, and model cache.
# Only use when you genuinely want a clean slate.
docker compose down -v
```

The `-v` flag removes named volumes. Without `-v`, `down` stops
containers but preserves all data.

---

# Appendix: Optional hardening (do AFTER the deploy works)

Skip until the app is live. Hardening before the deploy is verified
is the fastest way to lock yourself out of a half-broken VPS.

```bash
# Firewall — only the ports the app needs
apt install -y ufw
ufw allow 22/tcp                    # SSH
ufw allow 80/tcp                    # HTTP (Caddy redirects to HTTPS)
ufw allow 443/tcp                   # HTTPS
ufw allow 443/udp                   # HTTP/3 / QUIC
ufw --force enable

# fail2ban — drops IPs after repeated SSH login failures
apt install -y fail2ban
systemctl enable --now fail2ban

# Automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades

# Optional: non-root SSH user (for multi-operator setups)
adduser cd; usermod -aG sudo cd
mkdir -p /home/cd/.ssh
cp ~/.ssh/authorized_keys /home/cd/.ssh/ 2>/dev/null || true
chown -R cd:cd /home/cd/.ssh && chmod 700 /home/cd/.ssh
# Test logging in as `cd` from a SECOND terminal BEFORE disabling root:
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/; s/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

None of this is required for the app itself. The Caddy + Docker
network already isolates the app at the container layer.
