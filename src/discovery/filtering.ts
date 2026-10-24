import type { 
  Vacancy, 
  JobFilterCriteria, 
  FilterExclusionStats, 
  WorkArrangement, 
  ExperienceLevel,
  UserProfile 
} from '../types/index.js';
import { computeCanonicalHash } from './deduplication.js';

export interface AvailableFilterOptions {
  workArrangements: Array<{ value: WorkArrangement | 'all'; label: string; count: number }>;
  experienceLevels: Array<{ value: ExperienceLevel; label: string; count: number }>;
  employmentTypes: Array<{ value: string; label: string; count: number }>;
  roles: Array<{ role: string; count: number }>;
  topSkills: Array<{ skill: string; category: string; count: number }>;
  countries: Array<{ code: string; name: string; count: number }>;
  cities: Array<{ name: string; count: number }>;
  sources: Array<{ id: string; name: string; count: number }>;
  salaryRange: { min: number; max: number; currencies: string[] };
}

/**
 * Standard annualizer for different compensation periods.
 */
export function normalizeSalaryToAnnual(amount: number, period?: string): number {
  if (!amount || amount <= 0) return 0;
  switch (period?.toLowerCase()) {
    case 'hourly':
      return amount * 2080; // 40 hrs * 52 weeks
    case 'daily':
      return amount * 260; // 5 days * 52 weeks
    case 'monthly':
      return amount * 12;
    case 'contract':
    case 'annual':
    default:
      return amount;
  }
}

/**
 * Resolves the work arrangement of a vacancy based on explicit property or inference.
 */
export function inferWorkArrangement(vacancy: Vacancy): WorkArrangement {
  if (vacancy.workArrangement) return vacancy.workArrangement;
  
  const text = `${vacancy.title} ${vacancy.locationText} ${vacancy.rawDescription || ''}`.toLowerCase();
  if (text.includes('hybrid')) return 'hybrid';
  if (vacancy.isRemote || text.includes('remote') || text.includes('telecommute') || text.includes('work from home') || text.includes('wfh')) {
    return 'remote';
  }
  if (text.includes('flexible')) return 'flexible';
  if (text.includes('onsite') || text.includes('on-site') || text.includes('in-office') || text.includes('office-based')) {
    return 'onsite';
  }
  if (vacancy.locationText && vacancy.locationText.trim().length > 0 && !vacancy.locationText.toLowerCase().includes('remote')) {
    return 'onsite';
  }
  return 'unknown';
}

/**
 * Infers years of experience required from parsed requirements, text, or title.
 */
export function inferExperienceYears(vacancy: Vacancy): { min?: number; max?: number } {
  if (vacancy.minExperienceYears !== undefined || vacancy.maxExperienceYears !== undefined) {
    return { min: vacancy.minExperienceYears, max: vacancy.maxExperienceYears };
  }
  if (vacancy.parsedRequirements?.yearsExperienceRequired !== undefined) {
    return { min: vacancy.parsedRequirements.yearsExperienceRequired };
  }
  
  const text = `${vacancy.title} ${vacancy.rawDescription || ''}`.toLowerCase();
  // Match patterns like "3-5 years", "3 to 5 years", "5+ years", "minimum 3 years"
  const rangeMatch = text.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:\+)?\s*years/i);
  if (rangeMatch) {
    return { min: parseInt(rangeMatch[1], 10), max: parseInt(rangeMatch[2], 10) };
  }
  const minMatch = text.match(/(?:at least|minimum|min|requires?)\s*(\d+)\s*(?:\+)?\s*years/i) || text.match(/(\d+)\+\s*years/i);
  if (minMatch) {
    return { min: parseInt(minMatch[1], 10) };
  }
  return {};
}

/**
 * Maps experience seniority level to standard enum.
 */
