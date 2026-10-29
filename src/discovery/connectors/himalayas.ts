import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class HimalayasConnector extends BaseSourceConnector {
  readonly sourceId = 'himalayas';
  readonly name = 'Himalayas Remote';
  readonly sourceType = 'himalayas';
  readonly category: JobSourceCategory = 'REMOTE_EMPLOYMENT';
  readonly officialUrl = 'https://himalayas.app';

  override readonly countriesAndRegions = {
    countries: ['GLOBAL'],
    regions: ['Worldwide'],
  };
  override readonly authRequirements = {
    type: 'NONE' as const,
    description: 'Public authorized JSON feed',
  };
  override readonly usageRestrictions = 'Public Himalayas remote feed. Respect rate limits and caching policies.';
  override get attribution() {
    return {
      required: true,
      text: 'Jobs sourced from Himalayas',
      url: 'https://himalayas.app',
    };
  }

  validateConfig(): { valid: boolean; missingVars: string[] } {
    return { valid: true, missingVars: [] };
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    try {
      const resp = await this.safeFetch('https://himalayas.app/jobs/api?limit=1', undefined, 5000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        message: resp.ok ? 'Himalayas API reachable' : `HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        message: `Health check failed: ${err.message}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 25;
    const url = 'https://himalayas.app/jobs/api?limit=60';
    const targetKeywords = ['devops', 'sre', 'cloud', 'infrastructure', 'platform', 'kubernetes', 'reliability', 'automation', 'security', 'systems'];

    try {
      const resp = await this.safeFetch(url, undefined, 8000);
      this.lastSuccessfulSync = new Date().toISOString();

      if (!resp.ok) {
        logger.warn(`Himalayas API returned HTTP ${resp.status}`);
        return [];
      }

      const data = await resp.json() as any;
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];
      const collected: RawJobPayload[] = [];

      for (const job of jobs) {
        const titleLower = (job.title || '').toLowerCase();
        const descLower = (job.excerpt || job.description || '').toLowerCase();
        const matchesKeyword = targetKeywords.some(kw => titleLower.includes(kw) || descLower.includes(kw));

        if (!matchesKeyword) continue;

        const locRestrictions = Array.isArray(job.locationRestrictions) ? job.locationRestrictions.join(', ') : '';
        const locationText = locRestrictions ? `Remote (${locRestrictions})` : 'Remote (Worldwide)';

        collected.push({
          sourceId: `himalayas_${job.guid || job.pubDate || Math.random()}`,
          sourceType: 'himalayas',
          sourceUrl: job.applicationLink || job.guid || 'https://himalayas.app',
          companyName: job.companyName || 'Technology Employer',
          title: job.title || 'DevOps Engineer',
          locationText,
          rawDescription: job.description || job.excerpt || '',
          publishedAt: job.pubDate ? new Date(job.pubDate * 1000).toISOString() : new Date().toISOString(),
          salaryMin: job.minSalary ?? undefined,
          salaryMax: job.maxSalary ?? undefined,
          currency: job.currency ?? 'USD',
          employmentType: job.employmentType ? (job.employmentType.toLowerCase().includes('contract') ? 'contract' : 'full-time') : 'full-time',
          isRemote: true,
        });

        if (collected.length >= limit) break;
      }

      logger.info(`Himalayas connector fetched ${collected.length} qualified vacancies.`);
      return collected;
    } catch (err: any) {
      logger.warn(`Himalayas connector error: ${err.message}`);
      return [];
    }
  }
}
