# JOB DISCOVERY AI - Autonomous Platform

An enterprise-grade, open-source, local-first autonomous job discovery and application workstation built for **all IT and tech job seekers** (Full-Stack, Backend, Frontend, DevOps, SRE, Cloud Infrastructure, AI & Machine Learning, Data Engineering, Cybersecurity, Mobile, and QA & Automation).

Inspired by modern job platforms like NextRaise and built with a local-first philosophy, the platform combines multi-source direct ATS scraping, local CPU inference via Ollama, hybrid cloud LLM routing, Google Cloud OAuth 2.0 integration, and human-in-the-loop security approval gates.

---

## 🌟 Key Capabilities

- **Universal Multi-Source Job Discovery**:
  - Direct ATS scraping from **Greenhouse** (Elastic, Cloudflare, Datadog, MongoDB, Stripe, Canonical, etc.)
  - Direct ATS scraping from **Lever** (Palantir, OptionMetrics, BrightEdge, Nextech, etc.)
  - Direct ATS scraping from **Ashby** (Linear, Supabase, Ramp, Perplexity, Resend, PostHog, Vanta, Replit, etc.)
  - Remote tech job feeds from **Himalayas Remote API**, **RemoteOK API**, and **Jobicy API**
- **Modern NextRaise-Inspired UX**:
  - Multi-Domain Role Chips (`All Roles`, `Full-Stack`, `Backend`, `Frontend`, `DevOps & SRE`, `Cloud Infra`, `AI & ML`, `Data Engineering`, `Cybersecurity`, `Mobile`, `QA & Automation`)
  - **"✦ Early Applicant"** Badges prioritizing vacancies active &le; 48 hours for 3–4× higher recruiter response rates
  - Country & Residency Filters with strict remote-eligibility matching (India-eligible, Worldwide, US, UK, Germany, Canada, Singapore, Australia, etc.)
  - Job Bookmarking / Saved Jobs tracking
- **AI Matching & Tailored Resumes**:
  - Semantic compatibility evaluation based on candidate profile and skills
  - Automated ATS-optimized markdown resume tailoring adhering strictly to target job requirements
  - Zero-hallucination policy strictly grounded in verified achievements
- **Flexible Model Routing (Local CPU + Cloud)**:
  - Local CPU inference via **Ollama** (`qwen2.5:7b`, `llama3.2:3b`, `mistral`)
  - Configurable Cloud LLMs (**Google Gemini**, **OpenAI**, **Anthropic**, **OpenRouter**) with live latency testing and masked keys
  - Dynamic switching between `local-only`, `cloud-only`, and `hybrid` inference modes
- **Multi-Account Authentication**:
  - Direct Google Cloud OAuth 2.0 (Gmail API, Google Drive API, Google Sheets API)
  - Management of primary sending account and secondary recruitment inboxes
  - Tokens stored encrypted locally; zero third-party intermediaries (e.g. no Composio)
- **Strict Human-in-the-Loop Security Gate**:
  - Strict approval gate prevents unauthorized automatic email dispatches
  - Per-application sending account selection
  - Cryptographic SHA-256 audit logging of all authorized submissions
- **Automated Scheduler**:
  - Hourly discovery cron jobs with daily qualified vacancy targets
  - Production systemd unit template for 24/7 background autopilot on Ubuntu

---

## 🛠️ Architecture & Tech Stack

- **Backend**: Node.js (v22+ ESM), TypeScript, Node.js Built-in SQLite (`node:sqlite`)
- **Frontend**: Vanilla HTML5, Modern CSS (Glassmorphism, dark palette, CSS Grid/Flexbox), Vanilla JavaScript
- **AI / LLMs**: Ollama (local CPU), Google Gemini API, OpenAI API, Anthropic Claude API
- **Integrations**: Direct Google OAuth 2.0 (Gmail, Drive, Sheets)
- **Testing**: Vitest (41 automated tests across 8 test suites)

---

## 🚀 Getting Started

### 1. Installation

```bash
git clone https://github.com/rahulmotvani0-sketch/ai-job-discovery-platform.git
cd ai-job-discovery-platform
npm install
```

### 2. Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

Edit `.env` to configure your profile details, preferred port, and optional LLM / Google OAuth credentials:

```env
PORT=3300
HOST=127.0.0.1

# Candidate Profile Customization
USER_FULL_NAME=Your Full Name
USER_EMAIL=your.email@example.com
USER_PHONE=+1-555-0100
USER_LOCATION=Remote / Global
USER_PORTFOLIO_URL=https://yourportfolio.com
USER_GITHUB_URL=https://github.com/yourusername
USER_LINKEDIN_URL=https://linkedin.com/in/yourprofile

# Local Ollama Inference (CPU/GPU)
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

## 🤝 Contributing

We welcome contributions from the developer community! Whether you want to add new ATS connectors (e.g., Workable, SmartRecruiters, BambooHR), improve UX filters, enhance the matching engine, or add new AI model providers, check out our [CONTRIBUTING.md](CONTRIBUTING.md) guide.

---

## 🔒 Privacy & Security First

- **Zero Data Leak Policy**: No private candidate profiles, credentials, or personal tokens are tracked in git.
- **Local-First Storage**: All vacancies, evaluated matches, tailored resumes, and audit logs are kept in local SQLite files in `data/`.
- **Token Privacy**: OAuth tokens and API keys are stored encrypted locally on your workstation.

---

## 📄 Operational Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md): Guide for open-source contributors and adding new ATS connectors.
- [docs/PLATFORM_IMPROVEMENT_PLAN.md](docs/PLATFORM_IMPROVEMENT_PLAN.md): Strategic architecture and phase roadmap.
- [docs/OPENMAUSBOT_AUDIT.md](docs/OPENMAUSBOT_AUDIT.md): Technical audit of OpenMausBot patterns.
- [docs/GOOGLE_OAUTH_SETUP_GUIDE.md](docs/GOOGLE_OAUTH_SETUP_GUIDE.md): 3-minute Google Cloud OAuth setup guide.
- [docs/FINAL_IMPLEMENTATION_REPORT.md](docs/FINAL_IMPLEMENTATION_REPORT.md): Complete test suite and verification evidence.

---

## 📜 License

MIT License. Open-source and free for all job seekers and developers.
