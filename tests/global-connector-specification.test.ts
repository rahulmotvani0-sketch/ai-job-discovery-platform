import { describe, it, expect } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import type { IJobSourceConnector } from '../src/discovery/connectors/types.js';
import { GreenhouseAtsConnector } from '../src/discovery/connectors/greenhouse.js';
import { LeverAtsConnector } from '../src/discovery/connectors/lever.js';
import { AshbyAtsConnector } from '../src/discovery/connectors/ashby.js';
import { WorkableAtsConnector } from '../src/discovery/connectors/workable.js';
import { SmartRecruitersConnector } from '../src/discovery/connectors/smartrecruiters.js';
import { RecruiteeAtsConnector } from '../src/discovery/connectors/recruitee.js';
import { USAJobsConnector } from '../src/discovery/connectors/usajobs.js';
import { AdzunaConnector } from '../src/discovery/connectors/adzuna.js';
import { RemoteOkConnector } from '../src/discovery/connectors/remoteok.js';
import { RemotiveConnector } from '../src/discovery/connectors/remotive.js';
import { HimalayasConnector } from '../src/discovery/connectors/himalayas.js';
import { JobicyConnector } from '../src/discovery/connectors/jobicy.js';
import { YCombinatorStartupsConnector } from '../src/discovery/connectors/ycombinator.js';
import { DirectCareersConnector } from '../src/discovery/connectors/direct-careers.js';

