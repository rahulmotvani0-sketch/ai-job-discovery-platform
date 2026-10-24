/**
 * Core Domain Types for AI-Powered Job Discovery & Application Automation Platform
 */

export type SeniorityLevel = 'Junior' | 'Mid' | 'Senior' | 'Lead' | 'Principal';

export type EmploymentType = 'full-time' | 'contract' | 'freelance' | 'part-time' | 'internship';

export type VacancyStatus = 
  | 'DISCOVERED'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'ANALYZED'
  | 'QUALIFIED'
  | 'DEPRIORITIZED'
  | 'DRAFTED'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'SUBMITTED'
  | 'REJECTED'
  | 'INTERVIEWING'
  | 'OFFER'
  | 'ARCHIVED'
  | 'IGNORED';

export interface WorkExperience {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
  achievements: string[];
  skillsUsed: string[];
}

export interface UserProfile {
  id: string;
  fullName: string;
  title?: string;
  email: string;
  phone: string;
  location: string;
  portfolioUrl: string;
  githubUrl: string;
  linkedinUrl: string;
  summary: string;
  experiences: WorkExperience[];
  skills: {
    cloudPlatforms: string[];
    infrastructureAsCode: string[];
    containersAndOrchestration: string[];
    ciCdAndGitOps: string[];
    devSecOpsAndSecurity: string[];
    observabilityAndMonitoring: string[];
    programmingAndScripting: string[];
    languagesAndFrameworks?: string[];
    networkingAndAdmin: string[];
    [category: string]: string[] | undefined;
  };
  certifications: string[];
  education: Array<{
    degree: string;
    institution: string;
    year?: string;
  }>;
}

export interface JobPreferences {
  targetRoles: Array<{ title: string; weight: number }>;
  minExperienceYears: number;
  maxExperienceYears: number;
  minCompensationInrLpa: number;
  prioritizeRemote: boolean;
  allowHybrid: boolean;
  baseCountry: string; // "India"
  eligibleCountries: string[];
  searchInternational: boolean;
  dailyQualifiedTarget: number;
  hourlyDiscoveryEnabled: boolean;
  minMatchScore?: number; // Default 75
}

export interface RawJobPayload {
  sourceId: string;
  sourceType: 
    | 'remoteok' 
    | 'remotive'
    | 'jobicy' 
    | 'himalayas' 
    | 'greenhouse' 
    | 'lever' 
    | 'ashby' 
    | 'workable' 
    | 'smartrecruiters'
    | 'recruitee'
    | 'ycombinator' 
    | 'direct_careers'
    | 'direct_portal' 
    | 'adzuna'
    | 'usajobs'
    | 'other'
    | string;
  sourceUrl: string;
  companyName: string;
  title: string;
  locationText: string;
  rawDescription: string;
  publishedAt?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  employmentType?: EmploymentType;
  isRemote?: boolean;
  requisitionId?: string;
  department?: string;
}

export interface Vacancy {
  id: string;
  canonicalHash: string;
  sourceType: string;
  sourceUrl: string;
  alternateUrls: string[];
  companyName: string;
  title: string;
  normalizedTitle: string;
  locationText: string;
  isRemote: boolean;
  acceptsIndia: boolean;
  employmentType: EmploymentType;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  rawDescription: string;
  parsedRequirements?: ParsedJobRequirements;
  publishedAt: string;
  discoveredAt: string;
  lastVerifiedAt: string;
  status: VacancyStatus;
  isContractOrFreelance: boolean;
  isEarlyApplicant?: boolean;
  isSaved?: boolean;
  category?: string;
  country?: string;
  workArrangement?: WorkArrangement;
  experienceLevel?: ExperienceLevel;
  minExperienceYears?: number;
  maxExperienceYears?: number;
  visaSponsorship?: boolean;
  relocationAssistance?: boolean;
  matchScore?: number | MatchScoreEvaluation;
  matchEvaluation?: MatchScoreEvaluation;
}

export interface ParsedJobRequirements {
  summary: string;
  seniority: SeniorityLevel;
  essentialSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  yearsExperienceRequired?: number;
  locationRestrictions: string[];
  acceptsCandidatesInIndia: boolean;
  salaryEvidence?: string;
  visaOrTaxNotes?: string;
}

