/**
 * Global Region and Country Standardization Module
 * Part of the Global Job Discovery Platform
 */

import type { RemoteEligibilityType } from './registry/types.js';

export interface CountryInfo {
  code: string;       // ISO 3166-1 alpha-2
  name: string;
  region: string;
  subregion: string;
  aliases: string[];
}

export const GLOBAL_REGIONS = [
  'South Asia',
  'North America',
  'Europe',
  'UK',
  'APAC',
  'Middle East',
  'Africa',
  'Latin America',
  'Australia and New Zealand',
  'Global',
] as const;

export type GlobalRegionName = typeof GLOBAL_REGIONS[number];

export const STANDARD_COUNTRIES: Record<string, CountryInfo> = {
  IN: {
    code: 'IN',
    name: 'India',
    region: 'South Asia',
    subregion: 'Indian Subcontinent',
    aliases: ['india', 'bengaluru', 'bangalore', 'hyderabad', 'pune', 'delhi', 'noida', 'gurgaon', 'gurugram', 'mumbai', 'chennai', 'kolkata', 'ahmedabad', 'in'],
  },
  US: {
    code: 'US',
    name: 'United States',
    region: 'North America',
    subregion: 'Northern America',
    aliases: ['united states', 'usa', 'us', 'u.s.', 'america', 'california', 'new york', 'texas', 'washington', 'seattle', 'san francisco', 'austin'],
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    region: 'North America',
    subregion: 'Northern America',
    aliases: ['canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'ontario', 'quebec', 'alberta', 'ca'],
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    region: 'UK',
    subregion: 'British Isles',
    aliases: ['united kingdom', 'uk', 'u.k.', 'britain', 'great britain', 'england', 'scotland', 'wales', 'london', 'manchester', 'birmingham'],
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    region: 'Europe',
    subregion: 'Western Europe',
    aliases: ['germany', 'deutschland', 'berlin', 'munich', 'frankfurt', 'hamburg', 'cologne', 'de'],
  },
  FR: {
    code: 'FR',
    name: 'France',
    region: 'Europe',
    subregion: 'Western Europe',
    aliases: ['france', 'paris', 'lyon', 'marseille', 'toulouse', 'fr'],
  },
  NL: {
    code: 'NL',
    name: 'Netherlands',
    region: 'Europe',
    subregion: 'Western Europe',
    aliases: ['netherlands', 'holland', 'amsterdam', 'rotterdam', 'utrecht', 'nl'],
  },
  IE: {
    code: 'IE',
    name: 'Ireland',
    region: 'Europe',
    subregion: 'Western Europe',
    aliases: ['ireland', 'dublin', 'cork', 'galway', 'ie'],
  },
  AU: {
    code: 'AU',
    name: 'Australia',
    region: 'Australia and New Zealand',
    subregion: 'Australasia',
    aliases: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'au'],
  },
  NZ: {
    code: 'NZ',
    name: 'New Zealand',
    region: 'Australia and New Zealand',
    subregion: 'Australasia',
    aliases: ['new zealand', 'auckland', 'wellington', 'christchurch', 'nz'],
  },
  SG: {
    code: 'SG',
    name: 'Singapore',
    region: 'APAC',
    subregion: 'Southeast Asia',
    aliases: ['singapore', 'sg'],
  },
  AE: {
    code: 'AE',
    name: 'United Arab Emirates',
    region: 'Middle East',
    subregion: 'Gulf Cooperation Council',
    aliases: ['united arab emirates', 'uae', 'dubai', 'abu dhabi', 'ae'],
  },
  SA: {
    code: 'SA',
    name: 'Saudi Arabia',
    region: 'Middle East',
    subregion: 'Gulf Cooperation Council',
    aliases: ['saudi arabia', 'ksa', 'riyadh', 'jeddah', 'sa'],
  },
  JP: {
    code: 'JP',
    name: 'Japan',
    region: 'APAC',
    subregion: 'East Asia',
    aliases: ['japan', 'tokyo', 'osaka', 'kyoto', 'jp'],
  },
  KR: {
    code: 'KR',
    name: 'South Korea',
    region: 'APAC',
    subregion: 'East Asia',
    aliases: ['south korea', 'korea', 'seoul', 'busan', 'kr'],
  },
  BR: {
    code: 'BR',
    name: 'Brazil',
    region: 'Latin America',
    subregion: 'South America',
    aliases: ['brazil', 'brasil', 'sao paulo', 'rio de janeiro', 'br'],
  },
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    region: 'Africa',
    subregion: 'Southern Africa',
    aliases: ['south africa', 'johannesburg', 'cape town', 'durban', 'za'],
  },
  NG: {
    code: 'NG',
    name: 'Nigeria',
    region: 'Africa',
    subregion: 'Western Africa',
    aliases: ['nigeria', 'lagos', 'abuja', 'ng'],
  },
};

