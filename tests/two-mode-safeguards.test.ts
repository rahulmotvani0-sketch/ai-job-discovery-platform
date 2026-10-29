import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { DatabaseManager } from '../src/core/database.js';
import { MasterOrchestrator } from '../src/automation/orchestrator.js';
import { InterviewSchedulingEngine } from '../src/automation/interview-engine.js';
import type { IGmailService } from '../src/integrations/google/gmail.js';
import type { DiscoveryManager } from '../src/discovery/connectors/manager.js';

describe('Two-Mode Design (Demo vs Personal vs Production) & Submission Safeguards', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Config Mode Parsing & Defaults', () => {
    it('defaults appMode to demo when APP_MODE is unset in development', () => {
      delete process.env.APP_MODE;
      process.env.NODE_ENV = 'development';
      const cfg = loadConfig('/dev/null');
      expect(cfg.appMode).toBe('demo');
      expect(cfg.applicationSubmissionEnabled).toBe(false);
    });

    it('forces applicationSubmissionEnabled to false in demo mode even if env variable is true', () => {
      process.env.APP_MODE = 'demo';
      process.env.APPLICATION_SUBMISSION_ENABLED = 'true';
      const cfg = loadConfig('/dev/null');
      expect(cfg.appMode).toBe('demo');
      expect(cfg.applicationSubmissionEnabled).toBe(false);
    });

    it('enables applicationSubmissionEnabled only when explicitly configured in personal mode', () => {
      process.env.APP_MODE = 'personal';
      process.env.APPLICATION_SUBMISSION_ENABLED = 'false';
      let cfg = loadConfig('/dev/null');
      expect(cfg.appMode).toBe('personal');
      expect(cfg.applicationSubmissionEnabled).toBe(false);

      process.env.APPLICATION_SUBMISSION_ENABLED = 'true';
      cfg = loadConfig('/dev/null');
      expect(cfg.appMode).toBe('personal');
      expect(cfg.applicationSubmissionEnabled).toBe(true);
    });

    it('throws validation error on invalid APP_MODE value', () => {
      process.env.APP_MODE = 'invalid-mode';
      expect(() => loadConfig('/dev/null')).toThrow(/Invalid APP_MODE: invalid-mode/);
    });
  });

  describe('Synthetic Demo Assets', () => {
    it('provides valid synthetic demo-profile.json', () => {
      const profilePath = join(process.cwd(), 'examples', 'demo-profile.json');
      expect(existsSync(profilePath)).toBe(true);
      const content = JSON.parse(readFileSync(profilePath, 'utf-8'));
      expect(content.fullName).toBe('Alex Chen');
      expect(content.email).toBe('alex.chen.demo@example.com');
      expect(content.experiences.length).toBeGreaterThanOrEqual(2);
      expect(content.skills).toBeDefined();
    });

    it('provides valid synthetic mock vacancies and recruiter replies', () => {
      const vacPath = join(process.cwd(), 'examples', 'mock-data', 'mock-vacancies.json');
      const repliesPath = join(process.cwd(), 'examples', 'mock-data', 'mock-recruiter-replies.json');
      expect(existsSync(vacPath)).toBe(true);
      expect(existsSync(repliesPath)).toBe(true);

      const vacancies = JSON.parse(readFileSync(vacPath, 'utf-8'));
      const replies = JSON.parse(readFileSync(repliesPath, 'utf-8'));
      expect(vacancies.length).toBeGreaterThan(0);
      expect(replies.length).toBeGreaterThan(0);
    });
  });

  describe('MasterOrchestrator Submission Safety Gate', () => {
    let db: DatabaseManager;

    beforeEach(() => {
      db = new DatabaseManager(':memory:');
    });

    afterEach(() => {
      db.close();
    });

    it('simulates submission safely in demo mode without calling real external APIs', async () => {
      process.env.APP_MODE = 'demo';
      const mockGmail: IGmailService = {
        sendApprovedApplication: vi.fn(),
        fetchRecruiterResponses: vi.fn(),
      };
      const mockDiscovery = {
        runAllConnectors: vi.fn(),
        getConnector: vi.fn(),
        listConnectors: vi.fn(),
      } as unknown as DiscoveryManager;

      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager: mockDiscovery,
        gmailService: mockGmail,
      });

      // Seed a vacancy and draft
      db.insertOrUpdateVacancy({
        id: 'test_vac_demo',
        sourceId: 'src_demo',
        sourceType: 'ashby',
        sourceUrl: 'https://example.com/job',
        title: 'Senior Engineer',
        company: 'DemoCorp',
        location: 'Remote',
        isRemote: true,
        description: 'Test description',
        status: 'AWAITING_APPROVAL',
      });

      db.saveApplicationDraft({
        id: 'test_draft_demo',
        vacancyId: 'test_vac_demo',
        recipientEmail: 'jobs@democorp.example',
        subject: 'Application for Senior Engineer',
        bodyText: 'Hello DemoCorp',
        bodyHtml: '<p>Hello DemoCorp</p>',
        status: 'AWAITING_APPROVAL',
      });

      // In demo mode, approveAndSend should simulate and succeed without calling gmailService
      const submission = await orchestrator.approveAndSend('test_draft_demo', 'test_user');
      expect(submission).toBeDefined();
      expect(submission.status).toBe('SENT');
      expect(submission.channel).toBe('GMAIL_API');
      expect(submission.gmailMessageId || (submission as any).messageId).toMatch(/^demo_msg_/);
      expect(mockGmail.sendApprovedApplication).not.toHaveBeenCalled();
    });

    it('rejects sending application in personal mode if APPLICATION_SUBMISSION_ENABLED is false', async () => {
      process.env.APP_MODE = 'personal';
      process.env.APPLICATION_SUBMISSION_ENABLED = 'false';

      const mockGmail: IGmailService = {
        sendApprovedApplication: vi.fn(),
        fetchRecruiterResponses: vi.fn(),
      };
      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager: {} as any,
        gmailService: mockGmail,
      });

      db.insertOrUpdateVacancy({
        id: 'vac_gate_test',
        sourceId: 'src_gate',
        sourceType: 'ashby',
        sourceUrl: 'https://example.com',
        title: 'Lead SRE',
        company: 'GateCorp',
        location: 'Remote',
        isRemote: true,
        description: 'Description',
        status: 'AWAITING_APPROVAL',
      });

      db.saveApplicationDraft({
        id: 'draft_gate_test',
        vacancyId: 'vac_gate_test',
        recipientEmail: 'jobs@gatecorp.example',
        subject: 'Lead SRE Application',
        status: 'AWAITING_APPROVAL',
      });

      await expect(orchestrator.approveAndSend('draft_gate_test', 'test_user')).rejects.toThrow(
        /Application submission is disabled \(APPLICATION_SUBMISSION_ENABLED=false\)/
      );
      expect(mockGmail.sendApprovedApplication).not.toHaveBeenCalled();
    });
  });

  describe('InterviewSchedulingEngine Follow-Up Safety Gate', () => {
    let db: DatabaseManager;

    beforeEach(() => {
      db = new DatabaseManager(':memory:');
    });

    afterEach(() => {
      db.close();
    });

    it('simulates follow-up reply safely in demo mode without calling real external APIs', async () => {
      process.env.APP_MODE = 'demo';
      const mockGmail: IGmailService = {
        sendApprovedApplication: vi.fn(),
        fetchRecruiterResponses: vi.fn(),
        sendFollowUpReply: vi.fn(),
      };

      const engine = new InterviewSchedulingEngine({
        db,
        gmailService: mockGmail,
      });

      // Seed interaction and follow up draft
      db.saveRecruiterInteraction({
        id: 'inter_demo_01',
        submissionId: 'sub_demo_01',
        senderEmail: 'recruiter@example.com',
        companyName: 'Cloud Corp',
        subject: 'Interview with Cloud Corp',
        snippet: 'Are you available to talk?',
        detectedIntent: 'INTERVIEW_INVITATION',
        actionRequired: true,
        receivedAt: new Date().toISOString(),
      });

      db.saveInterviewFollowUpDraft({
        id: 'draft_followup_01',
        interactionId: 'inter_demo_01',
        recipientEmail: 'recruiter@example.com',
        recipientName: 'Recruiter Jane',
        subject: 'Re: Interview with Cloud Corp',
        body: 'I would be delighted to speak. Here is my availability...',
        suggestedSlots: ['2026-10-30T15:00:00Z'],
        status: 'PENDING_APPROVAL',
      });

      const result = await engine.approveAndSendDraft('draft_followup_01');
      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^demo_interview_msg_/);
      expect(result.draft.status).toBe('SENT');
      expect(mockGmail.sendFollowUpReply).not.toHaveBeenCalled();
    });

    it('rejects follow-up reply transmission in personal mode if APPLICATION_SUBMISSION_ENABLED is false', async () => {
      process.env.APP_MODE = 'personal';
      process.env.APPLICATION_SUBMISSION_ENABLED = 'false';

      const mockGmail: IGmailService = {
        sendApprovedApplication: vi.fn(),
        fetchRecruiterResponses: vi.fn(),
        sendFollowUpReply: vi.fn(),
      };

      const engine = new InterviewSchedulingEngine({
        db,
        gmailService: mockGmail,
      });

      db.saveRecruiterInteraction({
        id: 'inter_gate_01',
        senderEmail: 'recruiter@example.com',
        subject: 'Interview',
        snippet: 'Availability?',
        detectedIntent: 'INTERVIEW_INVITATION',
        actionRequired: true,
      });

      db.saveInterviewFollowUpDraft({
        id: 'draft_gate_01',
        interactionId: 'inter_gate_01',
        recipientEmail: 'recruiter@example.com',
        subject: 'Re: Interview',
        body: 'Availability info',
        status: 'PENDING_APPROVAL',
      });

      await expect(engine.approveAndSendDraft('draft_gate_01')).rejects.toThrow(
        /Email response transmission is disabled \(APPLICATION_SUBMISSION_ENABLED=false\)/
      );
      expect(mockGmail.sendFollowUpReply).not.toHaveBeenCalled();
    });
  });
});
