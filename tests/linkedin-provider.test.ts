import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ManualLinkedInProvider,
  LinkedInProviderRegistry,
  getLinkedInProvider,
  type LinkedInPublishingProvider,
  type PublishPostInput,
  type PublishResult,
  type SchedulePostInput,
  type ScheduleResult,
  type PostStatus,
} from '../src/integrations/linkedin/index.js';
import { ApplicationServer } from '../src/server.js';

describe('ManualLinkedInProvider (Open-Source Core)', () => {
  it('exposes compliant open-source properties with automated publishing disabled', () => {
    const provider = new ManualLinkedInProvider();
    expect(provider.providerId).toBe('manual');
    expect(provider.name).toContain('Manual LinkedIn Workflow');
    expect(provider.isAutomatedPublishingSupported).toBe(false);
  });

  it('publishPost generates official LinkedIn share-offsite link with URL', async () => {
    const provider = new ManualLinkedInProvider();
    const result = await provider.publishPost({
      content: 'Excited to announce my new open-source contribution!',
      linkUrl: 'https://github.com/rahulmotvani0-sketch/ai-job-discovery-platform',
      visibility: 'PUBLIC',
    });

    expect(result.success).toBe(true);
    expect(result.mode).toBe('MANUAL_DRAFT');
    expect(result.shareUrl).toBe(
      'https://www.linkedin.com/sharing/share-offsite/?url=' +
      encodeURIComponent('https://github.com/rahulmotvani0-sketch/ai-job-discovery-platform')
    );
    expect(result.instructions).toContain('In compliance with LinkedIn automation policies');
  });

  it('publishPost falls back to feed share link when linkUrl is omitted', async () => {
    const provider = new ManualLinkedInProvider();
    const result = await provider.publishPost({
      content: 'Reflecting on software engineering principles.',
    });

    expect(result.success).toBe(true);
    expect(result.mode).toBe('MANUAL_DRAFT');
    expect(result.shareUrl).toBe('https://www.linkedin.com/feed/?shareActive=true');
  });

  it('schedulePost stages draft and allows cancellation and status tracking', async () => {
    const provider = new ManualLinkedInProvider();
    const scheduledTime = new Date(Date.now() + 86400000).toISOString();

    const scheduled = await provider.schedulePost({
      content: 'Scheduled thought leadership draft.',
      scheduledFor: scheduledTime,
    });

    expect(scheduled.status).toBe('SCHEDULED');
    expect(scheduled.scheduledFor).toBe(scheduledTime);
    expect(scheduled.mode).toBe('MANUAL_DRAFT');

    // Query status
    const status = await provider.getPostStatus(scheduled.id);
    expect(status).toBe('SCHEDULED');

    // List scheduled posts
    const allPosts = provider.getScheduledPosts();
    expect(allPosts.some(p => p.id === scheduled.id)).toBe(true);

    // Cancel scheduled post
    await provider.cancelScheduledPost(scheduled.id);
    const updatedStatus = await provider.getPostStatus(scheduled.id);
    expect(updatedStatus).toBe('CANCELLED');

    // Cancelling again or invalid ID throws
    await expect(provider.cancelScheduledPost('non_existent_id')).rejects.toThrow('not found');
  });

  it('markAsPublished transitions status to PUBLISHED', async () => {
    const provider = new ManualLinkedInProvider();
    const scheduled = await provider.schedulePost({
      content: 'Ready to publish draft.',
      scheduledFor: new Date().toISOString(),
    });

    provider.markAsPublished(scheduled.id, {
      success: true,
      postId: 'manual_123',
      publishedAt: new Date().toISOString(),
      mode: 'MANUAL_DRAFT',
    });

    const status = await provider.getPostStatus(scheduled.id);
    expect(status).toBe('PUBLISHED');
  });
});

