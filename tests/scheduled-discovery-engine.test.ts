import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import { MasterOrchestrator } from '../src/automation/orchestrator.js';
import { JobScheduler, SCHEDULE_PRESETS } from '../src/automation/scheduler.js';
import { AlertNotificationManager } from '../src/notifications/alert-manager.js';
import type { IGmailService } from '../src/integrations/google/gmail.js';
import type { IJobSourceConnector } from '../src/discovery/connectors/types.js';
import type { RawJobPayload } from '../src/types/index.js';
import { TEST_CANDIDATE_PROFILE } from './fixtures/test-fixtures.js';
import { DEFAULT_JOB_PREFERENCES } from '../src/core/profile.js';

describe('Automated Scheduled Discovery Engine Suite', () => {
  let db: DatabaseManager;
  let mockGmailService: IGmailService;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    db.saveUserProfile(TEST_CANDIDATE_PROFILE);
    db.savePreferences(DEFAULT_JOB_PREFERENCES);
    mockGmailService = {
      isReady: () => false,
      getStatus: () => ({ email: null, isAuthorized: false, hasRefreshToken: false, tokenExpiresAt: null }),
      getSendingAccount: () => null,
      generateAuthUrl: () => 'https://mock.auth',
      handleOAuthCallback: async () => {},
      disconnect: () => {},
      fetchRecruiterResponses: async () => [],
      sendApprovedApplication: async () => ({ messageId: 'm1', threadId: 't1' }),
      syncEmails: async () => ({ synced: 0, newResponses: 0 }),
    };
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  describe('1. Scheduler Initialization & Preset Cadence', () => {
    it('initializes with default hourly preset and target ATS sources', () => {
      const discoveryManager = new DiscoveryManager(db);
      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager,
        gmailService: mockGmailService,
      });

      const scheduler = new JobScheduler(orchestrator);
      const status = scheduler.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.preset).toBe('hourly');
      expect(status.cronExpression).toBe('0 * * * *');
      expect(status.dailyTarget).toBe(10);
      expect(status.minScoreToAlert).toBe(80);
      expect(status.targetSourceTypes).toContain('ashby');
      expect(status.targetSourceTypes).toContain('lever');
      expect(status.targetSourceTypes).toContain('smartrecruiters');
      expect(status.targetSourceTypes).toContain('greenhouse');
      expect(status.targetSourceTypes).toContain('workable');
      expect(status.targetSourceTypes).toContain('recruitee');
    });

    it('correctly maps all standard schedule presets to valid cron expressions', () => {
      const discoveryManager = new DiscoveryManager(db);
      const orchestrator = new MasterOrchestrator({ db, discoveryManager, gmailService: mockGmailService });

      const scheduler = new JobScheduler(orchestrator);

      // 1. Every 2 Hours
      scheduler.updateConfig({ preset: 'every_2_hours' });
      expect(scheduler.getStatus().preset).toBe('every_2_hours');
      expect(scheduler.getStatus().cronExpression).toBe(SCHEDULE_PRESETS.every_2_hours.cron);

      // 2. Every 6 Hours
      scheduler.updateConfig({ preset: 'every_6_hours' });
      expect(scheduler.getStatus().preset).toBe('every_6_hours');
      expect(scheduler.getStatus().cronExpression).toBe(SCHEDULE_PRESETS.every_6_hours.cron);

      // 3. Every 12 Hours
      scheduler.updateConfig({ preset: 'every_12_hours' });
      expect(scheduler.getStatus().preset).toBe('every_12_hours');
      expect(scheduler.getStatus().cronExpression).toBe(SCHEDULE_PRESETS.every_12_hours.cron);

      // 4. Daily Morning (09:00 UTC)
      scheduler.updateConfig({ preset: 'daily_morning' });
      expect(scheduler.getStatus().preset).toBe('daily_morning');
      expect(scheduler.getStatus().cronExpression).toBe('0 9 * * *');

      // 5. Daily Evening (18:00 UTC)
      scheduler.updateConfig({ preset: 'daily_evening' });
      expect(scheduler.getStatus().preset).toBe('daily_evening');
      expect(scheduler.getStatus().cronExpression).toBe('0 18 * * *');

      // 6. Custom Expression
      scheduler.updateConfig({ cronExpression: '*/30 * * * *' });
      expect(scheduler.getStatus().cronExpression).toBe('*/30 * * * *');
      expect(scheduler.getStatus().preset).toBe('custom');
    });

    it('rejects invalid custom cron expressions safely with descriptive error', () => {
      const discoveryManager = new DiscoveryManager(db);
      const orchestrator = new MasterOrchestrator({ db, discoveryManager, gmailService: mockGmailService });
      const scheduler = new JobScheduler(orchestrator);

      expect(() => {
        scheduler.updateConfig({ cronExpression: 'not-a-valid-cron-pattern' });
      }).toThrow(/Invalid cron expression/);
    });
  });

  describe('2. Start, Stop, and Runtime State Management', () => {
    it('transitions isRunning state cleanly when started and stopped', () => {
      const discoveryManager = new DiscoveryManager(db);
      const orchestrator = new MasterOrchestrator({ db, discoveryManager, gmailService: mockGmailService });
      const scheduler = new JobScheduler(orchestrator);

      expect(scheduler.getStatus().isRunning).toBe(false);

      scheduler.start();
      const runningStatus = scheduler.getStatus();
      expect(runningStatus.isRunning).toBe(true);
      expect(runningStatus.nextRunTime).toBeDefined();

      scheduler.stop();
      const stoppedStatus = scheduler.getStatus();
      expect(stoppedStatus.isRunning).toBe(false);
      expect(stoppedStatus.nextRunTime).toBeUndefined();
    });

    it('restarts cron job seamlessly when configuration changes while running', () => {
      const discoveryManager = new DiscoveryManager(db);
      const orchestrator = new MasterOrchestrator({ db, discoveryManager, gmailService: mockGmailService });
      const scheduler = new JobScheduler(orchestrator);

      scheduler.start();
      expect(scheduler.getStatus().isRunning).toBe(true);

      scheduler.updateConfig({ preset: 'every_6_hours' });
      expect(scheduler.getStatus().isRunning).toBe(true);
      expect(scheduler.getStatus().preset).toBe('every_6_hours');

      scheduler.stop();
    });
  });

  describe('3. Scheduled Discovery Execution & SQLite Audit Tracking', () => {
    it('executes discovery cycle and saves DiscoveryRun with triggerType SCHEDULED in SQLite', async () => {
      const mockJobs: RawJobPayload[] = [
        {
          sourceId: 'ashby_linear_test_s1',
          sourceType: 'ashby',
          requisitionId: 'test_s1',
          sourceUrl: 'https://jobs.ashbyhq.com/linear/test_s1',
          companyName: 'Linear',
          title: 'Senior DevOps / SRE',
          locationText: 'Remote (Worldwide)',
          rawDescription: 'Operating Kubernetes, multi-region AWS cloud infrastructure, and observability.',
          publishedAt: new Date().toISOString(),
          employmentType: 'full-time',
          isRemote: true,
        },
      ];

      const mockConnector: IJobSourceConnector = {
        name: 'Mock Ashby',
        sourceType: 'ashby',
        sourceId: 'ashby',
        fetchVacancies: async () => mockJobs,
      };

      const discoveryManager = new DiscoveryManager(db, [mockConnector]);
      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager,
        gmailService: mockGmailService,
      });

      const scheduler = new JobScheduler(orchestrator, {
        targetSourceTypes: ['ashby'],
        minScoreToAlert: 75,
        minScoreToDraft: 70,
      });

      const result = await scheduler.executeSingleRun('SCHEDULED');

      expect(result.runId).toBeDefined();
      expect(result.scanReport.totalDiscovered).toBe(1);
      expect(result.vacanciesEvaluated).toBe(1);
      expect(result.qualifiedCount).toBe(1);

      // Verify in SQLite database
      const runs = db.listDiscoveryRuns(5);
      expect(runs.length).toBeGreaterThanOrEqual(1);
      const latestRun = runs[0];
      expect(latestRun.id).toBe(result.runId);
      expect(latestRun.triggerType).toBe('SCHEDULED');
      expect(latestRun.status).toBe('COMPLETED');
      expect(latestRun.currentStep).toBe('SEARCH_COMPLETED');
      expect(latestRun.discoveredCount).toBe(1);
      expect(latestRun.qualifiedCount).toBe(1);
      expect(latestRun.completedAt).toBeDefined();
    });

    it('triggers mobile alert when discovered vacancy match score meets threshold', async () => {
      const mockAlertManager = new AlertNotificationManager();
      const notifySpy = vi.spyOn(mockAlertManager, 'notifyOpportunity').mockResolvedValue({
        telegramSent: true,
        discordSent: false,
      });

      const mockJobs: RawJobPayload[] = [
        {
          sourceId: 'lever_palantir_alert_1',
          sourceType: 'lever',
          requisitionId: 'alert_1',
          sourceUrl: 'https://jobs.lever.co/palantir/alert_1',
          companyName: 'Palantir',
          title: 'Senior Site Reliability Engineer',
          locationText: 'Remote (Worldwide)',
          rawDescription: 'Kubernetes, Terraform, AWS, multi-region high availability architectures.',
          publishedAt: new Date().toISOString(),
          employmentType: 'full-time',
          isRemote: true,
        },
      ];

      const mockConnector: IJobSourceConnector = {
        name: 'Mock Lever',
        sourceType: 'lever',
        sourceId: 'lever',
        fetchVacancies: async () => mockJobs,
      };

      const discoveryManager = new DiscoveryManager(db, [mockConnector]);
      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager,
        gmailService: mockGmailService,
        alertManager: mockAlertManager,
      });

      const scheduler = new JobScheduler(orchestrator, {
        targetSourceTypes: ['lever'],
        minScoreToAlert: 75, // Matches the 90%+ score for SRE
      });

      const result = await scheduler.executeSingleRun('SCHEDULED');
      expect(result.qualifiedCount).toBe(1);
      expect(result.alertsSent).toBe(1);
      expect(notifySpy).toHaveBeenCalledTimes(1);

      const status = scheduler.getStatus();
      expect(status.totalRuns).toBe(1);
      expect(status.lastRunResult?.alertsSent).toBe(1);
    });

    it('supports on-demand manual trigger via runNow()', async () => {
      const mockConnector: IJobSourceConnector = {
        name: 'Mock Recruitee',
        sourceType: 'recruitee',
        sourceId: 'recruitee',
        fetchVacancies: async () => [],
      };

      const discoveryManager = new DiscoveryManager(db, [mockConnector]);
      const orchestrator = new MasterOrchestrator({
        db,
        discoveryManager,
        gmailService: mockGmailService,
      });

      const scheduler = new JobScheduler(orchestrator, { targetSourceTypes: ['recruitee'] });
      const result = await scheduler.runNow();

      expect(result.runId).toBeDefined();
      expect(result.scanReport.sourcesQueried).toContain('recruitee');

      const runRecord = db.getDiscoveryRun(result.runId);
      expect(runRecord).not.toBeNull();
      expect(runRecord?.triggerType).toBe('MANUAL');
      expect(runRecord?.status).toBe('COMPLETED');
    });
  });
});
