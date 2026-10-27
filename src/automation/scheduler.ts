import { Cron } from 'croner';
import { logger } from '../core/logger.js';
import type { MasterOrchestrator, EndToEndRunResult } from './orchestrator.js';

export type SchedulePreset =
  | 'hourly'
  | 'every_2_hours'
  | 'every_6_hours'
  | 'every_12_hours'
  | 'daily_morning'
  | 'daily_evening'
  | 'custom';

export const SCHEDULE_PRESETS: Record<
  Exclude<SchedulePreset, 'custom'>,
  { cron: string; label: string; description: string }
> = {
  hourly: { cron: '0 * * * *', label: 'Hourly', description: 'Runs every hour on the hour' },
  every_2_hours: { cron: '0 */2 * * *', label: 'Every 2 Hours', description: 'Runs every 2 hours' },
  every_6_hours: { cron: '0 */6 * * *', label: 'Every 6 Hours', description: 'Runs every 6 hours' },
  every_12_hours: { cron: '0 */12 * * *', label: 'Every 12 Hours', description: 'Runs every 12 hours' },
  daily_morning: { cron: '0 9 * * *', label: 'Daily (9:00 AM UTC)', description: 'Runs daily at 09:00 UTC' },
  daily_evening: { cron: '0 18 * * *', label: 'Daily (6:00 PM UTC)', description: 'Runs daily at 18:00 UTC' },
};

export const DEFAULT_TARGET_ATS_SOURCES = [
  'ashby',
  'lever',
  'smartrecruiters',
  'greenhouse',
  'workable',
  'recruitee',
];

export interface SchedulerConfig {
  cronExpression: string;
  preset: SchedulePreset;
  dailyTarget: number;
  minScoreToAlert: number;
  minScoreToDraft: number;
  targetSourceTypes: string[];
  limitPerSource: number;
}

export interface SchedulerStatus extends SchedulerConfig {
  isRunning: boolean;
  isExecuting: boolean;
  lastRunTime?: string;
  nextRunTime?: string;
  dailyQualifiedDiscovered: number;
  totalRuns: number;
  lastRunResult?: EndToEndRunResult;
  alertChannels: {
    telegram: boolean;
    discord: boolean;
    telegramChatId?: string;
  };
}

export class JobScheduler {
  private orchestrator: MasterOrchestrator;
  private cronJob?: Cron;
  private cronExpression: string;
  private preset: SchedulePreset;
  private dailyTarget: number;
  private minScoreToAlert: number;
  private minScoreToDraft: number;
  private targetSourceTypes: string[];
  private limitPerSource: number;

  private isRunning: boolean = false;
  private isExecuting: boolean = false;
  private inFlightRun?: Promise<EndToEndRunResult>;
  private lastRunTime?: string;
  private totalRuns: number = 0;
  private dailyQualifiedDiscovered: number = 0;
  private lastResetDay: number = new Date().getUTCDate();
  private lastRunResult?: EndToEndRunResult;

  constructor(
    orchestrator: MasterOrchestrator,
    options?: Partial<SchedulerConfig>
  ) {
    this.orchestrator = orchestrator;

    const preset = options?.preset || 'hourly';
    this.preset = preset;
    this.cronExpression =
      options?.cronExpression ||
      (preset !== 'custom' && SCHEDULE_PRESETS[preset] ? SCHEDULE_PRESETS[preset].cron : '0 * * * *');
    this.dailyTarget = options?.dailyTarget ?? 10;
    this.minScoreToAlert = options?.minScoreToAlert ?? 80;
    this.minScoreToDraft = options?.minScoreToDraft ?? 70;
    this.targetSourceTypes = options?.targetSourceTypes ? [...options.targetSourceTypes] : [...DEFAULT_TARGET_ATS_SOURCES];
    this.limitPerSource = options?.limitPerSource ?? 15;
  }

  private resetDailyQuotaIfNewDay() {
    const currentDay = new Date().getUTCDate();
    if (currentDay !== this.lastResetDay) {
      this.dailyQualifiedDiscovered = 0;
      this.lastResetDay = currentDay;
    }
  }

  /**
   * Executes a discovery cycle, tracking the run in SQLite and pushing alerts to Telegram/Discord.
   * Guarded by an execution lock to prevent overlapping runs.
   */
  async executeSingleRun(triggerType: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'): Promise<EndToEndRunResult> {
    if (this.isExecuting && this.inFlightRun) {
      logger.warn(`[Scheduler] Cycle already in progress. Re-using active run for ${triggerType} trigger.`);
      return this.inFlightRun;
    }

    this.isExecuting = true;
    this.inFlightRun = (async () => {
      this.resetDailyQuotaIfNewDay();
      this.lastRunTime = new Date().toISOString();
      this.totalRuns++;

      logger.info(
        `[Scheduler] Executing discovery cycle #${this.totalRuns} (Trigger: ${triggerType}, Sources: ${this.targetSourceTypes.join(', ') || 'ALL'})...`
      );

      try {
        const result = await this.orchestrator.runPipeline({
          triggerType,
          sourceIds: this.targetSourceTypes.length > 0 ? this.targetSourceTypes : undefined,
          limitPerSource: this.limitPerSource,
          minScoreToDraft: this.minScoreToDraft,
          minScoreToAlert: this.minScoreToAlert,
        });

        this.dailyQualifiedDiscovered += result.qualifiedCount;
        this.lastRunResult = result;

        logger.info(
          `[Scheduler] Cycle #${this.totalRuns} completed. Discovered: ${result.scanReport.totalDiscovered}, Qualified: ${result.qualifiedCount}, Drafts: ${result.draftsPrepared}, Alerts Sent: ${result.alertsSent}. (Today: ${this.dailyQualifiedDiscovered}/${this.dailyTarget})`
        );

        return result;
      } catch (err: any) {
        logger.error(`[Scheduler] Cycle #${this.totalRuns} failed: ${err.message || err}`);
        throw err;
      } finally {
        this.isExecuting = false;
        this.inFlightRun = undefined;
      }
    })();

    return this.inFlightRun;
  }

