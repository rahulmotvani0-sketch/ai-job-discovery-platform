# Global Job Portals Catalog & Source-Type Master Registry

> **Core Operating Principle:**  
> *"No single portal covers the entire internet; global coverage requires combining general boards, regional portals, niche boards, official APIs, and company ATS career pages."*  
> — Grounded in global employment research from [Duke University's Global Job Search Directory](https://careerhub.students.duke.edu/global-job-search-websites/) and [JobSiteDir](https://jobsitedir.com/).

---

## 1. Architectural Strategy & Legal Compliance

Attempting to scrape "every job on the internet" from a single source or scraping portals indiscriminately is technically unviable, brittle, and legally precarious. 

Our production-grade platform maintains a curated **Global Portal Registry** grouped by **13 source types**. Discovery prioritizes:
1. **Public ATS Endpoints**: Direct career feeds (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee) where companies publish authentic, unbrokered job listings.
2. **Official Open APIs**: Permitted developer endpoints (e.g., Adzuna, USAJobs, Bundesagentur für Arbeit, ReliefWeb).
3. **Public RSS & JSON Feeds**: Standard syndicated feeds (e.g., RemoteOK, Remotive, Himalayas, Jobicy, We Work Remotely).
4. **Licensed Aggregators & Partner APIs**: Official agreements requiring OAuth or client keys.
5. **Permitted Public Career Pages**: Direct enterprise career portals where automated inspection complies with `robots.txt`.

### Strict Access Restrictions & Anti-Scraping Compliance
- **Never scrape sites that prohibit automated access** in their Terms of Service or `robots.txt`.
- **Never bypass anti-bot systems**, Cloudflare Turnstile, CAPTCHAs, or authentication firewalls.
- **Always respect rate limits** via client-side rate limiters and exponential backoff.
- **Preserve attribution**: Every listing links directly to the original canonical source URL with clear attribution banners.
- **Comply with regional data laws**: GDPR (Europe), DPDP (India), CCPA (California).

---

## 2. Master Catalog Grouped by Source Type

Every entry in the registry defines:
- **Portal Name**
- **Category Group**
- **Countries & Geographic Scope**
- **Supported Roles**
- **Official API or Feed URL**
- **Authentication Requirement** (`NONE`, `API_KEY`, `OAUTH2`, `PARTNER_KEY`, `SESSION_COOKIE`)
- **Rate Limits** (Requests Per Minute)
- **Terms & Usage Restrictions**
- **Connector Status** (`IMPLEMENTED_AND_TESTED`, `REQUIRES_API_CREDENTIALS`, `REQUIRES_PARTNER_ACCESS`, `MANUAL_OR_LINK_ONLY`, `RESTRICTED_BY_TERMS`)
- **Last Successful Sync Timestamp**
- **Attribution Requirement**

---

### Group 1: Global & General Portals

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **Adzuna** | Global, GB, US, IN, CA, AU, DE, FR | All Roles, DevOps, SRE, Cloud | `https://developer.adzuna.com` | `API_KEY` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Indeed** | Global, US, GB, IN, CA, AU, DE, FR, JP | All Roles, Software Engineering | `https://developer.indeed.com` | `OAUTH2` | 60 RPM | REQUIRES_PARTNER_ACCESS |
| **LinkedIn Jobs** | Global | All Roles, Tech, Leadership | `https://learn.microsoft.com/en-us/linkedin/talent/` | `OAUTH2` | 60 RPM | REQUIRES_PARTNER_ACCESS |
| **Glassdoor** | Global, US, GB, IN, CA, AU, DE | All Roles, Tech, Corporate | `https://www.glassdoor.com/developer/` | `API_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **Monster** | Global, US, CA, GB, EU | All Roles, Technical, Healthcare | `https://www.monster.com` | `PARTNER_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **ZipRecruiter** | US, CA, GB | All Roles, Tech, Trades | `https://www.ziprecruiter.com/publish-jobs` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **CareerBuilder** | US, CA, GB, IN | All Roles, IT, Engineering | `https://developer.careerbuilder.com` | `OAUTH2` | 60 RPM | REQUIRES_PARTNER_ACCESS |
| **SimplyHired** | US, CA, GB, IN, AU | All Roles, Entry-to-Senior | `https://www.simplyhired.com` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Jooble** | Global, US, GB, EU, IN, LATAM | All Roles, General, Tech | `https://jooble.org/api/about` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **Jobrapido** | Global, EU, GB, US | General Occupations | `https://www.jobrapido.com` | `PARTNER_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **Google Jobs** | Global | Schema.org Structured Postings | `https://developers.google.com/search/` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **Trovit Jobs** | Global, EU, LATAM, APAC | Classifieds Job Search | `https://jobs.trovit.com` | `PARTNER_KEY` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Talent.com** | Global, US, CA, GB, IN, EU | All Roles, Tech, Finance | `https://www.talent.com` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **JobisJob** | Global, US, GB, IN, AU | All Roles | `https://www.jobisjob.com` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Careerjet** | Global, US, GB, EU, APAC | All Roles, Engineering | `https://www.careerjet.com/partners/api/` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **Joblift** | DE, GB, FR, NL | DACH & West European Roles | `https://joblift.com` | `PARTNER_KEY` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **GrabJobs** | Global, SG, PH, TH, IN, US | Tech, Retail, Hospitality | `https://grabjobs.co` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |

---

### Group 2: Technology & Startup Portals

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **Y Combinator Jobs** | Global, US, IN, EU | Software Engineering, SRE, AI/ML | `https://www.workatastartup.com` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Himalayas** | Global | Remote Software Engineering, DevOps | `https://himalayas.app/jobs/api` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **We Work Remotely** | Global | DevOps, Cloud, Programming | `https://weworkremotely.com/categories/remote-programming-jobs.rss` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Wellfound** | Global, US, IN, EU | Founding Engineers, DevOps, Full-stack | `https://wellfound.com` | `SESSION_COOKIE` | 20 RPM | MANUAL_OR_LINK_ONLY |
| **Dice** | US, CA | Tech Specialist: Cloud, SRE, Cybersecurity | `https://developer.dice.com` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **Hired** | US, CA, GB | Curated Software Engineering, SRE | `https://hired.com` | `OAUTH2` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Built In** | US | US Startup Hubs (NYC, SF, Seattle, Austin) | `https://builtin.com` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Otta** | US, GB, EU | Startup & Fast-Growth Tech Careers | `https://otta.com` | `SESSION_COOKIE` | 20 RPM | MANUAL_OR_LINK_ONLY |
| **Authentic Jobs** | Global, US | Web Design, Frontend, Full-stack | `https://authenticjobs.com` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Startup Jobs** | US, EU, Global | Early-stage Startup Roles | `https://startup.jobs` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Landing.jobs** | EU, PT, ES, DE, GB | European Tech Careers & Relocation | `https://landing.jobs` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **Relocate.me** | Global, EU, CA, SG | Software Roles with Visa Sponsorship | `https://relocate.me` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **AI-Jobs.net** | Global | AI, Machine Learning, MLOps, Data Science | `https://ai-jobs.net` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |

---

### Group 3: Remote-Work Portals

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **Remote OK** | Global | DevOps, Cloud, SRE, Full-Stack | `https://remoteok.com/api` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Remotive** | Global | DevOps, Cloud Infrastructure, Security | `https://remotive.com/api/remote-jobs` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Jobicy** | Global | Remote DevOps & Cloud Infrastructure | `https://jobicy.com/api/v2/remote-jobs` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **FlexJobs** | Global, US, CA, GB | Vetted Remote & Flexible Listings | `https://www.flexjobs.com` | `SESSION_COOKIE` | 20 RPM | RESTRICTED_BY_TERMS |
| **Remote.co** | Global, US | Developers, IT, Distributed Teams | `https://remote.co` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Working Nomads** | Global | Development, SysAdmin, Marketing | `https://www.workingnomads.com/jobs/api` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Jobspresso** | Global, US | Curated Remote Tech & Design | `https://jobspresso.co` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **JustRemote** | Global | Remote Developer & System Admin | `https://justremote.co` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **NoDesk** | Global | Remote Tech & Operations Guide | `https://nodesk.co` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Dynamite Jobs** | Global | Digital Nomad Tech & Engineering | `https://dynamitejobs.com` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **SkipTheDrive** | US, CA, Global | Telecommuting & Remote IT | `https://www.skipthedrive.com` | `NONE` | 30 RPM | MANUAL_OR_LINK_ONLY |

---

### Group 4: Freelance and Contract Platforms

| Platform Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **Upwork** | Global | Cloud & Infra, Web Dev, DevOps | `https://www.upwork.com/developer` | `OAUTH2` | 40 RPM | REQUIRES_API_CREDENTIALS |
| **Fiverr** | Global | Micro-consulting, DevOps Scripts | `https://www.fiverr.com` | `API_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **Freelancer** | Global | Fixed-Price Projects, Contracts | `https://developers.freelancer.com` | `OAUTH2` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **Toptal** | Global | Top 3% Software Engineers, Architects | `https://www.toptal.com` | `SESSION_COOKIE` | 20 RPM | MANUAL_OR_LINK_ONLY |
| **Guru** | Global, US, IN | Programming, IT Infrastructure | `https://www.guru.com` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **PeoplePerHour**| GB, EU, Global | Hourly Tech Contracts, Web Support | `https://www.peopleperhour.com` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **Contra** | Global | Commission-Free Independent Tech | `https://contra.com` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Malt** | FR, DE, ES, GB, NL | European Cloud Consultants, Data | `https://www.malt.com` | `PARTNER_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **Truelancer** | IN, Global | IT, DevOps, Full-Stack, Support | `https://www.truelancer.com` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **Gun.io** | Global, US | Senior Developers, Fractional CTOs | `https://www.gun.io` | `NOT_APPLICABLE` | 20 RPM | MANUAL_OR_LINK_ONLY |
| **Braintrust** | Global | User-Owned Talent Network, Enterprise | `https://www.usebraintrust.com` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |

---

### Group 5: India Regional Portals

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **Naukri.com** | IN | IT Services, Product, DevOps, Cloud | `https://www.naukri.com` | `PARTNER_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **Hasjob** | IN | Developer, Systems, Open Source, Python, Go | `https://hasjob.co/feed` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Foundit (Monster)** | IN, SG, MY | IT, DevOps, Cloud, Analytics | `https://www.foundit.in` | `PARTNER_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **Cutshort** | IN | Full-Stack, Backend, DevOps, Security | `https://cutshort.io` | `SESSION_COOKIE` | 20 RPM | REQUIRES_API_CREDENTIALS |
| **Instahyre** | IN | Software Engineering, SRE, Platform | `https://www.instahyre.com` | `SESSION_COOKIE` | 20 RPM | MANUAL_OR_LINK_ONLY |
| **Hirist** | IN | Premium Tech: DevOps, Cloud, AI | `https://www.hirist.tech` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **iimjobs** | IN | Management, Engineering Leadership | `https://www.iimjobs.com` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Apna** | IN | Skilled Trades, IT Support, Operations | `https://apna.co` | `OAUTH2` | 40 RPM | REQUIRES_PARTNER_ACCESS |
| **WorkIndia** | IN | Entry-level Tech, Operations | `https://www.workindia.in` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **Internshala** | IN | Internships, Junior DevOps, Engineering | `https://internshala.com` | `SESSION_COOKIE` | 20 RPM | MANUAL_OR_LINK_ONLY |
| **Talent500** | IN, Global | Global Capability Centers (GCCs), Tech | `https://talent500.co` | `SESSION_COOKIE` | 20 RPM | MANUAL_OR_LINK_ONLY |

---

### Group 6: United States and Canada

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **USAJobs** | US | Federal Govt: Computer Science, IT, SRE | `https://developer.usajobs.gov` | `API_KEY` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Job Bank Canada**| CA | Official Canada Federal Job Bank | `https://www.jobbank.gc.ca` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Workopolis** | CA | Canadian Tech & Enterprise | `https://www.workopolis.com` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **GovernmentJobs** | US | State, County & Municipal IT Systems | `https://www.governmentjobs.com` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **ClearanceJobs** | US | Security Cleared (Secret/TS-SCI) Tech | `https://www.clearancejobs.com` | `SESSION_COOKIE` | 20 RPM | RESTRICTED_BY_TERMS |
| **HigherEdJobs** | US | Higher Education & Research Computing | `https://www.higheredjobs.com` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Idealist** | US, Global | Civic Tech, Social Impact, Non-Profit | `https://www.idealist.org` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |

---

### Group 7: United Kingdom and Ireland

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **GOV.UK Find a Job**| GB | UK Civil Service & DWP Vacancies | `https://findajob.dwp.gov.uk` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **Reed.co.uk** | GB | UK Tech, DevOps, Contracting | `https://www.reed.co.uk/developers` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **CWJobs** | GB | UK Specialist Tech & IT Recruitment | `https://www.cwjobs.co.uk` | `PARTNER_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **NHS Jobs** | GB | UK National Health Service Health-Tech | `https://www.jobs.nhs.uk` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **IrishJobs.ie** | IE | Ireland Tech Hub (Dublin), Multinationals | `https://www.irishjobs.ie` | `PARTNER_KEY` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Jobs.ac.uk** | GB, Global | UK Academic & University Computing | `https://www.jobs.ac.uk` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |

---

### Group 8: Europe

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **Bundesagentur für Arbeit** | DE | Official German Public Jobsuche API | `https://rest.arbeitsagentur.de` | `API_KEY` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **EURES** | EU, EEA, CH | European Job Mobility: Engineering, IT | `https://eures.ec.europa.eu` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **StepStone** | DE, AT, BE, NL | European Engineering & Enterprise | `https://www.stepstone.de` | `PARTNER_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **Xing Jobs** | DE, AT, CH | DACH Region Professional Careers | `https://www.xing.com/jobs` | `OAUTH2` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **Welcome to the Jungle** | FR, ES, GB, CZ | European Tech & Scaleup Cultures | `https://www.welcometothejungle.com` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Pracuj.pl** | PL, UA | Central Europe Tech Hub: Developers | `https://www.pracuj.pl` | `PARTNER_KEY` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **InfoJobs** | ES, IT, BR | Southern Europe Tech & Corporate | `https://developer.infojobs.net` | `OAUTH2` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **Finn.no Jobb** | NO | Norway Tech & Industrial Engineering | `https://www.finn.no/jobb/` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |

---

### Group 9: Asia-Pacific

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **SEEK** | AU, NZ | Australia & NZ Market Leader: Tech | `https://developer.seek.com` | `OAUTH2` | 60 RPM | REQUIRES_PARTNER_ACCESS |
| **JobStreet** | MY, SG, PH, ID, TH | Southeast Asian Regional Tech Hubs | `https://www.jobstreet.com` | `PARTNER_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **MyCareersFuture** | SG | Singapore Government National Portal | `https://www.mycareersfuture.gov.sg` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **WorkinJapan / Daijob**| JP | Bilingual Tech & Engineering in Japan | `https://www.daijob.com` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Saramin** | KR | South Korea Tech & Enterprise Open API | `https://oapi.saramin.co.kr` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **Boss Zhipin** | CN | Direct Chat Hiring in China Big Tech | `https://www.zhipin.com` | `SESSION_COOKIE` | 15 RPM | RESTRICTED_BY_TERMS |

---

### Group 10: Middle East and Africa

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **Bayt.com** | AE, SA, EG, QA | MENA Region Tech & Corporate | `https://www.bayt.com` | `PARTNER_KEY` | 30 RPM | REQUIRES_PARTNER_ACCESS |
| **GulfTalent** | AE, SA, QA, KW | GCC Senior Cloud & Systems Roles | `https://www.gulftalent.com` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Jobberman** | NG, GH | West Africa (Lagos, Accra) Tech | `https://www.jobberman.com` | `PARTNER_KEY` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **CareerJunction** | ZA | South Africa Enterprise & Cloud | `https://www.careerjunction.co.za` | `PARTNER_KEY` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **UN Careers** | Global, CH, US, KE | United Nations International IT | `https://careers.un.org` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |

---

### Group 11: Latin America

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **Computrabajo** | CO, MX, AR, PE, CL | Hispanic America Tech & Corporate | `https://www.computrabajo.com` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Bumeran** | AR, MX, VE, PE | Southern Cone Software Development | `https://www.bumeran.com` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Vagas.com.br** | BR | Brazil Technology & Enterprise | `https://www.vagas.com.br` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Get on Board** | CL, MX, CO, AR, Global | LATAM Tech & Startups REST API | `https://www.getonbrd.com/api/v0` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **Torre** | Global, CO, MX, AR | Remote-first Tech Matching Network | `https://torre.ai` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |

---

### Group 12: Public-Sector and Nonprofit Portals

| Portal Name | Countries | Supported Roles | Official Endpoint / Feed | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|---|
| **ReliefWeb Jobs** | Global | UN OCHA Humanitarian Tech & GIS | `https://api.reliefweb.int/v1/jobs` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Workforce Australia** | AU | Australian Government Employment | `https://www.workforceaustralia.gov.au` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **Devex** | Global, US, BE | International Development & NGOs | `https://www.devex.com/jobs` | `SESSION_COOKIE` | 20 RPM | MANUAL_OR_LINK_ONLY |
| **Impactpool** | Global, SE, CH | UN, WHO, Green Energy & Climate Tech | `https://www.impactpool.org` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **CharityJob** | GB | UK Non-Profit & NGO Technology | `https://www.charityjob.co.uk` | `NOT_APPLICABLE` | 30 RPM | MANUAL_OR_LINK_ONLY |
| **Euraxess** | EU, Global | European Academic & Research Computing | `https://euraxess.ec.europa.eu` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |

---

### Group 13: Direct Company Career Systems (ATS)

*Direct ATS integrations represent the highest-fidelity source tier, providing unmediated, authentic job openings directly from company career sites.*

| ATS Platform | Target Employers | Public API / Ingestion Endpoint | Auth Type | Rate Limit | Connector Status |
|---|---|---|---|---|---|
| **Greenhouse** | Hundreds of Tech Leaders | `https://boards-api.greenhouse.io/v1/boards/{board}/jobs` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Lever** | Tech Startups & Scaleups | `https://api.lever.co/v0/postings/{site}?mode=json` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Ashby** | Hypergrowth Tech Orgs | `https://api.ashbyhq.com/posting-api/job-board/{org}` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Workable** | Mid-market & Global Orgs | `https://apply.workable.com/api/v1/widget/accounts/{subdomain}` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **SmartRecruiters** | Enterprise Global Tech | `https://api.smartrecruiters.com/v1/companies/{id}/postings` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Recruitee** | European & Global Tech | `https://{subdomain}.recruitee.com/api/c/careers` | `NONE` | 60 RPM | **IMPLEMENTED_AND_TESTED** |
| **Workday** | Fortune 500 Enterprises | `https://{tenant}.wd1.myworkdayjobs.com/wday/cxs/{co}/{board}/jobs` | `NONE` | 30 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **iCIMS** | Enterprise & Healthcare | `https://developer.icims.com` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **Taleo (Oracle)** | Large Global Enterprises | `https://{company}.taleo.net/careersection/{section}/jobsearch.ftl` | `NONE` | 20 RPM | MANUAL_OR_LINK_ONLY |
| **Jobvite** | Tech & Mid-Market | `https://api.jobvite.com/api/v2` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **BambooHR** | SMB & Tech Startups | `https://{subdomain}.bamboohr.com/careers/list` | `NONE` | 40 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Personio** | European Tech & Scaleups | `https://api.personio.de/v1/recruiting/positions` | `API_KEY` | 40 RPM | REQUIRES_API_CREDENTIALS |
| **Teamtailor** | European Startups | `https://api.teamtailor.com/v1` | `API_KEY` | 60 RPM | REQUIRES_API_CREDENTIALS |
| **JazzHR** | US Tech & SMB | `https://api.jazz.co/partner` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **Breezy HR** | Tech & Creative Agencies | `https://api.breezy.hr/v1` | `API_KEY` | 40 RPM | REQUIRES_API_CREDENTIALS |
| **Pinpoint** | Modern Tech Workplaces | `https://{subdomain}.pinpointhq.com/api/v1/jobs` | `NONE` | 40 RPM | IMPLEMENTED_BUT_NOT_LIVE_VERIFIED |
| **Rippling** | High-growth Tech Orgs | `https://api.rippling.com/platform/api/ats` | `API_KEY` | 30 RPM | REQUIRES_API_CREDENTIALS |
| **Zoho Recruit** | Global & India Tech | `https://recruit.zoho.com/recruit/v2` | `OAUTH2` | 40 RPM | REQUIRES_API_CREDENTIALS |
