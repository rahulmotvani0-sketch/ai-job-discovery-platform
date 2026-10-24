import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseManager } from '../src/core/database.js';
import { 
  computeCanonicalHash, 
  normalizeJobUrl, 
  normalizeJobTitle, 
  normalizeCompanyName, 
  normalizeLocationText,
  extractAtsPostingIdentifier 
} from '../src/discovery/deduplication.js';
import type { Vacancy } from '../src/types/index.js';

describe('Job Deduplication Service & Multi-Layer Integrity', () => {
  const testDbPath = join(process.cwd(), 'data', 'test_dedup_service.db');
  let db: DatabaseManager;

  beforeEach(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    db = new DatabaseManager(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  describe('1. Canonical Job Identity & Normalization', () => {
    it('normalizes URLs by stripping tracking parameters, fragments, and sorting query params', () => {
      const dirtyUrl1 = 'https://jobs.lever.co/stripe/abc-123/?utm_source=linkedin&utm_campaign=hiring#overview';
      const dirtyUrl2 = 'https://jobs.lever.co/stripe/abc-123?trk=public_jobs&gh_src=ref456';
      
      const norm1 = normalizeJobUrl(dirtyUrl1);
      const norm2 = normalizeJobUrl(dirtyUrl2);

      expect(norm1).toBe('https://jobs.lever.co/stripe/abc-123');
      expect(norm2).toBe('https://jobs.lever.co/stripe/abc-123');
      expect(norm1).toBe(norm2);
    });

    it('extracts stable ATS identifiers for Greenhouse, Lever, Ashby, and Workable', () => {
      const gh = extractAtsPostingIdentifier('https://boards.greenhouse.io/gitlab/jobs/4567890');
      expect(gh).toEqual({ ats: 'greenhouse', company: 'gitlab', jobId: '4567890' });

      const lever = extractAtsPostingIdentifier('https://jobs.lever.co/netflix/9876-uuid');
      expect(lever).toEqual({ ats: 'lever', company: 'netflix', jobId: '9876-uuid' });

      const ashby = extractAtsPostingIdentifier('https://jobs.ashbyhq.com/openai/123456');
      expect(ashby).toEqual({ ats: 'ashby', company: 'openai', jobId: '123456' });

      const workable = extractAtsPostingIdentifier('https://apply.workable.com/datadog/j/WORK123');
      expect(workable).toEqual({ ats: 'workable', company: 'datadog', jobId: 'work123' });
    });

    it('generates identical canonical hashes for same vacancy discovered across different sources', () => {
      const hashGreenhouse = computeCanonicalHash(
        'GitLab',
        'Senior Site Reliability Engineer',
        'https://boards.greenhouse.io/gitlab/jobs/5501?utm_medium=jobboard',
        'Remote',
        '5501',
        'greenhouse'
      );

      const hashAggregator = computeCanonicalHash(
        'GitLab Inc.',
        'Site Reliability Engineer',
        'https://boards.greenhouse.io/gitlab/jobs/5501',
        'Remote (Worldwide)',
        'aggregator_99',
        'remoteok'
      );

      expect(hashGreenhouse).toBe(hashAggregator);
    });

    it('preserves distinct identity for vacancies with different locations or requisition IDs', () => {
      const hashSF = computeCanonicalHash(
        'Stripe',
        'DevOps Engineer',
        undefined,
        'San Francisco, CA',
        undefined,
        undefined,
        'REQ-101'
      );

      const hashLondon = computeCanonicalHash(
        'Stripe',
        'DevOps Engineer',
        undefined,
        'London, UK',
        undefined,
        undefined,
        'REQ-102'
      );

      expect(hashSF).not.toBe(hashLondon);
    });
  });

  describe('2. Multi-Layer Database Deduplication & Merging', () => {
    it('updates existing canonical vacancy and merges alternate URLs rather than creating duplicate row', () => {
      const canonicalHash = computeCanonicalHash('HashiCorp', 'DevOps Engineer', 'https://hashicorp.com/careers/1');
      
      const v1: Vacancy = {
        id: 'vac_original',
        canonicalHash,
        sourceType: 'greenhouse',
        sourceUrl: 'https://boards.greenhouse.io/hashicorp/jobs/1',
        alternateUrls: [],
        companyName: 'HashiCorp',
        title: 'Senior DevOps Engineer',
        normalizedTitle: 'devops engineer',
        locationText: 'Remote (Worldwide)',
        isRemote: true,
        acceptsIndia: true,
        employmentType: 'full-time',
        rawDescription: 'Kubernetes and Terraform role',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        discoveredAt: new Date(Date.now() - 3600000).toISOString(),
        lastVerifiedAt: new Date(Date.now() - 3600000).toISOString(),
        status: 'VERIFIED',
      };

      const res1 = db.insertOrUpdateVacancy(v1);
      expect(res1.isNew).toBe(true);
      expect(db.listVacancies()).toHaveLength(1);

      // Duplicate vacancy from secondary source
      const v2: Vacancy = {
        id: 'vac_duplicate_source',
        canonicalHash,
        sourceType: 'jobicy',
        sourceUrl: 'https://jobicy.com/jobs/hashicorp-devops-1',
        alternateUrls: [],
        companyName: 'HashiCorp Inc.',
        title: 'DevOps Engineer',
        normalizedTitle: 'devops engineer',
        locationText: 'Remote',
        isRemote: true,
        acceptsIndia: true,
        employmentType: 'full-time',
        rawDescription: 'Work with Kubernetes and Terraform across global infrastructure',
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'VERIFIED',
      };

      const res2 = db.insertOrUpdateVacancy(v2);
      expect(res2.isNew).toBe(false);
      expect(res2.vacancy.id).toBe('vac_original'); // Preserved original canonical ID
      expect(res2.vacancy.alternateUrls).toContain('https://jobicy.com/jobs/hashicorp-devops-1');

      const all = db.listVacancies();
      expect(all).toHaveLength(1);
    });

    it('safely handles concurrent ingestion collisions without throwing uncaught unique constraint error', () => {
      const canonicalHash = computeCanonicalHash('Datadog', 'Platform Engineer', 'https://datadog.com/jobs/2');

      const baseJob = (id: string, sourceUrl: string): Vacancy => ({
        id,
        canonicalHash,
        sourceType: 'greenhouse',
        sourceUrl,
        alternateUrls: [],
        companyName: 'Datadog',
        title: 'Platform Engineer',
        normalizedTitle: 'platform engineer',
        locationText: 'Remote',
        isRemote: true,
        acceptsIndia: false,
        employmentType: 'full-time',
        rawDescription: 'Observability platform role',
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'VERIFIED',
      });

      // Simulate simultaneous insertion
      const workerA = db.insertOrUpdateVacancy(baseJob('job_worker_a', 'https://boards.greenhouse.io/datadog/2'));
      const workerB = db.insertOrUpdateVacancy(baseJob('job_worker_b', 'https://jobicy.com/datadog/2'));

      expect(workerA.isNew).toBe(true);
      expect(workerB.isNew).toBe(false);
      expect(workerB.vacancy.id).toBe('job_worker_a');
      expect(db.listVacancies()).toHaveLength(1);
    });

    it('deduplicateExistingVacancies migrates legacy duplicates and re-points dependent drafts and submissions', () => {
      // Insert raw legacy duplicate records into DB with different initial hashes and URLs
      const insertRaw = db.getRawDb().prepare(`
        INSERT INTO vacancies (
          id, canonical_hash, source_type, source_url, alternate_urls, company_name, title, normalized_title,
          location_text, is_remote, accepts_india, employment_type, raw_description, published_at, discovered_at, last_verified_at, status, is_contract_or_freelance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertRaw.run('canonical_1', 'legacy_hash_1', 'greenhouse', 'https://example.com/job/1', '[]', 'Acme', 'DevOps', 'devops', 'Remote', 1, 1, 'full-time', 'Desc 1', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', 'VERIFIED', 0);
      insertRaw.run('duplicate_2', 'legacy_hash_2', 'remoteok', 'https://example.com/job/1?utm_source=twitter', '[]', 'Acme', 'DevOps', 'devops', 'Remote', 1, 1, 'full-time', 'Desc 2', '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z', 'VERIFIED', 0);

      // Create draft pointing to duplicate_2
      db.saveApplicationDraft({
        id: 'draft_attached_to_duplicate',
        vacancyId: 'duplicate_2',
        tailoredResumePath: '/path/resume.pdf',
        recipientEmail: 'recruiter@acme.com',
        subjectLine: 'Application for DevOps',
        emailBody: 'Dear Recruiter...',
        screeningAnswers: {},
        status: 'PENDING_REVIEW',
        createdAt: new Date().toISOString(),
      });

      // Run cleanup
      const stats = db.deduplicateExistingVacancies();
      expect(stats.duplicatesRemoved).toBe(1);

      // Verify vacancies table is now deduplicated
      const vacancies = db.listVacancies();
      expect(vacancies).toHaveLength(1);
      expect(vacancies[0].id).toBe('canonical_1');
      expect(vacancies[0].alternateUrls).toContain('https://example.com/job/1?utm_source=twitter');

      // Verify dependent draft was re-pointed to canonical_1
      const draft = db.getApplicationDraftById('draft_attached_to_duplicate');
      expect(draft?.vacancyId).toBe('canonical_1');
    });
  });
});
