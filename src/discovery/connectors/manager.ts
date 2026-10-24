import { randomUUID } from 'node:crypto';
import { logger } from '../../core/logger.js';
import type { DatabaseManager } from '../../core/database.js';
import type { Vacancy, RawJobPayload } from '../../types/index.js';
import { normalizeJobUrl, normalizeJobTitle, computeCanonicalHash } from '../deduplication.js';
import { VacancyVerificationAgent } from '../verification.js';
import { normalizeCountryAndRegion, classifyRemoteEligibility } from '../regions.js';
import type { IJobSourceConnector } from './types.js';

// Connectors
import { RemoteOkConnector } from './remoteok.js';
import { RemotiveConnector } from './remotive.js';
import { JobicyConnector } from './jobicy.js';
import { GreenhouseAtsConnector } from './greenhouse.js';
import { HimalayasConnector } from './himalayas.js';
import { LeverAtsConnector } from './lever.js';
import { AshbyAtsConnector } from './ashby.js';
import { WorkableAtsConnector } from './workable.js';
import { SmartRecruitersConnector } from './smartrecruiters.js';
import { YCombinatorStartupsConnector } from './ycombinator.js';
import { DirectCareersConnector } from './direct-careers.js';
import { AdzunaConnector } from './adzuna.js';
import { USAJobsConnector } from './usajobs.js';

export interface DiscoveryScanReport {
  totalDiscovered: number;
  newVacancies: number;
  duplicateVacancies: number;
  verifiedActive: number;
  indiaEligible: number;
  sourcesQueried: string[];
  sourcesSucceeded: string[];
  sourcesFailed: { sourceId: string; error: string }[];
  countriesSearched: string[];
  durationMs: number;
  timestamp: string;
}

export class DiscoveryManager {
  private connectors: IJobSourceConnector[];
  private db: DatabaseManager;

  constructor(db: DatabaseManager, customConnectors?: IJobSourceConnector[]) {
    this.db = db;
    this.connectors = customConnectors || [
      new RemoteOkConnector(),
      new RemotiveConnector(),
      new JobicyConnector(),
      new GreenhouseAtsConnector(),
      new HimalayasConnector(),
      new LeverAtsConnector(),
      new AshbyAtsConnector(),
      new WorkableAtsConnector(),
      new SmartRecruitersConnector(),
      new YCombinatorStartupsConnector(),
      new DirectCareersConnector(),
      new AdzunaConnector(),
      new USAJobsConnector(),
    ];
  }

  /**
   * Transforms a raw job payload into a canonical Vacancy entity, running deduplication & verification.
   */
  processRawPayload(payload: RawJobPayload): { vacancy: Vacancy; inserted: boolean } {
    const normUrl = normalizeJobUrl(payload.sourceUrl);
    const normTitle = normalizeJobTitle(payload.title);
    const canonicalHash = computeCanonicalHash(
      payload.companyName,
      payload.title,
      normUrl,
      payload.locationText,
      payload.sourceId,
      payload.sourceType,
      (payload as any).requisitionId
    );

    // Verify content & regional eligibility
    const verification = VacancyVerificationAgent.verifyContent(
      payload.rawDescription,
      payload.locationText,
      200
    );

    const isContract = payload.employmentType === 'contract' || 
      payload.employmentType === 'freelance' || 
      /contract|freelance/i.test(payload.title);

    // Compute Early Applicant status (published <= 48 hours ago with trustworthy publication evidence)
    let isEarlyApplicant = false;
    if (payload.publishedAt) {
      const publishedTime = new Date(payload.publishedAt).getTime();
      if (!isNaN(publishedTime)) {
        const hoursSincePublished = (Date.now() - publishedTime) / (1000 * 60 * 60);
        isEarlyApplicant = hoursSincePublished >= 0 && hoursSincePublished <= 48;
      }
    }

    // Standardize Country and Region
    const countryInfo = normalizeCountryAndRegion(payload.locationText);
    const country = countryInfo.countryName;

    // Classify Remote Eligibility
    const remoteType = classifyRemoteEligibility(payload.locationText, payload.rawDescription, payload.isRemote);
    const isRemote = remoteType !== 'ONSITE';

    // Categorize Role Taxonomy across all IT Tech roles
    let category = 'Software Engineering';
    const titleLower = payload.title.toLowerCase();
    if (/sre|site reliability/i.test(titleLower)) {
      category = 'SRE';
    } else if (/devsecops/i.test(titleLower)) {
      category = 'DevSecOps';
    } else if (/cybersecurity|infosec|security engineer/i.test(titleLower)) {
      category = 'Cybersecurity';
    } else if (/platform/i.test(titleLower)) {
      category = 'Platform Engineer';
    } else if (/infrastructure|cloud infra/i.test(titleLower)) {
      category = 'Cloud Infrastructure';
    } else if (/kubernetes|k8s/i.test(titleLower)) {
      category = 'Kubernetes';
    } else if (/devops/i.test(titleLower)) {
      category = 'DevOps';
    } else if (/full[\s-]?stack/i.test(titleLower)) {
      category = 'Full-Stack';
    } else if (/frontend|front[\s-]?end|ui[\s-]?developer|react|vue|angular/i.test(titleLower)) {
      category = 'Frontend';
    } else if (/backend|back[\s-]?end|api engineer|node|golang|python developer|java developer/i.test(titleLower)) {
      category = 'Backend';
    } else if (/machine learning|\bml\b|artificial intelligence|\bai\b|llm|deep learning|data scientist/i.test(titleLower)) {
      category = 'AI & Machine Learning';
    } else if (/data engineer|data platform|etl|bigquery|snowflake|databricks/i.test(titleLower)) {
      category = 'Data Engineering';
    } else if (/mobile|ios|android|flutter|react native|swift|kotlin/i.test(titleLower)) {
      category = 'Mobile';
    } else if (/qa|quality assurance|sdet|test automation/i.test(titleLower)) {
      category = 'QA & Automation';
    } else if (/software|engineer|developer/i.test(titleLower)) {
      category = 'Software Engineering';
    }

    const vacancy: Vacancy = {
      id: randomUUID(),
      canonicalHash,
      sourceType: payload.sourceType,
      sourceUrl: payload.sourceUrl,
      alternateUrls: [payload.sourceUrl],
      companyName: payload.companyName,
      title: payload.title,
      normalizedTitle: normTitle,
      locationText: payload.locationText,
      isRemote,
      acceptsIndia: verification.acceptsIndia,
      employmentType: payload.employmentType || (isContract ? 'contract' : 'full-time'),
      salaryMin: payload.salaryMin,
      salaryMax: payload.salaryMax,
      currency: payload.currency || 'USD',
      rawDescription: payload.rawDescription,
      publishedAt: payload.publishedAt || new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: verification.lastChecked,
      status: verification.isVerified ? 'VERIFIED' : 'EXPIRED',
      isContractOrFreelance: isContract,
      isEarlyApplicant,
      isSaved: false,
      country,
      category,
    };

    const res = this.db.insertOrUpdateVacancy(vacancy);
    return { vacancy, inserted: res.inserted };
  }

