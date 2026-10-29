import { randomUUID } from 'node:crypto';
import { logger } from '../../core/logger.js';
import type {
  LinkedInPublishingProvider,
  PublishPostInput,
  PublishResult,
  SchedulePostInput,
  ScheduleResult,
  PostStatus,
  ScheduledPostRecord,
} from './types.js';

/**
 * Open-Source Manual LinkedIn Provider
 * 
 * Complies with LinkedIn Terms of Service & Anti-Automation Policies:
 * - Does NOT perform browser automation or headless clicking.
 * - Does NOT steal, store, or reuse LinkedIn session cookies.
 * - Does NOT automate connections, Easy Apply, or unsolicited DMs.
 * - Generates structured AI drafts, copy-paste content, and pre-filled official web share links.
 */
export class ManualLinkedInProvider implements LinkedInPublishingProvider {
  readonly providerId = 'manual';
  readonly name = 'Manual LinkedIn Workflow (Open-Source)';
  readonly isAutomatedPublishingSupported = false;

  private scheduledPosts: Map<string, ScheduledPostRecord> = new Map();

  /**
   * Generates a pre-filled LinkedIn web share link and copy-ready draft payload.
   */
  async publishPost(input: PublishPostInput): Promise<PublishResult> {
    const postId = `manual_draft_${randomUUID().slice(0, 8)}`;
    
    // Construct official LinkedIn Share Offsite URL if a link is provided
    let shareUrl = 'https://www.linkedin.com/feed/?shareActive=true';
    if (input.linkUrl) {
      shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(input.linkUrl)}`;
    }

    logger.info(`[ManualLinkedInProvider] Prepared manual draft (${postId}) for candidate publishing.`);

    return {
      success: true,
      postId,
      shareUrl,
      mode: 'MANUAL_DRAFT',
      publishedAt: new Date().toISOString(),
      instructions: 
        'Draft prepared successfully. In compliance with LinkedIn automation policies, click the share URL to review and post directly through your browser or official LinkedIn app.',
    };
  }

  /**
   * Schedules a post draft for manual approval and release.
   */
  async schedulePost(input: SchedulePostInput): Promise<ScheduleResult> {
    const id = `sched_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record: ScheduledPostRecord = {
      id,
      input,
      status: 'SCHEDULED',
      createdAt: now,
      updatedAt: now,
    };

    this.scheduledPosts.set(id, record);
    logger.info(`[ManualLinkedInProvider] Scheduled draft ${id} for ${input.scheduledFor}`);

    return {
      id,
      scheduledFor: input.scheduledFor,
      status: 'SCHEDULED',
      createdAt: now,
      mode: 'MANUAL_DRAFT',
    };
  }

  /**
   * Cancels a previously scheduled draft.
   */
  async cancelScheduledPost(id: string): Promise<void> {
    const record = this.scheduledPosts.get(id);
    if (!record) {
      throw new Error(`Scheduled LinkedIn post '${id}' not found.`);
    }

    record.status = 'CANCELLED';
    record.updatedAt = new Date().toISOString();
    this.scheduledPosts.set(id, record);
    logger.info(`[ManualLinkedInProvider] Cancelled scheduled draft ${id}`);
  }

  /**
   * Returns the current status of a scheduled post draft.
   */
  async getPostStatus(id: string): Promise<PostStatus> {
    const record = this.scheduledPosts.get(id);
    if (!record) {
      throw new Error(`Scheduled LinkedIn post '${id}' not found.`);
    }
    return record.status;
  }

  /**
   * Lists all scheduled post drafts for candidate review.
   */
  getScheduledPosts(): ScheduledPostRecord[] {
    return Array.from(this.scheduledPosts.values());
  }

  /**
   * Marks a scheduled draft as published once candidate executes manual post.
   */
  markAsPublished(id: string, publishResult?: PublishResult): void {
    const record = this.scheduledPosts.get(id);
    if (!record) {
      throw new Error(`Scheduled LinkedIn post '${id}' not found.`);
    }
    record.status = 'PUBLISHED';
    record.updatedAt = new Date().toISOString();
    record.result = publishResult;
    this.scheduledPosts.set(id, record);
  }
}
