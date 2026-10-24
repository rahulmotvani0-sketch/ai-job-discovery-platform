import { logger } from '../core/logger.js';
import type { Vacancy } from '../types/index.js';

export interface VerificationResult {
  isVerified: boolean;
  isExpired: boolean;
  acceptsIndia: boolean;
  confidence: number; // 0 - 1.0
  reasons: string[];
  lastChecked: string;
}

const EXPIRED_PATTERNS = [
  /this job is no longer available/i,
  /this position has been filled/i,
  /no longer accepting applications/i,
  /job posting has expired/i,
  /this listing is closed/i,
  /404 not found/i,
  /page not found/i,
  /position closed/i,
];

const RESTRICTIVE_US_PATTERNS = [
  /\bus only\b/i,
  /\bu\.s\. only\b/i,
  /united states only/i,
  /must be located in (?:the )?united states/i,
  /us citizens?/i,
  /only candidates based in the us/i,
  /us residency required/i,
  /no international applicants/i,
  /must be eligible to work in the us without sponsorship/i,
  /authorized to work in the us only/i,
  /\bus based\b/i,
];

const GLOBAL_OR_INDIA_PATTERNS = [
  /worldwide/i,
  /anywhere/i,
  /work from anywhere/i,
  /global remote/i,
  /remote (?:[-–—]\s*)?(?:worldwide|global|anywhere|india|apac)/i,
  /\bindia\b/i,
  /remote - india/i,
  /\bapac\b/i,
  /south asia/i,
  /bengaluru|bangalore|hyderabad|pune|mumbai|delhi|gurgaon|noida|chennai/i,
  /all locations/i,
  /remote \(global\)/i,
  /open to international/i,
];

export class VacancyVerificationAgent {
  /**
   * Verifies an opportunity from its content, headers, and description.
   */
  static verifyContent(descriptionText: string, locationText: string, httpStatusCode: number = 200): VerificationResult {
    const reasons: string[] = [];
    let isExpired = false;
    let acceptsIndia = false;
    let isVerified = true;

    // 1. HTTP Status check
    if (httpStatusCode === 404 || httpStatusCode === 410) {
      isExpired = true;
      isVerified = false;
      reasons.push(`HTTP status code ${httpStatusCode} indicates page expired or removed.`);
    }

    // 2. Expired markers check
    const combinedText = `${locationText} ${descriptionText}`;
    for (const pattern of EXPIRED_PATTERNS) {
      if (pattern.test(combinedText)) {
        isExpired = true;
        isVerified = false;
        reasons.push(`Detected job closure pattern: "${pattern.source}".`);
        break;
      }
    }

    // 3. Geographic / India eligibility check
    let hasStrictUSClause = false;
    for (const pattern of RESTRICTIVE_US_PATTERNS) {
      if (pattern.test(combinedText)) {
        hasStrictUSClause = true;
        reasons.push(`Detected strict domestic restriction: "${pattern.source}".`);
        break;
      }
    }

    let hasGlobalClause = false;
    for (const pattern of GLOBAL_OR_INDIA_PATTERNS) {
      if (pattern.test(locationText) || pattern.test(descriptionText)) {
        hasGlobalClause = true;
        reasons.push(`Detected global or India-eligible marker: "${pattern.source}".`);
        break;
      }
    }

    if (hasStrictUSClause) {
      acceptsIndia = false;
    } else if (hasGlobalClause) {
      acceptsIndia = true;
    } else {
      // In accordance with truth-in-eligibility rules: Unknown eligibility must remain unknown.
      // Do not convert generic 'Remote' or missing regional details into affirmative India eligibility.
      acceptsIndia = false;
      reasons.push('Ambiguous regional eligibility: Requires explicit evidence of India, APAC, or Worldwide hiring.');
    }

    if (!isExpired) {
      reasons.push('Vacancy verified active with accessible description.');
    }

    const confidence = isExpired ? 0.95 : (hasStrictUSClause || hasGlobalClause ? 0.90 : 0.70);

    return {
      isVerified,
      isExpired,
      acceptsIndia,
      confidence,
      reasons,
      lastChecked: new Date().toISOString(),
    };
  }

  /**
   * Performs live HTTP check for a vacancy if URL is provided.
   */
  static async verifyUrl(url: string, timeoutMs: number = 8000): Promise<{ statusCode: number; accessible: boolean }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timer);

      if (resp.status >= 200 && resp.status < 400) {
        return { statusCode: resp.status, accessible: true };
      }
      return { statusCode: resp.status, accessible: resp.status !== 404 && resp.status !== 410 };
    } catch (err) {
      logger.debug(`URL verify probe failed for ${url}: ${err}`);
      return { statusCode: 0, accessible: true }; // Don't discard immediately on network timeout, let description decide
    }
  }
}

export function verifyIndiaEligibility(locationText: string, descriptionText: string): boolean {
  return VacancyVerificationAgent.verifyContent(descriptionText, locationText).acceptsIndia;
}

export function isEarlyApplicant(publishedAt?: string, maxHours: number = 48): boolean {
  if (!publishedAt) return false;
  const pubDate = new Date(publishedAt).getTime();
  if (isNaN(pubDate)) return false;
  const hoursSince = (Date.now() - pubDate) / (1000 * 60 * 60);
  return hoursSince >= 0 && hoursSince <= maxHours;
}
