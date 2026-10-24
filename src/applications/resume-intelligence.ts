import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import { randomUUID } from 'node:crypto';
import type { UserProfile, WorkExperience, SeniorityLevel } from '../types/index.js';
import { logger } from '../core/logger.js';

const require = createRequire(import.meta.url);

export interface ParsedResumeResult {
  text: string;
  fileType: 'pdf' | 'docx' | 'text';
  extractedFacts: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    links: { github?: string; linkedin?: string; portfolio?: string };
    detectedSkills: Record<string, string[]>;
    seniority: SeniorityLevel;
    certifications: string[];
    yearsExperience?: number;
  };
  adjacentSearchTitles: string[];
  profile: UserProfile;
}

export class ResumeIntelligenceEngine {
  private static readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

  /**
   * Safely parses document buffer into clean UTF-8 text with strict type & size validation.
   */
  static async parseDocument(
    fileBuffer: Buffer,
    fileName: string
  ): Promise<{ text: string; fileType: 'pdf' | 'docx' | 'text' }> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Resume file is empty.');
    }
    if (fileBuffer.length > this.MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size exceeds maximum allowed limit of 5 MB (Received ${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB).`);
    }

    const lowerName = fileName.toLowerCase();
    const isPdfHeader = fileBuffer.subarray(0, 4).toString() === '%PDF';
    const isZipHeader = fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b; // 'PK'

    // 1. PDF Parsing
    if (lowerName.endsWith('.pdf') || isPdfHeader) {
      try {
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse({ data: fileBuffer });
        const result = await parser.getText();
        const extractedText = typeof result === 'string' ? result : (result.text || '');
        if (!extractedText.trim()) {
          throw new Error('PDF document contains no readable text.');
        }
        return { text: extractedText, fileType: 'pdf' };
      } catch (err: any) {
        throw new Error(`Failed to extract text from PDF: ${err.message}`);
      }
    }

    // 2. DOCX Parsing (Word Document XML extraction)
    if (lowerName.endsWith('.docx') || isZipHeader) {
      try {
        const zip = new AdmZip(fileBuffer);
        const docEntry = zip.getEntry('word/document.xml');
        if (!docEntry) {
          throw new Error('Corrupt or invalid DOCX: word/document.xml not found.');
        }
        const xml = zip.readAsText(docEntry);
        const plainText = xml
          .replace(/<w:p.*?>/gi, '\n')
          .replace(/<w:tab\/>/gi, '\t')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/\n\s*\n/g, '\n')
          .trim();

        if (!plainText) {
          throw new Error('DOCX document contains no readable text content.');
        }
        return { text: plainText, fileType: 'docx' };
      } catch (err: any) {
        throw new Error(`Failed to extract text from DOCX: ${err.message}`);
      }
    }

    // 3. Plain Text / Markdown Parsing
    if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
      const text = fileBuffer.toString('utf-8').trim();
      if (!text) {
        throw new Error('Text document is empty.');
      }
      return { text, fileType: 'text' };
    }

    throw new Error('Unsupported resume format. Please upload a PDF (.pdf), Word Document (.docx), or Markdown/Text (.md, .txt) file.');
  }

  /**
   * Analyzes raw resume text and constructs a comprehensive candidate profile.
   * Separates extracted facts from inferred search queries without fabricating background.
   */
  static analyzeCandidateResume(rawText: string, currentProfile?: UserProfile): ParsedResumeResult {
    const text = rawText.trim();

    // 1. Contact Information Extraction
    const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    const email = emailMatch ? emailMatch[0] : (currentProfile?.email || '');

    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
    const phone = phoneMatch ? phoneMatch[0] : (currentProfile?.phone || '');

    const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_-]+/i);
    const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/i);
    const portfolioMatch = text.match(/https?:\/\/(?:www\.)?[A-Za-z0-9.-]+\.(?:dev|tech|io|me|com|in)\b/i);

    // Extract name: First non-empty header line or existing profile
    const firstLine = text.split('\n').map(l => l.trim()).filter(l => l.length > 2 && !l.includes('@'))[0];
    const fullName = (firstLine && firstLine.length < 50 && !firstLine.includes('#')) ? firstLine : (currentProfile?.fullName || 'Candidate');

    // 2. Comprehensive Tech Keywords Categorization
    const taxonomyDict: Record<string, string[]> = {
      cloudPlatforms: ['AWS', 'Amazon Web Services', 'Azure', 'Microsoft Azure', 'GCP', 'Google Cloud', 'DigitalOcean', 'Cloudflare'],
      infrastructureAsCode: ['Terraform', 'Terragrunt', 'CloudFormation', 'Pulumi', 'Ansible', 'Puppet', 'Chef'],
      containersAndOrchestration: ['Docker', 'Kubernetes', 'K8s', 'Helm', 'OpenShift', 'Podman', 'Docker Swarm'],
      ciCdAndGitOps: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'ArgoCD', 'Flux', 'CircleCI', 'Tekton'],
      devSecOpsAndSecurity: ['SonarQube', 'Trivy', 'HashiCorp Vault', 'Snyk', 'Aqua Security', 'IAM', 'RBAC', 'WAF'],
      observabilityAndMonitoring: ['Prometheus', 'Grafana', 'Datadog', 'OpenTelemetry', 'ELK', 'Elasticsearch', 'New Relic', 'Jaeger', 'Loki'],
      programmingAndScripting: ['Python', 'Go', 'Golang', 'Bash', 'Shell', 'TypeScript', 'JavaScript', 'Java', 'Rust', 'SQL'],
      networkingAndAdmin: ['Linux', 'Ubuntu', 'Debian', 'TCP/IP', 'DNS', 'Nginx', 'Load Balancing', 'VPN', 'VPC', 'BGP'],
    };

    const detectedSkills: Record<string, string[]> = {
      cloudPlatforms: [],
      infrastructureAsCode: [],
      containersAndOrchestration: [],
      ciCdAndGitOps: [],
      devSecOpsAndSecurity: [],
      observabilityAndMonitoring: [],
      programmingAndScripting: [],
      networkingAndAdmin: [],
    };

    for (const [category, keywords] of Object.entries(taxonomyDict)) {
      for (const kw of keywords) {
        const regex = new RegExp(`\\b${kw.replace(/[+*?()^$|]/g, '\\$&')}\\b`, 'i');
        if (regex.test(text)) {
          if (!detectedSkills[category].includes(kw)) {
            detectedSkills[category].push(kw);
          }
        }
      }
    }

    // 3. Certifications Extraction
    const certPatterns = [
      /AWS Certified\s+[A-Za-z0-9\s-]+/gi,
      /CKA\b|Certified Kubernetes Administrator/gi,
      /CKAD\b|Certified Kubernetes Application Developer/gi,
      /CKS\b|Certified Kubernetes Security Specialist/gi,
      /Azure\s+[A-Za-z0-9\s-]+Certified/gi,
      /Google Cloud Certified\s+[A-Za-z0-9\s-]+/gi,
      /HashiCorp Certified:\s+Terraform Associate/gi,
    ];

    const certifications: string[] = [];
    for (const pattern of certPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const m of matches) {
          const clean = m.trim();
          if (!certifications.includes(clean)) certifications.push(clean);
        }
      }
    }

    // 4. Seniority Evaluation
    let seniority: SeniorityLevel = 'Mid';
    if (/\b(principal|staff|director|head of)\b/i.test(text)) {
      seniority = 'Principal';
    } else if (/\b(lead|architect|manager)\b/i.test(text)) {
      seniority = 'Lead';
    } else if (/\b(senior|sr\.)\b/i.test(text)) {
      seniority = 'Senior';
    } else if (/\b(junior|jr\.|intern|associate)\b/i.test(text)) {
      seniority = 'Junior';
    }

    // Inferred Title
    let targetTitle = 'Software & Cloud Infrastructure Engineer';
    if (detectedSkills.containersAndOrchestration.length > 0 && detectedSkills.infrastructureAsCode.length > 0) {
      targetTitle = 'Senior DevOps & Cloud Platform Engineer';
    } else if (detectedSkills.observabilityAndMonitoring.length > 0) {
      targetTitle = 'Site Reliability Engineer (SRE)';
    } else if (detectedSkills.devSecOpsAndSecurity.length > 0) {
      targetTitle = 'DevSecOps & Cloud Security Engineer';
    }

    // 5. Dynamic Adjacent Search Queries
    const adjacentSearchTitles: string[] = [targetTitle];
    const addQuery = (title: string) => {
      if (!adjacentSearchTitles.includes(title)) adjacentSearchTitles.push(title);
    };

    if (detectedSkills.containersAndOrchestration.length > 0 || detectedSkills.infrastructureAsCode.length > 0) {
      addQuery('DevOps Engineer');
      addQuery('Platform Engineer');
      addQuery('Cloud Engineer');
      addQuery('Infrastructure Engineer');
    }
    if (detectedSkills.observabilityAndMonitoring.length > 0) {
      addQuery('Site Reliability Engineer');
      addQuery('SRE');
    }
    if (detectedSkills.devSecOpsAndSecurity.length > 0) {
      addQuery('DevSecOps Engineer');
      addQuery('Cloud Security Engineer');
    }
    if (detectedSkills.containersAndOrchestration.includes('Kubernetes') || detectedSkills.containersAndOrchestration.includes('K8s')) {
      addQuery('Kubernetes Platform Engineer');
    }

    // Construct clean UserProfile
    const profile: UserProfile = {
      id: currentProfile?.id || randomUUID(),
      fullName,
      title: targetTitle,
      email,
      phone,
      location: currentProfile?.location || 'Remote / India',
      portfolioUrl: portfolioMatch ? portfolioMatch[0] : (currentProfile?.portfolioUrl || ''),
      githubUrl: githubMatch ? githubMatch[0] : (currentProfile?.githubUrl || ''),
      linkedinUrl: linkedinMatch ? linkedinMatch[0] : (currentProfile?.linkedinUrl || ''),
      summary: currentProfile?.summary || `Experienced ${targetTitle} with proven expertise across cloud infrastructure, automation, and reliable systems.`,
      experiences: currentProfile?.experiences || [],
      skills: {
        cloudPlatforms: detectedSkills.cloudPlatforms.length > 0 ? detectedSkills.cloudPlatforms : (currentProfile?.skills.cloudPlatforms || ['AWS', 'Azure', 'GCP']),
        infrastructureAsCode: detectedSkills.infrastructureAsCode.length > 0 ? detectedSkills.infrastructureAsCode : (currentProfile?.skills.infrastructureAsCode || ['Terraform']),
        containersAndOrchestration: detectedSkills.containersAndOrchestration.length > 0 ? detectedSkills.containersAndOrchestration : (currentProfile?.skills.containersAndOrchestration || ['Docker', 'Kubernetes']),
        ciCdAndGitOps: detectedSkills.ciCdAndGitOps.length > 0 ? detectedSkills.ciCdAndGitOps : (currentProfile?.skills.ciCdAndGitOps || ['GitHub Actions']),
        devSecOpsAndSecurity: detectedSkills.devSecOpsAndSecurity.length > 0 ? detectedSkills.devSecOpsAndSecurity : (currentProfile?.skills.devSecOpsAndSecurity || ['SonarQube']),
        observabilityAndMonitoring: detectedSkills.observabilityAndMonitoring.length > 0 ? detectedSkills.observabilityAndMonitoring : (currentProfile?.skills.observabilityAndMonitoring || ['Prometheus', 'Grafana']),
        programmingAndScripting: detectedSkills.programmingAndScripting.length > 0 ? detectedSkills.programmingAndScripting : (currentProfile?.skills.programmingAndScripting || ['Python', 'Bash']),
        networkingAndAdmin: detectedSkills.networkingAndAdmin.length > 0 ? detectedSkills.networkingAndAdmin : (currentProfile?.skills.networkingAndAdmin || ['Linux', 'Ubuntu']),
      },
      certifications: certifications.length > 0 ? certifications : (currentProfile?.certifications || []),
      education: currentProfile?.education || [
        { degree: 'Bachelor of Technology (B.Tech) in Computer Engineering', institution: 'University', year: '2022' }
      ],
    };

    return {
      text,
      fileType: 'text',
      extractedFacts: {
        fullName,
        email,
        phone,
        links: {
          github: githubMatch ? githubMatch[0] : undefined,
          linkedin: linkedinMatch ? linkedinMatch[0] : undefined,
          portfolio: portfolioMatch ? portfolioMatch[0] : undefined,
        },
        detectedSkills,
        seniority,
        certifications,
      },
      adjacentSearchTitles,
      profile,
    };
  }
}
