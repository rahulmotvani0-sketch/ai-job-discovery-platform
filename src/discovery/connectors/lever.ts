import { logger } from '../../core/logger.js';
import type { IJobSourceConnector } from './types.js';
import type { RawJobPayload } from '../../types/index.js';

export class LeverAtsConnector implements IJobSourceConnector {
  readonly name = 'Lever ATS';
  readonly sourceType = 'lever';

  private targetCompanies = [
    'palantir',
    'optionmetrics',
    'brightedge',
    'coinspaid',
    'everseen',
    'nextech',
    'postscript',
  ];

  async fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]> {
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
    ];

    for (const company of this.targetCompanies) {
      if (collected.length >= limit) break;
      const url = `https://api.lever.co/v0/postings/${company}?mode=json&limit=100`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);

        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

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
            sourceUrl: job.hostedUrl || job.applyUrl || `https://jobs.lever.co/${company}/${job.id}`,
            companyName: company.charAt(0).toUpperCase() + company.slice(1),
            title: job.text || 'Cloud/DevOps Engineer',
            locationText: location,
            rawDescription: job.descriptionPlain || job.descriptionBodyPlain || job.description || '',
            publishedAt,
            employmentType: (job.categories?.commitment || 'full-time').toLowerCase(),
            isRemote,
          });

          if (collected.length >= limit) break;
        }
      } catch (err) {
        logger.debug(`Lever board query failed for ${company}: ${err}`);
      }
    }

    logger.info(`Lever ATS collector retrieved ${collected.length} direct company vacancies.`);
    return collected;
  }
}
