# System Architecture & Vulnerability Audit Report

**Application:** JOB DISCOVERY AI — Autonomous Platform  
**Audit Date:** October 2026  
**Auditor:** Principal Software Architect & Lead Security Engineer  

---

## 1. Architectural Overview

- **Backend Framework:** Node.js native HTTP server (`src/server.ts`) with custom modular routing, zero bloated external frameworks.
- **Database Engine:** Embedded SQLite via `node:sqlite` (`DatabaseSync`), configured with WAL mode (`PRAGMA journal_mode = WAL;`) and strict foreign keys (`src/core/database.ts`).
- **Frontend Layer:** Responsive single-page application (`public/index.html`) using Vanilla CSS design tokens, custom components, and native asynchronous Fetch APIs.
- **Job Discovery Engine:** Modular connector pipeline (`src/discovery/connectors/manager.ts`) supporting ATS scraping (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, YCombinator) and remote tech APIs (RemoteOK, Remotive, Jobicy, Himalayas, USAJobs, Adzuna).
- **AI Matching & Ingestion:** `ResumeIntelligenceEngine` (`src/applications/resume-intelligence.ts`), `MatchScorerAgent` (`src/ai/matching.ts`), and `ModelRouter` (`src/ai/providers/router.ts`).
- **Security & Approval Gate:** `ApprovalGatekeeper` (`src/applications/approval-gate.ts`) enforcing human-in-the-loop review before any external transmission.

---

## 2. Identified Defects & Root Causes

### A. Duplicate Job Records & Seniority Invalidation
1. **Destructive Seniority Stripping in Title Normalization:**
   - **Location:** `src/discovery/deduplication.ts:37`
   - **Code:** `.replace(/\b(senior|sr|lead|junior|jr|staff|principal|i|ii|iii|iv)\b/g, '')`
   - **Problem:** Merged distinct positions at the same employer (e.g., "Junior DevOps Engineer" vs. "Senior DevOps Engineer") into the exact same canonical hash!
2. **Ignoring Application URLs & Requisitions:**
   - **Location:** `src/discovery/deduplication.ts:65`
   - **Problem:** `computeCanonicalHash` only hashed `company|title|location`, completely ignoring canonical application URLs or requisition IDs.
3. **Non-Atomic Ingestion Race Condition:**
   - **Location:** `src/core/database.ts:449-480`
   - **Problem:** Checked `getVacancyByCanonicalHash` followed by `INSERT` without database-level atomic UPSERT, allowing concurrent ingestion workers to fail with SQLite constraint exceptions.

### B. Broken Gmail Disconnection & Fake Account States
1. **Absence of Real Disconnect Logic:**
   - **Location:** `src/core/accounts.ts:121` & `src/core/database.ts:1146`
   - **Problem:** Disconnecting an account simply updated `status = 'DISCONNECTED'`. However, `is_primary` was not reassigned if the disconnected account was primary. In `public/index.html:3383`, the account card still rendered with a green status pill and maintained the "Disconnect" and "Sync" action buttons.
2. **Unauthenticated Fake Account State:**
   - **Location:** `data/job_platform.db` (table `connected_accounts`)
   - **Problem:** Contained 3 seeded accounts (`candidate.primary@example.com`, `candidate.recruitment@example.com`, `candidate.secondary@example.com`) with `access_token = NULL` and `refresh_token = NULL`, yet falsely marked as `CONNECTED`.
3. **No Remote Token Revocation:**
   - **Location:** `src/integrations/google/oauth.ts`
   - **Problem:** Lacked `revokeToken()` calling `https://oauth2.googleapis.com/revoke` to invalidate Google OAuth sessions upon disconnection.

### C. Metric Discrepancy: Qualified Matches Exceeded Total Discovered
1. **Multiplying JOIN on Non-Unique Match Evaluations:**
   - **Location:** `src/core/database.ts:947`
   - **Code:** `SELECT COUNT(*) as c FROM vacancies v JOIN match_evaluations m ON v.id = m.vacancy_id WHERE m.overall_score >= 75`
   - **Root Cause:** `match_evaluations` had multiple historical evaluation rows per vacancy (616 evaluations for 165 vacancies). A non-distinct join counted every evaluation record, reporting **493** qualified matches for only **39** distinct qualified vacancies, exceeding `totalDiscovered` (165)!
   - **Fix:** Query `SELECT COUNT(DISTINCT v.id) FROM vacancies v JOIN match_evaluations m ON v.id = m.vacancy_id WHERE m.overall_score >= 75 AND v.status != 'ARCHIVED' AND v.status != 'IGNORED'`.

### D. Resume Upload Format & Parsing Shortcomings
1. **Frontend Input Restriction:**
   - **Location:** `public/index.html:1660`
   - **Code:** `<input type="file" id="resume-file-input" accept=".md,.txt,.json">` and `reader.readAsText(file)`
   - **Problem:** Failed on binary formats (`.pdf` and `.docx`) because files were read as UTF-8 text strings rather than Base64.
2. **Missing Pre-Save Review:**
   - **Problem:** Direct upload immediately overwrote profile without letting candidate review and edit parsed identity, skills, experiences, and education.

### E. Missing UI Configuration for Notifications
1. **Missing Backend Notification Config Endpoints:**
   - **Problem:** Telegram and Discord credentials could only be set via environment variables. Missing database persistence for notification preferences.

### F. Application Submission Safety
1. **Simulated Submission Falsely Recorded as SENT:**
   - **Location:** `src/integrations/google/gmail.ts:90-110`
   - **Problem:** When OAuth credentials were not configured, calling `sendApprovedApplication` fabricated mock IDs (`gmail_msg_...`) and recorded the application as sent. It must fail safely or mark as `REQUIRES_MANUAL_SUBMISSION`.

---

## 3. Required Verification Suite

| Area | Test Suite | Target Scenarios |
| :--- | :--- | :--- |
| **Deduplication** | `tests/deduplication-service.test.ts` | URL tracking parameter stripping, preserving seniority distinctions (Senior vs. Junior), distinct requisition IDs, cross-source canonical identity, atomic UPSERT concurrency, database migration cleanup. |
| **Resume Upload & Parsing** | `tests/resume-parsing.test.ts` | PDF text extraction, DOCX extraction, Markdown, Plain Text, corrupted file rejection, file size limit (5MB), non-destructive profile review diff. |
| **Gmail OAuth & Accounts** | `tests/gmail-accounts.test.ts` | True connection verification, token revocation, primary reassignment on disconnect, deletion, unauthenticated sync rejection. |
| **Metrics & Truthful State** | `tests/metrics-integrity.test.ts` | Mathematical consistency (`totalQualified <= totalDiscovered`), single evaluation per vacancy, truthful submission and interview counts. |
| **UI Notification Configuration** | `tests/notification-config.test.ts` | UI config persistence, credential masking, test notification dispatch, error handling. |
