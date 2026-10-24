import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES } from '../src/core/profile.js';
import { ResumeTailoringAgent } from '../src/applications/resume-tailor.js';
import { ApplicationWritingAgent } from '../src/applications/writer.js';
import { ApprovalGatekeeper, SecurityAuthorizationError } from '../src/applications/approval-gate.js';
import { DirectGmailService } from '../src/integrations/google/gmail.js';
import { DirectGoogleDriveService } from '../src/integrations/google/drive.js';
import { DirectGoogleSheetsService } from '../src/integrations/google/sheets.js';
import { MasterOrchestrator } from '../src/automation/orchestrator.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import type { IJobSourceConnector } from '../src/discovery/connectors/types.js';
import type { RawJobPayload } from '../src/types/index.js';

describe('Phases 5-7: Resume Tailoring, Security Approval Gate & End-to-End Workflow', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    db.saveUserProfile(DEFAULT_USER_PROFILE);
    db.savePreferences(DEFAULT_JOB_PREFERENCES);
  });

  it('should tailor resume without fabricating employment history or skills', () => {
    const dummyVacancy = {
      id: 'vac_k8s_tf',
      canonicalHash: 'hash_k8s_tf',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/jobs/k8s-tf',
      alternateUrls: ['https://remoteok.com/jobs/k8s-tf'],
      companyName: 'ScaleGrid Cloud',
      title: 'Senior DevOps / Platform Engineer',
      normalizedTitle: 'devops platform engineer',
      locationText: 'Remote (Worldwide)',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time' as const,
      rawDescription: 'Seeking DevOps engineer with Kubernetes, Helm, ArgoCD, and Terraform experience.',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED' as const,
      isContractOrFreelance: false,
    };

    const tailor = new ResumeTailoringAgent();
    const result = tailor.tailorResume(dummyVacancy, DEFAULT_USER_PROFILE);

    expect(result.markdownContent).toContain('RAHUL MOTVANI');
    expect(result.markdownContent).toContain('Agile logic Technovations');
    expect(result.markdownContent).toContain('Azilen Technologies');
    expect(result.markdownContent).toContain('Terraform');
    expect(result.markdownContent).toContain('Kubernetes');
    expect(result.markdownContent).toContain('https://rahul.techiking.com');

    // Hallucination verification: Ensure unearned skills/certifications are NOT present
    expect(result.markdownContent).not.toContain('CCIE Enterprise Infrastructure');
    expect(result.markdownContent).not.toContain('15 years of experience');
  });

  it('should prevent unauthorized email dispatch with strict SecurityAuthorizationError', async () => {
    const dummyVacancy = {
      id: 'vac_test_gate',
      canonicalHash: 'hash_test_gate',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/jobs/gate',
      alternateUrls: ['https://remoteok.com/jobs/gate'],
      companyName: 'GateSecurity Corp',
      title: 'DevOps Engineer',
      normalizedTitle: 'devops engineer',
      locationText: 'Remote',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time' as const,
      rawDescription: 'DevOps role',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED' as const,
      isContractOrFreelance: false,
    };
    db.insertOrUpdateVacancy(dummyVacancy);

    const draft = ApplicationWritingAgent.draftApplication(
      dummyVacancy,
      DEFAULT_USER_PROFILE,
      '/dummy/resume.md'
    );
    db.saveApplicationDraft(draft);

    const gatekeeper = new ApprovalGatekeeper(db);
    const gmailService = new DirectGmailService('/invalid/path/token.json');

    // Attempting to send while in PENDING_REVIEW must throw SecurityAuthorizationError!
    await expect(
      gmailService.sendApprovedApplication(draft.id, gatekeeper)
    ).rejects.toThrow(SecurityAuthorizationError);
  });

  it('should execute complete end-to-end workflow: Discover -> Verify -> Score -> Tailor -> Draft -> Approve -> Send -> Audit', async () => {
    const rawJob: RawJobPayload = {
      sourceId: 'raw_001',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/jobs/scalegrid-devops',
      companyName: 'ScaleGrid Technologies',
      title: 'DevOps & Cloud Engineer',
      locationText: 'Remote (Worldwide)',
      rawDescription: `
        Looking for a DevOps Engineer with 3+ years of experience.
        Must have hands-on experience with:
        - AWS, Docker, Kubernetes, and Helm
        - Terraform for Infrastructure as Code
        - CI/CD automation with GitHub Actions
        - Prometheus and Grafana observability
        Open to candidates worldwide including India.
        Salary: $100,000 - $130,000 USD.
      `,
      publishedAt: new Date().toISOString(),
      salaryMin: 100000,
      salaryMax: 130000,
      currency: 'USD',
      employmentType: 'full-time',
      isRemote: true,
    };

    const mockConnector: IJobSourceConnector = {
      name: 'Mock Verified Feed',
      sourceType: 'remoteok',
      fetchVacancies: async () => [rawJob],
    };

    const discoveryManager = new DiscoveryManager(db, [mockConnector]);
    const gmailService = new DirectGmailService('/invalid/path/token.json');
    const driveService = new DirectGoogleDriveService('/invalid/path/token.json');
    const sheetsService = new DirectGoogleSheetsService('/invalid/path/token.json');

    const orchestrator = new MasterOrchestrator({
      db,
      discoveryManager,
      gmailService,
      driveService,
      sheetsService,
    });

    // 1. Run pipeline
    const pipelineResult = await orchestrator.runPipeline();
    expect(pipelineResult.scanReport.totalDiscovered).toBe(1);
    expect(pipelineResult.qualifiedCount).toBe(1);
    expect(pipelineResult.draftsPrepared).toBe(1);

    // 2. Inspect created draft
    const drafts = db.listDrafts('PENDING_REVIEW');
    expect(drafts.length).toBe(1);
    const draft = drafts[0];
    expect(draft.subjectLine).toContain('DevOps & Cloud Engineer');
    expect(draft.emailBody).toContain('ScaleGrid Technologies');
    expect(draft.status).toBe('PENDING_REVIEW');

    // 3. User approves and sends via interactive approval action
    const submission = await orchestrator.approveAndSend(draft.id, 'rahul_user');
    expect(submission).toBeDefined();
    expect(submission.status).toBe('SENT');
    expect(submission.auditHash).toBeDefined();
    expect(submission.approvedBy).toBe('rahul_user');

    // 4. Verify draft and vacancy status transitions
    const updatedDraft = db.getApplicationDraftById(draft.id);
    expect(updatedDraft?.status).toBe('SUBMITTED');

    const updatedVacancy = db.getVacancyById(draft.vacancyId);
    expect(updatedVacancy?.status).toBe('SUBMITTED');

    // 5. Duplicate send prevention
    await expect(
      orchestrator.approveAndSend(draft.id, 'rahul_user')
    ).rejects.toThrow(SecurityAuthorizationError);
  });
});
