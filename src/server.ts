import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from './core/logger.js';
import { DatabaseManager } from './core/database.js';
import { AccountManager } from './core/accounts.js';
import { CloudConfigManager } from './ai/providers/cloud-config.js';
import { DiscoveryManager } from './discovery/connectors/manager.js';
import { MasterOrchestrator } from './automation/orchestrator.js';
import { JobScheduler } from './automation/scheduler.js';
import { DirectGmailService } from './integrations/google/gmail.js';
import { DirectGoogleDriveService } from './integrations/google/drive.js';
import { DirectGoogleSheetsService } from './integrations/google/sheets.js';
import { ModelRouter } from './ai/providers/router.js';
import { JobMatchingAgent } from './ai/agents/matcher.js';
import { DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES, loadAuthoritativeProfile } from './core/profile.js';
import { AtsPdfGenerator } from './applications/pdf-generator.js';
import { ResumeIntelligenceEngine } from './applications/resume-intelligence.js';
import type { InferenceMode, Vacancy, UserProfile, DiscoveryRun, JobFilterCriteria, SavedSearch } from './types/index.js';
import { filterVacancies, getAvailableFilterOptions } from './discovery/filtering.js';
import { listAllConnectorCapabilities } from './discovery/capabilities.js';
import { config } from './config/index.js';
import { GoogleOAuthManager } from './integrations/google/oauth.js';
import {
  SECURITY_HEADERS,
  InMemoryRateLimiter,
  extractClientIp,
  getOrCreateRequestId,
  validateAuthorization,
  parseJsonBody,
} from './core/security.js';

export class ApplicationServer {
  private port: number;
  private host: string;
  private db: DatabaseManager;
  private accountManager: AccountManager;
  private cloudConfigManager: CloudConfigManager;
  private router: ModelRouter;
  private orchestrator: MasterOrchestrator;
  private discoveryManager: DiscoveryManager;
  private scheduler: JobScheduler;
  private googleOAuthManager: GoogleOAuthManager;
  private rateLimiter: InMemoryRateLimiter;
  private server?: ReturnType<typeof createServer>;

  constructor(options?: { port?: number; host?: string; dbPath?: string }) {
    this.port = options?.port || config.port || 3300;
    this.host = options?.host || config.host || '127.0.0.1';

    const dbPath = options?.dbPath || process.env.DB_PATH || join(process.cwd(), 'data', 'job_platform.db');
    this.db = new DatabaseManager(dbPath);
    this.accountManager = new AccountManager(this.db);
    this.cloudConfigManager = new CloudConfigManager(this.db);

    // Initialize user profile from verified master resume if not present
    if (!this.db.getUserProfile()) {
      const verifiedProfile = loadAuthoritativeProfile();
      this.db.saveUserProfile(verifiedProfile);
      this.db.savePreferences(DEFAULT_JOB_PREFERENCES);
      logger.info('Initialized database with verified candidate profile.');
    }

    this.discoveryManager = new DiscoveryManager(this.db);
    const discoveryManager = this.discoveryManager;
    const gmailService = new DirectGmailService();
    const driveService = new DirectGoogleDriveService();
    const sheetsService = new DirectGoogleSheetsService();
    this.router = new ModelRouter({ db: this.db });

    this.orchestrator = new MasterOrchestrator({
      db: this.db,
      discoveryManager,
      router: this.router,
      gmailService,
      driveService,
      sheetsService,
    });

    // Initialize alert manager with persisted notification configs
    try {
      const telegramCfg = this.db.getNotificationConfig('telegram');
      const discordCfg = this.db.getNotificationConfig('discord');
      const alertMgr = this.orchestrator.getAlertManager();
      if (telegramCfg?.credentials?.botToken && telegramCfg?.credentials?.chatId && telegramCfg.isEnabled) {
        alertMgr.updateConfig({
          telegramBotToken: telegramCfg.credentials.botToken,
          telegramChatId: String(telegramCfg.credentials.chatId),
        });
      }
      if (discordCfg?.credentials?.webhookUrl && discordCfg.isEnabled) {
        alertMgr.updateConfig({
          discordWebhookUrl: discordCfg.credentials.webhookUrl,
        });
      }
      if (telegramCfg?.minScore || discordCfg?.minScore) {
        alertMgr.updateConfig({
          minScore: telegramCfg?.minScore || discordCfg?.minScore,
        });
      }
    } catch (err: any) {
      logger.warn(`Failed loading notification configs: ${err.message}`);
    }

    this.googleOAuthManager = new GoogleOAuthManager(undefined, undefined, undefined, undefined, this.accountManager);
    this.scheduler = new JobScheduler(this.orchestrator);
    this.rateLimiter = new InMemoryRateLimiter(60_000, 300);
  }

  getDatabase(): DatabaseManager {
    return this.db;
  }

  getAccountManager(): AccountManager {
    return this.accountManager;
  }

  getCloudConfigManager(): CloudConfigManager {
    return this.cloudConfigManager;
  }

  getOrchestrator(): MasterOrchestrator {
    return this.orchestrator;
  }

  getDiscoveryManager(): DiscoveryManager {
    return this.discoveryManager;
  }

  getScheduler(): JobScheduler {
    return this.scheduler;
  }

  getRateLimiter(): InMemoryRateLimiter {
    return this.rateLimiter;
  }

