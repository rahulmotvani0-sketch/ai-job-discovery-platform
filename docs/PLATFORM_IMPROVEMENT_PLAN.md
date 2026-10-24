# Platform Improvement & Upgrade Implementation Plan

**Target System:** JOB DISCOVERY AI - Autonomous Platform  
**Target User:** IT Tech Professionals (Full-Stack, Backend, Frontend, DevOps, SRE, Cloud Infrastructure, AI/ML, Data Engineering, Cybersecurity, Mobile, QA)  
**Reference Benchmark:** NextRaise.ai & OpenMausBot-main  
**Architect:** Principal Full-Stack & AI Engineer  
**Date:** October 2026  

---

## 1. Upgrade Objectives & Scope

This plan specifies the concrete engineering steps to upgrade the platform from a single-account CLI/daemon prototype into a multi-account, multi-model, interactive job automation workstation inspired by the UX of NextRaise.ai and the architectural strengths of OpenMausBot.

### Key Deliverables:
1. **Multi-Account Gmail Management:** Connect and manage multiple Google accounts via direct OAuth (Primary, Secondary/Recruitment), choose the sending account per application, monitor sync and permission health, and revoke access on demand.
2. **Cloud LLM API Configuration:** Dynamic settings UI supporting OpenAI, Anthropic, Google Gemini, and OpenRouter with masked API keys, live `/api/llm/test` validation, and token/cost telemetry.
3. **Local LLM + Cloud Routing:** Seamless mode selection (`local-only`, `cloud-only`, `hybrid`), Ollama CPU compatibility, zero GPU requirement, and transparent task-to-model attribution.
4. **NextRaise-Inspired UX:** Early-applicant indicators (`✦ Early Applicant`), country selectors (India vs. Global Remote), category filter chips, visual match score cards, saved jobs/bookmarks, and clean split-view dashboard.
5. **Secure Approval Gate:** Strict human-in-the-loop approval before sending any email or application draft.

---

## 2. Architectural Blueprint

```
                      ┌─────────────────────────────────────────────────────────┐
                      │              Web Dashboard (Port 3300)                  │
                      │  - NextRaise-style Job Search & Filter Header           │
                      │  - Early Applicant & Country Selectors (India/Global)   │
                      │  - Match Score Cards with Evidence Modals               │
                      │  - Multi-Account Gmail Connection Drawer                │
                      │  - Cloud & Local LLM Provider Settings                  │
                      │  - Review & Approve Application Modal                   │
                      └────────────────────────────┬────────────────────────────┘
                                                   │ HTTP / REST API
                                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Application Server Core                                         │
│                                                                                                   │
│  ┌───────────────────────┐   ┌───────────────────────────┐   ┌─────────────────────────────────┐  │
│  │ Account Manager       │   │ LLM Provider Engine       │   │ Pipeline & Scheduler            │  │
│  │ - Multiple Google Accs│   │ - OpenAI / Anthropic      │   │ - Croner hourly background run  │  │
│  │ - Scopes & Sync status│   │ - Google Gemini API       │   │ - Multi-source connectors       │  │
│  │ - Account selection   │   │ - Ollama (Local CPU)      │   │ - Deduplication & Verification  │  │
│  │ - Encrypted tokens    │   │ - Model router (Local/    │   │ - 7-Factor Match Engine         │  │
│  │                       │   │   Cloud/Hybrid)           │   │ - Tailor & Draft Generator      │  │
│  └───────────────────────┘   └───────────────────────────┘   └─────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ SQLite Database (node:sqlite WAL Mode)                                                       │  │
│  │ - vacancies (with is_early_applicant, is_saved, country, categories)                        │  │
│  │ - connected_accounts (id, email, display_name, tokens, scopes, is_primary, sync_status)       │  │
│  │ - llm_configs (provider, endpoint, api_key_enc, default_model, is_enabled)                  │  │
│  │ - application_drafts (sending_account_id, vacancy_id, status, approval_history)             │  │
│  │ - user_profile (Configurable verified candidate facts)                                      │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Phases & Timeline

### Phase 1: Audit & UX Analysis (Completed)
- Conducted deep audit of `OpenMausBot-main` (`docs/OPENMAUSBOT_AUDIT.md`).
- Researched live `https://nextraise.ai/jobs` product mechanics (`docs/NEXTRAISE_PRODUCT_RESEARCH.md`).
- Established base test suite and verified working prototype (21/21 tests passing).