export function inferExperienceLevel(vacancy: Vacancy): ExperienceLevel {
  if (vacancy.experienceLevel) return vacancy.experienceLevel;
  if (vacancy.parsedRequirements?.seniority) {
    const s = vacancy.parsedRequirements.seniority.toLowerCase();
    if (s.includes('intern')) return 'internship';
    if (s.includes('entry') || s.includes('graduate')) return 'entry-level';
    if (s.includes('junior') || s.includes('assoc')) return 'junior';
    if (s.includes('mid')) return 'mid-level';
    if (s.includes('senior') || s.includes('sr')) return 'senior';
    if (s.includes('lead')) return 'lead';
    if (s.includes('principal')) return 'principal';
    if (s.includes('staff')) return 'staff';
    if (s.includes('director')) return 'director';
    if (s.includes('manager')) return 'manager';
  }

  const title = vacancy.title.toLowerCase();
  if (title.includes('intern')) return 'internship';
  if (title.includes('director')) return 'director';
  if (title.includes('manager')) return 'manager';
  if (title.includes('principal')) return 'principal';
  if (title.includes('staff')) return 'staff';
  if (title.includes('lead') || title.includes('team lead')) return 'lead';
  if (title.includes('senior') || title.includes('sr.') || title.includes('sr ')) return 'senior';
  if (title.includes('junior') || title.includes('jr.') || title.includes('jr ') || title.includes('associate')) return 'junior';
  if (title.includes('entry') || title.includes('graduate')) return 'entry-level';
  if (title.includes('mid') || title.includes('ii') || title.includes('level 2')) return 'mid-level';
  
  return 'not-specified';
}

/**
 * Filter vacancies against rich user-configurable criteria with transparent exclusion accounting.
 */
