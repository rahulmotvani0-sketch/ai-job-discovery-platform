import type { RawJobPayload } from '../../types/index.js';

export interface IJobSourceConnector {
  readonly name: string;
  readonly sourceType: RawJobPayload['sourceType'];
  fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]>;
}
