# Ubuntu Deployment & Operations Guide

**Platform**: AI-Powered Job Discovery and Application Automation Platform  
**Target Host**: Ubuntu 24.04 LTS (x86_64)  
**Author**: Lead DevOps & Security Engineer  
**Date**: October 24, 2026

---

## 1. System Requirements & Prerequisites

The platform is engineered specifically for low-overhead, local-first operation on Ubuntu without requiring a dedicated GPU server:
- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **Runtime**: Node.js v22+ (`node:sqlite` built-in)
- **Local AI Inference**: Ollama (`qwen2.5:7b`, `llama3.2:1b`, `nomic-embed-text:latest`)
- **Memory**: Minimum 8GB RAM (16GB recommended for running Ollama CPU inference smoothly)
- **Disk**: 500MB for application code and dependencies + ~6GB for local Ollama weights

---

## 2. Installation & Quickstart

```bash
# 1. Clone / Navigate to project workspace
cd "/home/rahul/PROJECT'S/JOB"

# 2. Install Node.js dependencies
npm install

# 3. Compile TypeScript
npm run build

# 4. Verify Local Ollama Inference
ollama list
# If models are missing, pull CPU-efficient models:
# ollama pull qwen2.5:7b
# ollama pull nomic-embed-text:latest

# 5. Run automated test suite
npm test

# 6. Trigger initial discovery scan via CLI
npx tsx src/cli.ts scan

# 7. Start the interactive server and web dashboard
npm start
```
Access the dashboard at `http://localhost:3000`.

---

## 3. Configuration & Secrets Management

Configuration is handled through `.env` with strict permissions (`0o600`):

```bash
cp .env.example .env
chmod 600 .env
```

### Key Configuration Directives

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP Web server and REST API port |
| `HOST` | `127.0.0.1` | Local loopback interface (security: do not expose to public WAN) |
| `OLLAMA_ENDPOINT` | `http://127.0.0.1:11434` | Local model inference endpoint |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Default LLM for extraction, scoring, and drafting |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text:latest` | Local embedding model for semantic similarity |
| `CLOUD_DISABLED` | `true` | When true, zero personal data is transmitted to third-party cloud APIs |
| `DAILY_TARGET_QUALIFIED` | `10` | Daily qualified vacancy discovery goal |
| `HOURLY_DISCOVERY` | `false` | Enable or disable hourly background discovery |
| `GOOGLE_TOKEN_PATH` | `./data/google_tokens.json` | Path to direct Google OAuth 2.0 offline credentials |

---

## 4. Google OAuth 2.0 Setup (Gmail, Drive, Sheets)

The system communicates directly with Google APIs using least-privilege OAuth scopes:
1. Open [Google Cloud Console](https://console.cloud.google.com).
2. Create or select a project (e.g. `personal-job-automation`).
3. Enable **Gmail API**, **Google Drive API**, and **Google Sheets API**.
4. Configure the OAuth Consent Screen (User Type: External, status: Testing).
5. Add scopes:
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/spreadsheets`
6. Create an OAuth 2.0 Client ID (Application Type: Web Application).
   - Authorized Redirect URI: `http://localhost:3000/oauth2callback`
7. Save client credentials in `.env` under `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

> **Deterministic Security Note**: In the absence of live Google tokens, the platform functions in a transparent **Simulation/Mock Mode**, logging full message contents, draft IDs, and audit records without failing.

---

## 5. Systemd Background Daemon

To run the application as a persistent background daemon on Ubuntu:

```bash
# 1. Copy service file to systemd directory
sudo cp deploy/job-platform.service /etc/systemd/system/

# 2. Reload systemd daemon
sudo systemctl daemon-reload

# 3. Enable and start the service
sudo systemctl enable job-platform
sudo systemctl start job-platform

# 4. Inspect service status and logs
sudo systemctl status job-platform
journalctl -u job-platform -f
```

---

## 6. Backup & Disaster Recovery

All state is stored within the local SQLite database and tailored markdown resumes:
- **Database**: `data/job_platform.db` (and `data/job_platform.db-wal`, `data/job_platform.db-shm`)
- **Resumes**: `data/resumes/tailored/*.md`
- **Audit Logs**: `logs/audit.log`

### Backup Command
```bash
# Safe live backup utilizing SQLite VACUUM INTO
sqlite3 data/job_platform.db "VACUUM INTO 'data/backup_$(date +%Y%m%d_%H%M%S).db';"
tar -czvf "backup_resumes_$(date +%Y%m%d).tar.gz" data/resumes/
```