export interface MatchScoreEvaluation {
  id: string;
  vacancyId: string;
  overallScore: number; // 0 - 100
  qualifies75?: boolean; // True if overallScore >= minScoreThreshold (default 75.00)
  mandatoryBlockers?: string[];
  tier: 'Excellent' | 'Strong' | 'Possible' | 'Deprioritized'; // >=85, 70-84, 55-69, <55
  categoryScores: {
    technicalSkills: number; // max 30
    experienceSeniority: number; // max 20
    responsibilities: number; // max 15
    cloudInfrastructure: number; // max 10
    locationRemote: number; // max 10
    compensation: number; // max 10
    otherRequirements: number; // max 5
  };
  matchingSkills: string[];
  missingSkills: string[];
  evidenceExplanation: string;
  evaluatedAt: string;
}

export type DiscoveryStep =
  | 'RESUME_UPLOADED'
  | 'EXTRACTING_RESUME_INFO'
  | 'ANALYZING_CANDIDATE_PROFILE'
  | 'SEARCHING_JOB_SOURCES'
  | 'EVALUATING_JOB_MATCHES'
  | 'SAVING_QUALIFYING_JOBS'
  | 'SEARCH_COMPLETED'
  | 'FAILED';

export interface DiscoveryRun {
  id: string;
  triggerType: 'RESUME_UPLOAD' | 'MANUAL' | 'SCHEDULED';
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  currentStep: DiscoveryStep;
  stepMessage: string;
  totalSourcesSearched: number;
  discoveredCount: number;
  evaluatedCount: number;
  qualifiedCount: number; // >= 75%
  minScoreThreshold: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface ApplicationDraft {
  id: string;
  vacancyId: string;
  sendingAccountId?: string;
  recipientEmail: string;
  subjectLine: string;
  emailBody: string;
  coverLetter?: string;
  tailoredResumePath: string;
  tailoredPdfPath?: string;
  screeningAnswers?: Record<string, string>;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED_BY_USER' | 'SUBMITTED';
  createdAt: string;
  reviewedAt?: string;
  approvedBy?: string;
  notes?: string;
}

export interface ConnectedAccount {
  id: string;
  email: string;
  displayName?: string;
  provider: 'google';
  accessToken?: string;
  refreshToken?: string;
  grantedScopes: string[];
  isPrimary: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'ERROR';
  lastSyncedAt?: string;
  syncError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LLMConfiguration {
  id: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'ollama' | 'custom';
  endpoint?: string;
  apiKey?: string;
  availableModels: string[];
  defaultModel: string;
  requestTimeoutMs: number;
  maxOutputTokens: number;
  isEnabled: boolean;
  taskPreferences?: Record<string, string>;
  lastTestStatus?: 'SUCCESS' | 'AUTH_FAILED' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'ERROR';
  lastTestAt?: string;
  lastError?: string;
  totalTokensUsed: number;
  createdAt: string;
  updatedAt: string;
}

export type InferenceMode = 'local-only' | 'cloud-only' | 'hybrid';


export interface ApplicationSubmission {
  id: string;
  draftId: string;
  vacancyId: string;
  sentAt: string;
  approvedBy: string; // "user"
  channel: 'GMAIL_API' | 'CAREER_PORTAL' | 'MANUAL';
  gmailMessageId?: string;
  gmailThreadId?: string;
  status: 'SENT' | 'DELIVERY_CONFIRMED' | 'REPLY_RECEIVED' | 'INTERVIEW_INVITE' | 'REJECTED';
  sheetsRowIndex?: number;
  auditHash: string;
}
export type RecruiterIntent = 
  | 'INTERVIEW_INVITATION' 
  | 'TECHNICAL_ASSESSMENT' 
  | 'AVAILABILITY_REQUEST' 
  | 'INFORMATION_REQUEST' 
  | 'OFFER' 
  | 'REJECTION' 
  | 'ACKNOWLEDGEMENT' 
  | 'ASSESSMENT_LINK' 
  | 'OTHER';

export interface RecruiterInteraction {
  id: string;
  submissionId: string;
  threadId: string;
  messageId: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  detectedIntent: RecruiterIntent;
  actionRequired: boolean;
  actionDetails?: string;
  receivedAt: string;
  companyName?: string;
  jobTitle?: string;
  candidateAvailabilityOptions?: string[];
  replyStatus?: 'NONE' | 'DRAFTED' | 'APPROVED' | 'SENT' | 'DISMISSED';
  sentReplyAt?: string;
  replyMessageId?: string;
}

export interface InterviewFollowUpDraft {
  id: string;
  interactionId: string;
  submissionId?: string;
  recipientEmail: string;
  companyName: string;
  jobTitle: string;
  intent: RecruiterIntent;
  subject: string;
  body: string;
  suggestedSlots: string[];
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'DISMISSED';
  approvedAt?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SchedulingPreferences {
  timezone: string;
  workingDays: string[];
  timeWindows: { start: string; end: string }[];
  meetingPlatforms: string[];
  noticeHours: number;
  meetingDurationMinutes: number;
}

// ==========================================
// Advanced Job Search Filters & Saved Searches
// ==========================================

export type WorkArrangement = 'all' | 'remote' | 'hybrid' | 'onsite' | 'flexible' | 'unknown';

export type ExperienceLevel = 
  | 'internship' 
  | 'entry-level' 
  | 'junior' 
  | 'mid-level' 
  | 'senior' 
  | 'lead' 
  | 'principal' 
  | 'staff' 
  | 'manager' 
  | 'director' 
  | 'not-specified';

export interface JobFilterCriteria {
  workArrangements?: WorkArrangement[];
  locations?: string[];
  country?: string;
  city?: string;
  remoteAllowedIn?: string[];
  visaOrRelocation?: {
    visaSponsorship?: boolean;
    relocationAssistance?: boolean;
    internationalRelocation?: boolean;
    workAuthorizationRequired?: string;
  };
  roles?: string[];
  keywords?: string;
  experienceLevels?: ExperienceLevel[];
  minExperienceYears?: number;
  maxExperienceYears?: number;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
    period?: 'annual' | 'monthly' | 'daily' | 'hourly' | 'contract';
    requireDisclosed?: boolean; // If false (default), undisclosed salaries are NOT discarded
    hasBonusOrEquity?: boolean;
  };
  matchScore?: {
    min?: number; // 0 - 100, default 75
    max?: number; // default 100
  };
  skills?: {
    mustHave?: string[];
    preferred?: string[];
    excluded?: string[];
    mode?: 'all' | 'any';
  };
  employmentTypes?: Array<EmploymentType | 'not-specified'>;
  company?: {
    names?: string[];
    excludedCompanies?: string[];
    companyTypes?: Array<'startup' | 'sme' | 'enterprise'>;
    isDirectEmployer?: boolean;
    excludeApplied?: boolean;
    excludeDismissed?: boolean;
  };
  postingDate?: {
    preset?: '24h' | '3d' | '7d' | '14d' | '30d' | 'all';
    startDate?: string;
    endDate?: string;
    recentlyUpdated?: boolean;
  };
  sources?: string[];
  sourceCategories?: string[];
  additional?: {
    easyApply?: boolean;
    verifiedOnly?: boolean;
    earlyApplicantOnly?: boolean;
    savedOnly?: boolean;
    notPreviouslyViewed?: boolean;
  };
}

export interface FilterExclusionStats {
  totalRetrieved: number;
  totalDeduplicated: number;
  totalMatching: number;
  qualifyingScoreCount: number;
  excludedByWorkArrangement: number;
  excludedByLocation: number;
  excludedByRole: number;
  excludedByExperience: number;
  excludedBySalary: number;
  excludedBySkills: number;
  excludedByEmploymentType: number;
  excludedByCompany: number;
  excludedByDate: number;
  excludedByScore: number;
  excludedByEligibility: number;
  failedSources: Array<{ sourceId: string; error: string }>;
}

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  filters: JobFilterCriteria;
  isDefault: boolean;
  alertsEnabled: boolean;
  scheduledSearchEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastResultsCount?: number;
}

