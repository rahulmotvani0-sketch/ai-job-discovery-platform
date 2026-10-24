# Autonomous AI Job Discovery & Application Platform

An autonomous, full-stack personal job search workstation designed to discover, evaluate, tailor applications for, and track senior DevOps, Cloud Infrastructure, Kubernetes, Platform Engineering, DevSecOps, and SRE opportunities.

Inspired by product patterns from modern job platforms like NextRaise, the platform combines multi-source direct ATS scraping, local CPU inference via Ollama, hybrid cloud LLM routing, Google Cloud OAuth 2.0 integration, and human-in-the-loop approval gates.

---

## Key Features

- **Multi-Source Job Discovery**:
  - Direct ATS scraping from **Greenhouse** (Elastic, Cloudflare, Datadog, MongoDB, Stripe, Canonical)
  - Direct ATS scraping from **Lever** (Palantir, OptionMetrics, BrightEdge, Nextech)
  - Direct ATS scraping from **Ashby** (Linear, Supabase, Ramp, Perplexity, Resend, PostHog, Vanta, Replit)
  - Remote tech job feeds from **Himalayas Remote API**, **RemoteOK API**, and **Jobicy API**
- **NextRaise-Inspired UX**:
  - Role Taxonomy Chips (`DevOps`, `Platform Engineer`, `SRE`, `DevSecOps`, `Cloud Infrastructure`, `Kubernetes`)
  - **"✦ Early Applicant"** Badges prioritizing vacancies active &le; 48 hours for 3–4× higher recruiter response rates
  - Country Filters with strict remote-eligibility matching (India-friendly, Worldwide, US, UK, Germany, etc.)
  - Job Bookmarking / Saved Jobs tracking
- **AI Matching & Resume Tailoring**:
  - Semantic compatibility evaluation based on verified professional background
  - Automated ATS-optimized markdown resume tailoring tailored to target job requirements
  - Zero-hallucination policy strictly adhering to master resume achievements
- **Flexible Model Routing (Local CPU + Cloud)**:
  - Local CPU inference via **Ollama** (`qwen2.5:7b`, `llama3.2:3b`, `mistral`)
  - Configurable Cloud LLMs (**Google Gemini**, **OpenAI**, **Anthropic**, **OpenRouter**) with live latency testing and masked keys
  - Dynamic switching between `local-only`, `cloud-only`, and `hybrid` inference modes
- **Multi-Account Authentication**:
  - Direct Google Cloud OAuth 2.0 (Gmail API, Google Drive API, Google Sheets API)
  - Management of primary sending account and secondary recruitment inboxes
  - Tokens stored encrypted locally; zero third-party intermediaries (e.g. no Composio)
- **Human-in-the-Loop Security Gate**:
  - Strict approval gate prevents unauthorized automatic email dispatches
  - Per-application sending account selection
  - Cryptographic SHA-256 audit logging of all authorized submissions
- **Automated Scheduler**:
  - Hourly discovery cron jobs with daily qualified vacancy targets
  - Production systemd unit file for 24/7 background autopilot on Ubuntu

---

## Architecture & Tech Stack

- **Backend**: Node.js (v22+ ESM), TypeScript, Node.js Built-in SQLite (`node:sqlite`)
- **Frontend**: Vanilla HTML5, Modern CSS (Glassmorphism, dark palette, CSS Grid/Flexbox), Vanilla JavaScript
- **AI / LLMs**: Ollama (local CPU), Google Gemini API, OpenAI API, Anthropic Claude API
- **Integrations**: Direct Google OAuth 2.0 (Gmail, Drive, Sheets)
- **Testing**: Vitest (41 automated tests across 8 test suites)

---

## Getting Started

### 1. Installation

```bash
git clone https://github.com/rahulmotvani0-sketch/job-discovery-platform.git
cd job-discovery-platform
npm install
```

### 2. Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

Edit `.env` to configure your preferred port and optional LLM / Google OAuth credentials:

```env
PORT=3300
HOST=127.0.0.1
OLLAMA_ENDPOINT=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
```

### 3. Run Automated Tests

```bash
npm test
```

### 4. Start the Application Server

```bash
npm start
```

Open your browser to:
**`http://localhost:3300`**

---

## Operational Documentation

- [docs/NEXTRAISE_PRODUCT_RESEARCH.md](docs/NEXTRAISE_PRODUCT_RESEARCH.md): NextRaise product analysis and feature reproduction plan.
- [docs/PLATFORM_IMPROVEMENT_PLAN.md](docs/PLATFORM_IMPROVEMENT_PLAN.md): Strategic architecture and phase roadmap.
- [docs/OPENMAUSBOT_AUDIT.md](docs/OPENMAUSBOT_AUDIT.md): Technical audit of OpenMausBot patterns.
- [docs/GOOGLE_OAUTH_SETUP_GUIDE.md](docs/GOOGLE_OAUTH_SETUP_GUIDE.md): 3-minute Google Cloud OAuth setup guide.
- [docs/FINAL_IMPLEMENTATION_REPORT.md](docs/FINAL_IMPLEMENTATION_REPORT.md): Complete test suite and verification evidence.

---

## 24/7 Background Systemd Service

To deploy on Ubuntu as a persistent system service:

```bash
sudo cp deploy/job-platform.service /etc/systemd/system/job-platform.service
sudo systemctl daemon-reload
sudo systemctl enable --now job-platform.service
```

---

## License

MIT License. Designed and engineered for Rahul Motvani.
