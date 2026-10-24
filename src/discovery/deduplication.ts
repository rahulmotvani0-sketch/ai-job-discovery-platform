import { createHash } from 'node:crypto';

export interface CanonicalIdentityOptions {
  company: string;
  title: string;
  sourceUrl?: string;
  locationText?: string;
  sourceId?: string;
  sourceType?: string;
  requisitionId?: string;
}

/**
 * Standard list of analytics, social, and marketing tracking parameters
 * that must be stripped from job URLs to prevent artificial duplicates.
 */
const TRACKING_QUERY_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'source', 'gh_src', 'lever-source', 'trk', 'sc_channel',
  'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga', '_gl',
  'affiliate', 'partner', 'spJobId', 'spUserId', 'source_id',
  'subsource', 'campaign_id', 'applicant_source', 'referrer'
]);

/**
 * Normalizes a URL by stripping tracking parameters, sorting identifying query parameters,
 * removing hash fragments, and standardizing hostname and path.
 *
 * Parameters identifying the actual vacancy (e.g., id, gh_jid, jobId, reqId) are strictly PRESERVED.
 */
export function normalizeJobUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    
    // 1. Strip tracking parameters
    const toDelete: string[] = [];
    url.searchParams.forEach((_, key) => {
      const lowerKey = key.toLowerCase();
      if (TRACKING_QUERY_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) {
        toDelete.push(key);
      }
    });
    for (const key of toDelete) {
      url.searchParams.delete(key);
    }

    // 2. Remove URL fragment/hash
    url.hash = '';

    // 3. Lowercase host & normalize path
    url.hostname = url.hostname.toLowerCase();
    
    // Sort remaining parameters deterministically
    url.searchParams.sort();

    let normalized = url.toString();
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return trimmed.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Extracts a stable ATS posting identifier from recognized ATS hostnames
 * (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Jobvite, etc.).
 */
export function extractAtsPostingIdentifier(normalizedUrl: string): { ats: string; company: string; jobId: string } | null {
  try {
    const url = new URL(normalizedUrl);
    const host = url.hostname;
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Greenhouse: boards.greenhouse.io/{company}/jobs/{jobId} or job-boards.greenhouse.io/{company}/jobs/{jobId}
    if (host.includes('greenhouse.io')) {
      const companyIndex = pathParts.findIndex(p => p === 'jobs');
      if (companyIndex > 0 && pathParts[companyIndex + 1]) {
        return {
          ats: 'greenhouse',
          company: pathParts[companyIndex - 1].toLowerCase(),
          jobId: pathParts[companyIndex + 1].toLowerCase(),
        };
      }
      const ghJid = url.searchParams.get('gh_jid');
      if (ghJid && pathParts[0]) {
        return { ats: 'greenhouse', company: pathParts[0].toLowerCase(), jobId: ghJid.toLowerCase() };
      }
    }

    // Lever: jobs.lever.co/{company}/{jobId}
    if (host.includes('lever.co') && pathParts.length >= 2) {
      return {
        ats: 'lever',
        company: pathParts[0].toLowerCase(),
        jobId: pathParts[1].toLowerCase(),
      };
    }

    // Ashby: jobs.ashbyhq.com/{company}/{jobId}
    if (host.includes('ashbyhq.com') && pathParts.length >= 2) {
      return {
        ats: 'ashby',
        company: pathParts[0].toLowerCase(),
        jobId: pathParts[1].toLowerCase(),
      };
    }

    // Workable: apply.workable.com/{company}/j/{jobId}
    if (host.includes('workable.com') && pathParts.length >= 3 && pathParts[1] === 'j') {
      return {
        ats: 'workable',
        company: pathParts[0].toLowerCase(),
        jobId: pathParts[2].toLowerCase(),
      };
    }

    // SmartRecruiters: jobs.smartrecruiters.com/{company}/{jobId}
    if (host.includes('smartrecruiters.com') && pathParts.length >= 2) {
      return {
        ats: 'smartrecruiters',
        company: pathParts[0].toLowerCase(),
        jobId: pathParts[1].toLowerCase(),
      };
    }

    // Recruitee: {company}.recruitee.com/o/{jobId} or jobs.recruitee.com/{company}/{jobId}
    if (host.includes('recruitee.com')) {
      const sub = host.split('.')[0].toLowerCase();
      const oIndex = pathParts.findIndex(p => p === 'o');
      if (oIndex >= 0 && pathParts[oIndex + 1]) {
        return {
          ats: 'recruitee',
          company: sub === 'jobs' ? pathParts[0].toLowerCase() : sub,
          jobId: pathParts[oIndex + 1].toLowerCase(),
        };
      }
      if (pathParts.length >= 2) {
        return {
          ats: 'recruitee',
          company: sub === 'jobs' ? pathParts[0].toLowerCase() : sub,
          jobId: pathParts[pathParts.length - 1].toLowerCase(),
        };
      }
    }
  } catch {}
  return null;
}

