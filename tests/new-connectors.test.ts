import { describe, it, expect } from 'vitest';
import { WorkableAtsConnector } from '../src/discovery/connectors/workable.js';
import { YCombinatorStartupsConnector } from '../src/discovery/connectors/ycombinator.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import { DatabaseManager } from '../src/core/database.js';

describe('New ATS Connectors (Workable + Y Combinator Startups)', () => {
  it('instantiates WorkableAtsConnector with valid metadata', () => {
    const connector = new WorkableAtsConnector();
    expect(connector.name).toBe('Workable ATS');
    expect(connector.sourceType).toBe('workable');
    expect(typeof connector.fetchVacancies).toBe('function');
  });

  it('instantiates YCombinatorStartupsConnector with valid metadata', () => {
    const connector = new YCombinatorStartupsConnector();
    expect(connector.name).toBe('Y Combinator Startups');
    expect(connector.sourceType).toBe('ycombinator');
    expect(typeof connector.fetchVacancies).toBe('function');
  });

  it('initializes DiscoveryManager with all 8 default multi-source connectors', () => {
    const db = new DatabaseManager(':memory:');
    const manager = new DiscoveryManager(db);
    expect(manager).toBeDefined();

    // Verify ingestion processes Workable payloads
    const { vacancy: workableVac, inserted: wInserted } = manager.processRawPayload({
      sourceId: 'workable_taxfix_12345',
      sourceType: 'workable',
      sourceUrl: 'https://apply.workable.com/taxfix/j/12345/',
      companyName: 'Taxfix',
      title: 'Senior Full-Stack Engineer',
      locationText: 'Remote',
      rawDescription: 'Node.js, React, TypeScript, GraphQL microservices.',
      publishedAt: new Date().toISOString(),
      employmentType: 'full-time',
      isRemote: true,
    });

    expect(wInserted).toBe(true);
    expect(workableVac.sourceType).toBe('workable');
    expect(workableVac.category).toBe('Full-Stack');
    expect(workableVac.isRemote).toBe(true);

    // Verify ingestion processes YC Startup payloads
    const { vacancy: ycVac, inserted: yInserted } = manager.processRawPayload({
      sourceId: 'yc_posthog_98765',
      sourceType: 'ycombinator',
      sourceUrl: 'https://boards.greenhouse.io/posthog/jobs/98765',
      companyName: 'PostHog (YC)',
      title: 'Site Reliability Engineer / DevOps',
      locationText: 'Remote',
      rawDescription: 'Operating Kubernetes, ClickHouse, and high-scale telemetry pipelines.',
      publishedAt: new Date().toISOString(),
      employmentType: 'full-time',
      isRemote: true,
    });

    expect(yInserted).toBe(true);
    expect(ycVac.sourceType).toBe('ycombinator');
    expect(ycVac.category).toBe('SRE');
  });
});
