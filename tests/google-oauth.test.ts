import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleOAuthManager } from '../src/integrations/google/oauth.js';
import { DatabaseManager } from '../src/core/database.js';
import { AccountManager } from '../src/core/accounts.js';

describe('Google OAuth & Integration Credentials', () => {
  const testDbPath = join(process.cwd(), 'data', 'test_oauth.db');
  const testTokenPath = join(process.cwd(), 'data', 'test_google_tokens.json');
  let db: DatabaseManager;
  let accountManager: AccountManager;
  let oauthManager: GoogleOAuthManager;

  beforeEach(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testTokenPath)) unlinkSync(testTokenPath);

    db = new DatabaseManager(testDbPath);
    accountManager = new AccountManager(db);
    oauthManager = new GoogleOAuthManager(
      'mock_client_id_123',
      'mock_client_secret_xyz',
      'http://localhost:3300/oauth2callback',
      testTokenPath,
      accountManager
    );
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testTokenPath)) unlinkSync(testTokenPath);
  });

  it('correctly verifies if OAuth credentials are configured', () => {
    expect(oauthManager.isOAuthConfigured()).toBe(true);

    const unconfigured = new GoogleOAuthManager('', '', 'http://localhost:3300/oauth2callback', testTokenPath);
    expect(unconfigured.isOAuthConfigured()).toBe(false);
  });

  it('generates a valid Google OAuth authorization URL with required scopes', () => {
    const urlStr = oauthManager.generateAuthUrl('test_custom_state');
    const url = new URL(urlStr);

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('mock_client_id_123');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3300/oauth2callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('test_custom_state');

    const scopes = url.searchParams.get('scope')!;
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.compose');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.send');
    expect(scopes).toContain('https://www.googleapis.com/auth/drive.file');
    expect(scopes).toContain('https://www.googleapis.com/auth/spreadsheets');
  });

  it('saves and loads tokens safely to token path', () => {
    expect(oauthManager.hasSavedTokens()).toBe(false);

    oauthManager.saveTokens({
      access_token: 'test_access_token_abc',
      refresh_token: 'test_refresh_token_123',
      expires_in: 3600,
    });

    expect(oauthManager.hasSavedTokens()).toBe(true);
    const loaded = oauthManager.loadTokens();
    expect(loaded).toBeDefined();
    expect(loaded?.access_token).toBe('test_access_token_abc');
    expect(loaded?.refresh_token).toBe('test_refresh_token_123');
  });

  it('updates manual credentials dynamically without restarting', () => {
    const manager = new GoogleOAuthManager('', '', 'http://localhost:3300/oauth2callback', testTokenPath);
    expect(manager.isOAuthConfigured()).toBe(false);

    manager.saveManualCredentials('new_client_id_456', 'new_client_secret_789');
    expect(manager.isOAuthConfigured()).toBe(true);
    expect(manager.generateAuthUrl()).toContain('new_client_id_456');
  });
});
