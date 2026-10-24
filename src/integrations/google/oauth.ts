import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { logger } from '../../core/logger.js';
import { config } from '../../config/index.js';
import type { AccountManager } from '../../core/accounts.js';

export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  expiry_date?: number;
}

export interface GoogleUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export class GoogleOAuthManager {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private tokenPath: string;
  private accountManager?: AccountManager;

  public static readonly DEFAULT_SCOPES = [
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  constructor(
    clientId: string = config.googleClientId || process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: string = config.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: string = config.googleRedirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3300/oauth2callback',
    tokenPath: string = config.googleTokenPath || process.env.GOOGLE_TOKEN_PATH || './data/google_tokens.json',
    accountManager?: AccountManager
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.tokenPath = tokenPath;
    this.accountManager = accountManager;
  }

  isOAuthConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  hasSavedTokens(): boolean {
    return existsSync(this.tokenPath);
  }

  generateAuthUrl(customState?: string): string {
    if (!this.isOAuthConfigured()) {
      throw new Error('Google OAuth credentials (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) are not configured in .env');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: GoogleOAuthManager.DEFAULT_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: customState || 'job_platform_oauth',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<{ tokens: GoogleOAuthTokens; profile: GoogleUserProfile }> {
    if (!this.isOAuthConfigured()) {
      throw new Error('Google OAuth credentials are not configured');
    }

    const bodyParams = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`Google token exchange failed (${response.status}): ${errText}`);
      throw new Error(`Google OAuth token exchange failed: ${errText}`);
    }

    const tokenData = await response.json() as GoogleOAuthTokens;
    if (tokenData.expires_in) {
      tokenData.expiry_date = Date.now() + (tokenData.expires_in * 1000);
    }

    // Save tokens locally
    this.saveTokens(tokenData);

    // Fetch user profile
    const profile = await this.fetchUserProfile(tokenData.access_token);

    // If AccountManager is wired, register or update account
    if (this.accountManager) {
      this.accountManager.connectAccount({
        email: profile.email,
        displayName: profile.name || profile.email,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiryDate: tokenData.expiry_date,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : GoogleOAuthManager.DEFAULT_SCOPES,
        isPrimary: true,
      });
      logger.info(`Google account connected & synchronized: ${profile.email}`);
    }

    return { tokens: tokenData, profile };
  }

  async fetchUserProfile(accessToken: string): Promise<GoogleUserProfile> {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch Google user profile: ${res.statusText}`);
    }

    return await res.json() as GoogleUserProfile;
  }

  async refreshAccessToken(refreshToken?: string): Promise<string> {
    const existing = this.loadTokens();
    const tokenToUse = refreshToken || existing?.refresh_token;

    if (!tokenToUse) {
      throw new Error('No refresh token available to renew Google access token');
    }

    const bodyParams = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: tokenToUse,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google token refresh failed: ${errText}`);
    }

    const data = await response.json() as GoogleOAuthTokens;
    const updated: GoogleOAuthTokens = {
      ...existing,
      access_token: data.access_token,
      expires_in: data.expires_in,
      expiry_date: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
    };

    this.saveTokens(updated);
    logger.info('Google OAuth access token refreshed successfully');
    return data.access_token;
  }

  loadTokens(): GoogleOAuthTokens | null {
    if (!existsSync(this.tokenPath)) return null;
    try {
      return JSON.parse(readFileSync(this.tokenPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  saveTokens(tokens: GoogleOAuthTokens): void {
    writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2), 'utf-8');
    logger.audit('GOOGLE_TOKENS_SAVED', 'oauth_manager', { tokenPath: this.tokenPath });
  }

  saveManualCredentials(clientId: string, clientSecret: string): void {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }
}