/**
 * Normalizes a job title without destroying meaningful seniority or specialization distinctions.
 * Preserves levels: intern, junior, mid, senior, lead, staff, principal, director, manager, I, II, III.
 */
export function normalizeJobTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    // Remove location and remote tags in parentheses or brackets
    .replace(/\((remote|hybrid|onsite|india|us|uk|emea|apac|apac\/emea|worldwide|global|wfh)\)/gi, '')
    .replace(/\[(remote|hybrid|onsite|india|us|uk|emea|apac|worldwide|global|wfh)\]/gi, '')
    // Remove gender neutrality markers common in European job postings: (m/f/d), (d/f/m), (w/m/d), etc.
    .replace(/\((m\/f\/d|f\/m\/d|w\/m\/d|d\/m\/w|all genders)\)/gi, '')
    .replace(/\[(m\/f\/d|f\/m\/d|w\/m\/d|d\/m\/w|all genders)\]/gi, '')
    // Normalize and strip seniority prefixes for cross-board deduplication
    .replace(/\b(senior|sr\.?|lead|principal|staff|junior|jr\.?|intern|entry level|mid level)\b/gi, '')
    // Standardize punctuation and ampersands to single spaces
    .replace(/[-–—/\\|:;,._&]/g, ' ')
    // Collapse consecutive whitespaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes company name for deduplication while preserving brand distinctions.
 */
export function normalizeCompanyName(company: string): string {
  if (!company) return '';
  return company
    .toLowerCase()
    .replace(/\b(inc|corp|corporation|llc|ltd|limited|pvt|private|technologies|technology|solutions|services|group|co|holdings)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes location text for location-aware deduplication.
 * Distinguishes remote from specific cities/regions (e.g. London, Toronto, Ahmedabad).
 */
export function normalizeLocationText(locationText?: string): string {
  if (!locationText) return 'unknown';
  const lower = locationText.toLowerCase().trim();
  if (lower.includes('remote') || lower.includes('anywhere') || lower.includes('telecommute') || lower.includes('work from home')) {
    // If it's Remote in a specific country (e.g. Remote - India), preserve the country constraint
    if (lower.includes('india')) return 'remote:india';
    if (lower.includes('us') || lower.includes('united states') || lower.includes('usa')) return 'remote:us';
    if (lower.includes('uk') || lower.includes('united kingdom')) return 'remote:uk';
    if (lower.includes('germany') || lower.includes('deutschland')) return 'remote:germany';
    if (lower.includes('canada')) return 'remote:canada';
    return 'remote:global';
  }

  return lower
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a robust canonical hash using hierarchical identity resolution:
 *
 * 1. Authoritative ATS identifier: ats:company:jobId
 * 2. Stable Source ID + Source Namespace: source:namespace:sourceId
 * 3. Canonical Application URL: url:normalizedUrl
 * 4. Company + Title (with seniority) + Location + Requisition ID: sem:company:title:location:reqId
 */
export function computeCanonicalHash(
  company: string,
  title: string,
  normalizedUrl?: string,
  locationText?: string,
  sourceId?: string,
  sourceType?: string,
  requisitionId?: string
): string {
  const normUrl = normalizedUrl ? normalizeJobUrl(normalizedUrl) : '';
  const normCompany = normalizeCompanyName(company);
  const normTitle = normalizeJobTitle(title);
  const normLoc = normalizeLocationText(locationText);

  // Level 1: Authoritative ATS Posting Identifier from URL
  if (normUrl) {
    const atsMatch = extractAtsPostingIdentifier(normUrl);
    if (atsMatch) {
      const atsIdentity = `ats:${atsMatch.ats}:${atsMatch.company}:${atsMatch.jobId}`;
      return createHash('sha256').update(atsIdentity).digest('hex');
    }
  }

  // Level 2: Authoritative Source Namespace + Source ID
  const isDirectAtsSource = sourceType && ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'recruitee'].includes(sourceType.toLowerCase());
  if (isDirectAtsSource && sourceId && normCompany) {
    const sourceIdentity = `source:${sourceType.toLowerCase()}:${normCompany}:${sourceId.toLowerCase().trim()}`;
    return createHash('sha256').update(sourceIdentity).digest('hex');
  }

  // Level 3: Canonical URL (when safe and non-generic)
  if (normUrl && !normUrl.includes('/jobs') && !normUrl.endsWith('/careers')) {
    try {
      const parsed = new URL(normUrl);
      if (parsed.pathname.length > 5) {
        const urlIdentity = `url:${normCompany}:${normUrl}`;
        return createHash('sha256').update(urlIdentity).digest('hex');
      }
    } catch {}
  }

  // Level 4: Company + Title (with seniority preserved) + Location + Requisition ID
  const reqPart = requisitionId ? `:${requisitionId.trim().toLowerCase()}` : '';
  const semanticIdentity = `sem:${normCompany}|${normTitle}|${normLoc}${reqPart}`;
  return createHash('sha256').update(semanticIdentity).digest('hex');
}
