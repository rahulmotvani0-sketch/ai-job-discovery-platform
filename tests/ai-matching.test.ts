import { describe, it, expect } from 'vitest';
import { OllamaProvider } from '../src/ai/providers/ollama.js';
import { ModelRouter } from '../src/ai/providers/router.js';
import { JobDescriptionAnalysisAgent } from '../src/ai/agents/job-analyzer.js';
import { JobMatchingAgent } from '../src/ai/agents/matcher.js';
import { DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES } from '../src/core/profile.js';
import type { Vacancy } from '../src/types/index.js';

describe('Phase 4: AI Intelligence & Scoring Engine Tests', () => {
  it('should detect local Ollama availability or return false gracefully without crashing', async () => {
    const ollama = new OllamaProvider({ timeoutMs: 2000 });
    const available = await ollama.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('should route embedding tasks to local provider and respect cloud-disabled mode', async () => {
    const router = new ModelRouter({ cloudDisabled: true });
    const selected = await router.selectProvider('SEMANTIC_EMBEDDING');
    if (selected) {
      expect(selected.isLocal).toBe(true);
    }
  });

  it('should extract structured requirements deterministically from raw description', () => {
    const raw = `
      We are hiring a Senior DevOps Engineer.
      Requirements:
      - 3+ years of experience with Kubernetes, Docker, and Terraform.
      - Experience building CI/CD pipelines with GitHub Actions or GitLab CI.
      - Strong knowledge of AWS cloud services and Prometheus monitoring.
      - Compensation: $110,000 - $140,000 USD.
    `;

    const extracted = JobDescriptionAnalysisAgent.extractDeterministic(raw, 'Senior DevOps Engineer');
    expect(extracted.seniority).toBe('Senior');
    expect(extracted.essentialSkills).toContain('Kubernetes');
    expect(extracted.essentialSkills).toContain('Terraform');
    expect(extracted.essentialSkills).toContain('AWS');
    expect(extracted.essentialSkills).toContain('GitHub Actions');
    expect(extracted.yearsExperienceRequired).toBe(3);
    expect(extracted.salaryEvidence).toContain('$110,000');
  });

  it('should award high match score (>=80) for well-aligned remote DevOps position', () => {
    const matchedVacancy: Vacancy = {
      id: 'vac_high_match',
      canonicalHash: 'hash_high_match',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/jobs/devops-k8s',
      alternateUrls: ['https://remoteok.com/jobs/devops-k8s'],
      companyName: 'CloudScale Global',
      title: 'DevOps Engineer (Remote)',
      normalizedTitle: 'devops engineer',
      locationText: 'Remote (Worldwide)',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time',
      salaryMin: 100000,
      salaryMax: 130000,
      currency: 'USD',
      rawDescription: 'Seeking DevOps engineer with Terraform, Kubernetes, Helm, and AWS experience.',
      parsedRequirements: {
        summary: 'DevOps engineer with Kubernetes and Terraform.',
        seniority: 'Mid',
        essentialSkills: ['Terraform', 'Kubernetes', 'AWS', 'Docker', 'CI/CD'],
        preferredSkills: ['Prometheus', 'Helm'],
        responsibilities: ['Build Terraform IaC', 'Manage Kubernetes clusters'],
        yearsExperienceRequired: 3,
        locationRestrictions: [],
        acceptsCandidatesInIndia: true,
      },
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
    };

    const evaluation = JobMatchingAgent.evaluateMatch(matchedVacancy, DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES);
    expect(evaluation.overallScore).toBeGreaterThanOrEqual(80);
    expect(['Strong', 'Excellent']).toContain(evaluation.tier);
    expect(evaluation.matchingSkills).toContain('Terraform');
    expect(evaluation.matchingSkills).toContain('Kubernetes');
    expect(evaluation.evidenceExplanation).toContain('4+ years satisfies the required');
    expect(evaluation.categoryScores.locationRemote).toBe(10);
  });

  it('should strictly cap match score (<50) if position excludes India residents', () => {
    const restrictedVacancy: Vacancy = {
      id: 'vac_us_only',
      canonicalHash: 'hash_us_only',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/jobs/us-devops',
      alternateUrls: ['https://remoteok.com/jobs/us-devops'],
      companyName: 'US Gov Tech',
      title: 'DevOps Engineer',
      normalizedTitle: 'devops engineer',
      locationText: 'Remote (US Citizens Only)',
      isRemote: true,
      acceptsIndia: false, // Ineligible for India candidates
      employmentType: 'full-time',
      rawDescription: 'DevOps with Terraform and Kubernetes. Must be US citizen located in USA.',
      parsedRequirements: {
        summary: 'US only DevOps position',
        seniority: 'Mid',
        essentialSkills: ['Terraform', 'Kubernetes', 'AWS'],
        preferredSkills: [],
        responsibilities: [],
        yearsExperienceRequired: 3,
        locationRestrictions: ['US Only'],
        acceptsCandidatesInIndia: false,
      },
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
    };

    const evaluation = JobMatchingAgent.evaluateMatch(restrictedVacancy, DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES);
    expect(evaluation.overallScore).toBeLessThanOrEqual(50);
    expect(evaluation.tier).toBe('Deprioritized');
    expect(evaluation.categoryScores.locationRemote).toBe(0);
    expect(evaluation.evidenceExplanation).toContain('excludes India or requires domestic residency');
  });
});