  /**
   * Awaits completion of any in-flight execution cycle up to timeoutMs.
   */
  async waitForCompletion(timeoutMs = 10000): Promise<void> {
    if (!this.isExecuting || !this.inFlightRun) return;
    try {
      await Promise.race([
        this.inFlightRun,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Scheduler drain timeout')), timeoutMs)),
      ]);
    } catch (err) {
      logger.warn(`[Scheduler] Drain completed with status: ${err}`);
    }
  }

  /**
   * Triggers an immediate execution cycle on-demand.
   */
  async runNow(): Promise<EndToEndRunResult> {
    return this.executeSingleRun('MANUAL');
  }

  /**
   * Starts the background cron job.
   */
  start(): void {
    if (this.isRunning) return;

    logger.info(`Starting background discovery scheduler with pattern "${this.cronExpression}" (${this.preset})...`);
    this.cronJob = new Cron(this.cronExpression, async () => {
      try {
        await this.executeSingleRun('SCHEDULED');
      } catch (err: any) {
        logger.error(`[Scheduler] Cron trigger error: ${err.message || err}`);
      }
    });

    this.isRunning = true;
  }

  /**
   * Stops the background cron job.
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = undefined;
    }
    this.isRunning = false;
    logger.info('Background discovery scheduler stopped.');
  }

  /**
   * Dynamically reconfigures the scheduler pattern, intervals, and target sources.
   */
  updateConfig(config: Partial<SchedulerConfig>): SchedulerStatus {
    const wasRunning = this.isRunning;
    if (wasRunning) {
      this.stop();
    }

    if (config.preset !== undefined) {
      this.preset = config.preset;
      if (config.preset !== 'custom' && SCHEDULE_PRESETS[config.preset]) {
        this.cronExpression = SCHEDULE_PRESETS[config.preset].cron;
      }
    }

    if (config.cronExpression !== undefined) {
      // Validate cron pattern
      try {
        new Cron(config.cronExpression, () => {});
        this.cronExpression = config.cronExpression;
        if (!config.preset || config.preset !== 'custom') {
          // Check if matches known preset
          const matchingPreset = Object.entries(SCHEDULE_PRESETS).find(
            ([, val]) => val.cron === config.cronExpression
          );
          this.preset = matchingPreset ? (matchingPreset[0] as SchedulePreset) : 'custom';
        }
      } catch (err: any) {
        throw new Error(`Invalid cron expression "${config.cronExpression}": ${err.message}`);
      }
    }

    if (config.dailyTarget !== undefined) this.dailyTarget = Math.max(1, config.dailyTarget);
    if (config.minScoreToAlert !== undefined) this.minScoreToAlert = Math.min(100, Math.max(50, config.minScoreToAlert));
    if (config.minScoreToDraft !== undefined) this.minScoreToDraft = Math.min(100, Math.max(50, config.minScoreToDraft));
    if (config.limitPerSource !== undefined) this.limitPerSource = Math.max(1, config.limitPerSource);
    if (config.targetSourceTypes !== undefined) {
      this.targetSourceTypes = [...config.targetSourceTypes];
    }

    if (wasRunning) {
      this.start();
    }

    return this.getStatus();
  }

  /**
   * Retrieves comprehensive scheduler status and health telemetry.
   */
  getStatus(): SchedulerStatus {
    this.resetDailyQuotaIfNewDay();
    const nextRun = this.cronJob?.nextRun();
    const alertManager = this.orchestrator.getAlertManager();
    const alertStatus = alertManager ? alertManager.getStatus() : { telegram: false, discord: false, minScore: 85 };

    return {
      isRunning: this.isRunning,
      isExecuting: this.isExecuting,
      cronExpression: this.cronExpression,
      preset: this.preset,
      dailyTarget: this.dailyTarget,
      minScoreToAlert: this.minScoreToAlert,
      minScoreToDraft: this.minScoreToDraft,
      targetSourceTypes: [...this.targetSourceTypes],
      limitPerSource: this.limitPerSource,
      lastRunTime: this.lastRunTime,
      nextRunTime: nextRun ? nextRun.toISOString() : undefined,
      dailyQualifiedDiscovered: this.dailyQualifiedDiscovered,
      totalRuns: this.totalRuns,
      lastRunResult: this.lastRunResult,
      alertChannels: {
        telegram: alertStatus.telegram,
        discord: alertStatus.discord,
        telegramChatId: alertStatus.telegramChatId,
      },
    };
  }
}
