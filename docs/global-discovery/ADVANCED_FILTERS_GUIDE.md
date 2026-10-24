# Advanced Job Search Filters and Preferences Guide

## Overview
OpenMausBot provides a production-grade, user-configurable job filtering engine designed for global discovery, resume matching, and saved search automation. It enables job seekers to apply precision multi-criteria filters across all configured source connectors and local pipelines with transparent exclusion tracking.

---

## 1. Filter Dimensions & Supported Criteria

### A. Work Arrangement
* **Options:** `All work arrangements`, `Remote`, `Hybrid`, `Onsite`, `Flexible`, `Unknown / Not specified`.
* **Multi-Select:** Multiple arrangements can be combined (e.g., Remote + Hybrid).
* **Default Behavior:** Defaults to `All work arrangements` without penalizing or excluding onsite opportunities unless explicitly filtered.

### B. Location & Geographic Eligibility
* **Country:** Strict ISO and name matching with regional alias resolution.
* **City / Province / Region:** Substring and regional boundary matching.
* **Remote Country Verification:** Enforces geographic eligibility for remote roles (e.g. checks whether an employer permits remote workers from India, Europe, or Worldwide rather than assuming open global eligibility).
* **Visa Sponsorship & Relocation:**
  * `visaSponsorship`: Requires positive evidence of visa sponsorship (disqualifies listings stating "no sponsorship" or requiring existing local clearance).
  * `relocationAssistance`: Filters for verified relocation packages and support.

### C. Roles and Job Titles
* **Predefined Roles:** DevOps Engineer, Senior DevOps, Platform Engineer, Cloud Engineer, Cloud Infrastructure Engineer, DevSecOps Engineer, Site Reliability Engineer (SRE), Kubernetes Engineer, Build and Release Engineer, Cloud Security Engineer.
* **Custom Keywords:** Full-text disjunctive or conjunctive search matching across title, company, and raw vacancy description.

### D. Experience Level & Seniority
* **Seniority Levels:** Internship, Entry-level, Junior, Mid-level, Senior, Lead, Principal, Staff, Manager, Director, Not specified.
* **Experience Years Bounds:** Minimum and maximum years required, compared directly against extracted requirements without inferring seniority solely from job titles.

### E. Salary & Compensation
* **Min & Max Range:** Multi-currency support (USD, INR, EUR, GBP, CAD, AUD).
* **Pay Periods:** Annual, Monthly, Daily, Hourly, Contract (automatically normalized to annual equivalents for comparison).
* **Undisclosed Salary Policy:** Undisclosed compensation is **retained by default** and never discarded unless the user explicitly checks `requireDisclosed: true`.
* **Bonus & Equity:** Filters for listings offering equity, stock options, RSUs, or bonuses.

### F. Resume Match Score & Transparency
* **Threshold Range:** 0 to 100% (default: 75/100).
* **Quick Presets:** 50%+, 60%+, 70%+, 75%+, 80%+, 90%+.
* **Boundary Condition:** Inclusive threshold—a score of exactly 75 passes a 75 threshold; 74 fails.
* **Evidence Breakdown:** Full 7-dimension transparency with matched skills, missing skills, and evidence explanations.

### G. Technical Skills & Taxonomy
* **Must-Have Skills:** All specified technologies must be present in requirements or description.
* **Preferred Skills:** Any specified technology qualifies in disjunctive mode.
* **Excluded Skills:** Immediate disqualification if any excluded keyword is present.
* **Categories:** Cloud, Containers, IaC, CI/CD, GitOps, Monitoring, OS, Scripting, Security, Networking.

### H. Employment Type
* **Options:** Full-time, Part-time, Contract, Freelance, Temporary, Internship, Apprenticeship, Permanent, Not specified.
* **Multi-select:** Allows union of selected types.

### I. Company and Industry
* **Target Companies:** Filter for specific employer names.
* **Excluded Companies:** Exclude specific organizations or agencies.
* **Dismissal Rules:** Exclude previously applied companies or archived vacancies.

### J. Posting Date & Freshness
* **Presets:** Last 24 hours, Last 3 days, Last 7 days, Last 14 days, Last 30 days, All time.
* **Custom Range:** Configurable `startDate` and `endDate`.

### K. Source Connector Registry
* Filter by active connectors (Remotive, SmartRecruiters, Adzuna, USAJobs, Direct Careers, Arbeitsagentur, Greenhouse, Lever, etc.).

---

## 2. Accurate Result Counts and Transparency

The engine calculates non-overlapping exclusion reasons across the processing pipeline:

```
[Total Retrieved]
       │
       ▼
[Cross-Source Deduplication] ─── (Duplicate Canonical Listings Removed)
       │
       ▼
[Pipeline Filtering & Exclusions]
       ├── Excluded by Work Arrangement
       ├── Excluded by Location & Remote Eligibility
       ├── Excluded by Role / Title
       ├── Excluded by Experience (Years / Seniority)
       ├── Excluded by Salary (Bounds or Undisclosed Policy)
       ├── Excluded by Technical Skills (Must-Have / Excluded)
       ├── Excluded by Employment Type
       ├── Excluded by Company (Excluded or Previously Applied)
       ├── Excluded by Posting Date
       ├── Excluded by Resume Match Score (< Threshold)
       └── Excluded by Eligibility (Visa / Relocation)
       │
       ▼
[Total Matching & Qualifying Results]
```

