# Connector & External Integration Test Report: JOB DISCOVERY AI Autonomous Platform

**Document Version:** 1.0.0  
**Generated Date:** 2026-10-24  
**Auditor:** Principal Software Architect & QA Automation Lead  

---

## 1. Overview & Verification Strategy

The platform integrates with 17 external services across 5 distinct domains:
1. **Public ATS & Job APIs** (8 connectors)
2. **Google Workspace APIs** (Gmail, Drive, Sheets)
3. **Cloud LLM Providers** (OpenAI, Gemini, Anthropic)
4. **Local LLM Engine** (Ollama)
5. **Mobile Push Alert Networks** (Telegram, Discord)

Every connector was tested against configuration validation, timeout resilience, malformed response handling, token sanitization, and fallback behavior.

---

## 2. Connector Master Test Ledger

| Connector ID | Category | Target Service / Protocol | Auth Mechanism | Read Operation | Write Operation | Timeout & Rate Limit Handling | Mock / Offline Fallback | Test Status |
|---|---|---|---|---|---|---|---|---|
| **CONN-001** | Job Discovery | Greenhouse Public ATS API (`boards-api.greenhouse.io`) | Public / No Auth | HTTP GET JSON (Board & vacancy parsing) | N/A (Read-only) | 10s timeout, exponential backoff | Yes (Simulation feed on HTTP 429/500) | **PASS** |
| **CONN-002** | Job Discovery | Lever Public API (`api.lever.co/v0/postings`) | Public / No Auth | HTTP GET JSON | N/A (Read-only) | 10s timeout, try/catch recovery | Yes | **PASS** |
| **CONN-003** | Job Discovery | Ashby Public Job Board API (`jobs.ashbyhq.com/api`) | Public / No Auth | HTTP GET JSON | N/A (Read-only) | 10s timeout, non-blocking | Yes | **PASS** |
| **CONN-004** | Job Discovery | Workable Company Boards API (`apply.workable.com/api`) | Public / No Auth | HTTP GET JSON | N/A (Read-only) | 10s timeout, non-blocking | Yes | **PASS** |
| **CONN-005** | Job Discovery | Y Combinator Startups Aggregator | Public / No Auth | HTTP GET JSON | N/A (Read-only) | 10s timeout, non-blocking | Yes | **PASS** |
| **CONN-006** | Job Discovery | Jobicy Remote API (`jobicy.com/api/v2/remote-jobs`) | Public / No Auth | HTTP GET JSON | N/A (Read-only) | 10s timeout, non-blocking | Yes | **PASS** |
| **CONN-007** | Job Discovery | RemoteOK API (`remoteok.com/api`) | Public / No Auth | HTTP GET JSON | N/A (Read-only) | 10s timeout, custom User-Agent | Yes | **PASS** |
| **CONN-008** | Job Discovery | Himalayas Remote API (`himalayas.app/jobs/api`) | Public / No Auth | HTTP GET JSON | N/A (Read-only) | 10s timeout, non-blocking | Yes | **PASS** |
| **CONN-009** | Google Workspace | Gmail API (`gmail.googleapis.com`) | OAuth 2.0 Bearer Token | Message search, thread snippet | Draft creation, authorized email send | Handled via OAuth refresh token | Mock Mode in test/staging; live send guarded by Approval Gate | **PASS** |
| **CONN-010** | Google Workspace | Google Drive API (`www.googleapis.com/drive/v3`) | OAuth 2.0 Bearer Token | Folder existence check | Tailored resume upload & metadata tagging | Token auto-refresh, non-blocking | Mock Mode in test/staging | **PASS** |
| **CONN-011** | Google Workspace | Google Sheets API (`sheets.googleapis.com/v4`) | OAuth 2.0 Bearer Token | Pipeline sheet verification | Append row (Company, Role, Score, Status) | Deduplication check before append | Mock Mode in test/staging | **PASS** |
| **CONN-012** | Cloud LLM | OpenAI API (`api.openai.com/v1`) | Bearer API Key | Available models list | Chat Completion (`gpt-4o`, `gpt-4o-mini`) | 30s timeout, quota exhaustion handling | Graceful fallback to Local Ollama | **PASS** |
| **CONN-013** | Cloud LLM | Google Gemini API (`generativelanguage.googleapis.com`) | `x-goog-api-key` header | Model check | GenerateContent (`gemini-2.5-flash`, `gemini-2.5-pro`) | 30s timeout, error logging | Graceful fallback to Local Ollama | **PASS** |
| **CONN-014** | Cloud LLM | Anthropic API (`api.anthropic.com/v1`) | `x-api-key` header | Model check | Messages (`claude-3-5-sonnet`) | 30s timeout, rate limit handling | Graceful fallback to Local Ollama | **PASS** |
| **CONN-015** | Local LLM | Ollama Local Engine (`localhost:11434`) | None (Local socket/HTTP) | Tags & model discovery (`/api/tags`) | Generate / Chat (`/api/chat`) | 60s timeout, offline detection | Offline rule-based heuristic analyzer | **PASS** |
| **CONN-016** | Alerts | Telegram Bot API (`api.telegram.org`) | Bot Token URL Parameter | N/A (Push-only) | `sendMessage` (HTML formatted card) | 5s timeout, non-blocking pipeline | Safe offline simulation mode | **PASS** |
| **CONN-017** | Alerts | Discord Webhook API (`discord.com/api/webhooks`) | Webhook URL Token | N/A (Push-only) | Webhook POST with rich embed card | 5s timeout, non-blocking pipeline | Safe offline simulation mode | **PASS** |

---

## 3. Operational Integrity & Security Proof

1. **Zero Secret Leakage:**
   - Unit tests in `tests/foundation.test.ts` and `tests/llm-config.test.ts` verify that neither raw OAuth tokens nor cloud API keys are rendered in JSON logs or exposed to frontend client views.
2. **Approval Gate Enforcement:**
   - Under no circumstances does the system submit an application or dispatch an email without explicit human approval in `src/applications/approval-gate.ts`.
3. **Resilience to Upstream Outages:**
   - If an external ATS returns an HTTP 500 or rate limits (HTTP 429), the orchestrator catches the exception at the connector boundary, logs a warning, and continues scraping other configured sources without interrupting the platform.
