import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig } from '../src/config/index.js';
import { DatabaseManager } from '../src/core/database.js';
import { MasterOrchestrator } from '../src/automation/orchestrator.js';
import { InterviewSchedulingEngine } from '../src/automation/interview-engine.js';
import type { IGmailService } from '../src/integrations/google/gmail.js';
import type { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import {
  TEST_VACANCY,
  TEST_CANDIDATE_PROFILE,
  TEST_RECRUITER_INTERACTION,
} from './fixtures/test-fixtures.js';

describe('Clean Personal Default Architecture & Submission Safety Gates', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Config Mode Parsing & Safe Defaults', () => {
    it('defaults appMode to personal with safe submission gates when APP_MODE is unset', () => {
      delete process.env.APP_MODE;
      delete process.env.DATABASE_SEED;
      delete process.env.APPLICATION_SUBMISSION_ENABLED;
      delete process.env.HOURLY_DISCOVERY;
      delete process.env.CLOUD_DISABLED;
      process.env.NODE_ENV = 'development';

      const cfg = loadConfig('/dev/null');
      expect(cfg.appMode).toBe('personal');
      expect(cfg.databaseSeed).toBe(false);
      expect(cfg.applicationSubmissionEnabled).toBe(false);
      expect(cfg.hourlyDiscovery).toBe(false);
      expect(cfg.cloudDisabled).toBe(true);
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

  describe('Empty Database & Onboarding Requirements', () => {
    it('initializes with completely empty database without fabricated records', () => {
      const db = new DatabaseManager(':memory:');
      try {
        expect(db.getUserProfile()).toBeNull();
        expect(db.listVacancies().length).toBe(0);
        expect(db.listDrafts().length).toBe(0);
        expect(db.listSubmissions().length).toBe(0);
        expect(db.listRecruiterInteractions().length).toBe(0);
      } finally {
        db.close();
      }
    });

    it('persists real user candidate profile when onboarding is completed', () => {
      const db = new DatabaseManager(':memory:');
      try {
        expect(db.getUserProfile()).toBeNull();
        db.saveUserProfile(TEST_CANDIDATE_PROFILE);

        const saved = db.getUserProfile();
        expect(saved).not.toBeNull();
        expect(saved?.fullName).toBe('Test Candidate');
        expect(saved?.email).toBe('test.candidate@example.com');
      } finally {
        db.close();
      }
    });
  });

  describe('Isolated Test Fixtures', () => {
    it('verifies deterministic test fixtures are isolated under tests/fixtures/', () => {
      expect(TEST_VACANCY.id).toBe('test-vacancy-001');
      expect(TEST_VACANCY.companyName).toBe('Test Company');
      expect(TEST_CANDIDATE_PROFILE.fullName).toBe('Test Candidate');
      expect(TEST_RECRUITER_INTERACTION.detectedIntent).toBe('INTERVIEW_INVITATION');
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
        getRegistry: vi.fn(),
      } as unknown as DiscoveryManager;
      const mockRouter = {
        getMode: () => 'local-only',
      } as any;

      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager: mockDiscovery,
        router: mockRouter,
        gmailService: mockGmail,
      });

      db.insertOrUpdateVacancy(TEST_VACANCY);

      db.saveApplicationDraft({
        id: 'test_draft_demo',
        vacancyId: TEST_VACANCY.id,
        recipientEmail: 'jobs@example.com',
        subject: 'Application for Test Engineer',
        bodyText: 'Hello Test Corp',
        bodyHtml: '<p>Hello Test Corp</p>',
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
      const mockDiscovery = {
        runAllConnectors: vi.fn(),
        getRegistry: vi.fn(),
      } as unknown as DiscoveryManager;
      const mockRouter = {
        getMode: () => 'local-only',
      } as any;

      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager: mockDiscovery,
        router: mockRouter,
        gmailService: mockGmail,
      });

      db.insertOrUpdateVacancy(TEST_VACANCY);

      db.saveApplicationDraft({
        id: 'test_draft_locked',
        vacancyId: TEST_VACANCY.id,
        recipientEmail: 'jobs@example.com',
        subject: 'Application for Test Engineer',
        bodyText: 'Hello Test Corp',
        bodyHtml: '<p>Hello Test Corp</p>',
        status: 'AWAITING_APPROVAL',
      });

      await expect(
        orchestrator.approveAndSend('test_draft_locked', 'test_user')
      ).rejects.toThrow(/APPLICATION_SUBMISSION_ENABLED=false/);

      expect(mockGmail.sendApprovedApplication).not.toHaveBeenCalled();
    });

    it('allows sending application in personal mode only when APPLICATION_SUBMISSION_ENABLED is true and draft is approved', async () => {
      process.env.APP_MODE = 'personal';
      process.env.APPLICATION_SUBMISSION_ENABLED = 'true';

      const mockGmail: IGmailService = {
        sendApprovedApplication: vi.fn().mockImplementation(async (draftId: string) => {
          const sub = {
            id: 'sub_test_allowed',
            draftId,
            vacancyId: TEST_VACANCY.id,
            sentAt: new Date().toISOString(),
            approvedBy: 'test_user',
            channel: 'GMAIL_API' as const,
            gmailMessageId: 'gmail_live_msg_123',
            gmailThreadId: 'gmail_live_thread_123',
            status: 'SENT' as const,
            auditHash: 'audit_test_allowed',
          };
          db.saveSubmission(sub);
          return {
            messageId: 'gmail_live_msg_123',
            threadId: 'gmail_live_thread_123',
          };
        }),
        fetchRecruiterResponses: vi.fn(),
      };
      const mockDiscovery = {
        runAllConnectors: vi.fn(),
        getRegistry: vi.fn(),
      } as unknown as DiscoveryManager;
      const mockRouter = {
        getMode: () => 'local-only',
      } as any;

      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager: mockDiscovery,
        router: mockRouter,
        gmailService: mockGmail,
      });

      db.insertOrUpdateVacancy(TEST_VACANCY);

      db.saveApplicationDraft({
        id: 'test_draft_allowed',
        vacancyId: TEST_VACANCY.id,
        recipientEmail: 'jobs@example.com',
        subject: 'Application for Test Engineer',
        bodyText: 'Hello Test Corp',
        bodyHtml: '<p>Hello Test Corp</p>',
        status: 'AWAITING_APPROVAL',
      });

      const submission = await orchestrator.approveAndSend('test_draft_allowed', 'test_user');
      expect(submission).toBeDefined();
      expect(submission.status).toBe('SENT');
      expect(submission.gmailMessageId).toBe('gmail_live_msg_123');
      expect(mockGmail.sendApprovedApplication).toHaveBeenCalledTimes(1);
    });
  });

  describe('InterviewEngine Follow-Up Safety Gate', () => {
    let db: DatabaseManager;

    beforeEach(() => {
      db = new DatabaseManager(':memory:');
    });

    afterEach(() => {
      db.close();
    });

    it('simulates recruiter reply dispatch safely in demo mode', async () => {
      process.env.APP_MODE = 'demo';
      const mockGmail: IGmailService = {
        sendApprovedApplication: vi.fn(),
        fetchRecruiterResponses: vi.fn(),
      };
      const engine = new InterviewSchedulingEngine(db, mockGmail);

      db.saveRecruiterInteraction(TEST_RECRUITER_INTERACTION);

      db.saveInterviewFollowUpDraft({
        id: 'draft_followup_01',
        interactionId: TEST_RECRUITER_INTERACTION.id,
        proposedSlots: ['2026-11-01T14:00:00Z'],
        draftSubject: 'Re: Interview Schedule Invitation',
        draftBody: 'Thank you for reaching out. I am available at the suggested time.',
        status: 'PENDING_APPROVAL',
        confidenceScore: 90,
      });

      const result = await engine.approveAndSendDraft('draft_followup_01');
      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^demo_interview_msg_/);
      expect(mockGmail.sendApprovedApplication).not.toHaveBeenCalled();
    });

    it('rejects recruiter reply dispatch if APPLICATION_SUBMISSION_ENABLED is false', async () => {
      process.env.APP_MODE = 'personal';
      process.env.APPLICATION_SUBMISSION_ENABLED = 'false';
      const mockGmail: IGmailService = {
        sendApprovedApplication: vi.fn(),
        fetchRecruiterResponses: vi.fn(),
      };
      const engine = new InterviewSchedulingEngine(db, mockGmail);

      db.saveRecruiterInteraction(TEST_RECRUITER_INTERACTION);

      db.saveInterviewFollowUpDraft({
        id: 'draft_followup_02',
        interactionId: TEST_RECRUITER_INTERACTION.id,
        proposedSlots: ['2026-11-01T14:00:00Z'],
        draftSubject: 'Re: Interview Schedule Invitation',
        draftBody: 'Thank you for reaching out.',
        status: 'PENDING_APPROVAL',
        confidenceScore: 90,
      });

      await expect(
        engine.approveAndSendDraft('draft_followup_02')
      ).rejects.toThrow(/APPLICATION_SUBMISSION_ENABLED=false/);

      expect(mockGmail.sendApprovedApplication).not.toHaveBeenCalled();
    });
  });
});
