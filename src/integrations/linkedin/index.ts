import type { LinkedInPublishingProvider } from './types.js';
import { ManualLinkedInProvider } from './manual-provider.js';
import { logger } from '../../core/logger.js';

export * from './types.js';
export * from './manual-provider.js';

/**
 * Registry and factory for LinkedIn publishing providers.
 * Open-source edition contains ManualLinkedInProvider by default.
 * Paid / commercial edition can register authorized providers (e.g. AuthorizedLinkedInApiProvider, PubloraProvider).
 */
export class LinkedInProviderRegistry {
  private static instance: LinkedInProviderRegistry;
  private providers: Map<string, LinkedInPublishingProvider> = new Map();
  private activeProviderId: string = 'manual';

  private constructor() {
    // Default open-source provider
    const manual = new ManualLinkedInProvider();
    this.providers.set(manual.providerId, manual);
  }

  static getInstance(): LinkedInProviderRegistry {
    if (!LinkedInProviderRegistry.instance) {
      LinkedInProviderRegistry.instance = new LinkedInProviderRegistry();
    }
    return LinkedInProviderRegistry.instance;
  }

  registerProvider(provider: LinkedInPublishingProvider, setActive = false): void {
    this.providers.set(provider.providerId, provider);
    logger.info(`[LinkedInProviderRegistry] Registered provider '${provider.name}' (${provider.providerId}).`);
    if (setActive) {
      this.activeProviderId = provider.providerId;
    }
  }

  getActiveProvider(): LinkedInPublishingProvider {
    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      // Fallback to manual provider
      return this.providers.get('manual') as LinkedInPublishingProvider;
    }
    return provider;
  }

  setActiveProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider '${providerId}' is not registered in LinkedInProviderRegistry.`);
    }
    this.activeProviderId = providerId;
  }

  listProviders(): Array<{ providerId: string; name: string; isAutomatedPublishingSupported: boolean }> {
    return Array.from(this.providers.values()).map(p => ({
      providerId: p.providerId,
      name: p.name,
      isAutomatedPublishingSupported: p.isAutomatedPublishingSupported,
    }));
  }
}

export function getLinkedInProvider(): LinkedInPublishingProvider {
  return LinkedInProviderRegistry.getInstance().getActiveProvider();
}