  private sendJson(res: ServerResponse, statusCode: number, data: any, requestId?: string) {
    const json = JSON.stringify(data);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Request-ID',
      ...SECURITY_HEADERS,
    };
    if (requestId) {
      headers['X-Request-ID'] = requestId;
    }
    res.writeHead(statusCode, headers);
    res.end(json);
  }

  private sendHtml(res: ServerResponse, statusCode: number, html: string, requestId?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...SECURITY_HEADERS,
    };
    if (requestId) {
      headers['X-Request-ID'] = requestId;
    }
    res.writeHead(statusCode, headers);
    res.end(html);
  }

  private async parseBody(req: IncomingMessage): Promise<any> {
    const parsed = await parseJsonBody(req, 2 * 1024 * 1024);
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    return parsed.data || {};
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer(async (req, res) => {
        const requestId = getOrCreateRequestId(req);
        const clientIp = extractClientIp(req);

        // Handle CORS Preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Request-ID',
            'X-Request-ID': requestId,
            ...SECURITY_HEADERS,
          });
          res.end();
          return;
        }

        // Rate limiting enforcement
        const rateCheck = this.rateLimiter.check(clientIp);
        if (!rateCheck.allowed) {
          logger.warn(`Rate limit exceeded for IP ${clientIp} on ${req.url}`);
          return this.sendJson(res, 429, {
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please wait before retrying.',
            retryAfterMs: rateCheck.resetTimeMs,
          }, requestId);
        }

        const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);
        const pathname = url.pathname;

        try {
          // Guard mutating endpoints if API_AUTH_TOKEN is configured
          const isMutating = req.method !== 'GET' && req.method !== 'OPTIONS' && !pathname.startsWith('/oauth2callback');
          if (isMutating && config.apiAuthToken) {
            const authCheck = validateAuthorization(req, config.apiAuthToken);
            if (!authCheck.authorized) {
              return this.sendJson(res, 401, { error: authCheck.error }, requestId);
            }
          }

          // Observability & Health Check Endpoints
          if (pathname === '/health/live') {
            return this.sendJson(res, 200, {
              status: 'alive',
              uptimeSeconds: Math.floor(process.uptime()),
              timestamp: new Date().toISOString(),
            }, requestId);
          }

          if (pathname === '/health/ready') {
            try {
              this.db.getDashboardMetrics();
              return this.sendJson(res, 200, {
                status: 'ready',
                database: 'connected',
                scheduler: this.scheduler.getStatus().isRunning ? 'active' : 'idle',
                timestamp: new Date().toISOString(),
              }, requestId);
            } catch (err: any) {
              return this.sendJson(res, 503, {
                status: 'not_ready',
                database: 'disconnected',
                error: err.message,
                timestamp: new Date().toISOString(),
              }, requestId);
            }
          }

          if (pathname === '/api/metrics') {
            const mem = process.memoryUsage();
            const metrics = this.db.getDashboardMetrics();
            return this.sendJson(res, 200, {
              system: {
                uptimeSeconds: Math.floor(process.uptime()),
                memoryRssMb: Math.round(mem.rss / 1024 / 1024),
                memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
                nodeVersion: process.version,
                platform: process.platform,
              },
              pipeline: metrics,
              scheduler: this.scheduler.getStatus(),
              timestamp: new Date().toISOString(),
            }, requestId);
          }

          if (pathname === '/api/health') {
            return this.sendJson(res, 200, {
              status: 'healthy',
              timestamp: new Date().toISOString(),
              version: '1.1.0',
              scheduler: this.scheduler.getStatus(),
              inferenceMode: this.router.getMode(),
            }, requestId);
          }

          if (pathname === '/api/dashboard/metrics') {
            const metrics = this.db.getDashboardMetrics();
            return this.sendJson(res, 200, metrics);
          }

          if (pathname === '/api/profile') {
            if (req.method === 'GET') {
              const profile = this.db.getUserProfile() || DEFAULT_USER_PROFILE;
              return this.sendJson(res, 200, profile);
            }
            if (req.method === 'POST') {
              const body = await this.parseBody(req);
              this.db.saveUserProfile(body);
              return this.sendJson(res, 200, { success: true });
            }
          }

          if (pathname === '/api/profile/upload-resume' && req.method === 'POST') {
            const body = await this.parseBody(req);
            let fileBuffer: Buffer | undefined;
            const fileName = body.fileName || 'resume.txt';

            if (body.fileBase64) {
              try {
                fileBuffer = Buffer.from(body.fileBase64, 'base64');
              } catch {
                return this.sendJson(res, 400, { error: 'Invalid base64 payload' });
              }
            } else if (body.resumeContent) {
              fileBuffer = Buffer.from(body.resumeContent, 'utf-8');
            } else {
              return this.sendJson(res, 400, { error: 'Either fileBase64 or resumeContent is required' });
            }

            try {
              const currentProfile = this.db.getUserProfile() || DEFAULT_USER_PROFILE;
              const parsedDoc = await ResumeIntelligenceEngine.parseDocument(fileBuffer, fileName);
              const analysis = ResumeIntelligenceEngine.analyzeCandidateResume(parsedDoc.text, currentProfile);

              if (!body.previewOnly && !body.dryRun) {
                this.db.saveUserProfile(analysis.profile);
              }

              const warnings: string[] = [];
              if (!analysis.profile.education || analysis.profile.education.length === 0) {
                warnings.push('No formal education degree detected in text.');
              }
              if (!analysis.profile.experiences || analysis.profile.experiences.length === 0) {
                warnings.push('No discrete work history blocks detected.');
              }

              return this.sendJson(res, 200, {
                success: true,
                message: body.previewOnly ? 'Resume parsed for preview' : 'Resume parsed and profile updated successfully',
                previewOnly: Boolean(body.previewOnly || body.dryRun),
                profile: analysis.profile,
                extractedFacts: analysis.extractedFacts,
                adjacentQueries: analysis.adjacentSearchTitles,
                fileType: parsedDoc.fileType,
                textPreview: parsedDoc.text.slice(0, 1000),
                warnings,
              });
            } catch (err: any) {
              return this.sendJson(res, 400, { error: err.message });
            }
          }

          if (pathname === '/api/resume/upload-and-discover' && req.method === 'POST') {
            const body = await this.parseBody(req);
            let fileBuffer: Buffer | undefined;
            const fileName = body.fileName || 'resume.txt';
            let parsedDoc: { text: string; fileType: string } | undefined;
            const currentProfile = this.db.getUserProfile() || DEFAULT_USER_PROFILE;

            if (body.useExistingProfile) {
              const allSkills = Object.values(currentProfile.skills || {}).flat().filter(Boolean);
              const expList = currentProfile.experiences || [];
              const expText = expList.map(e => `${e.role} at ${e.company}: ${(e.achievements || []).join('. ')}`).join('\n');
              const text = currentProfile.summary 
                ? `${currentProfile.fullName}\n${currentProfile.title || ''}\n${currentProfile.summary}\nSkills: ${allSkills.join(', ')}\nExperience:\n${expText}`
                : `${currentProfile.fullName || 'Candidate'}\nSkills: ${allSkills.join(', ')}\nExperience:\n${expText}`;
              parsedDoc = { text, fileType: 'profile' };
            } else if (body.fileBase64) {
              try {
                fileBuffer = Buffer.from(body.fileBase64, 'base64');
              } catch {
                return this.sendJson(res, 400, { error: 'Invalid base64 payload' });
              }
            } else if (body.resumeContent) {
              fileBuffer = Buffer.from(body.resumeContent, 'utf-8');
            } else {
              return this.sendJson(res, 400, { error: 'Either fileBase64, resumeContent, or useExistingProfile is required' });
            }

            try {
              if (!parsedDoc && fileBuffer) {
                parsedDoc = await ResumeIntelligenceEngine.parseDocument(fileBuffer, fileName);
              }
              if (!parsedDoc) {
                return this.sendJson(res, 400, { error: 'Failed to process resume document' });
              }
              const analysis = ResumeIntelligenceEngine.analyzeCandidateResume(parsedDoc.text, currentProfile);

              this.db.saveUserProfile(analysis.profile);

              const runId = randomUUID();
              const prefs = this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;
              const threshold = body.minMatchScore !== undefined ? Number(body.minMatchScore) : (prefs.minMatchScore ?? 75.0);

              const run: DiscoveryRun = {
                id: runId,
                triggerType: 'RESUME_UPLOAD',
                status: 'RUNNING',
                currentStep: 'RESUME_UPLOADED',
                stepMessage: `Resume document (${fileName}) parsed successfully. Structured candidate profile saved.`,
                totalSourcesSearched: 8,
                discoveredCount: 0,
                evaluatedCount: 0,
                qualifiedCount: 0,
                minScoreThreshold: threshold,
                startedAt: new Date().toISOString(),
              };
              this.db.saveDiscoveryRun(run);

              const autoStart = body.autoStartDiscovery !== false && body.consentGiven !== false;
              if (autoStart) {
                this.orchestrator.runResumeBasedDiscovery({
                  runId,
                  profile: analysis.profile,
                  prefs,
                  minScoreThreshold: threshold,
                  adjacentQueries: analysis.adjacentSearchTitles,
                }).catch((err) => {
                  logger.error(`Error in resume discovery run ${runId}: ${err}`);
                });
              }

              return this.sendJson(res, 200, {
                success: true,
                runId,
                profile: analysis.profile,
                extractedFacts: analysis.extractedFacts,
                adjacentQueries: analysis.adjacentSearchTitles,
                fileType: parsedDoc.fileType,
                discoveryStarted: autoStart,
                minScoreThreshold: threshold,
              });
            } catch (err: any) {
              return this.sendJson(res, 400, { error: err.message });
            }
          }

          if (pathname.startsWith('/api/discovery/runs/') && req.method === 'GET') {
            const id = pathname.replace('/api/discovery/runs/', '');
            const run = this.db.getDiscoveryRun(id);
            if (!run) return this.sendJson(res, 404, { error: 'Discovery run not found' });
            return this.sendJson(res, 200, run);
          }

          if (pathname === '/api/discovery/runs' && req.method === 'GET') {
            const runs = this.db.listDiscoveryRuns(20);
            return this.sendJson(res, 200, runs);
          }

          if (pathname === '/api/discovery/threshold') {
            if (req.method === 'GET') {
              const prefs = this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;
              return this.sendJson(res, 200, { minMatchScore: prefs.minMatchScore ?? 75.0 });
            }
            if (req.method === 'POST') {
              const body = await this.parseBody(req);
              const threshold = Number(body.minMatchScore);
              if (isNaN(threshold) || threshold < 0 || threshold > 100) {
                return this.sendJson(res, 400, { error: 'minMatchScore must be a number between 0 and 100' });
              }
              const prefs = this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;
              prefs.minMatchScore = threshold;
              this.db.savePreferences(prefs);

              try {
                (this.db as any).db.prepare(`
                  UPDATE match_evaluations 
                  SET qualifies_75 = (CASE WHEN overall_score >= ? AND (mandatory_blockers IS NULL OR mandatory_blockers = '[]') THEN 1 ELSE 0 END)
                `).run(threshold);
              } catch {}

              return this.sendJson(res, 200, { success: true, minMatchScore: threshold });
            }
          }

          if (pathname === '/api/discovery/recurring' && req.method === 'POST') {
            const body = await this.parseBody(req);
            const enabled = Boolean(body.enabled);
            const prefs = this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;
            prefs.hourlyDiscoveryEnabled = enabled;
            this.db.savePreferences(prefs);
            if (enabled) {
              this.scheduler.start();
            } else {
              this.scheduler.stop();
            }
            return this.sendJson(res, 200, {
              success: true,
              hourlyDiscoveryEnabled: enabled,
              schedulerStatus: this.scheduler.getStatus(),
            });
          }

          // Global Discovery Source Registry & Coverage Endpoints
          if (pathname === '/api/discovery/sources' && req.method === 'GET') {
            const category = url.searchParams.get('category') as any;
            const status = url.searchParams.get('status') as any;
            const country = url.searchParams.get('country') || undefined;
            const search = url.searchParams.get('search') || undefined;
            const isEnabledParam = url.searchParams.get('isEnabled');
            const isEnabled = isEnabledParam !== null ? isEnabledParam === 'true' || isEnabledParam === '1' : undefined;

            const sources = this.db.listSources({ category, status, country, isEnabled, search });
            return this.sendJson(res, 200, {
              total: sources.length,
              sources,
            });
          }

          if (pathname.startsWith('/api/discovery/sources/') && !pathname.endsWith('/test') && !pathname.endsWith('/toggle') && req.method === 'GET') {
            const sourceId = pathname.replace('/api/discovery/sources/', '');
            const source = this.db.getSource(sourceId);
            if (!source) {
              return this.sendJson(res, 404, { error: `Source '${sourceId}' not found in registry.` });
            }
            return this.sendJson(res, 200, source);
          }

          if (pathname.endsWith('/toggle') && pathname.startsWith('/api/discovery/sources/') && req.method === 'POST') {
            const parts = pathname.split('/');
            const sourceId = parts[4];
            const body = await this.parseBody(req);
            const isEnabled = Boolean(body.isEnabled);
            const updated = this.db.toggleSourceEnabled(sourceId, isEnabled);
            if (!updated) {
              return this.sendJson(res, 404, { error: `Source '${sourceId}' not found.` });
            }
            return this.sendJson(res, 200, { success: true, sourceId, isEnabled });
          }

          if (pathname.endsWith('/test') && pathname.startsWith('/api/discovery/sources/') && req.method === 'POST') {
            const parts = pathname.split('/');
            const sourceId = parts[4];
            const source = this.db.getSource(sourceId);
            if (!source) {
              return this.sendJson(res, 404, { error: `Source '${sourceId}' not found.` });
            }

            // Test connector health
            const connector = (this.discoveryManager as any).connectors?.find((c: any) => c.sourceType === sourceId || c.sourceId === sourceId);
            if (connector && typeof connector.healthCheck === 'function') {
              try {
                const health = await connector.healthCheck();
                const healthStatus = health.healthy ? 'HEALTHY' : 'UNHEALTHY';
                this.db.updateSourceStatus(sourceId, source.implementationStatus, healthStatus, health.healthy ? undefined : health.message);
                return this.sendJson(res, 200, {
                  sourceId,
                  healthCheck: health,
                });
              } catch (err: any) {
                this.db.updateSourceStatus(sourceId, source.implementationStatus, 'UNHEALTHY', err.message);
                return this.sendJson(res, 200, {
                  sourceId,
                  healthCheck: {
                    sourceId,
                    healthy: false,
                    message: err.message,
                    checkedAt: new Date().toISOString(),
                  }
                });
              }
            } else {
              return this.sendJson(res, 200, {
                sourceId,
                healthCheck: {
                  sourceId,
                  healthy: false,
                  message: `Source '${source.name}' has status '${source.implementationStatus}' and is not an active automated connector.`,
                  checkedAt: new Date().toISOString(),
                }
              });
            }
          }

          if (pathname === '/api/discovery/coverage' && req.method === 'GET') {
            const summary = this.db.getSourceRegistrySummary();
            const recentRuns = this.db.listDiscoveryRuns(5);
            return this.sendJson(res, 200, {
              summary,
              recentRuns,
              timestamp: new Date().toISOString(),
            });
          }

          if (pathname === '/api/discovery/proposals' && req.method === 'GET') {
            const status = url.searchParams.get('status') as any;
            const proposals = this.db.listSourceProposals(status);
            return this.sendJson(res, 200, { proposals, total: proposals.length });
          }

          if (pathname === '/api/discovery/proposals' && req.method === 'POST') {
            const body = await this.parseBody(req);
            if (!body.name || !body.officialDomain || !body.category || !body.evidenceDescription) {
              return this.sendJson(res, 400, { error: 'Missing required proposal fields (name, officialDomain, category, evidenceDescription).' });
            }
            const proposal = {
              id: body.id || `prop_${Date.now()}`,
              name: String(body.name).trim(),
              officialDomain: String(body.officialDomain).trim(),
              category: body.category,
              countriesCovered: Array.isArray(body.countriesCovered) ? body.countriesCovered : ['Global'],
              evidenceDescription: String(body.evidenceDescription).trim(),
              apiOrFeedDocsUrl: body.apiOrFeedDocsUrl || undefined,
              accessRestrictions: body.accessRestrictions || undefined,
              authRequirements: body.authRequirements || 'NONE',
              estimatedIntegrationEffort: body.estimatedIntegrationEffort || 'MEDIUM',
              recommendedAdapterType: body.recommendedAdapterType || 'OFFICIAL_PUBLIC_API',
              validationStatus: 'PENDING_REVIEW' as const,
              proposedAt: new Date().toISOString(),
            };
            this.db.saveSourceProposal(proposal);
            return this.sendJson(res, 201, { success: true, proposal });
          }

          if (pathname.endsWith('/review') && pathname.startsWith('/api/discovery/proposals/') && req.method === 'POST') {
            const parts = pathname.split('/');
            const proposalId = parts[4];
            const body = await this.parseBody(req);
            const status = body.validationStatus || 'VALIDATED';
            const notes = body.reviewNotes;
            this.db.updateSourceProposal(proposalId, status, notes);
            return this.sendJson(res, 200, { success: true, proposalId, status });
          }

          if (pathname === '/api/profile/resume' && req.method === 'DELETE') {
            const baseProfile = DEFAULT_USER_PROFILE;
            this.db.saveUserProfile(baseProfile);
            this.db.recordAuditEvent('RESET_RESUME_PROFILE', 'authorized_user', 'user_profile', baseProfile.id, { reason: 'User requested profile reset/deletion' });
            return this.sendJson(res, 200, { success: true, message: 'Resume profile reset to baseline defaults.', profile: baseProfile });
          }

          if (pathname === '/api/preferences') {
            if (req.method === 'GET') {
              const prefs = this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;
              return this.sendJson(res, 200, prefs);
            }
            if (req.method === 'POST') {
              const body = await this.parseBody(req);
              this.db.savePreferences(body);
              return this.sendJson(res, 200, { success: true });
            }
          }

          // Connector Filter Capabilities
          if (pathname === '/api/discovery/capabilities' && req.method === 'GET') {
            const capabilities = listAllConnectorCapabilities();
            return this.sendJson(res, 200, {
              totalConnectors: capabilities.length,
              capabilities
            }, requestId);
          }

          // Advanced Job Filtering & Search Endpoints
          if (pathname === '/api/jobs/filters/options' && req.method === 'GET') {
            const vacancies = this.db.listVacancies({ limit: 1000 });
            const options = getAvailableFilterOptions(vacancies);
            return this.sendJson(res, 200, options, requestId);
          }

          if (pathname === '/api/jobs/search' && req.method === 'POST') {
            const filters: JobFilterCriteria = await this.parseBody(req);
            const vacancies = this.db.listVacancies({ limit: 1000 });
            
            for (const v of vacancies) {
              const evalRecord = this.db.getMatchEvaluationByVacancyId(v.id);
              if (evalRecord) {
                v.matchScore = evalRecord;
                v.matchEvaluation = evalRecord;
              }
            }

            const profile = this.db.getUserProfile() || DEFAULT_USER_PROFILE;
            const { matching, stats } = filterVacancies(vacancies, filters, profile);
            return this.sendJson(res, 200, {
              filters,
              stats,
              totalMatching: matching.length,
              results: matching
            }, requestId);
          }

          // Saved Searches & Preferences Management
          if (pathname === '/api/saved-searches') {
            const userId = (req.headers['x-user-id'] as string) || 'default_user';
            if (req.method === 'GET') {
              const searches = this.db.listSavedSearches(userId);
              return this.sendJson(res, 200, searches, requestId);
            }
            if (req.method === 'POST') {
              const body = await this.parseBody(req);
              if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
                return this.sendJson(res, 400, { error: 'Search profile name is required.' }, requestId);
              }
              const search: SavedSearch = {
                id: randomUUID(),
                userId,
                name: body.name.trim(),
                filters: body.filters || {},
                isDefault: Boolean(body.isDefault),
                alertsEnabled: Boolean(body.alertsEnabled),
                scheduledSearchEnabled: Boolean(body.scheduledSearchEnabled),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              this.db.saveSavedSearch(search);
              return this.sendJson(res, 201, search, requestId);
            }
          }

          if (pathname.startsWith('/api/saved-searches/')) {
            const userId = (req.headers['x-user-id'] as string) || 'default_user';
            const subPath = pathname.replace('/api/saved-searches/', '');
            const parts = subPath.split('/');
            const searchId = parts[0];
            const action = parts[1];

            if (!action) {
              if (req.method === 'GET') {
                const search = this.db.getSavedSearch(searchId, userId);
                if (!search) return this.sendJson(res, 404, { error: 'Saved search not found or unauthorized' }, requestId);
                return this.sendJson(res, 200, search, requestId);
              }
              if (req.method === 'PUT') {
                const existing = this.db.getSavedSearch(searchId, userId);
                if (!existing) return this.sendJson(res, 404, { error: 'Saved search not found or unauthorized' }, requestId);
                const body = await this.parseBody(req);
                const updated: SavedSearch = {
                  ...existing,
                  name: body.name !== undefined ? String(body.name).trim() : existing.name,
                  filters: body.filters !== undefined ? body.filters : existing.filters,
                  isDefault: body.isDefault !== undefined ? Boolean(body.isDefault) : existing.isDefault,
                  alertsEnabled: body.alertsEnabled !== undefined ? Boolean(body.alertsEnabled) : existing.alertsEnabled,
                  scheduledSearchEnabled: body.scheduledSearchEnabled !== undefined ? Boolean(body.scheduledSearchEnabled) : existing.scheduledSearchEnabled,
                  updatedAt: new Date().toISOString()
                };
                this.db.saveSavedSearch(updated);
                return this.sendJson(res, 200, updated, requestId);
              }
              if (req.method === 'DELETE') {
                const deleted = this.db.deleteSavedSearch(searchId, userId);
                if (!deleted) return this.sendJson(res, 404, { error: 'Saved search not found or unauthorized' }, requestId);
                return this.sendJson(res, 200, { success: true }, requestId);
              }
            } else if (action === 'duplicate' && req.method === 'POST') {
              const body = await this.parseBody(req);
              const duplicated = this.db.duplicateSavedSearch(searchId, body.name, userId);
              if (!duplicated) return this.sendJson(res, 404, { error: 'Saved search not found or unauthorized' }, requestId);
              return this.sendJson(res, 201, duplicated, requestId);
            } else if (action === 'default' && req.method === 'POST') {
              const existing = this.db.getSavedSearch(searchId, userId);
              if (!existing) return this.sendJson(res, 404, { error: 'Saved search not found or unauthorized' }, requestId);
              this.db.setDefaultSavedSearch(searchId, userId);
              return this.sendJson(res, 200, { success: true, isDefault: true }, requestId);
            } else if (action === 'run' && req.method === 'POST') {
              const search = this.db.getSavedSearch(searchId, userId);
              if (!search) return this.sendJson(res, 404, { error: 'Saved search not found or unauthorized' }, requestId);
              const vacancies = this.db.listVacancies({ limit: 500 });
              const { matching, stats } = filterVacancies(vacancies, search.filters);
              this.db.recordSavedSearchRun(searchId, matching.length, userId);
              return this.sendJson(res, 200, { search, matching, stats, total: matching.length }, requestId);
            }
          }

          // OAuth 2.0 Callback
          if (pathname === '/oauth2callback') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            if (error) {
              res.writeHead(302, { Location: `/?auth=error&message=${encodeURIComponent(error)}` });
              return res.end();
            }
            if (!code) {
              res.writeHead(302, { Location: `/?auth=error&message=${encodeURIComponent('No authorization code received')}` });
              return res.end();
            }

            try {
              const { profile } = await this.googleOAuthManager.exchangeCodeForTokens(code);
              res.writeHead(302, { Location: `/?auth=success&email=${encodeURIComponent(profile.email)}` });
              return res.end();
            } catch (err: any) {
              res.writeHead(302, { Location: `/?auth=error&message=${encodeURIComponent(err.message || 'Token exchange failed')}` });
              return res.end();
            }
          }

          // Google OAuth status and auth URL
          if (pathname === '/api/auth/google/status' && req.method === 'GET') {
            return this.sendJson(res, 200, {
              isConfigured: this.googleOAuthManager.isOAuthConfigured(),
              hasSavedTokens: this.googleOAuthManager.hasSavedTokens(),
            });
          }

          if (pathname === '/api/auth/google/url' && req.method === 'GET') {
            try {
              const authUrl = this.googleOAuthManager.generateAuthUrl();
              return this.sendJson(res, 200, { success: true, url: authUrl });
            } catch (err: any) {
              return this.sendJson(res, 400, { success: false, error: err.message });
            }
          }

          if (pathname === '/api/auth/google/credentials' && req.method === 'POST') {
            const body = await this.parseBody(req);
            if (!body.clientId || !body.clientSecret) {
              return this.sendJson(res, 400, { error: 'clientId and clientSecret are required' });
            }
            this.googleOAuthManager.saveManualCredentials(body.clientId, body.clientSecret);
            return this.sendJson(res, 200, { success: true, message: 'Google OAuth client credentials updated.' });
          }

          if (pathname === '/api/auth/google/manual-tokens' && req.method === 'POST') {
            const body = await this.parseBody(req);
            if (!body.accessToken) {
              return this.sendJson(res, 400, { error: 'accessToken is required' });
            }
            this.googleOAuthManager.saveTokens({
              access_token: body.accessToken,
              refresh_token: body.refreshToken,
              expires_in: body.expiresIn || 3600,
            });
            return this.sendJson(res, 200, { success: true, message: 'Google OAuth tokens saved successfully.' });
          }

          // Accounts API
          if (pathname === '/api/accounts' && req.method === 'GET') {
            const accounts = this.accountManager.listPublicAccounts();
            return this.sendJson(res, 200, accounts);
          }

          if (pathname === '/api/accounts/connect' && req.method === 'POST') {
            const body = await this.parseBody(req);
            if (!body.email) {
              return this.sendJson(res, 400, { error: 'Email address is required' });
            }
            const connected = this.accountManager.connectAccount({
              email: body.email,
              displayName: body.displayName,
              accessToken: body.accessToken,
              refreshToken: body.refreshToken,
              isPrimary: body.isPrimary,
            });
            return this.sendJson(res, 200, { success: true, account: connected });
          }

          if (pathname.startsWith('/api/accounts/') && pathname.endsWith('/primary') && req.method === 'POST') {
            const id = pathname.split('/')[3];
            const updated = this.accountManager.setPrimary(id);
            return this.sendJson(res, 200, { success: true, account: updated });
          }

          if (pathname.startsWith('/api/accounts/') && pathname.endsWith('/disconnect') && req.method === 'POST') {
            const id = pathname.split('/')[3];
            this.accountManager.disconnect(id);
            return this.sendJson(res, 200, { success: true });
          }

          if (pathname.startsWith('/api/accounts/') && pathname.endsWith('/sync') && req.method === 'POST') {
            const id = pathname.split('/')[3];
            const result = await this.accountManager.syncAccountEmails(id);
            return this.sendJson(res, 200, result);
          }

          if (pathname.startsWith('/api/accounts/') && req.method === 'DELETE') {
            const id = pathname.replace('/api/accounts/', '');
            const deleted = this.accountManager.deleteAccount(id);
            return this.sendJson(res, 200, { success: deleted });
          }

          // LLM Configuration API
          if (pathname === '/api/llm/configs') {
            if (req.method === 'GET') {
              const configs = this.cloudConfigManager.listMaskedConfigs();
              return this.sendJson(res, 200, configs);
            }
            if (req.method === 'POST') {
              const body = await this.parseBody(req);
              if (!body.provider || !body.defaultModel) {
                return this.sendJson(res, 400, { error: 'Provider and defaultModel are required' });
              }
              const saved = this.cloudConfigManager.saveConfig(body);
              this.router.refreshFromConfig();
              return this.sendJson(res, 200, { success: true, config: saved });
            }
          }

          if (pathname === '/api/llm/test' && req.method === 'POST') {
            const body = await this.parseBody(req);
            if (!body.provider) {
              return this.sendJson(res, 400, { error: 'Provider is required' });
            }
            const testResult = await this.cloudConfigManager.testProvider(body.provider);
            return this.sendJson(res, 200, testResult);
          }

          if (pathname === '/api/llm/mode') {
            if (req.method === 'GET') {
              return this.sendJson(res, 200, { mode: this.router.getMode() });
            }
            if (req.method === 'POST') {
              const body = await this.parseBody(req);
              if (['local-only', 'cloud-only', 'hybrid'].includes(body.mode)) {
                this.router.setMode(body.mode as InferenceMode);
                return this.sendJson(res, 200, { success: true, mode: this.router.getMode() });
              }
              return this.sendJson(res, 400, { error: 'Invalid mode. Must be local-only, cloud-only, or hybrid' });
            }
          }

          // Vacancies API
          if (pathname === '/api/vacancies') {
            const status = url.searchParams.get('status') || undefined;
            const minScore = url.searchParams.get('minScore') ? Number(url.searchParams.get('minScore')) : undefined;
            const isContract = url.searchParams.get('contract') === 'true' ? true : (url.searchParams.get('contract') === 'false' ? false : undefined);
            const country = url.searchParams.get('country') || undefined;
            const category = url.searchParams.get('category') || undefined;
            const isEarlyApplicant = url.searchParams.get('early') === 'true' ? true : undefined;
            const isSaved = url.searchParams.get('saved') === 'true' ? true : undefined;
            const search = url.searchParams.get('search') || undefined;

            const vacancies = this.db.listVacancies({ 
              status, 
              minScore, 
              isContract, 
              country,
              category,
              isEarlyApplicant,
              isSaved,
              search,
              limit: 100 
            });
            return this.sendJson(res, 200, vacancies);
          }

          if (pathname.startsWith('/api/vacancies/') && pathname.endsWith('/bookmark') && req.method === 'POST') {
            const parts = pathname.split('/');
            const id = parts[3];
            const body = await this.parseBody(req);
            this.db.toggleSaveVacancy(id, body.isSaved ?? true);
            return this.sendJson(res, 200, { success: true, isSaved: body.isSaved ?? true });
          }

          if (pathname.startsWith('/api/vacancies/')) {
            const id = pathname.replace('/api/vacancies/', '');
            const vacancy = this.db.getVacancyById(id);
            if (!vacancy) return this.sendJson(res, 404, { error: 'Vacancy not found' });
            const evaluation = this.db.getMatchEvaluationByVacancyId(id);
            const draft = this.db.getApplicationDraftByVacancyId(id);
            return this.sendJson(res, 200, { ...vacancy, evaluation, draft });
          }

          // AI Resume Matches API
          if (pathname === '/api/matches' && req.method === 'GET') {
            const prefs = this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;
            const defaultMin = prefs.minMatchScore ?? 75.0;
            const minScore = url.searchParams.get('minScore') !== null ? Number(url.searchParams.get('minScore')) : defaultMin;
            const country = url.searchParams.get('country') || undefined;
            const category = url.searchParams.get('category') || undefined;
            const search = url.searchParams.get('search') || undefined;
            const isEarlyApplicant = url.searchParams.get('early') === 'true' ? true : undefined;
            const isSaved = url.searchParams.get('saved') === 'true' ? true : undefined;

            const vacancies = this.db.listVacancies({ 
              minScore, 
              country, 
              category, 
              search, 
              isEarlyApplicant, 
              isSaved, 
              limit: 100 
            });

            // Inclusive qualification check: overallScore >= minScore
            const qualifying = vacancies.filter(v => v.matchScore && v.matchScore.overallScore >= minScore);
            return this.sendJson(res, 200, qualifying);
          }

          if (pathname.startsWith('/api/matches/') && pathname.endsWith('/explanation') && req.method === 'GET') {
            const parts = pathname.split('/');
            const vacancyId = parts[3];
            const vacancy = this.db.getVacancyById(vacancyId);
            if (!vacancy) return this.sendJson(res, 404, { error: 'Vacancy not found' });
            const evaluation = this.db.getMatchEvaluationByVacancyId(vacancyId);
            if (!evaluation) return this.sendJson(res, 404, { error: 'Evaluation not found for vacancy' });
            return this.sendJson(res, 200, { vacancy, evaluation });
          }

          if (pathname.startsWith('/api/matches/') && pathname.endsWith('/recalculate') && req.method === 'POST') {
            const parts = pathname.split('/');
            const vacancyId = parts[3];
            const vacancy = this.db.getVacancyById(vacancyId);
            if (!vacancy) return this.sendJson(res, 404, { error: 'Vacancy not found' });
            const profile = this.db.getUserProfile() || DEFAULT_USER_PROFILE;
            const prefs = this.db.getPreferences() || DEFAULT_JOB_PREFERENCES;
            const evaluation = JobMatchingAgent.evaluateMatch(vacancy, profile, prefs);
            this.db.saveMatchEvaluation(evaluation);
            if (evaluation.qualifies75) {
              this.db.updateVacancyStatus(vacancy.id, 'QUALIFIED');
            }
            return this.sendJson(res, 200, { success: true, evaluation });
          }

          if (pathname === '/api/discovery/scan' && req.method === 'POST') {
            const report = await this.orchestrator.runPipeline();
            return this.sendJson(res, 200, { success: true, report });
          }

          if (pathname === '/api/drafts') {
            const status = url.searchParams.get('status') || undefined;
            const drafts = this.db.listDrafts(status);
            return this.sendJson(res, 200, drafts);
          }

          if (pathname.endsWith('/approve') && req.method === 'POST') {
            const parts = pathname.split('/');
            const draftId = parts[3];
            const body = await this.parseBody(req);
            const actor = body.actor || 'authorized_user';
            const submission = await this.orchestrator.approveAndSend(draftId, actor, body.sendingAccountId);
            return this.sendJson(res, 200, { success: true, submission });
          }

          if (pathname.endsWith('/reject') && req.method === 'POST') {
            const parts = pathname.split('/');
            const draftId = parts[3];
            const body = await this.parseBody(req);
            const actor = body.actor || 'authorized_user';
            this.db.rejectDraft(draftId, body.notes, actor);
            return this.sendJson(res, 200, { success: true });
          }

          if (pathname === '/api/submissions') {
            const submissions = this.db.listSubmissions();
            return this.sendJson(res, 200, submissions);
          }

          if (pathname === '/api/scheduler/status') {
            return this.sendJson(res, 200, this.scheduler.getStatus());
          }

          if (pathname === '/api/scheduler/start' && req.method === 'POST') {
            this.scheduler.start();
            return this.sendJson(res, 200, this.scheduler.getStatus());
          }

          if (pathname === '/api/scheduler/stop' && req.method === 'POST') {
            this.scheduler.stop();
            return this.sendJson(res, 200, this.scheduler.getStatus());
          }

          // Mobile Alerts API
          if (pathname === '/api/notifications/status' && req.method === 'GET') {
            return this.sendJson(res, 200, this.orchestrator.getAlertManager().getStatus());
          }

          if (pathname === '/api/notifications/config' && req.method === 'GET') {
            const telegram = this.db.getNotificationConfig('telegram');
            const discord = this.db.getNotificationConfig('discord');
            const alertMgr = this.orchestrator.getAlertManager();
            const status = alertMgr.getStatus();
            return this.sendJson(res, 200, {
              telegram: {
                configured: status.telegram,
                enabled: telegram ? telegram.isEnabled : status.telegram,
                chatId: telegram?.credentials?.chatId ? `...${String(telegram.credentials.chatId).slice(-4)}` : (status.telegramChatId || ''),
              },
              discord: {
                configured: status.discord,
                enabled: discord ? discord.isEnabled : status.discord,
                webhookUrl: discord?.credentials?.webhookUrl ? `https://discord.com/api/webhooks/...` : '',
              },
              minScore: status.minScore,
            });
          }

          if (pathname === '/api/notifications/config' && req.method === 'POST') {
            const body = await this.parseBody(req);
            const { telegramBotToken, telegramChatId, telegramEnabled, discordWebhookUrl, discordEnabled, minScore } = body;

            if (telegramBotToken !== undefined || telegramChatId !== undefined) {
              const existing = this.db.getNotificationConfig('telegram');
              const token = telegramBotToken || existing?.credentials?.botToken || process.env.TELEGRAM_BOT_TOKEN;
              const chatId = telegramChatId || existing?.credentials?.chatId || process.env.TELEGRAM_CHAT_ID;
              if (token && chatId) {
                this.db.saveNotificationConfig({
                  channel: 'telegram',
                  isEnabled: telegramEnabled !== false,
                  credentials: { botToken: token, chatId },
                  minScore: minScore !== undefined ? Number(minScore) : undefined,
                });
                this.orchestrator.getAlertManager().updateConfig({
                  telegramBotToken: token,
                  telegramChatId: String(chatId),
                });
              }
            }

            if (discordWebhookUrl !== undefined) {
              const existing = this.db.getNotificationConfig('discord');
              const webhookUrl = discordWebhookUrl || existing?.credentials?.webhookUrl || process.env.DISCORD_WEBHOOK_URL;
              if (webhookUrl) {
                this.db.saveNotificationConfig({
                  channel: 'discord',
                  isEnabled: discordEnabled !== false,
                  credentials: { webhookUrl },
                  minScore: minScore !== undefined ? Number(minScore) : undefined,
                });
                this.orchestrator.getAlertManager().updateConfig({
                  discordWebhookUrl: webhookUrl,
                });
              }
            }

            if (minScore !== undefined) {
              this.orchestrator.getAlertManager().updateConfig({
                minScore: Number(minScore),
              });
            }

            return this.sendJson(res, 200, {
              success: true,
              status: this.orchestrator.getAlertManager().getStatus(),
            });
          }

          if (pathname === '/api/notifications/test' && req.method === 'POST') {
            const result = await this.orchestrator.getAlertManager().sendTestAlert();
            return this.sendJson(res, 200, result);
          }

          if (pathname === '/api/resumes/generate-pdf' && req.method === 'POST') {
            const body = await this.parseBody(req);
            const profile = this.db.getUserProfile() || DEFAULT_USER_PROFILE;
            let vacancy: Vacancy | undefined;
            if (body.vacancyId) {
              vacancy = this.db.getVacancyById(body.vacancyId) || undefined;
            }
            const pdfPath = await AtsPdfGenerator.generateFromProfile(profile, vacancy, {
              title: body.title,
            });
            const fileName = basename(pdfPath);
            return this.sendJson(res, 200, {
              success: true,
              pdfPath,
              fileName,
              downloadUrl: `/api/resumes/${fileName}`,
            });
          }

          if (pathname.startsWith('/api/resumes/')) {
            const fileName = basename(pathname.replace('/api/resumes/', ''));
            const filePath = join(process.cwd(), 'data', 'resumes', 'tailored', fileName);
            if (!existsSync(filePath)) {
              return this.sendJson(res, 404, { error: 'Resume file not found' });
            }
            const isPdf = fileName.endsWith('.pdf');
            const data = readFileSync(filePath);
            res.writeHead(200, {
              'Content-Type': isPdf ? 'application/pdf' : 'text/markdown; charset=utf-8',
              'Content-Disposition': `inline; filename="${fileName}"`,
              'Access-Control-Allow-Origin': '*',
            });
            return res.end(data);
          }

          // Serve Web Dashboard Frontend
          if (pathname === '/' || pathname === '/dashboard' || pathname === '/index.html') {
            const htmlPath = join(process.cwd(), 'public', 'index.html');
            if (existsSync(htmlPath)) {
              return this.sendHtml(res, 200, readFileSync(htmlPath, 'utf-8'));
            }
          }

          // 404 Fallback
          return this.sendJson(res, 404, { error: 'Not Found' });
        } catch (err: any) {
          logger.error(`HTTP request handler error on ${pathname}: ${err.message}`);
          return this.sendJson(res, 500, { error: err.message });
        }
      });

      this.server.listen(this.port, this.host, () => {
        logger.info(`Job Discovery Platform running at http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.scheduler.stop();
      if (this.server) {
        this.server.close(() => {
          this.db.close();
          resolve();
        });
      } else {
        this.db.close();
        resolve();
      }
    });
  }
}
