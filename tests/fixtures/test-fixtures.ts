import type { Vacancy, UserProfile, RecruiterInteraction } from '../../src/types/index.js';

/**
 * Isolated deterministic fixtures used solely for automated testing.
 * These fixtures are never seeded or loaded into the production application database.
 */

export const TEST_VACANCY: Vacancy = {
  id: 'test-vacancy-001',
  canonicalHash: 'test-hash-001',
  sourceType: 'manual',
  sourceUrl: 'https://example.com/jobs/001',
  alternateUrls: [],
  companyName: 'Test Company',
  title: 'Senior DevOps / SRE',
  normalizedTitle: 'senior devops sre',
  locationText: 'Remote (Worldwide)',
  isRemote: true,
  acceptsIndia: true,
  employmentType: 'FULL_TIME',
  salaryMin: 120000,
  salaryMax: 150000,
  currency: 'USD',
  rawDescription: 'Seeking Senior DevOps and SRE to operate Kubernetes, multi-region AWS cloud infrastructure, Terraform, and observability stack.',
  discoveredAt: new Date().toISOString(),
  lastVerifiedAt: new Date().toISOString(),
  status: 'QUALIFIED',
  country: 'Worldwide',
  category: 'DevOps',
};

export const TEST_CANDIDATE_PROFILE: UserProfile = {
  id: 'test-candidate-001',
  fullName: 'Test Candidate',
  title: 'Senior DevOps & Platform Engineer',
  email: 'test.candidate@example.com',
  phone: '+1-555-0199',
  location: 'Remote',
  portfolioUrl: 'https://example.com',
  githubUrl: 'https://github.com/test-candidate',
  linkedinUrl: 'https://linkedin.com/in/test-candidate',
  summary: 'Senior DevOps and Platform Engineer with 4+ years of production experience in Kubernetes, AWS, Terraform, CI/CD, and distributed systems.',
  experiences: [
    {
      company: 'Test Enterprise',
      role: 'Senior DevOps Engineer',
      startDate: '2022-01',
      endDate: 'Present',
      location: 'Remote',
      achievements: [
        'Architected multi-region cloud infrastructure on AWS and GCP with Terraform.',
        'Engineered CI/CD pipelines with GitHub Actions and containerized workloads on Kubernetes.'
      ],
      skillsUsed: ['Kubernetes', 'AWS', 'Terraform', 'Docker', 'TypeScript', 'Node.js', 'Prometheus'],
    },
    {
      company: 'Cloud Systems Solutions',
      role: 'Platform Engineer',
      startDate: '2020-06',
      endDate: '2021-12',
      location: 'Remote',
      achievements: ['Maintained production Kubernetes clusters and automated CI/CD.'],
      skillsUsed: ['Kubernetes', 'Docker', 'Linux', 'Python', 'Bash'],
    },
  ],
  skills: {
    cloudPlatforms: ['AWS', 'GCP', 'Azure'],
    infrastructureAsCode: ['Terraform', 'Terragrunt'],
    containersAndOrchestration: ['Docker', 'Kubernetes', 'Helm'],
    ciCdAndGitOps: ['GitHub Actions', 'GitLab CI', 'ArgoCD'],
    programmingAndScripting: ['TypeScript', 'Node.js', 'Python', 'Go', 'Bash'],
    languagesAndFrameworks: ['TypeScript', 'Node.js', 'Python', 'Go'],
    devSecOpsAndSecurity: ['IAM Least Privilege', 'Trivy'],
    observabilityAndMonitoring: ['Prometheus', 'Grafana'],
    networkingAndAdmin: ['Linux', 'Ubuntu'],
  },
  education: [
    {
      degree: 'B.Tech in Computer Science',
      institution: 'University College of Engineering',
      year: '2020'
    }
  ],
  certifications: ['Kubernetes CKA', 'AWS Solutions Architect'],
};

export const TEST_RECRUITER_INTERACTION: RecruiterInteraction = {
  id: 'test-interaction-001',
  submissionId: 'test-sub-001',
  senderEmail: 'recruiter@example.com',
  companyName: 'Test Company',
  subject: 'Interview Schedule Invitation',
  snippet: 'We would love to schedule a preliminary conversation.',
  detectedIntent: 'INTERVIEW_INVITATION',
  receivedAt: new Date().toISOString(),
  threadId: 'test-thread-001',
  messageId: 'test-msg-001',
  actionRequired: true,
  replyStatus: 'NONE',
};
