# Architecture Specification: AI Resume-Based Automatic Job Discovery

**Component:** AI Resume Intelligence & Autonomous Job Discovery Subsystem  
**Application:** JOB DISCOVERY AI Autonomous Platform  
**Document Version:** 1.0.0  
**Updated:** 2026-10-24  
**Author:** Principal Software Architect & QA Automation Lead  

---

## 1. Architectural Overview

The **AI Resume-Based Automatic Job Discovery** subsystem empowers the candidate to upload a resume in industry-standard formats (PDF, DOCX, Text, Markdown), automatically extract technical credentials and experience, expand target job queries, and autonomously discover, evaluate, and rank matching opportunities across 8 configured real ATS connectors.

Only vacancies with a verified composite match score of **75.00% or higher** qualify for the personalized candidate feed. The system operates strictly with real job feeds and never generates simulated vacancies or fabricates listing data.

```
+-----------------------------------------------------------------------------------------+
|                                    USER EXPERIENCE                                      |
|                                                                                         |
|   +-------------------+      +-------------------------+      +---------------------+   |
|   | 1. Candidate      | ---> | 2. Explicit User        | ---> | 3. Auto-Discovery   |   |
|   |    Resume Upload  |      |    Consent Checkbox     |      |    Triggered        |   |
|   +-------------------+      +-------------------------+      +---------------------+   |
+-----------------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------------+
|                               7-STAGE STATE MACHINE ENGINE                              |
|                                                                                         |
|   [1. RESUME_UPLOADED]                                                                  |
|            |                                                                            |
|            v                                                                            |
|   [2. EXTRACTING_RESUME_INFO]  <-- PDFParse / AdmZip (DOCX) / Text Normalizer           |
|            |                                                                            |
|            v                                                                            |
|   [3. ANALYZING_CANDIDATE_PROFILE] <-- Taxonomy Extraction & Dynamic Adjacent Queries  |
|            |                                                                            |
|            v                                                                            |
|   [4. SEARCHING_JOB_SOURCES]   <-- 8 Real ATS Connectors (Greenhouse, Lever, etc.)      |
|            |                                                                            |
|            v                                                                            |
|   [5. EVALUATING_JOB_MATCHES]  <-- 7-Dimension Scoring Engine & Hard Constraints Excl. |
|            |                                                                            |
|            v                                                                            |
|   [6. SAVING_QUALIFYING_JOBS]  <-- Inclusive 75% Rule (overallScore >= 75.00)           |
|            |                                                                            |
|            v                                                                            |
|   [7. SEARCH_COMPLETED]        <-- Discovered, Evaluated, and Qualified Counts Stored   |
+-----------------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------------+
|                              PERSONALIZED MATCH DASHBOARD                               |
|                                                                                         |
|   - Real-Time Progress Stepper (Active & Completed Nodes, Percentage Fill Bar)          |
|   - Interactive Match Threshold Slider (Default 75%, Instant Filter & Recalculate)      |
|   - Match Explanation Modal (7 Category Bars, Matched/Missing Skills, Raw Evidence)    |
|   - Hourly Discovery Scheduler Toggle (Background Automation)                           |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Multi-Format Resume Parsing Engine

The extraction module resides in `src/applications/resume-intelligence.ts` (`ResumeIntelligenceEngine`). It adheres to defense-in-depth principles:

### Supported Document Types
1. **Adobe Portable Document Format (PDF):**
   - Extracted using `pdf-parse`.
   - Strips binary control characters while preserving natural line endings and structural whitespace.
2. **Microsoft Word OpenXML (DOCX):**
   - Extracted using `adm-zip` without spawning external shell processes.
   - Extracts the internal `word/document.xml` stream, strips XML tags via regex (`/<[^>]+>/g`), and unescapes XML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`).
3. **Plain Text and Markdown (.txt, .md):**
   - Decoded via standard UTF-8 buffer parsing.

### Strict Security Validation Rules
- **Size Limitation:** Payloads exceeding 5 megabytes (`5 * 1024 * 1024` bytes) are rejected with HTTP 400.
- **Empty Document Guard:** Documents with less than 20 non-whitespace characters are rejected.
- **Path Traversal Protection:** All filenames are processed through `basename()` before logging or temporary staging.
- **Memory Safety:** In-memory buffer parsing avoids disk writes for initial analysis, preventing temporary file leaks.

