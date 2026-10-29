import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class JobicyConnector extends BaseSourceConnector {
  readonly sourceId = 'jobicy';
  readonly name = 'Jobicy';
  readonly sourceType = 'jobicy';
  readonly category: JobSourceCategory = 'REMOTE_EMPLOYMENT';
  readonly officialUrl = 'https://jobicy.com';

  override readonly countriesAndRegions = {
    countries: ['GLOBAL'],
    regions: ['Worldwide'],
  };
  override readonly authRequirements = {
    type: 'NONE' as const,
    description: 'Public authorized REST endpoint',
  };
  override readonly usageRestrictions = 'Public Jobicy RSS/JSON feed. Respect rate limits and caching policies.';
  override get attribution() {
    return {
      required: true,
      text: 'Jobs provided by Jobicy',
      url: 'https://jobicy.com',
    };
  }

  validateConfig(): { valid: boolean; missingVars: string[] } {
    return { valid: true, missingVars: [] };
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    try {
      const resp = await this.safeFetch('https://jobicy.com/api/v2/remote-jobs?count=1', undefined, 5000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        message: resp.ok ? 'Jobicy API reachable' : `HTTP ${resp.status}`,
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
    const url = `https://jobicy.com/api/v2/remote-jobs?count=${limit}&tag=devops`;
    logger.info(`Fetching vacancies from Jobicy API (${url})...`);

    try {
      const resp = await this.safeFetch(url, undefined, 12000);
      this.lastSuccessfulSync = new Date().toISOString();

      if (!resp.ok) {
        throw new Error(`Jobicy responded with status ${resp.status}`);
      }

      const json = await resp.json() as any;
      const jobs = Array.isArray(json.jobs) ? json.jobs : [];
      logger.info(`Jobicy returned ${jobs.length} jobs.`);

      return jobs.slice(0, limit).map((item: any) => {
        const jobTypeStr = Array.isArray(item.jobType) ? item.jobType.join(' ') : String(item.jobType || '');
        const isContract = jobTypeStr.toLowerCase().includes('contract');

        return {
          sourceId: `jobicy_${item.id}`,
          sourceType: 'jobicy',
          sourceUrl: item.url,
          companyName: item.companyName || 'Unknown Company',
          title: item.jobTitle || 'DevOps Engineer',
          locationText: item.jobGeo || 'Remote (Global)',
          rawDescription: item.jobDescription || item.jobExcerpt || '',
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          salaryMin: item.annualSalaryMin ? Number(item.annualSalaryMin) : undefined,
          salaryMax: item.annualSalaryMax ? Number(item.annualSalaryMax) : undefined,
          currency: item.salaryCurrency || 'USD',
          employmentType: (isContract ? 'contract' : 'full-time') as any,
          isRemote: true,
        };
      });
    } catch (err) {
      logger.warn(`Jobicy fetch failed: ${err}`);
      return [];
    }
  }
}
