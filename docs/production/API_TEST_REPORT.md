# API Contract & Endpoint Test Report: JOB DISCOVERY AI Autonomous Platform

**Document Version:** 1.0.0  
**Generated Date:** 2026-10-24  
**Auditor:** Principal Software Architect & DevSecOps Lead  
**Server Implementation:** `src/server.ts` (`node:http`)  

---

## 1. API Route Master Ledger

| Endpoint Path | HTTP Method | Auth Required | Request Payload Schema | Response Payload Schema | Expected Status | Database Effects | Automated Test | Result |
|---|---|---|---|---|---|---|---|---|
| `/health/live` | `GET` | No | None | `{ status: "alive", uptimeSeconds: number, timestamp: string }` | 200 | None | `tests/security-reliability.test.ts` | **PASS** |
| `/health/ready` | `GET` | No | None | `{ status: "ready", database: string, scheduler: string }` | 200, 503 | Read `vacancies` | `tests/security-reliability.test.ts` | **PASS** |
| `/api/health` | `GET` | No | None | `{ status: string, version: string, scheduler: object, inferenceMode: string }` | 200 | None | `tests/security-reliability.test.ts` | **PASS** |
| `/api/metrics` | `GET` | No | None | `{ system: object, pipeline: object, scheduler: object }` | 200 | Read counts | `tests/security-reliability.test.ts` | **PASS** |
| `/api/dashboard/metrics` | `GET` | No | None | `{ totalVacancies: number, qualifiedMatches: number, pendingReview: number, ... }` | 200 | Read aggregation | `tests/e2e-workflow.test.ts` | **PASS** |
| `/api/profile` | `GET` | No | None | `UserProfile` JSON | 200 | Read `user_profile` | `tests/foundation.test.ts` | **PASS** |
| `/api/profile` | `POST` | If token set | `UserProfile` JSON | `{ success: true }` | 200, 400, 401 | Upsert `user_profile` | `tests/foundation.test.ts` | **PASS** |
| `/api/profile/upload-resume` | `POST` | If token set | `{ resumeContent: string }` | `{ success: true, profile: UserProfile }` | 200, 400 | Update `user_profile` | `tests/pdf-generator.test.ts` | **PASS** |
| `/api/preferences` | `GET` | No | None | `JobPreferences` JSON | 200 | Read `job_preferences` | `tests/foundation.test.ts` | **PASS** |
| `/api/preferences` | `POST` | If token set | `JobPreferences` JSON | `{ success: true }` | 200, 400, 401 | Upsert `job_preferences` | `tests/foundation.test.ts` | **PASS** |
| `/api/vacancies` | `GET` | No | Query: `?status=...` | `Vacancy[]` | 200 | Read `vacancies` | `tests/discovery.test.ts` | **PASS** |
| `/api/vacancies/:id` | `GET` | No | Path param `:id` | `Vacancy` JSON | 200, 404 | Read `vacancies` | `tests/discovery.test.ts` | **PASS** |
| `/api/vacancies/:id/bookmark` | `POST` | If token set | None | `{ success: true, isSaved: boolean }` | 200, 404 | Update `vacancies` | `tests/discovery.test.ts` | **PASS** |
| `/api/discovery/scan` | `POST` | If token set | None | `{ success: true, count: number }` | 200, 401 | Insert `vacancies` | `tests/discovery.test.ts` | **PASS** |
| `/api/drafts` | `GET` | No | None | `ApplicationDraft[]` | 200 | Read `application_drafts` | `tests/e2e-workflow.test.ts` | **PASS** |
| `/api/drafts/:id/approve` | `POST` | If token set | None | `{ success: true, submissionId: string }` | 200, 400, 401, 404 | Insert `application_submissions`, `audit_events` | `tests/e2e-workflow.test.ts` | **PASS** |
| `/api/drafts/:id/reject` | `POST` | If token set | `{ notes?: string }` | `{ success: true }` | 200, 401, 404 | Update `application_drafts`, `audit_events` | `tests/foundation.test.ts` | **PASS** |
| `/api/accounts` | `GET` | No | None | `PublicAccountView[]` | 200 | Read `connected_accounts` | `tests/multi-account.test.ts` | **PASS** |
| `/api/accounts` | `POST` | If token set | `{ email: string, ... }` | `PublicAccountView` | 200, 400, 401 | Insert `connected_accounts` | `tests/multi-account.test.ts` | **PASS** |
| `/api/accounts/:id/primary` | `POST` | If token set | None | `{ success: true }` | 200, 401, 404 | Update `connected_accounts` | `tests/multi-account.test.ts` | **PASS** |
| `/api/accounts/:id` | `DELETE` | If token set | None | `{ success: true }` | 200, 401, 404 | Delete `connected_accounts` | `tests/multi-account.test.ts` | **PASS** |
| `/api/accounts/auth-url` | `GET` | No | None | `{ url: string }` | 200 | None | `tests/google-oauth.test.ts` | **PASS** |
| `/oauth2callback` | `GET` | No | Query: `?code=...&state=...` | Redirect or HTML | 302, 400 | Insert tokens | `tests/google-oauth.test.ts` | **PASS** |
| `/api/ai/config` | `GET` | No | None | `LLMConfiguration[]` (keys masked) | 200 | Read `llm_configurations` | `tests/llm-config.test.ts` | **PASS** |
| `/api/ai/config` | `POST` | If token set | `{ provider: string, apiKey?: string, ... }` | `{ success: true }` | 200, 400, 401 | Upsert `llm_configurations` | `tests/llm-config.test.ts` | **PASS** |
| `/api/ai/test` | `POST` | If token set | `{ provider: string }` | `{ success: boolean, status: string }` | 200, 401 | Test external LLM API | `tests/llm-config.test.ts` | **PASS** |
| `/api/ai/inference-mode` | `POST` | If token set | `{ mode: 'local-only' \| 'cloud-only' \| 'hybrid' }` | `{ success: true }` | 200, 400, 401 | Save router mode | `tests/llm-config.test.ts` | **PASS** |
| `/api/audit-logs` | `GET` | No | None | `AuditEvent[]` | 200 | Read `audit_events` | `tests/foundation.test.ts` | **PASS** |
| `/api/orchestrator/run` | `POST` | If token set | None | `{ success: true }` | 200, 401 | Pipeline iteration | `tests/e2e-workflow.test.ts` | **PASS** |
| `/api/resumes/:filename` | `GET` | No | Path param `:filename` | PDF (`application/pdf`) or Markdown | 200, 404 | Local disk read | `tests/pdf-generator.test.ts` | **PASS** |
| `/api/resumes/generate-pdf`| `POST` | If token set | `{ applicantName?: string, markdownContent?: string }` | `{ success: true, downloadUrl: string }` | 200, 400 | Generate PDF to disk | `tests/pdf-generator.test.ts` | **PASS** |
| `/api/notifications/status`| `GET` | No | None | `{ telegram: boolean, discord: boolean, minScore: number }` | 200 | Read config | `tests/alert-manager.test.ts` | **PASS** |
| `/api/notifications/test` | `POST` | If token set | None | `{ success: boolean, results: object }` | 200, 401 | Dispatch test alert | `tests/alert-manager.test.ts` | **PASS** |
| `/api/resume/upload-and-discover` | `POST` | If token set | `{ fileName, fileBase64, consentGiven, minMatchScore }` | `{ success: true, runId, profile, adjacentQueries }` | 200, 400 | Save profile & `discovery_runs` | `tests/resume-discovery.test.ts` | **PASS** |
| `/api/discovery/runs/:id` | `GET` | No | None | `DiscoveryRun` JSON (step, status, stats) | 200, 404 | Read `discovery_runs` | `tests/resume-discovery.test.ts` | **PASS** |
| `/api/discovery/runs` | `GET` | No | None | `DiscoveryRun[]` (recent 20 runs) | 200 | Read `discovery_runs` | `tests/resume-discovery.test.ts` | **PASS** |
| `/api/discovery/threshold` | `GET` | No | None | `{ minMatchScore: number }` | 200 | Read `job_preferences` | `tests/resume-discovery.test.ts` | **PASS** |
| `/api/discovery/threshold` | `POST` | If token set | `{ minMatchScore: number }` | `{ success: true, minMatchScore }` | 200, 400 | Update `job_preferences`, `match_evaluations` | `tests/resume-discovery.test.ts` | **PASS** |
| `/api/discovery/recurring` | `POST` | If token set | `{ enabled: boolean }` | `{ success: true, hourlyDiscoveryEnabled }` | 200 | Start/stop background scheduler | `tests/resume-discovery.test.ts` | **PASS** |
| `/api/matches` | `GET` | No | Query: `?minScore=75&country=...` | `{ matches: MatchScoreEvaluation[], count }` | 200 | Read `match_evaluations` & `vacancies` | `tests/resume-discovery.test.ts` | **PASS** |
| `/api/matches/:id/explanation` | `GET` | No | Path param `:id` | `{ vacancy, match, scoringCriteria }` | 200, 404 | Read `match_evaluations` & `vacancies` | `tests/resume-discovery.test.ts` | **PASS** |
| `/api/matches/:id/recalculate` | `POST` | If token set | None | `{ success: true, match }` | 200, 404 | Recalculate & update `match_evaluations` | `tests/resume-discovery.test.ts` | **PASS** |
| `/api/profile/resume` | `DELETE` | If token set | None | `{ success: true, profile }` | 200 | Reset `user_profile` & audit | `tests/resume-discovery.test.ts` | **PASS** |
| `/` | `GET` | No | None | HTML UI (`public/index.html`) | 200 | None | Manual & Browser inspection | **PASS** |


---

## 2. API Security Controls Verified
- **Rate Limiting:** Enforced via `InMemoryRateLimiter` (300 requests/minute per client IP), returning HTTP 429 when breached.
- **Payload Size Limits:** Max 2MB request body; requests exceeding 2MB are rejected with HTTP 413.
- **JSON Syntax Validation:** Malformed JSON returns HTTP 400 with actionable error messages rather than unhandled server crashes.
- **Path Traversal Protection:** Resume downloads enforce `basename(filename)`, preventing `../` directory traversal exploits.
