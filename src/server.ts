import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
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
import { DEFAULT_USER_PROFILE, DEFAULT_JOB_PREFERENCES, loadAuthoritativeProfile } from './core/profile.js';
import { AtsPdfGenerator } from './applications/pdf-generator.js';
import type { InferenceMode, Vacancy, UserProfile } from './types/index.js';
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

    const discoveryManager = new DiscoveryManager(this.db);
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
            const content = body.resumeContent || '';
            if (!content || typeof content !== 'string') {
              return this.sendJson(res, 400, { error: 'resumeContent text is required' });
            }

            const current = this.db.getUserProfile() || DEFAULT_USER_PROFILE;

            // Extract email
            const emailMatch = content.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
            const email = emailMatch ? emailMatch[0] : current.email;

            // Extract phone
            const phoneMatch = content.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
            const phone = phoneMatch ? phoneMatch[0] : current.phone;

            // Extract links
            const githubMatch = content.match(/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_-]+/i);
            const linkedinMatch = content.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/i);

            // Extract Name from first header line if present
            const lines = content.split('\n').map((l: string) => l.trim()).filter(Boolean);
            let fullName = current.fullName;
            if (lines.length > 0 && lines[0].startsWith('# ')) {
              fullName = lines[0].replace(/^#\s+/, '').trim();
            } else if (lines.length > 0 && !lines[0].includes('@') && lines[0].length < 40) {
              fullName = lines[0];
            }

            // Extract skills by scanning popular keywords
            const techKeywords: Record<string, string[]> = {
              cloudPlatforms: ['AWS', 'GCP', 'Azure', 'DigitalOcean', 'Cloudflare'],
              containersAndOrchestration: ['Docker', 'Kubernetes', 'Helm', 'ArgoCD', 'Podman', 'OpenShift'],
              infrastructureAsCode: ['Terraform', 'Terragrunt', 'Ansible', 'Pulumi', 'CloudFormation'],
              ciCdAndGitOps: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'CircleCI', 'Tekton'],
              devSecOpsAndSecurity: ['SonarQube', 'Snyk', 'Trivy', 'Vault', 'OWASP'],
              observabilityAndMonitoring: ['Prometheus', 'Grafana', 'Datadog', 'OpenTelemetry', 'ELK', 'Jaeger'],
              programmingAndScripting: ['TypeScript', 'JavaScript', 'Python', 'Go', 'Java', 'Rust', 'Bash', 'C++'],
              networkingAndAdmin: ['Linux', 'Ubuntu', 'TCP/IP', 'Nginx', 'DNS'],
            };

            const detectedSkills: UserProfile['skills'] = {
              ...current.skills,
              cloudPlatforms: [...(current.skills.cloudPlatforms || [])],
              infrastructureAsCode: [...(current.skills.infrastructureAsCode || [])],
              containersAndOrchestration: [...(current.skills.containersAndOrchestration || [])],
              ciCdAndGitOps: [...(current.skills.ciCdAndGitOps || [])],
              devSecOpsAndSecurity: [...(current.skills.devSecOpsAndSecurity || [])],
              observabilityAndMonitoring: [...(current.skills.observabilityAndMonitoring || [])],
              programmingAndScripting: [...(current.skills.programmingAndScripting || [])],
              networkingAndAdmin: [...(current.skills.networkingAndAdmin || [])],
            };
            for (const [category, keywords] of Object.entries(techKeywords)) {
              for (const kw of keywords) {
                const regex = new RegExp(`\\b${kw.replace('+', '\\+')}\\b`, 'i');
                if (regex.test(content)) {
                  const list = detectedSkills[category] || [];
                  detectedSkills[category] = list;
                  if (!list.includes(kw)) {
                    list.push(kw);
                  }
                }
              }
            }

            const updatedProfile = {
              ...current,
              fullName: fullName || current.fullName,
              email: email || current.email,
              phone: phone || current.phone,
              githubUrl: githubMatch ? githubMatch[0] : current.githubUrl,
              linkedinUrl: linkedinMatch ? linkedinMatch[0] : current.linkedinUrl,
              skills: detectedSkills,
              updatedAt: new Date().toISOString(),
            };

            this.db.saveUserProfile(updatedProfile);
            return this.sendJson(res, 200, {
              success: true,
              message: 'Resume parsed and profile updated successfully',
              profile: updatedProfile,
            });
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