describe('LinkedInProviderRegistry (Extensibility for Commercial Providers)', () => {
  it('provides singleton instance with manual provider active by default', () => {
    const registry = LinkedInProviderRegistry.getInstance();
    expect(registry).toBeDefined();

    const active = registry.getActiveProvider();
    expect(active.providerId).toBe('manual');
    expect(active.isAutomatedPublishingSupported).toBe(false);

    const helperProvider = getLinkedInProvider();
    expect(helperProvider.providerId).toBe('manual');
  });

  it('supports registering authorized commercial providers without modifying core engine', () => {
    const registry = LinkedInProviderRegistry.getInstance();

    // Mock an approved commercial provider (e.g. PubloraProvider or AuthorizedLinkedInApiProvider)
    class MockAuthorizedLinkedInProvider implements LinkedInPublishingProvider {
      readonly providerId = 'authorized_linkedin_api';
      readonly name = 'Official LinkedIn Developer API (Enterprise)';
      readonly isAutomatedPublishingSupported = true;

      async publishPost(input: PublishPostInput): Promise<PublishResult> {
        return {
          success: true,
          postId: 'urn:li:share:123456789',
          publishedAt: new Date().toISOString(),
          mode: 'AUTHORIZED_API',
        };
      }

      async schedulePost(input: SchedulePostInput): Promise<ScheduleResult> {
        return {
          id: 'auth_sched_999',
          scheduledFor: input.scheduledFor,
          status: 'SCHEDULED',
          createdAt: new Date().toISOString(),
          mode: 'AUTHORIZED_API',
        };
      }

      async cancelScheduledPost(id: string): Promise<void> {}
      async getPostStatus(id: string): Promise<PostStatus> {
        return 'SCHEDULED';
      }
    }

    const mockCommercial = new MockAuthorizedLinkedInProvider();
    registry.registerProvider(mockCommercial);

    const providers = registry.listProviders();
    expect(providers.some(p => p.providerId === 'authorized_linkedin_api')).toBe(true);

    // Switch active provider
    registry.setActiveProvider('authorized_linkedin_api');
    expect(registry.getActiveProvider().providerId).toBe('authorized_linkedin_api');
    expect(registry.getActiveProvider().isAutomatedPublishingSupported).toBe(true);

    // Reset back to manual provider for core stability
    registry.setActiveProvider('manual');
    expect(registry.getActiveProvider().providerId).toBe('manual');
  });

  it('throws error when setting unregistered provider ID', () => {
    const registry = LinkedInProviderRegistry.getInstance();
    expect(() => registry.setActiveProvider('unregistered_unknown_provider')).toThrow('not registered');
  });
});

describe('LinkedIn HTTP API Endpoints', () => {
  let server: ApplicationServer;
  const testPort = 3393;

  beforeAll(async () => {
    server = new ApplicationServer({ port: testPort, host: '127.0.0.1', dbPath: ':memory:' });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('GET /api/linkedin/providers returns active and available providers', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/linkedin/providers`);
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.activeProvider).toBe('manual');
    expect(Array.isArray(data.providers)).toBe(true);
    expect(data.providers.some((p: any) => p.providerId === 'manual')).toBe(true);
  });

  it('POST /api/linkedin/draft generates manual draft and share-offsite link', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/linkedin/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Check out this platform demo!',
        linkUrl: 'https://example.com/demo',
        title: 'Platform Showcase',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.result.mode).toBe('MANUAL_DRAFT');
    expect(data.result.shareUrl).toContain('share-offsite');
    expect(data.result.instructions).toBeDefined();
  });

  it('POST /api/linkedin/draft returns 400 when content is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/linkedin/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain('content is required');
  });

  it('POST /api/linkedin/schedule stages draft and GET /api/linkedin/posts lists it', async () => {
    const futureTime = new Date(Date.now() + 3600000).toISOString();
    const res = await fetch(`http://127.0.0.1:${testPort}/api/linkedin/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Staged for evening networking.',
        scheduledFor: futureTime,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    const scheduledId = data.result.id;
    expect(scheduledId).toBeDefined();

    // List posts
    const listRes = await fetch(`http://127.0.0.1:${testPort}/api/linkedin/posts`);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json() as any;
    expect(listData.count).toBeGreaterThan(0);
    expect(listData.posts.some((p: any) => p.id === scheduledId)).toBe(true);

    // Cancel post
    const cancelRes = await fetch(`http://127.0.0.1:${testPort}/api/linkedin/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: scheduledId }),
    });
    expect(cancelRes.status).toBe(200);
    const cancelData = await cancelRes.json() as any;
    expect(cancelData.message).toContain('cancelled');
  });

  it('POST /api/linkedin/cancel returns 400 when id is missing and 404 for unknown id', async () => {
    const missingRes = await fetch(`http://127.0.0.1:${testPort}/api/linkedin/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingRes.status).toBe(400);

    const notFoundRes = await fetch(`http://127.0.0.1:${testPort}/api/linkedin/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'ghost_post_id' }),
    });
    expect(notFoundRes.status).toBe(404);
  });
});
