/**
 * Connector Capabilities Registry
 * Declares native vs local filtering support for all discovery connectors.
 * In accordance with Section 5: "Each connector must declare which filters it
 * supports natively and which filters require local processing."
 */

export interface ConnectorFilterCapabilities {
  connectorId: string;
  connectorName: string;
  sourceType: string;
  supportsNativeKeywordSearch: boolean;
  supportsNativeLocation: boolean;
  supportsNativeCountry: boolean;
  supportsNativeWorkArrangement: boolean;
  supportsNativeCategory: boolean;
  supportsNativePagination: boolean;
  supportsNativeSalaryFilter: boolean;
  localFilteringApplied: string[];
  notes?: string;
}

export const CONNECTOR_CAPABILITIES_REGISTRY: Record<string, ConnectorFilterCapabilities> = {
  remotive: {
    connectorId: 'remotive',
    connectorName: 'Remotive',
    sourceType: 'remotive',
    supportsNativeKeywordSearch: true,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: true, // Inherently remote
    supportsNativeCategory: true,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['location', 'country', 'salary', 'experience', 'skills', 'matchScore', 'company'],
    notes: 'Public API supports category & keyword. Location restrictions (e.g. US-only remote) are parsed locally.',
  },
  greenhouse: {
    connectorId: 'greenhouse',
    connectorName: 'Greenhouse ATS',
    sourceType: 'greenhouse',
    supportsNativeKeywordSearch: false,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: false,
    supportsNativeCategory: false,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['keyword', 'role', 'location', 'country', 'workArrangement', 'experience', 'salary', 'skills', 'matchScore'],
    notes: 'Queries public board jobs endpoint per employer. Content filtering and normalization applied locally.',
  },
  lever: {
    connectorId: 'lever',
    connectorName: 'Lever ATS',
    sourceType: 'lever',
    supportsNativeKeywordSearch: false,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: false,
    supportsNativeCategory: false,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['keyword', 'role', 'location', 'country', 'workArrangement', 'experience', 'salary', 'skills', 'matchScore'],
    notes: 'Queries company postings endpoint. All granular criteria filtered locally.',
  },
  ashby: {
    connectorId: 'ashby',
    connectorName: 'Ashby ATS',
    sourceType: 'ashby',
    supportsNativeKeywordSearch: false,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: false,
    supportsNativeCategory: false,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['keyword', 'role', 'location', 'country', 'workArrangement', 'experience', 'salary', 'skills', 'matchScore'],
    notes: 'Queries public company posting feed. Title, location, and workplace type filtered locally.',
  },
  workable: {
    connectorId: 'workable',
    connectorName: 'Workable ATS',
    sourceType: 'workable',
    supportsNativeKeywordSearch: false,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: false,
    supportsNativeCategory: false,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['keyword', 'role', 'location', 'country', 'workArrangement', 'experience', 'salary', 'skills', 'matchScore'],
    notes: 'Queries company widget API. Filtered locally.',
  },
  smartrecruiters: {
    connectorId: 'smartrecruiters',
    connectorName: 'SmartRecruiters ATS',
    sourceType: 'smartrecruiters',
    supportsNativeKeywordSearch: false,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: false,
    supportsNativeCategory: false,
    supportsNativePagination: true,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['keyword', 'role', 'location', 'country', 'workArrangement', 'experience', 'salary', 'skills', 'matchScore'],
    notes: 'Supports page limit per company. Deep role and skills matching processed locally.',
  },
  ycombinator: {
    connectorId: 'ycombinator',
    connectorName: 'Y Combinator Startups',
    sourceType: 'ycombinator',
    supportsNativeKeywordSearch: false,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: false,
    supportsNativeCategory: false,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['keyword', 'role', 'location', 'country', 'workArrangement', 'experience', 'salary', 'skills', 'matchScore'],
    notes: 'Aggregates from top YC startups via their career feeds. Filtered locally.',
  },
  direct_careers: {
    connectorId: 'direct_careers',
    connectorName: 'Direct Company Careers',
    sourceType: 'direct_careers',
    supportsNativeKeywordSearch: false,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: false,
    supportsNativeCategory: false,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['keyword', 'role', 'location', 'country', 'workArrangement', 'experience', 'salary', 'skills', 'matchScore'],
    notes: 'Fetches directly from official employer career pages (Canonical, GitLab, Cloudflare, etc.).',
  },
  remoteok: {
    connectorId: 'remoteok',
    connectorName: 'RemoteOK',
    sourceType: 'remoteok',
    supportsNativeKeywordSearch: true, // Via tag parameters e.g. /api?tag=devops
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: true, // All remote
    supportsNativeCategory: true,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['location', 'country', 'salary', 'experience', 'skills', 'matchScore'],
    notes: 'Public JSON API supports tag queries. Location and salary ranges extracted and filtered locally.',
  },
  jobicy: {
    connectorId: 'jobicy',
    connectorName: 'Jobicy',
    sourceType: 'jobicy',
    supportsNativeKeywordSearch: true,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: true,
    supportsNativeCategory: true,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['location', 'country', 'salary', 'experience', 'skills', 'matchScore'],
    notes: 'Public JSON feed supports category queries. Remaining filters processed locally.',
  },
  himalayas: {
    connectorId: 'himalayas',
    connectorName: 'Himalayas',
    sourceType: 'himalayas',
    supportsNativeKeywordSearch: false,
    supportsNativeLocation: false,
    supportsNativeCountry: false,
    supportsNativeWorkArrangement: true,
    supportsNativeCategory: false,
    supportsNativePagination: false,
    supportsNativeSalaryFilter: false,
    localFilteringApplied: ['keyword', 'role', 'location', 'country', 'salary', 'experience', 'skills', 'matchScore'],
    notes: 'Public remote job feed. Normalized and filtered locally.',
  },
  adzuna: {
    connectorId: 'adzuna',
    connectorName: 'Adzuna Jobs API',
    sourceType: 'adzuna',
    supportsNativeKeywordSearch: true,
    supportsNativeLocation: true,
    supportsNativeCountry: true, // via endpoint URL e.g. /in/search, /us/search
    supportsNativeWorkArrangement: false,
    supportsNativeCategory: true,
    supportsNativePagination: true,
    supportsNativeSalaryFilter: true, // supports salary_min, salary_max parameters
    localFilteringApplied: ['matchScore', 'skills', 'experience', 'workArrangement'],
    notes: 'Requires ADZUNA_APP_ID & ADZUNA_APP_KEY. Native country, location, and salary filtering supported.',
  },
  usajobs: {
    connectorId: 'usajobs',
    connectorName: 'USAJOBS Federal Employment API',
    sourceType: 'usajobs',
    supportsNativeKeywordSearch: true,
    supportsNativeLocation: true,
    supportsNativeCountry: true, // strictly US
    supportsNativeWorkArrangement: true, // TeleworkEligible parameter
    supportsNativeCategory: true,
    supportsNativePagination: true,
    supportsNativeSalaryFilter: true, // Remuneration parameters
    localFilteringApplied: ['matchScore', 'skills', 'citizenshipClearance'],
    notes: 'Requires USAJOBS_API_KEY. Country is strictly United States. Federal citizenship and clearance verified locally.',
  },
};

export function getConnectorCapabilities(connectorId: string): ConnectorFilterCapabilities | null {
  return CONNECTOR_CAPABILITIES_REGISTRY[connectorId.toLowerCase()] || null;
}

export function listAllConnectorCapabilities(): ConnectorFilterCapabilities[] {
  return Object.values(CONNECTOR_CAPABILITIES_REGISTRY);
}
