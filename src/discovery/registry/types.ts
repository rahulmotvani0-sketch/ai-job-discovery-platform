/**
 * Source Registry and Connector Types
 * Part of the Global Job Discovery Platform
 */

export type JobSourceCategory =
  | 'INDIAN_PORTALS'          // Category A
  | 'INTERNATIONAL_BOARDS'     // Category B
  | 'REMOTE_EMPLOYMENT'        // Category C
  | 'STARTUP_GROWTH'           // Category D
  | 'SPECIALIST_TECH'          // Category E
  | 'FREELANCE_CONTRACT'       // Category F
  | 'GOVERNMENT_PUBLIC'        // Category G
  | 'ATS_PLATFORMS'            // Category H
  | 'COMPANY_CAREERS'          // Category I
  | 'ADDITIONAL_CHANNELS';     // Category J

export type SourceIntegrationType =
  | 'OFFICIAL_PUBLIC_API'
  | 'AUTHORIZED_PARTNER_API'
  | 'PUBLIC_RSS_ATOM'
  | 'PUBLIC_JSON_FEED'
  | 'ATS_JOB_POSTING_API'
  | 'PERMITTED_CAREER_EXTRACTION'
  | 'AUTHORIZED_SEARCH_API'
  | 'MANUAL_OR_LINK_ONLY';

export type SourceImplementationStatus =
  | 'IMPLEMENTED_AND_TESTED'
  | 'IMPLEMENTED_BUT_NOT_LIVE_VERIFIED'
  | 'REQUIRES_API_CREDENTIALS'
  | 'REQUIRES_PARTNER_ACCESS'
  | 'MANUAL_OR_LINK_ONLY'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'DISABLED_BY_USER'
  | 'UNSUPPORTED'
  | 'RESTRICTED_BY_TERMS';

export type SourceHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNHEALTHY'
  | 'UNTESTED'
  | 'REQUIRES_CONFIG';

export type SourceAuthRequirement =
  | 'NONE'
  | 'API_KEY'
  | 'OAUTH2'
  | 'PARTNER_KEY'
  | 'SESSION_COOKIE'
  | 'NOT_APPLICABLE';

export type RemoteEligibilityType =
  | 'FULLY_REMOTE_WORLDWIDE'
  | 'REMOTE_COUNTRY_SPECIFIC'
  | 'REMOTE_REGION_SPECIFIC'
  | 'HYBRID'
  | 'ONSITE'
  | 'REMOTE_UNKNOWN';

export type JobVerificationStatus =
  | 'LIVE_VERIFIED'
  | 'OPEN_BUT_NOT_RECENTLY_VERIFIED'
  | 'EXPIRED'
  | 'REMOVED'
  | 'REDIRECTED'
  | 'ACCESS_BLOCKED'
  | 'VERIFICATION_UNKNOWN';

export interface JobSourceDefinition {
  id: string;
  name: string;
  url: string;
  category: JobSourceCategory;
  countries: string[];
  regions: string[];
  jobCategories: string[];
  integrationType: SourceIntegrationType;
  apiDocsUrl?: string;
  authRequirements: SourceAuthRequirement;
  configVars: string[];
  usageRestrictions?: string;
  attributionRequired: boolean;
  attributionText?: string;
  paginationMethod: 'OFFSET_LIMIT' | 'PAGE_NUMBER' | 'CURSOR' | 'NONE';
  rateLimits: {
    requestsPerMinute?: number;
    burstLimit?: number;
  };
  syncFrequencyMinutes: number;
  implementationStatus: SourceImplementationStatus;
  healthStatus: SourceHealthStatus;
  verificationStatus: 'VERIFIED_OFFICIAL' | 'COMMUNITY_CURATED' | 'UNVERIFIED';
  isEnabled: boolean;
  notes?: string;
  stats: {
    lastSyncAt?: string;
    lastSuccessAt?: string;
    lastError?: string;
    consecutiveFailures: number;
    jobsRetrieved: number;
    validJobsRetrieved: number;
    duplicatesRemoved: number;
  };
}

export interface SourceProposal {
  id: string;
  name: string;
  officialDomain: string;
  category: JobSourceCategory;
  countriesCovered: string[];
  evidenceDescription: string;
  apiOrFeedDocsUrl?: string;
  accessRestrictions?: string;
  authRequirements: SourceAuthRequirement;
  estimatedIntegrationEffort: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedAdapterType: SourceIntegrationType;
  validationStatus: 'PENDING_REVIEW' | 'VALIDATED' | 'REJECTED';
  proposedAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface ConnectorHealthCheckResult {
  sourceId: string;
  healthy: boolean;
  latencyMs?: number;
  statusCode?: number;
  message?: string;
  checkedAt: string;
}

export interface SourceRegistrySummary {
  totalSources: number;
  byCategory: Record<JobSourceCategory, number>;
  byImplementationStatus: Record<SourceImplementationStatus, number>;
  byHealthStatus: Record<SourceHealthStatus, number>;
  totalJobsRetrieved: number;
  totalValidRetained: number;
  totalDuplicatesFiltered: number;
  countriesCovered: string[];
  regionsCovered: string[];
  lastGlobalSyncAt?: string;
}

export type GlobalPortalCategoryGroup =
  | 'GLOBAL_GENERAL'
  | 'TECH_STARTUP'
  | 'REMOTE_WORK'
  | 'FREELANCE_CONTRACT'
  | 'INDIA'
  | 'US_CANADA'
  | 'UK_IRELAND'
  | 'EUROPE'
  | 'ASIA_PACIFIC'
  | 'MIDDLE_EAST_AFRICA'
  | 'LATIN_AMERICA'
  | 'PUBLIC_NONPROFIT'
  | 'DIRECT_ATS';

export interface GlobalPortalRegistryEntry {
  portalName: string;
  category: GlobalPortalCategoryGroup;
  countries: string[];
  supportedRoles: string[];
  officialApiOrFeedUrl: string;
  authenticationRequirement: SourceAuthRequirement;
  rateLimits: {
    requestsPerMinute?: number;
    burstLimit?: number;
  };
  termsRestrictions: string;
  connectorStatus: SourceImplementationStatus;
  lastSuccessfulSync: string | null;
  attributionRequirement: {
    required: boolean;
    text: string;
    url?: string;
  };
}
