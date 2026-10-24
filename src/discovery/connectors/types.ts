import type { RawJobPayload } from '../../types/index.js';
import type { ConnectorHealthCheckResult, JobSourceCategory } from '../registry/types.js';

export interface IJobSourceConnector {
  readonly name: string;
  readonly sourceType: RawJobPayload['sourceType'];
  readonly sourceId?: string;
  readonly category?: JobSourceCategory;
  readonly officialUrl?: string;
  healthCheck?(): Promise<ConnectorHealthCheckResult>;
  validateConfig?(): { valid: boolean; missingVars: string[] };
  fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]>;
}
