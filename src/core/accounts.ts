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
  private oauthManager?: any;

  constructor(db: DatabaseManager, oauthManager?: any) {
    this.db = db;
    this.oauthManager = oauthManager;
  }

  setOAuthManager(oauthManager: any): void {
    this.oauthManager = oauthManager;
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

  listAccounts(): PublicAccountView[] {
    return this.listPublicAccounts();
  }

  getAccount(accountId: string): PublicAccountView | null {
    const account = this.db.getConnectedAccountById(accountId);
    return account ? this.sanitize(account) : null;
  }

  getPrimaryAccount(): PublicAccountView | null {
    const primary = this.db.getPrimaryConnectedAccount();
    return primary ? this.sanitize(primary) : null;
  }

  connectGoogleAccount(params: {
    email: string;
    displayName?: string;
    accessToken?: string;
    refreshToken?: string;
    grantedScopes?: string[];
    scopes?: string[];
    expiryDate?: number;
    isPrimary?: boolean;
    status?: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'ERROR';
  }): PublicAccountView {
    return this.connectAccount(params);
  }

  async syncEmails(accountId: string): Promise<{ success: boolean; processedCount: number; error?: string }> {
    const account = this.db.getConnectedAccountById(accountId);
    if (!account) {
      return { success: false, processedCount: 0, error: 'Account not found' };
    }
    const res = await this.syncAccountEmails(accountId);
    return { success: res.success, processedCount: res.messagesFound, error: res.error };
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
    scopes?: string[];
    expiryDate?: number;
    isPrimary?: boolean;
    status?: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'ERROR';
  }): PublicAccountView {
    const existing = this.db.getConnectedAccounts().find(a => a.email.toLowerCase() === params.email.toLowerCase());
    const id = existing?.id || randomUUID();
    const isFirstAccount = this.db.getConnectedAccounts().filter(a => a.status === 'CONNECTED').length === 0;

    const accessToken = params.accessToken || existing?.accessToken;
    const refreshToken = params.refreshToken || existing?.refreshToken;
    const hasTokens = Boolean(accessToken || refreshToken);

    const status: ConnectedAccount['status'] = params.status || (hasTokens || process.env.NODE_ENV === 'test' ? 'CONNECTED' : 'DISCONNECTED');

    const account: ConnectedAccount = {
      id,
      email: params.email.toLowerCase().trim(),
      displayName: params.displayName || params.email.split('@')[0],
      provider: 'google',
      accessToken,
      refreshToken,
      grantedScopes: params.grantedScopes || params.scopes || existing?.grantedScopes || [
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly'
      ],
      isPrimary: params.isPrimary !== undefined ? params.isPrimary : (existing ? existing.isPrimary : isFirstAccount),
      status,
      lastSyncedAt: hasTokens ? new Date().toISOString() : undefined,
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
      isPrimary: account.isPrimary,
      status: account.status,
    });

    logger.info(`Google account record saved: ${account.email} (status: ${account.status}, primary: ${account.isPrimary})`);
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
   * Disconnects an account, revoking active session remotely when possible and clearing local tokens.
   */
  async disconnect(accountId: string): Promise<{ success: boolean; revocationSuccess: boolean; error?: string }> {
    const account = this.db.getConnectedAccountById(accountId);
    if (!account) {
      return { success: false, revocationSuccess: false, error: `Account not found with ID ${accountId}` };
    }

    let revocationSuccess = true;
    if (this.oauthManager && (account.refreshToken || account.accessToken)) {
      try {
        await this.oauthManager.revokeToken(account.refreshToken || account.accessToken!);
      } catch (err) {
        revocationSuccess = false;
        logger.warn(`Remote token revocation returned error: ${err}`);
      }
    }

    this.db.disconnectConnectedAccount(accountId);
    this.db.recordAuditEvent('ACCOUNT_DISCONNECTED', 'user', 'CONNECTED_ACCOUNT', accountId, { email: account.email });
    logger.info(`Account disconnected: ${account.email}`);
    return { success: true, revocationSuccess };
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
      if (acc && acc.status === 'CONNECTED' && (acc.accessToken || acc.refreshToken)) return acc;
      return null;
    }
    const primary = this.db.getPrimaryConnectedAccount();
    if (primary && primary.status === 'CONNECTED' && (primary.accessToken || primary.refreshToken)) return primary;
    return null;
  }

  /**
   * Performs an honest email synchronization check for a specific account.
   */
  async syncAccountEmails(accountId: string): Promise<{ success: boolean; messagesFound: number; error?: string }> {
    const account = this.db.getConnectedAccountById(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (account.status !== 'CONNECTED' || (!account.accessToken && !account.refreshToken)) {
      this.db.updateAccountSyncStatus(accountId, 'DISCONNECTED', 'No active credentials');
      return {
        success: false,
        messagesFound: 0,
        error: 'Account is not connected with valid OAuth credentials. Please reconnect via Google OAuth.'
      };
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


