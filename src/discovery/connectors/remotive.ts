import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class RemotiveConnector extends BaseSourceConnector {
  readonly sourceId = 'remotive';
  readonly name = 'Remotive';
  readonly sourceType = 'remotive';
  readonly category: JobSourceCategory = 'REMOTE_EMPLOYMENT';
  readonly officialUrl = 'https://remotive.com';

  protected rateLimitRpm = 30; // Remotive requests infrequent polling (e.g. 1 req/2sec)
  protected timeoutMs = 8000;

  validateConfig(): { valid: boolean; missingVars: string[] } {
    return { valid: true, missingVars: [] }; // Public unauthenticated API
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    const start = Date.now();
    try {
      const resp = await this.safeFetch('https://remotive.com/api/remote-jobs?limit=1', undefined, 5000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'Remotive API reachable and operational' : `HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        latencyMs: Date.now() - start,
        message: `Health check failed: ${err.message}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]> {
    const limit = options?.limit ?? 25;
    const collected: RawJobPayload[] = [];
    const targetKeywords = [
      'engineer', 'developer', 'software', 'devops', 'sre', 'cloud', 'infrastructure',
      'platform', 'kubernetes', 'reliability', 'security', 'data', 'architect', 'systems'
    ];

    try {
      const url = `https://remotive.com/api/remote-jobs?category=software-dev&limit=${Math.min(limit * 2, 50)}`;
      const resp = await this.safeFetch(url);

      if (!resp.ok) {
        logger.warn(`Remotive API responded with status ${resp.status}`);
        return [];
      }

      const data = await resp.json() as any;
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];

      for (const job of jobs) {
        if (collected.length >= limit) break;
        const titleLower = (job.title || '').toLowerCase();
        const matchesKeyword = targetKeywords.some(kw => titleLower.includes(kw));
        if (!matchesKeyword) continue;

        let salaryMin: number | undefined;
        let salaryMax: number | undefined;
        if (job.salary) {
          const match = job.salary.match(/\$?(\d[\d,]+)[^\d]+(\d[\d,]+)?/);
          if (match) {
            salaryMin = parseInt(match[1].replace(/,/g, ''), 10);
            if (match[2]) {
              salaryMax = parseInt(match[2].replace(/,/g, ''), 10);
            }
          }
        }

        collected.push({
          sourceId: `remotive_${job.id}`,
          sourceType: 'remotive',
          sourceUrl: job.url || `https://remotive.com/job/${job.id}`,
          companyName: job.company_name || 'Tech Company',
          title: job.title,
          locationText: job.candidate_required_location || 'Remote (Worldwide)',
          isRemote: true,
          employmentType: job.job_type === 'contract' ? 'contract' : 'full-time',
          salaryMin,
          salaryMax,
          currency: 'USD',
          rawDescription: job.description || `${job.title} at ${job.company_name}. Category: ${job.category}. Tags: ${(job.tags || []).join(', ')}`,
          publishedAt: job.publication_date || new Date().toISOString(),
        });
      }
    } catch (err: any) {
      logger.error(`Remotive connector failed: ${err.message}`);
    }

    return collected;
  }
}
