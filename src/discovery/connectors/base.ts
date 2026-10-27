import { URL } from 'node:url';
import { logger } from '../../core/logger.js';
import type { RawJobPayload } from '../../types/index.js';
import type { 
  JobSourceCategory, 
  ConnectorHealthCheckResult, 
  JobSourceDefinition 
} from '../registry/types.js';
import type { IJobSourceConnector } from './types.js';

/**
 * Validates that a destination URL is strictly safe from SSRF attacks,
 * rejecting localhost, RFC1918 private IPv4 networks, IPv6 loopbacks,
 * link-local/cloud metadata addresses, and internal network TLDs.
 */
export function validateSafeUrl(urlString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL format: ${urlString}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Prohibited protocol '${parsed.protocol}'. Only HTTP and HTTPS are permitted.`);
  }

  // Strip brackets from IPv6 hostnames (e.g. [::1] -> ::1)
  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  // Prohibit loopback and standard localhost variants
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname === '::' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.corp')
  ) {
    throw new Error(`SSRF Protection: Requests to local/internal destination '${hostname}' are blocked.`);
  }

  // Prohibit Cloud metadata services
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    throw new Error(`SSRF Protection: Access to cloud instance metadata service is strictly blocked.`);
  }

  // Check IPv6 link-local (fe80:), unique local (fc00:/fd00:)
  if (
    hostname.startsWith('fe80:') ||
    hostname.startsWith('fc00:') ||
    hostname.startsWith('fd00:')
  ) {
    throw new Error(`SSRF Protection: Private/Link-local IPv6 address '${hostname}' is blocked.`);
  }

  // Check IPv4-mapped IPv6 (::ffff:x.x.x.x or ::ffff:hex)
  if (hostname.startsWith('::ffff:')) {
    throw new Error(`SSRF Protection: IPv4-mapped IPv6 address '${hostname}' is blocked.`);
  }

  // Check numeric decimal or octal/hex IP representation (e.g., 2130706433 or 0x7f000001)
  if (/^(?:0x[0-9a-f]+|\d+)$/i.test(hostname)) {
    throw new Error(`SSRF Protection: Numeric/Hex integer IP notation '${hostname}' is blocked.`);
  }

  // Parse numeric IPv4 to check RFC 1918 private IP ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  if (match) {
    const octet1 = parseInt(match[1], 10);
    const octet2 = parseInt(match[2], 10);
    const octet3 = parseInt(match[3], 10);
    const octet4 = parseInt(match[4], 10);

    if ([octet1, octet2, octet3, octet4].some(o => o < 0 || o > 255)) {
      throw new Error(`SSRF Protection: Invalid IPv4 octets in '${hostname}'.`);
    }

    // 0.0.0.0/8 current network
    if (octet1 === 0) {
      throw new Error(`SSRF Protection: Zero address range 0.0.0.0/8 blocked.`);
    }
    // 10.0.0.0/8
    if (octet1 === 10) {
      throw new Error(`SSRF Protection: Private IP range 10.0.0.0/8 blocked.`);
    }
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
      throw new Error(`SSRF Protection: Private IP range 172.16.0.0/12 blocked.`);
    }
    // 192.168.0.0/16
    if (octet1 === 192 && octet2 === 168) {
      throw new Error(`SSRF Protection: Private IP range 192.168.0.0/16 blocked.`);
    }
    // 127.0.0.0/8 loopback
    if (octet1 === 127) {
      throw new Error(`SSRF Protection: Loopback IP range 127.0.0.0/8 blocked.`);
    }
    // 169.254.0.0/16 link-local
    if (octet1 === 169 && octet2 === 254) {
      throw new Error(`SSRF Protection: Link-local IP range 169.254.0.0/16 blocked.`);
    }
  }

  return parsed;
}

export abstract class BaseSourceConnector implements IJobSourceConnector {
  abstract readonly sourceId: string;
  abstract readonly name: string;
  abstract readonly sourceType: RawJobPayload['sourceType'];
  abstract readonly category: JobSourceCategory;
  abstract readonly officialUrl: string;

  protected rateLimitRpm: number = 60;
  protected timeoutMs: number = 8000;
  protected maxRetries: number = 2;
  private lastRequestTimestamp: number = 0;

  /**
   * Validates if environment or runtime configuration required by this connector is present.
   */
  abstract validateConfig(): { valid: boolean; missingVars: string[] };

  /**
   * Executes a lightweight health check against the upstream source API or feed endpoint.
   */
  abstract healthCheck(): Promise<ConnectorHealthCheckResult>;

  /**
   * Main fetch entrypoint for job discovery.
   */
  abstract fetchVacancies(options?: { tags?: string[]; limit?: number; country?: string }): Promise<RawJobPayload[]>;

  /**
   * Protected safe fetch wrapper with SSRF defense, timeouts, and bounded backoff.
   */
  protected async safeFetch(
    targetUrl: string, 
    init?: RequestInit, 
    customTimeoutMs?: number
  ): Promise<Response> {
    const validatedUrl = validateSafeUrl(targetUrl);
    await this.throttle();

    const timeout = customTimeoutMs ?? this.timeoutMs;
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(validatedUrl.toString(), {
          ...init,
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'User-Agent': 'JobDiscoveryPlatform/2.0 (Open-Source AI Job Discovery; +https://github.com)',
            'Accept': 'application/json, application/xml, text/xml, */*',
            ...(init?.headers || {})
          }
        });
        clearTimeout(timer);

        // Retry on 429 (Rate Limit) or 503/504 (Temporary Gateway issue)
        if ((response.status === 429 || response.status === 503 || response.status === 504) && attempt <= this.maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          logger.warn(`Connector ${this.sourceId} received HTTP ${response.status}. Backing off ${delay}ms (attempt ${attempt}/${this.maxRetries})...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        return response;
      } catch (err: any) {
        clearTimeout(timer);
        lastError = err;
        if (attempt <= this.maxRetries) {
          const delay = Math.pow(2, attempt) * 400;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw lastError || new Error(`Failed to fetch from ${validatedUrl.hostname} after ${this.maxRetries} attempts`);
  }

  /**
   * Simple client-side throttling to respect published RPM rate limits.
   */
  private async throttle(): Promise<void> {
    if (this.rateLimitRpm <= 0) return;
    const minIntervalMs = (60 * 1000) / this.rateLimitRpm;
    const now = Date.now();
    const elapsed = now - this.lastRequestTimestamp;
    if (elapsed < minIntervalMs) {
      const waitTime = minIntervalMs - elapsed;
      if (waitTime > 0 && waitTime < 10000) {
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
    this.lastRequestTimestamp = Date.now();
  }
}
