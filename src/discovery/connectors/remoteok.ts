import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class RemoteOkConnector extends BaseSourceConnector {
  readonly sourceId = 'remoteok';
  readonly name = 'RemoteOK';
  readonly sourceType = 'remoteok';
  readonly category: JobSourceCategory = 'REMOTE_EMPLOYMENT';
  readonly officialUrl = 'https://remoteok.com';

  override readonly countriesAndRegions = {
    countries: ['GLOBAL'],
    regions: ['Worldwide'],
  };
  override readonly authRequirements = {
    type: 'NONE' as const,
    description: 'Public legal JSON endpoint',
  };
  override readonly usageRestrictions = 'Public RemoteOK feed. Respect published rate limits and caching headers.';
  override get attribution() {
    return {
      required: true,
      text: 'Jobs provided by RemoteOK',
      url: 'https://remoteok.com',
    };
  }

  validateConfig(): { valid: boolean; missingVars: string[] } {
    return { valid: true, missingVars: [] };
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    try {
      const resp = await this.safeFetch('https://remoteok.com/api', undefined, 5000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        message: resp.ok ? 'RemoteOK API reachable' : `HTTP ${resp.status}`,
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
    const url = 'https://remoteok.com/api';
    logger.info(`Fetching vacancies from RemoteOK API (${url})...`);

    try {
      const resp = await this.safeFetch(url, undefined, 12000);
      this.lastSuccessfulSync = new Date().toISOString();

      const data = await resp.json() as any[];
      // First item in RemoteOK array is often legal / metadata
      const items = Array.isArray(data) ? data.filter(item => item && item.id && item.position) : [];

      const targetKeywords = ['devops', 'sre', 'cloud', 'infrastructure', 'platform', 'kubernetes', 'terraform'];
      
      const filtered = items.filter(item => {
        const title = (item.position || '').toLowerCase();
        const tags = Array.isArray(item.tags) ? item.tags.map((t: string) => t.toLowerCase()) : [];
        return targetKeywords.some(kw => title.includes(kw) || tags.includes(kw));
      });

      logger.info(`RemoteOK returned ${items.length} total jobs, ${filtered.length} matched target cloud/DevOps roles.`);

      return filtered.slice(0, limit).map(item => ({
        sourceId: `remoteok_${item.id}`,
        sourceType: 'remoteok',
        sourceUrl: item.url || `https://remoteok.com/remote-jobs/${item.id}`,
        companyName: item.company || 'Unknown Company',
        title: item.position,
        locationText: item.location || 'Remote (Worldwide)',
        rawDescription: item.description || '',
        publishedAt: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
        salaryMin: item.salary_min ? Number(item.salary_min) : undefined,
        salaryMax: item.salary_max ? Number(item.salary_max) : undefined,
        currency: 'USD',
        employmentType: 'full-time',
        isRemote: true,
      }));
    } catch (err) {
      logger.warn(`RemoteOK fetch failed: ${err}`);
      return [];
    }
  }
}
