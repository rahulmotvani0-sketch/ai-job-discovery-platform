import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class WorkableAtsConnector extends BaseSourceConnector {
  readonly sourceId = 'workable';
  readonly name = 'Workable ATS';
  readonly sourceType = 'workable';
  readonly category: JobSourceCategory = 'ATS_PLATFORMS';
  readonly officialUrl = 'https://apply.workable.com';

  protected rateLimitRpm = 40;
  protected timeoutMs = 8000;

  private targetCompanies: string[] = [
    'taxfix',
    'typeform',
    'omio',
    'invision',
    'clever',
    'supercell',
    'gousto',
    'transfergo',
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
      const resp = await this.safeFetch('https://apply.workable.com/api/v3/accounts/taxfix/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: '', location: [], department: [], worktype: [] }),
      }, 6000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'Workable public jobs endpoint operational' : `HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        latencyMs: Date.now() - start,
        message: `Workable health check failed: ${err.message}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 25;
    const collected: RawJobPayload[] = [];
    const targetKeywords = [
      'engineer', 'developer', 'software', 'fullstack', 'full-stack', 'frontend',
      'backend', 'devops', 'sre', 'cloud', 'infrastructure', 'platform',
      'kubernetes', 'security', 'data', 'ai', 'machine learning', 'mobile', 'qa', 'architect', 'systems'
    ];

    for (const company of this.targetCompanies) {
      if (collected.length >= limit) break;
      const url = `https://apply.workable.com/api/v3/accounts/${company}/jobs`;

      try {
        const resp = await this.safeFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ query: '', location: [], department: [], worktype: [] }),
        }, 6000);

        if (!resp.ok) continue;

        const data = await resp.json() as any;
        const results = Array.isArray(data.results) ? data.results : [];

        for (const job of results) {
          const title = (job.title || '').toLowerCase();
          const matchesKeyword = targetKeywords.some(kw => title.includes(kw));
          if (!matchesKeyword) continue;

          const locationParts = [job.city, job.state, job.country].filter(Boolean);
          const locationText = job.telecommuting ? 'Remote' : (locationParts.join(', ') || 'Remote');
          const isRemote = Boolean(job.telecommuting || locationText.toLowerCase().includes('remote'));

          collected.push({
            sourceId: `workable_${company}_${job.shortcode || job.id}`,
            sourceType: 'workable',
            requisitionId: String(job.shortcode || job.id),
            sourceUrl: `https://apply.workable.com/${company}/j/${job.shortcode}/`,
            companyName: company.charAt(0).toUpperCase() + company.slice(1),
            title: job.title,
            locationText,
            rawDescription: `${job.title} at ${company}. Location: ${locationText}. Department: ${job.department || 'Technology'}`,
            publishedAt: job.published ? new Date(job.published).toISOString() : new Date().toISOString(),
            employmentType: 'full-time',
            isRemote,
            department: job.department || undefined,
          });

          if (collected.length >= limit) break;
        }
      } catch (err: any) {
        logger.debug(`Workable query failed for ${company}: ${err.message || err}`);
      }
    }

    logger.info(`Workable ATS connector retrieved ${collected.length} vacancies.`);
    return collected;
  }
}
