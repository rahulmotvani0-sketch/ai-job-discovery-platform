# Global Job Discovery Specification & Architecture

> **Key Product Statement:**
> *"Discover jobs globally from accessible, authorized sources—not scrape the entire internet indiscriminately."*

---

## 1. Executive Summary & Core Mandate

The **Autonomous Job Discovery Platform** aggregates job postings from legally accessible, user-authorized, and publicly available endpoints worldwide. 

**"All jobs on the internet" is neither technically feasible nor legally compliant from any single source.** Attempting to scrape the entire internet indiscriminately leads to IP bans, CAPTCHA blocks, legal challenges, brittle scrapers, and corrupted data.

Instead, the platform implements a production-grade, distributed **Global Connector System** supporting:
1. **Official APIs** (e.g. Adzuna Developer API, USAJobs Federal API)
2. **Public ATS Feeds** (e.g. Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee)
3. **Public RSS & JSON Feeds** (e.g. RemoteOK, Remotive, Himalayas, Jobicy)
4. **Public Career Pages** where permitted (e.g. direct technology career endpoints)
5. **Licensed Aggregators**
6. **User-Configured Feeds and Custom Connectors**

### Explicit Non-Goals & Ethical Constraints
- The platform **MUST NOT** claim to crawl the entire internet.
- The platform **MUST NOT** bypass authentication, CAPTCHAs, `robots.txt`, rate limits, paywalls, or anti-bot controls.
- The platform **NEVER** scrapes sites that explicitly prohibit automated access in their terms of service.
- The platform respects each source's rate limits, usage policies, and attribution requirements.

---

## 2. Global Connector Specification

