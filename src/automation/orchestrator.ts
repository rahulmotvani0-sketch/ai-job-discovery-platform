import { logger } from '../core/logger.js';
import type { DatabaseManager } from '../core/database.js';
import type { DiscoveryManager, DiscoveryScanReport } from '../discovery/connectors/manager.js';
import type { ModelRouter } from '../ai/providers/router.js';
import { JobDescriptionAnalysisAgent } from '../ai/agents/job-analyzer.js';
import { JobMatchingAgent } from '../ai/agents/matcher.js';
import { ResumeTailoringAgent } from '../applications/resume-tailor.js';
import { ApplicationWritingAgent } from '../applications/writer.js';
import { ApprovalGatekeeper } from '../applications/approval-gate.js';
import type { IGmailService } from '../integrations/google/gmail.js';
import type { IDriveService } from '../integrations/google/drive.js';
import type { ISheetsService } from '../integrations/google/sheets.js';
import { DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES } from '../core/profile.js';
import type { Vacancy, MatchScoreEvaluation, ApplicationDraft, ApplicationSubmission } from '../types/index.js';

export interface EndToEndRunResult {
  scanReport: DiscoveryScanReport;
  vacanciesEvaluated: number;
  qualifiedCount: number;
  draftsPrepared: number;
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

  constructor(deps: {
    db: DatabaseManager;
    discoveryManager: DiscoveryManager;
    router?: ModelRouter;
    gmailService: IGmailService;
    driveService?: IDriveService;
    sheetsService?: ISheetsService;
  }) {
    this.db = deps.db;
    this.discoveryManager = deps.discoveryManager;
    this.analyzer = new JobDescriptionAnalysisAgent(deps.router);
    this.resumeTailor = new ResumeTailoringAgent();
    this.gatekeeper = new ApprovalGatekeeper(deps.db);
    this.gmailService = deps.gmailService;
    this.driveService = deps.driveService;
    this.sheetsService = deps.sheetsService;
  }

  getGatekeeper(): ApprovalGatekeeper {
    return this.gatekeeper;
  }

  /**
   * Runs the complete autonomous discovery, extraction, scoring, tailoring, and draft preparation pipeline.
   */
  async runPipeline(options?: { limitPerSource?: number; minScoreToDraft?: number }): Promise<EndToEndRunResult> {
    const minScore = options?.minScoreToDraft ?? 70.0;
    const profile = this.db.getUserProfile() || DEFAULT_USER_PROFILE;
    const prefs = this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;

    // 1. Discover & Verify raw vacancies
    const scanReport = await this.discoveryManager.runDiscoveryScan({ limitPerSource: options?.limitPerSource ?? 15 });

    // 2. Fetch verified vacancies that haven't been evaluated yet
    const pendingVacancies = this.db.listVacancies({ status: 'VERIFIED', limit: 10 });
    let vacanciesEvaluated = 0;
    let qualifiedCount = 0;
    let draftsPrepared = 0;

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
            evaluation
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

          logger.info(`Staged qualified application draft for ${vacancy.companyName} - "${vacancy.title}" (Score: ${evaluation.overallScore}/100, Tier: ${evaluation.tier})`);
        } else {
          this.db.updateVacancyStatus(vacancy.id, 'DEPRIORITIZED');
        }
      } catch (err) {
        logger.error(`Error processing vacancy ${vacancy.id} (${vacancy.companyName}): ${err}`);
      }
    }

    // Step 3: Monitor recruiter responses in Gmail
    try {
      const interactions = await this.gmailService.fetchRecruiterResponses();
      for (const inter of interactions) {
        this.db.saveRecruiterInteraction(inter);
      }
    } catch (err) {
      logger.debug(`Recruiter response check completed with notice: ${err}`);
    }

    return {
      scanReport,
      vacanciesEvaluated,
      qualifiedCount,
      draftsPrepared,
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
}
