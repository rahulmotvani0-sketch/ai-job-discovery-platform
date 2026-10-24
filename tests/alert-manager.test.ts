import { describe, it, expect } from 'vitest';
import { AlertNotificationManager } from '../src/notifications/alert-manager.js';
import type { Vacancy, MatchScoreEvaluation } from '../src/types/index.js';

describe('AlertNotificationManager', () => {
  const sampleVacancy: Vacancy = {
    id: 'vac_alert_1',
    canonicalHash: 'hash_alert_1',
    sourceType: 'greenhouse',
    sourceUrl: 'https://boards.greenhouse.io/acme/jobs/12345',
    alternateUrls: [],
    companyName: 'Acme Global',
    title: 'Senior Site Reliability Engineer',
    normalizedTitle: 'Senior Site Reliability Engineer',
    locationText: 'Remote (India / Worldwide)',
    isRemote: true,
    acceptsIndia: true,
    employmentType: 'FULL_TIME',
    rawDescription: 'Kubernetes and distributed cloud infrastructure.',
    publishedAt: new Date().toISOString(),
    discoveredAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    status: 'VERIFIED',
    isContractOrFreelance: false,
    isEarlyApplicant: true,
    category: 'DevOps & SRE',
    salaryMin: 120000,
    currency: 'USD',
  };

  const highMatchEval: MatchScoreEvaluation = {
    id: 'eval_high',
    vacancyId: 'vac_alert_1',
    overallScore: 92,
    tier: 'Excellent',
    categoryScores: {
      technicalSkills: 28,
      experienceSeniority: 20,
      responsibilities: 14,
      cloudInfrastructure: 10,
      locationRemote: 10,
      compensation: 5,
      otherRequirements: 5,
    },
    matchingSkills: ['Kubernetes', 'Terraform', 'Prometheus', 'AWS'],
    missingSkills: [],
    evidenceExplanation: 'Strong match on all core requirements.',
    evaluatedAt: new Date().toISOString(),
  };

  const lowMatchEval: MatchScoreEvaluation = {
    ...highMatchEval,
    id: 'eval_low',
    overallScore: 65,
    tier: 'Possible',
  };

  it('determines when an alert should trigger based on minScore threshold', () => {
    const manager = new AlertNotificationManager({ minScore: 85 });
    expect(manager.shouldAlert(sampleVacancy, highMatchEval)).toBe(true);
    expect(manager.shouldAlert(sampleVacancy, lowMatchEval)).toBe(false);
  });

  it('correctly reports configuration status for Telegram and Discord', () => {
    const unconfigured = new AlertNotificationManager({ minScore: 85 });
    expect(unconfigured.isTelegramConfigured()).toBe(false);
    expect(unconfigured.isDiscordConfigured()).toBe(false);
    expect(unconfigured.isConfigured()).toBe(false);

    const configured = new AlertNotificationManager({
      telegramBotToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      telegramChatId: '987654321',
      discordWebhookUrl: 'https://discord.com/api/webhooks/123456/abcdef',
      minScore: 80,
    });
    expect(configured.isTelegramConfigured()).toBe(true);
    expect(configured.isDiscordConfigured()).toBe(true);
    expect(configured.isConfigured()).toBe(true);
    expect(configured.getStatus().minScore).toBe(80);
  });

  it('simulates alert gracefully in mock/offline mode without failing the pipeline', async () => {
    const manager = new AlertNotificationManager({ minScore: 85 });
    const result = await manager.notifyOpportunity(sampleVacancy, highMatchEval);
    expect(result.telegramSent).toBe(false);
    expect(result.discordSent).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('executes sendTestAlert safely without unhandled rejections', async () => {
    const manager = new AlertNotificationManager({ minScore: 85 });
    const result = await manager.sendTestAlert();
    expect(result).toBeDefined();
    expect(typeof result.telegramSent).toBe('boolean');
    expect(typeof result.discordSent).toBe('boolean');
  });
});
