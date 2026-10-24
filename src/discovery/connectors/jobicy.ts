import { logger } from '../../core/logger.js';
import type { IJobSourceConnector } from './types.js';
import type { RawJobPayload } from '../../types/index.js';

export class JobicyConnector implements IJobSourceConnector {
  readonly name = 'Jobicy';
  readonly sourceType = 'jobicy';

  async fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 25;
    const url = `https://jobicy.com/api/v2/remote-jobs?count=${limit}&tag=devops`;
    logger.info(`Fetching vacancies from Jobicy API (${url})...`);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });
      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`Jobicy responded with status ${resp.status}`);
      }

      const json = await resp.json() as any;
      const jobs = Array.isArray(json.jobs) ? json.jobs : [];
      logger.info(`Jobicy returned ${jobs.length} jobs.`);

      return jobs.slice(0, limit).map((item: any) => {
        const jobTypeStr = Array.isArray(item.jobType) ? item.jobType.join(' ') : String(item.jobType || '');
        const isContract = jobTypeStr.toLowerCase().includes('contract');

        return {
          sourceId: `jobicy_${item.id}`,
          sourceType: 'jobicy',
          sourceUrl: item.url,
          companyName: item.companyName || 'Unknown Company',
          title: item.jobTitle || 'DevOps Engineer',
          locationText: item.jobGeo || 'Remote (Global)',
          rawDescription: item.jobDescription || item.jobExcerpt || '',
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          salaryMin: item.annualSalaryMin ? Number(item.annualSalaryMin) : undefined,
          salaryMax: item.annualSalaryMax ? Number(item.annualSalaryMax) : undefined,
          currency: item.salaryCurrency || 'USD',
          employmentType: (isContract ? 'contract' : 'full-time') as any,
          isRemote: true,
        };
      });
    } catch (err) {
      logger.warn(`Jobicy fetch failed: ${err}`);
      return [];
    }
  }
}
