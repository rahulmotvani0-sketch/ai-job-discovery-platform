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
};

export const DEFAULT_USER_PROFILE: UserProfile = {
  id: process.env.USER_ID || 'primary_candidate',
  fullName: process.env.USER_FULL_NAME || 'Tech Professional',
  email: process.env.USER_EMAIL || 'candidate@example.com',
  phone: process.env.USER_PHONE || '+1-555-0100',
  location: process.env.USER_LOCATION || 'Global / Remote (Open to Relocation)',
  portfolioUrl: process.env.USER_PORTFOLIO_URL || 'https://example.com',
  githubUrl: process.env.USER_GITHUB_URL || 'https://github.com',
  linkedinUrl: process.env.USER_LINKEDIN_URL || 'https://linkedin.com',
  summary: 'Senior Software & Infrastructure Engineer with 4+ years of hands-on production experience architecting scalable distributed systems, cloud infrastructure (AWS/GCP/Azure), container orchestration with Kubernetes, CI/CD automation, and modern web applications. Passionate about software reliability, developer tooling, and intelligent automation.',
  experiences: [
    {
      company: 'High-Growth Tech Enterprise',
      role: 'Senior Software / DevOps Engineer',
      startDate: '2023-01',
      endDate: 'Present',
      location: 'Remote',
      achievements: [
        'Architected multi-cloud infrastructure on AWS, Azure, and GCP using modular Terraform, standardizing provisioning and eliminating manual configuration drift.',
        'Engineered CI/CD pipelines with GitHub Actions and GitLab CI with SAST and SCA quality gates blocking vulnerable merges.',
        'Containerized and orchestrated production microservices on Kubernetes with Helm, enforcing resource limits, rolling updates, and high availability.',
        'Hardened cloud security posture by implementing least-privilege IAM policies, network segmentation, secrets rotation, and automated vulnerability scanning.',
        'Built observability stack with Prometheus, Grafana dashboards, and structured logging, reducing MTTR and enabling proactive incident alerts.'
      ],
      skillsUsed: ['TypeScript', 'Node.js', 'Python', 'Terraform', 'Kubernetes', 'AWS', 'GCP', 'GitHub Actions', 'Docker', 'Prometheus', 'Grafana']
    },
    {
      company: 'Cloud & Systems Solutions',
      role: 'Systems & Infrastructure Engineer',
      startDate: '2021-06',
      endDate: '2022-12',
      location: 'Hybrid',
      achievements: [
        'Administered cloud and on-premises infrastructure, managing Linux systems, virtualization, and networking for engineering teams.',
        'Automated repetitive server provisioning, testing, and deployment workflows with Bash and Python scripts.',
        'Collaborated with cross-functional development teams to diagnose and resolve networking, access control, and deployment bottlenecks.'
      ],
      skillsUsed: ['Linux Administration', 'Python', 'Bash', 'Networking', 'Docker', 'CI/CD']
    }
  ],
  skills: {
    cloudPlatforms: ['AWS (EC2, S3, RDS, Lambda, ECS, EKS, IAM, VPC, CloudWatch)', 'GCP (GKE, Cloud Storage, Cloud Run)', 'Azure (AKS, Blob, VNet)'],
    infrastructureAsCode: ['Terraform', 'Terragrunt', 'CloudFormation'],
    containersAndOrchestration: ['Docker', 'Kubernetes', 'Helm', 'ArgoCD'],
    ciCdAndGitOps: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'ArgoCD'],
    programmingAndScripting: ['TypeScript', 'JavaScript', 'Python', 'Go', 'Bash', 'SQL', 'Rust'],
    languagesAndFrameworks: ['TypeScript', 'JavaScript', 'Python', 'Go', 'React', 'Node.js', 'Next.js', 'SQL'],
    devSecOpsAndSecurity: ['SonarQube (SAST)', 'Snyk (SCA)', 'Aqua Trivy', 'IAM Least Privilege', 'Secrets Management'],
    observabilityAndMonitoring: ['Prometheus', 'Grafana', 'ELK Stack', 'OpenTelemetry', 'Datadog'],
    networkingAndAdmin: ['Linux (Ubuntu, Debian, RHEL)', 'DNS', 'VLANs', 'Firewalls', 'VPNs']
  },
  certifications: [
    'Cloud & Infrastructure Architecture Certifications',
    'Kubernetes Certified Professional'
  ],
  education: [
    {
      degree: 'Bachelor of Technology / Engineering in Information Technology',
      institution: 'University Engineering Department',
      year: '2022'
    }
  ]
};

export function loadAuthoritativeProfile(customResumePath?: string): UserProfile {
  const masterPath = customResumePath || process.env.CUSTOM_RESUME_PATH;
  if (masterPath && existsSync(masterPath)) {
    try {
      const content = readFileSync(masterPath, 'utf-8');
      logger.info(`Loaded authoritative resume from ${masterPath} (${content.length} bytes)`);
      return DEFAULT_USER_PROFILE;
    } catch (err) {
      logger.warn(`Could not read master resume file, using default profile: ${err}`);
    }
  }
  return DEFAULT_USER_PROFILE;
}
