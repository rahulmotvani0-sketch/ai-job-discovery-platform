import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import { AshbyAtsConnector } from '../src/discovery/connectors/ashby.js';
import { LeverAtsConnector } from '../src/discovery/connectors/lever.js';
import { SmartRecruitersConnector } from '../src/discovery/connectors/smartrecruiters.js';
import { GreenhouseAtsConnector } from '../src/discovery/connectors/greenhouse.js';
import { WorkableAtsConnector } from '../src/discovery/connectors/workable.js';
import { RecruiteeAtsConnector } from '../src/discovery/connectors/recruitee.js';
import { extractAtsPostingIdentifier, computeCanonicalHash, normalizeJobUrl } from '../src/discovery/deduplication.js';
import type { RawJobPayload } from '../src/types/index.js';

describe('ATS Connectors Expansion Suite', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  describe('1. Connector Metadata & Configuration Validation', () => {
    it('initializes AshbyAtsConnector with standardized BaseSourceConnector metadata', () => {
      const ashby = new AshbyAtsConnector();
      expect(ashby.sourceId).toBe('ashby');
      expect(ashby.name).toBe('Ashby ATS');
      expect(ashby.sourceType).toBe('ashby');
      expect(ashby.category).toBe('ATS_PLATFORMS');
      expect(ashby.officialUrl).toBe('https://jobs.ashbyhq.com');
      expect(ashby.validateConfig()).toEqual({ valid: true, missingVars: [] });
      expect(typeof ashby.healthCheck).toBe('function');
      expect(ashby.getCompanies().length).toBeGreaterThanOrEqual(20);
    });

    it('initializes LeverAtsConnector with standardized BaseSourceConnector metadata', () => {
      const lever = new LeverAtsConnector();
      expect(lever.sourceId).toBe('lever');
      expect(lever.name).toBe('Lever ATS');
      expect(lever.sourceType).toBe('lever');
      expect(lever.category).toBe('ATS_PLATFORMS');
      expect(lever.officialUrl).toBe('https://jobs.lever.co');
      expect(lever.validateConfig()).toEqual({ valid: true, missingVars: [] });
      expect(typeof lever.healthCheck).toBe('function');
      expect(lever.getCompanies().length).toBeGreaterThanOrEqual(15);
    });

    it('initializes SmartRecruitersConnector with standardized BaseSourceConnector metadata', () => {
      const sr = new SmartRecruitersConnector();
      expect(sr.sourceId).toBe('smartrecruiters');
      expect(sr.name).toBe('SmartRecruiters ATS');
      expect(sr.sourceType).toBe('smartrecruiters');
      expect(sr.category).toBe('ATS_PLATFORMS');
      expect(sr.officialUrl).toBe('https://www.smartrecruiters.com');
      expect(sr.validateConfig()).toEqual({ valid: true, missingVars: [] });
      expect(typeof sr.healthCheck).toBe('function');
      expect(sr.getCompanies().length).toBeGreaterThanOrEqual(10);
    });

    it('initializes GreenhouseAtsConnector with standardized BaseSourceConnector metadata', () => {
      const gh = new GreenhouseAtsConnector();
      expect(gh.sourceId).toBe('greenhouse');
      expect(gh.name).toBe('Greenhouse ATS');
      expect(gh.sourceType).toBe('greenhouse');
      expect(gh.category).toBe('ATS_PLATFORMS');
      expect(gh.officialUrl).toBe('https://boards.greenhouse.io');
      expect(gh.validateConfig()).toEqual({ valid: true, missingVars: [] });
      expect(typeof gh.healthCheck).toBe('function');
      expect(gh.getCompanies().length).toBeGreaterThanOrEqual(15);
    });

    it('initializes WorkableAtsConnector with standardized BaseSourceConnector metadata', () => {
      const workable = new WorkableAtsConnector();
      expect(workable.sourceId).toBe('workable');
      expect(workable.name).toBe('Workable ATS');
      expect(workable.sourceType).toBe('workable');
      expect(workable.category).toBe('ATS_PLATFORMS');
      expect(workable.officialUrl).toBe('https://apply.workable.com');
      expect(workable.validateConfig()).toEqual({ valid: true, missingVars: [] });
      expect(typeof workable.healthCheck).toBe('function');
      expect(workable.getCompanies().length).toBeGreaterThanOrEqual(8);
    });

    it('initializes RecruiteeAtsConnector with standardized BaseSourceConnector metadata', () => {
      const recruitee = new RecruiteeAtsConnector();
      expect(recruitee.sourceId).toBe('recruitee');
      expect(recruitee.name).toBe('Recruitee ATS');
      expect(recruitee.sourceType).toBe('recruitee');
      expect(recruitee.category).toBe('ATS_PLATFORMS');
      expect(recruitee.officialUrl).toBe('https://recruitee.com');
      expect(recruitee.validateConfig()).toEqual({ valid: true, missingVars: [] });
      expect(typeof recruitee.healthCheck).toBe('function');
      expect(recruitee.getCompanies().length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('2. Dynamic Company Pool Expansion', () => {
    it('supports adding custom target companies to Ashby connector', () => {
      const ashby = new AshbyAtsConnector();
      const initialCount = ashby.getCompanies().length;
      ashby.addCompany('anthropic', 'Anthropic');
      expect(ashby.getCompanies().length).toBe(initialCount + 1);
      expect(ashby.getCompanies().some(c => c.slug === 'anthropic' && c.name === 'Anthropic')).toBe(true);

      // Idempotent addition
      ashby.addCompany('anthropic', 'Anthropic Duplicate');
      expect(ashby.getCompanies().length).toBe(initialCount + 1);
    });

    it('supports adding custom target companies to Lever, SmartRecruiters, Greenhouse, Workable, and Recruitee', () => {
      const lever = new LeverAtsConnector();
      lever.addCompany('cloudflare-partner');
      expect(lever.getCompanies()).toContain('cloudflare-partner');

      const sr = new SmartRecruitersConnector();
      sr.addCompany('Siemens');
      expect(sr.getCompanies()).toContain('Siemens');

      const gh = new GreenhouseAtsConnector();
      gh.addCompany('netflix');
      expect(gh.getCompanies()).toContain('netflix');

      const workable = new WorkableAtsConnector();
      workable.addCompany('monzo');
      expect(workable.getCompanies()).toContain('monzo');

      const recruitee = new RecruiteeAtsConnector();
      recruitee.addCompany('messagebird');
      expect(recruitee.getCompanies()).toContain('messagebird');
    });
  });

  describe('3. ATS Posting Extraction & Canonical Deduplication', () => {
    it('extracts ATS identifiers from Ashby URLs accurately', () => {
      const parsed = extractAtsPostingIdentifier('https://jobs.ashbyhq.com/linear/a1b2c3d4-5678-90ab');
      expect(parsed).toEqual({
        ats: 'ashby',
        company: 'linear',
        jobId: 'a1b2c3d4-5678-90ab',
      });
    });

    it('extracts ATS identifiers from Lever URLs accurately', () => {
      const parsed = extractAtsPostingIdentifier('https://jobs.lever.co/palantir/89abcdef-0123-4567');
      expect(parsed).toEqual({
        ats: 'lever',
        company: 'palantir',
        jobId: '89abcdef-0123-4567',
      });
    });

    it('extracts ATS identifiers from SmartRecruiters URLs accurately', () => {
      const parsed = extractAtsPostingIdentifier('https://jobs.smartrecruiters.com/Visa/743999912345678');
      expect(parsed).toEqual({
        ats: 'smartrecruiters',
        company: 'visa',
        jobId: '743999912345678',
      });
    });

    it('extracts ATS identifiers from Greenhouse URLs accurately', () => {
      const parsed = extractAtsPostingIdentifier('https://boards.greenhouse.io/canonical/jobs/1234567');
      expect(parsed).toEqual({
        ats: 'greenhouse',
        company: 'canonical',
        jobId: '1234567',
      });
    });

    it('extracts ATS identifiers from Workable URLs accurately', () => {
      const parsed = extractAtsPostingIdentifier('https://apply.workable.com/taxfix/j/ABCD1234EF/');
      expect(parsed).toEqual({
        ats: 'workable',
        company: 'taxfix',
        jobId: 'abcd1234ef',
      });
    });

    it('extracts ATS identifiers from Recruitee URLs accurately', () => {
      const parsed1 = extractAtsPostingIdentifier('https://transloadit.recruitee.com/o/senior-systems-engineer');
      expect(parsed1).toEqual({
        ats: 'recruitee',
        company: 'transloadit',
        jobId: 'senior-systems-engineer',
      });

      const parsed2 = extractAtsPostingIdentifier('https://jobs.recruitee.com/framer/o/lead-frontend-architect');
      expect(parsed2).toEqual({
        ats: 'recruitee',
        company: 'framer',
        jobId: 'lead-frontend-architect',
      });
    });

    it('guarantees identical canonical hash for ATS URLs with differing marketing params', () => {
      const url1 = 'https://jobs.ashbyhq.com/linear/a1b2c3d4-5678-90ab?utm_source=linkedin&utm_campaign=hiring2026';
      const url2 = 'https://jobs.ashbyhq.com/linear/a1b2c3d4-5678-90ab?ref=twitter&trk=post_123';
      const url3 = 'https://jobs.ashbyhq.com/linear/a1b2c3d4-5678-90ab';

      const hash1 = computeCanonicalHash('Linear', 'Senior Infrastructure Engineer', url1);
      const hash2 = computeCanonicalHash('Linear', 'Senior Infrastructure Engineer', url2);
      const hash3 = computeCanonicalHash('Linear', 'Senior Infrastructure Engineer', url3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('uses Level 2 Direct ATS hash when sourceId and sourceType are provided', () => {
      const hash = computeCanonicalHash(
        'Linear',
        'Senior Software Engineer',
        undefined,
        'Remote',
        'ashby_linear_12345',
        'ashby'
      );
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256
    });
  });

  describe('4. DiscoveryManager Ingestion & Multi-Source Deduplication', () => {
    it('ingests and normalizes Ashby, Lever, SmartRecruiters, Greenhouse, Workable, and Recruitee payloads', () => {
      const manager = new DiscoveryManager(db);

      // 1. Ashby
      const ashbyPayload: RawJobPayload = {
        sourceId: 'ashby_linear_job1',
        sourceType: 'ashby',
        requisitionId: 'job1',
        sourceUrl: 'https://jobs.ashbyhq.com/linear/job1',
        companyName: 'Linear',
        title: 'Senior DevOps / SRE',
        locationText: 'Remote (Worldwide)',
        rawDescription: 'Operating Kubernetes, multi-region AWS cloud infrastructure, and observability.',
        publishedAt: new Date().toISOString(),
        employmentType: 'full-time',
        isRemote: true,
      };
      const resAshby = manager.processRawPayload(ashbyPayload);
      expect(resAshby.inserted).toBe(true);
      expect(resAshby.vacancy.sourceType).toBe('ashby');
      expect(resAshby.vacancy.category).toBe('SRE');
      expect(resAshby.vacancy.isRemote).toBe(true);
      expect(resAshby.vacancy.acceptsIndia).toBe(true);

      // 2. Lever
      const leverPayload: RawJobPayload = {
        sourceId: 'lever_palantir_job2',
        sourceType: 'lever',
        requisitionId: 'job2',
        sourceUrl: 'https://jobs.lever.co/palantir/job2',
        companyName: 'Palantir',
        title: 'Platform Infrastructure Engineer',
        locationText: 'Bengaluru, India',
        rawDescription: 'Deploying high-reliability distributed platforms and microservices.',
        publishedAt: new Date().toISOString(),
        employmentType: 'full-time',
        isRemote: false,
      };
      const resLever = manager.processRawPayload(leverPayload);
      expect(resLever.inserted).toBe(true);
      expect(resLever.vacancy.sourceType).toBe('lever');
      expect(resLever.vacancy.country).toBe('India');
      expect(resLever.vacancy.acceptsIndia).toBe(true);

      // 3. SmartRecruiters
      const srPayload: RawJobPayload = {
        sourceId: 'smartrecruiters_visa_job3',
        sourceType: 'smartrecruiters',
        requisitionId: 'job3',
        sourceUrl: 'https://jobs.smartrecruiters.com/Visa/job3',
        companyName: 'Visa',
        title: 'Cybersecurity Architect',
        locationText: 'Bangalore, Karnataka, India',
        rawDescription: 'Securing global transaction networks and cloud payment gateways.',
        publishedAt: new Date().toISOString(),
        employmentType: 'full-time',
        isRemote: false,
      };
      const resSr = manager.processRawPayload(srPayload);
      expect(resSr.inserted).toBe(true);
      expect(resSr.vacancy.sourceType).toBe('smartrecruiters');
      expect(resSr.vacancy.category).toBe('Cybersecurity');

      // 4. Greenhouse
      const ghPayload: RawJobPayload = {
        sourceId: 'greenhouse_canonical_job4',
        sourceType: 'greenhouse',
        requisitionId: 'job4',
        sourceUrl: 'https://boards.greenhouse.io/canonical/jobs/job4',
        companyName: 'Canonical',
        title: 'Kubernetes Cloud Engineer',
        locationText: 'Remote, India',
        rawDescription: 'Building Ubuntu cloud images and orchestrating Kubernetes clusters globally.',
        publishedAt: new Date().toISOString(),
        employmentType: 'full-time',
        isRemote: true,
      };
      const resGh = manager.processRawPayload(ghPayload);
      expect(resGh.inserted).toBe(true);
      expect(resGh.vacancy.sourceType).toBe('greenhouse');
      expect(resGh.vacancy.category).toBe('Kubernetes');

      // 5. Workable
      const workablePayload: RawJobPayload = {
        sourceId: 'workable_taxfix_job5',
        sourceType: 'workable',
        requisitionId: 'job5',
        sourceUrl: 'https://apply.workable.com/taxfix/j/job5/',
        companyName: 'Taxfix',
        title: 'Senior Backend Engineer (Golang / AWS)',
        locationText: 'Remote',
        rawDescription: 'Developing fintech APIs, high-scale services in Go and AWS.',
        publishedAt: new Date().toISOString(),
        employmentType: 'full-time',
        isRemote: true,
      };
      const resWorkable = manager.processRawPayload(workablePayload);
      expect(resWorkable.inserted).toBe(true);
      expect(resWorkable.vacancy.sourceType).toBe('workable');
      expect(resWorkable.vacancy.category).toBe('Backend');

      // 6. Recruitee
      const recruiteePayload: RawJobPayload = {
        sourceId: 'recruitee_transloadit_job6',
        sourceType: 'recruitee',
        requisitionId: 'job6',
        sourceUrl: 'https://transloadit.recruitee.com/o/job6',
        companyName: 'Transloadit',
        title: 'Full-Stack Developer (Node.js & React)',
        locationText: 'Remote - Worldwide',
        rawDescription: 'Building open source file uploading SDKs and media transcoding infrastructure.',
        publishedAt: new Date().toISOString(),
        employmentType: 'full-time',
        isRemote: true,
      };
      const resRecruitee = manager.processRawPayload(recruiteePayload);
      expect(resRecruitee.inserted).toBe(true);
      expect(resRecruitee.vacancy.sourceType).toBe('recruitee');
      expect(resRecruitee.vacancy.category).toBe('Full-Stack');

      // Duplicate detection test: attempting to re-insert the identical Ashby job must yield inserted: false
      const duplicateRes = manager.processRawPayload({
        ...ashbyPayload,
        sourceUrl: 'https://jobs.ashbyhq.com/linear/job1?utm_medium=email',
      });
      expect(duplicateRes.inserted).toBe(false);
      expect(duplicateRes.vacancy.canonicalHash).toBe(resAshby.vacancy.canonicalHash);
    });
  });

  describe('5. Health Check Resilience & Mock Failure Handling', () => {
    it('executes Ashby healthCheck safely and handles connection timeouts gracefully', async () => {
      const ashby = new AshbyAtsConnector();
      const mockFetch = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      (ashby as any).safeFetch = mockFetch;

      const health = await ashby.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.sourceId).toBe('ashby');
      expect(health.message).toContain('ETIMEDOUT');
    });

    it('executes Lever healthCheck safely and returns healthy true on HTTP 200', async () => {
      const lever = new LeverAtsConnector();
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: '1' }]), { status: 200 }));
      (lever as any).safeFetch = mockFetch;

      const health = await lever.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.sourceId).toBe('lever');
      expect(health.statusCode).toBe(200);
      expect(health.message).toContain('Lever public postings API operational');
    });

    it('executes Recruitee healthCheck safely and returns healthy true on HTTP 200', async () => {
      const recruitee = new RecruiteeAtsConnector();
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ offers: [] }), { status: 200 }));
      (recruitee as any).safeFetch = mockFetch;

      const health = await recruitee.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.sourceId).toBe('recruitee');
      expect(health.statusCode).toBe(200);
      expect(health.message).toContain('Recruitee public offers API operational');
    });
  });

  describe('6. DiscoveryManager Targeted ATS Scans', () => {
    it('filters and triggers only designated ATS connectors when sourceIds are specified', async () => {
      const manager = new DiscoveryManager(db);

      // Mock fetchVacancies on Ashby & Lever connectors
      const connectors = manager.getConnectors();
      const ashby = connectors.find(c => c.sourceType === 'ashby');
      const lever = connectors.find(c => c.sourceType === 'lever');

      expect(ashby).toBeDefined();
      expect(lever).toBeDefined();

      const ashbySpy = vi.spyOn(ashby!, 'fetchVacancies').mockResolvedValue([
        {
          sourceId: 'ashby_supabase_mock1',
          sourceType: 'ashby',
          requisitionId: 'mock1',
          sourceUrl: 'https://jobs.ashbyhq.com/supabase/mock1',
          companyName: 'Supabase',
          title: 'Senior Postgres Cloud Infrastructure Engineer',
          locationText: 'Remote',
          rawDescription: 'Operating managed PostgreSQL, Elixir realtime servers, and Kubernetes clusters.',
          publishedAt: new Date().toISOString(),
          employmentType: 'full-time',
          isRemote: true,
        }
      ]);

      const leverSpy = vi.spyOn(lever!, 'fetchVacancies').mockResolvedValue([]);

      const report = await manager.runDiscoveryScan({
        sourceIds: ['ashby', 'lever'],
        limitPerSource: 10,
      });

      expect(ashbySpy).toHaveBeenCalledTimes(1);
      expect(leverSpy).toHaveBeenCalledTimes(1);
      expect(report.sourcesQueried).toContain('ashby');
      expect(report.sourcesQueried).toContain('lever');
      expect(report.sourcesQueried.length).toBe(2);
      expect(report.newVacancies).toBe(1);
    });
  });
});
