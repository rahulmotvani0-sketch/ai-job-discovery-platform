# NextRaise.ai Product & UX Research

**Target URL:** [https://nextraise.ai/jobs](https://nextraise.ai/jobs)  
**Research Date:** October 2026  
**Auditor:** Principal Software Architect & Full-Stack AI Engineer  
**Purpose:** Inform the upgrade of our personal AI job discovery and application platform with competitive UX, discovery mechanics, and applicant matching features.

---

## 1. Executive Summary & Overview

NextRaise (`nextraise.ai`) positions itself as an AI-powered job discovery and application acceleration platform featuring over 2 million live jobs aggregated across 100+ ATS engines (Workday, Greenhouse, Lever, Ashby, BambooHR, SmartRecruiters) and direct corporate career boards.

The core public value proposition centers on:
1. **Aggregated Discovery:** Fast search across tech domains without landing on spam aggregator portals.
2. **"✦ Be an Early Applicant" Badging:** Flagging jobs posted within the last 24–48 hours to capitalize on the hiring window.
3. **Role & Category Taxonomy:** Curated chips for Software Engineering, DevOps, Cloud Infrastructure, Product, Data, etc.
4. **Country & Remote Geographic Browsing:** Multi-country filtering (India, US, UK, Canada, Germany, Singapore, etc.) with remote tags.
5. **Resume-Based Match Scoring:** Uploading an existing resume to calculate percentage compatibility and missing qualifications.
6. **1-Click Tailored Resume Generation:** Producing vacancy-specific ATS resumes based on uploaded master profiles.
7. **Direct Hiring Team Outreach ("Find HR"):** Identifying recruiter and hiring manager handles for warm outreach.

---

## 2. Feature-by-Feature Analysis Matrix

| Feature | What the Website Actually Demonstrates | Benefit to Our Platform | Can It Be Reproduced Independently? | Required Integrations / Data Sources | Implementation Complexity | Testing Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Job Search & Keyword Discovery** | Real-time text search across job titles, tech stack keywords, and companies with dynamic suggestions. | Allows instantaneous filtering of discovered vacancies by tools (e.g. `Kubernetes`, `Terraform`, `AWS`, `Prometheus`). | **Yes (100%)** | Local SQLite full-text search (FTS5) or indexed multi-field queries. | **Low** | Unit tests on keyword query matching; latency benchmarks (<10ms). |
| **2. Country & Geographic Browsing** | Dropdown selector with flags (India, United States, United Kingdom, Canada, Germany, Australia, Singapore, etc.) + "Remote" toggle. | Critical for global job seekers: filters for India-based roles and international remote roles open to global/Indian residents (eliminates US-only remote noise). | **Yes (100%)** | Country normalizer from location strings; ISO country code matching. | **Low** | Test parsing of "Remote - India", "Bangalore", "Worldwide Remote", "US Only". |
| **3. Role Categories & Pills** | One-tap chips: `DevOps`, `Platform Engineer`, `Cloud Infrastructure`, `SRE`, `DevSecOps`, `Full Stack`. | Enables single-click focus switches between SRE, DevOps, and Cloud Infra tracks. | **Yes (100%)** | Category tagging engine based on title + keyword matching rules. | **Low** | Test categorization accuracy across real titles. |
| **4. Early-Applicant Indicators** | `✦ Be an early applicant` tag displayed on vacancies posted today or within the past 24–48 hours. | Massive hiring advantage: applying within the first 48 hours increases recruiter interview rates by 3–4x. | **Yes (100%)** | Date parsing of `publishedAt` / ISO timestamps from ATS feeds. | **Low** | Test timestamp diffing: &le; 24h = "Early Applicant", > 48h = standard. |
| **5. Search & Filtering Experience** | Instantaneous client-side filtering by salary range, experience level, remote policy, and date posted. | Lets user refine 50+ discovered vacancies to top 5 candidates in seconds. | **Yes (100%)** | Client-side reactive filtering + backend parameterized API queries. | **Medium** | Automated DOM state testing; verify card count changes when filters toggle. |
| **6. Job Listings & Company Details** | Detailed card with company logo, clean markdown description, verified ATS link, and team context. | Provides rich context needed for AI job analysis without visiting messy third-party spam sites. | **Yes (100%)** | Normalized job schema; direct links to employer career URLs. | **Low** | Test card rendering with full and partial vacancy metadata. |
| **7. Resume Match Scoring** | Percentage badge (e.g., `88% Strong match`, `72% Moderate`) with breakdown of matched vs missing skills. | Gives explainable hiring confidence based on candidate master profile before drafting an application. | **Yes (100%)** | 7-factor semantic & deterministic matcher (`src/ai/agents/matcher.ts`). | **Medium** | Regression test scoring against pre-scored ground truth vacancies. |
| **8. Job-Specific Resume Tailoring** | "Tailor Resume" button that highlights relevant projects, rewrites summaries, and preserves formatting. | Generates an ATS-compliant resume tuned for the exact vacancy in Markdown/PDF. | **Yes (100%)** | Resume tailor agent (`src/applications/resume-tailor.ts`) using local/cloud LLMs. | **Medium** | Verification test checking that tailored resume never invents non-existent experience. |
| **9. Account Registration & Auth** | Dual auth: Google OAuth sign-in and email OTP/password authentication. | Secures user dashboard and enables token persistence for Google services. | **Yes (100%)** | Google OAuth2 and session token cookies/headers. | **Medium** | Mock OAuth callback test; verify token storage and session expiry. |
| **10. Multi-Account Gmail Workflow** | *Hypothesis / NextRaise Pro:* Connects user email to send applications or reach out to recruiters directly. | Personal search need: connect both primary email and secondary job email, selecting which to send from. | **Yes (100%)** | Direct Google Gmail API (`users.messages.send`, `users.drafts.create`). | **High** | Test draft creation and explicit approval gate preventing accidental dispatch. |
| **11. Saved Jobs & Bookmarks** | Star/Bookmark toggle per card to track shortlisted opportunities. | Allows the user to bookmark vacancies for weekend batch review or manual inspection. | **Yes (100%)** | SQLite `is_saved` boolean column + toggle API endpoint. | **Low** | Test bookmark toggle and filter view "Show Saved Only". |
| **12. Information Architecture** | Sticky filter header, two-column layout (list on left, detail drawer on right), responsive on mobile. | Provides effortless desktop review workflow; keyboard navigation; zero clutter. | **Yes (100%)** | CSS grid/flexbox, modern dark mode palette, zero heavy frontend framework required. | **Medium** | Test cross-browser rendering on desktop and mobile viewports. |

---

## 3. Unverified Hypotheses & Proprietary Boundaries

1. **Private Scraping & Aggregation Engine:** NextRaise claims "2M+ live jobs from 100+ ATS platforms". They likely operate heavy distributed scrapers or purchase commercial data feeds (e.g., Bright Data, SerpAPI, JobDataAPI). Our self-hosted platform will use direct public ATS APIs (Greenhouse, Lever, Jobicy, RemoteOK, GitHub Jobs) to remain resilient, compliant, and cost-free.
2. **Proprietary Match Algorithm:** Their exact percentage weights are undisclosed. We implement an open, explainable 7-factor weighted scoring engine with complete auditability (30% Tech Skills, 20% Experience, 15% Responsibilities, 10% Cloud/Infra, 10% Location/Remote, 10% Compensation, 5% Education/Certifications).
3. **Monetization & Limits:** NextRaise uses freemium credits (e.g., free search, paid tailoring/outreach). Our personal platform is 100% owned, free, self-hosted, with zero artificial credit restrictions.

---

## 4. Key Takeaways for OpenMausBot Platform Upgrade

1. **Adopt the "✦ Early Applicant" Tagging:** Mark jobs published within 24h as high priority.
2. **Add Multi-Country Selector with India First-Class Support:** Allow toggling India vs. Worldwide Remote with strict India-eligibility enforcement.
3. **Implement Visual Match Badges:** Prominently display percentage badges (e.g. `88% - Excellent Match`) with expandable evidence drill-downs.
4. **Implement Saved Jobs / Bookmarks:** Add a one-click star feature.
5. **Support Multi-Account Gmail Management:** Connect multiple Google accounts, show connection health, and enable account selection per application.
6. **AI Provider Management:** Expose an AI Settings panel to configure OpenAI, Gemini, Anthropic, and local Ollama without restarting the server.
