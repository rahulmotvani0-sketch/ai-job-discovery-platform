import { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self' 'unsafe-inline' data:; connect-src 'self' http: https:; img-src 'self' data: https:;",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTimeMs: number;
}

export class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs = 60_000, maxRequests = 300) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(ip: string, customLimit?: number): RateLimitResult {
    const limit = customLimit || this.maxRequests;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const timestamps = (this.requests.get(ip) || []).filter(t => t > windowStart);
    if (timestamps.length >= limit) {
      const oldest = timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        resetTimeMs: Math.max(0, oldest + this.windowMs - now),
      };
    }

    timestamps.push(now);
    this.requests.set(ip, timestamps);

    // Periodically prune old IPs
    if (this.requests.size > 5000) {
      for (const [key, times] of this.requests.entries()) {
        const valid = times.filter(t => t > windowStart);
        if (valid.length === 0) {
          this.requests.delete(key);
        } else {
          this.requests.set(key, valid);
        }
      }
    }

    return {
      allowed: true,
      remaining: limit - timestamps.length,
      resetTimeMs: this.windowMs,
    };
  }

  reset(): void {
    this.requests.clear();
  }
}

export function extractClientIp(req: IncomingMessage, trustProxy = false): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (trustProxy && typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function getOrCreateRequestId(req: IncomingMessage): string {
  const existing = req.headers['x-request-id'];
  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }
  return randomUUID();
}

export function validateAuthorization(req: IncomingMessage, configuredToken?: string): { authorized: boolean; error?: string } {
  if (!configuredToken || configuredToken.trim() === '') {
    // Local single-operator mode (authorized by default)
    return { authorized: true };
  }

  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === configuredToken) {
      return { authorized: true };
    }
  }

  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim() === configuredToken) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: 'Unauthorized. Provide a valid Bearer token or X-API-Key header.',
  };
}

export function parseJsonBody<T = any>(
  req: IncomingMessage,
  maxBytes = 2 * 1024 * 1024
): Promise<{ data?: T; error?: string; statusCode?: number }> {
  return new Promise((resolve) => {
    let body = '';
    let bytesReceived = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        aborted = true;
        resolve({
          error: `Payload too large. Maximum allowed size is ${maxBytes} bytes.`,
          statusCode: 413,
        });
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (aborted) return;
      if (!body || body.trim() === '') {
        resolve({ data: {} as T });
        return;
      }
      try {
        const parsed = JSON.parse(body);
        resolve({ data: parsed });
      } catch (err: any) {
        resolve({
          error: `Malformed JSON payload: ${err.message}`,
          statusCode: 400,
        });
      }
    });

    req.on('error', (err) => {
      if (!aborted) {
        resolve({
          error: `Request stream error: ${err.message}`,
          statusCode: 400,
        });
      }
    });
  });
}
