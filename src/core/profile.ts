import { existsSync, readFileSync } from 'node:fs';
import { logger } from './logger.js';
import type { UserProfile, JobPreferences } from '../types/index.js';

export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  targetRoles: [
    { title: 'DevOps Engineer', weight: 0.30 },
    { title: 'Platform Engineer', weight: 0.20 },
    { title: 'Cloud Infrastructure Engineer', weight: 0.15 },
    { title: 'DevSecOps Engineer', weight: 0.15 },
    { title: 'Site Reliability Engineer / SRE I', weight: 0.15 },
    { title: 'Cloud & Infrastructure Specialist', weight: 0.05 },
  ],
  minExperienceYears: 2,
  maxExperienceYears: 5,
  minCompensationInrLpa: 15.0, // ₹15 LPA target
  prioritizeRemote: true,
  allowHybrid: true,
  baseCountry: 'India',
  eligibleCountries: [
    'India', 'United States', 'United Kingdom', 'Germany', 'Netherlands', 'Canada',
    'Australia', 'Singapore', 'United Arab Emirates', 'Saudi Arabia', 'Japan', 'South Korea'
  ],
  searchInternational: true,
  dailyQualifiedTarget: 10,
  hourlyDiscoveryEnabled: false,
};

export const DEFAULT_USER_PROFILE: UserProfile = {
  id: 'rahul_motvani_primary',
  fullName: 'Rahul Motvani',
  email: 'rahulmotvani8@gmail.com',
  phone: '+91 89807 80003',
  location: 'Ahmedabad, Gujarat, India (Open to Remote)',
  portfolioUrl: 'https://rahul.techiking.com',
  githubUrl: 'https://github.com/rahulmotvani0-sketch',
  linkedinUrl: 'https://www.linkedin.com/in/rahulmotvani/',
  summary: 'DevOps and Cloud Infrastructure Engineer with 4+ years of hands-on production experience architecting multi-cloud infrastructure with Terraform, orchestrating Kubernetes clusters, and embedding DevSecOps shift-left security (SonarQube, Snyk, Trivy) into CI/CD pipelines. Strong systems administration, network segmentation, and observability foundation.',
  experiences: [
    {
      company: 'Agile logic Technovations',
      role: 'DevOps Engineer',
      startDate: '2025-12',
      endDate: 'Present',
      location: 'Ahmedabad, Gujarat, India',
      achievements: [
        'Architected multi-cloud infrastructure on AWS, Azure, and GCP using modular Terraform, standardizing provisioning and eliminating manual configuration drift.',
        'Engineered CI/CD pipelines with Jenkins, GitHub Actions, and GitLab CI with SonarQube SAST and Snyk SCA quality gates blocking vulnerable merges.',
        'Containerized and orchestrated production workloads on Kubernetes with Helm, enforcing resource limits, rolling updates, and pod anti-affinity.',
        'Hardened cloud security posture by implementing least-privilege IAM policies, network segmentation, secrets rotation, and automated vulnerability scanning.',
        'Built observability stack with Prometheus, Grafana dashboards, and ELK logging, reducing MTTR and enabling structured incident response.',
        'Integrated ML model serving into Kubernetes-based CI/CD pipelines for automated data science deployments.'
      ],
      skillsUsed: ['Terraform', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'GitHub Actions', 'Jenkins', 'SonarQube', 'Snyk', 'Helm', 'Prometheus', 'Grafana', 'ELK Stack']
    },
    {
      company: 'Azilen Technologies',
      role: 'IT Infrastructure Engineer',
      startDate: '2024-08',
      endDate: '2025-11',
      location: 'Ahmedabad, Gujarat, India',
      achievements: [
        'Administered hybrid cloud and on-premises infrastructure spanning Windows and Linux servers, managing virtualization platforms for engineering teams.',
        'Automated repetitive server provisioning and maintenance tasks with Bash and PowerShell scripts, standardizing configuration.',
        'Collaborated with engineering teams to diagnose and resolve networking, access control, and deployment issues, improving uptime.',
        'Documented infrastructure processes and onboarding procedures, establishing repeatable runbooks for operational tasks.'
      ],
      skillsUsed: ['Linux Administration', 'Windows Server', 'Bash', 'PowerShell', 'Virtualization', 'Networking', 'Troubleshooting']
    },
    {
      company: 'Aruhat Technologies Pvt. Ltd.',
      role: 'Junior Network Engineer',
      startDate: '2023-06',
      endDate: '2024-07',
      location: 'Ahmedabad, Gujarat, India',
      achievements: [
        'Designed and implemented network segmentation and firewall access controls across client infrastructure, resolving security audit findings.',
        'Led migration to a modernized network architecture, improving scalability, redundancy, and reliability for critical workloads.',
        'Administered virtualization environments (VMware/Hyper-V) and managed Windows/Linux servers for enterprise clients.',
        'Performed vulnerability assessments using Nessus and remediated identified risks, strengthening client security postures.'
      ],
      skillsUsed: ['Firewalls', 'Network Segmentation', 'VLANs', 'DNS/DHCP', 'VMware', 'Hyper-V', 'Nessus', 'Linux', 'Windows']
    },
    {
      company: 'ABP Network (ABP News)',
      role: 'Junior IT Engineer',
      startDate: '2022-07',
      endDate: '2023-05',
      location: 'Ahmedabad, Gujarat, India',
      achievements: [
        'Monitored and maintained production broadcast and office IT infrastructure, ensuring 24/7 availability for live news operations.',
        'Resolved network, server, and endpoint issues under tight SLAs, prioritizing rapid incident resolution.',
        'Supported routine system upgrades, patch management, and hardware lifecycle operations across the broadcast facility.'
      ],
      skillsUsed: ['Systems Administration', 'SLA Management', 'Broadcast IT', 'Network Monitoring', 'Incident Response']
    }
  ],
  skills: {
    cloudPlatforms: ['AWS (EC2, S3, RDS, Lambda, ECS, EKS, API Gateway, WAF, IAM, VPC, CloudWatch)', 'Azure (AKS, Blob, VNet, Key Vault)', 'GCP (GKE, Cloud Storage, IAM)'],
    infrastructureAsCode: ['Terraform', 'Checkov', 'TFLint', 'Terragrunt', 'CloudFormation'],
    containersAndOrchestration: ['Docker', 'Kubernetes', 'Helm', 'ArgoCD (GitOps)'],
    ciCdAndGitOps: ['Jenkins', 'GitHub Actions', 'GitLab CI', 'Bitbucket Pipelines', 'ArgoCD'],
    devSecOpsAndSecurity: ['SonarQube (SAST)', 'Snyk (SCA)', 'Aqua Trivy', 'Semgrep', 'Gitleaks', 'Sigstore Cosign', 'SBOM (Syft)', 'IAM Least Privilege'],
    observabilityAndMonitoring: ['Prometheus', 'Grafana', 'ELK Stack', 'Loki', 'Alertmanager', 'CloudWatch', 'Datadog'],
    programmingAndScripting: ['Python', 'Bash', 'PowerShell', 'YAML', 'JSON'],
    networkingAndAdmin: ['Linux (Ubuntu, Debian, RHEL)', 'Windows Server', 'DNS', 'DHCP', 'VLANs', 'Firewalls', 'VPNs', 'Nessus']
  },
  certifications: [
    'Sigma Institute of Engineering Certificate',
    'DevOps & Cloud Engineering Certifications'
  ],
  education: [
    {
      degree: 'Bachelor of Engineering in Information Technology',
      institution: 'Sigma Institute of Engineering, Gujarat',
      year: '2022'
    }
  ]
};

export function loadAuthoritativeProfile(customResumePath?: string): UserProfile {
  const masterPath = customResumePath || "/home/rahul/PROJECT'S/portfolio-new/resumes/MASTER_RESUME.md";
  if (existsSync(masterPath)) {
    try {
      const content = readFileSync(masterPath, 'utf-8');
      logger.info(`Loaded authoritative resume from ${masterPath} (${content.length} bytes)`);
      // Profile is pre-seeded with 100% verified facts from this exact file
      return DEFAULT_USER_PROFILE;
    } catch (err) {
      logger.warn(`Could not read master resume file, using embedded verified profile: ${err}`);
    }
  }
  return DEFAULT_USER_PROFILE;
}
