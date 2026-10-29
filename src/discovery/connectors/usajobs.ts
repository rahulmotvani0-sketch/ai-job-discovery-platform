import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';
import { BaseSourceConnector } from './base.js';

export class USAJobsConnector extends BaseSourceConnector {
  readonly sourceId = 'usajobs';
  readonly name = 'USAJOBS Federal Employment API';
  readonly sourceType = 'usajobs';
  readonly category: JobSourceCategory = 'GOVERNMENT_PUBLIC';
  readonly officialUrl = 'https://developer.usajobs.gov';

  override readonly countriesAndRegions = {
    countries: ['US'],
    regions: ['North America'],
  };
  override readonly authRequirements = {
    type: 'API_KEY' as const,
    description: 'Requires USAJOBS_API_KEY and USAJOBS_USER_AGENT',
    requiredEnvVars: ['USAJOBS_API_KEY', 'USAJOBS_USER_AGENT'],
  };
  override readonly usageRestrictions = 'USAJOBS Developer API Terms of Service. Exclusively for legitimate job search assistance for US federal employment.';
  override get attribution() {
    return {
      required: true,
      text: 'Jobs provided by USAJOBS - U.S. Office of Personnel Management',
      url: 'https://www.usajobs.gov',
    };
  }
  override readonly pagination = {
    type: 'PAGE_NUMBER' as const,
    maxPageSize: 100,
  };

  protected rateLimitRpm = 60;
  protected timeoutMs = 8000;

  private apiKey: string;
  private userAgentEmail: string;

  constructor() {
    super();
    this.apiKey = process.env.USAJOBS_API_KEY || '';
    this.userAgentEmail = process.env.USAJOBS_USER_AGENT || '';
  }

  validateConfig(): { valid: boolean; missingVars: string[] } {
    const missing: string[] = [];
    if (!this.apiKey) missing.push('USAJOBS_API_KEY');
    if (!this.userAgentEmail) missing.push('USAJOBS_USER_AGENT');
    return {
      valid: missing.length === 0,
      missingVars: missing,
    };
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    const config = this.validateConfig();
    if (!config.valid) {
      return {
        sourceId: this.sourceId,
        healthy: false,
        message: `Requires API credentials: ${config.missingVars.join(', ')}`,
        checkedAt: new Date().toISOString(),
      };
    }

    const start = Date.now();
    try {
      const url = 'https://data.usajobs.gov/api/search?Keyword=software&ResultsPerPage=1';
      const resp = await this.safeFetch(url, {
        headers: {
          'Authorization-Key': this.apiKey,
          'User-Agent': this.userAgentEmail,
        }
      }, 5000);

      return {
        sourceId: this.sourceId,
        healthy: resp.ok,
        statusCode: resp.status,
        latencyMs: Date.now() - start,
        message: resp.ok ? 'USAJOBS API operational' : `HTTP ${resp.status}`,
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
    const config = this.validateConfig();
    if (!config.valid) {
      logger.info(`USAJOBS connector skipped: missing credentials (${config.missingVars.join(', ')})`);
      return [];
    }

    const limit = options?.limit ?? 15;
    const keyword = options?.tags?.[0] || 'technology';

    try {
      const url = `https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(keyword)}&ResultsPerPage=${limit}`;
      const resp = await this.safeFetch(url, {
        headers: {
          'Authorization-Key': this.apiKey,
          'User-Agent': this.userAgentEmail,
        }
      });

      if (!resp.ok) {
        logger.warn(`USAJOBS API returned status ${resp.status}`);
        return [];
      }

      const data = await resp.json() as any;
      const items = data.SearchResult?.SearchResultItems || [];

      return items.map((wrapper: any) => {
        const item = wrapper.MatchedObjectDescriptor || {};
        const positionLocation = item.PositionLocation?.[0] || {};
        const locationText = positionLocation.LocationName || 'United States';
        const remCode = item.PositionRemoteTeleworkCode || '';
        const isRemote = remCode === '1' || /remote/i.test(locationText);

        const remun = item.PositionRemuneration?.[0] || {};
        const salaryMin = remun.MinimumRange ? parseFloat(remun.MinimumRange) : undefined;
        const salaryMax = remun.MaximumRange ? parseFloat(remun.MaximumRange) : undefined;

        // Parse eligibility
        const userArea = item.UserArea?.Details || {};
        const eligibilities = (userArea.HiringPath || []).join(', ');

        return {
          sourceId: `usajobs_${item.PositionID || wrapper.MatchedObjectId}`,
          sourceType: 'usajobs',
          sourceUrl: item.PositionURI || `https://www.usajobs.gov/job/${item.PositionID}`,
          companyName: item.OrganizationName || item.DepartmentName || 'U.S. Federal Government',
          title: item.PositionTitle || 'Federal Role',
          locationText,
          isRemote,
          employmentType: 'full-time',
          salaryMin,
          salaryMax,
          currency: 'USD',
          rawDescription: `${item.PositionTitle} at ${item.OrganizationName}. Department: ${item.DepartmentName}. Qualification Summary: ${item.QualificationSummary || 'Refer to USAJOBS listing for federal clearance & citizenship requirements.'}. Hiring Path: ${eligibilities}.`,
          publishedAt: item.PublicationStartDate || new Date().toISOString(),
        };
      });
    } catch (err: any) {
      logger.error(`USAJOBS fetch failed: ${err.message}`);
      return [];
    }
  }
}
