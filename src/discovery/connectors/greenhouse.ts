import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class GreenhouseAtsConnector extends BaseSourceConnector {
  readonly sourceId = 'greenhouse';
  readonly name = 'Greenhouse ATS';
  readonly sourceType = 'greenhouse';
  readonly category: JobSourceCategory = 'ATS_PLATFORMS';
  readonly officialUrl = 'https://boards.greenhouse.io';

  protected rateLimitRpm = 60;
  protected timeoutMs = 8000;

  private targetCompanies: string[] = [
    'canonical',
    'elastic',
    'cloudflare',
    'docker',
    'gitlab',
    'hashicorp',
    'sourcegraph',
    'datadog',
    'mongodb',
    'stripe',
    'scaleai',
    'airbnb',
    'coinbase',
    'doordash',
    'pinterest',
    'reddit',
    'twilio',
    'figma',
  ];

  constructor(customCompanies?: string[]) {
    super();
    if (customCompanies && customCompanies.length > 0) {
      this.targetCompanies = [...customCompanies];
    }
  }

  addCompany(company: string): void {
    const clean = company.toLowerCase().trim();
    if (clean && !this.targetCompanies.includes(clean)) {
      this.targetCompanies.push(clean);
    }
  }

  getCompanies(): string[] {
    return [...this.targetCompanies];
  }

  validateConfig(): { valid: boolean; missingVars: string[] } {
    return { valid: true, missingVars: [] };
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    const start = Date.now();
    try {
      const resp = await this.safeFetch('https://boards-api.greenhouse.io/v1/boards/canonical/jobs', undefined, 6000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'Greenhouse public boards API operational' : `HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        latencyMs: Date.now() - start,
        message: `Greenhouse health check failed: ${err.message}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 30;
    const collected: RawJobPayload[] = [];
    const targetKeywords = [
      'engineer', 'developer', 'software', 'fullstack', 'full-stack', 'frontend',
      'backend', 'devops', 'sre', 'cloud', 'infrastructure', 'platform',
      'kubernetes', 'reliability', 'security', 'data', 'ai', 'machine learning',
      'mobile', 'qa', 'architect', 'systems'
    ];

    for (const company of this.targetCompanies) {
      if (collected.length >= limit) break;
      const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;

      try {
        const resp = await this.safeFetch(url, undefined, 6000);
        if (!resp.ok) continue;

        const data = await resp.json() as any;
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];

        for (const job of jobs) {
          const title = (job.title || '').toLowerCase();
          const matchesKeyword = targetKeywords.some(kw => title.includes(kw));
          if (!matchesKeyword) continue;

          const location = job.location?.name || 'Remote';
          const isRemote = location.toLowerCase().includes('remote') || /remote/i.test(job.content || '');

          collected.push({
            sourceId: `greenhouse_${company}_${job.id}`,
            sourceType: 'greenhouse',
            requisitionId: String(job.id),
            sourceUrl: job.absolute_url,
            companyName: company.charAt(0).toUpperCase() + company.slice(1),
            title: job.title,
            locationText: location,
            rawDescription: job.content || `${job.title} at ${company}. Location: ${location}.`,
            publishedAt: job.updated_at ? new Date(job.updated_at).toISOString() : new Date().toISOString(),
            employmentType: 'full-time',
            isRemote,
            department: job.departments?.[0]?.name || undefined,
          });

          if (collected.length >= limit) break;
        }
      } catch (err: any) {
        logger.debug(`Greenhouse board query failed for ${company}: ${err.message || err}`);
      }
    }

    logger.info(`Greenhouse ATS collector retrieved ${collected.length} direct company vacancies.`);
    return collected;
  }
}
