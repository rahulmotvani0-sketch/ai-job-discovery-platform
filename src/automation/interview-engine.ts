import { randomUUID } from 'node:crypto';
import { logger } from '../core/logger.js';
import { config, loadConfig } from '../config/index.js';
import type { DatabaseManager } from '../core/database.js';
import type { IGmailService } from '../integrations/google/gmail.js';
import { AlertNotificationManager } from '../notifications/alert-manager.js';
import type {
  RecruiterInteraction,
  RecruiterIntent,
  InterviewFollowUpDraft,
  SchedulingPreferences,
} from '../types/index.js';

export interface InterviewEngineOptions {
  db: DatabaseManager;
  gmailService?: IGmailService;
  alertManager?: AlertNotificationManager;
}

export class InterviewSchedulingEngine {
  private db: DatabaseManager;
  private gmailService?: IGmailService;
  private alertManager: AlertNotificationManager;

  constructor(options: InterviewEngineOptions) {
    this.db = options.db;
    this.gmailService = options.gmailService;
    this.alertManager = options.alertManager || new AlertNotificationManager();
  }

  /**
   * Classifies inbound email content into a structured RecruiterIntent and determines action requirements.
   */
  classifyRecruiterIntent(subject: string, bodyOrSnippet: string): {
    intent: RecruiterIntent;
    confidence: number;
    actionRequired: boolean;
    reasons: string[];
  } {
    const combined = `${subject} ${bodyOrSnippet}`.toLowerCase();
    const reasons: string[] = [];

    // 1. Offer
    if (
      /offer letter|pleased to offer you|formal offer|extend an offer|compensation package|congratulations on the offer/i.test(combined)
    ) {
      reasons.push('Contains formal job offer keywords');
      return { intent: 'OFFER', confidence: 0.95, actionRequired: true, reasons };
    }

    // 2. Interview Invitation
    if (
      /invitation to interview|schedule\s+(?:an?\s+)?interview|interview\s+call|time to talk|call with the team|chat with our|meet the team|technical interview|round 1 interview|introductory call|virtual interview|video call|screening call|zoom meeting|google meet link/i.test(combined)
    ) {
      reasons.push('Contains interview scheduling invitation keywords');
      return { intent: 'INTERVIEW_INVITATION', confidence: 0.92, actionRequired: true, reasons };
    }

    // 3. Technical Assessment
    if (
      /hackerrank|coderpad|codesignal|test gorillia|take[- ]home|coding assessment|technical assessment|coding challenge|assignment|complete within \d+|submit your solution/i.test(combined)
    ) {
      reasons.push('Contains coding challenge or assessment keywords');
      return { intent: 'TECHNICAL_ASSESSMENT', confidence: 0.9, actionRequired: true, reasons };
    }

    // 4. Availability Request
    if (
      /send over your availability|what times are you free|let us know your availability|share your available times|provide a few dates and times|available for a quick/i.test(combined)
    ) {
      reasons.push('Contains candidate availability inquiry keywords');
      return { intent: 'AVAILABILITY_REQUEST', confidence: 0.88, actionRequired: true, reasons };
    }

    // 5. Information Request
    if (
      /notice period|current ctc|expected ctc|expected compensation|work authorization|visa status|right to work|relocate to|update your resume/i.test(combined)
    ) {
      reasons.push('Contains preliminary candidate screening question keywords');
      return { intent: 'INFORMATION_REQUEST', confidence: 0.85, actionRequired: true, reasons };
    }

    // 6. Rejection
    if (
      /unfortunately|not moving forward|pursuing other candidates|decided not to proceed|regret to inform|high volume of applicants|at this time we have decided/i.test(combined)
    ) {
      reasons.push('Contains standard candidate rejection keywords');
      return { intent: 'REJECTION', confidence: 0.95, actionRequired: false, reasons };
    }

    // 7. Acknowledgement
    if (
      /thank you for applying|application received|we have received your application|reviewing your application|under review|received your resume/i.test(combined)
    ) {
      reasons.push('Contains standard application receipt acknowledgement keywords');
      return { intent: 'ACKNOWLEDGEMENT', confidence: 0.85, actionRequired: false, reasons };
    }

    // Fallback
    return { intent: 'OTHER', confidence: 0.5, actionRequired: false, reasons: ['No distinct recruiter intent matched'] };
  }

