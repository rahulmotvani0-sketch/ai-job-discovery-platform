import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApplicationServer } from '../src/server.js';
import { validateSafeUrl } from '../src/discovery/connectors/base.js';
import { RemotiveConnector } from '../src/discovery/connectors/remotive.js';
import { SmartRecruitersConnector } from '../src/discovery/connectors/smartrecruiters.js';
import { AdzunaConnector } from '../src/discovery/connectors/adzuna.js';
import { USAJobsConnector } from '../src/discovery/connectors/usajobs.js';
import { DirectCareersConnector } from '../src/discovery/connectors/direct-careers.js';

describe('Global Discovery & SSRF Security Defense', () => {
  it('validates safe public URLs and blocks SSRF vectors', () => {
    // Valid public URLs
    expect(() => validateSafeUrl('https://remotive.com/api/remote-jobs')).not.toThrow();
    expect(() => validateSafeUrl('https://boards-api.greenhouse.io/v1/boards/canonical/jobs')).not.toThrow();
    expect(() => validateSafeUrl('https://data.usajobs.gov/api/search')).not.toThrow();

    // Loopback / localhost
    expect(() => validateSafeUrl('http://localhost:3300/secret')).toThrow(/SSRF Protection/);
    expect(() => validateSafeUrl('http://127.0.0.1:8080')).toThrow(/SSRF Protection/);
    expect(() => validateSafeUrl('http://0.0.0.0:80')).toThrow(/SSRF Protection/);
    expect(() => validateSafeUrl('http://service.localhost')).toThrow(/SSRF Protection/);
    expect(() => validateSafeUrl('http://internal.service.local')).toThrow(/SSRF Protection/);

    // Cloud metadata services
    expect(() => validateSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow(/SSRF Protection/);
    expect(() => validateSafeUrl('http://metadata.google.internal/computeMetadata/v1/')).toThrow(/SSRF Protection/);

    // RFC1918 Private IPv4 networks
    expect(() => validateSafeUrl('http://10.0.1.5/admin')).toThrow(/10.0.0.0\/8/);
    expect(() => validateSafeUrl('http://172.16.5.10:9000')).toThrow(/172.16.0.0\/12/);
    expect(() => validateSafeUrl('http://172.31.255.1')).toThrow(/172.16.0.0\/12/);
    expect(() => validateSafeUrl('http://192.168.1.100/router')).toThrow(/192.168.0.0\/16/);
    expect(() => validateSafeUrl('http://169.254.1.1')).toThrow(/169.254.0.0\/16/);

    // Unsupported protocols
    expect(() => validateSafeUrl('ftp://example.com/file')).toThrow(/Prohibited protocol/);
    expect(() => validateSafeUrl('file:///etc/passwd')).toThrow(/Prohibited protocol/);
  });
});

describe('High-Value Connector Adapters', () => {
  it('RemotiveConnector validates config and has correct category and officialUrl', () => {
    const connector = new RemotiveConnector();
    expect(connector.sourceId).toBe('remotive');
    expect(connector.category).toBe('REMOTE_EMPLOYMENT');
    expect(connector.officialUrl).toBe('https://remotive.com');
    const config = connector.validateConfig();
    expect(config.valid).toBe(true);
    expect(config.missingVars).toEqual([]);
  });

  it('SmartRecruitersConnector validates config and has correct category', () => {
    const connector = new SmartRecruitersConnector();
    expect(connector.sourceId).toBe('smartrecruiters');
    expect(connector.category).toBe('ATS_PLATFORMS');
    const config = connector.validateConfig();
    expect(config.valid).toBe(true);
  });

  it('AdzunaConnector detects missing credentials when environment is unconfigured', () => {
    const connector = new AdzunaConnector();
    expect(connector.sourceId).toBe('adzuna');
    expect(connector.category).toBe('INTERNATIONAL_BOARDS');
    // In clean test environment without keys
    const config = connector.validateConfig();
    if (!process.env.ADZUNA_APP_ID) {
      expect(config.valid).toBe(false);
      expect(config.missingVars).toContain('ADZUNA_APP_ID');
      expect(config.missingVars).toContain('ADZUNA_APP_KEY');
    }
  });

  it('USAJobsConnector detects missing credentials when environment is unconfigured', () => {
    const connector = new USAJobsConnector();
    expect(connector.sourceId).toBe('usajobs');
    expect(connector.category).toBe('GOVERNMENT_PUBLIC');
    const config = connector.validateConfig();
    if (!process.env.USAJOBS_API_KEY) {
      expect(config.valid).toBe(false);
      expect(config.missingVars).toContain('USAJOBS_API_KEY');
      expect(config.missingVars).toContain('USAJOBS_USER_AGENT');
    }
  });

  it('DirectCareersConnector targets top tech employers', () => {
    const connector = new DirectCareersConnector();
    expect(connector.sourceId).toBe('direct_careers');
    expect(connector.category).toBe('COMPANY_CAREERS');
    const config = connector.validateConfig();
    expect(config.valid).toBe(true);
  });
});

describe('Global Discovery Server Endpoints', () => {
  let server: ApplicationServer;
  const testPort = 3381;

  beforeAll(async () => {
    server = new ApplicationServer({ port: testPort, host: '127.0.0.1', dbPath: ':memory:' });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('GET /api/discovery/sources returns full 136 seeded catalog with filtering', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/discovery/sources`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.total).toBe(136);
    expect(data.sources.length).toBe(136);

    // Filter by category
    const catRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/sources?category=REMOTE_EMPLOYMENT`);
    const catData = await catRes.json() as any;
    expect(catData.total).toBe(19);

    // Filter by country
    const inRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/sources?country=IN`);
    const inData = await inRes.json() as any;
    expect(inData.total).toBeGreaterThan(15);
  });

  it('GET /api/discovery/sources/:id returns source details and 404 for unknown', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/discovery/sources/remotive`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe('remotive');
    expect(data.category).toBe('REMOTE_EMPLOYMENT');

    const notFound = await fetch(`http://127.0.0.1:${testPort}/api/discovery/sources/unknown_fake_board`);
    expect(notFound.status).toBe(404);
  });

  it('POST /api/discovery/sources/:id/toggle toggles enabled state', async () => {
    const toggleOff = await fetch(`http://127.0.0.1:${testPort}/api/discovery/sources/remotive/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: false }),
    });
    expect(toggleOff.status).toBe(200);
    const offData = await toggleOff.json() as any;
    expect(offData.isEnabled).toBe(false);

    const getRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/sources/remotive`);
    const getData = await getRes.json() as any;
    expect(getData.isEnabled).toBe(false);

    // Toggle back on
    const toggleOn = await fetch(`http://127.0.0.1:${testPort}/api/discovery/sources/remotive/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: true }),
    });
    expect(toggleOn.status).toBe(200);
  });

  it('GET /api/discovery/coverage returns comprehensive breakdown', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/discovery/coverage`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.summary).toBeDefined();
    expect(data.summary.totalSources).toBe(136);
    expect(data.summary.byCategory.INDIAN_PORTALS).toBe(16);
    expect(data.summary.byCategory.INTERNATIONAL_BOARDS).toBe(20);
    expect(data.summary.countriesCovered.length).toBeGreaterThan(10);
    expect(data.summary.regionsCovered.length).toBeGreaterThan(5);
  });

  it('manages proposals via POST & GET /api/discovery/proposals', async () => {
    const postRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'TechInAsia Careers',
        officialDomain: 'techinasia.com',
        category: 'SPECIALIST_TECH',
        countriesCovered: ['SG', 'ID', 'MY', 'IN'],
        evidenceDescription: 'Direct technology job discovery for Southeast Asian ecosystem.',
        estimatedIntegrationEffort: 'MEDIUM',
        recommendedAdapterType: 'OFFICIAL_PUBLIC_API',
      }),
    });
    expect(postRes.status).toBe(201);
    const created = await postRes.json() as any;
    expect(created.proposal.id).toBeDefined();

    const listRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/proposals`);
    const list = await listRes.json() as any;
    expect(list.proposals.length).toBe(1);

    // Review proposal
    const reviewRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/proposals/${created.proposal.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validationStatus: 'VALIDATED', reviewNotes: 'Approved for Q4 connector roadmap.' }),
    });
    expect(reviewRes.status).toBe(200);
  });
});
