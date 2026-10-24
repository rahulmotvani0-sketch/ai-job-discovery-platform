import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class LeverAtsConnector extends BaseSourceConnector {
  readonly sourceId = 'lever';
  readonly name = 'Lever ATS';
  readonly sourceType = 'lever';
  readonly category: JobSourceCategory = 'ATS_PLATFORMS';
  readonly officialUrl = 'https://jobs.lever.co';

  protected rateLimitRpm = 60;
  protected timeoutMs = 8000;

  private targetCompanies: string[] = [
    'palantir',
    'spotify',
    'deliveroo',
    'miro',
    'fullstory',
    'kinsta',
    'bitso',
    'automattic',
    'optionmetrics',
    'brightedge',
    'coinspaid',
    'everseen',
    'nextech',
    'postscript',
    'hotjar',
  ];

  constructor(customCompanies?: string[]) {
    super();
    if (customCompanies && customCompanies.length > 0) {
      this.targetCompanies = [...customCompanies];
    }
  }

  addCompany(company: string): void {
    const cleanCompany = company.toLowerCase().trim();
    if (!this.targetCompanies.includes(cleanCompany)) {
      this.targetCompanies.push(cleanCompany);
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
      const resp = await this.safeFetch('https://api.lever.co/v0/postings/palantir?mode=json&limit=1', undefined, 6000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'Lever public postings API operational' : `HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        latencyMs: Date.now() - start,
        message: `Lever health check failed: ${err.message}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 30;
    const collected: RawJobPayload[] = [];
    const targetKeywords = [
      'engineer',
      'developer',
      'software',
      'fullstack',
      'full-stack',
      'frontend',
      'backend',
      'devops',
      'sre',
      'cloud',
      'infrastructure',
      'platform',
      'kubernetes',
      'reliability',
      'security',
      'systems',
      'data',
      'ai',
      'machine learning',
      'mobile',
      'qa',
      'architect',
    ];

    for (const company of this.targetCompanies) {
      if (collected.length >= limit) break;
      const url = `https://api.lever.co/v0/postings/${company}?mode=json&limit=100`;

      try {
        const resp = await this.safeFetch(url, undefined, 6000);
        if (!resp.ok) continue;

        const postings = await resp.json() as any[];
        if (!Array.isArray(postings)) continue;

        for (const job of postings) {
          const title = (job.text || '').toLowerCase();
          const team = (job.categories?.team || '').toLowerCase();
          const department = (job.categories?.department || '').toLowerCase();

          const matchesKeyword = targetKeywords.some(kw =>
            title.includes(kw) || team.includes(kw) || department.includes(kw)
          );

          if (!matchesKeyword) continue;

          const location = job.categories?.location || job.workplaceType || 'Remote';
          const isRemote =
            (job.workplaceType || '').toLowerCase().includes('remote') ||
            location.toLowerCase().includes('remote') ||
            (job.categories?.allLocations || []).some((l: string) => l.toLowerCase().includes('remote'));

          const publishedAt = job.createdAt
            ? new Date(job.createdAt).toISOString()
            : new Date().toISOString();

          collected.push({
            sourceId: `lever_${company}_${job.id}`,
            sourceType: 'lever',
            requisitionId: String(job.id),
            sourceUrl: job.hostedUrl || job.applyUrl || `https://jobs.lever.co/${company}/${job.id}`,
            companyName: company.charAt(0).toUpperCase() + company.slice(1),
            title: job.text || 'Cloud/DevOps Engineer',
            locationText: location,
            rawDescription: job.descriptionPlain || job.descriptionBodyPlain || job.description || `${job.text} at ${company}.`,
            publishedAt,
            employmentType: (job.categories?.commitment || 'full-time').toLowerCase(),
            isRemote,
            department: job.categories?.department || job.categories?.team || undefined,
          });

          if (collected.length >= limit) break;
        }
      } catch (err: any) {
        logger.debug(`Lever board query failed for ${company}: ${err.message || err}`);
      }
    }

    logger.info(`Lever ATS collector retrieved ${collected.length} direct company vacancies.`);
    return collected;
  }
}
