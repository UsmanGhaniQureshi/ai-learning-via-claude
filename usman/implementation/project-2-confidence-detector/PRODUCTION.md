# Production Deployment Guide — AWS

## Recommended Setup (Accuracy + Speed + Cost)

### Option A — GPU Instance (Best Performance)
**AWS: `g4dn.xlarge` (~$0.52/hr)**

- 4 vCPUs, 16GB RAM, 1× NVIDIA T4 GPU (16GB VRAM)
- Ideal for 10-50 concurrent sessions
- End-to-end latency: **~300ms per 3s chunk**

```bash
# backend/.env
WHISPER_MODEL=small.en
WHISPER_DEVICE=cuda
WHISPER_COMPUTE=float16
KMP_DUPLICATE_LIB_OK=TRUE
CORS_ORIGINS=https://yourdomain.com
PORT=8000
```

Dockerfile needs CUDA base image:
```dockerfile
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04
# ... rest of your Dockerfile
```

### Option B — CPU Instance with Distilled Model (Best Cost)
**AWS: `t3.xlarge` or `c6i.xlarge` (~$0.13-0.17/hr)**

- 4 vCPUs, 16GB RAM
- Ideal for 3-10 concurrent sessions
- End-to-end latency: **~1-2s per 3s chunk**

```bash
# backend/.env
WHISPER_MODEL=distil-small.en
WHISPER_DEVICE=cpu
WHISPER_COMPUTE=int8
KMP_DUPLICATE_LIB_OK=TRUE
CORS_ORIGINS=https://yourdomain.com
PORT=8000
```

Uses your existing Dockerfile as-is.

### Option C — Zero Infrastructure (Simplest)
**AWS Transcribe Streaming API**

- Pay per minute of audio (~$0.024/min)
- No GPU, no Whisper, no model management
- 99.9% uptime SLA
- Highest accuracy (Amazon's commercial ASR)
- Requires code changes to swap out Whisper for Transcribe SDK

Recommended if volume is < 200 hours/month.

---

## Deployment Steps — Option B (CPU, Distilled Whisper)

### 1. Build & push Docker image

```bash
# Build
docker build -t confidence-detector-backend .

# Tag for ECR
aws ecr create-repository --repository-name confidence-detector
docker tag confidence-detector-backend:latest \
  <account>.dkr.ecr.<region>.amazonaws.com/confidence-detector:v1

# Push
aws ecr get-login-password --region <region> | docker login --username AWS \
  --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker push <account>.dkr.ecr.<region>.amazonaws.com/confidence-detector:v1
```

### 2. Deploy backend to ECS Fargate

ECS Task Definition (key fields):
```json
{
  "family": "confidence-detector",
  "cpu": "2048",
  "memory": "8192",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "containerDefinitions": [{
    "name": "backend",
    "image": "<account>.dkr.ecr.<region>.amazonaws.com/confidence-detector:v1",
    "portMappings": [{ "containerPort": 8000, "protocol": "tcp" }],
    "environment": [
      { "name": "WHISPER_MODEL", "value": "distil-small.en" },
      { "name": "WHISPER_DEVICE", "value": "cpu" },
      { "name": "KMP_DUPLICATE_LIB_OK", "value": "TRUE" },
      { "name": "CORS_ORIGINS", "value": "https://your-frontend.com" }
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
      "interval": 30,
      "timeout": 10,
      "startPeriod": 120
    }
  }]
}
```

Put it behind an **Application Load Balancer** with sticky sessions (session affinity — essential for WebSocket connections).

### 3. Deploy frontend to S3 + CloudFront

```bash
cd frontend
# Build with production API URL
echo "VITE_API_URL=https://api.yourdomain.com" > .env.production
npm install
npm run build

# Upload
aws s3 sync dist/ s3://your-frontend-bucket/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

### 4. WebSocket + ALB configuration

ALB must be configured to support WebSocket upgrade:
- Listener rules: forward to target group on port 8000
- Idle timeout: set to **3600 seconds** (default 60s kills WebSockets)
- Target group: `HTTP/1.1` with `/health` health check

---

## Latency Optimization Checklist

- [x] Models pre-warmed on startup (`@app.on_event("startup")`)
- [x] Resampling done on client (browser) not server
- [x] Face detection runs in browser (no video upload)
- [x] Audio sent as raw Float32 (not encoded — WebM adds ~100ms latency)
- [x] Thread pool for Whisper inference (doesn't block event loop)
- [ ] Reduce chunk size from 3s to 1.5s for lower latency *(if needed)*
- [ ] Use Redis + multi-worker uvicorn for > 50 concurrent users

---

## Scaling Beyond 50 Concurrent Users

Add horizontal scaling:

```yaml
# ECS service
desiredCount: 3   # 3 backend tasks
autoScaling:
  min: 2
  max: 10
  targetCpuUtilization: 70
```

**Important:** WebSocket sessions must be sticky. Use ALB with `stickiness: lb_cookie` OR store session state in Redis (requires code refactor).

For > 200 concurrent users, use **Amazon Kinesis Video Streams** + Lambda for the ASR pipeline.

---

## Monitoring

Key metrics to watch in CloudWatch:
- `/health` response time (alert if > 1s)
- Memory usage (Whisper uses ~1-2GB)
- CPU usage per task
- WebSocket connection count
- p95 latency per chunk

---

## Cost Estimates (Monthly, US-East-1)

| Component | Cost | Notes |
|-----------|------|-------|
| ECS Fargate (t3.xlarge equiv.) × 2 | ~$190 | Backend |
| ALB | ~$20 | Load balancer |
| S3 + CloudFront | ~$5 | Frontend static hosting |
| ECR storage | ~$1 | Docker images |
| CloudWatch | ~$5 | Logs + metrics |
| **Total** | **~$220/mo** | For continuous 2-task deployment |

Add ~$0.15/hour for GPU if using Option A.

---

## Security Checklist

- [ ] HTTPS enabled (ACM cert on ALB)
- [ ] CORS restricted to your frontend domain (not `*`)
- [ ] WebSocket connection rate-limited per IP
- [ ] Uploaded video size limit (500MB already enforced)
- [ ] Audit logs enabled (CloudTrail + VPC flow logs)
- [ ] No secrets in Docker image (use AWS Secrets Manager)
- [ ] IAM roles — backend task has only S3 write + logs permissions
