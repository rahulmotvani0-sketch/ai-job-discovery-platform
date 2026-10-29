/**
 * LinkedIn Integration & Publishing Provider Abstraction
 * 
 * Defines the contract for LinkedIn post staging, scheduling, and publishing.
 * Conforms strictly to LinkedIn's Automated Activity Policies:
 * https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin
 */

export type PostStatus = 
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'CANCELLED'
  | 'FAILED';

export interface PublishPostInput {
  content: string;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  title?: string;
  linkUrl?: string;
  mediaUrls?: string[];
  tags?: string[];
}

export interface PublishResult {
  success: boolean;
  postId?: string;
  shareUrl?: string;
  publishedAt: string;
  mode: 'MANUAL_DRAFT' | 'AUTHORIZED_API';
  instructions?: string;
}

export interface SchedulePostInput extends PublishPostInput {
  scheduledFor: string; // ISO 8601
}

export interface ScheduleResult {
  id: string;
  scheduledFor: string;
  status: PostStatus;
  createdAt: string;
  mode: 'MANUAL_DRAFT' | 'AUTHORIZED_API';
}

export interface ScheduledPostRecord {
  id: string;
  input: SchedulePostInput;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  result?: PublishResult;
}

/**
 * Common Provider Abstraction for LinkedIn Publishing.
 * - Open-Source Edition: Includes interface and ManualLinkedInProvider.
 * - Paid Edition: Supports authorized LinkedIn API or third-party partner providers (e.g. PubloraProvider).
 * 
 * PROHIBITED IN ALL EDITIONS:
 * - No browser automation (Puppeteer/Playwright/Selenium)
 * - No session cookie hijacking or reuse
 * - No web scraping
 * - No automated Easy Apply
 * - No connection request automation
 * - No unsolicited direct messaging
 */
export interface LinkedInPublishingProvider {
  readonly providerId: string;
  readonly name: string;
  readonly isAutomatedPublishingSupported: boolean;

  publishPost(input: PublishPostInput): Promise<PublishResult>;
  schedulePost(input: SchedulePostInput): Promise<ScheduleResult>;
  cancelScheduledPost(id: string): Promise<void>;
  getPostStatus(id: string): Promise<PostStatus>;
}
