import { logger } from '../../core/logger.js';
import type { IJobSourceConnector } from './types.js';
import type { RawJobPayload } from '../../types/index.js';

export class WorkableAtsConnector implements IJobSourceConnector {
  readonly name = 'Workable ATS';
  readonly sourceType = 'workable';

  private targetCompanies = [
    'taxfix',
    'typeform',
    'omio',
    'invision',
    'clever',
    'supercell',
  ];

  async fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]> {
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
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);

        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ query: '', location: [], department: [], worktype: [] }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!resp.ok) continue;

        const data = await resp.json() as any;
        const results = Array.isArray(data.results) ? data.results : [];

        for (const job of results) {
          const title = (job.title || '').toLowerCase();
          const matchesKeyword = targetKeywords.some(kw => title.includes(kw));
          if (!matchesKeyword) continue;

          const locationParts = [job.city, job.state, job.country].filter(Boolean);
          const locationText = job.telecommuting ? 'Remote' : (locationParts.join(', ') || 'Remote');

          collected.push({
            sourceId: `workable_${company}_${job.shortcode || job.id}`,
            sourceType: 'workable',
            sourceUrl: `https://apply.workable.com/${company}/j/${job.shortcode}/`,
            companyName: company.charAt(0).toUpperCase() + company.slice(1),
            title: job.title,
            locationText,
            rawDescription: `${job.title} at ${company}. ${locationText}. Category: ${job.department || 'Technology'}`,
            publishedAt: job.published ? new Date(job.published).toISOString() : new Date().toISOString(),
            employmentType: 'full-time',
            isRemote: job.telecommuting || locationText.toLowerCase().includes('remote') || true,
          });

          if (collected.length >= limit) break;
        }
      } catch (err) {
        logger.debug(`Workable query failed for ${company}: ${err}`);
      }
    }

    logger.info(`Workable ATS connector retrieved ${collected.length} vacancies.`);
    return collected;
  }
}
