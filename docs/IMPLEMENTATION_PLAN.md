# Implementation Plan & Execution Roadmap

**Project**: JOB DISCOVERY AI - Autonomous Platform  
**Target User**: IT Tech Professionals (Full-Stack, Backend, Frontend, DevOps, SRE, Cloud Infrastructure, AI/ML, Data Engineering, Cybersecurity, Mobile, QA)  
**Execution Environment**: Ubuntu Linux (Node.js v22, Local Ollama)  
**Current Date**: October 2026

---

## 1. Implementation Phases & Task Checklist

### Phase 1: Repository Audit & Architectural Foundation (Completed)
- [x] Audit `OpenMausBot-main` codebase in depth.
- [x] Analyze tech stack, browser automation (CDP), drivers, persistence, Composio issues.
- [x] Deliver `docs/OPENMAUSBOT_AUDIT.md`.
- [x] Deliver `docs/ARCHITECTURE.md`.
- [x] Deliver `docs/IMPLEMENTATION_PLAN.md`.

### Phase 2: Working Foundation (Core Infrastructure)
- [ ] Initialize clean, production TypeScript project structure in repository.
- [ ] Configure `package.json`, `tsconfig.json`, `vitest` test harness.
- [ ] Implement robust `node:sqlite` database layer with schema migrations, indexes, and WAL mode.
- [ ] Load and structure candidate authoritative professional profile and preferences.
- [ ] Build configuration manager with `.env` secret protection, umask enforcement (`0o600`), and validation.
- [ ] Implement structured logging, audit trails, and health-check endpoints.
- [ ] Execute foundational tests and verify zero-defect baseline.

### Phase 3: Multi-Source Job Discovery Engine
- [ ] Build search query generator reflecting target roles (DevOps, Platform, Cloud, DevSecOps, SRE) and preferences.
- [ ] Implement public remote board connectors:
  - RemoteOK API connector (filtered for DevOps/Infrastructure).
  - Jobicy API connector (with India / Global remote eligibility filters).
  - Himalayas API / RSS connector.
  - Direct ATS connector templates (Greenhouse, Lever, Ashby).
- [ ] Implement Vacancy Verification Agent (detect 404/expired, verify domain & remote India policy).
- [ ] Implement Canonical Deduplication Engine (normalized URL, company + title hashing, similarity checks).
- [ ] Build freshness detector (distinguishing original posting date vs. reposts).
- [ ] Write and run comprehensive discovery & deduplication unit tests.

### Phase 4: AI Intelligence & Scoring Engine
- [ ] Build Local Ollama provider client (`qwen2.5:7b`, `llama3.2:1b`, `nomic-embed-text`) with timeout & streaming.
- [ ] Build Cloud LLM provider client (OpenAI-compatible / Anthropic / Gemini) with API key shielding.
- [ ] Implement Intelligent Model Router with automatic local/cloud selection and offline fallback.
- [ ] Build Job Description Analysis Agent (structured JSON extraction with strict schema validation).
- [ ] Implement 7-factor deterministic Job Matching Engine (30% skills, 20% exp, 15% responsibilities, 10% cloud, 10% location, 10% comp, 5% other).
- [ ] Implement evidence-backed explanation generator tied directly to candidate's verified career facts.
- [ ] Run matching and semantic evaluation tests.

### Phase 5: Resume Tailoring & Application Generation
- [ ] Build resume parser for Markdown / PDF / Text.
- [ ] Implement Resume Tailoring Agent with strict anti-hallucination guard (never invent dates/skills/metrics).
- [ ] Implement Application Writing Agent (role-specific email drafts & concise cover letters).
- [ ] Implement Two-Phase Deterministic Approval Gatekeeper (Status: `PENDING_REVIEW` -> `APPROVED`).
- [ ] Implement direct Google OAuth 2.0 flow for Gmail API (draft creation and approval-locked sending).
- [ ] Run end-to-end draft and approval unit/integration tests with mocked Gmail API.

### Phase 6: Google Cloud Integrations & Recruiter Tracking
- [ ] Implement direct Google Drive API client (save tailored resumes to `JobApplications/` folder).
- [ ] Implement direct Google Sheets API client (bidirectional sync with personal Job Application Tracker).
- [ ] Implement Recruiter Response Monitor (scan Gmail inbox threads for confirmations, assessment links, interview invites, rejections).
- [ ] Implement Follow-up Reminder scheduler (5-7 day cadence).
- [ ] Test Drive & Sheets integrations with controlled fixtures.

### Phase 7: Automation & Background Scheduling
- [ ] Implement persistent job scheduler with `croner` (configurable hourly discovery runs).
- [ ] Implement rate-limit controls, retry policies with exponential backoff, and daily discovery quotas (10 qualified vacancies/day).
- [ ] Implement Freelance & Contract opportunity search module (separate tracking for DevOps/Cloud contracts).
- [ ] Build telemetry aggregator (tokens consumed, API costs, discovery yield, failure logs).

### Phase 8: Application Dashboard & Production Readiness
- [ ] Build modern, responsive Web Dashboard (Overview metrics, Discovery explorer, Job details with match inspector, Application draft & approval workspace, Kanban tracker, Settings).
- [ ] Implement REST API connecting backend server with web UI.
- [ ] Perform comprehensive security review (prompt injection sanitization, token encryption, permission checks).
- [ ] Execute full automated test suite (Unit, Integration, End-to-End).
- [ ] Write Ubuntu deployment, systemd service configuration, and backup guides.
- [ ] Deliver final production audit and operational report.

---

## 2. Immediate Next Step: Phase 2 Foundation Execution

Proceed directly into Phase 2:
1. Initialize the package structure in the project repository.
2. Set up TypeScript, Vitest, Node.js scripts.
3. Implement `src/core/database.ts` with `node:sqlite` WAL mode.
4. Ingest and seed candidate profile into the database.
5. Verify tests and report progress.
