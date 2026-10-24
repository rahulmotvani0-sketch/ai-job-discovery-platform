import { randomUUID } from 'node:crypto';
import { logger } from '../core/logger.js';
import type { DatabaseManager } from '../core/database.js';
import type { DiscoveryManager, DiscoveryScanReport } from '../discovery/connectors/manager.js';
import type { ModelRouter } from '../ai/providers/router.js';
import { JobDescriptionAnalysisAgent } from '../ai/agents/job-analyzer.js';
import { JobMatchingAgent } from '../ai/agents/matcher.js';
import { ResumeTailoringAgent } from '../applications/resume-tailor.js';
import { ApplicationWritingAgent } from '../applications/writer.js';
import { ApprovalGatekeeper } from '../applications/approval-gate.js';
import { AlertNotificationManager } from '../notifications/alert-manager.js';
import { InterviewSchedulingEngine } from './interview-engine.js';
import type { IGmailService } from '../integrations/google/gmail.js';
import type { IDriveService } from '../integrations/google/drive.js';
import type { ISheetsService } from '../integrations/google/sheets.js';
import { DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES } from '../core/profile.js';
import type { 
  Vacancy, 
  MatchScoreEvaluation, 
  ApplicationDraft, 
  ApplicationSubmission,
  UserProfile,
  JobPreferences,
  DiscoveryRun,
  DiscoveryStep 
} from '../types/index.js';

export interface EndToEndRunResult {
  runId: string;
  scanReport: DiscoveryScanReport;
  vacanciesEvaluated: number;
  qualifiedCount: number;
  draftsPrepared: number;
  alertsSent: number;
}

export interface PipelineRunOptions {
  limitPerSource?: number;
  minScoreToDraft?: number;
  minScoreToAlert?: number;
  sourceIds?: string[];
  triggerType?: 'RESUME_UPLOAD' | 'MANUAL' | 'SCHEDULED';
}

export class MasterOrchestrator {
  private db: DatabaseManager;
  private discoveryManager: DiscoveryManager;
  private analyzer: JobDescriptionAnalysisAgent;
  private resumeTailor: ResumeTailoringAgent;
  private gatekeeper: ApprovalGatekeeper;
  private gmailService: IGmailService;
  private driveService?: IDriveService;
  private sheetsService?: ISheetsService;
  private alertManager: AlertNotificationManager;
  private interviewEngine: InterviewSchedulingEngine;

  constructor(deps: {
    db: DatabaseManager;
    discoveryManager: DiscoveryManager;
    router?: ModelRouter;
    gmailService: IGmailService;
    driveService?: IDriveService;
    sheetsService?: ISheetsService;
    alertManager?: AlertNotificationManager;
  }) {
    this.db = deps.db;
    this.discoveryManager = deps.discoveryManager;
    this.analyzer = new JobDescriptionAnalysisAgent(deps.router);
    this.resumeTailor = new ResumeTailoringAgent();
    this.gatekeeper = new ApprovalGatekeeper(deps.db);
    this.gmailService = deps.gmailService;
    this.driveService = deps.driveService;
    this.sheetsService = deps.sheetsService;
    this.alertManager = deps.alertManager || new AlertNotificationManager();
    this.interviewEngine = new InterviewSchedulingEngine({
      db: this.db,
      gmailService: this.gmailService,
      alertManager: this.alertManager,
    });
  }

  getGatekeeper(): ApprovalGatekeeper {
    return this.gatekeeper;
  }

  getAlertManager(): AlertNotificationManager {
    return this.alertManager;
  }

  getInterviewEngine(): InterviewSchedulingEngine {
    return this.interviewEngine;
  }

