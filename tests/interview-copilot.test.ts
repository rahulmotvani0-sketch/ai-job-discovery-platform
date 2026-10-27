import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { InterviewCopilotEngine } from '../src/automation/interview-copilot.js';
import { ApplicationServer } from '../src/server.js';
import { MasterOrchestrator } from '../src/automation/orchestrator.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import type { IGmailService } from '../src/integrations/google/gmail.js';
import type { Vacancy, RecruiterInteraction } from '../src/types/index.js';

describe('Interview Preparation & Company Intelligence Copilot Suite', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
    vi.restoreAllMocks();
  });

  describe('1. Dossier Generation & Intelligence Synthesis', () => {
    it('generates a complete, grounded dossier given company and role title', async () => {
      const copilot = new InterviewCopilotEngine(db);
      const dossier = await copilot.generateDossier({
        companyName: 'Stripe',
        jobTitle: 'Senior Infrastructure Engineer',
        jobDescription: 'Build high-reliability distributed systems using Kubernetes, Go, and AWS for global payment infrastructure.'
      });

      expect(dossier.id).toBeDefined();
      expect(dossier.companyName).toBe('Stripe');
      expect(dossier.jobTitle).toBe('Senior Infrastructure Engineer');

      // Company Intelligence
      expect(dossier.companyIntelligence.name).toBe('Stripe');
      expect(dossier.companyIntelligence.industry).toContain('FinTech');
      expect(dossier.companyIntelligence.coreTechStack).toContain('Kubernetes');
      expect(dossier.companyIntelligence.coreTechStack).toContain('Go');
      expect(dossier.companyIntelligence.coreTechStack).toContain('AWS');
      expect(dossier.companyIntelligence.cultureHighlights.length).toBeGreaterThan(0);

      // Role Focus Areas
      expect(dossier.roleFocusAreas.length).toBeGreaterThan(0);

      // Technical Questions
      expect(dossier.technicalQuestions.length).toBeGreaterThanOrEqual(4);
      dossier.technicalQuestions.forEach(q => {
        expect(q.question).toBeDefined();
        expect(q.category).toBeDefined();
        expect(['EASY', 'MEDIUM', 'HARD']).toContain(q.difficulty);
        expect(q.candidateTalkingPoints.length).toBeGreaterThan(0);
        expect(q.suggestedAnswerFramework).toBeDefined();
      });

      // Behavioral STAR Questions
      expect(dossier.behavioralQuestions.length).toBeGreaterThanOrEqual(3);
      dossier.behavioralQuestions.forEach(b => {
        expect(b.question).toBeDefined();
        expect(b.competency).toBeDefined();
        expect(b.starFramework.situation).toBeDefined();
        expect(b.starFramework.task).toBeDefined();
        expect(b.starFramework.action).toBeDefined();
        expect(b.starFramework.result).toBeDefined();
        expect(b.candidateProjectTieIn).toBeDefined();
      });

      // Questions for Interviewer
      expect(dossier.questionsForInterviewer.length).toBeGreaterThanOrEqual(4);

      // Compensation Benchmark
      expect(dossier.compensationBenchmark.estimatedMin).toBeGreaterThan(100000);
      expect(dossier.compensationBenchmark.estimatedMax).toBeGreaterThan(dossier.compensationBenchmark.estimatedMin);
      expect(dossier.compensationBenchmark.negotiationTips.length).toBeGreaterThan(0);

      // Key Advice
      expect(dossier.keyAdvice.length).toBeGreaterThan(0);
    });

    it('generates dossier from an existing Vacancy record in SQLite', async () => {
      const vacancy: Vacancy = {
        id: 'vac_stripe_101',
        canonicalHash: 'hash_stripe_101',
        sourceType: 'greenhouse',
        sourceUrl: 'https://careers.datadoghq.com/job/101',
        alternateUrls: [],
        companyName: 'Datadog',
        title: 'Lead Platform Reliability Architect',
        normalizedTitle: 'lead platform reliability architect',
        locationText: 'Remote, US',
        isRemote: true,
        acceptsIndia: true,
        employmentType: 'full_time',
        rawDescription: 'Scale telemetry ingestion pipelines, optimize Kafka cluster throughput, and lead SRE architecture.',
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'QUALIFIED',
        isContractOrFreelance: false,
      };
      db.insertOrUpdateVacancy(vacancy);

      const copilot = new InterviewCopilotEngine(db);
      const dossier = await copilot.generateDossier({ vacancyId: vacancy.id });

      expect(dossier.vacancyId).toBe('vac_stripe_101');
      expect(dossier.companyName).toBe('Datadog');
      expect(dossier.jobTitle).toBe('Lead Platform Reliability Architect');
      expect(dossier.compensationBenchmark.estimatedMin).toBeGreaterThanOrEqual(180000); // Lead tier
    });

    it('generates dossier from an inbound RecruiterInteraction', async () => {
      const interaction: RecruiterInteraction = {
        id: 'inter_figma_call',
        submissionId: 'sub_123',
        threadId: 'th_figma',
        messageId: 'msg_figma',
        senderEmail: 'recruiting@figma.com',
        subject: 'Figma Interview: Senior Frontend Systems Engineer',
        snippet: 'We would love to invite you to discuss our WebGL and rendering engine.',
        detectedIntent: 'INTERVIEW_INVITATION',
        actionRequired: true,
        receivedAt: new Date().toISOString(),
        companyName: 'Figma',
        jobTitle: 'Senior Frontend Systems Engineer',
        replyStatus: 'DRAFTED'
      };
      db.saveRecruiterInteraction(interaction);

      const copilot = new InterviewCopilotEngine(db);
      const dossier = await copilot.getOrGenerateDossier({ interactionId: interaction.id });

      expect(dossier.interactionId).toBe('inter_figma_call');
      expect(dossier.companyName).toBe('Figma');
      expect(dossier.jobTitle).toBe('Senior Frontend Systems Engineer');
    });
  });

  describe('2. SQLite Persistence & Retrieval', () => {
    it('persists dossier and allows retrieval by ID, interactionId, and vacancyId', async () => {
      const copilot = new InterviewCopilotEngine(db);
      const dossier = await copilot.generateDossier({
        interactionId: 'inter_test_99',
        vacancyId: 'vac_test_99',
        companyName: 'Snowflake',
        jobTitle: 'Principal Cloud Systems Engineer'
      });

      const byId = db.getInterviewPrepDossierById(dossier.id);
      expect(byId).not.toBeNull();
      expect(byId?.companyName).toBe('Snowflake');
      expect(byId?.jobTitle).toBe('Principal Cloud Systems Engineer');
      expect(byId?.technicalQuestions.length).toBeGreaterThan(0);

      const byInteraction = db.getInterviewPrepDossierByInteractionId('inter_test_99');
      expect(byInteraction?.id).toBe(dossier.id);

      const byVacancy = db.getInterviewPrepDossierByVacancyId('vac_test_99');
      expect(byVacancy?.id).toBe(dossier.id);

      const list = db.listInterviewPrepDossiers();
      expect(list.length).toBeGreaterThanOrEqual(1);

      db.deleteInterviewPrepDossier(dossier.id);
      expect(db.getInterviewPrepDossierById(dossier.id)).toBeNull();
    });
  });

  describe('3. REST API Endpoints Integration', () => {
    let server: ApplicationServer;
    let apiDb: DatabaseManager;
    const testPort = 3899;
    const baseUrl = `http://127.0.0.1:${testPort}`;

    beforeAll(async () => {
      apiDb = new DatabaseManager(':memory:');
      const mockGmail: IGmailService = {
        isReady: () => false,
        getStatus: () => ({ email: null, isAuthorized: false, hasRefreshToken: false, tokenExpiresAt: null }),
        getSendingAccount: () => null,
        generateAuthUrl: () => 'https://mock.auth',
        handleOAuthCallback: async () => {},
        disconnect: () => {},
        fetchRecruiterResponses: async () => [],
        sendApprovedApplication: async () => ({ messageId: 'm1', threadId: 't1' }),
        sendFollowUpReply: async (p) => ({ messageId: 'm1', threadId: p.threadId || 't1' }),
        syncEmails: async () => ({ synced: 0, newResponses: 0 }),
      };

      const discoveryManager = new DiscoveryManager(apiDb);
      const orchestrator = new MasterOrchestrator({
        db: apiDb,
        discoveryManager,
        gmailService: mockGmail,
      });

      server = new ApplicationServer({
        port: testPort,
        db: apiDb,
        orchestrator,
      });
      await server.start();
    });

    afterAll(async () => {
      if (server) {
        await server.stop();
      }
      try {
        apiDb.close();
      } catch {}
    });

    it('POST /api/interview-prep/generate creates dossier and returns 201', async () => {
      const res = await fetch(`${baseUrl}/api/interview-prep/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: 'Linear',
          jobTitle: 'Staff Infrastructure Architect',
          jobDescription: 'Build high-speed syncing engines with SQLite, TypeScript, and AWS.'
        })
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.dossier.companyName).toBe('Linear');
      expect(body.dossier.technicalQuestions.length).toBeGreaterThan(0);
      expect(body.dossier.compensationBenchmark.estimatedMin).toBeGreaterThan(150000);
    });

    it('GET /api/interview-prep lists all persisted dossiers', async () => {
      // Seed one dossier
      await fetch(`${baseUrl}/api/interview-prep/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: 'Notion',
          jobTitle: 'Senior SRE'
        })
      });

      const res = await fetch(`${baseUrl}/api/interview-prep`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.count).toBeGreaterThanOrEqual(1);
      expect(body.dossiers[0].companyName).toBe('Notion');
    });

    it('GET /api/interview-prep/interaction/:id retrieves or generates dossier', async () => {
      const interaction: RecruiterInteraction = {
        id: 'inter_notion_int',
        submissionId: '',
        threadId: 'th_notion',
        messageId: 'msg_notion',
        senderEmail: 'recruiter@notion.so',
        subject: 'Notion Technical Interview',
        snippet: 'Please let us know your availability for next Tuesday.',
        detectedIntent: 'INTERVIEW_INVITATION',
        actionRequired: true,
        receivedAt: new Date().toISOString(),
        companyName: 'Notion',
        jobTitle: 'Staff Backend Engineer',
        replyStatus: 'DRAFTED'
      };
      apiDb.saveRecruiterInteraction(interaction);

      const res = await fetch(`${baseUrl}/api/interview-prep/interaction/inter_notion_int`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.dossier.companyName).toBe('Notion');
      expect(body.dossier.jobTitle).toBe('Staff Backend Engineer');
    });

    it('DELETE /api/interview-prep/:id deletes dossier', async () => {
      const createRes = await fetch(`${baseUrl}/api/interview-prep/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: 'Vercel',
          jobTitle: 'Edge Systems Engineer'
        })
      });
      const createData = await createRes.json();
      const dossierId = createData.dossier.id;

      const delRes = await fetch(`${baseUrl}/api/interview-prep/${dossierId}`, {
        method: 'DELETE'
      });
      expect(delRes.status).toBe(200);

      const getRes = await fetch(`${baseUrl}/api/interview-prep/${dossierId}`);
      expect(getRes.status).toBe(404);
    });
  });
});
