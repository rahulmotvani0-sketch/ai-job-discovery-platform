import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES } from '../src/core/profile.js';
import { sanitizeText } from '../src/core/logger.js';
import type { Vacancy, ApplicationDraft } from '../src/types/index.js';

describe('Phase 2: Foundation & Database Persistence Tests', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
  });

  it('should save and retrieve Rahul Motvani user profile without alteration', () => {
    db.saveUserProfile(DEFAULT_USER_PROFILE);
    const profile = db.getUserProfile();
    expect(profile).not.toBeNull();
    expect(profile?.fullName).toBe('Rahul Motvani');
    expect(profile?.email).toBe('rahulmotvani8@gmail.com');
    expect(profile?.experiences.length).toBeGreaterThanOrEqual(4);
    expect(profile?.skills.cloudPlatforms).toContain('AWS (EC2, S3, RDS, Lambda, ECS, EKS, API Gateway, WAF, IAM, VPC, CloudWatch)');
  });

  it('should save and retrieve job preferences with correct role weights', () => {
    db.savePreferences(DEFAULT_JOB_PREFERENCES);
    const prefs = db.getPreferences();
    expect(prefs).not.toBeNull();
    expect(prefs?.minCompensationInrLpa).toBe(15.0);
    expect(prefs?.prioritizeRemote).toBe(true);
    expect(prefs?.targetRoles.find(r => r.title === 'DevOps Engineer')?.weight).toBe(0.30);
  });

  it('should handle vacancy insertion and deduplication via canonical hash', () => {
    const dummyVacancy: Vacancy = {
      id: 'vac_001',
      canonicalHash: 'hash_canonical_devops_agile',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/jobs/12345',
      alternateUrls: ['https://remoteok.com/jobs/12345'],
      companyName: 'TechCorp Cloud',
      title: 'Senior DevOps Engineer',
      normalizedTitle: 'devops engineer',
      locationText: 'Remote (Worldwide)',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time',
      salaryMin: 90000,
      salaryMax: 130000,
      currency: 'USD',
      rawDescription: 'Looking for a Senior DevOps Engineer with Kubernetes, Terraform, and CI/CD.',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
    };

    const res1 = db.insertOrUpdateVacancy(dummyVacancy);
    expect(res1.inserted).toBe(true);
    expect(res1.id).toBe('vac_001');

    // Duplicate discovery with alternate URL
    const duplicateVacancy: Vacancy = {
      ...dummyVacancy,
      id: 'vac_002', // different discovery id
      sourceUrl: 'https://himalayas.app/jobs/12345', // different source url
      alternateUrls: ['https://himalayas.app/jobs/12345'],
    };

    const res2 = db.insertOrUpdateVacancy(duplicateVacancy);
    expect(res2.inserted).toBe(false);
    expect(res2.id).toBe('vac_001'); // returns existing canonical id!

    const existing = db.getVacancyById('vac_001');
    expect(existing?.alternateUrls).toContain('https://remoteok.com/jobs/12345');
    expect(existing?.alternateUrls).toContain('https://himalayas.app/jobs/12345');
  });

  it('should enforce deterministic approval gate on application drafts', () => {
    const dummyVacancy: Vacancy = {
      id: 'vac_001',
      canonicalHash: 'hash_canonical_devops_test',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/jobs/12345',
      alternateUrls: ['https://remoteok.com/jobs/12345'],
      companyName: 'TechCorp Cloud',
      title: 'Senior DevOps Engineer',
      normalizedTitle: 'devops engineer',
      locationText: 'Remote (Worldwide)',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time',
      rawDescription: 'DevOps job description',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
    };
    db.insertOrUpdateVacancy(dummyVacancy);

    const draft: ApplicationDraft = {
      id: 'draft_001',
      vacancyId: 'vac_001',
      recipientEmail: 'recruiter@techcorp.com',
      subjectLine: 'Application: DevOps Engineer - Rahul Motvani',
      emailBody: 'Dear Hiring Team, I am writing to express my interest...',
      coverLetter: 'Cover letter content...',
      tailoredResumePath: '/resumes/tailored_001.pdf',
      status: 'PENDING_REVIEW',
      createdAt: new Date().toISOString(),
    };

    db.saveApplicationDraft(draft);
    let fetched = db.getApplicationDraftById('draft_001');
    expect(fetched?.status).toBe('PENDING_REVIEW');

    // User approves
    db.approveDraft('draft_001', 'rahul_user');
    fetched = db.getApplicationDraftById('draft_001');
    expect(fetched?.status).toBe('APPROVED');
    expect(fetched?.reviewedAt).toBeDefined();

    // User rejects another draft
    db.saveApplicationDraft({ ...draft, id: 'draft_002', status: 'PENDING_REVIEW' });
    db.rejectDraft('draft_002', 'Salary below expectations', 'rahul_user');
    const rejected = db.getApplicationDraftById('draft_002');
    expect(rejected?.status).toBe('REJECTED_BY_USER');
    expect(rejected?.notes).toBe('Salary below expectations');
  });

  it('should redact sensitive tokens and credentials from logs', () => {
    const rawLog = 'Authorization: Bearer ya29.a0AfH6SMD_dummy_long_secret_token_123456789 and api_key="sk-proj-98765432101234567890"';
    const cleaned = sanitizeText(rawLog);
    expect(cleaned).not.toContain('ya29.a0AfH6SMD_dummy_long_secret_token_123456789');
    expect(cleaned).not.toContain('sk-proj-98765432101234567890');
    expect(cleaned).toContain('[REDACTED]');
  });
});
