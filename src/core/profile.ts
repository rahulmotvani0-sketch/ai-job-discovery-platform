import { existsSync, readFileSync } from 'node:fs';
import { logger } from './logger.js';
import type { UserProfile, JobPreferences } from '../types/index.js';

export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  targetRoles: [
    { title: 'DevOps Engineer', weight: 0.15 },
    { title: 'Platform Engineer', weight: 0.15 },
    { title: 'Site Reliability Engineer / SRE I', weight: 0.10 },
    { title: 'DevSecOps Engineer', weight: 0.10 },
    { title: 'Full-Stack Engineer', weight: 0.15 },
    { title: 'Backend Software Engineer', weight: 0.15 },
    { title: 'Frontend Engineer', weight: 0.10 },
    { title: 'AI & Machine Learning Engineer', weight: 0.05 },
    { title: 'Data Engineer', weight: 0.05 },
  ],
  minExperienceYears: 1,
  maxExperienceYears: 8,
  minCompensationInrLpa: 12.0,
  prioritizeRemote: true,
  allowHybrid: true,
  baseCountry: process.env.USER_BASE_COUNTRY || 'India',
  eligibleCountries: [
    'India', 'United States', 'United Kingdom', 'Germany', 'Netherlands', 'Canada',
    'Australia', 'Singapore', 'United Arab Emirates', 'Saudi Arabia', 'Japan', 'South Korea', 'Remote'
  ],
  searchInternational: true,
  dailyQualifiedTarget: 10,
  hourlyDiscoveryEnabled: false,
  minMatchScore: 75.0,
};

export const EMPTY_USER_PROFILE: UserProfile = {
  id: process.env.USER_ID || 'primary_candidate',
  fullName: process.env.USER_FULL_NAME || '',
  title: process.env.USER_TITLE || '',
  email: process.env.USER_EMAIL || '',
  phone: process.env.USER_PHONE || '',
  location: process.env.USER_LOCATION || '',
  portfolioUrl: process.env.USER_PORTFOLIO_URL || '',
  githubUrl: process.env.USER_GITHUB_URL || '',
  linkedinUrl: process.env.USER_LINKEDIN_URL || '',
  summary: '',
  experiences: [],
  skills: {
    cloudPlatforms: [],
    infrastructureAsCode: [],
    containersAndOrchestration: [],
    ciCdAndGitOps: [],
    programmingAndScripting: [],
    languagesAndFrameworks: [],
    devSecOpsAndSecurity: [],
    observabilityAndMonitoring: [],
    networkingAndAdmin: []
  },
  certifications: [],
  education: []
};

export const DEFAULT_USER_PROFILE: UserProfile = EMPTY_USER_PROFILE;

export function loadAuthoritativeProfile(customResumePath?: string): UserProfile {
  const masterPath = customResumePath || process.env.CUSTOM_RESUME_PATH;
  if (masterPath && existsSync(masterPath)) {
    try {
      const content = readFileSync(masterPath, 'utf-8');
      logger.info(`Loaded authoritative resume from ${masterPath} (${content.length} bytes)`);
      // If JSON format, parse it
      if (masterPath.endsWith('.json')) {
        return JSON.parse(content) as UserProfile;
      }
      return {
        ...EMPTY_USER_PROFILE,
        summary: content.slice(0, 500)
      };
    } catch (err) {
      logger.warn(`Could not read master resume file: ${err}`);
    }
  }
  return EMPTY_USER_PROFILE;
}
