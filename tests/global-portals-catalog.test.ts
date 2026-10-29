import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  GLOBAL_PORTALS_REGISTRY,
  getGlobalPortalsByCategory,
  getGlobalPortalsByCountry,
  getGlobalPortalsSummary,
  findPortalByName,
} from '../src/discovery/registry/global-directory.js';
import type { GlobalPortalCategoryGroup } from '../src/discovery/registry/types.js';
import { ApplicationServer } from '../src/server.js';

describe('Global Portals Master Catalog (13 Source-Type Groups)', () => {
  const allGroups: GlobalPortalCategoryGroup[] = [
    'GLOBAL_GENERAL',
    'TECH_STARTUP',
    'REMOTE_WORK',
    'FREELANCE_CONTRACT',
    'INDIA',
    'US_CANADA',
    'UK_IRELAND',
    'EUROPE',
    'ASIA_PACIFIC',
    'MIDDLE_EAST_AFRICA',
    'LATIN_AMERICA',
    'PUBLIC_NONPROFIT',
    'DIRECT_ATS',
  ];

  it('populates all 13 distinct source-type groups with non-empty registry entries', () => {
    const summary = getGlobalPortalsSummary();
    expect(summary.total).toBeGreaterThan(70);

    for (const group of allGroups) {
      const portalsInGroup = getGlobalPortalsByCategory(group);
      expect(portalsInGroup.length).toBeGreaterThan(0);
      expect(summary.byGroup[group]).toBe(portalsInGroup.length);
    }
  });

  it('verifies every portal entry strictly defines all 11 required registry fields', () => {
    for (const portal of GLOBAL_PORTALS_REGISTRY) {
      // 1. Portal name
      expect(typeof portal.portalName).toBe('string');
      expect(portal.portalName.trim().length).toBeGreaterThan(0);

      // 2. Category
      expect(allGroups).toContain(portal.category);

      // 3. Countries
      expect(Array.isArray(portal.countries)).toBe(true);
      expect(portal.countries.length).toBeGreaterThan(0);

      // 4. Supported roles
      expect(Array.isArray(portal.supportedRoles)).toBe(true);
      expect(portal.supportedRoles.length).toBeGreaterThan(0);

      // 5. Official API or feed URL
      expect(typeof portal.officialApiOrFeedUrl).toBe('string');
      expect(portal.officialApiOrFeedUrl.startsWith('http')).toBe(true);

      // 6. Authentication requirement
      expect([
        'NONE',
        'API_KEY',
        'OAUTH2',
        'PARTNER_KEY',
        'SESSION_COOKIE',
        'NOT_APPLICABLE',
      ]).toContain(portal.authenticationRequirement);

      // 7. Rate limits
      expect(portal.rateLimits).toBeDefined();
      if (portal.rateLimits.requestsPerMinute !== undefined) {
        expect(portal.rateLimits.requestsPerMinute).toBeGreaterThan(0);
      }

      // 8. Terms/restrictions
      expect(typeof portal.termsRestrictions).toBe('string');
      expect(portal.termsRestrictions.length).toBeGreaterThan(10);

      // 9. Connector status
      expect([
        'IMPLEMENTED_AND_TESTED',
        'IMPLEMENTED_BUT_NOT_LIVE_VERIFIED',
        'REQUIRES_API_CREDENTIALS',
        'REQUIRES_PARTNER_ACCESS',
        'MANUAL_OR_LINK_ONLY',
        'RESTRICTED_BY_TERMS',
      ]).toContain(portal.connectorStatus);

      // 10. Last successful sync
      expect(portal.lastSuccessfulSync === null || typeof portal.lastSuccessfulSync === 'string').toBe(true);

      // 11. Attribution requirement
      expect(typeof portal.attributionRequirement.required).toBe('boolean');
      expect(typeof portal.attributionRequirement.text).toBe('string');
      expect(portal.attributionRequirement.text.length).toBeGreaterThan(0);
    }
  });

  it('filters portals by country and searches by name', () => {
    const indiaPortals = getGlobalPortalsByCountry('IN');
    expect(indiaPortals.length).toBeGreaterThan(10);
    expect(indiaPortals.some(p => p.portalName === 'Naukri.com')).toBe(true);

    const usPortals = getGlobalPortalsByCountry('US');
    expect(usPortals.length).toBeGreaterThan(10);
    expect(usPortals.some(p => p.portalName === 'USAJobs')).toBe(true);

    const greenhouse = findPortalByName('greenhouse');
    expect(greenhouse).toBeDefined();
    expect(greenhouse?.category).toBe('DIRECT_ATS');
    expect(greenhouse?.connectorStatus).toBe('IMPLEMENTED_AND_TESTED');
  });
});

describe('Global Portals Directory Server Endpoint', () => {
  let server: ApplicationServer;
  const testPort = 3392;

  beforeAll(async () => {
    server = new ApplicationServer({ port: testPort, host: '127.0.0.1', dbPath: ':memory:' });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('GET /api/discovery/directory returns all portals with aggregated summary', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/discovery/directory`);
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.total).toBeGreaterThan(70);
    expect(data.summary).toBeDefined();
    expect(data.summary.byGroup.DIRECT_ATS).toBeGreaterThan(10);
    expect(data.summary.byGroup.REMOTE_WORK).toBeGreaterThan(5);
    expect(data.portals.length).toBe(data.total);
  });

  it('GET /api/discovery/directory filters by group, country, and status', async () => {
    // Filter by group
    const atsRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/directory?group=DIRECT_ATS`);
    const atsData = await atsRes.json() as any;
    expect(atsData.total).toBeGreaterThan(10);
    expect(atsData.portals.every((p: any) => p.category === 'DIRECT_ATS')).toBe(true);

    // Filter by country
    const inRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/directory?country=IN`);
    const inData = await inRes.json() as any;
    expect(inData.total).toBeGreaterThan(10);

    // Filter by status
    const testedRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/directory?status=IMPLEMENTED_AND_TESTED`);
    const testedData = await testedRes.json() as any;
    expect(testedData.total).toBeGreaterThan(10);
    expect(testedData.portals.every((p: any) => p.connectorStatus === 'IMPLEMENTED_AND_TESTED')).toBe(true);
  });
});
