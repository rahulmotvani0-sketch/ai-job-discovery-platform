import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { filterVacancies, getAvailableFilterOptions, inferWorkArrangement } from '../src/discovery/filtering.js';
import { listAllConnectorCapabilities, getConnectorCapabilities } from '../src/discovery/capabilities.js';
import type { Vacancy, JobFilterCriteria, SavedSearch } from '../src/types/index.js';
import { randomUUID } from 'node:crypto';

describe('Advanced Job Search Filters and Preferences', () => {
  let db: DatabaseManager;

  const mockVacancies: Vacancy[] = [
    {
      id: 'job_remote_1',
      canonicalHash: 'hash_remote_1',
      sourceType: 'remotive',
      sourceUrl: 'https://remotive.com/jobs/1',
      alternateUrls: [],
      companyName: 'CloudScale Inc',
      title: 'DevOps Engineer',
      normalizedTitle: 'devops engineer',
      locationText: 'Remote, Worldwide',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time',
      salaryMin: 120000,
      salaryMax: 150000,
      currency: 'USD',
      rawDescription: 'Kubernetes, AWS, Terraform, Docker, CI/CD with GitHub Actions.',
      publishedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
      workArrangement: 'remote',
      experienceLevel: 'senior',
      minExperienceYears: 5,
      visaSponsorship: true,
      matchScore: 85
    },
    {
      id: 'job_onsite_ahmedabad',
      canonicalHash: 'hash_onsite_1',
      sourceType: 'adzuna',
      sourceUrl: 'https://adzuna.in/jobs/2',
      alternateUrls: [],
      companyName: 'InfraTech Ltd',
      title: 'Senior DevOps Engineer',
      normalizedTitle: 'senior devops engineer',
      locationText: 'Ahmedabad, Gujarat, India',
      country: 'India',
      isRemote: false,
      acceptsIndia: true,
      employmentType: 'full-time',
      salaryMin: 1800000,
      salaryMax: 2400000,
      currency: 'INR',
      rawDescription: 'Onsite infrastructure engineer in Ahmedabad. Managing AWS, Docker, Linux, Bash, Prometheus.',
      publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
      workArrangement: 'onsite',
      experienceLevel: 'senior',
      minExperienceYears: 6,
      matchScore: 80
    },
    {
      id: 'job_hybrid_london',
      canonicalHash: 'hash_hybrid_1',
      sourceType: 'smartrecruiters',
      sourceUrl: 'https://smartrecruiters.com/jobs/3',
      alternateUrls: [],
      companyName: 'FinTech UK',
      title: 'Platform Engineer',
      normalizedTitle: 'platform engineer',
      locationText: 'London, UK (Hybrid 2 days)',
      country: 'United Kingdom',
      isRemote: false,
      acceptsIndia: false,
      employmentType: 'full-time',
      salaryMin: 85000,
      salaryMax: 95000,
      currency: 'GBP',
      rawDescription: 'Hybrid platform engineering with Azure, Terraform, Argo CD, Kubernetes.',
      publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(), // 5 days ago
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
      workArrangement: 'hybrid',
      experienceLevel: 'mid-level',
      minExperienceYears: 3,
      relocationAssistance: true,
      matchScore: 75
    },
    {
      id: 'job_remote_marginal_score',
      canonicalHash: 'hash_marginal_1',
      sourceType: 'direct_careers',
      sourceUrl: 'https://careers.example.com/jobs/4',
      alternateUrls: [],
      companyName: 'StartUp Alpha',
      title: 'Cloud Security Engineer',
      normalizedTitle: 'cloud security engineer',
      locationText: 'Remote, US Only',
      isRemote: true,
      acceptsIndia: false,
      employmentType: 'contract',
      salaryMin: undefined, // Undisclosed salary
      salaryMax: undefined,
      currency: undefined,
      rawDescription: 'Cloud Security Engineer with GCP, DevSecOps, IAM, vulnerability management. No visa sponsorship provided.',
      publishedAt: new Date(Date.now() - 86400000 * 10).toISOString(), // 10 days ago
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: true,
      workArrangement: 'remote',
      experienceLevel: 'senior',
      minExperienceYears: 4,
      visaSponsorship: false,
      matchScore: 74 // Notice: exactly 74 (fails 75 threshold)
    },
    {
      id: 'job_remote_duplicate_1',
      canonicalHash: 'hash_remote_1', // Duplicate of job_remote_1
      sourceType: 'adzuna',
      sourceUrl: 'https://adzuna.com/jobs/cross-posted-1',
      alternateUrls: [],
      companyName: 'CloudScale Inc',
      title: 'DevOps Engineer',
      normalizedTitle: 'devops engineer',
      locationText: 'Remote',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time',
      salaryMin: 120000,
      salaryMax: 150000,
      currency: 'USD',
      rawDescription: 'Duplicate cross-post of the same position.',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
      workArrangement: 'remote',
      matchScore: 85
    }
  ];

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // Scenario 1: Remote-only filters return only eligible remote jobs
  it('Scenario 1: Remote-only filters return only qualifying remote jobs', () => {
    const { matching } = filterVacancies(mockVacancies, {
      workArrangements: ['remote'],
      matchScore: { min: 50 } // allow to test work arrangement
    });
    expect(matching.length).toBeGreaterThan(0);
    for (const job of matching) {
      expect(inferWorkArrangement(job)).toBe('remote');
    }
  });

  // Scenario 2: Onsite-only filters return only qualifying onsite jobs
  it('Scenario 2: Onsite-only filters return only qualifying onsite jobs', () => {
    const { matching } = filterVacancies(mockVacancies, {
      workArrangements: ['onsite'],
      matchScore: { min: 50 }
    });
    expect(matching.length).toBe(1);
    expect(matching[0].id).toBe('job_onsite_ahmedabad');
    expect(inferWorkArrangement(matching[0])).toBe('onsite');
  });

  // Scenario 3: Hybrid-only filters return only qualifying hybrid jobs
  it('Scenario 3: Hybrid-only filters return only qualifying hybrid jobs', () => {
    const { matching } = filterVacancies(mockVacancies, {
      workArrangements: ['hybrid'],
      matchScore: { min: 50 }
    });
    expect(matching.length).toBe(1);
    expect(matching[0].id).toBe('job_hybrid_london');
    expect(inferWorkArrangement(matching[0])).toBe('hybrid');
  });

  // Scenario 4: Selecting multiple work arrangements returns their combined qualifying results
  it('Scenario 4: Selecting multiple work arrangements returns their union', () => {
    const { matching } = filterVacancies(mockVacancies, {
      workArrangements: ['remote', 'hybrid'],
      matchScore: { min: 50 }
    });
    const ids = matching.map(j => j.id);
    expect(ids).toContain('job_remote_1');
    expect(ids).toContain('job_hybrid_london');
    expect(ids).not.toContain('job_onsite_ahmedabad');
  });

  // Scenario 5: Country and city filters behave correctly
  it('Scenario 5: Country and city filters match precisely', () => {
    const { matching: ahmedabadJobs } = filterVacancies(mockVacancies, {
      city: 'Ahmedabad'
    });
    expect(ahmedabadJobs.length).toBe(1);
    expect(ahmedabadJobs[0].id).toBe('job_onsite_ahmedabad');

    const { matching: londonJobs } = filterVacancies(mockVacancies, {
      country: 'United Kingdom'
    });
    expect(londonJobs.length).toBe(1);
    expect(londonJobs[0].id).toBe('job_hybrid_london');
  });

  // Scenario 6: The default all-arrangements setting does not exclude jobs solely because they are onsite
  it('Scenario 6: Default all-arrangements does not exclude onsite jobs', () => {
    const { matching } = filterVacancies(mockVacancies, {
      workArrangements: ['all']
    });
    const ids = matching.map(j => j.id);
    expect(ids).toContain('job_onsite_ahmedabad');
  });

  // Scenario 7: A score of 75 passes a 75 threshold
  it('Scenario 7: A score of exactly 75 passes a 75 threshold', () => {
    const { matching } = filterVacancies(mockVacancies, {
      matchScore: { min: 75 }
    });
    const score75Job = matching.find(j => j.id === 'job_hybrid_london');
    expect(score75Job).toBeDefined();
    expect(score75Job?.matchScore).toBe(75);
  });

  // Scenario 8: A score of 74 fails a 75 threshold
  it('Scenario 8: A score of 74 fails a 75 threshold', () => {
    const { matching, stats } = filterVacancies(mockVacancies, {
      matchScore: { min: 75 }
    });
    const score74Job = matching.find(j => j.id === 'job_remote_marginal_score');
    expect(score74Job).toBeUndefined();
    expect(stats.excludedByScore).toBeGreaterThanOrEqual(1);
  });

  // Scenario 9: Changing the threshold updates results correctly
  it('Scenario 9: Lowering threshold to 70 allows the 74 score job', () => {
    const { matching } = filterVacancies(mockVacancies, {
      matchScore: { min: 70 }
    });
    const score74Job = matching.find(j => j.id === 'job_remote_marginal_score');
    expect(score74Job).toBeDefined();
  });

  // Scenario 10: Minimum and maximum salary filters work with normalized compensation
  it('Scenario 10: Salary filters match within specified bounds', () => {
    const { matching } = filterVacancies(mockVacancies, {
      salary: {
        min: 100000,
        max: 160000,
        currency: 'USD',
        requireDisclosed: true
      }
    });
    expect(matching.length).toBe(1);
    expect(matching[0].id).toBe('job_remote_1');
  });

  // Scenario 11: Missing salary information follows configured policy
  it('Scenario 11: Undisclosed salary is kept by default, excluded only if requireDisclosed is true', () => {
    // Default: requireDisclosed false -> job with undisclosed salary should pass salary check
    const { matching: defaultPass } = filterVacancies(mockVacancies, {
      matchScore: { min: 70 },
      salary: { min: 50000, requireDisclosed: false }
    });
    expect(defaultPass.some(j => j.id === 'job_remote_marginal_score')).toBe(true);

    // requireDisclosed true -> job with undisclosed salary must be excluded
    const { matching: explicitExcluded, stats } = filterVacancies(mockVacancies, {
      matchScore: { min: 70 },
      salary: { min: 50000, requireDisclosed: true }
    });
    expect(explicitExcluded.some(j => j.id === 'job_remote_marginal_score')).toBe(false);
    expect(stats.excludedBySalary).toBeGreaterThanOrEqual(1);
  });

  // Scenario 12: Must-have and preferred skills are handled separately
  it('Scenario 12: Must-have skills require presence, excluded skills disqualify', () => {
    const { matching: terraformJobs } = filterVacancies(mockVacancies, {
      skills: {
        mustHave: ['Terraform']
      }
    });
    expect(terraformJobs.length).toBeGreaterThan(0);
    for (const j of terraformJobs) {
      expect(j.rawDescription.toLowerCase()).toContain('terraform');
    }

    const { matching: excludedGcp } = filterVacancies(mockVacancies, {
      matchScore: { min: 70 },
      skills: {
        excluded: ['GCP']
      }
    });
    expect(excludedGcp.some(j => j.id === 'job_remote_marginal_score')).toBe(false);
  });

  // Scenario 13: Multiple job sources produce deduplicated results
  it('Scenario 13: Duplicate jobs cross-posted on multiple sources are deduplicated', () => {
    const { stats } = filterVacancies(mockVacancies, { matchScore: { min: 50 } });
    expect(stats.totalRetrieved).toBe(5);
    expect(stats.totalDeduplicated).toBe(4); // 1 duplicate eliminated
  });

  // Scenario 14: Saved searches persist in database
  it('Scenario 14: Saved searches persist across database retrieval', () => {
    const search: SavedSearch = {
      id: randomUUID(),
      userId: 'test_user_1',
      name: 'Remote DevOps Jobs',
      filters: { workArrangements: ['remote'], roles: ['DevOps Engineer'] },
      isDefault: true,
      alertsEnabled: true,
      scheduledSearchEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.saveSavedSearch(search);
    const retrieved = db.getSavedSearch(search.id, 'test_user_1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Remote DevOps Jobs');
    expect(retrieved?.filters.workArrangements).toEqual(['remote']);
    expect(retrieved?.isDefault).toBe(true);
  });

  // Scenario 15: Editing one saved search does not modify another
  it('Scenario 15: Editing one saved search does not mutate another', () => {
    const search1: SavedSearch = {
      id: randomUUID(),
      userId: 'test_user_1',
      name: 'Search 1',
      filters: { roles: ['SRE'] },
      isDefault: false,
      alertsEnabled: false,
      scheduledSearchEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const search2: SavedSearch = {
      id: randomUUID(),
      userId: 'test_user_1',
      name: 'Search 2',
      filters: { roles: ['Platform Engineer'] },
      isDefault: false,
      alertsEnabled: false,
      scheduledSearchEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.saveSavedSearch(search1);
    db.saveSavedSearch(search2);

    // Update search 1
    db.saveSavedSearch({ ...search1, name: 'Renamed Search 1', filters: { roles: ['Cloud Architect'] } });

    const fresh1 = db.getSavedSearch(search1.id, 'test_user_1');
    const fresh2 = db.getSavedSearch(search2.id, 'test_user_1');

    expect(fresh1?.name).toBe('Renamed Search 1');
    expect(fresh2?.name).toBe('Search 2');
    expect(fresh2?.filters.roles).toEqual(['Platform Engineer']);
  });

  // Scenario 16: Invalid filter values are rejected or safely normalized
  it('Scenario 16: Empty and undefined filters do not crash the engine', () => {
    const { matching, stats } = filterVacancies(mockVacancies, {});
    expect(matching.length).toBeGreaterThan(0);
    expect(stats.totalRetrieved).toBe(5);
  });

  // Scenario 17: Unauthorized users cannot access another user's saved searches
  it('Scenario 17: User isolation in saved searches prevents cross-user access', () => {
    const userASearch: SavedSearch = {
      id: randomUUID(),
      userId: 'user_alice',
      name: 'Alice Secret Search',
      filters: { keywords: 'confidential' },
      isDefault: false,
      alertsEnabled: true,
      scheduledSearchEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.saveSavedSearch(userASearch);

    // Bob tries to access Alice's saved search
    const bobAttempt = db.getSavedSearch(userASearch.id, 'user_bob');
    expect(bobAttempt).toBeNull();

    // Bob tries to delete Alice's saved search
    const bobDelete = db.deleteSavedSearch(userASearch.id, 'user_bob');
    expect(bobDelete).toBe(false);

    // Verify search still exists for Alice
    const aliceFetch = db.getSavedSearch(userASearch.id, 'user_alice');
    expect(aliceFetch).not.toBeNull();
  });

  // Scenario 18: Duplicating a saved search creates an independent copy
  it('Scenario 18: Duplicating a search profile creates an independent copy', () => {
    const original: SavedSearch = {
      id: randomUUID(),
      userId: 'user_1',
      name: 'DevOps Ahmedabad',
      filters: { city: 'Ahmedabad', roles: ['DevOps Engineer'] },
      isDefault: false,
      alertsEnabled: false,
      scheduledSearchEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.saveSavedSearch(original);
    const copy = db.duplicateSavedSearch(original.id, 'DevOps Ahmedabad (Copy)', 'user_1');
    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe(original.id);
    expect(copy?.name).toBe('DevOps Ahmedabad (Copy)');
    expect(copy?.filters.city).toBe('Ahmedabad');
  });

  // Scenario 19: Connector filter capabilities registry declared accurately
  it('Scenario 19: Connector capabilities registry exposes native vs local filters', () => {
    const capabilities = listAllConnectorCapabilities();
    expect(capabilities.length).toBeGreaterThanOrEqual(10);

    const remotiveCap = getConnectorCapabilities('remotive');
    expect(remotiveCap).toBeDefined();
    expect(remotiveCap?.supportsNativeWorkArrangement).toBe(true);
    expect(remotiveCap?.localFilteringApplied).toContain('salary');

    const adzunaCap = getConnectorCapabilities('adzuna');
    expect(adzunaCap).toBeDefined();
    expect(adzunaCap?.supportsNativeSalaryFilter).toBe(true);
    expect(adzunaCap?.supportsNativeLocation).toBe(true);
  });

  // Scenario 20: Empty search results display accurate stats rather than fabricating results
  it('Scenario 20: Unmatched filters report 0 results truthfully with exclusion reasons', () => {
    const { matching, stats } = filterVacancies(mockVacancies, {
      city: 'NonExistentCityXYZ'
    });
    expect(matching.length).toBe(0);
    expect(stats.totalMatching).toBe(0);
    expect(stats.excludedByLocation).toBe(4); // All 4 unique jobs excluded by location
  });

  // Scenario 21: Geographic remote eligibility and visa sponsorship verification
  it('Scenario 21: Jobs rejecting visa sponsorship are excluded when visa sponsorship is required', () => {
    const { matching: sponsoredOnly } = filterVacancies(mockVacancies, {
      matchScore: { min: 50 },
      visaOrRelocation: { visaSponsorship: true }
    });
    // Job 1 provides sponsorship; Job 4 explicitly denies sponsorship
    const ids = sponsoredOnly.map(j => j.id);
    expect(ids).toContain('job_remote_1');
    expect(ids).not.toContain('job_remote_marginal_score');
  });

  // Scenario 22: Available filter options are dynamically computed
  it('Scenario 22: getAvailableFilterOptions extracts dynamic counts and categories', () => {
    const options = getAvailableFilterOptions(mockVacancies);
    expect(options.workArrangements).toBeDefined();
    expect(options.workArrangements.some(w => w.value === 'remote' && w.count > 0)).toBe(true);
    expect(options.cities.some(c => c.name === 'Ahmedabad')).toBe(true);
    expect(options.topSkills.length).toBeGreaterThan(0);
  });

  // Scenario 23: Default saved search switching
  it('Scenario 23: Setting a saved search as default unsets previous default', () => {
    const searchA: SavedSearch = {
      id: randomUUID(),
      userId: 'user_default_test',
      name: 'Search A',
      filters: {},
      isDefault: true,
      alertsEnabled: false,
      scheduledSearchEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const searchB: SavedSearch = {
      id: randomUUID(),
      userId: 'user_default_test',
      name: 'Search B',
      filters: {},
      isDefault: false,
      alertsEnabled: false,
      scheduledSearchEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.saveSavedSearch(searchA);
    db.saveSavedSearch(searchB);

    db.setDefaultSavedSearch(searchB.id, 'user_default_test');

    const freshA = db.getSavedSearch(searchA.id, 'user_default_test');
    const freshB = db.getSavedSearch(searchB.id, 'user_default_test');

    expect(freshA?.isDefault).toBe(false);
    expect(freshB?.isDefault).toBe(true);
  });

  // Scenario 24: Record saved search run updates timestamp and counts
  it('Scenario 24: Recording search run updates lastRunAt and lastResultsCount', () => {
    const search: SavedSearch = {
      id: randomUUID(),
      userId: 'user_run_test',
      name: 'Search Run',
      filters: {},
      isDefault: false,
      alertsEnabled: false,
      scheduledSearchEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.saveSavedSearch(search);
    db.recordSavedSearchRun(search.id, 12, 'user_run_test');

    const updated = db.getSavedSearch(search.id, 'user_run_test');
    expect(updated?.lastResultsCount).toBe(12);
    expect(updated?.lastRunAt).toBeDefined();
  });
});
