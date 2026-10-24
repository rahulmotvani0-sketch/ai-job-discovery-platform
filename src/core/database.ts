import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';
import type { 
  Vacancy, 
  MatchScoreEvaluation, 
  ApplicationDraft, 
  ApplicationSubmission,
  RecruiterInteraction, 
  UserProfile, 
  JobPreferences,
  ConnectedAccount,
  LLMConfiguration
} from '../types/index.js';

export class DatabaseManager {
  private db: DatabaseSync;
  private dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
    }
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ':memory:') {
      try {
        chmodSync(dbPath, 0o600);
      } catch {}
    }
    this.initPragmas();
    this.initSchema();
  }

  private initPragmas() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        location TEXT,
        portfolio_url TEXT,
        github_url TEXT,
        linkedin_url TEXT,
        summary TEXT,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_preferences (
        id TEXT PRIMARY KEY,
        target_roles_json TEXT NOT NULL,
        min_experience_years INTEGER NOT NULL,
        max_experience_years INTEGER NOT NULL,
        min_compensation_inr_lpa REAL NOT NULL,
        prioritize_remote INTEGER NOT NULL,
        allow_hybrid INTEGER NOT NULL,
        base_country TEXT NOT NULL,
        eligible_countries_json TEXT NOT NULL,
        search_international INTEGER NOT NULL,
        daily_qualified_target INTEGER NOT NULL,
        hourly_discovery_enabled INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vacancies (
        id TEXT PRIMARY KEY,
        canonical_hash TEXT UNIQUE NOT NULL,
        source_type TEXT NOT NULL,
        source_url TEXT NOT NULL,
        alternate_urls TEXT NOT NULL,
        company_name TEXT NOT NULL,
        title TEXT NOT NULL,
        normalized_title TEXT NOT NULL,
        location_text TEXT NOT NULL,
        is_remote INTEGER NOT NULL,
        accepts_india INTEGER NOT NULL,
        employment_type TEXT NOT NULL,
        salary_min REAL,
        salary_max REAL,
        currency TEXT,
        raw_description TEXT NOT NULL,
        parsed_requirements TEXT,
        published_at TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        last_verified_at TEXT NOT NULL,
        status TEXT NOT NULL,
        is_contract_or_freelance INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vacancies_canonical_hash ON vacancies(canonical_hash);
      CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status);
      CREATE INDEX IF NOT EXISTS idx_vacancies_discovered_at ON vacancies(discovered_at);
      CREATE INDEX IF NOT EXISTS idx_vacancies_company ON vacancies(company_name);

      CREATE TABLE IF NOT EXISTS match_evaluations (
        id TEXT PRIMARY KEY,
        vacancy_id TEXT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
        overall_score REAL NOT NULL,
        tier TEXT NOT NULL,
        category_scores TEXT NOT NULL,
        matching_skills TEXT NOT NULL,
        missing_skills TEXT NOT NULL,
        evidence_explanation TEXT NOT NULL,
        evaluated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_evaluations_vacancy ON match_evaluations(vacancy_id);
      CREATE INDEX IF NOT EXISTS idx_evaluations_score ON match_evaluations(overall_score);

      CREATE TABLE IF NOT EXISTS application_drafts (
        id TEXT PRIMARY KEY,
        vacancy_id TEXT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
        recipient_email TEXT NOT NULL,
        subject_line TEXT NOT NULL,
        email_body TEXT NOT NULL,
        cover_letter TEXT,
        tailored_resume_path TEXT NOT NULL,
        screening_answers TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        reviewed_at TEXT,
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_drafts_vacancy ON application_drafts(vacancy_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_status ON application_drafts(status);

      CREATE TABLE IF NOT EXISTS application_submissions (
        id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL REFERENCES application_drafts(id) ON DELETE CASCADE,
        vacancy_id TEXT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
        sent_at TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        channel TEXT NOT NULL,
        gmail_message_id TEXT,
        gmail_thread_id TEXT,
        status TEXT NOT NULL,
        sheets_row_index INTEGER,
        audit_hash TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_submissions_vacancy ON application_submissions(vacancy_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_status ON application_submissions(status);

      CREATE TABLE IF NOT EXISTS recruiter_interactions (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL REFERENCES application_submissions(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        snippet TEXT NOT NULL,
        detected_intent TEXT NOT NULL,
        action_required INTEGER NOT NULL,
        action_details TEXT,
        received_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_interactions_thread ON recruiter_interactions(thread_id);

      CREATE TABLE IF NOT EXISTS discovery_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        source TEXT NOT NULL,
        vacancies_discovered INTEGER DEFAULT 0,
        vacancies_new INTEGER DEFAULT 0,
        vacancies_qualified INTEGER DEFAULT 0,
        errors_count INTEGER DEFAULT 0,
        telemetry_json TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details_json TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS connected_accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT,
        provider TEXT NOT NULL DEFAULT 'google',
        access_token TEXT,
        refresh_token TEXT,
        granted_scopes TEXT NOT NULL DEFAULT '[]',
        is_primary INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'CONNECTED',
        last_synced_at TEXT,
        sync_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS llm_configurations (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL UNIQUE,
        endpoint TEXT,
        api_key TEXT,
        available_models TEXT NOT NULL DEFAULT '[]',
        default_model TEXT NOT NULL,
        request_timeout_ms INTEGER NOT NULL DEFAULT 30000,
        max_output_tokens INTEGER NOT NULL DEFAULT 4096,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        task_preferences TEXT NOT NULL DEFAULT '{}',
        last_test_status TEXT,
        last_test_at TEXT,
        last_error TEXT,
        total_tokens_used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Safe incremental migrations for existing DBs
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN is_early_applicant INTEGER DEFAULT 0;"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN is_saved INTEGER DEFAULT 0;"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN country TEXT DEFAULT 'Worldwide';"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN category TEXT DEFAULT 'DevOps';"); } catch {}
    try { this.db.exec("ALTER TABLE application_drafts ADD COLUMN sending_account_id TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE application_drafts ADD COLUMN tailored_pdf_path TEXT;"); } catch {}
  }

  // User Profile
  saveUserProfile(profile: UserProfile): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_profile (id, full_name, email, phone, location, portfolio_url, github_url, linkedin_url, summary, raw_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        location = excluded.location,
        portfolio_url = excluded.portfolio_url,
        github_url = excluded.github_url,
        linkedin_url = excluded.linkedin_url,
        summary = excluded.summary,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      profile.id,
      profile.fullName,
      profile.email,
      profile.phone,
      profile.location,
      profile.portfolioUrl,
      profile.githubUrl,
      profile.linkedinUrl,
      profile.summary,
      JSON.stringify(profile),
      new Date().toISOString()
    );
  }

  getUserProfile(): UserProfile | null {
    const stmt = this.db.prepare('SELECT raw_json FROM user_profile LIMIT 1');
    const row = stmt.get() as { raw_json?: string } | undefined;
    if (!row || !row.raw_json) return null;
    return JSON.parse(row.raw_json);
  }

  // User Preferences
  savePreferences(prefs: JobPreferences): void {
    const id = 'default_preferences';
    const stmt = this.db.prepare(`
      INSERT INTO user_preferences (
        id, target_roles_json, min_experience_years, max_experience_years, min_compensation_inr_lpa,
        prioritize_remote, allow_hybrid, base_country, eligible_countries_json, search_international,
        daily_qualified_target, hourly_discovery_enabled, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        target_roles_json = excluded.target_roles_json,
        min_experience_years = excluded.min_experience_years,
        max_experience_years = excluded.max_experience_years,
        min_compensation_inr_lpa = excluded.min_compensation_inr_lpa,
        prioritize_remote = excluded.prioritize_remote,
        allow_hybrid = excluded.allow_hybrid,
        base_country = excluded.base_country,
        eligible_countries_json = excluded.eligible_countries_json,
        search_international = excluded.search_international,
        daily_qualified_target = excluded.daily_qualified_target,
        hourly_discovery_enabled = excluded.hourly_discovery_enabled,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      id,
      JSON.stringify(prefs.targetRoles),
      prefs.minExperienceYears,
      prefs.maxExperienceYears,
      prefs.minCompensationInrLpa,
      prefs.prioritizeRemote ? 1 : 0,
      prefs.allowHybrid ? 1 : 0,
      prefs.baseCountry,
      JSON.stringify(prefs.eligibleCountries),
      prefs.searchInternational ? 1 : 0,
      prefs.dailyQualifiedTarget,
      prefs.hourlyDiscoveryEnabled ? 1 : 0,
      new Date().toISOString()
    );
  }

  getPreferences(): JobPreferences | null {
    const stmt = this.db.prepare('SELECT * FROM user_preferences LIMIT 1');
    const row = stmt.get() as any;
    if (!row) return null;
    return {
      targetRoles: JSON.parse(row.target_roles_json),
      minExperienceYears: row.min_experience_years,
      maxExperienceYears: row.max_experience_years,
      minCompensationInrLpa: row.min_compensation_inr_lpa,
      prioritizeRemote: row.prioritize_remote === 1,
      allowHybrid: row.allow_hybrid === 1,
      baseCountry: row.base_country,
      eligibleCountries: JSON.parse(row.eligible_countries_json),
      searchInternational: row.search_international === 1,
      dailyQualifiedTarget: row.daily_qualified_target,
      hourlyDiscoveryEnabled: row.hourly_discovery_enabled === 1,
    };
  }

  // Vacancies
  insertOrUpdateVacancy(vacancy: Vacancy): { inserted: boolean; id: string } {
    const existing = this.getVacancyByCanonicalHash(vacancy.canonicalHash);
    if (existing) {
      // Update alternate URLs and verification time
      const mergedUrls = Array.from(new Set([...existing.alternateUrls, vacancy.sourceUrl, ...vacancy.alternateUrls]));
      const updateStmt = this.db.prepare(`
        UPDATE vacancies SET
          alternate_urls = ?,
          last_verified_at = ?,
          is_early_applicant = COALESCE(?, is_early_applicant),
          country = COALESCE(?, country),
          category = COALESCE(?, category),
          status = CASE WHEN status = 'EXPIRED' THEN 'VERIFIED' ELSE status END
        WHERE id = ?
      `);
      updateStmt.run(
        JSON.stringify(mergedUrls), 
        new Date().toISOString(), 
        vacancy.isEarlyApplicant !== undefined ? (vacancy.isEarlyApplicant ? 1 : 0) : null,
        vacancy.country ?? null,
        vacancy.category ?? null,
        existing.id
      );
      return { inserted: false, id: existing.id };
    }

    const stmt = this.db.prepare(`
      INSERT INTO vacancies (
        id, canonical_hash, source_type, source_url, alternate_urls, company_name, title, normalized_title,
        location_text, is_remote, accepts_india, employment_type, salary_min, salary_max, currency,
        raw_description, parsed_requirements, published_at, discovered_at, last_verified_at, status, is_contract_or_freelance,
        is_early_applicant, is_saved, country, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      vacancy.id,
      vacancy.canonicalHash,
      vacancy.sourceType,
      vacancy.sourceUrl,
      JSON.stringify(vacancy.alternateUrls),
      vacancy.companyName,
      vacancy.title,
      vacancy.normalizedTitle,
      vacancy.locationText,
      vacancy.isRemote ? 1 : 0,
      vacancy.acceptsIndia ? 1 : 0,
      vacancy.employmentType,
      vacancy.salaryMin ?? null,
      vacancy.salaryMax ?? null,
      vacancy.currency ?? null,
      vacancy.rawDescription,
      vacancy.parsedRequirements ? JSON.stringify(vacancy.parsedRequirements) : null,
      vacancy.publishedAt,
      vacancy.discoveredAt,
      vacancy.lastVerifiedAt,
      vacancy.status,
      vacancy.isContractOrFreelance ? 1 : 0,
      vacancy.isEarlyApplicant ? 1 : 0,
      vacancy.isSaved ? 1 : 0,
      vacancy.country || 'Worldwide',
      vacancy.category || 'DevOps'
    );

    return { inserted: true, id: vacancy.id };
  }

  getVacancyByCanonicalHash(canonicalHash: string): Vacancy | null {
    const stmt = this.db.prepare('SELECT * FROM vacancies WHERE canonical_hash = ?');
    const row = stmt.get(canonicalHash) as any;
    if (!row) return null;
    return this.mapVacancyRow(row);
  }

  getVacancyById(id: string): Vacancy | null {
    const stmt = this.db.prepare('SELECT * FROM vacancies WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.mapVacancyRow(row);
  }

  toggleSaveVacancy(vacancyId: string, isSaved: boolean): void {
    const stmt = this.db.prepare('UPDATE vacancies SET is_saved = ? WHERE id = ?');
    stmt.run(isSaved ? 1 : 0, vacancyId);
  }

  listVacancies(filter?: { 
    status?: string; 
    minScore?: number; 
    limit?: number; 
    offset?: number; 
    isContract?: boolean;
    country?: string;
    category?: string;
    isEarlyApplicant?: boolean;
    isSaved?: boolean;
    search?: string;
  }): Array<Vacancy & { matchScore?: MatchScoreEvaluation }> {
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    
    let query = `
      SELECT v.*, m.id as m_id, m.overall_score, m.tier, m.category_scores, m.matching_skills, m.missing_skills, m.evidence_explanation, m.evaluated_at
      FROM vacancies v
      LEFT JOIN match_evaluations m ON v.id = m.vacancy_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter?.status) {
      query += ` AND v.status = ?`;
      params.push(filter.status);
    }
    if (filter?.isContract !== undefined) {
      query += ` AND v.is_contract_or_freelance = ?`;
      params.push(filter.isContract ? 1 : 0);
    }
    if (filter?.isEarlyApplicant !== undefined) {
      query += ` AND v.is_early_applicant = ?`;
      params.push(filter.isEarlyApplicant ? 1 : 0);
    }
    if (filter?.isSaved !== undefined) {
      query += ` AND v.is_saved = ?`;
      params.push(filter.isSaved ? 1 : 0);
    }
    if (filter?.country && filter.country !== 'All') {
      if (filter.country === 'India') {
        query += ` AND (v.country = 'India' OR v.location_text LIKE '%India%' OR v.accepts_india = 1)`;
      } else {
        query += ` AND (v.country = ? OR v.location_text LIKE ?)`;
        params.push(filter.country, `%${filter.country}%`);
      }
    }
    if (filter?.category && filter.category !== 'All') {
      query += ` AND (v.category = ? OR v.title LIKE ? OR v.normalized_title LIKE ?)`;
      params.push(filter.category, `%${filter.category}%`, `%${filter.category}%`);
    }
    if (filter?.search) {
      query += ` AND (v.title LIKE ? OR v.company_name LIKE ? OR v.raw_description LIKE ?)`;
      const s = `%${filter.search}%`;
      params.push(s, s, s);
    }
    if (filter?.minScore !== undefined) {
      query += ` AND m.overall_score >= ?`;
      params.push(filter.minScore);
    }

    query += ` ORDER BY m.overall_score DESC NULLS LAST, v.discovered_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(r => {
      const v = this.mapVacancyRow(r);
      let matchScore: MatchScoreEvaluation | undefined;
      if (r.m_id) {
        matchScore = {
          id: r.m_id,
          vacancyId: v.id,
          overallScore: r.overall_score,
          tier: r.tier,
          categoryScores: JSON.parse(r.category_scores),
          matchingSkills: JSON.parse(r.matching_skills),
          missingSkills: JSON.parse(r.missing_skills),
          evidenceExplanation: r.evidence_explanation,
          evaluatedAt: r.evaluated_at
        };
      }
      return { ...v, matchScore };
    });
  }

  updateVacancyStatus(id: string, status: string): void {
    const stmt = this.db.prepare('UPDATE vacancies SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  updateVacancyParsedRequirements(id: string, parsed: any): void {
    const stmt = this.db.prepare("UPDATE vacancies SET parsed_requirements = ?, status = 'ANALYZED' WHERE id = ?");
    stmt.run(JSON.stringify(parsed), id);
  }

  // Match Evaluations
  saveMatchEvaluation(evalData: MatchScoreEvaluation): void {
    const stmt = this.db.prepare(`
      INSERT INTO match_evaluations (id, vacancy_id, overall_score, tier, category_scores, matching_skills, missing_skills, evidence_explanation, evaluated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        overall_score = excluded.overall_score,
        tier = excluded.tier,
        category_scores = excluded.category_scores,
        matching_skills = excluded.matching_skills,
        missing_skills = excluded.missing_skills,
        evidence_explanation = excluded.evidence_explanation,
        evaluated_at = excluded.evaluated_at
    `);
    stmt.run(
      evalData.id,
      evalData.vacancyId,
      evalData.overallScore,
      evalData.tier,
      JSON.stringify(evalData.categoryScores),
      JSON.stringify(evalData.matchingSkills),
      JSON.stringify(evalData.missingSkills),
      evalData.evidenceExplanation,
      evalData.evaluatedAt
    );
  }

  getMatchEvaluationByVacancyId(vacancyId: string): MatchScoreEvaluation | null {
    const stmt = this.db.prepare('SELECT * FROM match_evaluations WHERE vacancy_id = ?');
    const row = stmt.get(vacancyId) as any;
    if (!row) return null;
    return {
      id: row.id,
      vacancyId: row.vacancy_id,
      overallScore: row.overall_score,
      tier: row.tier,
      categoryScores: JSON.parse(row.category_scores),
      matchingSkills: JSON.parse(row.matching_skills),
      missingSkills: JSON.parse(row.missing_skills),
      evidenceExplanation: row.evidence_explanation,
      evaluatedAt: row.evaluated_at,
    };
  }

  // Application Drafts
  saveApplicationDraft(draft: ApplicationDraft): void {
    const stmt = this.db.prepare(`
      INSERT INTO application_drafts (id, vacancy_id, sending_account_id, recipient_email, subject_line, email_body, cover_letter, tailored_resume_path, tailored_pdf_path, screening_answers, status, created_at, reviewed_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        sending_account_id = excluded.sending_account_id,
        recipient_email = excluded.recipient_email,
        subject_line = excluded.subject_line,
        email_body = excluded.email_body,
        cover_letter = excluded.cover_letter,
        tailored_resume_path = excluded.tailored_resume_path,
        tailored_pdf_path = excluded.tailored_pdf_path,
        screening_answers = excluded.screening_answers,
        status = excluded.status,
        reviewed_at = excluded.reviewed_at,
        notes = excluded.notes
    `);
    stmt.run(
      draft.id,
      draft.vacancyId,
      draft.sendingAccountId ?? null,
      draft.recipientEmail,
      draft.subjectLine,
      draft.emailBody,
      draft.coverLetter ?? null,
      draft.tailoredResumePath,
      draft.tailoredPdfPath ?? null,
      draft.screeningAnswers ? JSON.stringify(draft.screeningAnswers) : null,
      draft.status,
      draft.createdAt,
      draft.reviewedAt ?? null,
      draft.notes ?? null
    );
  }

  getApplicationDraftById(id: string): ApplicationDraft | null {
    const stmt = this.db.prepare('SELECT * FROM application_drafts WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.mapDraftRow(row);
  }

  getApplicationDraftByVacancyId(vacancyId: string): ApplicationDraft | null {
    const stmt = this.db.prepare('SELECT * FROM application_drafts WHERE vacancy_id = ?');
    const row = stmt.get(vacancyId) as any;
    if (!row) return null;
    return this.mapDraftRow(row);
  }

  listDrafts(status?: string): ApplicationDraft[] {
    let query = 'SELECT * FROM application_drafts';
    const params: any[] = [];
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map(r => this.mapDraftRow(r));
  }

  approveDraft(draftId: string, approvedBy: string = 'user'): void {
    const stmt = this.db.prepare("UPDATE application_drafts SET status = 'APPROVED', reviewed_at = ? WHERE id = ?");
    stmt.run(new Date().toISOString(), draftId);
    this.recordAuditEvent('DRAFT_APPROVED', approvedBy, 'APPLICATION_DRAFT', draftId, { approvedAt: new Date().toISOString() });
  }

  rejectDraft(draftId: string, notes?: string, user: string = 'user'): void {
    const stmt = this.db.prepare("UPDATE application_drafts SET status = 'REJECTED_BY_USER', reviewed_at = ?, notes = ? WHERE id = ?");
    stmt.run(new Date().toISOString(), notes ?? null, draftId);
    this.recordAuditEvent('DRAFT_REJECTED', user, 'APPLICATION_DRAFT', draftId, { notes });
  }

  // Application Submissions
  saveSubmission(submission: ApplicationSubmission): void {
    const stmt = this.db.prepare(`
      INSERT INTO application_submissions (id, draft_id, vacancy_id, sent_at, approved_by, channel, gmail_message_id, gmail_thread_id, status, sheets_row_index, audit_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      submission.id,
      submission.draftId,
      submission.vacancyId,
      submission.sentAt,
      submission.approvedBy,
      submission.channel,
      submission.gmailMessageId ?? null,
      submission.gmailThreadId ?? null,
      submission.status,
      submission.sheetsRowIndex ?? null,
      submission.auditHash
    );

    // Update draft and vacancy status
    this.db.prepare("UPDATE application_drafts SET status = 'SUBMITTED' WHERE id = ?").run(submission.draftId);
    this.db.prepare("UPDATE vacancies SET status = 'SUBMITTED' WHERE id = ?").run(submission.vacancyId);
    this.recordAuditEvent('APPLICATION_SUBMITTED', submission.approvedBy, 'APPLICATION_SUBMISSION', submission.id, {
      channel: submission.channel,
      gmailMessageId: submission.gmailMessageId,
      vacancyId: submission.vacancyId,
    });
  }

  listSubmissions(): ApplicationSubmission[] {
    const stmt = this.db.prepare('SELECT * FROM application_submissions ORDER BY sent_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      draftId: r.draft_id,
      vacancyId: r.vacancy_id,
      sentAt: r.sent_at,
      approvedBy: r.approved_by,
      channel: r.channel,
      gmailMessageId: r.gmail_message_id ?? undefined,
      gmailThreadId: r.gmail_thread_id ?? undefined,
      status: r.status,
      sheetsRowIndex: r.sheets_row_index ?? undefined,
      auditHash: r.audit_hash,
    }));
  }

  // Recruiter Interactions
  saveRecruiterInteraction(interaction: RecruiterInteraction): void {
    const stmt = this.db.prepare(`
      INSERT INTO recruiter_interactions (id, submission_id, thread_id, message_id, sender_email, subject, snippet, detected_intent, action_required, action_details, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      interaction.id,
      interaction.submissionId,
      interaction.threadId,
      interaction.messageId,
      interaction.senderEmail,
      interaction.subject,
      interaction.snippet,
      interaction.detectedIntent,
      interaction.actionRequired ? 1 : 0,
      interaction.actionDetails ?? null,
      interaction.receivedAt
    );

    if (interaction.detectedIntent === 'INTERVIEW_INVITATION') {
      this.db.prepare("UPDATE application_submissions SET status = 'INTERVIEW_INVITE' WHERE id = ?").run(interaction.submissionId);
    } else if (interaction.detectedIntent === 'REJECTION') {
      this.db.prepare("UPDATE application_submissions SET status = 'REJECTED' WHERE id = ?").run(interaction.submissionId);
    }
  }

  // Telemetry & Metrics
  getDashboardMetrics(): Record<string, any> {
    const totalDiscovered = (this.db.prepare('SELECT COUNT(*) as c FROM vacancies').get() as any).c;
    const totalQualified = (this.db.prepare('SELECT COUNT(*) as c FROM vacancies v JOIN match_evaluations m ON v.id = m.vacancy_id WHERE m.overall_score >= 70').get() as any).c;
    const draftsAwaitingApproval = (this.db.prepare("SELECT COUNT(*) as c FROM application_drafts WHERE status = 'APPROVED' OR status = 'PENDING_REVIEW'").get() as any).c;
    const totalSubmitted = (this.db.prepare('SELECT COUNT(*) as c FROM application_submissions').get() as any).c;
    const interviewInvites = (this.db.prepare("SELECT COUNT(*) as c FROM application_submissions WHERE status = 'INTERVIEW_INVITE'").get() as any).c;
    const totalContracts = (this.db.prepare('SELECT COUNT(*) as c FROM vacancies WHERE is_contract_or_freelance = 1').get() as any).c;

    return {
      totalDiscovered,
      totalQualified,
      draftsAwaitingApproval,
      totalSubmitted,
      interviewInvites,
      totalContracts,
    };
  }

  // Audit Events
  recordAuditEvent(action: string, actor: string, entityType: string, entityId: string, details: Record<string, unknown>): void {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO audit_events (id, action, actor, entity_type, entity_id, details_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, action, actor, entityType, entityId, JSON.stringify(details), new Date().toISOString());
    logger.audit(action, actor, { entityType, entityId, ...details });
  }

  // Helper row mappers
  private mapVacancyRow(row: any): Vacancy {
    return {
      id: row.id,
      canonicalHash: row.canonical_hash,
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      alternateUrls: JSON.parse(row.alternate_urls || '[]'),
      companyName: row.company_name,
      title: row.title,
      normalizedTitle: row.normalized_title,
      locationText: row.location_text,
      isRemote: row.is_remote === 1,
      acceptsIndia: row.accepts_india === 1,
      employmentType: row.employment_type,
      salaryMin: row.salary_min ?? undefined,
      salaryMax: row.salary_max ?? undefined,
      currency: row.currency ?? undefined,
      rawDescription: row.raw_description,
      parsedRequirements: row.parsed_requirements ? JSON.parse(row.parsed_requirements) : undefined,
      publishedAt: row.published_at,
      discoveredAt: row.discovered_at,
      lastVerifiedAt: row.last_verified_at,
      status: row.status,
      isContractOrFreelance: row.is_contract_or_freelance === 1,
      isEarlyApplicant: row.is_early_applicant === 1,
      isSaved: row.is_saved === 1,
      country: row.country || 'Worldwide',
      category: row.category || 'DevOps',
    };
  }

  private mapDraftRow(row: any): ApplicationDraft {
    return {
      id: row.id,
      vacancyId: row.vacancy_id,
      sendingAccountId: row.sending_account_id ?? undefined,
      recipientEmail: row.recipient_email,
      subjectLine: row.subject_line,
      emailBody: row.email_body,
      coverLetter: row.cover_letter ?? undefined,
      tailoredResumePath: row.tailored_resume_path,
      tailoredPdfPath: row.tailored_pdf_path ?? undefined,
      screeningAnswers: row.screening_answers ? JSON.parse(row.screening_answers) : undefined,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at ?? undefined,
      notes: row.notes ?? undefined,
    };
  }

  // Connected Accounts Management
  saveConnectedAccount(account: ConnectedAccount): void {
    const stmt = this.db.prepare(`
      INSERT INTO connected_accounts (id, email, display_name, provider, access_token, refresh_token, granted_scopes, is_primary, status, last_synced_at, sync_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        granted_scopes = excluded.granted_scopes,
        is_primary = excluded.is_primary,
        status = excluded.status,
        last_synced_at = excluded.last_synced_at,
        sync_error = excluded.sync_error,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      account.id,
      account.email,
      account.displayName ?? null,
      account.provider,
      account.accessToken ?? null,
      account.refreshToken ?? null,
      JSON.stringify(account.grantedScopes),
      account.isPrimary ? 1 : 0,
      account.status,
      account.lastSyncedAt ?? null,
      account.syncError ?? null,
      account.createdAt,
      account.updatedAt
    );
  }

  getConnectedAccounts(): ConnectedAccount[] {
    const stmt = this.db.prepare('SELECT * FROM connected_accounts ORDER BY is_primary DESC, created_at ASC');
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name ?? undefined,
      provider: r.provider,
      accessToken: r.access_token ?? undefined,
      refreshToken: r.refresh_token ?? undefined,
      grantedScopes: JSON.parse(r.granted_scopes || '[]'),
      isPrimary: r.is_primary === 1,
      status: r.status,
      lastSyncedAt: r.last_synced_at ?? undefined,
      syncError: r.sync_error ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getConnectedAccountById(id: string): ConnectedAccount | null {
    const stmt = this.db.prepare('SELECT * FROM connected_accounts WHERE id = ?');
    const r = stmt.get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      email: r.email,
      displayName: r.display_name ?? undefined,
      provider: r.provider,
      accessToken: r.access_token ?? undefined,
      refreshToken: r.refresh_token ?? undefined,
      grantedScopes: JSON.parse(r.granted_scopes || '[]'),
      isPrimary: r.is_primary === 1,
      status: r.status,
      lastSyncedAt: r.last_synced_at ?? undefined,
      syncError: r.sync_error ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  getPrimaryConnectedAccount(): ConnectedAccount | null {
    const stmt = this.db.prepare("SELECT * FROM connected_accounts WHERE is_primary = 1 AND status = 'CONNECTED' LIMIT 1");
    const r = stmt.get() as any;
    if (!r) {
      // Fallback to first connected account
      const fallbackStmt = this.db.prepare("SELECT * FROM connected_accounts WHERE status = 'CONNECTED' LIMIT 1");
      const fb = fallbackStmt.get() as any;
      if (!fb) return null;
      return {
        id: fb.id,
        email: fb.email,
        displayName: fb.display_name ?? undefined,
        provider: fb.provider,
        accessToken: fb.access_token ?? undefined,
        refreshToken: fb.refresh_token ?? undefined,
        grantedScopes: JSON.parse(fb.granted_scopes || '[]'),
        isPrimary: fb.is_primary === 1,
        status: fb.status,
        lastSyncedAt: fb.last_synced_at ?? undefined,
        syncError: fb.sync_error ?? undefined,
        createdAt: fb.created_at,
        updatedAt: fb.updated_at,
      };
    }
    return {
      id: r.id,
      email: r.email,
      displayName: r.display_name ?? undefined,
      provider: r.provider,
      accessToken: r.access_token ?? undefined,
      refreshToken: r.refresh_token ?? undefined,
      grantedScopes: JSON.parse(r.granted_scopes || '[]'),
      isPrimary: r.is_primary === 1,
      status: r.status,
      lastSyncedAt: r.last_synced_at ?? undefined,
      syncError: r.sync_error ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  setPrimaryConnectedAccount(id: string): void {
    this.db.prepare('UPDATE connected_accounts SET is_primary = 0').run();
    this.db.prepare('UPDATE connected_accounts SET is_primary = 1 WHERE id = ?').run(id);
  }

  disconnectConnectedAccount(id: string): void {
    this.db.prepare("UPDATE connected_accounts SET status = 'DISCONNECTED', access_token = NULL, refresh_token = NULL, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  deleteConnectedAccount(id: string): boolean {
    const res = this.db.prepare('DELETE FROM connected_accounts WHERE id = ?').run(id);
    return res.changes > 0;
  }

  updateAccountSyncStatus(id: string, status: string, error?: string): void {
    const stmt = this.db.prepare('UPDATE connected_accounts SET status = ?, last_synced_at = ?, sync_error = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), error ?? null, new Date().toISOString(), id);
  }

  // LLM Configurations Management
  saveLLMConfiguration(config: LLMConfiguration): void {
    const stmt = this.db.prepare(`
      INSERT INTO llm_configurations (
        id, provider, endpoint, api_key, available_models, default_model, request_timeout_ms,
        max_output_tokens, is_enabled, task_preferences, last_test_status, last_test_at, last_error, total_tokens_used, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        endpoint = excluded.endpoint,
        api_key = COALESCE(excluded.api_key, llm_configurations.api_key),
        available_models = excluded.available_models,
        default_model = excluded.default_model,
        request_timeout_ms = excluded.request_timeout_ms,
        max_output_tokens = excluded.max_output_tokens,
        is_enabled = excluded.is_enabled,
        task_preferences = excluded.task_preferences,
        last_test_status = excluded.last_test_status,
        last_test_at = excluded.last_test_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      config.id,
      config.provider,
      config.endpoint ?? null,
      config.apiKey ?? null,
      JSON.stringify(config.availableModels),
      config.defaultModel,
      config.requestTimeoutMs,
      config.maxOutputTokens,
      config.isEnabled ? 1 : 0,
      JSON.stringify(config.taskPreferences || {}),
      config.lastTestStatus ?? null,
      config.lastTestAt ?? null,
      config.lastError ?? null,
      config.totalTokensUsed || 0,
      config.createdAt,
      config.updatedAt
    );
  }

  getLLMConfigurations(): LLMConfiguration[] {
    const stmt = this.db.prepare('SELECT * FROM llm_configurations ORDER BY provider ASC');
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      provider: r.provider,
      endpoint: r.endpoint ?? undefined,
      apiKey: r.api_key ?? undefined,
      availableModels: JSON.parse(r.available_models || '[]'),
      defaultModel: r.default_model,
      requestTimeoutMs: r.request_timeout_ms,
      maxOutputTokens: r.max_output_tokens,
      isEnabled: r.is_enabled === 1,
      taskPreferences: JSON.parse(r.task_preferences || '{}'),
      lastTestStatus: r.last_test_status ?? undefined,
      lastTestAt: r.last_test_at ?? undefined,
      lastError: r.last_error ?? undefined,
      totalTokensUsed: r.total_tokens_used || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getLLMConfigurationByProvider(provider: string): LLMConfiguration | null {
    const stmt = this.db.prepare('SELECT * FROM llm_configurations WHERE provider = ?');
    const r = stmt.get(provider) as any;
    if (!r) return null;
    return {
      id: r.id,
      provider: r.provider,
      endpoint: r.endpoint ?? undefined,
      apiKey: r.api_key ?? undefined,
      availableModels: JSON.parse(r.available_models || '[]'),
      defaultModel: r.default_model,
      requestTimeoutMs: r.request_timeout_ms,
      maxOutputTokens: r.max_output_tokens,
      isEnabled: r.is_enabled === 1,
      taskPreferences: JSON.parse(r.task_preferences || '{}'),
      lastTestStatus: r.last_test_status ?? undefined,
      lastTestAt: r.last_test_at ?? undefined,
      lastError: r.last_error ?? undefined,
      totalTokensUsed: r.total_tokens_used || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  updateLLMTestResult(provider: string, status: string, error?: string): void {
    const stmt = this.db.prepare('UPDATE llm_configurations SET last_test_status = ?, last_test_at = ?, last_error = ?, updated_at = ? WHERE provider = ?');
    stmt.run(status, new Date().toISOString(), error ?? null, new Date().toISOString(), provider);
  }

  deleteLLMConfiguration(provider: string): boolean {
    const res = this.db.prepare('DELETE FROM llm_configurations WHERE provider = ?').run(provider);
    return res.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
