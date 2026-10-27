# Autonomous Job Discovery & Application Automation Platform

A production-grade, local-first, privacy-respecting autonomous job discovery and application platform for software engineers, DevOps/SREs, and technology professionals.

Built with a local-first philosophy, the platform combines direct multi-source ATS connectors, semantic AI matching, automated ATS resume tailoring, scheduled background discovery, and **strict human-in-the-loop approval gates** before transmitting any external communication.

---

## 🌟 Key Capabilities

- **Direct ATS & Job-Source Connectors**:
  - Live API/feed integrations for **Ashby**, **Greenhouse**, **Lever**, **SmartRecruiters**, **Workable**, **Recruitee**, **RemoteOK**, and **Remotive**.
  - Built-in SSRF protections, client-side rate limiters, exponential backoff, and circuit breakers.
- **AI Matching & Semantic Scoring**:
  - Offline local inference via **Ollama** (`qwen2.5:7b`, `llama3.2:3b`, `mistral`) or optional cloud providers (**Gemini**, **OpenAI**, **Anthropic**, **OpenRouter**).
  - Fact-grounded resume tailoring: Highlights verified achievements without fabricating skills or employment history.
- **Strict Human-in-the-Loop Security Gate**:
  - Application emails, tailored resumes, and recruiter responses **cannot be dispatched automatically**.
  - Explicit user approval is enforced cryptographically and transactionally before any email is sent.
- **Enterprise-Grade Persistence & Reliability**:
  - SQLite WAL mode with 5000ms busy timeout, transactional rollbacks, foreign keys, and integrity verification.
  - Mutual exclusion lock on background scheduler to prevent overlapping discovery scans.
- **Security & Privacy First**:
  - Fail-closed configuration schema in production mode.
  - Constant-time secret comparison via SHA-256 fixed-length digests (`crypto.timingSafeEqual`).
  - Strict SSRF defense blocking RFC 1918 private IPv4, IPv6 loopback/mapped/link-local addresses, decimal/hex IPs, and cloud metadata.
  - Single-use cryptographically random OAuth state tokens to eliminate CSRF.
  - Automatic deep redaction of API keys, tokens, passwords, and personal resume text from logs.

---

## 🔒 Privacy & Data Disclosures

### What Data Is Stored
- **User Profile**: Name, contact email, location, phone, links, and structured career skills.
- **Job Vacancies & Scores**: Job postings discovered across configured connectors, semantic compatibility scores, and match justifications.
- **Generated Resumes**: Tailored Markdown and ATS PDF resumes generated locally in `./data/resumes/tailored/`.
- **Audit Logs**: SHA-256 hashed records of approved actions and submissions in `./logs/audit.log`.

### Where Data Is Stored
- **Local SQLite Database**: Stored on your filesystem at `./data/job_platform.db` (file permissions restricted to `0o600`).
- **OAuth Credentials**: Stored at `./data/google_tokens.json` (file permissions restricted to `0o600`).
- **Logs**: Kept locally in `./logs/platform.log` and `./logs/audit.log`.

### External Services & Transmission Notice
- **Local Mode (Default)**: When running with local Ollama, **zero data leaves your machine**.
- **Optional Cloud AI**: If cloud LLM inference is enabled, job descriptions and anonymized resume qualifications are transmitted to your configured provider (OpenAI, Anthropic, or Google Gemini).
- **Optional Google Workspace**: Connecting Google OAuth allows sending approved applications via Gmail API, saving PDFs to Google Drive, and logging applied vacancies to Google Sheets. All Google integrations are disabled by default until credentials are configured.
- **Optional Alerts**: If Telegram or Discord webhooks are configured, job notifications scoring above your threshold are pushed to your private chat.

---

## 🛠️ Architecture & Tech Stack

