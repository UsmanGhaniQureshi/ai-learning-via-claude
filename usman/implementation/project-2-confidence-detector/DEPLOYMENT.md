# Deploying to a Contabo VPS — step-by-step runbook

End-to-end guide from a fresh Contabo Ubuntu VPS to a production-ready
deployment of the confidence-detector app. Assumes Ubuntu 22.04 LTS
or 24.04 LTS (Contabo's default options).

**Prerequisites:**

1. A Contabo VPS (recommended: VPS M shared — 6 vCPU / 16 GB RAM)
2. The IPv4 address of your VPS (in your Contabo control panel)
3. SSH credentials emailed by Contabo at provisioning time
4. **A domain name** pointing at your VPS's IPv4. Without HTTPS the
   browser refuses microphone / camera permission; without a domain
   you can't get HTTPS via Let's Encrypt. Cheapest path: a
   `yourname.com` from any registrar (~$10/year) with one A record.

Total time: **~30-45 minutes** for a first-time deploy.

---

## 1. First-time SSH + hardening (~10 min)

From your laptop, SSH in as root using the password Contabo emailed:

```bash
ssh root@<your-vps-ip>
```

You'll be prompted to change the root password on first login — do
that, then:

### 1.1 Create a non-root user

```bash
adduser cd                          # answer prompts; pick a strong password
usermod -aG sudo cd                  # grant sudo
mkdir -p /home/cd/.ssh
cp /root/.ssh/authorized_keys /home/cd/.ssh/  2>/dev/null || true
chown -R cd:cd /home/cd/.ssh
chmod 700 /home/cd/.ssh
chmod 600 /home/cd/.ssh/authorized_keys 2>/dev/null || true
```

If you don't have an SSH key yet, generate one on your laptop
(`ssh-keygen -t ed25519`), then copy the public key:

```bash
ssh-copy-id cd@<your-vps-ip>
```

### 1.2 Disable password SSH + root login

```bash
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

**Test the new login from a different terminal BEFORE closing this
session** — `ssh cd@<vps-ip>` should work without password.

### 1.3 Firewall + fail2ban

```bash
apt update && apt install -y ufw fail2ban
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp                   # HTTP/3
ufw --force enable
systemctl enable --now fail2ban
```

### 1.4 (Optional) swap file — useful on VPS S (8 GB)

Skip on VPS M and bigger.

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

You should now exit and re-SSH as `cd`:

```bash
exit
ssh cd@<your-vps-ip>
```

The rest of this guide runs as the `cd` user with `sudo` where needed.

---

## 2. Install Docker + Docker Compose (~5 min)

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker cd        # so we don't need sudo for `docker` anymore
```

**Log out and back in** so the docker group membership takes effect:

```bash
exit
ssh cd@<your-vps-ip>
```

Verify:

```bash
docker run --rm hello-world      # should print "Hello from Docker!"
docker compose version            # 2.x
```

---

## 3. Point DNS at the VPS (~5 min, can be done in parallel)

In your domain registrar's control panel, add an **A record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` (or `practice` if using a subdomain) | `<your-vps-ip>` | 300 |
| AAAA | `@` (only if your VPS has IPv6) | `<your-vps-ipv6>` | 300 |

Verify propagation from your laptop:

```bash
dig +short example.com           # should return your VPS IP
```

Wait until this returns the correct IP before continuing — Caddy's
auto-HTTPS step depends on it.

---

## 4. Clone the repo (~1 min)

```bash
cd ~
git clone <your-repo-url> confidence-detector
cd confidence-detector
```

If the repo is private, set up an SSH deploy key first or use a
personal access token in the clone URL.

---

## 5. Configure Caddy domain (~30 sec)

Edit the `Caddyfile` in the repo root and replace the placeholder
`example.com` with your real domain:

```bash
sed -i 's/^example\.com {/practice.yourdomain.com {/' Caddyfile
```

(Use whatever domain you set up in step 3.)

---

## 6. Generate secrets + create `.env` (~2 min)

```bash
cp .env.production.example .env
```

Generate two random secrets:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Open `.env` in your editor:

```bash
nano .env
```

Fill in **at minimum**:

```
ENV=production
JWT_SECRET=<first-secret-from-above>
MEDIA_URL_SECRET=<second-secret-from-above>

DB_HOST=postgres                       # leave as-is; refers to the compose service name
DB_PORT=5432
DB_NAME=confidence_detector_app
DB_USER=cd_app
DB_PASSWORD=<pick-a-strong-password>

# CPU-realistic tuning for VPS M shared (6 vCPU, 16 GB RAM):
WHISPER_MODEL=base.en                  # ~2× faster Whisper, negligible accuracy loss
MAX_LIVE_SESSIONS=12                   # CPU-realistic; default 30 is RAM-realistic but optimistic
UVICORN_WORKERS=4                      # 4 of 6 cores; leaves slack for ffmpeg + caddy
DB_POOL_SIZE=50
DB_POOL_MAX_OVERFLOW=100
```

If you have a Gemini API key for AI coaching tips:
```
GEMINI_API_KEY=<your-key>
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

`.env` is in `.gitignore` — never commit the filled-in version.

---

## 7. Build + start the stack (~10-15 min on first run)

```bash
docker compose pull              # pulls postgres, caddy
docker compose build             # builds backend + frontend (slow first time — installs Whisper, MediaPipe, npm)
docker compose up -d             # starts everything in the background
```

Watch the logs while everything comes up:

```bash
docker compose logs -f
```

You're looking for:

- `postgres-1   | LOG:  database system is ready to accept connections`
- `backend-1    | [Whisper] Model ready.`
- `caddy-1      | [INFO] ... certificate obtained successfully`

Press `Ctrl+C` to stop tailing once you see those (the containers
keep running).

---

## 8. Run database migrations (~10 sec)

The first deploy needs to create the schema. Subsequent deploys do
this automatically when the backend starts, but the very first time
you must run it manually:

```bash
docker compose exec backend alembic upgrade head
```

You should see roughly 13 migrations apply, ending with the most
recent revision ID.

---

## 9. Verify (~2 min)

### 9.1 Health check

```bash
curl https://yourdomain.com/health
```

Expected:
```json
{"ready": true, "models_loaded": true, "db_connected": true, "db_error": null}
```

If `models_loaded` is false, wait 30 seconds and retry — Whisper is
still loading on first run.

If you get a TLS error, Caddy is still negotiating certs. Check:
```bash
docker compose logs caddy | tail -30
```

### 9.2 Open the app

In your browser: `https://yourdomain.com`

You should see the login screen. Register, log in, and try a live
practice session — the browser will ask for mic + camera permission
(which only works because we have HTTPS). Verify the live HUD
updates every ~3 seconds.

---

## 10. Set up the daily upload-cleanup cron (~2 min)

Without this, user uploads accumulate on disk forever. Add a daily
cron that purges files older than 30 days:

```bash
sudo crontab -e
```

Append this line:

```
0 3 * * *  find /var/lib/docker/volumes/confidence-detector_uploads-data/_data -type f -mtime +30 -delete
```

(The exact volume path depends on your project directory name; run
`docker volume inspect confidence-detector_uploads-data --format '{{.Mountpoint}}'`
to confirm.)

---

## 11. Set up automatic updates (optional, recommended)

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

This applies security patches automatically and reboots when needed.

---

## Common operations

### Tail logs

```bash
docker compose logs -f backend                # backend only
docker compose logs -f                         # everything
docker compose logs --since 1h backend         # last hour
```

### Update the app to a new commit

```bash
cd ~/confidence-detector
git pull
docker compose build backend frontend          # rebuild changed images
docker compose up -d                            # restart with new images
docker compose exec backend alembic upgrade head  # apply new migrations if any
```

### Restart one service

```bash
docker compose restart backend
```

### Connect to Postgres for debugging

```bash
docker compose exec postgres psql -U cd_app confidence_detector_app
```

### Back up the database

```bash
docker compose exec postgres pg_dump -U cd_app confidence_detector_app | \
    gzip > ~/backups/db_$(date +%Y%m%d).sql.gz
```

(You'll want this on a daily cron too — append the same crontab.)

### Wipe everything (DANGER — drops all user data)

```bash
docker compose down -v                          # -v removes named volumes
```

---

## Troubleshooting

### Caddy says "could not get certificate"

- Check DNS: `dig +short yourdomain.com` must return your VPS IP
- Check ports: `sudo ufw status` should show 80 and 443 open
- Check rate limits: Let's Encrypt allows 5 cert requests per
  domain per week. If you've been bouncing the stack, wait 1 hour
  and retry.

### Backend won't start, complains about JWT_SECRET

You're running with `ENV=production` (good!) but `JWT_SECRET` isn't
set in `.env`. Re-check step 6.

### "We didn't pick up any audio in this recording"

The user's microphone really is silent — or `dynaudnorm` is failing
to lift the signal. If you suspect a false positive, lower the
threshold in `.env`:
```
SILENT_INPUT_THRESHOLD_DB=-55
```

### "We didn't detect enough speech in this recording"

Silero VAD couldn't find half a second of voiced audio in the first
30 seconds. If you have a very quiet speaker, lower further:
```
EARLY_BAIL_VOICED_S=0.2
```

### Library shows old failed rows with raw ffmpeg errors

Click the **Delete** button on each failed row — the friendly
error message helper sanitises new failures, but pre-existing
rows still carry their original raw error text in the DB.

### Whisper queue lag during 30 simultaneous live sessions

Lower `MAX_LIVE_SESSIONS` in `.env` (we recommend 12 on VPS M
shared). Restart the backend:
```bash
docker compose restart backend
```

### CPU steal time (htop shows red bars)

You're hitting Contabo's noisy-neighbor problem. Options:
1. Wait it out — most steal-time spikes resolve within an hour
2. Move to **Cloud VPS M** (better-isolated hardware) — Contabo's
   support can do a paid migration
3. Switch `WHISPER_MODEL=tiny.en` temporarily (less CPU per chunk)

### Disk filling up

Verify the cleanup cron ran:
```bash
sudo grep CRON /var/log/syslog | tail -5
```

Force cleanup:
```bash
docker volume inspect confidence-detector_uploads-data --format '{{.Mountpoint}}'
sudo find <that-path> -type f -mtime +7 -delete   # purge anything older than 7 days
```

---

## What this guide does NOT cover

- **Off-site database backups.** Run `pg_dump` daily and rsync to
  another host or S3-compatible storage. Contabo offers Object
  Storage (~€5/mo for 250 GB) that pairs well.
- **Monitoring / alerting.** Set up Uptime Kuma, Sentry, or
  Better Uptime to alert on `/health` failures and 5xx spikes.
- **Horizontal scaling.** When a single VPS isn't enough, you'll
  need a load balancer + N worker VPSes + Redis for shared state +
  S3 for uploads. This guide is single-VPS only.

---

## Quick command summary (copy-paste cheat sheet)

For when you've done this before and just need the commands:

```bash
# fresh box
ssh root@<ip>; passwd; \
adduser cd; usermod -aG sudo cd; \
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/; s/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config; \
systemctl restart ssh; \
apt update && apt install -y ufw fail2ban git ca-certificates curl gnupg; \
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp; ufw --force enable; \
systemctl enable --now fail2ban

# install docker
sudo install -m 0755 -d /etc/apt/keyrings; \
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg; \
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list; \
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; \
sudo usermod -aG docker cd

# clone, configure, run
cd ~; git clone <repo> confidence-detector; cd confidence-detector
sed -i 's/^example\.com/practice.yourdomain.com/' Caddyfile
cp .env.production.example .env; nano .env   # fill in secrets + DB creds
docker compose pull && docker compose build && docker compose up -d
docker compose exec backend alembic upgrade head
curl https://practice.yourdomain.com/health
```
