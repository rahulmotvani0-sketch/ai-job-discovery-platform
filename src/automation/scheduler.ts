import { Cron } from 'croner';
import { logger } from '../core/logger.js';
import type { MasterOrchestrator, EndToEndRunResult } from './orchestrator.js';

export interface SchedulerStatus {
  isRunning: boolean;
  cronExpression: string;
  lastRunTime?: string;
  nextRunTime?: string;
  dailyQualifiedDiscovered: number;
  dailyTarget: number;
  totalRuns: number;
}

export class JobScheduler {
  private orchestrator: MasterOrchestrator;
  private cronJob?: Cron;
  private cronExpression: string;
  private dailyTarget: number;
  private isRunning: boolean = false;
  private lastRunTime?: string;
  private totalRuns: number = 0;
  private dailyQualifiedDiscovered: number = 0;
  private lastResetDay: number = new Date().getUTCDate();

  constructor(orchestrator: MasterOrchestrator, options?: { cronExpression?: string; dailyTarget?: number }) {
    this.orchestrator = orchestrator;
    this.cronExpression = options?.cronExpression || '0 * * * *'; // hourly
    this.dailyTarget = options?.dailyTarget || 10;
  }

  private resetDailyQuotaIfNewDay() {
    const currentDay = new Date().getUTCDate();
    if (currentDay !== this.lastResetDay) {
      this.dailyQualifiedDiscovered = 0;
      this.lastResetDay = currentDay;
    }
  }

  async executeSingleRun(): Promise<EndToEndRunResult> {
    this.resetDailyQuotaIfNewDay();
    this.lastRunTime = new Date().toISOString();
    this.totalRuns++;

    logger.info(`Scheduler executing discovery cycle #${this.totalRuns}...`);
    const result = await this.orchestrator.runPipeline();
    this.dailyQualifiedDiscovered += result.qualifiedCount;

    logger.info(`Scheduler cycle #${this.totalRuns} finished. Discovered today: ${this.dailyQualifiedDiscovered}/${this.dailyTarget}`);
    return result;
  }

  start(): void {
    if (this.isRunning) return;

    logger.info(`Starting persistent background scheduler with cron pattern "${this.cronExpression}"...`);
    this.cronJob = new Cron(this.cronExpression, async () => {
      try {
        await this.executeSingleRun();
      } catch (err) {
        logger.error(`Scheduled run error: ${err}`);
      }
    });

    this.isRunning = true;
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = undefined;
    }
    this.isRunning = false;
    logger.info('Scheduler stopped.');
  }

  getStatus(): SchedulerStatus {
    this.resetDailyQuotaIfNewDay();
    const nextRun = this.cronJob?.nextRun();
    return {
      isRunning: this.isRunning,
      cronExpression: this.cronExpression,
      lastRunTime: this.lastRunTime,
      nextRunTime: nextRun ? nextRun.toISOString() : undefined,
      dailyQualifiedDiscovered: this.dailyQualifiedDiscovered,
      dailyTarget: this.dailyTarget,
      totalRuns: this.totalRuns,
    };
  }
}