export function filterVacancies(
  vacancies: Vacancy[],
  filters: JobFilterCriteria = {},
  candidateProfile?: UserProfile
): { matching: Vacancy[]; stats: FilterExclusionStats } {
  const stats: FilterExclusionStats = {
    totalRetrieved: vacancies.length,
    totalDeduplicated: 0,
    totalMatching: 0,
    qualifyingScoreCount: 0,
    excludedByWorkArrangement: 0,
    excludedByLocation: 0,
    excludedByRole: 0,
    excludedByExperience: 0,
    excludedBySalary: 0,
    excludedBySkills: 0,
    excludedByEmploymentType: 0,
    excludedByCompany: 0,
    excludedByDate: 0,
    excludedByScore: 0,
    excludedByEligibility: 0,
    failedSources: []
  };

  // 1. Cross-source Deduplication
  const seenHashes = new Set<string>();
  const deduplicated: Vacancy[] = [];
  for (const v of vacancies) {
    const hash = v.canonicalHash || computeCanonicalHash(v.companyName, v.title, v.sourceUrl, v.locationText);
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      deduplicated.push(v);
    }
  }
  stats.totalDeduplicated = deduplicated.length;

  const matching: Vacancy[] = [];

  for (const job of deduplicated) {
    // Stage 1: Work Arrangement Filter
    if (filters.workArrangements && filters.workArrangements.length > 0) {
      const isAll = filters.workArrangements.includes('all');
      if (!isAll) {
        const arrangement = inferWorkArrangement(job);
        const matchesArrangement = filters.workArrangements.includes(arrangement);
        if (!matchesArrangement) {
          stats.excludedByWorkArrangement++;
          continue;
        }
      }
    }

    // Stage 2: Location and Geographic Eligibility
    if (filters.country) {
      const qCountry = filters.country.trim().toLowerCase();
      const jobCountry = (job.country || '').toLowerCase();
      const jobLoc = (job.locationText || '').toLowerCase();
      const matchesCountry = jobCountry.includes(qCountry) || jobLoc.includes(qCountry) || 
        (qCountry === 'india' && job.acceptsIndia) ||
        (jobCountry === 'worldwide' || jobCountry === 'remote' || jobCountry === 'global');
      if (!matchesCountry) {
        stats.excludedByLocation++;
        continue;
      }
    }

    if (filters.city) {
      const qCity = filters.city.trim().toLowerCase();
      const jobLoc = (job.locationText || '').toLowerCase();
      if (!jobLoc.includes(qCity)) {
        stats.excludedByLocation++;
        continue;
      }
    }

    if (filters.locations && filters.locations.length > 0) {
      const jobLoc = `${job.locationText || ''} ${job.country || ''}`.toLowerCase();
      const matchesAnyLocation = filters.locations.some(loc => jobLoc.includes(loc.toLowerCase().trim()));
      if (!matchesAnyLocation) {
        stats.excludedByLocation++;
        continue;
      }
    }

    // Remote country eligibility check
    if (filters.remoteAllowedIn && filters.remoteAllowedIn.length > 0 && job.isRemote) {
      const text = `${job.locationText} ${job.rawDescription || ''}`.toLowerCase();
      // If restrictions are specified, candidate country must be accepted
      const candidateCountries = filters.remoteAllowedIn.map(c => c.toLowerCase());
      const hasExplicitDenial = candidateCountries.some(c => text.includes(`no ${c}`) || text.includes(`only us`) || text.includes(`us only`));
      const hasExplicitAllowance = candidateCountries.some(c => text.includes(c) || text.includes('worldwide') || text.includes('anywhere') || text.includes('global'));
      
      if (hasExplicitDenial && !hasExplicitAllowance) {
        stats.excludedByEligibility++;
        continue;
      }
    }

    // Visa sponsorship and relocation requirements
    if (filters.visaOrRelocation) {
      const text = `${job.rawDescription || ''} ${job.locationText || ''}`.toLowerCase();
      if (filters.visaOrRelocation.visaSponsorship) {
        const providesSponsorship = Boolean(job.visaSponsorship) || 
          text.includes('visa sponsorship') || 
          text.includes('visa sponsor') || 
          text.includes('sponsorship available') ||
          text.includes('will sponsor');
        const rejectsSponsorship = text.includes('no visa sponsorship') || 
          text.includes('unable to sponsor') || 
          text.includes('cannot sponsor') ||
          text.includes('not able to sponsor');
        if (!providesSponsorship || rejectsSponsorship) {
          stats.excludedByEligibility++;
          continue;
        }
      }

      if (filters.visaOrRelocation.relocationAssistance) {
        const providesRelocation = Boolean(job.relocationAssistance) || 
          text.includes('relocation assistance') || 
          text.includes('relocation package') ||
          text.includes('relocation support') ||
          text.includes('relocate to');
        if (!providesRelocation) {
          stats.excludedByEligibility++;
          continue;
        }
      }
    }

    // Stage 3: Job Title / Role / Keywords
    if (filters.roles && filters.roles.length > 0) {
      const titleLower = job.title.toLowerCase();
      const normTitle = (job.normalizedTitle || '').toLowerCase();
      const matchesRole = filters.roles.some(role => {
        const r = role.toLowerCase().trim();
        return titleLower.includes(r) || normTitle.includes(r);
      });
      if (!matchesRole) {
        stats.excludedByRole++;
        continue;
      }
    }

    if (filters.keywords && filters.keywords.trim().length > 0) {
      const terms = filters.keywords.toLowerCase().split(/\s+/).filter(Boolean);
      const searchable = `${job.title} ${job.companyName} ${job.rawDescription || ''}`.toLowerCase();
      const allTermsPresent = terms.every(t => searchable.includes(t));
      if (!allTermsPresent) {
        stats.excludedByRole++;
        continue;
      }
    }

    // Stage 4: Experience Level & Years
    if (filters.experienceLevels && filters.experienceLevels.length > 0) {
      const hasNotSpecified = filters.experienceLevels.includes('not-specified');
      const jobLevel = inferExperienceLevel(job);
      const levelMatches = filters.experienceLevels.includes(jobLevel) || 
        (hasNotSpecified && jobLevel === 'not-specified');
      if (!levelMatches) {
        stats.excludedByExperience++;
        continue;
      }
    }

    if (filters.minExperienceYears !== undefined || filters.maxExperienceYears !== undefined) {
      const exp = inferExperienceYears(job);
      if (exp.min !== undefined) {
        if (filters.maxExperienceYears !== undefined && exp.min > filters.maxExperienceYears) {
          stats.excludedByExperience++;
          continue;
        }
      }
      if (exp.max !== undefined) {
        if (filters.minExperienceYears !== undefined && exp.max < filters.minExperienceYears) {
          stats.excludedByExperience++;
          continue;
        }
      }
    }

    // Stage 5: Salary and Compensation
    if (filters.salary) {
      const hasDisclosedSalary = (job.salaryMin !== undefined && job.salaryMin !== null) || 
                                (job.salaryMax !== undefined && job.salaryMax !== null);

      // Undisclosed salary policy: Do not discard unless user explicitly enables requireDisclosed
      if (!hasDisclosedSalary) {
        if (filters.salary.requireDisclosed) {
          stats.excludedBySalary++;
          continue;
        }
        // Otherwise, undisclosed salaries pass!
      } else {
        const period = filters.salary.period || 'annual';
        const jobMinAnnual = normalizeSalaryToAnnual(job.salaryMin || 0, period);
        const jobMaxAnnual = normalizeSalaryToAnnual(job.salaryMax || job.salaryMin || 0, period);

        if (filters.salary.min !== undefined && filters.salary.min > 0) {
          const reqMinAnnual = normalizeSalaryToAnnual(filters.salary.min, period);
          if (jobMaxAnnual < reqMinAnnual) {
            stats.excludedBySalary++;
            continue;
          }
        }

        if (filters.salary.max !== undefined && filters.salary.max > 0) {
          const reqMaxAnnual = normalizeSalaryToAnnual(filters.salary.max, period);
          if (jobMinAnnual > reqMaxAnnual) {
            stats.excludedBySalary++;
            continue;
          }
        }

        if (filters.salary.currency && job.currency) {
          if (job.currency.toUpperCase() !== filters.salary.currency.toUpperCase()) {
            // If currency is explicitly required and doesn't match
            stats.excludedBySalary++;
            continue;
          }
        }
      }

      if (filters.salary.hasBonusOrEquity) {
        const text = `${job.rawDescription || ''}`.toLowerCase();
        const hasEquityOrBonus = text.includes('equity') || text.includes('stock') || text.includes('bonus') || text.includes('rsu');
        if (!hasEquityOrBonus) {
          stats.excludedBySalary++;
          continue;
        }
      }
    }

    // Stage 6: Technical Skills and Technologies
    if (filters.skills) {
      const text = `${job.title} ${job.rawDescription || ''} ${(job.parsedRequirements?.essentialSkills || []).join(' ')} ${(job.parsedRequirements?.preferredSkills || []).join(' ')}`.toLowerCase();

      // Excluded skills: immediate disqualifier
      if (filters.skills.excluded && filters.skills.excluded.length > 0) {
        const containsExcluded = filters.skills.excluded.some(skill => {
          const s = skill.toLowerCase().trim();
          return s.length > 0 && text.includes(s);
        });
        if (containsExcluded) {
          stats.excludedBySkills++;
          continue;
        }
      }

      // Must-have skills: all must be present
      if (filters.skills.mustHave && filters.skills.mustHave.length > 0) {
        const allMustHavePresent = filters.skills.mustHave.every(skill => {
          const s = skill.toLowerCase().trim();
          return s.length === 0 || text.includes(s);
        });
        if (!allMustHavePresent) {
          stats.excludedBySkills++;
          continue;
        }
      }

      // Preferred skills: if mode is 'any', at least one preferred skill should match if list provided
      if (filters.skills.preferred && filters.skills.preferred.length > 0 && filters.skills.mode === 'any') {
        const anyPreferredPresent = filters.skills.preferred.some(skill => {
          const s = skill.toLowerCase().trim();
          return s.length > 0 && text.includes(s);
        });
        if (!anyPreferredPresent && (!filters.skills.mustHave || filters.skills.mustHave.length === 0)) {
          stats.excludedBySkills++;
          continue;
        }
      }
    }

    // Stage 7: Employment Type
    if (filters.employmentTypes && filters.employmentTypes.length > 0) {
      const allowed = filters.employmentTypes.map(t => t.toLowerCase());
      const jobType = (job.employmentType || '').toLowerCase();
      const isContract = job.isContractOrFreelance;
      
      const matchesType = allowed.includes(jobType) ||
        (allowed.includes('contract') && isContract) ||
        (allowed.includes('freelance') && isContract) ||
        (allowed.includes('not-specified') && (!jobType || jobType === 'not-specified'));

      if (!matchesType) {
        stats.excludedByEmploymentType++;
        continue;
      }
    }

    // Stage 8: Company and Industry Filters
    if (filters.company) {
      const companyNameLower = job.companyName.toLowerCase();
      
      if (filters.company.names && filters.company.names.length > 0) {
        const matchesName = filters.company.names.some(n => companyNameLower.includes(n.toLowerCase().trim()));
        if (!matchesName) {
          stats.excludedByCompany++;
          continue;
        }
      }

      if (filters.company.excludedCompanies && filters.company.excludedCompanies.length > 0) {
        const isExcluded = filters.company.excludedCompanies.some(n => companyNameLower.includes(n.toLowerCase().trim()));
        if (isExcluded) {
          stats.excludedByCompany++;
          continue;
        }
      }

      if (filters.company.excludeDismissed && (job.status === 'ARCHIVED' || job.status === 'EXPIRED')) {
        stats.excludedByCompany++;
        continue;
      }
    }

    // Stage 9: Posting Date and Freshness
    if (filters.postingDate) {
      const pubDate = new Date(job.publishedAt || job.discoveredAt).getTime();
      const now = Date.now();
      const ageHours = (now - pubDate) / (1000 * 60 * 60);

      if (filters.postingDate.preset && filters.postingDate.preset !== 'all') {
        let maxHours = 720; // 30d default
        switch (filters.postingDate.preset) {
          case '24h': maxHours = 24; break;
          case '3d': maxHours = 72; break;
          case '7d': maxHours = 168; break;
          case '14d': maxHours = 336; break;
          case '30d': maxHours = 720; break;
        }
        if (ageHours > maxHours) {
          stats.excludedByDate++;
          continue;
        }
      }

      if (filters.postingDate.startDate) {
        const start = new Date(filters.postingDate.startDate).getTime();
        if (pubDate < start) {
          stats.excludedByDate++;
          continue;
        }
      }

      if (filters.postingDate.endDate) {
        const end = new Date(filters.postingDate.endDate).getTime();
        if (pubDate > end) {
          stats.excludedByDate++;
          continue;
        }
      }
    }

    // Stage 10: Sources
    if (filters.sources && filters.sources.length > 0) {
      const src = (job.sourceType || '').toLowerCase();
      const matchesSource = filters.sources.some(s => s.toLowerCase() === src);
      if (!matchesSource) {
        // Excluded by source filter
        continue;
      }
    }

    // Stage 11: Additional Filters
    if (filters.additional) {
      if (filters.additional.verifiedOnly && job.status !== 'VERIFIED') {
        continue;
      }
      if (filters.additional.earlyApplicantOnly && !job.isEarlyApplicant) {
        const ageHours = (Date.now() - new Date(job.discoveredAt).getTime()) / (1000 * 60 * 60);
        if (ageHours > 48) {
          continue;
        }
      }
      if (filters.additional.savedOnly && !job.isSaved) {
        continue;
      }
    }

    // Stage 12: Resume Match Score Threshold
    const minThreshold = filters.matchScore?.min !== undefined ? filters.matchScore.min : 75.0;
    let score = 75.0;
    if (typeof job.matchScore === 'number') {
      score = job.matchScore;
    } else if (job.matchScore && typeof (job.matchScore as any).overallScore === 'number') {
      score = (job.matchScore as any).overallScore;
    } else if (job.matchEvaluation?.overallScore !== undefined) {
      score = job.matchEvaluation.overallScore;
    }

    // Exact threshold boundary: A score of 75 passes a 75 threshold; 74 fails.
    if (score < minThreshold) {
      stats.excludedByScore++;
      continue;
    }

    stats.qualifyingScoreCount++;
    matching.push(job);
  }

  stats.totalMatching = matching.length;
  return { matching, stats };
}