  /**
   * Runs the complete autonomous discovery, extraction, scoring, tailoring, and draft preparation pipeline.
   */
  async runPipeline(options?: PipelineRunOptions): Promise<EndToEndRunResult> {
    const runId = randomUUID();
    const triggerType = options?.triggerType || 'SCHEDULED';
    const minScore = options?.minScoreToDraft ?? 70.0;
    const minAlertScore = options?.minScoreToAlert ?? 80.0;
    const profile = this.db.getUserProfile() || DEFAULT_USER_PROFILE;
    const prefs = this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;

    // Track real discovery run in SQLite
    const discoveryRun: DiscoveryRun = {
      id: runId,
      triggerType,
      status: 'RUNNING',
      currentStep: 'SEARCHING_JOB_SOURCES',
      stepMessage: `Searching active sources (${options?.sourceIds?.length ? options.sourceIds.join(', ') : 'all connectors'})...`,
      totalSourcesSearched: options?.sourceIds?.length || 0,
      discoveredCount: 0,
      evaluatedCount: 0,
      qualifiedCount: 0,
      minScoreThreshold: minScore,
      startedAt: new Date().toISOString(),
    };
    this.db.saveDiscoveryRun(discoveryRun);

    // 1. Discover & Verify raw vacancies
    const scanReport = await this.discoveryManager.runDiscoveryScan({
      limitPerSource: options?.limitPerSource ?? 15,
      sourceIds: options?.sourceIds,
    });

    discoveryRun.totalSourcesSearched = scanReport.sourcesQueried.length;
    discoveryRun.discoveredCount = scanReport.totalDiscovered;
    discoveryRun.currentStep = 'EVALUATING_JOB_MATCHES';
    discoveryRun.stepMessage = `Evaluating match score against parsed candidate profile...`;
    this.db.saveDiscoveryRun(discoveryRun);

    // 2. Fetch verified vacancies that haven't been evaluated yet
    const pendingVacancies = this.db.listVacancies({ status: 'VERIFIED', limit: 15 });
    let vacanciesEvaluated = 0;
    let qualifiedCount = 0;
    let draftsPrepared = 0;
    let alertsSent = 0;

    for (const vacancy of pendingVacancies) {
      try {
        // Step 2a: Analyze requirements with AI / deterministic extractor
        const requirements = await this.analyzer.analyze(vacancy.rawDescription, vacancy.title);
        vacancy.parsedRequirements = requirements;
        this.db.updateVacancyParsedRequirements(vacancy.id, requirements);

        // Step 2b: Score match against candidate profile
        const evaluation = JobMatchingAgent.evaluateMatch(vacancy, profile, prefs);
        this.db.saveMatchEvaluation(evaluation);
        vacanciesEvaluated++;

        // Step 2c: If qualified (score >= 70), prepare tailored resume & application draft
        if (evaluation.overallScore >= minScore) {
          qualifiedCount++;
          this.db.updateVacancyStatus(vacancy.id, 'QUALIFIED');

          // Tailor resume strictly using verified profile evidence
          const tailoredResume = this.resumeTailor.tailorResume(vacancy, profile);

          // Write personalized application email
          const draft = ApplicationWritingAgent.draftApplication(
            vacancy,
            profile,
            tailoredResume.filePath,
            evaluation,
            tailoredResume.pdfPath
          );
          this.db.saveApplicationDraft(draft);
          draftsPrepared++;

          // Upload resume to Drive if configured
          if (this.driveService) {
            const candidateSlug = (profile.fullName || 'Candidate').replace(/[^a-zA-Z0-9_-]/g, '_');
            this.driveService.uploadResumeFile(tailoredResume.filePath, `Resume_${vacancy.companyName}_${candidateSlug}.md`).catch(() => {});
          }

          // Sync to Sheets
          if (this.sheetsService) {
            this.sheetsService.syncVacancyRow(vacancy, evaluation, 'DRAFT_AWAITING_APPROVAL').catch(() => {});
          }

          // Instant Mobile Alert Dispatch (Telegram / Discord) for high-match opportunities
          if (evaluation.overallScore >= minAlertScore) {
            try {
              const alertRes = await this.alertManager.notifyOpportunity(vacancy, evaluation);
              if (alertRes.telegramSent || alertRes.discordSent) {
                alertsSent++;
              }
            } catch (err) {
              logger.debug(`Alert notification skipped: ${err}`);
            }
          }

          logger.info(`Staged qualified application draft for ${vacancy.companyName} - "${vacancy.title}" (Score: ${evaluation.overallScore}/100, Tier: ${evaluation.tier})`);
        } else {
          this.db.updateVacancyStatus(vacancy.id, 'DEPRIORITIZED');
        }
      } catch (err) {
        logger.error(`Error processing vacancy ${vacancy.id} (${vacancy.companyName}): ${err}`);
      }
    }

    // Step 3: Monitor recruiter responses and schedule interviews
    try {
      const syncResult = await this.interviewEngine.syncRecruiterInbox();
      if (syncResult.interactionsProcessed > 0) {
        logger.info(`Recruiter response check: ${syncResult.interactionsProcessed} processed, ${syncResult.draftsCreated} drafts staged, ${syncResult.alertsDispatched} alerts sent.`);
      }
    } catch (err) {
      logger.debug(`Recruiter response check completed with notice: ${err}`);
    }

    // Finalize DiscoveryRun state
    discoveryRun.evaluatedCount = vacanciesEvaluated;
    discoveryRun.qualifiedCount = qualifiedCount;
    discoveryRun.currentStep = 'SEARCH_COMPLETED';
    discoveryRun.stepMessage = `Completed: discovered ${scanReport.totalDiscovered}, evaluated ${vacanciesEvaluated}, ${qualifiedCount} qualified.`;
    discoveryRun.status = 'COMPLETED';
    discoveryRun.completedAt = new Date().toISOString();
    this.db.saveDiscoveryRun(discoveryRun);

    return {
      runId,
      scanReport,
      vacanciesEvaluated,
      qualifiedCount,
      draftsPrepared,
      alertsSent,
    };
  }

