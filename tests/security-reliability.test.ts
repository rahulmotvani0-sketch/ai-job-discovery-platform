import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryRateLimiter,
  validateAuthorization,
  SECURITY_HEADERS,
  getOrCreateRequestId,
  extractClientIp,
} from '../src/core/security.js';
import { ApplicationServer } from '../src/server.js';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { IncomingMessage } from 'node:http';

describe('Phase 3 & 4: Security, Reliability, & Health Checks', () => {
  const testDbPath = join(process.cwd(), 'data', 'test_security_server.db');
  let server: ApplicationServer;
  const testPort = 3399;

  beforeEach(async () => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    server = new ApplicationServer({ port: testPort, host: '127.0.0.1', dbPath: testDbPath });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('HTTP Security Headers & Request Correlation', () => {
    it('returns standard security headers on JSON API responses', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/api/health`);
      expect(res.status).toBe(200);

      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-xss-protection')).toBe('1; mode=block');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(res.headers.get('x-request-id')).toBeTruthy();
    });

    it('preserves client-provided X-Request-ID across the request lifecycle', async () => {
      const customId = 'req-trace-uuid-12345';
      const res = await fetch(`http://127.0.0.1:${testPort}/health/live`, {
        headers: { 'X-Request-ID': customId },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-request-id')).toBe(customId);
    });
  });

  describe('Rate Limiter', () => {
    it('allows requests within limit and throttles when limit is exceeded', () => {
      const limiter = new InMemoryRateLimiter(60_000, 3);
      const testIp = '192.168.1.100';

      const r1 = limiter.check(testIp);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = limiter.check(testIp);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = limiter.check(testIp);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      const r4 = limiter.check(testIp);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.resetTimeMs).toBeGreaterThan(0);
    });

    it('isolates rate limits between distinct client IPs', () => {
      const limiter = new InMemoryRateLimiter(60_000, 2);
      limiter.check('10.0.0.1');
      limiter.check('10.0.0.1');
      expect(limiter.check('10.0.0.1').allowed).toBe(false);

      expect(limiter.check('10.0.0.2').allowed).toBe(true);
    });
  });

  describe('Authorization Enforcement', () => {
    it('authorizes requests when no server auth token is configured (local operator mode)', () => {
      const mockReq = { headers: {} } as IncomingMessage;
      const result = validateAuthorization(mockReq, undefined);
      expect(result.authorized).toBe(true);
    });

    it('rejects unauthorized requests when API_AUTH_TOKEN is configured', () => {
      const mockReq = { headers: {} } as IncomingMessage;
      const result = validateAuthorization(mockReq, 'super-secret-production-token');
      expect(result.authorized).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });

    it('accepts valid Bearer token', () => {
      const mockReq = {
        headers: { authorization: 'Bearer secret-123' },
      } as IncomingMessage;
      const result = validateAuthorization(mockReq, 'secret-123');
      expect(result.authorized).toBe(true);
    });

    it('accepts valid X-API-Key header', () => {
      const mockReq = {
        headers: { 'x-api-key': 'secret-123' },
      } as IncomingMessage;
      const result = validateAuthorization(mockReq, 'secret-123');
      expect(result.authorized).toBe(true);
    });
  });

  describe('Observability & Health Checks', () => {
    it('serves /health/live with 200 and uptime', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/health/live`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('alive');
      expect(typeof data.uptimeSeconds).toBe('number');
    });

    it('serves /health/ready verifying database connectivity', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/health/ready`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ready');
      expect(data.database).toBe('connected');
    });

    it('serves /api/metrics with system and pipeline stats', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/api/metrics`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.system).toBeDefined();
      expect(data.system.memoryRssMb).toBeGreaterThan(0);
      expect(data.pipeline).toBeDefined();
      expect(data.scheduler).toBeDefined();
    });
  });
});
