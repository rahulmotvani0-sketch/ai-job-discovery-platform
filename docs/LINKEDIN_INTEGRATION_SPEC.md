# LinkedIn Integration & Provider Abstraction Specification

> **Key Compliance Mandate:**  
> *"Payment does not remove LinkedIn’s platform restrictions. Automation must strictly adhere to authorized APIs, partner integrations, and human-in-the-loop workflows."*  
> Reference: [LinkedIn Official Policy on Automated Activity](https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin?lang=en).

---

## 1. Product Tiers Architecture

To deliver maximum value to job seekers while maintaining rock-solid legal and platform compliance, the platform distinguishes between two cleanly separated editions:

### Open-Source Edition
- **Job Discovery**: Aggregates authorized public feeds and direct ATS endpoints.
- **Resume Matching**: Fact-grounded semantic compatibility scoring with zero hallucinations.
- **Draft Generation**: AI-generated LinkedIn posts, networking outreach, and recruiter response drafts.
- **Manual LinkedIn Workflow**: Generates clean copy-paste drafts and pre-filled official web share URLs.
- **Strictly No Scraping**: Never crawls login-walled profiles, searches, or feeds.
- **No Automatic Publishing**: All transmissions require explicit candidate action.

### Paid / Commercial Edition
- **Authorized Publishing Integrations**: Integration via official LinkedIn Developer API (Community Management / Share on LinkedIn) where approved.
- **Third-Party Publishing Partners**: Direct connectors to authorized publishing services (e.g. PubloraProvider).
- **Automated Scheduling**: Scheduled publishing workflows with interactive approval gates.
- **Publishing Analytics**: Engagement tracking, post performance, and reach metrics.
- **Team Workflows**: Shared candidate pipelines, collaborative approvals, and review states.
- **Encrypted Credential Management**: Hardware/KMS-backed AES-GCM credential and OAuth token storage.
- **Managed Cloud Deployment**: Turnkey infrastructure and automated updates.
- **Enterprise Support & Compliance**: Audit trails, data retention policies, and compliance documentation.

---

## 2. Common Provider Abstraction

All LinkedIn publishing capabilities are decoupled behind a unified interface:

```typescript
export interface LinkedInPublishingProvider {
  readonly providerId: string;
  readonly name: string;
  readonly isAutomatedPublishingSupported: boolean;

  publishPost(input: PublishPostInput): Promise<PublishResult>;
  schedulePost(input: SchedulePostInput): Promise<ScheduleResult>;
  cancelScheduledPost(id: string): Promise<void>;
  getPostStatus(id: string): Promise<PostStatus>;
}
```

### Supported Provider Implementations

1. **`ManualLinkedInProvider`** (Included in Open-Source Core):
   - Prepares fact-checked drafts and pre-filled official share URLs (`https://www.linkedin.com/sharing/share-offsite/?url=...`).
   - Maintains scheduled draft records and approval statuses (`SCHEDULED`, `PENDING_APPROVAL`, `PUBLISHED`, `CANCELLED`).
   - Requires the user to click to publish directly on LinkedIn, ensuring 100% policy safety.

2. **`AuthorizedLinkedInApiProvider`** (Paid / Commercial Module):
   - Interfaces directly with LinkedIn's official REST API (`/v2/ugcPosts` / `/rest/posts`) using officially granted enterprise client credentials.

3. **`PubloraProvider`** (Paid / Commercial Module):
   - Delegates social publishing to approved third-party publishing platforms with enterprise scheduling and analytics.

---

## 3. Strict Anti-Scraping & Prohibited Behaviors

Both the open-source and paid editions strictly enforce prohibitions against unauthorized automation:

| Technique | Status | Rationale |
|---|---|---|
| **Headless Browser Automation** (Puppeteer/Playwright) | **STRICTLY PROHIBITED** | Violates LinkedIn User Agreement section 8.2 and triggers account bans. |
| **Session Cookie Extraction / Reuse** (li_at) | **STRICTLY PROHIBITED** | Hijacks user sessions; insecure and grounds for permanent account termination. |
| **Unsolicited Connection Automation** | **STRICTLY PROHIBITED** | Degrades professional network quality and violates anti-spam guidelines. |
| **Automated Easy Apply Scripting** | **STRICTLY PROHIBITED** | Circumvents employer application screening mechanisms. |
| **Scraping Member Profiles or Portals** | **STRICTLY PROHIBITED** | Violates CFAA / computer fraud precedents and LinkedIn terms. |
| **Unsolicited Direct InMail Messaging** | **STRICTLY PROHIBITED** | Banned under LinkedIn Commercial Communications policies. |

---

## 4. API Endpoints

The platform exposes dedicated endpoints for candidate post drafting and scheduling:

- `GET /api/linkedin/providers`: Lists available publishing providers.
- `POST /api/linkedin/draft`: Generates copy-paste text and official web share links.
- `POST /api/linkedin/schedule`: Stages a post draft for scheduled release.
- `GET /api/linkedin/posts`: Inspects scheduled posts and statuses.
- `POST /api/linkedin/cancel`: Cancels a pending scheduled draft.
