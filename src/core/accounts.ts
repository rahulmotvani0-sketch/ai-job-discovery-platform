import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';
import type { DatabaseManager } from './database.js';
import type { ConnectedAccount } from '../types/index.js';

export interface PublicAccountView {
  id: string;
  email: string;
  displayName?: string;
  provider: string;
  grantedScopes: string[];
  isPrimary: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'ERROR';
  lastSyncedAt?: string;
  syncError?: string;
  createdAt: string;
  updatedAt: string;
}

export class AccountManager {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Sanitizes an account object so sensitive tokens are NEVER leaked to the frontend or API logs.
   */
  sanitize(account: ConnectedAccount): PublicAccountView {
    return {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      provider: account.provider,
      grantedScopes: account.grantedScopes,
      isPrimary: account.isPrimary,
      status: account.status,
      lastSyncedAt: account.lastSyncedAt,
      syncError: account.syncError,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  /**
   * Returns all connected accounts with tokens stripped for safe UI rendering.
   */
  listPublicAccounts(): PublicAccountView[] {
    const accounts = this.db.getConnectedAccounts();
    return accounts.map(a => this.sanitize(a));
  }

  /**
   * Connects or updates a Google account.
   */
  connectAccount(params: {
    email: string;
    displayName?: string;
    accessToken?: string;
    refreshToken?: string;
    grantedScopes?: string[];
    isPrimary?: boolean;
  }): PublicAccountView {
    const existing = this.db.getConnectedAccounts().find(a => a.email.toLowerCase() === params.email.toLowerCase());
    const id = existing?.id || randomUUID();
    const isFirstAccount = this.db.getConnectedAccounts().length === 0;

    const account: ConnectedAccount = {
      id,
      email: params.email.toLowerCase().trim(),
      displayName: params.displayName || params.email.split('@')[0],
      provider: 'google',
      accessToken: params.accessToken || existing?.accessToken,
      refreshToken: params.refreshToken || existing?.refreshToken,
      grantedScopes: params.grantedScopes || existing?.grantedScopes || [
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly'
      ],
      isPrimary: params.isPrimary !== undefined ? params.isPrimary : (existing ? existing.isPrimary : isFirstAccount),
      status: 'CONNECTED',
      lastSyncedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (account.isPrimary) {
      this.db.setPrimaryConnectedAccount(account.id);
    }

    this.db.saveConnectedAccount(account);
    this.db.recordAuditEvent('ACCOUNT_CONNECTED', 'user', 'CONNECTED_ACCOUNT', account.id, {
      email: account.email,
      provider: 'google',
      isPrimary: account.isPrimary
    });

    logger.info(`Google account connected successfully: ${account.email} (primary: ${account.isPrimary})`);
    return this.sanitize(account);
  }

  /**
   * Designates a specific account as the primary default sender.
   */
  setPrimary(accountId: string): PublicAccountView {
    const account = this.db.getConnectedAccountById(accountId);
    if (!account) {
      throw new Error(`Account not found with ID ${accountId}`);
    }
    this.db.setPrimaryConnectedAccount(accountId);
    this.db.recordAuditEvent('ACCOUNT_SET_PRIMARY', 'user', 'CONNECTED_ACCOUNT', accountId, { email: account.email });
    return this.sanitize({ ...account, isPrimary: true });
  }

  /**
   * Disconnects an account, revoking active session and clearing tokens.
   */
  disconnect(accountId: string): void {
    const account = this.db.getConnectedAccountById(accountId);
    if (!account) {
      throw new Error(`Account not found with ID ${accountId}`);
    }
    this.db.disconnectConnectedAccount(accountId);
    this.db.recordAuditEvent('ACCOUNT_DISCONNECTED', 'user', 'CONNECTED_ACCOUNT', accountId, { email: account.email });
    logger.info(`Account disconnected: ${account.email}`);
  }

  /**
   * Deletes an account record completely.
   */
  deleteAccount(accountId: string): boolean {
    const account = this.db.getConnectedAccountById(accountId);
    if (account) {
      this.db.recordAuditEvent('ACCOUNT_DELETED', 'user', 'CONNECTED_ACCOUNT', accountId, { email: account.email });
    }
    return this.db.deleteConnectedAccount(accountId);
  }

  /**
   * Retrieves the raw account with credentials for authorized backend-only operations (e.g. sending emails).
   */
  getAuthorizedAccount(accountId?: string): ConnectedAccount | null {
    if (accountId) {
      const acc = this.db.getConnectedAccountById(accountId);
      if (acc && acc.status === 'CONNECTED') return acc;
    }
    return this.db.getPrimaryConnectedAccount();
  }

  /**
   * Simulates/tests a manual email synchronization for a specific account.
   */
  async syncAccountEmails(accountId: string): Promise<{ success: boolean; messagesFound: number; error?: string }> {
    const account = this.db.getConnectedAccountById(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      this.db.updateAccountSyncStatus(accountId, 'CONNECTED');
      this.db.recordAuditEvent('ACCOUNT_SYNC_COMPLETED', 'system', 'CONNECTED_ACCOUNT', accountId, {
        email: account.email,
        syncedAt: new Date().toISOString()
      });
      return { success: true, messagesFound: 0 };
    } catch (err: any) {
      this.db.updateAccountSyncStatus(accountId, 'ERROR', err.message);
      return { success: false, messagesFound: 0, error: err.message };
    }
  }
}
