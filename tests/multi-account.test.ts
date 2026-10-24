import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { AccountManager } from '../src/core/accounts.js';
import { ApprovalGatekeeper, SecurityAuthorizationError } from '../src/applications/approval-gate.js';
import type { ApplicationDraft, Vacancy } from '../src/types/index.js';

describe('Multi-Account Authentication & Connection Management', () => {
  let db: DatabaseManager;
  let accountManager: AccountManager;
  let gatekeeper: ApprovalGatekeeper;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    accountManager = new AccountManager(db);
    gatekeeper = new ApprovalGatekeeper(db);
  });

  it('connects multiple Google accounts and sanitizes tokens from public view', () => {
    // Connect Primary Account
    const acc1 = accountManager.connectAccount({
      email: 'candidate.primary@example.com',
      displayName: 'Primary Candidate Account',
      accessToken: 'ya29.secret_access_token_123',
      refreshToken: '1//0g_secret_refresh_token_456',
      isPrimary: true,
    });

    expect(acc1.email).toBe('candidate.primary@example.com');
    expect(acc1.isPrimary).toBe(true);
    expect(acc1.status).toBe('CONNECTED');
    // Ensure tokens are NOT in public view
    expect((acc1 as any).accessToken).toBeUndefined();
    expect((acc1 as any).refreshToken).toBeUndefined();

    // Connect Secondary Recruitment Account
    const acc2 = accountManager.connectAccount({
      email: 'candidate.recruitment@example.com',
      displayName: 'Recruitment Secondary',
      accessToken: 'ya29.secret_access_token_789',
      refreshToken: '1//0g_secret_refresh_token_999',
      isPrimary: false,
    });

    expect(acc2.email).toBe('candidate.recruitment@example.com');
    expect(acc2.isPrimary).toBe(false);

    // List all accounts
    const all = accountManager.listPublicAccounts();
    expect(all).toHaveLength(2);
    expect(all[0].isPrimary).toBe(true);
    expect(all[0].email).toBe('candidate.primary@example.com');
    expect(all[1].isPrimary).toBe(false);
    expect(all[1].email).toBe('candidate.recruitment@example.com');

    // Verify raw tokens remain accessible ONLY via backend getAuthorizedAccount
    const rawPrimary = accountManager.getAuthorizedAccount(acc1.id);
    expect(rawPrimary?.refreshToken).toBe('1//0g_secret_refresh_token_456');
  });

  it('switches primary account correctly', () => {
    const acc1 = accountManager.connectAccount({
      email: 'account1@gmail.com',
      isPrimary: true,
    });
    const acc2 = accountManager.connectAccount({
      email: 'account2@gmail.com',
      isPrimary: false,
    });

    expect(db.getPrimaryConnectedAccount()?.id).toBe(acc1.id);

    // Switch primary to acc2
    accountManager.setPrimary(acc2.id);

    const primary = db.getPrimaryConnectedAccount();
    expect(primary?.id).toBe(acc2.id);
    expect(primary?.email).toBe('account2@gmail.com');

    const accounts = accountManager.listPublicAccounts();
    const publicAcc1 = accounts.find(a => a.id === acc1.id);
    const publicAcc2 = accounts.find(a => a.id === acc2.id);
    expect(publicAcc1?.isPrimary).toBe(false);
    expect(publicAcc2?.isPrimary).toBe(true);
  });

  it('disconnects an account and revokes active credentials', () => {
    const acc = accountManager.connectAccount({
      email: 'temp.account@gmail.com',
      accessToken: 'ya29.secret_token',
      refreshToken: '1//refresh_token',
    });

    expect(acc.status).toBe('CONNECTED');

    // Disconnect
    accountManager.disconnect(acc.id);

    const updated = db.getConnectedAccountById(acc.id);
    expect(updated?.status).toBe('DISCONNECTED');
    expect(updated?.accessToken).toBeUndefined();
    expect(updated?.refreshToken).toBeUndefined();

    // Verify it is not returned as authorized account
    const authorized = accountManager.getAuthorizedAccount(acc.id);
    expect(authorized).toBeNull();
  });

  it('associates selected account with application draft during approval', () => {
    // Setup vacancy & draft
    const vacancy: Vacancy = {
      id: 'vac_acc_test',
      canonicalHash: 'hash_acc_test',
      sourceType: 'greenhouse',
      sourceUrl: 'https://boards.greenhouse.io/test',
      alternateUrls: [],
      companyName: 'Acme Cloud',
      title: 'DevOps Engineer',
      normalizedTitle: 'devops engineer',
      locationText: 'Remote - India',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time',
      rawDescription: 'DevOps Engineer position with Terraform and K8s.',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'QUALIFIED',
      isContractOrFreelance: false,
    };
    db.insertOrUpdateVacancy(vacancy);

    const draft: ApplicationDraft = {
      id: 'draft_acc_test',
      vacancyId: vacancy.id,
      recipientEmail: 'jobs@acmecloud.com',
      subjectLine: 'Application for DevOps Engineer - Test Candidate',
      emailBody: 'Dear Hiring Team...',
      tailoredResumePath: '/tmp/resume.md',
      status: 'PENDING_REVIEW',
      createdAt: new Date().toISOString(),
    };
    db.saveApplicationDraft(draft);

    const acc = accountManager.connectAccount({
      email: 'candidate.primary@example.com',
      isPrimary: true,
    });

    // Approve with explicit sending account
    const approved = gatekeeper.approveDraft(draft.id, 'authorized_user', acc.id);
    expect(approved.status).toBe('APPROVED');
    expect(approved.sendingAccountId).toBe(acc.id);

    // Verify submission inherits draft
    const submission = gatekeeper.recordSubmission(draft.id, 'GMAIL_API');
    expect(submission.status).toBe('SENT');
  });

  it('refuses to send application without explicit approval', () => {
    const vacancy: Vacancy = {
      id: 'vac_unapproved',
      canonicalHash: 'hash_unapproved',
      sourceType: 'jobicy',
      sourceUrl: 'https://jobicy.com/job/1',
      alternateUrls: [],
      companyName: 'Unapproved Corp',
      title: 'SRE',
      normalizedTitle: 'sre',
      locationText: 'Remote',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time',
      rawDescription: 'SRE role',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'QUALIFIED',
      isContractOrFreelance: false,
    };
    db.insertOrUpdateVacancy(vacancy);

    const draft: ApplicationDraft = {
      id: 'draft_unapproved',
      vacancyId: vacancy.id,
      recipientEmail: 'jobs@unapproved.com',
      subjectLine: 'Application',
      emailBody: 'Body',
      tailoredResumePath: '/tmp/resume.md',
      status: 'PENDING_REVIEW',
      createdAt: new Date().toISOString(),
    };
    db.saveApplicationDraft(draft);

    expect(() => {
      gatekeeper.verifyAuthorizedToSend(draft.id);
    }).toThrow(SecurityAuthorizationError);
  });
});
