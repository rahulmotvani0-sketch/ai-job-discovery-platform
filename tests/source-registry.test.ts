import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import type { SourceProposal } from '../src/discovery/registry/types.js';

describe('Source Registry Database Subsystem', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('automatically seeds all 136 initial sources on initialization', () => {
    const sources = db.listSources();
    expect(sources.length).toBe(136);

    const summary = db.getSourceRegistrySummary();
    expect(summary.totalSources).toBe(136);
    expect(summary.byCategory.INDIAN_PORTALS).toBe(16);
    expect(summary.byCategory.INTERNATIONAL_BOARDS).toBe(20);
    expect(summary.byCategory.REMOTE_EMPLOYMENT).toBe(19);
    expect(summary.byCategory.STARTUP_GROWTH).toBe(9);
    expect(summary.byCategory.SPECIALIST_TECH).toBe(14);
    expect(summary.byCategory.FREELANCE_CONTRACT).toBe(10);
    expect(summary.byCategory.GOVERNMENT_PUBLIC).toBe(10);
    expect(summary.byCategory.ATS_PLATFORMS).toBe(14);
    expect(summary.byCategory.COMPANY_CAREERS).toBe(20);
    expect(summary.byCategory.ADDITIONAL_CHANNELS).toBe(4);
  });

  it('filters sources by category, status, country, and search term', () => {
    const indianPortals = db.listSources({ category: 'INDIAN_PORTALS' });
    expect(indianPortals.length).toBe(16);
    expect(indianPortals.every(s => s.category === 'INDIAN_PORTALS')).toBe(true);

    const inSources = db.listSources({ country: 'IN' });
    expect(inSources.length).toBeGreaterThan(15);

    const greenhouse = db.listSources({ search: 'greenhouse' });
    expect(greenhouse.some(s => s.id === 'greenhouse')).toBe(true);

    const directCareers = db.listSources({ category: 'COMPANY_CAREERS' });
    expect(directCareers.length).toBe(20);
  });

  it('allows updating status, health, and recording sync stats', () => {
    const sourceId = 'remoteok';
    const before = db.getSource(sourceId);
    expect(before).not.toBeNull();

    // Record successful sync
    db.recordSourceSync(sourceId, 25, 20, 5, true);
    const afterSuccess = db.getSource(sourceId);
    expect(afterSuccess?.healthStatus).toBe('HEALTHY');
    expect(afterSuccess?.stats.jobsRetrieved).toBe(25);
    expect(afterSuccess?.stats.validJobsRetrieved).toBe(20);
    expect(afterSuccess?.stats.duplicatesRemoved).toBe(5);
    expect(afterSuccess?.stats.lastSuccessAt).toBeDefined();

    // Record 3 consecutive failures
    db.recordSourceSync(sourceId, 0, 0, 0, false, 'Rate limit exceeded 429');
    db.recordSourceSync(sourceId, 0, 0, 0, false, 'Rate limit exceeded 429');
    db.recordSourceSync(sourceId, 0, 0, 0, false, 'Gateway timeout 504');
    const afterFailures = db.getSource(sourceId);
    expect(afterFailures?.healthStatus).toBe('UNHEALTHY');
    expect(afterFailures?.stats.consecutiveFailures).toBe(3);
    expect(afterFailures?.stats.lastError).toBe('Gateway timeout 504');
  });

  it('supports toggling sources enabled / disabled', () => {
    const sourceId = 'lever';
    db.toggleSourceEnabled(sourceId, false);
    let s = db.getSource(sourceId);
    expect(s?.isEnabled).toBe(false);

    db.toggleSourceEnabled(sourceId, true);
    s = db.getSource(sourceId);
    expect(s?.isEnabled).toBe(true);
  });

  it('manages source discovery proposals end-to-end', () => {
    const proposal: SourceProposal = {
      id: 'prop-1',
      name: 'EU Tech Jobs',
      officialDomain: 'eutechjobs.eu',
      category: 'SPECIALIST_TECH',
      countriesCovered: ['DE', 'FR', 'NL'],
      evidenceDescription: 'Direct technology job board for European startups with public RSS feed.',
      apiOrFeedDocsUrl: 'https://eutechjobs.eu/feed.xml',
      authRequirements: 'NONE',
      estimatedIntegrationEffort: 'LOW',
      recommendedAdapterType: 'PUBLIC_RSS_ATOM',
      validationStatus: 'PENDING_REVIEW',
      proposedAt: new Date().toISOString(),
    };

    db.saveSourceProposal(proposal);
    const list = db.listSourceProposals();
    expect(list.length).toBe(1);
    expect(list[0].officialDomain).toBe('eutechjobs.eu');
    expect(list[0].validationStatus).toBe('PENDING_REVIEW');

    db.updateSourceProposal('prop-1', 'VALIDATED', 'Verified live RSS feed, clean schema.');
    const updated = db.listSourceProposals('VALIDATED');
    expect(updated.length).toBe(1);
    expect(updated[0].reviewNotes).toBe('Verified live RSS feed, clean schema.');
  });
});
