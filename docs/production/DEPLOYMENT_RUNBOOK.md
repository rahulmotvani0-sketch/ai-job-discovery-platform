# Production Deployment Runbook: JOB DISCOVERY AI Autonomous Platform

**Document Version:** 1.0.0  
**Generated Date:** 2026-10-24  
**Target Environment:** Ubuntu 22.04 / 24.04 LTS, Debian 12, or Systemd-enabled Linux host  

---

## 1. Prerequisites & System Dependencies

- **Node.js:** v22.13.0+ (requires native `node:sqlite`)
- **NPM:** v10.0.0+
- **Process Manager:** Systemd (Linux standard)
- **Disk Space:** Minimum 2 GB free
- **Memory (RAM):** Minimum 1 GB free (Recommended: 2 GB)

Verify installed versions:
```bash
node --version # Must output v22.x or higher
npm --version
```

---

## 2. Step-by-Step Installation & Deployment

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/rahulmotvani0-sketch/ai-job-discovery-platform.git /opt/job-discovery-platform
cd /opt/job-discovery-platform

# Install production dependencies
npm ci
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` and set tight file permissions:
```bash
cp .env.example .env
chmod 600 .env
```
Edit `.env` with required parameters:
```ini
NODE_ENV=production
PORT=3300
HOST=127.0.0.1
DATA_DIR=/opt/job-discovery-platform/data

# Required: API security token for mutating endpoints (minimum 32 characters)
API_AUTH_TOKEN=generate_a_secure_32_character_token_here

# Required when exposing a browser client in production; use the exact HTTPS origin
CORS_ORIGIN=https://jobs.example.com

# Set true only when a trusted reverse proxy overwrites X-Forwarded-For
TRUST_PROXY=false

# Optional: Alerts
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=
```

### Step 3: Compile TypeScript Application
```bash
npm run build
```
Confirm `./dist/` contains compiled JavaScript files:
```bash
ls -la dist/
```

### Step 4: Validate Pre-Flight Health & Run Tests
```bash
npm test
```
All 13 test suites must pass (61+ tests passing).

### Step 5: Install & Start Systemd Service
Copy the provided unit file to `/etc/systemd/system/`:
```bash
sudo cp deploy/job-platform.service /etc/systemd/system/job-platform.service
sudo systemctl daemon-reload
sudo systemctl enable job-platform
sudo systemctl start job-platform
```

### Step 6: Verify Deployment Health
Query the HTTP liveness and readiness probes:
```bash
# Liveness probe
curl -f http://127.0.0.1:3300/health/live

# Readiness probe
curl -f http://127.0.0.1:3300/health/ready

# Check systemd status
sudo systemctl status job-platform
```
Open [http://localhost:3300/](http://localhost:3300/) in your browser to verify dashboard accessibility.

---

## 3. Reverse Proxy Configuration (Optional Nginx / SSL)

If exposing via a domain with HTTPS:
```nginx
server {
    listen 80;
    server_name jobs.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name jobs.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/jobs.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jobs.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3300;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
