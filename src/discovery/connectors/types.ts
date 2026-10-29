import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';

export interface ConnectorCountriesAndRegions {
  countries: string[];
  regions: string[];
}

export interface ConnectorAuthRequirements {
  type: 'NONE' | 'API_KEY' | 'OAUTH2' | 'PARTNER_KEY';
  description?: string;
  requiredEnvVars?: string[];
}

export interface ConnectorRateLimits {
  requestsPerMinute: number;
  burstLimit?: number;
}

export interface ConnectorPagination {
  type: 'OFFSET_LIMIT' | 'PAGE_NUMBER' | 'CURSOR' | 'NONE';
  maxPageSize?: number;
}

export interface ConnectorRetryPolicy {
  maxRetries: number;
  backoffMs: number;
}

export interface ConnectorAttribution {
  required: boolean;
  text: string;
  url?: string;
}

export interface IJobSourceConnector {
  readonly name: string;
  readonly sourceType: RawJobPayload['sourceType'];
  readonly sourceId?: string;
  readonly category?: JobSourceCategory;
  readonly officialUrl?: string;

  // Global Connector Specification attributes
  readonly countriesAndRegions?: ConnectorCountriesAndRegions;
  readonly supportedCategories?: string[];
  readonly authRequirements?: ConnectorAuthRequirements;
  readonly usageRestrictions?: string;
  readonly rateLimits?: ConnectorRateLimits;
  readonly pagination?: ConnectorPagination;
  readonly retryPolicy?: ConnectorRetryPolicy;
  readonly healthStatus?: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNTESTED';
  readonly lastSuccessfulSync?: string | null;
  readonly attribution?: ConnectorAttribution;

  healthCheck?(): Promise<ConnectorHealthCheckResult>;
  validateConfig?(): { valid: boolean; missingVars: string[] };
  fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]>;
}