---

## 3. Structured Candidate Profile & Query Expansion

The resume intelligence engine separates **provable facts** from **inferred metadata**:

### Factual Extraction
- **Contact Facts:** Full name, primary email address, phone number, and location string.
- **Technical Skills:** Matched deterministically against a comprehensive 60+ item taxonomy spanning:
  - *Container & Cloud:* Docker, Kubernetes, AWS, GCP, Azure, Terraform, Helm, OpenShift.
  - *CI/CD & Automation:* GitHub Actions, GitLab CI, Jenkins, ArgoCD, Ansible.
  - *Observability:* Prometheus, Grafana, Datadog, OpenTelemetry, ELK.
  - *Programming:* Python, Go, TypeScript, Bash, SQL.
  - *Security & Infrastructure:* Linux, DevSecOps, SRE, Vault.
- **Work History:** Job titles, company names, start/end dates, and responsibilities.
- **Education:** Degree level, university/institution, and graduation year.

### Inference & Query Expansion
- **Seniority Assessment:** Calculates total career tenure; maps to `Junior`, `Mid`, `Senior`, `Lead`, or `Staff/Principal`.
- **Adjacent Role Generation:** Dynamically generates lateral and complementary search queries (e.g., a candidate with Kubernetes, Terraform, and Python receives search terms: `DevOps Engineer`, `Platform Engineer`, `Site Reliability Engineer`, and `Cloud Infrastructure Engineer`).

---

## 4. Real-Time Task Progress State Machine

To provide absolute transparency during asynchronous operations, discovery execution transitions sequentially through **7 distinct task states**:

| State Index | State Identifier | Description & Progress Callback Message | Stepper UI Indication |
|:---:|---|---|---|
| **1** | `RESUME_UPLOADED` | Resume document validated, checked for security, and stored. | Step 1 active / completed |
| **2** | `EXTRACTING_RESUME_INFO` | Extracting contact facts, work history, education, and credentials from document. | Step 2 active (pulse) |
| **3** | `ANALYZING_CANDIDATE_PROFILE` | Structured candidate profile saved. Adjacent role queries generated. | Step 3 active (pulse) |
| **4** | `SEARCHING_JOB_SOURCES` | Executing live discovery scan across configured connectors. | Step 4 active (pulse) |
| **5** | `EVALUATING_JOB_MATCHES` | Evaluating candidate-to-job match scores using 7-dimension criteria and hard constraints. | Step 5 active (pulse) |
| **6** | `SAVING_QUALIFYING_JOBS` | Saved verified qualifying job(s) scoring >= 75% with match evidence breakdown. | Step 6 active (pulse) |
| **7** | `SEARCH_COMPLETED` | AI resume discovery completed successfully: N discovered, N evaluated, N qualified. | Step 7 completed (green) |

The state transitions are persisted in the `discovery_runs` table (`current_step`, `step_message`, `status`, `total_sources`, `discovered_count`, `evaluated_count`, `qualified_count`, `min_score_threshold`).

Clients poll `GET /api/discovery/runs/:id` every 700ms to drive the frontend stepper and live counter chips.

---

## 5. 7-Dimension Match Scoring Engine & Inclusive 75% Rule

Every active job listing is evaluated across a multi-dimensional rubric totaling 100 points:

| Dimension | Description | Max Points |
|---|---|:---:|
| **1. Technical Skills** | Direct match between vacancy requirements and candidate technical credentials. | 30 |
| **2. Experience & Seniority** | Alignment between candidate years of experience and vacancy requirements. | 20 |
| **3. Responsibilities Scope** | Semantic alignment with daily duties and engineering ownership. | 15 |
| **4. Cloud & Systems Domain** | Depth in relevant cloud platforms, Linux internals, and architecture. | 10 |
| **5. Location & Remote Flexibility** | Candidate residency compatibility and remote work allowance. | 10 |
| **6. Compensation Alignment** | Salary range meets or exceeds candidate minimums (or neutral baseline). | 10 |
| **7. Practical & Contract Fit** | Full-time vs contract alignment and educational background. | 5 |
| **TOTAL** | **Composite Maximum Score** | **100** |

### The Inclusive 75% Qualification Rule
- To eliminate floating-point precision discrepancies, scores are calculated with 2-decimal precision (`Math.round(score * 100) / 100`).
- Qualification check uses an inclusive comparison:
  ```typescript
  const minThreshold = prefs.minMatchScore ?? 75.0;
  const qualifies = Math.round(overallScore * 100) >= Math.round(minThreshold * 100) && mandatoryBlockers.length === 0;
  ```
