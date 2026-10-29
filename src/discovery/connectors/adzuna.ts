import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class AdzunaConnector extends BaseSourceConnector {
  readonly sourceId = 'adzuna';
  readonly name = 'Adzuna Jobs API';
  readonly sourceType = 'adzuna';
  readonly category: JobSourceCategory = 'INTERNATIONAL_BOARDS';
  readonly officialUrl = 'https://developer.adzuna.com';

  override readonly countriesAndRegions = {
    countries: ['GB', 'US', 'IN', 'CA', 'AU', 'DE', 'FR', 'NL', 'PL', 'BR'],
    regions: ['Global', 'North America', 'Europe', 'Asia-Pacific'],
  };
  override readonly authRequirements = {
    type: 'API_KEY' as const,
    description: 'Requires ADZUNA_APP_ID and ADZUNA_APP_KEY',
    requiredEnvVars: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
  };
  override readonly usageRestrictions = 'Adzuna Developer API terms. Rate limited; requires backlink attribution to Adzuna.';
  override get attribution() {
    return {
      required: true,
      text: 'Jobs powered by Adzuna',
      url: 'https://www.adzuna.com',
    };
  }
  override readonly pagination = {
    type: 'PAGE_NUMBER' as const,
    maxPageSize: 50,
  };

  protected rateLimitRpm = 60;
  protected timeoutMs = 8000;

  private appId: string;
  private appKey: string;

  constructor() {
    super();
    this.appId = process.env.ADZUNA_APP_ID || '';
    this.appKey = process.env.ADZUNA_APP_KEY || '';
  }

  validateConfig(): { valid: boolean; missingVars: string[] } {
    const missing: string[] = [];
    if (!this.appId) missing.push('ADZUNA_APP_ID');
    if (!this.appKey) missing.push('ADZUNA_APP_KEY');
    return {
      valid: missing.length === 0,
      missingVars: missing,
    };
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    const config = this.validateConfig();
    if (!config.valid) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        message: `Requires API credentials: ${config.missingVars.join(', ')}`,
        checkedAt: new Date().toISOString(),
      };
    }

    const start = Date.now();
    try {
      const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${encodeURIComponent(this.appId)}&app_key=${encodeURIComponent(this.appKey)}&results_per_page=1&what=devops`;
      const resp = await this.safeFetch(url, undefined, 5000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'Adzuna API operational' : `HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        latencyMs: Date.now() - start,
        message: `Health check failed: ${err.message}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]> {
    const config = this.validateConfig();
    if (!config.valid) {
      logger.info(`Adzuna connector skipped: missing credentials (${config.missingVars.join(', ')})`);
      return [];
    }

    const limit = options?.limit ?? 20;
    const countryCode = (options?.country || 'us').toLowerCase();
    const query = options?.tags?.[0] || 'software engineer';

    try {
      const url = `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/1?app_id=${encodeURIComponent(this.appId)}&app_key=${encodeURIComponent(this.appKey)}&results_per_page=${limit}&what=${encodeURIComponent(query)}`;
      const resp = await this.safeFetch(url);
      if (!resp.ok) {
        logger.warn(`Adzuna API returned status ${resp.status}`);
        return [];
      }

      const data = await resp.json() as any;
      const results = Array.isArray(data.results) ? data.results : [];

      return results.map((item: any) => ({
        sourceId: `adzuna_${item.id}`,
        sourceType: 'adzuna',
        sourceUrl: item.redirect_url,
        companyName: item.company?.display_name || 'Employer',
        title: item.title,
        locationText: item.location?.display_name || 'Various Locations',
        isRemote: /remote/i.test(item.title) || /remote/i.test(item.description || ''),
        employmentType: item.contract_time === 'part_time' ? 'part-time' : 'full-time',
        salaryMin: item.salary_min ? Math.round(item.salary_min) : undefined,
        salaryMax: item.salary_max ? Math.round(item.salary_max) : undefined,
        currency: countryCode === 'in' ? 'INR' : countryCode === 'gb' ? 'GBP' : 'USD',
        rawDescription: item.description || item.title,
        publishedAt: item.created || new Date().toISOString(),
      }));
    } catch (err: any) {
      logger.error(`Adzuna fetch failed: ${err.message}`);
      return [];
    }
  }
}