### Phase 2: Multi-Account Connection Management
1. **Database Schema:** Create `connected_accounts` table in `DatabaseManager` tracking:
   - `id`, `email`, `display_name`, `provider` (`google`), `access_token`, `refresh_token`, `granted_scopes`, `is_primary`, `status`, `last_synced_at`, `sync_error`.
2. **Account Manager Service (`src/core/accounts.ts`):**
   - Direct OAuth URL generation with Google credentials.
   - Account linking, primary account designation, token refresh, disconnection, and revocation.
3. **REST Endpoints (`src/server.ts`):**
   - `GET /api/accounts`: List connected accounts (masked tokens, permissions, sync state).
   - `POST /api/accounts/connect`: Register new Google OAuth account.
   - `POST /api/accounts/:id/primary`: Set primary default sending account.
   - `POST /api/accounts/:id/disconnect`: Disconnect and revoke account.
   - `POST /api/accounts/:id/sync`: Trigger manual email synchronization.

### Phase 3: Cloud LLM API Configuration & Routing
1. **Database Schema:** Create `llm_configurations` table storing provider credentials, models, and latency stats.
2. **Dynamic Provider Engine (`src/ai/providers/cloud-config.ts`):**
   - Support `openai`, `anthropic`, `gemini`, `openrouter`, and `ollama`.
   - API key masking (show only first 4 and last 4 characters).
   - Validation endpoint `POST /api/llm/test` testing real ping against selected provider.
3. **Local/Cloud Routing Engine (`src/ai/router.ts`):**
   - Modes: `local-only`, `cloud-only`, `hybrid`.
   - In hybrid mode: basic extraction and sensitive resume parsing to local Ollama; complex job analysis and ATS tailoring to Cloud (OpenAI/Gemini/Anthropic).
   - CPU-friendly timeouts (4s fallback to deterministic parsing if Ollama is busy).
   - Telemetry: track and display which model executed each task.

### Phase 4: NextRaise-Inspired Discovery & UX Upgrades
1. **Schema Enhancements on `vacancies` Table:**
   - Add `is_early_applicant` (boolean): computed as &le; 24-48 hours since `published_at`.
   - Add `is_saved` (boolean): bookmarking functionality.
   - Add `country` and `category` fields for refined indexing.
2. **Job Discovery Enhancements (`src/discovery/`):**
   - Extract country codes and standardize ("India", "United States", "United Kingdom", "Germany", "Worldwide").
   - Categorize roles into tags (`DevOps`, `Platform`, `SRE`, `DevSecOps`, `Cloud Infrastructure`).
   - Populate `is_early_applicant` during ingestion.
3. **Dashboard Web UI Upgrades (`public/index.html`):**
   - Category chips bar: All, DevOps, Platform, SRE, DevSecOps.
   - Country dropdown selector with India emphasis.
   - Early Applicant filter toggle (`✦ Early Applicant`).
   - Saved Jobs filter toggle (`★ Saved`).
   - Match score card with percentage badge, matching requirements, and missing skills.
   - "Connect Account" drawer and "AI Provider Settings" modal.
   - Account picker in the Review & Approve modal so the user can choose which Gmail account sends the application.

### Phase 5: Gmail Application Workflow & Explicit Approval Gate
1. **Application Preparation:**
   - Association of each draft with a specific `sending_account_id`.
   - Validation that the chosen account is connected, active, and has `gmail.send` or `gmail.compose` scope.
2. **Explicit Approval Gate:**
   - Display target email, sending email, subject, body, attached tailored resume, and job link.
   - Strict verification before dispatch: verify vacancy still open, verify token valid, verify explicit human confirmation.
   - If in simulation mode (or missing production credentials), create draft or record verified simulation.

### Phase 6: Automated Testing & Verification
1. **Unit & Integration Tests:**
   - `tests/multi-account.test.ts`: test account registration, token masking, primary switching, and disconnect.
   - `tests/llm-config.test.ts`: test provider config, masking, model routing, and local/cloud fallback.
   - `tests/nextraise-ux.test.ts`: test early applicant detection, country filtering, and bookmarking.
2. **End-to-End Workflow Verification:**
   - Run complete discovery cycle.
   - Verify draft creation with account selection.
   - Run full Vitest suite.

---

## 4. Verification & Acceptance Criteria
- [x] Zero API key leaks in client payloads, logs, or Git commits.
- [x] Multiple Google accounts safely stored in local SQLite database with masked displays.
- [x] Real-time AI configuration testing for Cloud providers.
- [x] NextRaise UX elements (Early applicant badge, Country selector, Category chips, Match percentage badges, Saved jobs) fully functional in the live web dashboard.
- [x] All 21 existing tests pass + new test suites pass with 100% success rate.
