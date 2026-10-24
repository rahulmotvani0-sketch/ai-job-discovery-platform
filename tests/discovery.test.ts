import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { normalizeJobUrl, normalizeJobTitle, computeCanonicalHash } from '../src/discovery/deduplication.js';
import { VacancyVerificationAgent } from '../src/discovery/verification.js';
import { QueryGenerator } from '../src/discovery/query-generator.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import type { IJobSourceConnector } from '../src/discovery/connectors/types.js';
import type { RawJobPayload } from '../src/types/index.js';
import { DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES } from '../src/core/profile.js';

describe('Phase 3: Job Discovery, Verification & Deduplication Tests', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
  });

  describe('Deduplication & URL Normalization', () => {
    it('should strip tracking parameters, fragments, and lowercase URLs correctly', () => {
      const raw1 = 'https://Example.com/jobs/devops-lead?utm_source=linkedin&utm_medium=cpc&ref=jobboard#apply';
      const raw2 = 'https://example.com/jobs/devops-lead/';
      expect(normalizeJobUrl(raw1)).toBe('https://example.com/jobs/devops-lead');
      expect(normalizeJobUrl(raw2)).toBe('https://example.com/jobs/devops-lead');
    });

    it('should normalize job titles by removing seniority levels and punctuation', () => {
      expect(normalizeJobTitle('Senior DevOps Engineer (Remote)')).toBe('devops engineer');
      expect(normalizeJobTitle('Lead Site Reliability Engineer [India]')).toBe('site reliability engineer');
      expect(normalizeJobTitle('Cloud Infrastructure Engineer - CI/CD & Terraform')).toBe('cloud infrastructure engineer ci cd terraform');
    });

    it('should compute identical canonical hashes for same company & title across different job boards', () => {
      const hash1 = computeCanonicalHash('HashiCorp Inc.', 'Senior DevOps Engineer', 'https://remoteok.com/jobs/hashicorp-devops-123');
      const hash2 = computeCanonicalHash('HashiCorp', 'DevOps Engineer', 'https://jobicy.com/jobs/hashicorp-devops-123');
      expect(hash1).toBe(hash2);
    });
  });

  describe('Vacancy Verification Agent', () => {
    it('should detect closed or expired job postings', () => {
      const expiredDesc = 'Thank you for your interest. This position has been filled and is no longer accepting applications.';
      const res = VacancyVerificationAgent.verifyContent(expiredDesc, 'Remote', 200);
      expect(res.isExpired).toBe(true);
      expect(res.isVerified).toBe(false);
      expect(res.reasons.some(r => r.includes('job closure'))).toBe(true);
    });

    it('should detect strict US-only residency restrictions and flag acceptsIndia = false', () => {
      const usDesc = 'We are hiring a DevOps engineer. Candidates must be located in the United States and authorized to work in the US only without sponsorship.';
      const res = VacancyVerificationAgent.verifyContent(usDesc, 'Remote (US Only)', 200);
      expect(res.isVerified).toBe(true);
      expect(res.acceptsIndia).toBe(false);
      expect(res.reasons.some(r => r.includes('strict domestic restriction'))).toBe(true);
    });

    it('should verify global / India-eligible vacancies', () => {
      const globalDesc = 'We are a fully distributed worldwide team looking for a Kubernetes / Terraform engineer. Open to applicants globally.';
      const res = VacancyVerificationAgent.verifyContent(globalDesc, 'Remote (Worldwide)', 200);
      expect(res.isVerified).toBe(true);
      expect(res.isExpired).toBe(false);
      expect(res.acceptsIndia).toBe(true);
    });
  });

  describe('Query Generator', () => {
    it('should generate prioritized queries covering all target roles and tech skills', () => {
      const queries = QueryGenerator.generateQueries(DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES);
      expect(queries.length).toBeGreaterThan(5);
      expect(queries[0].priority).toBeGreaterThanOrEqual(queries[queries.length - 1].priority);
      
      const rolesRepresented = queries.map(q => q.role);
      expect(rolesRepresented).toContain('DevOps Engineer');
      expect(rolesRepresented).toContain('Platform Engineer');
      expect(rolesRepresented).toContain('Site Reliability Engineer / SRE I');
      expect(rolesRepresented).toContain('DevSecOps Engineer');
    });
  });

  describe('Discovery Manager with Connectors', () => {
    it('should ingest vacancies, reject duplicates, and record canonical records in database', async () => {
      const mockJobs: RawJobPayload[] = [
        {
          sourceId: 'mock_1',
          sourceType: 'remoteok',
          sourceUrl: 'https://mock.com/jobs/101?ref=test',
          companyName: 'Acme Cloud Solutions',
          title: 'Senior DevOps Engineer',
          locationText: 'Remote (Worldwide)',
          rawDescription: 'Work with Kubernetes, AWS, and Terraform. We welcome applicants worldwide including India.',
          publishedAt: new Date().toISOString(),
          salaryMin: 95000,
          salaryMax: 125000,
          currency: 'USD',
          employmentType: 'full-time',
          isRemote: true,
        },
        {
          sourceId: 'mock_2',
          sourceType: 'jobicy',
          sourceUrl: 'https://jobicy.com/jobs/acme-101',
          companyName: 'Acme Cloud', // Same company normalized
          title: 'DevOps Engineer', // Same title normalized
          locationText: 'Remote',
          rawDescription: 'Work with Kubernetes, AWS, and Terraform.',
          publishedAt: new Date().toISOString(),
          employmentType: 'full-time',
          isRemote: true,
        },
        {
          sourceId: 'mock_3',
          sourceType: 'greenhouse',
          sourceUrl: 'https://boards.greenhouse.io/usonly/102',
          companyName: 'US Defense Tech',
          title: 'DevSecOps Engineer',
          locationText: 'Remote (US Citizens Only)',
          rawDescription: 'US citizens only. Must reside in the United States.',
          publishedAt: new Date().toISOString(),
          employmentType: 'full-time',
          isRemote: true,
        }
      ];

      const mockConnector: IJobSourceConnector = {
        name: 'Mock Connector',
        sourceType: 'other',
        fetchVacancies: async () => mockJobs,
      };

      const manager = new DiscoveryManager(db, [mockConnector]);
      const report = await manager.runDiscoveryScan();

      expect(report.totalDiscovered).toBe(3);
      expect(report.newVacancies).toBe(2); // 1 duplicate was properly merged!
      expect(report.duplicateVacancies).toBe(1);
      expect(report.verifiedActive).toBe(2);
      expect(report.indiaEligible).toBe(1); // Only Acme Cloud was India eligible, US Defense Tech was restricted!

      const allVacancies = db.listVacancies();
      expect(allVacancies.length).toBe(2);
      
      const acme = allVacancies.find(v => v.companyName.includes('Acme'));
      expect(acme).toBeDefined();
      expect(acme?.alternateUrls.length).toBe(2); // Retained both source URLs!
    });

    it('should parse and normalize vacancies from HimalayasConnector', async () => {
      const { HimalayasConnector } = await import('../src/discovery/connectors/himalayas.js');
      const himalayas = new HimalayasConnector();
      expect(himalayas.name).toBe('Himalayas Remote');
      expect(himalayas.sourceType).toBe('himalayas');

      // Test processing a sample Himalayas payload
      const manager = new DiscoveryManager(db);
      const res = manager.processRawPayload({
        sourceId: 'him_123',
        sourceType: 'himalayas',
        sourceUrl: 'https://himalayas.app/jobs/devops-lead-123',
        companyName: 'CloudScale Global',
        title: 'Lead Platform / DevOps Engineer',
        locationText: 'Remote (Worldwide)',
        rawDescription: 'Manage Kubernetes and Terraform across multi-cloud environments.',
        publishedAt: new Date().toISOString(),
        salaryMin: 120000,
        salaryMax: 160000,
        currency: 'USD',
        isRemote: true,
      });

      expect(res.inserted).toBe(true);
      expect(res.vacancy.companyName).toBe('CloudScale Global');
      expect(res.vacancy.category).toBe('Platform Engineer');
      expect(res.vacancy.isEarlyApplicant).toBe(true);
      expect(res.vacancy.salaryMin).toBe(120000);
    });

    it('should parse and normalize vacancies from LeverAtsConnector', async () => {
      const { LeverAtsConnector } = await import('../src/discovery/connectors/lever.js');
      const lever = new LeverAtsConnector();
      expect(lever.name).toBe('Lever ATS');
      expect(lever.sourceType).toBe('lever');

      const manager = new DiscoveryManager(db);
      const res = manager.processRawPayload({
        sourceId: 'lever_palantir_abc123',
        sourceType: 'lever',
        sourceUrl: 'https://jobs.lever.co/palantir/abc123',
        companyName: 'Palantir',
        title: 'Infrastructure & Kubernetes Systems Engineer',
        locationText: 'Remote, India',
        rawDescription: 'Scale mission-critical container clusters, ArgoCD, and infrastructure automation.',
        publishedAt: new Date().toISOString(),
        employmentType: 'full-time',
        isRemote: true,
      });

      expect(res.inserted).toBe(true);
      expect(res.vacancy.companyName).toBe('Palantir');
      expect(['Cloud Infrastructure', 'Kubernetes']).toContain(res.vacancy.category);
      expect(res.vacancy.isEarlyApplicant).toBe(true);
      expect(res.vacancy.country).toBe('India');
      expect(res.vacancy.acceptsIndia).toBe(true);
    });

    it('should parse and normalize vacancies from AshbyAtsConnector', async () => {
      const { AshbyAtsConnector } = await import('../src/discovery/connectors/ashby.js');
      const ashby = new AshbyAtsConnector();
      expect(ashby.name).toBe('Ashby ATS');
      expect(ashby.sourceType).toBe('ashby');

      const manager = new DiscoveryManager(db);
      const res = manager.processRawPayload({
        sourceId: 'ashby_linear_def456',
        sourceType: 'ashby',
        sourceUrl: 'https://jobs.ashbyhq.com/linear/def456',
        companyName: 'Linear',
        title: 'Staff Cloud Infrastructure Engineer',
        locationText: 'Remote (Worldwide)',
        rawDescription: 'Architect multi-region Kubernetes, cloud infrastructure, and security posture.',
        publishedAt: new Date().toISOString(),
        employmentType: 'full-time',
        isRemote: true,
      });

      expect(res.inserted).toBe(true);
      expect(res.vacancy.companyName).toBe('Linear');
      expect(res.vacancy.category).toBe('Cloud Infrastructure');
      expect(res.vacancy.isEarlyApplicant).toBe(true);
      expect(res.vacancy.acceptsIndia).toBe(true);
    });
  });
});
