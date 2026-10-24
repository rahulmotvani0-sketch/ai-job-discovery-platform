import { logger } from '../core/logger.js';
import type { Vacancy, MatchScoreEvaluation } from '../types/index.js';

export interface AlertConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
  minScore?: number;
}

export interface AlertDispatchResult {
  telegramSent: boolean;
  discordSent: boolean;
  message?: string;
  error?: string;
}

export class AlertNotificationManager {
  private telegramBotToken?: string;
  private telegramChatId?: string;
  private discordWebhookUrl?: string;
  private minScore: number;

  constructor(options?: AlertConfig) {
    this.telegramBotToken = options?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
    this.telegramChatId = options?.telegramChatId || process.env.TELEGRAM_CHAT_ID;
    this.discordWebhookUrl = options?.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL;
    this.minScore = options?.minScore || (process.env.ALERTS_MIN_SCORE ? parseInt(process.env.ALERTS_MIN_SCORE, 10) : 85);
  }

  isTelegramConfigured(): boolean {
    return Boolean(this.telegramBotToken && this.telegramChatId);
  }

  isDiscordConfigured(): boolean {
    return Boolean(this.discordWebhookUrl && this.discordWebhookUrl.startsWith('https://discord.com/api/webhooks/'));
  }

  isConfigured(): boolean {
    return this.isTelegramConfigured() || this.isDiscordConfigured();
  }

  getStatus(): { telegram: boolean; discord: boolean; minScore: number } {
    return {
      telegram: this.isTelegramConfigured(),
      discord: this.isDiscordConfigured(),
      minScore: this.minScore,
    };
  }

  /**
   * Evaluates if a vacancy qualifies for instant mobile notification (score >= minScore).
   */
  shouldAlert(vacancy: Vacancy, evaluation: MatchScoreEvaluation): boolean {
    if (evaluation.overallScore < this.minScore) {
      return false;
    }
    return true;
  }

  /**
   * Dispatches instant mobile alerts across configured Telegram and Discord channels.
   */
  async notifyOpportunity(vacancy: Vacancy, evaluation: MatchScoreEvaluation): Promise<AlertDispatchResult> {
    if (!this.shouldAlert(vacancy, evaluation)) {
      return { telegramSent: false, discordSent: false, message: `Score ${evaluation.overallScore} is below alert threshold ${this.minScore}.` };
    }

    let telegramSent = false;
    let discordSent = false;
    const errors: string[] = [];

    // 1. Dispatch Telegram Alert
    if (this.isTelegramConfigured()) {
      try {
        const text = this.formatTelegramMessage(vacancy, evaluation);
        const res = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.telegramChatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          telegramSent = true;
          logger.info(`Telegram mobile alert sent for "${vacancy.title}" at ${vacancy.companyName}`);
        } else {
          const body = await res.text();
          errors.push(`Telegram API error (${res.status}): ${body}`);
        }
      } catch (err: any) {
        errors.push(`Telegram network error: ${err.message}`);
        logger.warn(`Failed sending Telegram alert: ${err.message}`);
      }
    }

    // 2. Dispatch Discord Webhook
    if (this.isDiscordConfigured()) {
      try {
        const payload = this.formatDiscordPayload(vacancy, evaluation);
        const res = await fetch(this.discordWebhookUrl!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          discordSent = true;
          logger.info(`Discord webhook alert sent for "${vacancy.title}" at ${vacancy.companyName}`);
        } else {
          const body = await res.text();
          errors.push(`Discord Webhook error (${res.status}): ${body}`);
        }
      } catch (err: any) {
        errors.push(`Discord network error: ${err.message}`);
        logger.warn(`Failed sending Discord webhook alert: ${err.message}`);
      }
    }

    // If neither channel configured, log a simulated alert notification
    if (!this.isConfigured()) {
      logger.info(`[Simulation/Mock Alert] High-match opportunity detected (${evaluation.overallScore}%): "${vacancy.title}" at ${vacancy.companyName}. Configure TELEGRAM_BOT_TOKEN or DISCORD_WEBHOOK_URL for live mobile push.`);
    }