- **Boundary Verification:**
  - `74.99%` $\rightarrow$ Fails (Disqualified)
  - `75.00%` $\rightarrow$ **Qualifies**
  - `75.01%` $\rightarrow$ **Qualifies**

---

## 6. Hard Eligibility Constraints & Residency Exclusions

Even if a vacancy achieves a high theoretical score, it is **strictly disqualified** if any mandatory exclusion is triggered:
1. **Residency / Citizenship Mandates:** If a listing explicitly mandates local residency (e.g. *"Must reside in the US with active US citizenship"* or *"UK residents only"*), and the candidate is based in a different country, the job is disqualified (`mandatoryBlockers = ["Location mismatch: requires US citizenship/residency"]`, `qualifies75 = false`).
2. **On-Site Requirement Incompatible with Geography:** Strict non-remote on-site roles outside the candidate's home region are excluded.
3. **Blacklisted Entities:** Vacancies from companies flagged in user preferences are disqualified.

---

## 7. Security & Consent Controls

1. **Explicit User Consent:** Discovery runs will not initiate without `explicitConsent: true` / user checking the consent box.
2. **Zero Automated Send:** Staging a qualifying job creates an internal draft. Under no circumstances is an email sent or application submitted without explicit human review via the Two-Factor Approval Gate (`FEAT-006`).
3. **PII and Path Isolation:** All external logs, transcripts, and database exports redact local system directories and personal contact information.

---

## 8. API Specifications

### `POST /api/resume/upload-and-discover`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "fileName": "resume.pdf",
    "fileBase64": "<base64 string>",
    "consentGiven": true,
    "minMatchScore": 75.0
  }
  ```
  *(Or with `"useExistingProfile": true` to re-scan with the current saved profile).*
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "runId": "uuid-v4",
    "profile": { "name": "...", "title": "...", "skills": [...] },
    "adjacentQueries": ["DevOps Engineer", "Platform Engineer", "SRE"],
    "discoveryStarted": true,
    "minScoreThreshold": 75.0
  }
  ```

### `GET /api/discovery/runs/:id`
- **Response (200 OK):**
  ```json
  {
    "id": "uuid-v4",
    "triggerType": "RESUME_UPLOAD",
    "status": "RUNNING" | "COMPLETED" | "FAILED",
    "currentStep": "EVALUATING_JOB_MATCHES",
    "stepMessage": "Evaluating candidate-to-job match scores using 7-dimension criteria...",
    "totalSourcesSearched": 8,
    "discoveredCount": 42,
    "evaluatedCount": 42,
    "qualifiedCount": 18,
    "minScoreThreshold": 75.0,
    "startedAt": "2026-10-24T...",
    "completedAt": null
  }
  ```

### `GET /api/matches`
- **Query Parameters:** `minScore` (default 75), `country`, `category`, `remoteOnly`, `earlyOnly`, `search`
- **Response (200 OK):**
  ```json
  {
    "matches": [
      {
        "id": "eval-uuid",
        "vacancyId": "vac-uuid",
        "overallScore": 88.0,
        "qualifies75": true,
        "mandatoryBlockers": [],
        "tier": "Strong",
        "categoryScores": {
          "skillsScore": 90,
          "experienceScore": 85,
          "domainScore": 90,
          "roleFitScore": 85,
          "industryScore": 80,
          "educationScore": 80,
          "locationScore": 100
        },
        "matchedSkills": ["Kubernetes", "Terraform", "AWS"],
        "missingSkills": ["MySQL"],
        "rationale": "High alignment across Kubernetes infrastructure...",
        "vacancy": { "title": "Senior Platform Engineer", "company": "Acme", ... }
      }
    ],
    "count": 1,
    "minScoreThreshold": 75.0
  }
  ```

### `GET /api/matches/:vacancyId/explanation`
- **Response (200 OK):** Returns detailed breakdown for the match explanation modal, including hard constraints verification, 7 category score progress bars, matched/missing skills, and AI rationale.

### `POST /api/matches/:vacancyId/recalculate`
- **Response (200 OK):** Re-runs candidate-to-vacancy evaluation against updated profile and returns fresh scores.
