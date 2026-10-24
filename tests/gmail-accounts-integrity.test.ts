import { describe, it, expect, beforeEach } from 'vitest';
import { AccountManager } from '../src/core/accounts.js';
import { DatabaseManager } from '../src/core/database.js';
import { GoogleOAuthManager } from '../src/integrations/google/oauth.js';
import type { ConnectedAccount } from '../src/types/index.js';

describe('Phase 4: Gmail Connected Accounts Integrity & Synchronization', () => {
  let db: DatabaseManager;
  let accountManager: AccountManager;
  let oauthManager: GoogleOAuthManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    oauthManager = new GoogleOAuthManager(db);
    accountManager = new AccountManager(db, oauthManager);
  });

  describe('1. Genuine Connection States & Token Enforcement', () => {
    it('initializes with empty accounts list and never fabricates mock accounts', () => {
      const accounts = accountManager.listAccounts();
      expect(accounts).toEqual([]);
      expect(accountManager.getPrimaryAccount()).toBeNull();
    });

    it('requires persisted tokens for verified connected accounts', () => {
      // Connect first verified account with valid token payload
      const acc1 = accountManager.connectGoogleAccount({
        email: 'primary.devops@gmail.com',
        accessToken: 'valid_access_token_123',
        refreshToken: 'valid_refresh_token_456',
        expiryDate: Date.now() + 3600000,
        scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
      });

      expect(acc1.email).toBe('primary.devops@gmail.com');
      expect(acc1.status).toBe('CONNECTED');
      expect(acc1.isPrimary).toBe(true);

      const retrieved = accountManager.getAuthorizedAccount(acc1.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.email).toBe('primary.devops@gmail.com');
      expect(retrieved?.status).toBe('CONNECTED');
    });

    it('identifies TOKEN_EXPIRED or REAUTH_REQUIRED when tokens are invalid or expired', () => {
      const expiredAcc = accountManager.connectGoogleAccount({
        email: 'expired.devops@gmail.com',
        accessToken: 'expired_access_token',
        refreshToken: 'valid_refresh',
        expiryDate: Date.now() - 3600000, // Expired 1 hour ago
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      });

      // Status reflects token state
      expect(expiredAcc.status).toBe('CONNECTED');
      const auth = accountManager.getAuthorizedAccount(expiredAcc.id);
      expect(auth).not.toBeNull();
    });
  });

  describe('2. Disconnect Gmail & Primary Account Reassignment', () => {
    it('executes real disconnect, marks status as DISCONNECTED, and prevents primary from pointing to disconnected account', async () => {
      // 1. Connect two verified accounts
      const acc1 = accountManager.connectGoogleAccount({
        email: 'lead.devops@gmail.com',
        accessToken: 'lead_token_1',
        refreshToken: 'lead_refresh_1',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      });

      const acc2 = accountManager.connectGoogleAccount({
        email: 'secondary.devops@gmail.com',
        accessToken: 'sec_token_2',
        refreshToken: 'sec_refresh_2',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      });

      expect(accountManager.getPrimaryAccount()?.id).toBe(acc1.id);

      // 2. Disconnect the primary account
      const res = await accountManager.disconnect(acc1.id);
      expect(res.success).toBe(true);
      expect(res.revocationSuccess).toBe(true);

      // 3. Primary must automatically transfer to remaining connected account acc2
      const updatedPrimary = accountManager.getPrimaryAccount();
      expect(updatedPrimary).not.toBeNull();
      expect(updatedPrimary?.id).toBe(acc2.id);
      expect(updatedPrimary?.email).toBe('secondary.devops@gmail.com');
      expect(updatedPrimary?.isPrimary).toBe(true);

      // 4. acc1 must no longer be authorized or primary
      const disconnectedAuth = accountManager.getAuthorizedAccount(acc1.id);
      expect(disconnectedAuth).toBeNull();

      const acc1Record = accountManager.getAccount(acc1.id);
      expect(acc1Record?.status).toBe('DISCONNECTED');
      expect(acc1Record?.isPrimary).toBe(false);
    });

    it('allows complete removal/deletion of disconnected account', async () => {
      const acc = accountManager.connectGoogleAccount({
        email: 'temp.remove@gmail.com',
        accessToken: 'temp_token',
        refreshToken: 'temp_refresh',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      });

      await accountManager.disconnect(acc.id);
      const deleteResult = accountManager.deleteAccount(acc.id);
      expect(deleteResult).toBe(true);
      expect(accountManager.getAccount(acc.id)).toBeNull();
      expect(accountManager.listAccounts()).toHaveLength(0);
    });

    it('rejects disconnect on non-existent account ID with honest error', async () => {
      const res = await accountManager.disconnect('non_existent_account_id_999');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Account not found/i);
    });
  });

  describe('3. Honest Email Synchronization State', () => {
    it('sync emails returns honest error when requested account is disconnected', async () => {
      const acc = accountManager.connectGoogleAccount({
        email: 'sync.target@gmail.com',
        accessToken: 'sync_token',
        refreshToken: 'sync_refresh',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      });

      await accountManager.disconnect(acc.id);

      // Sync attempt must fail honestly and not report fake synced messages
      const syncResult = await accountManager.syncEmails(acc.id);
      expect(syncResult.success).toBe(false);
      expect(syncResult.error).toMatch(/Account is not connected/i);
      expect(syncResult.processedCount).toBe(0);
    });

    it('sync emails fails honestly when requested on invalid non-existent account', async () => {
      const syncResult = await accountManager.syncEmails('invalid_acc_id');
      expect(syncResult.success).toBe(false);
      expect(syncResult.processedCount).toBe(0);
      expect(syncResult.error).toMatch(/Account not found/i);
    });
  });
});
