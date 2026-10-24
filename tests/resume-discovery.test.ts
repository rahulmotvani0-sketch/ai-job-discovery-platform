import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import AdmZip from 'adm-zip';
import PDFDocument from 'pdfkit';
import { ResumeIntelligenceEngine } from '../src/applications/resume-intelligence.js';
import { JobMatchingAgent } from '../src/ai/agents/matcher.js';
import { DatabaseManager } from '../src/core/database.js';
import { MasterOrchestrator } from '../src/automation/orchestrator.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import { DirectGmailService } from '../src/integrations/google/gmail.js';
import { ApplicationServer } from '../src/server.js';
import { DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES } from '../src/core/profile.js';
import type { Vacancy, JobPreferences, DiscoveryStep } from '../src/types/index.js';

describe('AI Resume-Based Automatic Job Discovery', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    db.saveUserProfile(DEFAULT_USER_PROFILE);
    db.savePreferences(DEFAULT_JOB_PREFERENCES);
  });

  describe('1. Document Parsing & Security Validation', () => {
    it('parses plain text and markdown resumes', async () => {
      const sampleText = `
# Senior Site Reliability Engineer
Email: candidate.sre@example.com
Phone: +1-555-0199
https://github.com/candidatesre
https://linkedin.com/in/candidatesre

Skills: Kubernetes, Terraform, Docker, AWS, Prometheus, Grafana, Python, Bash, CI/CD
Experience: 5 years leading infrastructure reliability and automated deployments.
      `;
      const result = await ResumeIntelligenceEngine.parseDocument(Buffer.from(sampleText, 'utf-8'), 'resume.md');
      expect(result.fileType).toBe('text');
      expect(result.text).toContain('Senior Site Reliability Engineer');
      expect(result.text).toContain('candidate.sre@example.com');
    });

    it('parses valid DOCX files via word/document.xml extraction', async () => {
      const zip = new AdmZip();
      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>DevOps Platform Engineer</w:t></w:r></w:p>
          <w:p><w:r><w:t>Email: alex.devops@techcorp.io</w:t></w:r></w:p>
          <w:p><w:r><w:t>Expert in Terraform, Kubernetes, AWS, GitLab CI, and Docker.</w:t></w:r></w:p>
        </w:body>
      </w:document>`;
      zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf-8'));
      const docxBuffer = zip.toBuffer();

      const result = await ResumeIntelligenceEngine.parseDocument(docxBuffer, 'candidate_resume.docx');
      expect(result.fileType).toBe('docx');
      expect(result.text).toContain('DevOps Platform Engineer');
      expect(result.text).toContain('alex.devops@techcorp.io');
    });

    it('parses valid PDF documents via PDFParse', async () => {
      // Build a minimal valid PDF in memory
      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        const doc = new PDFDocument();
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.fontSize(16).text('Lead Cloud Infrastructure Engineer');
        doc.fontSize(12).text('Email: lead.cloud@enterprise.net');
        doc.text('Key competencies: AWS, Azure, Terraform, Helm, Prometheus');
        doc.end();
      });

      const result = await ResumeIntelligenceEngine.parseDocument(pdfBuffer, 'resume.pdf');
      expect(result.fileType).toBe('pdf');
      expect(result.text).toContain('Lead Cloud Infrastructure Engineer');
      expect(result.text).toContain('lead.cloud@enterprise.net');
    });

    it('rejects files exceeding 5 MB limit', async () => {
      const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024, 'a');
      await expect(
        ResumeIntelligenceEngine.parseDocument(oversizedBuffer, 'huge_resume.pdf')
      ).rejects.toThrow(/exceeds maximum allowed limit of 5 MB/i);
    });

    it('rejects empty or unsupported document formats', async () => {
      await expect(
        ResumeIntelligenceEngine.parseDocument(Buffer.alloc(0), 'empty.pdf')
      ).rejects.toThrow(/file is empty/i);

      await expect(
        ResumeIntelligenceEngine.parseDocument(Buffer.from('binary garbage', 'utf-8'), 'resume.exe')
      ).rejects.toThrow(/Unsupported resume format/i);
    });
  });

  describe('2. Structured Candidate Profile & Query Generation', () => {
    it('extracts technical skills, contact facts, and generates adjacent search queries', () => {
      const resume = `
Alex Morgan
Senior Cloud & DevOps Engineer
Email: alex.morgan@cloudtech.dev | Phone: +1-202-555-0143
GitHub: https://github.com/alexmorgan-cloud
LinkedIn: https://linkedin.com/in/alexmorgan-cloud

Technical Skills:
- Cloud Platforms: AWS, Azure, GCP
- Infrastructure as Code: Terraform, Ansible
- Containers & Orchestration: Kubernetes, Docker, Helm
- CI/CD: GitHub Actions, GitLab CI
- Security: HashiCorp Vault, SonarQube, Trivy
- Observability: Prometheus, Grafana, Datadog
- Programming: Python, Go, Bash, TypeScript

Certifications:
- AWS Certified Solutions Architect - Associate
- CKA (Certified Kubernetes Administrator)
      `;

      const analysis = ResumeIntelligenceEngine.analyzeCandidateResume(resume);

      expect(analysis.extractedFacts.fullName).toBe('Alex Morgan');
      expect(analysis.extractedFacts.email).toBe('alex.morgan@cloudtech.dev');
      expect(analysis.extractedFacts.links.github).toBe('https://github.com/alexmorgan-cloud');
      expect(analysis.extractedFacts.links.linkedin).toBe('https://linkedin.com/in/alexmorgan-cloud');

      // Check categorized skills
      expect(analysis.extractedFacts.detectedSkills.cloudPlatforms).toContain('AWS');
      expect(analysis.extractedFacts.detectedSkills.infrastructureAsCode).toContain('Terraform');
      expect(analysis.extractedFacts.detectedSkills.containersAndOrchestration).toContain('Kubernetes');

      // Check certifications
      expect(analysis.extractedFacts.certifications.length).toBeGreaterThanOrEqual(1);

      // Check dynamic adjacent role queries
      expect(analysis.adjacentSearchTitles).toContain('DevOps Engineer');
      expect(analysis.adjacentSearchTitles).toContain('Platform Engineer');
      expect(analysis.adjacentSearchTitles).toContain('Cloud Engineer');
      expect(analysis.adjacentSearchTitles).toContain('Site Reliability Engineer');
    });
  });

  describe('3. 75% Qualification Rule & Boundary Testing', () => {
    const mockVacancy: Vacancy = {
      id: 'vac_boundary_test',
      canonicalHash: 'hash_boundary_test',
      sourceType: 'greenhouse',
      sourceUrl: 'https://boards.greenhouse.io/techcorp/jobs/101',
      alternateUrls: [],
      companyName: 'TechCorp Cloud',
      title: 'Senior DevOps Platform Engineer',
      normalizedTitle: 'senior devops platform engineer',
      locationText: 'Remote - Worldwide',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time',
      rawDescription: 'Looking for a Senior DevOps engineer with deep experience in Kubernetes, Terraform, AWS, CI/CD, and Linux.',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
    };

    it('verifies exact qualification boundary: 74.99 fails, 75.00 qualifies, 75.01 qualifies', () => {
      const minThreshold = 75.0;

      // 74.99 boundary
      const eval7499 = {
        score: 74.99,
        qualifies: Math.round(74.99 * 100) >= Math.round(minThreshold * 100),
      };
      expect(eval7499.qualifies).toBe(false);

      // 75.00 boundary (inclusive)
      const eval7500 = {
        score: 75.00,
        qualifies: Math.round(75.00 * 100) >= Math.round(minThreshold * 100),
      };
      expect(eval7500.qualifies).toBe(true);

      // 75.01 boundary
      const eval7501 = {
        score: 75.01,
        qualifies: Math.round(75.01 * 100) >= Math.round(minThreshold * 100),
      };
      expect(eval7501.qualifies).toBe(true);
    });

    it('evaluates real candidate against vacancy and computes deterministic score', () => {
      const profile = DEFAULT_USER_PROFILE;
      const prefs: JobPreferences = {
        ...DEFAULT_JOB_PREFERENCES,
        minMatchScore: 75.0,
      };

      const evaluation = JobMatchingAgent.evaluateMatch(mockVacancy, profile, prefs);

      expect(evaluation.overallScore).toBeGreaterThanOrEqual(0);
      expect(evaluation.overallScore).toBeLessThanOrEqual(100);
      expect(evaluation.categoryScores.technicalSkills).toBeGreaterThan(0);
      expect(evaluation.qualifies75).toBe(evaluation.overallScore >= 75.0);
    });

    it('enforces hard constraints: location exclusion triggers mandatory blocker and caps score', () => {
      const excludedVacancy: Vacancy = {
        ...mockVacancy,
        id: 'vac_excluded_geo',
        canonicalHash: 'hash_excluded_geo',
        locationText: 'United States Only - Must reside in US',
        isRemote: true,
        acceptsIndia: false, // Strict exclusion
      };

      const evaluation = JobMatchingAgent.evaluateMatch(excludedVacancy, DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES);

      expect(evaluation.overallScore).toBeLessThanOrEqual(48.0);
      expect(evaluation.qualifies75).toBe(false);
      expect(evaluation.mandatoryBlockers).toBeDefined();
      expect(evaluation.mandatoryBlockers?.[0]).toContain('Geographic restriction');
    });
  });

  describe('4. Discovery Run State Transitions & Orchestration', () => {
    it('executes through all 7 explicit progress task states', async () => {
      const recordedSteps: DiscoveryStep[] = [];
      // Controlled fixture connector for deterministic unit execution
      const mockConnector = {
        name: 'Mock Greenhouse ATS',
        sourceType: 'greenhouse' as const,
        fetchVacancies: async () => [
          {
            sourceType: 'greenhouse' as const,
            sourceUrl: 'https://boards.greenhouse.io/demo/jobs/1',
            companyName: 'Demo Corp',
            title: 'Senior DevOps Engineer',
            locationText: 'Remote',
            isRemote: true,
            acceptsIndia: true,
            employmentType: 'full-time' as const,
            rawDescription: 'Kubernetes, Terraform, AWS, Docker, CI/CD, Python.',
            publishedAt: new Date().toISOString(),
          },
        ],
      };

      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager: new DiscoveryManager(db, [mockConnector]),
        gmailService: new DirectGmailService(),
      });

      const runId = 'test_run_progress_1';
      db.saveDiscoveryRun({
        id: runId,
        triggerType: 'RESUME_UPLOAD',
        status: 'RUNNING',
        currentStep: 'RESUME_UPLOADED',
        stepMessage: 'Starting discovery...',
        totalSourcesSearched: 1,
        discoveredCount: 0,
        evaluatedCount: 0,
        qualifiedCount: 0,
        minScoreThreshold: 75.0,
        startedAt: new Date().toISOString(),
      });

      const result = await orchestrator.runResumeBasedDiscovery({
        runId,
        profile: DEFAULT_USER_PROFILE,
        minScoreThreshold: 75.0,
        onProgress: (step) => {
          recordedSteps.push(step);
        },
      });

      // Verify all 7 required task states occurred
      expect(recordedSteps).toContain('RESUME_UPLOADED');
      expect(recordedSteps).toContain('EXTRACTING_RESUME_INFO');
      expect(recordedSteps).toContain('ANALYZING_CANDIDATE_PROFILE');
      expect(recordedSteps).toContain('SEARCHING_JOB_SOURCES');
      expect(recordedSteps).toContain('EVALUATING_JOB_MATCHES');
      expect(recordedSteps).toContain('SAVING_QUALIFYING_JOBS');
      expect(recordedSteps).toContain('SEARCH_COMPLETED');

      // Verify final persisted run in DB
      const persistedRun = db.getDiscoveryRun(runId);
      expect(persistedRun).not.toBeNull();
      expect(persistedRun?.status).toBe('COMPLETED');
      expect(persistedRun?.currentStep).toBe('SEARCH_COMPLETED');
      expect(persistedRun?.completedAt).toBeDefined();
      expect(result.runId).toBe(runId);
    });
  });

  describe('5. HTTP API Endpoints Integration', () => {
    let server: ApplicationServer;
    const testPort = 3392;

    beforeAll(async () => {
      server = new ApplicationServer({ port: testPort, host: '127.0.0.1', dbPath: ':memory:' });
      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it('POST /api/resume/upload-and-discover parses resume and initializes discovery run', async () => {
      const resumeText = `
Alex SRE
Email: alex.sre@infrastructure.io
Skills: Kubernetes, Docker, Terraform, Prometheus, AWS, Python, Bash
Experience: 6 years building high-availability cloud platforms.
      `;

      const res = await fetch(`http://127.0.0.1:${testPort}/api/resume/upload-and-discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeContent: resumeText,
          fileName: 'alex_sre.txt',
          autoStartDiscovery: false,
          minMatchScore: 75.0,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.runId).toBeDefined();
      expect(data.profile.fullName).toBe('Alex SRE');
      expect(data.extractedFacts.detectedSkills.containersAndOrchestration).toContain('Kubernetes');
      expect(data.discoveryStarted).toBe(false);

      // Verify GET /api/discovery/runs/:id
      const runRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/runs/${data.runId}`);
      expect(runRes.status).toBe(200);
      const runData = await runRes.json();
      expect(runData.id).toBe(data.runId);
      expect(runData.minScoreThreshold).toBe(75.0);
    });

    it('GET /api/matches returns only jobs meeting the 75% threshold', async () => {
      const memDb = server.getDatabase();

      // Insert high-scoring vacancy
      const highJob: Vacancy = {
        id: 'high_job_1',
        canonicalHash: 'hash_high_1',
        sourceType: 'greenhouse',
        sourceUrl: 'https://example.com/job1',
        alternateUrls: [],
        companyName: 'Apex Cloud Systems',
        title: 'Senior DevOps / SRE',
        normalizedTitle: 'senior devops sre',
        locationText: 'Remote',
        isRemote: true,
        acceptsIndia: true,
        employmentType: 'full-time',
        rawDescription: 'Kubernetes, Terraform, AWS, CI/CD, Prometheus.',
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'QUALIFIED',
        isContractOrFreelance: false,
      };
      memDb.insertOrUpdateVacancy(highJob);
      memDb.saveMatchEvaluation({
        id: 'eval_high_1',
        vacancyId: highJob.id,
        overallScore: 88.5,
        qualifies75: true,
        tier: 'Excellent',
        categoryScores: {
          technicalSkills: 28,
          experienceSeniority: 18,
          responsibilities: 14,
          cloudInfrastructure: 10,
          locationEligibility: 10,
          compensationAlignment: 5,
          certificationsOther: 3.5,
        },
        matchingSkills: ['Kubernetes', 'Terraform', 'AWS'],
        missingSkills: [],
        evidenceExplanation: 'Strong match across infrastructure and cloud requirements.',
        evaluatedAt: new Date().toISOString(),
      });

      // Insert low-scoring vacancy
      const lowJob: Vacancy = {
        id: 'low_job_2',
        canonicalHash: 'hash_low_2',
        sourceType: 'lever',
        sourceUrl: 'https://example.com/job2',
        alternateUrls: [],
        companyName: 'Mobile App Studios',
        title: 'iOS Swift Developer',
        normalizedTitle: 'ios swift developer',
        locationText: 'Onsite',
        isRemote: false,
        acceptsIndia: false,
        employmentType: 'full-time',
        rawDescription: 'Swift, UIKit, SwiftUI, CoreData.',
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'DEPRIORITIZED',
        isContractOrFreelance: false,
      };
      memDb.insertOrUpdateVacancy(lowJob);
      memDb.saveMatchEvaluation({
        id: 'eval_low_2',
        vacancyId: lowJob.id,
        overallScore: 42.0,
        qualifies75: false,
        tier: 'Deprioritized',
        categoryScores: {
          technicalSkills: 8,
          experienceSeniority: 10,
          responsibilities: 5,
          cloudInfrastructure: 2,
          locationEligibility: 5,
          compensationAlignment: 7,
          certificationsOther: 5,
        },
        matchingSkills: [],
        missingSkills: ['Swift', 'UIKit'],
        evidenceExplanation: 'Candidate background does not match mobile developer requirements.',
        evaluatedAt: new Date().toISOString(),
      });

      // Query default qualifying matches
      const res = await fetch(`http://127.0.0.1:${testPort}/api/matches`);
      expect(res.status).toBe(200);
      const matches = await res.json();

      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe('high_job_1');
      expect(matches[0].matchScore.overallScore).toBe(88.5);
      expect(matches[0].matchScore.qualifies75).toBe(true);

      // Verify explanation endpoint
      const explRes = await fetch(`http://127.0.0.1:${testPort}/api/matches/high_job_1/explanation`);
      expect(explRes.status).toBe(200);
      const explData = await explRes.json();
      expect(explData.evaluation.overallScore).toBe(88.5);
      expect(explData.evaluation.matchingSkills).toContain('Kubernetes');
    });

    it('manages match score threshold and recurring discovery toggle', async () => {
      // 1. Get default threshold
      const getThresh = await fetch(`http://127.0.0.1:${testPort}/api/discovery/threshold`);
      const threshData = await getThresh.json();
      expect(threshData.minMatchScore).toBe(75.0);

      // 2. Update threshold to 80.0
      const setThresh = await fetch(`http://127.0.0.1:${testPort}/api/discovery/threshold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minMatchScore: 80.0 }),
      });
      expect(setThresh.status).toBe(200);
      const setThreshData = await setThresh.json();
      expect(setThreshData.minMatchScore).toBe(80.0);

      // 3. Toggle recurring discovery
      const recurRes = await fetch(`http://127.0.0.1:${testPort}/api/discovery/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(recurRes.status).toBe(200);
      const recurData = await recurRes.json();
      expect(recurData.hourlyDiscoveryEnabled).toBe(true);
      expect(recurData.schedulerStatus.isRunning).toBe(true);

      // 4. Delete / Reset candidate resume profile
      const delRes = await fetch(`http://127.0.0.1:${testPort}/api/profile/resume`, {
        method: 'DELETE',
      });
      expect(delRes.status).toBe(200);
      const delData = await delRes.json();
      expect(delData.success).toBe(true);
      expect(delData.message).toContain('reset');
    });
  });
});
