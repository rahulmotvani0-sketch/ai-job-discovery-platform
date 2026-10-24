import { createHash, randomUUID } from 'node:crypto';
import { logger } from '../core/logger.js';
import type { DatabaseManager } from '../core/database.js';
import type { ApplicationDraft, ApplicationSubmission } from '../types/index.js';

export class SecurityAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityAuthorizationError';
  }
}

export class ApprovalGatekeeper {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  approveDraft(draftId: string, actor: string = 'authorized_user', sendingAccountId?: string): ApplicationDraft {
    const draft = this.db.getApplicationDraftById(draftId);
    if (!draft) {
      throw new SecurityAuthorizationError(`Draft ${draftId} does not exist.`);
    }

    if (draft.status === 'SUBMITTED') {
      throw new SecurityAuthorizationError(`Draft ${draftId} has already been submitted.`);
    }

    if (sendingAccountId) {
      draft.sendingAccountId = sendingAccountId;
      this.db.saveApplicationDraft(draft);
    }

    this.db.approveDraft(draftId, actor);
    logger.audit('DRAFT_APPROVED', actor, { draftId, vacancyId: draft.vacancyId, sendingAccountId: draft.sendingAccountId });
    return this.db.getApplicationDraftById(draftId)!;
  }

  /**
   * Validates whether an application draft is authorized for transmission.
   * Throws SecurityAuthorizationError if the draft has NOT received user approval.
   */
  verifyAuthorizedToSend(draftId: string): ApplicationDraft {
    const draft = this.db.getApplicationDraftById(draftId);
    if (!draft) {
      throw new SecurityAuthorizationError(`Security Violation: Application draft ${draftId} not found.`);
    }

    if (draft.status !== 'APPROVED') {
      throw new SecurityAuthorizationError(
        `Security Policy Enforcement: Draft ${draftId} is in status '${draft.status}'. ` +
        `Applications require explicit user approval (status 'APPROVED') prior to transmission.`
      );
    }

    return draft;
  }

  /**
   * Records a successful transmission in the database and creates an immutable cryptographic audit record.
   */
  recordSubmission(
    draftId: string,
    channel: ApplicationSubmission['channel'],
    details?: { gmailMessageId?: string; gmailThreadId?: string; sheetsRowIndex?: number; actor?: string }
  ): ApplicationSubmission {
    const draft = this.verifyAuthorizedToSend(draftId);

    const submissionId = randomUUID();
    const sentAt = new Date().toISOString();
    const auditPayload = `${submissionId}|${draftId}|${draft.vacancyId}|${sentAt}|${channel}|${details?.gmailMessageId || ''}`;
    const auditHash = createHash('sha256').update(auditPayload).digest('hex');

    const submission: ApplicationSubmission = {
      id: submissionId,
      draftId,
      vacancyId: draft.vacancyId,
      sentAt,
      approvedBy: details?.actor || 'user',
      channel,
      gmailMessageId: details?.gmailMessageId,
      gmailThreadId: details?.gmailThreadId,
      status: 'SENT',
      sheetsRowIndex: details?.sheetsRowIndex,
      auditHash,
    };

    this.db.saveSubmission(submission);
    logger.audit('APPLICATION_SENT', submission.approvedBy, {
      submissionId,
      draftId,
      channel,
      auditHash,
    });

    return submission;
  }
}