    return {
      telegramSent,
      discordSent,
      message: (telegramSent || discordSent) ? 'Alert dispatched successfully' : 'No alerts dispatched',
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  /**
   * Sends a verification test alert to confirm webhook and bot integration.
   */
  async sendTestAlert(): Promise<AlertDispatchResult> {
    const mockVacancy: Vacancy = {
      id: 'test_alert_vac',
      canonicalHash: 'test_hash',
      sourceType: 'greenhouse',
      sourceUrl: 'https://example.com/careers/lead-engineer',
      alternateUrls: [],
      companyName: 'Acme Technologies',
      title: 'Lead Cloud & Systems Engineer',
      normalizedTitle: 'Lead Cloud & Systems Engineer',
      locationText: 'Remote (Worldwide)',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'FULL_TIME',
      rawDescription: 'Test opportunity',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
      isEarlyApplicant: true,
      category: 'Cloud Infra',
    };

    const mockEval: MatchScoreEvaluation = {
      id: 'test_eval',
      vacancyId: 'test_alert_vac',
      overallScore: 95,
      tier: 'Excellent',
      categoryScores: {
        technicalSkills: 30,
        experienceSeniority: 20,
        responsibilities: 15,
        cloudInfrastructure: 10,
        locationRemote: 10,
        compensation: 5,
        otherRequirements: 5,
      },
      matchingSkills: ['TypeScript', 'Kubernetes', 'Terraform', 'Distributed Systems'],
      missingSkills: [],
      evidenceExplanation: 'Test evaluation verification for instant alert notifications.',
      evaluatedAt: new Date().toISOString(),
    };

    return this.notifyOpportunity(mockVacancy, mockEval);
  }

  private formatTelegramMessage(vacancy: Vacancy, evaluation: MatchScoreEvaluation): string {
    const earlyBadge = vacancy.isEarlyApplicant ? '🔥 <b>EARLY APPLICANT (&lt;24h)</b>\n' : '';
    const salary = vacancy.salaryMin ? `💰 Salary: ${vacancy.currency || 'USD'} ${vacancy.salaryMin.toLocaleString()}` : '';
    const skills = evaluation.matchingSkills.slice(0, 5).join(', ');

    return (
      `🎯 <b>JOB DISCOVERY AI — NEW HIGH MATCH</b>\n\n` +
      `${earlyBadge}` +
      `🏢 <b>Company:</b> ${vacancy.companyName}\n` +
      `💼 <b>Role:</b> ${vacancy.title}\n` +
      `⭐ <b>Match Score:</b> <b>${evaluation.overallScore}%</b> (${evaluation.tier})\n` +
      `🌍 <b>Location:</b> ${vacancy.locationText}\n` +
      `${salary ? `${salary}\n` : ''}` +
      `🛠️ <b>Skills:</b> <code>${skills}</code>\n\n` +
      `🔗 <a href="${vacancy.sourceUrl}">View Job Posting</a> | <a href="http://localhost:3300/#approvals">Review Application Draft</a>`
    );
  }

  private formatDiscordPayload(vacancy: Vacancy, evaluation: MatchScoreEvaluation) {
    const earlyTitle = vacancy.isEarlyApplicant ? '🔥 Early Applicant Match (<24h)' : '🎯 New High-Match Opportunity';
    const fields = [
      { name: '🏢 Company', value: vacancy.companyName, inline: true },
      { name: '⭐ Match Score', value: `**${evaluation.overallScore}%** (${evaluation.tier})`, inline: true },
      { name: '🌍 Location', value: vacancy.locationText || 'Remote', inline: true },
      { name: '🛠️ Top Skills', value: evaluation.matchingSkills.slice(0, 5).join(', ') || 'General Tech', inline: false },
    ];

    if (vacancy.salaryMin) {
      fields.push({
        name: '💰 Salary',
        value: `${vacancy.currency || 'USD'} ${vacancy.salaryMin.toLocaleString()}`,
        inline: true,
      });
    }

    return {
      username: 'JOB DISCOVERY AI',
      avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&q=80',
      embeds: [
        {
          title: `${earlyTitle}: ${vacancy.title}`,
          url: vacancy.sourceUrl,
          color: evaluation.overallScore >= 90 ? 0x10b981 : 0x3b82f6, // Emerald green or Royal blue
          description: `A new verified opportunity matching your profile has been detected and staged for your review.`,
          fields,
          footer: {
            text: 'JOB DISCOVERY AI — Autonomous Platform',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
