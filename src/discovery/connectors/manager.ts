import { randomUUID } from 'node:crypto';
import { logger } from '../../core/logger.js';
import type { DatabaseManager } from '../../core/database.js';
import type { Vacancy, RawJobPayload } from '../../types/index.js';
import { normalizeJobUrl, normalizeJobTitle, computeCanonicalHash } from '../deduplication.js';
import { VacancyVerificationAgent } from '../verification.js';
import type { IJobSourceConnector } from './types.js';
import { RemoteOkConnector } from './remoteok.js';
import { JobicyConnector } from './jobicy.js';
import { GreenhouseAtsConnector } from './greenhouse.js';
import { HimalayasConnector } from './himalayas.js';
import { LeverAtsConnector } from './lever.js';
import { AshbyAtsConnector } from './ashby.js';
import { WorkableAtsConnector } from './workable.js';
import { YCombinatorStartupsConnector } from './ycombinator.js';

export interface DiscoveryScanReport {
  totalDiscovered: number;
  newVacancies: number;
  duplicateVacancies: number;
  verifiedActive: number;
  indiaEligible: number;
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
      new JobicyConnector(),
      new GreenhouseAtsConnector(),
      new HimalayasConnector(),
      new LeverAtsConnector(),
      new AshbyAtsConnector(),
      new WorkableAtsConnector(),
      new YCombinatorStartupsConnector(),
    ];
  }

  /**
   * Transforms a raw job payload into a canonical Vacancy entity, running deduplication & verification.
   */
  processRawPayload(payload: RawJobPayload): { vacancy: Vacancy; inserted: boolean } {
    const normUrl = normalizeJobUrl(payload.sourceUrl);
    const normTitle = normalizeJobTitle(payload.title);
    const canonicalHash = computeCanonicalHash(payload.companyName, payload.title, normUrl, payload.locationText);

    // Verify content & regional eligibility
    const verification = VacancyVerificationAgent.verifyContent(
      payload.rawDescription,
      payload.locationText,
      200
    );

    const isContract = payload.employmentType === 'contract' || 
      payload.employmentType === 'freelance' || 
      /contract|freelance/i.test(payload.title);

    // Compute Early Applicant status (published <= 48 hours ago)
    const publishedTime = new Date(payload.publishedAt || Date.now()).getTime();
    const hoursSincePublished = Math.max(0, (Date.now() - publishedTime) / (1000 * 60 * 60));
    const isEarlyApplicant = hoursSincePublished <= 48;

    // Normalize Country
    let country = 'Worldwide';
    const loc = (payload.locationText || '').toLowerCase();
    if (/india|bengaluru|bangalore|hyderabad|pune|delhi|mumbai|gurgaon|noida|ahmedabad/i.test(loc)) {
      country = 'India';
    } else if (/united states|usa|\bus\b|california|new york|texas|seattle/i.test(loc)) {
      country = 'United States';
    } else if (/united kingdom|\buk\b|london/i.test(loc)) {
      country = 'United Kingdom';
    } else if (/germany|berlin|munich/i.test(loc)) {
      country = 'Germany';
    } else if (/canada|toronto|vancouver/i.test(loc)) {
      country = 'Canada';
    } else if (/singapore/i.test(loc)) {
      country = 'Singapore';
    } else if (/australia|sydney|melbourne/i.test(loc)) {
      country = 'Australia';
    }

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
      isRemote: payload.isRemote ?? true,
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
   * Executes a multi-source discovery scan across all configured connectors.
   */
  async runDiscoveryScan(options?: { limitPerSource?: number }): Promise<DiscoveryScanReport> {
    const startTime = Date.now();
    const limit = options?.limitPerSource ?? 20;
    let totalDiscovered = 0;
    let newVacancies = 0;
    let duplicateVacancies = 0;
    let verifiedActive = 0;
    let indiaEligible = 0;

    logger.info(`Starting multi-source job discovery scan across ${this.connectors.length} connectors...`);

    for (const connector of this.connectors) {
      try {
        const rawJobs = await connector.fetchVacancies({ limit });
        totalDiscovered += rawJobs.length;

        for (const raw of rawJobs) {
          const { vacancy, inserted } = this.processRawPayload(raw);
          if (inserted) {
            newVacancies++;
            if (vacancy.status === 'VERIFIED') verifiedActive++;
            if (vacancy.acceptsIndia) indiaEligible++;
          } else {
            duplicateVacancies++;
          }
        }
      } catch (err) {
        logger.error(`Error executing discovery for ${connector.name}: ${err}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const report: DiscoveryScanReport = {
      totalDiscovered,
      newVacancies,
      duplicateVacancies,
      verifiedActive,
      indiaEligible,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    logger.info(`Discovery scan completed in ${durationMs}ms: Discovered=${totalDiscovered}, New=${newVacancies}, Duplicates=${duplicateVacancies}, Verified=${verifiedActive}, IndiaEligible=${indiaEligible}`);
    return report;
  }
}