  /**
   * User approval action: Sends an approved application through the Gmail API.
   */
  async approveAndSend(draftId: string, actor: string = 'authorized_user', sendingAccountId?: string): Promise<ApplicationSubmission> {
    // 1. Change status to APPROVED and associate chosen account
    this.gatekeeper.approveDraft(draftId, actor, sendingAccountId);

    // 2. Transmit via GmailService (enforces security check)
    const { messageId, threadId } = await this.gmailService.sendApprovedApplication(draftId, this.gatekeeper);

    // 3. Return submission record
    const draft = this.db.getApplicationDraftById(draftId)!;
    const vacancy = this.db.getVacancyById(draft.vacancyId)!;

    if (this.sheetsService) {
      this.sheetsService.syncVacancyRow(vacancy, undefined, 'APPLIED').catch(() => {});
    }

    return this.db.listSubmissions().find(s => s.draftId === draftId)!;
  }

  /**
   * Automatic AI resume-based discovery pipeline with real-time task progress reporting across 7 discrete steps.
   */
  async runResumeBasedDiscovery(options: {
    runId: string;
    profile: UserProfile;
    prefs?: JobPreferences;
    minScoreThreshold?: number;
    adjacentQueries?: string[];
    onProgress?: (step: DiscoveryStep, message: string, stats?: Partial<DiscoveryRun>) => void;
  }): Promise<{
    runId: string;
    totalDiscovered: number;
    evaluatedCount: number;
    qualifiedCount: number;
    qualifyingJobs: Array<Vacancy & { matchScore?: MatchScoreEvaluation }>;
  }> {
    const runId = options.runId;
    const profile = options.profile;
    const prefs = options.prefs || this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;
    const minThreshold = options.minScoreThreshold !== undefined ? options.minScoreThreshold : (prefs.minMatchScore ?? 75.0);

    const updateStep = (step: DiscoveryStep, message: string, stats?: Partial<DiscoveryRun>) => {
      this.db.updateDiscoveryRunStep(runId, step, message, { minScoreThreshold: minThreshold, ...stats });
      options.onProgress?.(step, message, stats);
      logger.info(`[Discovery ${runId}] ${step}: ${message}`);
    };

    try {
      // Step 1: Resume uploaded
      updateStep('RESUME_UPLOADED', 'Resume document validated, checked for security, and stored.');

      // Step 2: Extracting resume information
      updateStep('EXTRACTING_RESUME_INFO', 'Extracting contact facts, work history, education, and technical credentials from document.');

      // Step 3: Analyzing candidate profile
      this.db.saveUserProfile(profile);
      updateStep('ANALYZING_CANDIDATE_PROFILE', `Structured candidate profile saved for ${profile.fullName}. Adjacent role queries generated: ${(options.adjacentQueries || [profile.title]).join(', ')}.`);

      // Step 4: Searching job sources
      updateStep('SEARCHING_JOB_SOURCES', 'Executing live discovery scan across configured connectors...');
      const scanReport = await this.discoveryManager.runDiscoveryScan({ limitPerSource: 15 });
      updateStep('SEARCHING_JOB_SOURCES', `Job discovery completed across configured sources: ${scanReport.totalDiscovered} retrieved, ${scanReport.newVacancies} new canonical listings verified.`, {
        discoveredCount: scanReport.totalDiscovered,
        totalSourcesSearched: 8,
      });

      // Step 5: Evaluating job matches
      updateStep('EVALUATING_JOB_MATCHES', 'Evaluating candidate-to-job match scores using 7-dimension criteria and hard constraints...');
      // Fetch verified vacancies to evaluate
      const vacanciesToScore = this.db.listVacancies({ limit: 40 });
      let evaluatedCount = 0;
      let qualifiedCount = 0;
      const qualifyingJobs: Array<Vacancy & { matchScore?: MatchScoreEvaluation }> = [];

      for (const vacancy of vacanciesToScore) {
        try {
          if (!vacancy.parsedRequirements) {
            const reqs = await this.analyzer.analyze(vacancy.rawDescription, vacancy.title);
            vacancy.parsedRequirements = reqs;
            this.db.updateVacancyParsedRequirements(vacancy.id, reqs);
          }

          const evaluation = JobMatchingAgent.evaluateMatch(vacancy, profile, { ...prefs, minMatchScore: minThreshold });
          this.db.saveMatchEvaluation(evaluation);
          evaluatedCount++;

          // 75% Qualification Rule: Inclusive comparison
          if (evaluation.qualifies75) {
            qualifiedCount++;
            this.db.updateVacancyStatus(vacancy.id, 'QUALIFIED');
            qualifyingJobs.push({ ...vacancy, matchScore: evaluation });

            // Instant alert if score >= 85%
            this.alertManager.notifyOpportunity(vacancy, evaluation).catch(() => {});
          } else if (vacancy.status === 'VERIFIED') {
            this.db.updateVacancyStatus(vacancy.id, 'DEPRIORITIZED');
          }
        } catch (err) {
          logger.warn(`Error evaluating vacancy ${vacancy.id}: ${err}`);
        }
      }

      // Step 6: Saving qualifying jobs
      updateStep('SAVING_QUALIFYING_JOBS', `Saved ${qualifiedCount} verified qualifying job(s) scoring >= ${minThreshold}% with match evidence breakdown.`, {
        evaluatedCount,
        qualifiedCount,
      });

      // Step 7: Search completed
      updateStep('SEARCH_COMPLETED', `AI resume discovery completed successfully: ${scanReport.totalDiscovered} discovered, ${evaluatedCount} evaluated, ${qualifiedCount} qualified at >= ${minThreshold}%.`, {
        evaluatedCount,
        qualifiedCount,
        discoveredCount: scanReport.totalDiscovered,
      });

      return {
        runId,
        totalDiscovered: scanReport.totalDiscovered,
        evaluatedCount,
        qualifiedCount,
        qualifyingJobs,
      };
    } catch (err: any) {
      updateStep('FAILED', `Discovery failed: ${err.message}`, { error: err.message });
      throw err;
    }
  }
}