  /**
   * Generates formatted available meeting slots grounded in the candidate's active scheduling preferences.
   */
  generateAvailableSlots(
    customPrefs?: Partial<SchedulingPreferences>,
    daysAhead: number = 5,
    count: number = 3
  ): string[] {
    const prefs = {
      ...this.db.getSchedulingPreferences(),
      ...customPrefs,
    };

    const slots: string[] = [];
    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Start looking from tomorrow or after noticeHours
    let searchDate = new Date(now.getTime() + Math.max(prefs.noticeHours, 24) * 60 * 60 * 1000);

    let attempts = 0;
    while (slots.length < count && attempts < 14) {
      attempts++;
      const dayName = dayNames[searchDate.getDay()];

      // Check if day is candidate working day
      if (prefs.workingDays.includes(dayName)) {
        for (const window of prefs.timeWindows) {
          if (slots.length >= count) break;

          const dateStr = `${dayName}, ${monthNames[searchDate.getMonth()]} ${searchDate.getDate()}`;
          const formatted = `${dateStr} at ${this.formatTimeSlot(window.start, prefs.meetingDurationMinutes)} (${prefs.timezone})`;
          if (!slots.includes(formatted)) {
            slots.push(formatted);
          }
        }
      }
      // Advance to next day
      searchDate = new Date(searchDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // Fallback if no matching days found
    if (slots.length === 0) {
      slots.push(
        `Next Business Day at 2:00 PM – 2:${prefs.meetingDurationMinutes} PM (${prefs.timezone})`,
        `Next Business Day + 1 at 4:00 PM – 4:${prefs.meetingDurationMinutes} PM (${prefs.timezone})`
      );
    }

    return slots;
  }

  private formatTimeSlot(startTime: string, durationMinutes: number): string {
    const [hStr, mStr] = startTime.split(':');
    let h = parseInt(hStr || '14', 10);
    let m = parseInt(mStr || '00', 10);

    const startPeriod = h >= 12 ? 'PM' : 'AM';
    const displayStartH = h % 12 || 12;
    const displayStartM = m < 10 ? `0${m}` : m;

    let endM = m + durationMinutes;
    let endH = h + Math.floor(endM / 60);
    endM = endM % 60;
    const endPeriod = endH >= 12 ? 'PM' : 'AM';
    const displayEndH = endH % 12 || 12;
    const displayEndM = endM < 10 ? `0${endM}` : endM;

    return `${displayStartH}:${displayStartM} ${startPeriod} – ${displayEndH}:${displayEndM} ${endPeriod}`;
  }

  /**
   * Generates a context-aware, professional follow-up draft for a recruiter interaction.
   */
  generateFollowUpDraft(
    interaction: RecruiterInteraction,
    candidateName?: string,
    customPrefs?: Partial<SchedulingPreferences>
  ): InterviewFollowUpDraft {
    const prefs = {
      ...this.db.getSchedulingPreferences(),
      ...customPrefs,
    };

    const name = candidateName || this.db.getUserProfile()?.fullName || 'Candidate';
    const company = interaction.companyName || 'your team';
    const role = interaction.jobTitle || 'the position';
    const slots = this.generateAvailableSlots(prefs, 5, 3);
    const platforms = prefs.meetingPlatforms.join(' or ') || 'Google Meet / Zoom';

    let subject = interaction.subject.trim();
    if (!subject.toLowerCase().startsWith('re:')) {
      subject = `Re: ${subject}`;
    }

    let body = '';

    switch (interaction.detectedIntent) {
      case 'INTERVIEW_INVITATION':
      case 'AVAILABILITY_REQUEST': {
        const slotBullets = slots.map(s => `• ${s}`).join('\n');
        body = [
          `Hi there,`,
          ``,
          `Thank you very much for reaching out and for the opportunity to interview for ${role} at ${company}. I am very excited about what your team is building and would love to connect.`,
          ``,
          `Here are a few times when I am available for a ${prefs.meetingDurationMinutes}-minute discussion:`,
          ``,
          slotBullets,
          ``,
          `I am happy to connect over ${platforms}, or any other video conferencing platform that works best for you. If none of these times align with your calendar, please feel free to send a scheduling link or propose alternate times.`,
          ``,
          `Looking forward to speaking with you!`,
          ``,
          `Best regards,`,
          `${name}`
        ].join('\n');
        break;
      }

      case 'TECHNICAL_ASSESSMENT': {
        body = [
          `Hi there,`,
          ``,
          `Thank you for sharing the technical assessment for ${role} at ${company}.`,
          ``,
          `I confirm receipt of the instructions and will complete and submit the solution within the requested timeframe. Should any questions or clarifications arise while working through it, I will reach out promptly.`,
          ``,
          `Thank you again for the opportunity, and I look forward to your team's feedback!`,
          ``,
          `Best regards,`,
          `${name}`
        ].join('\n');
        break;
      }

      case 'OFFER': {
        body = [
          `Hi there,`,
          ``,
          `Thank you so much for extending this offer for ${role} at ${company}! I am truly excited about the prospect of joining the team.`,
          ``,
          `I am currently reviewing the details of the offer and the compensation package. I will get back to you with any questions or my confirmation within the next 24–48 hours.`,
          ``,
          `Thank you again for this incredible opportunity!`,
          ``,
          `Best regards,`,
          `${name}`
        ].join('\n');
        break;
      }

      case 'INFORMATION_REQUEST': {
        body = [
          `Hi there,`,
          ``,
          `Thank you for following up regarding my application for ${role} at ${company}.`,
          ``,
          `Please find the requested information below:`,
          `• Availability / Notice Period: Immediate / 30 days`,
          `• Work Authorization: Authorized to work with remote flexibility`,
          `• Location: Open to remote and hybrid arrangements`,
          ``,
          `Please let me know if you require any additional details, portfolio links, or documentation.`,
          ``,
          `Best regards,`,
          `${name}`
        ].join('\n');
        break;
      }

      case 'REJECTION': {
        body = [
          `Hi there,`,
          ``,
          `Thank you for taking the time to provide an update regarding ${role} at ${company}.`,
          ``,
          `While I am disappointed that we won't be moving forward at this time, I appreciate the transparency and enjoyed learning about ${company}. I would welcome the opportunity to stay in touch for future openings that match my background.`,
          ``,
          `Wishing you and the team continued success!`,
          ``,
          `Best regards,`,
          `${name}`
        ].join('\n');
        break;
      }

      default: {
        body = [
          `Hi there,`,
          ``,
          `Thank you for reaching out regarding my application for ${role} at ${company}.`,
          ``,
          `I have received your message and will follow up shortly with any requested details.`,
          ``,
          `Best regards,`,
          `${name}`
        ].join('\n');
        break;
      }
    }

    return {
      id: randomUUID(),
      interactionId: interaction.id,
      submissionId: interaction.submissionId || undefined,
      recipientEmail: interaction.senderEmail,
      companyName: company,
      jobTitle: role,
      intent: interaction.detectedIntent,
      subject,
      body,
      suggestedSlots: slots,
      status: 'PENDING_APPROVAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Ingests, classifies, and stages an inbound recruiter email interaction.
   */
  async processInboundInteraction(input: {
    senderEmail: string;
    subject: string;
    snippet: string;
    messageId?: string;
    threadId?: string;
    submissionId?: string;
    companyName?: string;
    jobTitle?: string;
  }): Promise<{
    interaction: RecruiterInteraction;
    draft?: InterviewFollowUpDraft;
    alertDispatched: boolean;
  }> {
    const messageId = input.messageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const threadId = input.threadId || `thread_${Date.now()}`;
    const id = `inter_${messageId}`;

    // 1. Classify Intent
    const classification = this.classifyRecruiterIntent(input.subject, input.snippet);

    // 2. Extract company and role from subject / sender if not provided
    const extractedCompany = input.companyName || this.extractCompanyFromSubjectOrEmail(input.subject, input.senderEmail);
    const extractedJobTitle = input.jobTitle || this.extractJobTitleFromSubject(input.subject);

    // 3. Match against existing submissions if submissionId not explicitly supplied
    let matchedSubmissionId = input.submissionId || '';
    if (!matchedSubmissionId) {
      const submissions = this.db.listSubmissions();
      if (input.threadId) {
        const byThread = submissions.find(s => s.gmailThreadId === input.threadId);
        if (byThread) matchedSubmissionId = byThread.id;
      }
      if (!matchedSubmissionId) {
        const drafts = this.db.listDrafts();
        const matchingDraft = drafts.find(d => {
          if (d.recipientEmail.toLowerCase() === input.senderEmail.toLowerCase()) return true;
          const vac = this.db.getVacancyById(d.vacancyId);
          return Boolean(vac && vac.companyName.toLowerCase() === extractedCompany.toLowerCase());
        });
        if (matchingDraft) {
          const sub = submissions.find(s => s.draftId === matchingDraft.id);
          if (sub) matchedSubmissionId = sub.id;
        }
      }
    }

    // 4. Build RecruiterInteraction record
    const interaction: RecruiterInteraction = {
      id,
      submissionId: matchedSubmissionId,
      threadId,
      messageId,
      senderEmail: input.senderEmail,
      subject: input.subject,
      snippet: input.snippet,
      detectedIntent: classification.intent,
      actionRequired: classification.actionRequired,
      actionDetails: classification.reasons.join('; '),
      receivedAt: new Date().toISOString(),
      companyName: extractedCompany,
      jobTitle: extractedJobTitle,
      candidateAvailabilityOptions: classification.actionRequired ? this.generateAvailableSlots() : undefined,
      replyStatus: classification.actionRequired ? 'DRAFTED' : 'NONE',
    };

    // 5. Persist interaction in SQLite
    this.db.saveRecruiterInteraction(interaction);
    this.db.recordAuditEvent('RECRUITER_RESPONSE_RECEIVED', 'system', 'RECRUITER_INTERACTION', interaction.id, {
      intent: interaction.detectedIntent,
      company: interaction.companyName,
      sender: interaction.senderEmail,
      actionRequired: interaction.actionRequired,
    });

    // 6. Generate draft if action is required
    let draft: InterviewFollowUpDraft | undefined = undefined;
    if (classification.actionRequired) {
      draft = this.generateFollowUpDraft(interaction);
      this.db.saveInterviewFollowUpDraft(draft);
      logger.info(`Staged auto-draft reply (${draft.id}) for recruiter interaction from ${interaction.companyName}`);
    }

    // 7. Push alert for urgent interactions
    let alertDispatched = false;
    try {
      const alertRes = await this.alertManager.notifyRecruiterInteraction(interaction, draft);
      alertDispatched = alertRes.telegramSent || alertRes.discordSent;
    } catch (err: any) {
      logger.warn(`Failed to dispatch recruiter notification: ${err.message}`);
    }

    return { interaction, draft, alertDispatched };
  }

  /**
   * Security Approval Gate: Candidate approves and transmits an interview follow-up reply.
   */
  async approveAndSendDraft(
    draftId: string,
    options?: {
      approvedBy?: string;
      updatedSubject?: string;
      updatedBody?: string;
      updatedSlots?: string[];
    }
  ): Promise<{
    success: boolean;
    messageId: string;
    threadId: string;
    draft: InterviewFollowUpDraft;
  }> {
    const draft = this.db.getInterviewFollowUpDraftById(draftId);
    if (!draft) {
      throw new Error(`Follow-up draft ${draftId} not found`);
    }

    if (draft.status === 'SENT') {
      throw new Error(`Follow-up draft ${draftId} has already been sent`);
    }

    // Apply any candidate edits
    const subject = options?.updatedSubject || draft.subject;
    const body = options?.updatedBody || draft.body;
    const suggestedSlots = options?.updatedSlots || draft.suggestedSlots;
    const actor = options?.approvedBy || 'authorized_candidate';

    // Retrieve corresponding interaction to preserve threadId and inReplyTo
    const interaction = this.db.getRecruiterInteractionById(draft.interactionId);
    const threadId = interaction?.threadId;
    const inReplyToMessageId = interaction?.messageId;

    const currentConfig = loadConfig();

    // Demo mode: simulate follow-up reply without invoking external APIs
    if (currentConfig.appMode === 'demo') {
      logger.info(`[Demo Mode] Interview follow-up draft ${draftId} approval simulated without external transmission.`);
      this.db.updateInterviewFollowUpDraft(draftId, {
        subject,
        body,
        suggestedSlots,
        status: 'SENT',
        sentAt: new Date().toISOString(),
      });
      const updatedDraft = this.db.getInterviewFollowUpDraftById(draftId)!;
      return {
        success: true,
        messageId: `demo_interview_msg_${Date.now()}`,
        threadId: threadId || `demo_thread_${Date.now()}`,
        draft: updatedDraft,
      };
    }

    // Safety gate: explicitly reject if submission is not enabled
    if (!currentConfig.applicationSubmissionEnabled) {
      throw new Error(
        'Email response transmission is disabled (APPLICATION_SUBMISSION_ENABLED=false). ' +
        'Set APPLICATION_SUBMISSION_ENABLED=true in your environment to permit sending emails.'
      );
    }

    // Transmit via Gmail API
    let sentResult = { messageId: `msg_${Date.now()}`, threadId: threadId || `thread_${Date.now()}` };
    if (this.gmailService?.sendFollowUpReply) {
      sentResult = await this.gmailService.sendFollowUpReply({
        recipientEmail: draft.recipientEmail,
        subject,
        body,
        threadId,
        inReplyToMessageId,
      });
    } else {
      logger.info(`[Simulation/Test Mode] Transmitted interview follow-up reply to ${draft.recipientEmail}`);
    }

    // Update draft record
    const updatedDraft: InterviewFollowUpDraft = {
      ...draft,
      subject,
      body,
      suggestedSlots,
      status: 'SENT',
      approvedAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.db.saveInterviewFollowUpDraft(updatedDraft);

    // Update interaction
    if (interaction) {
      this.db.updateRecruiterInteraction(interaction.id, {
        replyStatus: 'SENT',
        sentReplyAt: updatedDraft.sentAt,
        replyMessageId: sentResult.messageId,
        actionRequired: false,
      });
    }

    // Immutable audit record
    this.db.recordAuditEvent('INTERVIEW_REPLY_SENT', actor, 'INTERVIEW_FOLLOW_UP_DRAFT', draft.id, {
      recipientEmail: draft.recipientEmail,
      companyName: draft.companyName,
      messageId: sentResult.messageId,
      threadId: sentResult.threadId,
      sentAt: updatedDraft.sentAt,
    });

    logger.info(`Follow-up reply sent successfully to ${draft.recipientEmail} (${draft.companyName})`);
    return {
      success: true,
      messageId: sentResult.messageId,
      threadId: sentResult.threadId,
      draft: updatedDraft,
    };
  }

  /**
   * Dismisses a pending follow-up draft.
   */
  dismissDraft(draftId: string, actor: string = 'authorized_user'): void {
    const draft = this.db.getInterviewFollowUpDraftById(draftId);
    if (!draft) {
      throw new Error(`Draft ${draftId} not found`);
    }

    this.db.updateInterviewFollowUpDraft(draftId, { status: 'DISMISSED' });
    const interaction = this.db.getRecruiterInteractionById(draft.interactionId);
    if (interaction) {
      this.db.updateRecruiterInteraction(interaction.id, { replyStatus: 'DISMISSED', actionRequired: false });
    }

    this.db.recordAuditEvent('INTERVIEW_DRAFT_DISMISSED', actor, 'INTERVIEW_FOLLOW_UP_DRAFT', draftId, {
      recipientEmail: draft.recipientEmail,
      companyName: draft.companyName,
    });
  }

  /**
   * Scans Gmail inbox for new recruiter responses and auto-processes each message.
   */
  async syncRecruiterInbox(query: string = 'subject:Application OR subject:Interview OR subject:Offer'): Promise<{
    interactionsProcessed: number;
    draftsCreated: number;
    alertsDispatched: number;
  }> {
    if (!this.gmailService) {
      return { interactionsProcessed: 0, draftsCreated: 0, alertsDispatched: 0 };
    }

    const rawInteractions = await this.gmailService.fetchRecruiterResponses(query);
    let interactionsProcessed = 0;
    let draftsCreated = 0;
    let alertsDispatched = 0;

    for (const raw of rawInteractions) {
      // Check if already processed
      const existing = this.db.getRecruiterInteractionById(raw.id);
      if (existing) continue;

      const res = await this.processInboundInteraction({
        senderEmail: raw.senderEmail,
        subject: raw.subject,
        snippet: raw.snippet,
        messageId: raw.messageId,
        threadId: raw.threadId,
        submissionId: raw.submissionId,
      });

      interactionsProcessed++;
      if (res.draft) draftsCreated++;
      if (res.alertDispatched) alertsDispatched++;
    }

    return { interactionsProcessed, draftsCreated, alertsDispatched };
  }

  private extractCompanyFromSubjectOrEmail(subject: string, email: string): string {
    // 1. From subject pattern "at Company" or "from Company" or "Company Interview"
    const atMatch = subject.match(/(?:at|from|with)\s+([A-Z][A-Za-z0-9&.\-_]+(?:\s+[A-Z][A-Za-z0-9&.\-_]+)?)/);
    if (atMatch && atMatch[1]) {
      return atMatch[1].trim();
    }

    const hyphenMatch = subject.match(/^([A-Z][A-Za-z0-9&.\-_]+)\s*[-|:]/);
    if (hyphenMatch && hyphenMatch[1]) {
      return hyphenMatch[1].trim();
    }

    // 2. From domain: recruiter@linear.app -> Linear
    const domain = email.split('@')[1];
    if (domain && !domain.includes('gmail.com') && !domain.includes('yahoo.com') && !domain.includes('hotmail.com')) {
      const name = domain.split('.')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }

    return 'Hiring Team';
  }

  private extractJobTitleFromSubject(subject: string): string {
    const match = subject.match(/(?:role|position|for|–|-)\s*([A-Za-z0-9/\s]{4,30})(?:\s*interview|\s*application|\s*update|$)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return 'Software Engineer';
  }
}
