import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { verifyIndiaEligibility, isEarlyApplicant } from '../src/discovery/verification.js';
import type { Vacancy, MatchScoreEvaluation, ApplicationDraft, ApplicationSubmission } from '../src/types/index.js';

describe('Phase 6 & 7: Metric Truthfulness, Zero Fake Data & Verified Eligibility', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
  });

  describe('1. Metric Invariants & Calculations', () => {
    it('returns honest zero metrics on a fresh database without fabricating numbers', () => {
      const metrics = db.getDashboardMetrics();
      expect(metrics.totalDiscovered).toBe(0);
      expect(metrics.totalQualified).toBe(0);
      expect(metrics.awaitingApproval).toBe(0);
      expect(metrics.submittedApplications).toBe(0);
      expect(metrics.interviewInvitations).toBe(0);
    });

    it('enforces totalQualified <= totalDiscovered invariant strictly', () => {
      const baseVacancy = (id: string, hash: string): Vacancy => ({
        id,
        canonicalHash: hash,
        sourceType: 'greenhouse',
        sourceUrl: `https://example.com/job/${id}`,
        alternateUrls: [],
        companyName: 'Acme Cloud',
        title: 'Platform Engineer',
        normalizedTitle: 'platform engineer',
        locationText: 'Remote',
        isRemote: true,
        acceptsIndia: true,
        employmentType: 'full-time',
        rawDescription: 'Cloud infrastructure role',
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'VERIFIED',
      });

      // Insert 3 vacancies
      db.insertOrUpdateVacancy(baseVacancy('vac_1', 'hash_1'));
      db.insertOrUpdateVacancy(baseVacancy('vac_2', 'hash_2'));
      db.insertOrUpdateVacancy(baseVacancy('vac_3', 'hash_3'));

      // Save match evaluations: vac_1 has score 85, vac_2 has score 60, vac_3 has score 90
      const makeEval = (id: string, vacId: string, score: number): MatchScoreEvaluation => ({
        id,
        vacancyId: vacId,
        overallScore: score,
        tier: score >= 75 ? 'Qualified' : 'Low',
        categoryScores: { skills: score, experience: score, roleFit: score, location: 100 },
        matchingSkills: ['kubernetes', 'terraform'],
        missingSkills: [],
        evidenceExplanation: 'Strong match',
        evaluatedAt: new Date().toISOString(),
      });

      db.saveMatchEvaluation(makeEval('eval_1', 'vac_1', 85));
      db.saveMatchEvaluation(makeEval('eval_2', 'vac_2', 60));
      db.saveMatchEvaluation(makeEval('eval_3', 'vac_3', 90));

      const metrics1 = db.getDashboardMetrics();
      expect(metrics1.totalDiscovered).toBe(3);
      expect(metrics1.totalQualified).toBe(2);
      expect(metrics1.totalQualified).toBeLessThanOrEqual(metrics1.totalDiscovered);

      // Re-evaluating existing vacancies multiple times MUST NOT inflate totalQualified
      db.saveMatchEvaluation(makeEval('eval_1_v2', 'vac_1', 88));
      db.saveMatchEvaluation(makeEval('eval_1_v3', 'vac_1', 92));
      db.saveMatchEvaluation(makeEval('eval_3_v2', 'vac_3', 95));

      const metrics2 = db.getDashboardMetrics();
      expect(metrics2.totalDiscovered).toBe(3);
      expect(metrics2.totalQualified).toBe(2); // Still strictly 2 unique qualified jobs
      expect(metrics2.totalQualified).toBeLessThanOrEqual(metrics2.totalDiscovered);
    });

    it('counts awaitingApproval strictly from pending application review drafts', () => {
      const v: Vacancy = {
        id: 'vac_draft_test',
        canonicalHash: 'hash_draft_test',
        sourceType: 'greenhouse',
        sourceUrl: 'https://example.com/draft_job',
        alternateUrls: [],
        companyName: 'Draft Co',
        title: 'DevOps Engineer',
        normalizedTitle: 'devops engineer',
        locationText: 'Remote',
        isRemote: true,
        acceptsIndia: true,
        employmentType: 'full-time',
        rawDescription: 'Desc',
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'VERIFIED',
      };
      db.insertOrUpdateVacancy(v);

      const baseDraft = (id: string, status: ApplicationDraft['status']): ApplicationDraft => ({
        id,
        vacancyId: 'vac_draft_test',
        recipientEmail: 'recruiter@draftco.com',
        subjectLine: 'Application',
        emailBody: 'Hello',
        tailoredResumePath: '/path/resume.pdf',
        status,
        createdAt: new Date().toISOString(),
      });

      // 1 Pending draft, 1 Approved draft, 1 Rejected draft
      db.saveApplicationDraft(baseDraft('draft_pending', 'PENDING_REVIEW'));
      db.saveApplicationDraft(baseDraft('draft_approved', 'APPROVED'));
      db.saveApplicationDraft(baseDraft('draft_rejected', 'REJECTED'));

      const metrics = db.getDashboardMetrics();
      // Only PENDING_REVIEW drafts must be counted as awaiting approval
      expect(metrics.awaitingApproval).toBe(1);
    });

    it('counts submittedApplications strictly from confirmed application submissions', () => {
      const v: Vacancy = {
        id: 'vac_sub_test',
        canonicalHash: 'hash_sub_test',
        sourceType: 'greenhouse',
        sourceUrl: 'https://example.com/sub_job',
        alternateUrls: [],
        companyName: 'Sub Co',
        title: 'SRE',
        normalizedTitle: 'sre',
        locationText: 'Remote',
        isRemote: true,
        acceptsIndia: true,
        employmentType: 'full-time',
        rawDescription: 'Desc',
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'VERIFIED',
      };
      db.insertOrUpdateVacancy(v);

      db.saveApplicationDraft({
        id: 'draft_sub_1',
        vacancyId: 'vac_sub_test',
        recipientEmail: 'jobs@subco.com',
        subjectLine: 'Application',
        emailBody: 'Body',
        tailoredResumePath: '/path/resume.pdf',
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
      });

      // Before submission record is inserted: 0 submitted applications
      expect(db.getDashboardMetrics().submittedApplications).toBe(0);

      // Now insert confirmed submission record
      db.saveApplicationSubmission({
        id: 'sub_record_1',
        draftId: 'draft_sub_1',
        vacancyId: 'vac_sub_test',
        sentAt: new Date().toISOString(),
        approvedBy: 'user',
        channel: 'GMAIL_API',
        auditHash: 'test_hash_123',
      });

      expect(db.getDashboardMetrics().submittedApplications).toBe(1);
    });
  });

  describe('2. Truthful Eligibility & Verified Badges', () => {
    it('requires affirmative evidence for INDIA ELIGIBLE and does not default unknown to true', () => {
      // 1. Explicitly India eligible
      expect(verifyIndiaEligibility('Bengaluru, India', 'Remote in India')).toBe(true);
      expect(verifyIndiaEligibility('Anywhere', 'Open to candidates worldwide including India')).toBe(true);
      expect(verifyIndiaEligibility('Remote (APAC)', 'APAC timezone')).toBe(true);

      // 2. Explicitly restricted elsewhere (US only, EMEA only, UK only)
      expect(verifyIndiaEligibility('Remote - US Only', 'Must be US citizen located in United States')).toBe(false);
      expect(verifyIndiaEligibility('London, UK', 'UK work authorization required')).toBe(false);
      expect(verifyIndiaEligibility('Germany', 'EU residents only')).toBe(false);

      // 3. Ambiguous location must NOT default to true
      expect(verifyIndiaEligibility('Unknown', 'No location info provided')).toBe(false);
    });

    it('requires authentic publishedAt timestamp within threshold for EARLY APPLICANT badge', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

      // Within 24-48 hours is early applicant
      expect(isEarlyApplicant(twoHoursAgo)).toBe(true);
      expect(isEarlyApplicant(oneDayAgo)).toBe(true);

      // Older than freshness threshold is NOT an early applicant
      expect(isEarlyApplicant(thirtyDaysAgo)).toBe(false);

      // Missing, undefined, or empty timestamp must never qualify as early applicant
      expect(isEarlyApplicant(undefined)).toBe(false);
      expect(isEarlyApplicant('')).toBe(false);
      expect(isEarlyApplicant('invalid-date')).toBe(false);
    });
  });
});