---

## 3. Connector Capabilities Architecture

In accordance with Section 5, each source connector declares its native filter capabilities versus local processing rules via `CONNECTOR_CAPABILITIES_REGISTRY`:

| Connector | Native Filters | Local Post-Processing Filters | Notes |
| :--- | :--- | :--- | :--- |
| **Remotive** | `keyword`, `workArrangement` (Remote), `category` | `location`, `country`, `salary`, `experience`, `skills`, `matchScore` | Public API filters remote jobs by role tag; country-specific remote eligibility is checked locally. |
| **Adzuna** | `keyword`, `location`, `country`, `salary`, `category`, `pagination` | `workArrangement`, `skills`, `experience`, `matchScore`, `visaSponsorship` | Rich native salary and location parameters; match score evaluated locally. |
| **SmartRecruiters** | `keyword`, `location`, `country`, `pagination` | `workArrangement`, `salary`, `experience`, `skills`, `matchScore` | Native query parameters for company & city; work arrangement inferred locally. |
| **USAJobs** | `keyword`, `location`, `salary`, `employmentType`, `pagination` | `workArrangement`, `skills`, `matchScore` | Federal government API with native pay scales and series codes. |
| **Direct Careers** | `keyword`, `pagination` | `location`, `country`, `workArrangement`, `salary`, `skills`, `matchScore` | Career page aggregator with structured schema post-parsing. |
| **Arbeitsagentur** | `keyword`, `location`, `country` (Germany/EU), `pagination` | `workArrangement`, `salary`, `skills`, `matchScore` | German Federal Employment Agency API. |
| **Greenhouse ATS** | Employer-specific public board | `keyword`, `role`, `location`, `workArrangement`, `salary`, `skills` | Per-organization board scraping; all filtering performed locally. |
| **Lever ATS** | Employer-specific public postings | `keyword`, `role`, `location`, `workArrangement`, `salary`, `skills` | Normalized postings filtered locally. |

---

## 4. HTTP API Reference

### 1. Retrieve Connector Filter Capabilities
```http
GET /api/discovery/capabilities
```
**Response (200 OK):**
```json
{
  "totalConnectors": 10,
  "capabilities": [
    {
      "connectorId": "remotive",
      "connectorName": "Remotive",
      "supportsNativeKeywordSearch": true,
      "supportsNativeLocation": false,
      "supportsNativeWorkArrangement": true,
      "supportsNativeSalaryFilter": false,
      "localFilteringApplied": ["location", "country", "salary", "experience", "skills", "matchScore"]
    }
  ]
}
```

### 2. Retrieve Available Dynamic Filter Options
```http
GET /api/jobs/filters/options
```
**Response (200 OK):**
```json
{
  "workArrangements": [
    { "value": "all", "label": "All work arrangements", "count": 142 },
    { "value": "remote", "label": "Remote", "count": 89 },
    { "value": "hybrid", "label": "Hybrid", "count": 28 },
    { "value": "onsite", "label": "Onsite", "count": 25 }
  ],
  "experienceLevels": [...],
  "employmentTypes": [...],
  "roles": [...],
  "topSkills": [...],
  "countries": [...],
  "cities": [...],
  "salaryRange": { "min": 50000, "max": 250000, "currencies": ["USD", "INR", "EUR", "GBP"] }
}
```

### 3. Advanced Job Search
```http
POST /api/jobs/search
Content-Type: application/json

{
  "workArrangements": ["remote", "hybrid"],
  "roles": ["DevOps Engineer", "Platform Engineer"],
  "country": "India",
  "matchScore": { "min": 75 },
  "salary": {
    "min": 100000,
    "requireDisclosed": false
  },
  "skills": {
    "mustHave": ["Kubernetes", "Terraform"],
    "excluded": ["PHP"]
  },
  "postingDate": { "preset": "7d" }
}
```
**Response (200 OK):**
```json
{
  "totalMatching": 18,
  "stats": {
    "totalRetrieved": 142,
    "totalDeduplicated": 128,
    "totalMatching": 18,
    "qualifyingScoreCount": 18,
    "excludedByWorkArrangement": 25,
    "excludedByLocation": 32,
    "excludedByRole": 24,
    "excludedByExperience": 8,
    "excludedBySalary": 0,
    "excludedBySkills": 12,
    "excludedByScore": 9,
    "excludedByEligibility": 0
  },
  "results": [...]
}
```

### 4. Saved Searches Management
* `GET /api/saved-searches` - List saved searches for current user.
* `POST /api/saved-searches` - Create a saved search profile.
* `GET /api/saved-searches/:id` - Retrieve a specific saved search profile.
* `PUT /api/saved-searches/:id` - Update search filters or settings.
* `DELETE /api/saved-searches/:id` - Delete search profile.
* `POST /api/saved-searches/:id/duplicate` - Duplicate search profile into a new independent record.
* `POST /api/saved-searches/:id/default` - Set as primary default search.
* `POST /api/saved-searches/:id/run` - Execute saved search and record execution telemetry.