- **Runtime**: Node.js (v22+ ESM native)
- **Language**: TypeScript (strict mode, 0 compile errors)
- **Persistence**: Node.js Built-in SQLite (`node:sqlite`) with WAL mode
- **Testing**: Vitest (227 tests across 27 comprehensive test suites)
- **Frontend**: Vanilla HTML5, Modern CSS (Glassmorphism, dark palette), Vanilla JavaScript

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher (v22 recommended)
- **npm**: v10.0.0 or higher
- **(Optional) Ollama**: Installed locally for zero-cost offline AI matching (`ollama pull qwen2.5:7b`)

### 2. Installation
```bash
git clone https://github.com/rahulmotvani0-sketch/ai-job-discovery-platform.git
cd ai-job-discovery-platform
npm install
```

### 3. Configuration
Copy the safe template environment configuration:
```bash
cp .env.example .env
```

Review and adjust settings in `.env`. By default, the application runs entirely offline and binds to `127.0.0.1:3300`:
```env
NODE_ENV=development
PORT=3300
HOST=127.0.0.1
DATA_DIR=./data
DB_PATH=./data/job_platform.db

# Offline Local Ollama
OLLAMA_ENDPOINT=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b

# Cloud LLM (Disabled by default)
CLOUD_DISABLED=true
CLOUD_PROVIDER=none
```

### 4. Run Automated Preflight Verification
Verify runtime environment, directory permissions, database health, and configuration:
```bash
npm run preflight
```

### 5. Run Test Suite
```bash
npm test
```

### 6. Build & Start the Platform
```bash
npm run build
npm start
```
Access the web dashboard in your browser at `http://127.0.0.1:3300`.

---

## 🛡️ Production Deployment & Operations

### 1. Production Requirements
In production (`NODE_ENV=production`):
- `API_AUTH_TOKEN`: Mandatory, minimum 32 characters.
- `CORS_ORIGIN`: Must specify exact origins (wildcard `*` is prohibited).
- `HOST`: Set to `127.0.0.1` when deployed behind a reverse proxy (e.g., Nginx, Caddy).
- `TRUST_PROXY`: Set to `true` only when running behind an authorized reverse proxy.

### 2. Systemd Deployment
A hardened systemd unit file is provided at `deploy/job-platform.service` implementing:
- Dedicated least-privilege system user (`jobplatform`)
- Filesystem sandboxing (`ProtectSystem=strict`, `ProtectHome=true`)
- Explicit write permissions restricted to `./data`, `./logs`, and `./backups`
- Resource constraints (`MemoryMax=1G`, `CPUQuota=200%`)
- Clean shutdown timeout (`TimeoutStopSec=30`)

To deploy on Ubuntu/Debian:
```bash
# 1. Create system user
sudo useradd -r -s /bin/false jobplatform

# 2. Deploy repository to /opt/job-platform
sudo cp -r . /opt/job-platform
sudo chown -R jobplatform:jobplatform /opt/job-platform

# 3. Install systemd unit
sudo cp deploy/job-platform.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now job-platform
```

### 3. Health Probes
The platform exposes four unauthenticated observability endpoints:
- `GET /health/live`: Liveness probe reporting process uptime.
- `GET /health/startup`: Startup probe validating database connectivity and integrity.
- `GET /health/ready`: Readiness probe verifying scheduler status and persistence health.
- `GET /api/health`: Comprehensive system telemetry (version, mode, scheduler state).

### 4. Backups and Disaster Recovery
- **Online Backup**: Safely checkpoints SQLite WAL and archives tailored resumes:
  ```bash
  npm run backup
  ```
- **Restore**:
  ```bash
  bash scripts/restore.sh ./backups/YYYYMMDD_HHMMSS
  ```

---

## 🤝 Contributing

We welcome community contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before submitting pull requests.

Security vulnerabilities should be reported according to [SECURITY.md](SECURITY.md).

---

## 📜 License

Licensed under the **Apache License, Version 2.0** (the "License"). You may obtain a copy of the License in the [LICENSE](LICENSE) file or at:
http://www.apache.org/licenses/LICENSE-2.0
