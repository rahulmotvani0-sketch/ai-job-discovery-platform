import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { InterviewSchedulingEngine } from '../src/automation/interview-engine.js';
import { AlertNotificationManager } from '../src/notifications/alert-manager.js';
import type { IGmailService } from '../src/integrations/google/gmail.js';
import { ApplicationServer } from '../src/server.js';
import { MasterOrchestrator } from '../src/automation/orchestrator.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';

describe('Recruiter Response Follow-Up & Interview Scheduling Engine Suite', () => {
  let db: DatabaseManager;
  let mockGmailService: IGmailService;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    mockGmailService = {
      isReady: () => false,
      getStatus: () => ({ email: null, isAuthorized: false, hasRefreshToken: false, tokenExpiresAt: null }),
      getSendingAccount: () => null,
      generateAuthUrl: () => 'https://mock.auth',
      handleOAuthCallback: async () => {},
      disconnect: () => {},
      fetchRecruiterResponses: async () => [],
      sendApprovedApplication: async () => ({ messageId: 'm1', threadId: 't1' }),
      sendFollowUpReply: async (params) => ({
        messageId: `sent_${Date.now()}`,
        threadId: params.threadId || `thread_${Date.now()}`,
      }),
      syncEmails: async () => ({ synced: 0, newResponses: 0 }),
    };
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  describe('1. Intent Classification Accuracy', () => {
    it('correctly classifies INTERVIEW_INVITATION and flags actionRequired = true', () => {
      const engine = new InterviewSchedulingEngine({ db });
      const result = engine.classifyRecruiterIntent(
        'Interview Invitation: Linear - Senior DevOps Engineer',
        "Hi Rahul, we reviewed your profile and would love to schedule a 30-minute virtual interview with our engineering manager next week."
      );

      expect(result.intent).toBe('INTERVIEW_INVITATION');
      expect(result.actionRequired).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    it('correctly classifies TECHNICAL_ASSESSMENT with actionRequired = true', () => {
      const engine = new InterviewSchedulingEngine({ db });
      const result = engine.classifyRecruiterIntent(
        'Next steps: Palantir Technical Assessment',
        'Please complete this HackerRank coding challenge within 48 hours to proceed with the next round.'
      );

      expect(result.intent).toBe('TECHNICAL_ASSESSMENT');
      expect(result.actionRequired).toBe(true);
    });

    it('correctly classifies AVAILABILITY_REQUEST with actionRequired = true', () => {
      const engine = new InterviewSchedulingEngine({ db });
      const result = engine.classifyRecruiterIntent(
        'Availability check for Staff SRE role',
        'Could you share your available times for a quick introductory discussion with our talent team?'
      );

      expect(result.intent).toBe('AVAILABILITY_REQUEST');
      expect(result.actionRequired).toBe(true);
    });

    it('correctly classifies OFFER with actionRequired = true', () => {
      const engine = new InterviewSchedulingEngine({ db });
      const result = engine.classifyRecruiterIntent(
        'Formal Offer Letter: Senior Cloud Infrastructure Lead',
        'We are pleased to offer you the position of Senior Cloud Infrastructure Lead. Please find your compensation package attached.'
      );

      expect(result.intent).toBe('OFFER');
      expect(result.actionRequired).toBe(true);
    });

    it('correctly classifies REJECTION with actionRequired = false', () => {
      const engine = new InterviewSchedulingEngine({ db });
      const result = engine.classifyRecruiterIntent(
        'Update regarding your application',
        'Unfortunately, after careful review of all candidates, we have decided to move forward with other applicants at this time.'
      );

      expect(result.intent).toBe('REJECTION');
      expect(result.actionRequired).toBe(false);
    });

    it('correctly classifies ACKNOWLEDGEMENT with actionRequired = false', () => {
      const engine = new InterviewSchedulingEngine({ db });
      const result = engine.classifyRecruiterIntent(
        'Application Received: Datadog SRE',
        'Thank you for applying to Datadog. We have received your application and our recruiting team is currently reviewing your resume.'
      );

      expect(result.intent).toBe('ACKNOWLEDGEMENT');
      expect(result.actionRequired).toBe(false);
    });
  });

  describe('2. Grounded Available Slot Generation', () => {
    it('generates meeting slots matching candidate working days and time windows', () => {
      const engine = new InterviewSchedulingEngine({ db });
      db.saveSchedulingPreferences({
        timezone: 'Asia/Kolkata',
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        timeWindows: [{ start: '15:00', end: '19:00' }],
        meetingDurationMinutes: 45,
        noticeHours: 24,
      });

      const slots = engine.generateAvailableSlots();
      expect(slots.length).toBeGreaterThanOrEqual(1);
      expect(slots[0]).toContain('Asia/Kolkata');
      expect(slots[0]).toContain('PM');
    });

    it('respects custom duration and preferences', () => {
      const engine = new InterviewSchedulingEngine({ db });
      const customSlots = engine.generateAvailableSlots({
        timezone: 'UTC',
        meetingDurationMinutes: 30,
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        timeWindows: [{ start: '10:00', end: '12:00' }],
      }, 5, 2);

      expect(customSlots.length).toBe(2);
      expect(customSlots[0]).toContain('UTC');
      expect(customSlots[0]).toContain('10:00 AM – 10:30 AM');
    });
  });

  describe('3. Automated Follow-Up Draft Generation & Formatting', () => {
    it('generates a polite interview acceptance draft with slots and preferred platforms', () => {
      const engine = new InterviewSchedulingEngine({ db });
      const interaction = {
        id: 'inter_test_1',
        submissionId: '',
        threadId: 'th_123',
        messageId: 'msg_123',
        senderEmail: 'recruiter@linear.app',
        subject: 'Interview with Linear: Senior SRE',
        snippet: 'Would love to schedule a 30-minute virtual interview next week.',
        detectedIntent: 'INTERVIEW_INVITATION' as const,
        actionRequired: true,
        receivedAt: new Date().toISOString(),
        companyName: 'Linear',
        jobTitle: 'Senior Site Reliability Engineer',
      };

      const draft = engine.generateFollowUpDraft(interaction, 'Alex Mercer');

      expect(draft.status).toBe('PENDING_APPROVAL');
      expect(draft.recipientEmail).toBe('recruiter@linear.app');
      expect(draft.companyName).toBe('Linear');
      expect(draft.jobTitle).toBe('Senior Site Reliability Engineer');
      expect(draft.subject).toBe('Re: Interview with Linear: Senior SRE');
      expect(draft.body).toContain('Senior Site Reliability Engineer at Linear');
      expect(draft.body).toContain('available for a');
      expect(draft.suggestedSlots.length).toBeGreaterThan(0);
      expect(draft.body).toContain('Alex Mercer');
    });

    it('generates an appropriate technical assessment acknowledgment draft', () => {
      const engine = new InterviewSchedulingEngine({ db });
      const interaction = {
        id: 'inter_test_2',
        submissionId: '',
        threadId: 'th_456',
        messageId: 'msg_456',
        senderEmail: 'talent@stripe.com',
        subject: 'Stripe Technical Assessment',
        snippet: 'Please complete the take-home challenge within 48 hours.',
        detectedIntent: 'TECHNICAL_ASSESSMENT' as const,
        actionRequired: true,
        receivedAt: new Date().toISOString(),
        companyName: 'Stripe',
        jobTitle: 'Infrastructure Engineer',
      };

      const draft = engine.generateFollowUpDraft(interaction, 'Alex Mercer');
      expect(draft.body).toContain('confirm receipt of the instructions');
      expect(draft.body).toContain('Infrastructure Engineer at Stripe');
    });
  });

  describe('4. Inbound Email Processing, SQLite Persistence & Mobile Alerts', () => {
    it('processes inbound interview invitation, saves in SQLite, stages draft, and dispatches alert', async () => {
      const mockAlertManager = new AlertNotificationManager();
      const alertSpy = vi.spyOn(mockAlertManager, 'notifyRecruiterInteraction').mockResolvedValue({
        telegramSent: true,
        discordSent: false,
      });

      const engine = new InterviewSchedulingEngine({
        db,
        gmailService: mockGmailService,
        alertManager: mockAlertManager,
      });

      const result = await engine.processInboundInteraction({
        senderEmail: 'recruiter@brex.com',
        subject: 'Invitation to interview for Cloud Architect at Brex',
        snippet: 'We would love to chat with our team for an introductory call.',
      });

      expect(result.interaction.detectedIntent).toBe('INTERVIEW_INVITATION');
      expect(result.interaction.actionRequired).toBe(true);
      expect(result.draft).toBeDefined();
      expect(result.draft?.status).toBe('PENDING_APPROVAL');
      expect(result.alertDispatched).toBe(true);
      expect(alertSpy).toHaveBeenCalledTimes(1);

      // Verify in SQLite database
      const storedInteraction = db.getRecruiterInteractionById(result.interaction.id);
      expect(storedInteraction).toBeDefined();
      expect(storedInteraction?.senderEmail).toBe('recruiter@brex.com');
      expect(storedInteraction?.replyStatus).toBe('DRAFTED');

      const storedDraft = db.getInterviewFollowUpDraftByInteractionId(result.interaction.id);
      expect(storedDraft).toBeDefined();
      expect(storedDraft?.id).toBe(result.draft?.id);
      expect(storedDraft?.status).toBe('PENDING_APPROVAL');
    });

    it('processes rejection without creating a draft or triggering high-priority alert', async () => {
      const mockAlertManager = new AlertNotificationManager();
      const alertSpy = vi.spyOn(mockAlertManager, 'notifyRecruiterInteraction');

      const engine = new InterviewSchedulingEngine({
        db,
        alertManager: mockAlertManager,
      });

      const result = await engine.processInboundInteraction({
        senderEmail: 'jobs@acme.com',
        subject: 'Application update from Acme',
        snippet: 'Unfortunately, we have decided to pursue other candidates.',
      });

      expect(result.interaction.detectedIntent).toBe('REJECTION');
      expect(result.interaction.actionRequired).toBe(false);
      expect(result.draft).toBeUndefined();
      expect(result.alertDispatched).toBe(false);
    });
  });

  describe('5. Security Approval Gate & Transmission', () => {
    it('enforces approval gate and transmits reply via Gmail with audit logging', async () => {
      const sendReplySpy = vi.spyOn(mockGmailService, 'sendFollowUpReply');

      const engine = new InterviewSchedulingEngine({
        db,
        gmailService: mockGmailService,
      });

      const { draft } = await engine.processInboundInteraction({
        senderEmail: 'lead-recruiter@notion.so',
        subject: 'Interview with Notion: SRE Team',
        snippet: 'We would love to arrange a 30-minute screening call.',
        threadId: 'notion_thread_99',
        messageId: 'notion_msg_99',
      });

      expect(draft).toBeDefined();
      expect(draft!.status).toBe('PENDING_APPROVAL');

      // Candidate approves and transmits
      const sendResult = await engine.approveAndSendDraft(draft!.id, {
        approvedBy: 'candidate_user',
        updatedBody: 'Updated body: I can connect on Tuesday at 4:00 PM IST.',
      });

      expect(sendResult.success).toBe(true);
      expect(sendResult.draft.status).toBe('SENT');
      expect(sendResult.draft.body).toContain('Updated body: I can connect on Tuesday');
      expect(sendReplySpy).toHaveBeenCalledTimes(1);

      // Verify draft and interaction status in SQLite
      const updatedDraft = db.getInterviewFollowUpDraftById(draft!.id);
      expect(updatedDraft?.status).toBe('SENT');
      expect(updatedDraft?.approvedAt).toBeDefined();
      expect(updatedDraft?.sentAt).toBeDefined();

      const interaction = db.getRecruiterInteractionById(draft!.interactionId);
      expect(interaction?.replyStatus).toBe('SENT');
      expect(interaction?.sentReplyAt).toBeDefined();

      // Verify audit event
      const audits = db.listAuditEvents(5);
      const replyAudit = audits.find(a => a.action === 'INTERVIEW_REPLY_SENT');
      expect(replyAudit).toBeDefined();
      expect(replyAudit?.actor).toBe('candidate_user');
    });

    it('rejects sending drafts that have already been sent', async () => {
      const engine = new InterviewSchedulingEngine({ db, gmailService: mockGmailService });
      const { draft } = await engine.processInboundInteraction({
        senderEmail: 'talent@co.com',
        subject: 'Interview Call',
        snippet: 'Schedule interview',
      });

      await engine.approveAndSendDraft(draft!.id);

      await expect(engine.approveAndSendDraft(draft!.id)).rejects.toThrow('already been sent');
    });

    it('supports dismissing unwanted drafts', async () => {
      const engine = new InterviewSchedulingEngine({ db });
      const { draft } = await engine.processInboundInteraction({
        senderEmail: 'recruiter@co.com',
        subject: 'Interview Call',
        snippet: 'Schedule interview',
      });

      engine.dismissDraft(draft!.id, 'candidate_user');

      const dismissedDraft = db.getInterviewFollowUpDraftById(draft!.id);
      expect(dismissedDraft?.status).toBe('DISMISSED');

      const audits = db.listAuditEvents(5);
      const dismissAudit = audits.find(a => a.action === 'INTERVIEW_DRAFT_DISMISSED');
      expect(dismissAudit).toBeDefined();
    });
  });

  describe('6. REST API Endpoints Integration', () => {
    let server: ApplicationServer;
    let apiDb: DatabaseManager;
    const testPort = 3698;
    const testHost = '127.0.0.1';
    const baseUrl = `http://${testHost}:${testPort}`;

    beforeAll(async () => {
      apiDb = new DatabaseManager(':memory:');
      const discoveryManager = new DiscoveryManager(apiDb);
      const orchestrator = new MasterOrchestrator({
        db: apiDb,
        discoveryManager,
        gmailService: mockGmailService,
      });

      server = new ApplicationServer({
        port: testPort,
        host: testHost,
        db: apiDb,
        orchestrator,
      });

      await server.start();
    });

    afterAll(async () => {
      if (server) {
        await server.stop();
      }
    });

    it('GET /api/recruiter-interactions returns real persisted interactions and metrics', async () => {
      // Simulate an inbound interaction
      const simRes = await fetch(`${baseUrl}/api/recruiter-interactions/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail: 'recruiter@figma.com',
          subject: 'Figma: Interview with the Cloud Platform Team',
          snippet: 'We would love to set up an introductory chat with our engineering manager.',
        }),
      });

      expect(simRes.status).toBe(201);
      const simData = await simRes.json();
      expect(simData.success).toBe(true);
      expect(simData.interaction.detectedIntent).toBe('INTERVIEW_INVITATION');

      // Fetch list
      const listRes = await fetch(`${baseUrl}/api/recruiter-interactions`);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();

      expect(listData.total).toBeGreaterThanOrEqual(1);
      expect(listData.totalInvites).toBeGreaterThanOrEqual(1);
      expect(listData.pendingActions).toBeGreaterThanOrEqual(1);
      expect(listData.interactions[0].companyName).toBe('Figma');
    });

    it('GET /api/interview-drafts and POST /approve endpoint workflow', async () => {
      // 1. Simulate inbound invite
      const simRes = await fetch(`${baseUrl}/api/recruiter-interactions/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail: 'hiring@datadoghq.com',
          subject: 'Datadog Interview: Senior SRE',
          snippet: 'Please let us know your availability for a 30 min chat.',
        }),
      });
      const simData = await simRes.json();
      const draftId = simData.draft.id;

      // 2. Fetch drafts
      const draftsRes = await fetch(`${baseUrl}/api/interview-drafts?status=PENDING_APPROVAL`);
      expect(draftsRes.status).toBe(200);
      const draftsData = await draftsRes.json();
      expect(draftsData.total).toBeGreaterThanOrEqual(1);

      // 3. Edit draft via PUT
      const putRes = await fetch(`${baseUrl}/api/interview-drafts/${draftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: 'Customized confirmation message for Datadog.',
        }),
      });
      expect(putRes.status).toBe(200);

      // 4. Approve and send draft via POST /approve
      const approveRes = await fetch(`${baseUrl}/api/interview-drafts/${draftId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedBy: 'authorized_tester',
        }),
      });
      expect(approveRes.status).toBe(200);
      const approveData = await approveRes.json();
      expect(approveData.success).toBe(true);
      expect(approveData.draft.status).toBe('SENT');
      expect(approveData.draft.body).toBe('Customized confirmation message for Datadog.');
    });

    it('GET & POST /api/scheduling/preferences updates candidate schedule rules', async () => {
      const getRes = await fetch(`${baseUrl}/api/scheduling/preferences`);
      expect(getRes.status).toBe(200);
      const initialPrefs = await getRes.json();
      expect(initialPrefs.timezone).toBeDefined();

      const postRes = await fetch(`${baseUrl}/api/scheduling/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: 'America/New_York',
          meetingDurationMinutes: 30,
          noticeHours: 48,
        }),
      });
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.preferences.timezone).toBe('America/New_York');
      expect(postData.preferences.meetingDurationMinutes).toBe(30);
      expect(postData.preferences.noticeHours).toBe(48);

      const slotsRes = await fetch(`${baseUrl}/api/scheduling/available-slots`);
      expect(slotsRes.status).toBe(200);
      const slotsData = await slotsRes.json();
      expect(slotsData.slots.length).toBeGreaterThan(0);
      expect(slotsData.slots[0]).toContain('America/New_York');
    });
  });
});
