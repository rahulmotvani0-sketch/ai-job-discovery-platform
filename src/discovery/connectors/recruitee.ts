import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class RecruiteeAtsConnector extends BaseSourceConnector {
  readonly sourceId = 'recruitee';
  readonly name = 'Recruitee ATS';
  readonly sourceType = 'recruitee';
  readonly category: JobSourceCategory = 'ATS_PLATFORMS';
  readonly officialUrl = 'https://recruitee.com';

  protected rateLimitRpm = 40;
  protected timeoutMs = 8000;

  private targetCompanies: string[] = [
    'transloadit',
    'hotjar',
    'framer',
    'bunq',
    'usabilla',
    'blendle',
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
      const resp = await this.safeFetch('https://transloadit.recruitee.com/api/offers/', undefined, 6000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'Recruitee public offers API operational' : `HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        latencyMs: Date.now() - start,
        message: `Recruitee health check failed: ${err.message}`,
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
      const url = `https://${company}.recruitee.com/api/offers/`;

      try {
        const resp = await this.safeFetch(url, undefined, 6000);
        if (!resp.ok) continue;

        const data = await resp.json() as any;
        const offers = Array.isArray(data.offers) ? data.offers : [];

        for (const offer of offers) {
          const title = (offer.title || '').toLowerCase();
          const matchesKeyword = targetKeywords.some(kw => title.includes(kw));
          if (!matchesKeyword) continue;

          const locationText = offer.location || [offer.city, offer.state, offer.country].filter(Boolean).join(', ') || 'Remote';
          const isRemote = Boolean(offer.remote || locationText.toLowerCase().includes('remote'));

          collected.push({
            sourceId: `recruitee_${company}_${offer.id}`,
            sourceType: 'recruitee',
            requisitionId: String(offer.id),
            sourceUrl: offer.careers_url || offer.url || `https://${company}.recruitee.com/o/${offer.slug || offer.id}`,
            companyName: company.charAt(0).toUpperCase() + company.slice(1),
            title: offer.title,
            locationText,
            rawDescription: offer.description || `${offer.title} at ${company}. Location: ${locationText}. Department: ${offer.department || 'Engineering'}`,
            publishedAt: offer.published_at ? new Date(offer.published_at).toISOString() : new Date().toISOString(),
            employmentType: (offer.employment_type_code || 'full_time').includes('contract') ? 'contract' : 'full-time',
            isRemote,
            department: offer.department || undefined,
          });

          if (collected.length >= limit) break;
        }
      } catch (err: any) {
        logger.debug(`Recruitee query failed for ${company}: ${err.message || err}`);
      }
    }

    logger.info(`Recruitee ATS connector retrieved ${collected.length} vacancies.`);
    return collected;
  }
}