  /**
   * Executes a multi-source discovery scan across configured connectors.
   */
  async runDiscoveryScan(options?: {
    limitPerSource?: number;
    country?: string;
    tags?: string[];
    sourceIds?: string[];
  }): Promise<DiscoveryScanReport> {
    const startTime = Date.now();
    const limit = options?.limitPerSource ?? 20;
    const country = options?.country;
    const tags = options?.tags;

    let activeConnectors = this.connectors;
    if (options?.sourceIds && options.sourceIds.length > 0) {
      activeConnectors = this.connectors.filter(c => 
        options.sourceIds!.includes(c.sourceType) || options.sourceIds!.includes(c.name.toLowerCase())
      );
    }

    // Check enabled status in database
    activeConnectors = activeConnectors.filter(c => {
      const dbSource = this.db.getSource(c.sourceType);
      return !dbSource || dbSource.isEnabled !== false;
    });

    const sourcesQueried: string[] = [];
    const sourcesSucceeded: string[] = [];
    const sourcesFailed: { sourceId: string; error: string }[] = [];
    const countriesSearchedSet = new Set<string>();

    if (country) countriesSearchedSet.add(country.toUpperCase());
    else countriesSearchedSet.add('GLOBAL');

    let totalDiscovered = 0;
    let newVacancies = 0;
    let duplicateVacancies = 0;
    let verifiedActive = 0;
    let indiaEligible = 0;

    logger.info(`Starting multi-source job discovery scan across ${activeConnectors.length} connectors...`);

    // Run connectors with bounded parallelism
    const scanPromises = activeConnectors.map(async (connector) => {
      const sId = connector.sourceType;
      sourcesQueried.push(sId);
      let retrievedCount = 0;
      let validCount = 0;
      let dupCount = 0;

      try {
        const rawJobs = await connector.fetchVacancies({ limit, country, tags });
        retrievedCount = rawJobs.length;

        for (const raw of rawJobs) {
          const { vacancy, inserted } = this.processRawPayload(raw);
          if (inserted) {
            validCount++;
            if (vacancy.status === 'VERIFIED') verifiedActive++;
            if (vacancy.acceptsIndia) indiaEligible++;
          } else {
            dupCount++;
          }
        }

        totalDiscovered += retrievedCount;
        newVacancies += validCount;
        duplicateVacancies += dupCount;
        sourcesSucceeded.push(sId);

        // Update database source sync telemetry
        this.db.recordSourceSync(sId, retrievedCount, validCount, dupCount, true);
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        logger.error(`Error executing discovery for ${connector.name}: ${errMsg}`);
        sourcesFailed.push({ sourceId: sId, error: errMsg });
        this.db.recordSourceSync(sId, 0, 0, 0, false, errMsg);
      }
    });

    await Promise.allSettled(scanPromises);

    const durationMs = Date.now() - startTime;
    const report: DiscoveryScanReport = {
      totalDiscovered,
      newVacancies,
      duplicateVacancies,
      verifiedActive,
      indiaEligible,
      sourcesQueried,
      sourcesSucceeded,
      sourcesFailed,
      countriesSearched: Array.from(countriesSearchedSet),
      durationMs,
      timestamp: new Date().toISOString(),
    };

    logger.info(`Discovery scan completed in ${durationMs}ms: Discovered=${totalDiscovered}, New=${newVacancies}, Duplicates=${duplicateVacancies}, Verified=${verifiedActive}, IndiaEligible=${indiaEligible}`);
    return report;
  }
}
