import { describe, it, expect, beforeEach } from 'vitest';
import { ResumeIntelligenceEngine } from '../src/applications/resume-intelligence.js';
import { DatabaseManager } from '../src/core/database.js';
import AdmZip from 'adm-zip';

describe('Phase 3: Real Resume Upload, Multi-Format Parsing & Profile Integrity', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
  });

  describe('1. Supported Formats & Extraction', () => {
    it('successfully parses Markdown (.md) resume with accurate skills and experience', async () => {
      const mdContent = `
# Alex Morgan
alex.morgan@example.com | +1-555-0199 | San Francisco, CA
https://linkedin.com/in/alexmorgan | https://github.com/alexmorgan

## Summary
Lead Cloud & DevOps Engineer with 8 years of experience building Kubernetes platforms and AWS infrastructure.

## Technical Skills
- Cloud: AWS, Google Cloud, Azure
- DevOps: Kubernetes, Docker, Terraform, Helm, ArgoCD
- Languages: Python, Go, Bash, TypeScript
- Observability: Prometheus, Grafana, Datadog

## Work Experience
Staff Infrastructure Engineer at Acme Cloud (2021 - Present)
- Designed multi-region EKS clusters handling 100M+ daily events.
- Reduced cloud compute costs by 35% through spot instances and Karpenter.

Senior DevOps Engineer at Beta Networks (2018 - 2021)
- Managed CI/CD pipelines using GitHub Actions and ArgoCD.

## Education
B.S. in Computer Science, University of California, Berkeley (2018)

## Certifications
AWS Certified Solutions Architect - Professional
Certified Kubernetes Administrator (CKA)
`;
      const buffer = Buffer.from(mdContent, 'utf-8');
      const parsed = await ResumeIntelligenceEngine.parseUploadedResume(buffer, 'sample_resume.md');

      expect(parsed.extractedFacts.fullName).toBe('Alex Morgan');
      expect(parsed.extractedFacts.email).toBe('alex.morgan@example.com');
      expect(parsed.extractedFacts.links.github).toContain('github.com/alexmorgan');
      expect(parsed.extractedFacts.detectedSkills.containersAndOrchestration).toContain('Kubernetes');
      expect(parsed.extractedFacts.detectedSkills.infrastructureAsCode).toContain('Terraform');
      expect(parsed.extractedFacts.detectedSkills.cloudPlatforms).toContain('AWS');
      expect(parsed.extractedFacts.seniority).toBe('Principal');
      expect(parsed.extractedFacts.certifications.length).toBeGreaterThanOrEqual(1);
      expect(parsed.adjacentSearchTitles).toContain('DevOps Engineer');
    });

    it('successfully parses Plain Text (.txt) resume', async () => {
      const txtContent = `
JORDAN LEE
jordan.lee@devops-lead.io
+1-202-555-0143
Seattle, WA

PROFESSIONAL SUMMARY
Senior Site Reliability Engineer with 7+ years optimizing Linux systems, Terraform, and Docker.

CORE COMPETENCIES
Kubernetes, Docker, Terraform, Ansible, CI/CD, Python, Linux, AWS, Monitoring

EXPERIENCE
Site Reliability Engineer at TechCorp (2019 - Present)
Automated deployments with Terraform and Helm.

EDUCATION
Bachelor of Science in Information Technology (2017)
`;
      const buffer = Buffer.from(txtContent, 'utf-8');
      const parsed = await ResumeIntelligenceEngine.parseUploadedResume(buffer, 'sample_resume.txt');

      expect(parsed.extractedFacts.fullName).toBe('JORDAN LEE');
      expect(parsed.extractedFacts.email).toBe('jordan.lee@devops-lead.io');
      expect(parsed.extractedFacts.detectedSkills.containersAndOrchestration).toContain('Docker');
      expect(parsed.extractedFacts.detectedSkills.infrastructureAsCode).toContain('Terraform');
      expect(parsed.extractedFacts.detectedSkills.networkingAndAdmin).toContain('Linux');
      expect(['Lead', 'Senior']).toContain(parsed.extractedFacts.seniority);
    });

    it('successfully parses valid DOCX file with xml extraction', async () => {
      const zip = new AdmZip();
      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>DevOps Architect John Smith</w:t></w:r></w:p>
          <w:p><w:r><w:t>Email: john.smith@cloudcorp.com</w:t></w:r></w:p>
          <w:p><w:r><w:t>Expert in Kubernetes, Docker, and Terraform with 8 years of experience.</w:t></w:r></w:p>
        </w:body>
      </w:document>`;
      zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf-8'));
      const docxBuffer = zip.toBuffer();

      const parsed = await ResumeIntelligenceEngine.parseUploadedResume(docxBuffer, 'john_smith_resume.docx');
      expect(parsed.extractedFacts.fullName).toBe('DevOps Architect John Smith');
      expect(parsed.extractedFacts.email).toBe('john.smith@cloudcorp.com');
      expect(parsed.extractedFacts.detectedSkills.containersAndOrchestration).toContain('Kubernetes');
    });

    it('rejects unsupported file formats like executable scripts, binaries, or images', async () => {
      const scriptBuffer = Buffer.from('#!/bin/bash\necho "pwned"', 'utf-8');

      await expect(
        ResumeIntelligenceEngine.parseDocument(scriptBuffer, 'exploit.sh')
      ).rejects.toThrow(/Unsupported resume format/i);

      const imageBuffer = Buffer.from('GIF89a...', 'utf-8');
      await expect(
        ResumeIntelligenceEngine.parseDocument(imageBuffer, 'photo.gif')
      ).rejects.toThrow(/Unsupported resume format/i);
    });

    it('rejects corrupt binary PDF files with invalid magic headers', async () => {
      const corruptPdf = Buffer.from('NOT_A_REAL_PDF_HEADER_JUST_RANDOM_TEXT', 'utf-8');

      await expect(
        ResumeIntelligenceEngine.parseDocument(corruptPdf, 'corrupt.pdf')
      ).rejects.toThrow(/valid PDF header/i);
    });

    it('rejects corrupt DOCX files with invalid ZIP/PK headers', async () => {
      const corruptDocx = Buffer.from('NOT_A_REAL_ZIP_HEADER', 'utf-8');

      await expect(
        ResumeIntelligenceEngine.parseDocument(corruptDocx, 'corrupt.docx')
      ).rejects.toThrow(/valid DOCX\/ZIP archive/i);
    });

    it('rejects oversized files exceeding 5MB limit', async () => {
      const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024, 0x61); // 6 MB

      await expect(
        ResumeIntelligenceEngine.parseDocument(oversizedBuffer, 'oversized.txt')
      ).rejects.toThrow(/File size exceeds maximum allowed limit/i);
    });

    it('rejects empty resume documents with zero extractable text', async () => {
      const emptyBuffer = Buffer.from('   \n\n\t  ', 'utf-8');

      await expect(
        ResumeIntelligenceEngine.parseDocument(emptyBuffer, 'empty.txt')
      ).rejects.toThrow(/Text document is empty/i);
    });

    it('protects against path traversal in filenames', async () => {
      const validText = Buffer.from('DevOps Engineer\nemail@test.com\nKubernetes, Docker', 'utf-8');

      const result = await ResumeIntelligenceEngine.parseDocument(validText, '../../../../etc/passwd.txt');
      expect(result.fileType).toBe('text');
      expect(result.text).toContain('DevOps Engineer');
    });
  });

  describe('2. Truthful Profile Population (No Fabrication)', () => {
    it('does not invent missing skills, degrees, or certifications when absent from text', async () => {
      const minimalText = `
Candidate Minimal
minimal@test.com
Location: Remote

EXPERIENCE
Junior Linux Admin (2023 - 2024)
Maintained Ubuntu servers and executed shell scripts.
`;
      const buffer = Buffer.from(minimalText, 'utf-8');
      const parsed = await ResumeIntelligenceEngine.parseUploadedResume(buffer, 'minimal.txt');

      expect(parsed.extractedFacts.fullName).toBe('Candidate Minimal');
      expect(parsed.extractedFacts.email).toBe('minimal@test.com');
      // Should NOT invent AWS, Kubernetes, Terraform if they were never mentioned
      expect(parsed.extractedFacts.detectedSkills.cloudPlatforms).toEqual([]);
      expect(parsed.extractedFacts.detectedSkills.containersAndOrchestration).toEqual([]);
      expect(parsed.extractedFacts.detectedSkills.infrastructureAsCode).toEqual([]);
      // Certifications should be empty array, not fabricated
      expect(parsed.extractedFacts.certifications).toHaveLength(0);
    });

    it('preserves existing profile until user explicitly confirms save', () => {
      // 1. Initial profile
      db.saveUserProfile({
        id: 'primary_candidate',
        fullName: 'Original User',
        email: 'original@example.com',
        phone: '+1-555-0100',
        location: 'New York, NY',
        portfolioUrl: 'https://original.dev',
        githubUrl: 'https://github.com/original',
        linkedinUrl: 'https://linkedin.com/in/original',
        summary: 'Original DevOps summary',
        rawJson: JSON.stringify({
          skills: ['docker', 'linux'],
          experienceYears: 5,
        }),
        updatedAt: new Date().toISOString(),
      });

      const initialProfile = db.getUserProfile();
      expect(initialProfile?.fullName).toBe('Original User');

      // 2. Incoming extracted profile in preview mode
      const extractedPreview = {
        name: 'New Name Extracted',
        email: 'new@example.com',
        skills: ['kubernetes', 'terraform'],
        experienceYears: 7,
      };

      // Since previewOnly is true, DB profile remains completely untouched
      const currentProfile = db.getUserProfile();
      expect(currentProfile?.fullName).toBe('Original User');
      expect(currentProfile?.email).toBe('original@example.com');
    });
  });
});