/**
 * Normalizes any free-form location text into a recognized Country and Region
 */
export function normalizeCountryAndRegion(locationText: string): {
  countryCode: string;
  countryName: string;
  region: string;
  isRemoteWorldwide: boolean;
} {
  const text = (locationText || '').toLowerCase().trim();

  const isWorldwide = /worldwide|global|anywhere|everywhere|work from anywhere|100% remote|remote\s*-\s*worldwide/i.test(text);

  for (const [code, info] of Object.entries(STANDARD_COUNTRIES)) {
    for (const alias of info.aliases) {
      const regex = new RegExp(`\\b${alias.replace(/[+*?()^$|]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        return {
          countryCode: code,
          countryName: info.name,
          region: info.region,
          isRemoteWorldwide: isWorldwide,
        };
      }
    }
  }

  if (isWorldwide) {
    return {
      countryCode: 'GLOBAL',
      countryName: 'Worldwide',
      region: 'Global',
      isRemoteWorldwide: true,
    };
  }

  // European catch-all
  if (/europe|\beu\b|emea/i.test(text)) {
    return {
      countryCode: 'EU',
      countryName: 'European Union',
      region: 'Europe',
      isRemoteWorldwide: false,
    };
  }

  // Latin America catch-all
  if (/latam|latin america/i.test(text)) {
    return {
      countryCode: 'LATAM',
      countryName: 'Latin America',
      region: 'Latin America',
      isRemoteWorldwide: false,
    };
  }

  // APAC catch-all
  if (/apac|asia\s*pacific/i.test(text)) {
    return {
      countryCode: 'APAC',
      countryName: 'Asia-Pacific',
      region: 'APAC',
      isRemoteWorldwide: false,
    };
  }

  return {
    countryCode: 'GLOBAL',
    countryName: 'Worldwide',
    region: 'Global',
    isRemoteWorldwide: false,
  };
}

/**
 * Classifies remote eligibility according to the 6 distinct types
 */
export function classifyRemoteEligibility(
  locationText: string,
  rawDescription?: string,
  isRemoteFlag?: boolean
): RemoteEligibilityType {
  const combined = `${locationText || ''} ${rawDescription || ''}`.toLowerCase();

  if (/hybrid/i.test(combined)) {
    return 'HYBRID';
  }

  if (/on-?site|in-?office|office only|relocation mandatory|must be located at the office/i.test(combined) && !isRemoteFlag) {
    return 'ONSITE';
  }

  // Check country-specific restrictions
  if (/(?:us|usa|united states)\s+(?:only|residents?|citizens?|based)|only\s+in\s+the\s+us/i.test(combined)) {
    return 'REMOTE_COUNTRY_SPECIFIC';
  }
  if (/(?:uk|united kingdom)\s+(?:only|residents?)|only\s+in\s+the\s+uk/i.test(combined)) {
    return 'REMOTE_COUNTRY_SPECIFIC';
  }
  if (/(?:india|indian)\s+(?:only|residents?)|only\s+in\s+india/i.test(combined)) {
    return 'REMOTE_COUNTRY_SPECIFIC';
  }
  if (/(?:canada|canadian)\s+(?:only|residents?)|only\s+in\s+canada/i.test(combined)) {
    return 'REMOTE_COUNTRY_SPECIFIC';
  }

  // Regional restrictions
  if (/emea\s+only|europe\s+only|americas\s+only|apac\s+only|eu\s+residents?\s+only/i.test(combined)) {
    return 'REMOTE_REGION_SPECIFIC';
  }

  // Check for worldwide allowance
  if (/worldwide|anywhere|work from anywhere|no location restriction|global remote|100% remote worldwide/i.test(combined)) {
    return 'FULLY_REMOTE_WORLDWIDE';
  }

  if (isRemoteFlag || /remote/i.test(locationText)) {
    return 'FULLY_REMOTE_WORLDWIDE';
  }

  return 'REMOTE_UNKNOWN';
}
