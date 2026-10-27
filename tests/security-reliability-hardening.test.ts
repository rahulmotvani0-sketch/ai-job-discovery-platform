import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { timingSafeEqualTokenCompare, validateAuthorization } from '../src/core/security.js';
import { loadConfig } from '../src/config/index.js';
import { validateSafeUrl } from '../src/discovery/connectors/base.js';
import { DatabaseManager } from '../src/core/database.js';
import { JobScheduler } from '../src/automation/scheduler.js';
import { MasterOrchestrator } from '../src/automation/orchestrator.js';
import { GoogleOAuthManager } from '../src/integrations/google/oauth.js';
import { sanitizeText, deepSanitize } from '../src/core/logger.js';
import { IncomingMessage } from 'node:http';

describe('Security and Reliability Hardening Suite', () => {
  describe('Constant-Time Token Comparison & Authorization', () => {
    it('should correctly compare tokens in constant-time', () => {
      const secret = 'super-secret-token-32-chars-long-abc';
      expect(timingSafeEqualTokenCompare(secret, secret)).toBe(true);
      expect(timingSafeEqualTokenCompare(secret, 'wrong-token')).toBe(false);
      expect(timingSafeEqualTokenCompare(secret, secret.slice(0, -1))).toBe(false);
      expect(timingSafeEqualTokenCompare('', secret)).toBe(false);
      expect(timingSafeEqualTokenCompare(undefined, secret)).toBe(false);
    });

    it('should authorize Bearer and X-API-Key with timing-safe comparison', () => {
      const configuredToken = 'valid-production-api-token-value-32';

      const validBearerReq = {
        headers: { authorization: `Bearer ${configuredToken}` },
      } as unknown as IncomingMessage;
      expect(validateAuthorization(validBearerReq, configuredToken).authorized).toBe(true);

      const validApiKeyReq = {
        headers: { 'x-api-key': configuredToken },
      } as unknown as IncomingMessage;
      expect(validateAuthorization(validApiKeyReq, configuredToken).authorized).toBe(true);

      const invalidReq = {
        headers: { authorization: 'Bearer invalid-token' },
      } as unknown as IncomingMessage;
      const result = validateAuthorization(invalidReq, configuredToken);
      expect(result.authorized).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });

    it('should authorize by default in local single-operator mode (no token configured)', () => {
      const req = { headers: {} } as unknown as IncomingMessage;
      expect(validateAuthorization(req, undefined).authorized).toBe(true);
      expect(validateAuthorization(req, '').authorized).toBe(true);
    });
  });

  describe('Configuration Schema & Fail-Closed Enforcement', () => {
    const origEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...origEnv };
    });

    it('should fail closed in production if API_AUTH_TOKEN is missing or < 32 characters', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_AUTH_TOKEN = 'short-token';
      expect(() => loadConfig('/nonexistent-env')).toThrow(/API_AUTH_TOKEN must be configured with at least 32 characters/);

      delete process.env.API_AUTH_TOKEN;
      expect(() => loadConfig('/nonexistent-env')).toThrow(/API_AUTH_TOKEN must be configured/);
    });

    it('should prohibit wildcard CORS in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_AUTH_TOKEN = 'valid-token-32-characters-or-more-abc';
      process.env.CORS_ORIGIN = '*';
      expect(() => loadConfig('/nonexistent-env')).toThrow(/Wildcard CORS is prohibited in production/);
    });

    it('should reject invalid port numbers', () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '99999';
      expect(() => loadConfig('/nonexistent-env')).toThrow(/Invalid PORT/);

      process.env.PORT = 'invalid';
      expect(() => loadConfig('/nonexistent-env')).toThrow(/Invalid PORT/);
    });

    it('should fail closed if CLOUD_PROVIDER is configured without CLOUD_API_KEY in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_AUTH_TOKEN = 'valid-token-32-characters-or-more-abc';
      process.env.CORS_ORIGIN = 'https://app.example.com';
      process.env.CLOUD_PROVIDER = 'openai';
      process.env.CLOUD_DISABLED = 'false';
      delete process.env.CLOUD_API_KEY;
      expect(() => loadConfig('/nonexistent-env')).toThrow(/CLOUD_API_KEY is required in production/);
    });
  });

  describe('SSRF Protection Hardening', () => {
    it('should block IPv6 loopback variants and mapped addresses', () => {
      expect(() => validateSafeUrl('http://[::1]/api')).toThrow(/SSRF Protection/);
      expect(() => validateSafeUrl('http://[::ffff:127.0.0.1]/status')).toThrow(/SSRF Protection/);
      expect(() => validateSafeUrl('http://[::ffff:10.0.0.1]/secret')).toThrow(/SSRF Protection/);
      expect(() => validateSafeUrl('http://[fe80::1]/link-local')).toThrow(/SSRF Protection/);
      expect(() => validateSafeUrl('http://[fc00::1]/unique-local')).toThrow(/SSRF Protection/);
    });

    it('should block decimal integer IP representations', () => {
      // 2130706433 is 127.0.0.1 in integer notation
      expect(() => validateSafeUrl('http://2130706433/')).toThrow(/SSRF Protection/);
      expect(() => validateSafeUrl('http://0x7f000001/')).toThrow(/SSRF Protection/);
    });

    it('should block internal domain TLDs and cloud metadata', () => {
      expect(() => validateSafeUrl('http://service.local/jobs')).toThrow(/SSRF Protection/);
      expect(() => validateSafeUrl('http://internal.corp/')).toThrow(/SSRF Protection/);
      expect(() => validateSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow(/SSRF Protection/);
    });

    it('should permit valid public external HTTPS URLs', () => {
      const url = validateSafeUrl('https://api.github.com/repos/test');
      expect(url.hostname).toBe('api.github.com');
      expect(url.protocol).toBe('https:');
    });
  });

  describe('Database Transactions & Schema Migrations', () => {
    let db: DatabaseManager;

    beforeEach(() => {
      db = new DatabaseManager(':memory:');
    });

    afterEach(() => {
      db.close();
    });

    it('should execute transactional writes atomically and commit on success', () => {
      const result = db.transaction(() => {
        db.saveUserProfile({
          id: 'user_tx_1',
          fullName: 'Tx User',
          email: 'tx@example.com',
          skills: ['TypeScript'],
          verifiedFacts: [],
          title: 'Software Engineer',
          summary: 'Transactional profile',
        });
        return true;
      });

      expect(result).toBe(true);
      expect(db.getUserProfile()?.fullName).toBe('Tx User');
    });

    it('should roll back changes if an error is thrown inside transaction', () => {
      expect(() => {
        db.transaction(() => {
          db.saveUserProfile({
            id: 'user_tx_fail',
            fullName: 'Rollback User',
            email: 'rollback@example.com',
            skills: ['TypeScript'],
            verifiedFacts: [],
            title: 'Engineer',
            summary: 'Should rollback',
          });
          throw new Error('Simulated failure during write');
        });
      }).toThrow('Simulated failure during write');

      // The profile should not exist because transaction was rolled back
      expect(db.getUserProfile()).toBeNull();
    });

    it('should report database integrity as ok', () => {
      expect(db.integrityCheck()).toBe(true);
    });
  });

  describe('Scheduler Concurrency & Mutual Exclusion', () => {
    it('should guard against overlapping discovery runs', async () => {
      let runCount = 0;
      const fakeOrchestrator = {
        runPipeline: async () => {
          runCount++;
          await new Promise(r => setTimeout(r, 50));
          return {
            scanReport: { totalDiscovered: 1, duplicatesFound: 0, newVacanciesSaved: 1 },
            qualifiedCount: 1,
            draftsPrepared: 0,
            alertsSent: 0,
          };
        },
        getAlertManager: () => ({ getStatus: () => ({ telegram: false, discord: false, minScore: 85 }) }),
      } as unknown as MasterOrchestrator;

      const scheduler = new JobScheduler(fakeOrchestrator, { preset: 'hourly' });

      // Trigger two executions in parallel
      const [res1, res2] = await Promise.all([
        scheduler.executeSingleRun('MANUAL'),
        scheduler.executeSingleRun('SCHEDULED'),
      ]);

      // Both promises resolve, but runPipeline is only executed ONCE because of the mutex
      expect(runCount).toBe(1);
      expect(res1).toBe(res2);
      expect(scheduler.getStatus().isExecuting).toBe(false);
    });
  });

  describe('OAuth State Cryptography & File Security', () => {
    it('should generate unique states and validate them as single-use', () => {
      const oauthManager = new GoogleOAuthManager('client_id_test', 'client_secret_test');
      const state1 = oauthManager.generateState();
      const state2 = oauthManager.generateState();

      expect(state1).not.toBe(state2);
      expect(state1.length).toBe(48); // 24 bytes hex

      // First validation succeeds
      expect(oauthManager.validateState(state1)).toBe(true);

      // Replay / second validation fails (single-use)
      expect(oauthManager.validateState(state1)).toBe(false);

      // Invalid state fails
      expect(oauthManager.validateState('forged_state')).toBe(false);
      expect(oauthManager.validateState(undefined)).toBe(false);
    });
  });

  describe('Data Redaction & Safe Logging', () => {
    it('should redact sensitive string patterns', () => {
      const input = 'Request with Bearer abcdef1234567890xyz and api_key="secretKey12345678" and password=secretPassword99';
      const sanitized = sanitizeText(input);
      expect(sanitized).not.toContain('abcdef1234567890xyz');
      expect(sanitized).not.toContain('secretKey12345678');
      expect(sanitized).not.toContain('secretPassword99');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should deeply sanitize nested objects and sensitive metadata keys', () => {
      const meta = {
        user: 'test_candidate',
        tokens: {
          accessToken: 'ya29.abcdef1234567890xyz',
          refreshToken: '1//04abcdef1234567890xyz',
        },
        credentials: {
          apiKey: 'AIzaSyTest1234567890',
          password: 'superSecretPassword',
        },
        documents: {
          resumeText: 'Full confidential candidate resume history...',
        },
      };

      const sanitized = deepSanitize(meta);
      expect(sanitized.tokens).toBe('[REDACTED]');
      expect(sanitized.credentials).toBe('[REDACTED]');
      expect(sanitized.documents.resumeText).toBe('[REDACTED]');
      expect(sanitized.user).toBe('test_candidate');
    });
  });
});
