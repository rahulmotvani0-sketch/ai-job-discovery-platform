import { createHash } from 'node:crypto';

/**
 * Normalizes a URL by stripping tracking parameters, hashes, and trailing slashes.
 */
export function normalizeJobUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'source', 'gh_src', 'lever-source', 'trk', 'sc_channel',
      'fbclid', 'gclid', 'msclkid'
    ];
    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }
    url.hash = '';
    let normalized = url.toString();
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Normalizes a job title for fuzzy/semantic grouping.
 */
export function normalizeJobTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // remove parentheticals like (Remote) or (India)
    .replace(/\[.*?\]/g, '')
    .replace(/[^\w\s]/g, ' ') // replace punctuation with spaces
    .replace(/\b(senior|sr|lead|junior|jr|staff|principal|i|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes company name for deduplication.
 */
export function normalizeCompanyName(company: string): string {
  return company
    .toLowerCase()
    .replace(/\b(inc|corp|corporation|llc|ltd|pvt|limited|technologies|solutions|technovations)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a SHA-256 canonical hash from company, title, and location/url.
 */
export function computeCanonicalHash(company: string, title: string, normalizedUrl?: string, locationText?: string): string {
  const normCompany = normalizeCompanyName(company);
  const normTitle = normalizeJobTitle(title);
  
  // Cross-source canonical identity is primarily defined by Company + Role Title
  // (aggregators use different internal IDs for the same vacancy)
  const isRemote = (locationText || '').toLowerCase().includes('remote');
  const locBucket = isRemote ? 'remote' : (locationText || '').toLowerCase().trim();
  const identity = `${normCompany}|${normTitle}|${locBucket}`;
  return createHash('sha256').update(identity).digest('hex');
}