describe('Global Connector Specification Compliance', () => {
  const connectors: IJobSourceConnector[] = [
    new GreenhouseAtsConnector(),
    new LeverAtsConnector(),
    new AshbyAtsConnector(),
    new WorkableAtsConnector(),
    new SmartRecruitersConnector(),
    new RecruiteeAtsConnector(),
    new USAJobsConnector(),
    new AdzunaConnector(),
    new RemoteOkConnector(),
    new RemotiveConnector(),
    new HimalayasConnector(),
    new JobicyConnector(),
    new YCombinatorStartupsConnector(),
    new DirectCareersConnector(),
  ];

  it('verifies that EVERY connector implements the 11 mandatory specification requirements', () => {
    expect(connectors.length).toBe(14);

    for (const connector of connectors) {
      // 1. Source name
      expect(connector.name).toBeDefined();
      expect(typeof connector.name).toBe('string');
      expect(connector.name.trim().length).toBeGreaterThan(0);

      // 2. Countries and regions
      expect(connector.countriesAndRegions).toBeDefined();
      expect(Array.isArray(connector.countriesAndRegions?.countries)).toBe(true);
      expect(connector.countriesAndRegions?.countries.length).toBeGreaterThan(0);
      expect(Array.isArray(connector.countriesAndRegions?.regions)).toBe(true);
      expect(connector.countriesAndRegions?.regions.length).toBeGreaterThan(0);

      // 3. Supported job categories
      expect(connector.supportedCategories).toBeDefined();
      expect(Array.isArray(connector.supportedCategories)).toBe(true);
      expect(connector.supportedCategories?.length).toBeGreaterThan(0);

      // 4. Authentication requirements
      expect(connector.authRequirements).toBeDefined();
      expect(['NONE', 'API_KEY', 'OAUTH2', 'PARTNER_KEY']).toContain(connector.authRequirements?.type);

      // 5. API or usage restrictions
      expect(connector.usageRestrictions).toBeDefined();
      expect(typeof connector.usageRestrictions).toBe('string');
      expect(connector.usageRestrictions?.length).toBeGreaterThan(10);

      // 6. Rate limits
      expect(connector.rateLimits).toBeDefined();
      expect(typeof connector.rateLimits?.requestsPerMinute).toBe('number');
      expect(connector.rateLimits!.requestsPerMinute).toBeGreaterThan(0);

      // 7. Pagination behavior
      expect(connector.pagination).toBeDefined();
      expect(['OFFSET_LIMIT', 'PAGE_NUMBER', 'CURSOR', 'NONE']).toContain(connector.pagination?.type);

      // 8. Retry policy
      expect(connector.retryPolicy).toBeDefined();
      expect(typeof connector.retryPolicy?.maxRetries).toBe('number');
      expect(typeof connector.retryPolicy?.backoffMs).toBe('number');

      // 9. Health status
      expect(connector.healthStatus).toBeDefined();
      expect(['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNTESTED']).toContain(connector.healthStatus);

      // 10. Last successful sync
      expect(connector.lastSuccessfulSync !== undefined).toBe(true);

      // 11. Attribution requirements
      expect(connector.attribution).toBeDefined();
      expect(typeof connector.attribution?.required).toBe('boolean');
      expect(typeof connector.attribution?.text).toBe('string');
      expect(connector.attribution?.text.length).toBeGreaterThan(0);
    }
  });

  it('isolates failures: continuing operation when an individual source fails', async () => {
    const db = new DatabaseManager(':memory:');

    // Create a mock failing connector alongside a healthy connector
    const failingConnector: IJobSourceConnector = {
      name: 'Simulated Failing Source',
      sourceType: 'other',
      sourceId: 'failing_source',
      async fetchVacancies() {
        throw new Error('Simulated upstream network timeout (504 Gateway Timeout)');
      },
    };

    const healthyConnector: IJobSourceConnector = {
      name: 'Simulated Healthy Source',
      sourceType: 'remoteok',
      sourceId: 'healthy_source',
      async fetchVacancies() {
        return [
          {
            sourceId: 'healthy_1',
            sourceType: 'remoteok',
            sourceUrl: 'https://example.com/job/healthy-1',
            companyName: 'Acme Cloud',
            title: 'Senior SRE / DevOps Engineer',
            locationText: 'Remote (Worldwide)',
            rawDescription: 'Kubernetes and Terraform infrastructure.',
            publishedAt: new Date().toISOString(),
            isRemote: true,
          },
        ];
      },
    };

    const manager = new DiscoveryManager(db, [failingConnector, healthyConnector]);
    const report = await manager.runDiscoveryScan({ tags: ['devops'], limit: 10 });

    // The scan must NOT throw; failing source must be isolated and recorded
    expect(report.sourcesQueried).toContain('failing_source');
    expect(report.sourcesQueried).toContain('healthy_source');
    expect(report.sourcesSucceeded).toContain('healthy_source');
    expect(report.sourcesFailed.length).toBe(1);
    expect(report.sourcesFailed[0].sourceId).toBe('failing_source');
    expect(report.sourcesFailed[0].error).toContain('504 Gateway Timeout');

    // The healthy job must be ingested cleanly
    expect(report.totalDiscovered).toBe(1);
    expect(report.newVacancies).toBe(1);
  });

  it('normalizes, deduplicates, verifies, and timestamps all records', () => {
    const db = new DatabaseManager(':memory:');
    const manager = new DiscoveryManager(db);

    const payload = {
      sourceId: 'greenhouse_12345',
      sourceType: 'greenhouse' as const,
      sourceUrl: 'https://boards.greenhouse.io/canonical/jobs/12345?utm_source=feed',
      companyName: 'Canonical',
      title: 'DevOps Engineer - Global Infrastructure',
      locationText: 'Remote, India',
      rawDescription: 'Linux kernel, Ubuntu, OpenStack, Kubernetes. Requires visa eligibility for IN.',
      publishedAt: '2026-10-20T10:00:00.000Z',
      salaryMin: 90000,
      salaryMax: 130000,
      currency: 'USD',
      employmentType: 'full-time' as const,
      isRemote: true,
    };

    // 1. First insertion
    const { vacancy, inserted } = manager.processRawPayload(payload);
    expect(inserted).toBe(true);
    expect(vacancy.companyName).toBe('Canonical');
    expect(vacancy.canonicalHash).toBeDefined();
    expect(vacancy.country).toBe('India'); // Detected country
    expect(vacancy.isRemote).toBe(true);
    expect(vacancy.salaryMin).toBe(90000);
    expect(vacancy.salaryMax).toBe(130000);
    expect(vacancy.currency).toBe('USD');
    expect(vacancy.status).toBe('VERIFIED');
    expect(vacancy.discoveredAt).toBeDefined();
    expect(vacancy.lastVerifiedAt).toBeDefined();

    // 2. Duplicate insertion with slight URL formatting variation
    const duplicatePayload = {
      ...payload,
      sourceUrl: 'https://boards.greenhouse.io/canonical/jobs/12345#overview',
    };
    const { inserted: dupInserted } = manager.processRawPayload(duplicatePayload);
    expect(dupInserted).toBe(false); // Correctly deduplicated
  });

  it('ensures default database starts completely empty of fake vacancies and resumes', () => {
    const db = new DatabaseManager(':memory:');
    const vacancies = db.listVacancies();
    expect(vacancies.length).toBe(0);

    const metrics = db.getDashboardMetrics();
    expect(metrics.totalDiscovered).toBe(0);
    expect(metrics.totalSubmitted).toBe(0);
    expect(metrics.draftsAwaitingApproval).toBe(0);
  });
});