/**
 * Extracts available dynamic filter options from a list of vacancies.
 */
export function getAvailableFilterOptions(vacancies: Vacancy[]): AvailableFilterOptions {
  const arrangementCounts: Record<string, number> = {
    all: vacancies.length,
    remote: 0,
    hybrid: 0,
    onsite: 0,
    flexible: 0,
    unknown: 0
  };

  const experienceCounts: Record<string, number> = {};
  const employmentCounts: Record<string, number> = {};
  const roleCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};
  const cityCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const skillCounts: Record<string, number> = {};

  let minSalary = Infinity;
  let maxSalary = 0;
  const currencies = new Set<string>();

  for (const v of vacancies) {
    // Work arrangement
    const arr = inferWorkArrangement(v);
    arrangementCounts[arr] = (arrangementCounts[arr] || 0) + 1;

    // Experience level
    const exp = inferExperienceLevel(v);
    experienceCounts[exp] = (experienceCounts[exp] || 0) + 1;

    // Employment type
    const emp = v.employmentType || 'not-specified';
    employmentCounts[emp] = (employmentCounts[emp] || 0) + 1;

    // Role
    const normTitle = v.normalizedTitle || v.title;
    roleCounts[normTitle] = (roleCounts[normTitle] || 0) + 1;

    // Country
    if (v.country) {
      countryCounts[v.country] = (countryCounts[v.country] || 0) + 1;
    }

    // City / Location
    if (v.locationText) {
      const parts = v.locationText.split(',').map(p => p.trim());
      if (parts[0] && parts[0].length > 1) {
        cityCounts[parts[0]] = (cityCounts[parts[0]] || 0) + 1;
      }
    }

    // Source
    if (v.sourceType) {
      sourceCounts[v.sourceType] = (sourceCounts[v.sourceType] || 0) + 1;
    }

    // Salary
    if (v.salaryMin && v.salaryMin > 0) {
      minSalary = Math.min(minSalary, v.salaryMin);
      maxSalary = Math.max(maxSalary, v.salaryMin);
    }
    if (v.salaryMax && v.salaryMax > 0) {
      maxSalary = Math.max(maxSalary, v.salaryMax);
    }
    if (v.currency) {
      currencies.add(v.currency.toUpperCase());
    }

    // Skills
    const skills = [
      ...(v.parsedRequirements?.essentialSkills || []),
      ...(v.parsedRequirements?.preferredSkills || [])
    ];
    if (skills.length === 0 && v.rawDescription) {
      const KNOWN_TECH = ['AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker', 'Terraform', 'Linux', 'Python', 'Go', 'Bash', 'CI/CD', 'GitOps', 'Prometheus', 'Grafana', 'Ansible', 'DevSecOps', 'Argo CD'];
      for (const t of KNOWN_TECH) {
        if (new RegExp(`\\b${t}\\b`, 'i').test(v.rawDescription)) {
          skills.push(t);
        }
      }
    }
    for (const s of skills) {
      const key = s.trim();
      if (key.length > 1) {
        skillCounts[key] = (skillCounts[key] || 0) + 1;
      }
    }
  }

  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([skill, count]) => ({ skill, category: 'General', count }));

  const roles = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([role, count]) => ({ role, count }));

  const countries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([code, count]) => ({ code, name: code, count }));

  const cities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const sources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, name: id.toUpperCase(), count }));

  return {
    workArrangements: [
      { value: 'all', label: 'All work arrangements', count: vacancies.length },
      { value: 'remote', label: 'Remote', count: arrangementCounts.remote || 0 },
      { value: 'hybrid', label: 'Hybrid', count: arrangementCounts.hybrid || 0 },
      { value: 'onsite', label: 'Onsite', count: arrangementCounts.onsite || 0 },
      { value: 'flexible', label: 'Flexible', count: arrangementCounts.flexible || 0 },
      { value: 'unknown', label: 'Unknown / Not specified', count: arrangementCounts.unknown || 0 }
    ],
    experienceLevels: Object.entries(experienceCounts).map(([value, count]) => ({
      value: value as ExperienceLevel,
      label: value.charAt(0).toUpperCase() + value.slice(1).replace('-', ' '),
      count
    })),
    employmentTypes: Object.entries(employmentCounts).map(([value, count]) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
      count
    })),
    roles,
    topSkills,
    countries,
    cities,
    sources,
    salaryRange: {
      min: minSalary === Infinity ? 0 : minSalary,
      max: maxSalary,
      currencies: Array.from(currencies)
    }
  };
}