Every job source connector in the system implements the [`IJobSourceConnector`](file:///home/rahul/PROJECT'S/JOB/src/discovery/connectors/types.ts) interface and derives from [`BaseSourceConnector`](file:///home/rahul/PROJECT'S/JOB/src/discovery/connectors/base.ts).

### Mandatory Connector Definition Properties
Every connector must explicitly define all 11 attributes:

| # | Attribute | Type / Format | Purpose |
|---|---|---|---|
| **1** | **Source Name** | `string` | Display name of the upstream source (e.g., `Greenhouse ATS`, `USAJobs Federal Employment API`). |
| **2** | **Countries & Regions** | `{ countries: string[], regions: string[] }` | Geographic coverage (e.g. `['GLOBAL']`, `['US']`, `['IN']`, `['Europe']`). |
| **3** | **Supported Categories** | `string[]` | Career tracks supported (e.g. `Software Engineering`, `DevOps`, `SRE`, `Cloud Infrastructure`). |
| **4** | **Authentication Requirements** | `{ type: 'NONE' \| 'API_KEY' \| 'OAUTH2' \| 'PARTNER_KEY', requiredEnvVars?: string[] }` | Declares whether API keys, partner tokens, or no credentials are required. |
| **5** | **API or Usage Restrictions** | `string` | Legal boundaries, rate caps, caching policies, and ToS compliance requirements. |
| **6** | **Rate Limits** | `{ requestsPerMinute: number, burstLimit?: number }` | Client-side throttling throttle interval (e.g., 60 RPM = max 1 request/sec). |
| **7** | **Pagination Behavior** | `{ type: 'OFFSET_LIMIT' \| 'PAGE_NUMBER' \| 'CURSOR' \| 'NONE', maxPageSize?: number }` | Pagination protocol supported by the endpoint. |
| **8** | **Retry Policy** | `{ maxRetries: number, backoffMs: number }` | Exponential backoff on HTTP 429/503/504 errors. |
| **9** | **Health Status** | `'HEALTHY' \| 'DEGRADED' \| 'UNHEALTHY' \| 'UNTESTED'` | Real-time operational state from active probes. |
| **10** | **Last Successful Sync** | `string \| null` (ISO 8601 timestamp) | Timestamp of the most recent error-free sync cycle. |
| **11** | **Attribution Requirements** | `{ required: boolean, text: string, url?: string }` | Attribution banner and backlink mandatory for open display. |

---

## 3. The 10 Core Operational Rules

The discovery pipeline strictly executes against 10 operational rules:

1. **Discover from Every Configured Source**:
   Scans all user-enabled connectors simultaneously in isolated asynchronous jobs.
2. **Normalize into One Universal Schema**:
   Transforms varied upstream payloads (`RawJobPayload`) into the canonical [`Vacancy`](file:///home/rahul/PROJECT'S/JOB/src/types/index.ts) schema.
3. **Deduplicate via Canonical Hashes**:
   Computes a SHA-256 canonical hash over `[companyName, title, normalizedUrl, locationText, sourceId, sourceType, requisitionId]`. Strips UTM tracking queries, fragments, and formatting variations to guarantee zero duplicate listings.
4. **Verify Active Listings**:
   Executes automated verification checks to ensure listings have not expired, 404'd, or closed before displaying to the candidate.
5. **Detect Metadata Automatically**:
   Extracts standardized country, remote eligibility (`FULLY_REMOTE_WORLDWIDE`, `HYBRID`, `ONSITE`), employment type (`full-time`, `contract`), salary range, and visa requirements.
6. **Apply User Preferences Globally**:
   Filters and scores discovered vacancies against the user's localized profile, skills, target compensation, and remote preferences.
7. **Track Source Health & Isolate Failures**:
   Connector failures are completely isolated. When an upstream API experiences downtime or 504 timeouts, the remaining connectors proceed uninterrupted, errors are logged with backoff, and failure diagnostics appear in the Source Health Dashboard.
8. **Respect API Terms, Robots Rules & Rate Limits**:
   Every connector enforces client-side rate limiters (`throttle()`), SSRF defenses (`validateSafeUrl()`), and bounded exponential backoff.
9. **Never Scrape Prohibited Targets**:
   No scraping of login-walled platforms, sites prohibiting automation in `robots.txt`, or endpoints requiring CAPTCHA bypass.
10. **Clear Attribution & Timestamps**:
    Every job vacancy displayed in the dashboard clearly attributes its source, exact time of discovery, and active verification status.

---

## 4. Supported Default Connectors

The platform ships with connectors across 6 architectural tiers:

### A. Public ATS Postings Feeds
- **Greenhouse** (`boards-api.greenhouse.io`): Direct public postings API for hundreds of tech organizations.
- **Lever** (`api.lever.co/v0/postings`): Public JSON career feeds.
- **Ashby** (`api.ashbyhq.com/posting-api`): Modern ATS career boards.
- **Workable** (`apply.workable.com/api/v1`): Public job widget feeds.
- **SmartRecruiters** (`api.smartrecruiters.com/v1/companies`): Open job listing feeds.
- **Recruitee** (`api.recruitee.com/c/careers`): Public career portal feeds.

### B. Public Remote RSS / JSON Feeds
- **RemoteOK** (`remoteok.com/api`): Public remote developer jobs.
- **Remotive** (`remotive.com/api/remote-jobs`): Verified remote employment API.
- **Himalayas** (`himalayas.app/jobs/api`): Global remote tech roles.
- **Jobicy** (`jobicy.com/api/v2/remote-jobs`): Remote technical listings.

### C. Startup Ecosystem Feeds
- **Y Combinator Startups** (`workatastartup.com`): Verified public ATS feeds of YC alumni companies.

### D. Verified Direct Career Endpoints
- **Direct Careers**: Permitted public career endpoints from top infrastructure and technology employers (e.g. Canonical, Cloudflare, Datadog, Elastic).

### E. Official & Authorized APIs
- **USAJobs** (`data.usajobs.gov/api/search`): Official US Federal Government job search API (requires free user API key).
- **Adzuna** (`api.adzuna.com/v1/api`): International aggregator developer API (requires free user App ID/Key).

### F. User-Configured Sources
- Custom RSS, JSON, or ATS feeds can be registered by users via `/api/discovery/sources` or custom connector classes.

---

## 5. Zero Seeded Data & Test Isolation Principle

To guarantee absolute integrity, trust, and legal safety:

- **Clean Default Release**: The production and default application launch with a completely **empty** database. No fake jobs, simulated resumes, dummy recruiter emails, or fabricated vacancies are shipped or seeded into `job_platform.db`.
- **User Onboarding Required**: The job seeker configures their own real profile, uploads their verified resume, and enables their preferred job sources.
- **Isolated Test Fixtures**: All automated tests utilize strictly isolated in-memory databases (`:memory:`) and deterministic fixtures located exclusively under [`tests/fixtures/test-fixtures.ts`](file:///home/rahul/PROJECT'S/JOB/tests/fixtures/test-fixtures.ts). Test data is never written to the live production database.
