import { logger } from '../../core/logger.js';
import type { IJobSourceConnector } from './types.js';
import type { RawJobPayload } from '../../types/index.js';

export class RemoteOkConnector implements IJobSourceConnector {
  readonly name = 'RemoteOK';
  readonly sourceType = 'remoteok';

  async fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 25;
    const url = 'https://remoteok.com/api';
    logger.info(`Fetching vacancies from RemoteOK API (${url})...`);

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
        throw new Error(`RemoteOK responded with status ${resp.status}`);
      }

      const data = await resp.json() as any[];
      // First item in RemoteOK array is often legal / metadata
      const items = Array.isArray(data) ? data.filter(item => item && item.id && item.position) : [];

      const targetKeywords = ['devops', 'sre', 'cloud', 'infrastructure', 'platform', 'kubernetes', 'terraform'];
      
      const filtered = items.filter(item => {
        const title = (item.position || '').toLowerCase();
        const tags = Array.isArray(item.tags) ? item.tags.map((t: string) => t.toLowerCase()) : [];
        return targetKeywords.some(kw => title.includes(kw) || tags.includes(kw));
      });

      logger.info(`RemoteOK returned ${items.length} total jobs, ${filtered.length} matched target cloud/DevOps roles.`);

      return filtered.slice(0, limit).map(item => ({
        sourceId: `remoteok_${item.id}`,
        sourceType: 'remoteok',
        sourceUrl: item.url || `https://remoteok.com/remote-jobs/${item.id}`,
        companyName: item.company || 'Unknown Company',
        title: item.position,
        locationText: item.location || 'Remote (Worldwide)',
        rawDescription: item.description || '',
        publishedAt: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
        salaryMin: item.salary_min ? Number(item.salary_min) : undefined,
        salaryMax: item.salary_max ? Number(item.salary_max) : undefined,
        currency: 'USD',
        employmentType: 'full-time',
        isRemote: true,
      }));
    } catch (err) {
      logger.warn(`RemoteOK fetch failed: ${err}`);
      return [];
    }
  }
}
