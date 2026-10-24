import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

interface DirectCompanySpec {
  name: string;
  boardType: 'greenhouse' | 'lever' | 'ashby';
  boardId: string;
  careerUrl: string;
}

export class DirectCareersConnector extends BaseSourceConnector {
  readonly sourceId = 'direct_careers';
  readonly name = 'Direct Company Careers';
  readonly sourceType = 'direct_careers';
  readonly category: JobSourceCategory = 'COMPANY_CAREERS';
  readonly officialUrl = 'https://careers.company.com';

  private companyCatalog: DirectCompanySpec[] = [
    { name: 'GitLab', boardType: 'greenhouse', boardId: 'gitlab', careerUrl: 'https://about.gitlab.com/jobs/' },
    { name: 'Canonical', boardType: 'greenhouse', boardId: 'canonical', careerUrl: 'https://canonical.com/careers' },
    { name: 'Cloudflare', boardType: 'greenhouse', boardId: 'cloudflare', careerUrl: 'https://www.cloudflare.com/careers/' },
    { name: 'Datadog', boardType: 'greenhouse', boardId: 'datadog', careerUrl: 'https://careers.datadoghq.com/' },
    { name: 'Grafana Labs', boardType: 'greenhouse', boardId: 'grafanalabs', careerUrl: 'https://grafana.com/about/careers/' },
    { name: 'Elastic', boardType: 'greenhouse', boardId: 'elastic', careerUrl: 'https://www.elastic.co/about/careers' },
    { name: 'MongoDB', boardType: 'greenhouse', boardId: 'mongodb', careerUrl: 'https://www.mongodb.com/careers' },
    { name: 'Stripe', boardType: 'greenhouse', boardId: 'stripe', careerUrl: 'https://stripe.com/jobs' },
    { name: 'Sentry', boardType: 'lever', boardId: 'sentry', careerUrl: 'https://sentry.io/careers/' },
    { name: 'PagerDuty', boardType: 'greenhouse', boardId: 'pagerduty', careerUrl: 'https://www.pagerduty.com/careers/' },
  ];

  validateConfig(): { valid: boolean; missingVars: string[] } {
    return { valid: true, missingVars: [] };
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    const start = Date.now();
    try {
      const resp = await this.safeFetch('https://boards-api.greenhouse.io/v1/boards/canonical/jobs?content=false', undefined, 5000);
      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'Direct Company Careers feed operational' : `HTTP ${resp.status}`,
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
    const limit = options?.limit ?? 30;
    const collected: RawJobPayload[] = [];
    const targetKeywords = [
      'engineer', 'developer', 'software', 'devops', 'sre', 'cloud', 'infrastructure',
      'platform', 'kubernetes', 'reliability', 'security', 'data', 'architect', 'systems'
    ];

    for (const comp of this.companyCatalog) {
      if (collected.length >= limit) break;

      try {
        let endpointUrl = '';
        if (comp.boardType === 'greenhouse') {
          endpointUrl = `https://boards-api.greenhouse.io/v1/boards/${comp.boardId}/jobs?content=true`;
        } else if (comp.boardType === 'lever') {
          endpointUrl = `https://api.lever.co/v0/postings/${comp.boardId}?mode=json`;
        } else {
          continue;
        }

        const resp = await this.safeFetch(endpointUrl);
        if (!resp.ok) continue;

        if (comp.boardType === 'greenhouse') {
          const data = await resp.json() as any;
          const jobs = Array.isArray(data.jobs) ? data.jobs : [];
          for (const job of jobs) {
            if (collected.length >= limit) break;
            const title = (job.title || '').toLowerCase();
            if (!targetKeywords.some(kw => title.includes(kw))) continue;

            collected.push({
              sourceId: `direct_${comp.boardId}_${job.id}`,
              sourceType: 'direct_careers',
              sourceUrl: job.absolute_url || comp.careerUrl,
              companyName: comp.name,
              title: job.title,
              locationText: job.location?.name || 'Remote / Worldwide',
              isRemote: /remote/i.test(job.location?.name || '') || true,
              employmentType: 'full-time',
              rawDescription: `${job.title} at ${comp.name}. Official listing: ${job.absolute_url || comp.careerUrl}. Location: ${job.location?.name || 'Worldwide'}.`,
              publishedAt: job.updated_at || new Date().toISOString(),
            });
          }
        } else if (comp.boardType === 'lever') {
          const jobs = await resp.json() as any[];
          if (Array.isArray(jobs)) {
            for (const job of jobs) {
              if (collected.length >= limit) break;
              const text = (job.text || '').toLowerCase();
              if (!targetKeywords.some(kw => text.includes(kw))) continue;

              collected.push({
                sourceId: `direct_${comp.boardId}_${job.id}`,
                sourceType: 'direct_careers',
                sourceUrl: job.hostedUrl || comp.careerUrl,
                companyName: comp.name,
                title: job.text,
                locationText: job.categories?.location || 'Remote',
                isRemote: job.categories?.workplaceType === 'remote' || /remote/i.test(job.categories?.location || ''),
                employmentType: job.categories?.commitment?.toLowerCase().includes('contract') ? 'contract' : 'full-time',
                rawDescription: `${job.text} at ${comp.name}. Team: ${job.categories?.team || 'Tech'}. Description: ${job.descriptionPlain || job.text}.`,
                publishedAt: new Date(job.createdAt || Date.now()).toISOString(),
              });
            }
          }
        }
      } catch (err: any) {
        logger.debug(`Direct careers fetch skipped for ${comp.name}: ${err.message}`);
      }
    }

    return collected;
  }
}
