import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export interface AshbyCompanyTarget {
  slug: string;
  name: string;
}

export class AshbyAtsConnector extends BaseSourceConnector {
  readonly sourceId = 'ashby';
  readonly name = 'Ashby ATS';
  readonly sourceType = 'ashby';
  readonly category: JobSourceCategory = 'ATS_PLATFORMS';
  readonly officialUrl = 'https://jobs.ashbyhq.com';

  protected rateLimitRpm = 60;
  protected timeoutMs = 8000;

  private targetCompanies: AshbyCompanyTarget[] = [
    { slug: 'linear', name: 'Linear' },
    { slug: 'supabase', name: 'Supabase' },
    { slug: 'ramp', name: 'Ramp' },
    { slug: 'perplexity', name: 'Perplexity' },
    { slug: 'resend', name: 'Resend' },
    { slug: 'posthog', name: 'PostHog' },
    { slug: 'vanta', name: 'Vanta' },
    { slug: 'dust', name: 'Dust' },
    { slug: 'replit', name: 'Replit' },
    { slug: 'langchain', name: 'LangChain' },
    { slug: 'retool', name: 'Retool' },
    { slug: 'modal', name: 'Modal' },
    { slug: 'mistral', name: 'Mistral AI' },
    { slug: 'anysphere', name: 'Cursor' },
    { slug: 'together-ai', name: 'Together AI' },
    { slug: 'runway', name: 'Runway ML' },
    { slug: 'railway', name: 'Railway' },
    { slug: 'flyio', name: 'Fly.io' },
    { slug: 'brex', name: 'Brex' },
    { slug: 'mercury', name: 'Mercury' },
    { slug: 'deel', name: 'Deel' },
    { slug: 'remote', name: 'Remote' },
    { slug: 'pilot', name: 'Pilot' },
  ];

  constructor(customCompanies?: AshbyCompanyTarget[]) {
    super();
    if (customCompanies && customCompanies.length > 0) {
      this.targetCompanies = [...customCompanies];
    }
  }

  addCompany(slug: string, name?: string): void {
    const cleanSlug = slug.toLowerCase().trim();
    if (!this.targetCompanies.some(c => c.slug === cleanSlug)) {
      this.targetCompanies.push({
        slug: cleanSlug,
        name: name || cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1),
      });
    }
  }

  getCompanies(): AshbyCompanyTarget[] {
    return [...this.targetCompanies];
  }

  validateConfig(): { valid: boolean; missingVars: string[] } {
    return { valid: true, missingVars: [] };
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    const start = Date.now();
    try {
      const resp = await this.safeFetch('https://api.ashbyhq.com/posting-api/job-board/linear', undefined, 6000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'Ashby public posting API operational' : `HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        latencyMs: Date.now() - start,
        message: `Ashby health check failed: ${err.message}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 35;
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

    for (const { slug, name } of this.targetCompanies) {
      if (collected.length >= limit) break;
      const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

      try {
        const resp = await this.safeFetch(url, undefined, 6000);
        if (!resp.ok) continue;

        const data = await resp.json() as any;
        const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

        for (const job of jobs) {
          if (!job.isListed) continue;

          const title = (job.title || '').toLowerCase();
          const department = (job.department || '').toLowerCase();
          const team = (job.team || '').toLowerCase();

          const matchesKeyword = targetKeywords.some(kw =>
            title.includes(kw) || department.includes(kw) || team.includes(kw)
          );

          if (!matchesKeyword) continue;

          const location = job.location || job.workplaceType || 'Remote';
          const isRemote =
            job.isRemote === true ||
            (job.workplaceType || '').toLowerCase() === 'remote' ||
            location.toLowerCase().includes('remote');

          const rawEmployment = (job.employmentType || '').toLowerCase();
          const employmentType = rawEmployment.includes('contract') ? 'contract' : 'full-time';

          collected.push({
            sourceId: `ashby_${slug}_${job.id}`,
            sourceType: 'ashby',
            requisitionId: String(job.id),
            sourceUrl: job.jobUrl || job.applyUrl || `https://jobs.ashbyhq.com/${slug}/${job.id}`,
            companyName: name,
            title: job.title,
            locationText: location,
            rawDescription: job.descriptionHtml || `${job.title} at ${name}. Location: ${location}.`,
            publishedAt: job.publishedAt ? new Date(job.publishedAt).toISOString() : new Date().toISOString(),
            employmentType,
            isRemote,
            department: job.department || job.team || undefined,
          });

          if (collected.length >= limit) break;
        }
      } catch (err: any) {
        logger.debug(`Ashby board query failed for ${slug}: ${err.message || err}`);
      }
    }

    logger.info(`Ashby ATS collector retrieved ${collected.length} direct company vacancies.`);
    return collected;
  }
}
