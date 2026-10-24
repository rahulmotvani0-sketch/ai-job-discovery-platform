import { logger } from '../../core/logger.js';
import type { IJobSourceConnector } from './types.js';
import type { RawJobPayload } from '../../types/index.js';

export class GreenhouseAtsConnector implements IJobSourceConnector {
  readonly name = 'Greenhouse ATS';
  readonly sourceType = 'greenhouse';

  private targetCompanies = [
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
  ];

  async fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]> {
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
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);

        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (!resp.ok) continue;

        const data = await resp.json() as any;
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];

        for (const job of jobs) {
          const title = (job.title || '').toLowerCase();
          const matchesKeyword = targetKeywords.some(kw => title.includes(kw));
          if (!matchesKeyword) continue;

          collected.push({
            sourceId: `greenhouse_${company}_${job.id}`,
            sourceType: 'greenhouse',
            sourceUrl: job.absolute_url,
            companyName: company.charAt(0).toUpperCase() + company.slice(1),
            title: job.title,
            locationText: job.location?.name || 'Remote',
            rawDescription: job.content || '',
            publishedAt: job.updated_at ? new Date(job.updated_at).toISOString() : new Date().toISOString(),
            employmentType: 'full-time',
            isRemote: (job.location?.name || '').toLowerCase().includes('remote') || true,
          });

          if (collected.length >= limit) break;
        }
      } catch (err) {
        logger.debug(`Greenhouse board query failed for ${company}: ${err}`);
      }
    }

    logger.info(`Greenhouse ATS collector retrieved ${collected.length} direct company vacancies.`);
    return collected;
  }
}
