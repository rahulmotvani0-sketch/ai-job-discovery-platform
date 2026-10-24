import { logger } from '../../core/logger.js';
import type { IJobSourceConnector } from './types.js';
import type { RawJobPayload } from '../../types/index.js';

export class AshbyAtsConnector implements IJobSourceConnector {
  readonly name = 'Ashby ATS';
  readonly sourceType = 'ashby';

  private targetCompanies: Array<{ slug: string; name: string }> = [
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
  ];

  async fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]> {
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
    ];

    for (const { slug, name } of this.targetCompanies) {
      if (collected.length >= limit) break;
      const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);

        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

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
            sourceUrl: job.jobUrl || job.applyUrl || `https://jobs.ashbyhq.com/${slug}/${job.id}`,
            companyName: name,
            title: job.title,
            locationText: location,
            rawDescription: job.descriptionHtml || '',
            publishedAt: job.publishedAt ? new Date(job.publishedAt).toISOString() : new Date().toISOString(),
            employmentType,
            isRemote,
          });

          if (collected.length >= limit) break;
        }
      } catch (err) {
        logger.debug(`Ashby board query failed for ${slug}: ${err}`);
      }
    }

    logger.info(`Ashby ATS collector retrieved ${collected.length} direct company vacancies.`);
    return collected;
  }
}
