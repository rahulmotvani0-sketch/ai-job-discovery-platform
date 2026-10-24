import { logger } from '../../core/logger.js';
import type { IJobSourceConnector } from './types.js';
import type { RawJobPayload } from '../../types/index.js';

export class YCombinatorStartupsConnector implements IJobSourceConnector {
  readonly name = 'Y Combinator Startups';
  readonly sourceType = 'ycombinator';

  private targetYcStartups = [
    { name: 'PostHog', greenhouseId: 'posthog' },
    { name: 'Retool', greenhouseId: 'retool' },
    { name: 'Supabase', leverId: 'supabase' },
    { name: 'Vercel', ashbyId: 'vercel' },
    { name: 'Brex', greenhouseId: 'brex' },
    { name: 'Scale AI', greenhouseId: 'scaleai' },
    { name: 'GitLab', greenhouseId: 'gitlab' },
    { name: 'Zapier', greenhouseId: 'zapier' },
  ];

  async fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 30;
    const collected: RawJobPayload[] = [];
    const targetKeywords = [
      'engineer', 'developer', 'software', 'fullstack', 'full-stack', 'frontend',
      'backend', 'devops', 'sre', 'cloud', 'infrastructure', 'platform',
      'kubernetes', 'security', 'data', 'ai', 'machine learning', 'mobile', 'qa', 'architect', 'systems'
    ];

    for (const startup of this.targetYcStartups) {
      if (collected.length >= limit) break;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);

        let url = '';
        if (startup.greenhouseId) {
          url = `https://boards-api.greenhouse.io/v1/boards/${startup.greenhouseId}/jobs?content=true`;
        } else if (startup.leverId) {
          url = `https://api.lever.co/v0/postings/${startup.leverId}?mode=json`;
        } else if (startup.ashbyId) {
          url = `https://api.ashbyhq.com/posting-api/job-board/${startup.ashbyId}`;
        }

        if (!url) continue;

        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (!resp.ok) continue;

        const data = await resp.json() as any;

        if (startup.greenhouseId) {
          const jobs = Array.isArray(data.jobs) ? data.jobs : [];
          for (const job of jobs) {
            const title = (job.title || '').toLowerCase();
            if (!targetKeywords.some(kw => title.includes(kw))) continue;

            collected.push({
              sourceId: `yc_${startup.name.toLowerCase()}_${job.id}`,
              sourceType: 'ycombinator',
              sourceUrl: job.absolute_url,
              companyName: `${startup.name} (YC)`,
              title: job.title,
              locationText: job.location?.name || 'Remote',
              rawDescription: job.content || `YC backed startup ${startup.name} opening for ${job.title}.`,
              publishedAt: job.updated_at ? new Date(job.updated_at).toISOString() : new Date().toISOString(),
              employmentType: 'full-time',
              isRemote: (job.location?.name || '').toLowerCase().includes('remote') || true,
            });

            if (collected.length >= limit) break;
          }
        } else if (startup.leverId) {
          const postings = Array.isArray(data) ? data : [];
          for (const post of postings) {
            const title = (post.text || '').toLowerCase();
            if (!targetKeywords.some(kw => title.includes(kw))) continue;

            collected.push({
              sourceId: `yc_${startup.name.toLowerCase()}_${post.id}`,
              sourceType: 'ycombinator',
              sourceUrl: post.hostedUrl || post.applyUrl,
              companyName: `${startup.name} (YC)`,
              title: post.text,
              locationText: post.categories?.location || 'Remote',
              rawDescription: post.descriptionPlain || post.description || '',
              publishedAt: post.createdAt ? new Date(post.createdAt).toISOString() : new Date().toISOString(),
              employmentType: 'full-time',
              isRemote: true,
            });

            if (collected.length >= limit) break;
          }
        }
      } catch (err) {
        logger.debug(`YC startup job query failed for ${startup.name}: ${err}`);
      }
    }

    logger.info(`Y Combinator Startups connector retrieved ${collected.length} direct vacancies.`);
    return collected;
  }
}
