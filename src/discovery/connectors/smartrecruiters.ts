import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class SmartRecruitersConnector extends BaseSourceConnector {
  readonly sourceId = 'smartrecruiters';
  readonly name = 'SmartRecruiters ATS';
  readonly sourceType = 'smartrecruiters';
  readonly category: JobSourceCategory = 'ATS_PLATFORMS';
  readonly officialUrl = 'https://www.smartrecruiters.com';

  protected rateLimitRpm = 60;
  protected timeoutMs = 8000;

  private targetCompanies: string[] = [
    'Visa',
    'BoschGroup',
    'Ubisoft',
    'Skechers',
    'IKEA',
    'Square',
    'Eurofins',
    'AveryDennison',
    'PublicisGroupe',
    'Colliers',
    'Wolt',
  ];

  constructor(customCompanies?: string[]) {
    super();
    if (customCompanies && customCompanies.length > 0) {
      this.targetCompanies = [...customCompanies];
    }
  }

  addCompany(company: string): void {
    const trimmed = company.trim();
    if (trimmed && !this.targetCompanies.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      this.targetCompanies.push(trimmed);
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
      const resp = await this.safeFetch('https://api.smartrecruiters.com/v1/companies/Visa/postings?limit=1', undefined, 5000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'SmartRecruiters public posting API operational' : `HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        latencyMs: Date.now() - start,
        message: `SmartRecruiters health check failed: ${err.message}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 25;
    const collected: RawJobPayload[] = [];
    const targetKeywords = [
      'engineer', 'developer', 'software', 'devops', 'sre', 'cloud', 'infrastructure',
      'platform', 'kubernetes', 'reliability', 'security', 'data', 'architect', 'systems',
      'fullstack', 'full-stack', 'frontend', 'backend', 'mobile', 'ai', 'machine learning'
    ];

    for (const company of this.targetCompanies) {
      if (collected.length >= limit) break;
      const url = `https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=15`;

      try {
        const resp = await this.safeFetch(url, undefined, 6000);
        if (!resp.ok) continue;

        const data = await resp.json() as any;
        const postings = Array.isArray(data.content) ? data.content : [];

        for (const post of postings) {
          if (collected.length >= limit) break;
          const title = post.name || '';
          const titleLower = title.toLowerCase();
          const matchesKeyword = targetKeywords.some(kw => titleLower.includes(kw));
          if (!matchesKeyword) continue;

          const locationCity = post.location?.city || '';
          const locationCountry = post.location?.country || '';
          const locationRegion = post.location?.region || '';
          const locationText = [locationCity, locationRegion, locationCountry].filter(Boolean).join(', ') || 'Remote';
          const isRemote = post.location?.remote === true || /remote/i.test(locationText);

          collected.push({
            sourceId: `smartrecruiters_${company}_${post.id}`,
            sourceType: 'smartrecruiters',
            requisitionId: String(post.id),
            sourceUrl: `https://jobs.smartrecruiters.com/${company}/${post.id}`,
            companyName: post.company?.name || company,
            title,
            locationText,
            isRemote,
            employmentType: post.typeOfEmployment?.label?.toLowerCase().includes('contract') ? 'contract' : 'full-time',
            rawDescription: `${title} at ${company}. Department: ${post.department?.label || 'Engineering'}. Location: ${locationText}. Experience Level: ${post.experienceLevel?.label || 'Mid-Senior'}.`,
            publishedAt: post.releasedDate || new Date().toISOString(),
            department: post.department?.label || undefined,
          });
        }
      } catch (err: any) {
        logger.debug(`SmartRecruiters fetch for ${company} skipped: ${err.message || err}`);
      }
    }

    return collected;
  }
}
