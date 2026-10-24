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
  LLMConfiguration,
  DiscoveryRun,
  DiscoveryStep,
  SavedSearch,
  InterviewFollowUpDraft,
  SchedulingPreferences
} from '../types/index.js';
import type { 
  JobSourceDefinition, 
  JobSourceCategory, 
  SourceImplementationStatus, 
  SourceHealthStatus, 
  SourceRegistrySummary, 
  SourceProposal 
} from '../discovery/registry/types.js';
import { INITIAL_SOURCE_CATALOG } from '../discovery/registry/catalog.js';
import { computeCanonicalHash } from '../discovery/deduplication.js';

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
        submission_id TEXT,
        thread_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        snippet TEXT NOT NULL,
        detected_intent TEXT NOT NULL,
        action_required INTEGER NOT NULL,
        action_details TEXT,
        received_at TEXT NOT NULL,
        company_name TEXT,
        job_title TEXT,
        candidate_availability TEXT,
        reply_status TEXT DEFAULT 'NONE',
        sent_reply_at TEXT,
        reply_message_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_interactions_thread ON recruiter_interactions(thread_id);

      CREATE TABLE IF NOT EXISTS interview_follow_up_drafts (
        id TEXT PRIMARY KEY,
        interaction_id TEXT NOT NULL,
        submission_id TEXT,
        recipient_email TEXT NOT NULL,
        company_name TEXT NOT NULL,
        job_title TEXT NOT NULL,
        intent TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        suggested_slots_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
        approved_at TEXT,
        sent_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_interview_drafts_interaction ON interview_follow_up_drafts(interaction_id);
      CREATE INDEX IF NOT EXISTS idx_interview_drafts_status ON interview_follow_up_drafts(status);

      CREATE TABLE IF NOT EXISTS candidate_scheduling_preferences (
        id TEXT PRIMARY KEY,
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        working_days_json TEXT NOT NULL,
        time_windows_json TEXT NOT NULL,
        meeting_platforms_json TEXT NOT NULL,
        notice_hours INTEGER NOT NULL DEFAULT 24,
        meeting_duration_minutes INTEGER NOT NULL DEFAULT 45,
        updated_at TEXT NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS source_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        category TEXT NOT NULL,
        countries TEXT NOT NULL,
        regions TEXT NOT NULL,
        job_categories TEXT NOT NULL,
        integration_type TEXT NOT NULL,
        api_docs_url TEXT,
        auth_requirements TEXT NOT NULL,
        config_vars TEXT NOT NULL,
        usage_restrictions TEXT,
        attribution_required INTEGER NOT NULL DEFAULT 0,
        attribution_text TEXT,
        pagination_method TEXT NOT NULL,
        rate_limits TEXT NOT NULL,
        sync_frequency_minutes INTEGER NOT NULL DEFAULT 60,
        implementation_status TEXT NOT NULL,
        health_status TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        stats TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_source_registry_category ON source_registry(category);
      CREATE INDEX IF NOT EXISTS idx_source_registry_status ON source_registry(implementation_status);
      CREATE INDEX IF NOT EXISTS idx_source_registry_health ON source_registry(health_status);

      CREATE TABLE IF NOT EXISTS source_proposals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        official_domain TEXT NOT NULL,
        category TEXT NOT NULL,
        countries_covered TEXT NOT NULL,
        evidence_description TEXT NOT NULL,
        api_or_feed_docs_url TEXT,
        access_restrictions TEXT,
        auth_requirements TEXT NOT NULL,
        estimated_integration_effort TEXT NOT NULL,
        recommended_adapter_type TEXT NOT NULL,
        validation_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
        proposed_at TEXT NOT NULL,
        reviewed_at TEXT,
        review_notes TEXT
      );

      CREATE TABLE IF NOT EXISTS saved_searches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'default_user',
        name TEXT NOT NULL,
        filters_json TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        alerts_enabled INTEGER NOT NULL DEFAULT 0,
        scheduled_search_enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_run_at TEXT,
        last_results_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS notification_configurations (
        id TEXT PRIMARY KEY,
        channel TEXT UNIQUE NOT NULL,
        credentials_json TEXT NOT NULL,
        min_score INTEGER NOT NULL DEFAULT 85,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);
      CREATE INDEX IF NOT EXISTS idx_saved_searches_default ON saved_searches(user_id, is_default);
    `);

    // Safe incremental migrations for existing DBs
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN is_early_applicant INTEGER DEFAULT 0;"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN is_saved INTEGER DEFAULT 0;"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN country TEXT DEFAULT 'Worldwide';"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN category TEXT DEFAULT 'DevOps';"); } catch {}
    try { this.db.exec("ALTER TABLE application_drafts ADD COLUMN sending_account_id TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE application_drafts ADD COLUMN tailored_pdf_path TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE user_preferences ADD COLUMN min_match_score REAL DEFAULT 75.0;"); } catch {}
    try { this.db.exec("ALTER TABLE match_evaluations ADD COLUMN qualifies_75 INTEGER DEFAULT 0;"); } catch {}
    try { this.db.exec("ALTER TABLE match_evaluations ADD COLUMN mandatory_blockers TEXT DEFAULT '[]';"); } catch {}
    try { this.db.exec("ALTER TABLE discovery_runs ADD COLUMN trigger_type TEXT DEFAULT 'RESUME_UPLOAD';"); } catch {}
    try { this.db.exec("ALTER TABLE discovery_runs ADD COLUMN status TEXT DEFAULT 'RUNNING';"); } catch {}
    try { this.db.exec("ALTER TABLE discovery_runs ADD COLUMN current_step TEXT DEFAULT 'SEARCH_COMPLETED';"); } catch {}
    try { this.db.exec("ALTER TABLE discovery_runs ADD COLUMN step_message TEXT DEFAULT '';"); } catch {}
    try { this.db.exec("ALTER TABLE discovery_runs ADD COLUMN total_sources INTEGER DEFAULT 0;"); } catch {}
    try { this.db.exec("ALTER TABLE discovery_runs ADD COLUMN evaluated_count INTEGER DEFAULT 0;"); } catch {}
    try { this.db.exec("ALTER TABLE discovery_runs ADD COLUMN min_score_threshold REAL DEFAULT 75.0;"); } catch {}
    try { this.db.exec("ALTER TABLE discovery_runs ADD COLUMN error_message TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN work_arrangement TEXT DEFAULT 'unknown';"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN experience_level TEXT DEFAULT 'not-specified';"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN min_experience_years INTEGER;"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN max_experience_years INTEGER;"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN visa_sponsorship INTEGER DEFAULT 0;"); } catch {}
    try { this.db.exec("ALTER TABLE vacancies ADD COLUMN relocation_assistance INTEGER DEFAULT 0;"); } catch {}
    try { this.db.exec("ALTER TABLE recruiter_interactions ADD COLUMN company_name TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE recruiter_interactions ADD COLUMN job_title TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE recruiter_interactions ADD COLUMN candidate_availability TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE recruiter_interactions ADD COLUMN reply_status TEXT DEFAULT 'NONE';"); } catch {}
    try { this.db.exec("ALTER TABLE recruiter_interactions ADD COLUMN sent_reply_at TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE recruiter_interactions ADD COLUMN reply_message_id TEXT;"); } catch {}
    try {
      const tableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='recruiter_interactions'").get() as { sql?: string } | undefined;
      if (tableInfo?.sql && tableInfo.sql.includes('submission_id TEXT NOT NULL')) {
        this.db.exec("PRAGMA foreign_keys=off;");
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS recruiter_interactions_new (
            id TEXT PRIMARY KEY,
            submission_id TEXT,
            thread_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            sender_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            snippet TEXT NOT NULL,
            detected_intent TEXT NOT NULL,
            action_required INTEGER NOT NULL,
            action_details TEXT,
            received_at TEXT NOT NULL,
            company_name TEXT,
            job_title TEXT,
            candidate_availability TEXT,
            reply_status TEXT DEFAULT 'NONE',
            sent_reply_at TEXT,
            reply_message_id TEXT
          );
          INSERT OR REPLACE INTO recruiter_interactions_new (
            id, submission_id, thread_id, message_id, sender_email, subject, snippet,
            detected_intent, action_required, action_details, received_at,
            company_name, job_title, candidate_availability, reply_status, sent_reply_at, reply_message_id
          ) SELECT 
            id, submission_id, thread_id, message_id, sender_email, subject, snippet,
            detected_intent, action_required, action_details, received_at,
            company_name, job_title, candidate_availability, reply_status, sent_reply_at, reply_message_id
          FROM recruiter_interactions;
          DROP TABLE recruiter_interactions;
          ALTER TABLE recruiter_interactions_new RENAME TO recruiter_interactions;
        `);
        this.db.exec("PRAGMA foreign_keys=on;");
      }
    } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_interactions_intent ON recruiter_interactions(detected_intent);"); } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_interactions_reply_status ON recruiter_interactions(reply_status);"); } catch {}

    // Seed source registry if empty
    try {
      const countRow = this.db.prepare('SELECT count(*) as count FROM source_registry').get() as { count: number };
      if (!countRow || countRow.count === 0) {
        this.seedSourceCatalog();
      }
    } catch (err) {
      logger.error('Failed to check/seed source registry', { error: (err as Error).message });
    }

    // Purge fake unauthenticated accounts (missing both access_token and refresh_token)
    try {
      this.purgeUnauthenticatedFakeAccounts();
    } catch {}

    // Clean duplicate evaluations
    try {
      this.cleanupDuplicateEvaluations();
    } catch {}
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
        daily_qualified_target, hourly_discovery_enabled, min_match_score, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        min_match_score = excluded.min_match_score,
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
      prefs.minMatchScore !== undefined ? prefs.minMatchScore : 75.0,
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
      minMatchScore: row.min_match_score !== undefined && row.min_match_score !== null ? row.min_match_score : 75.0,
    };
  }

  getRawDb(): any {
    return this.db;
  }

  // Vacancies
  insertOrUpdateVacancy(vacancy: Vacancy): { inserted: boolean; isNew: boolean; id: string; vacancy: Vacancy } {
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
      const updated = this.getVacancyById(existing.id)!;
      return { inserted: false, isNew: false, id: existing.id, vacancy: updated };
    }

    const stmt = this.db.prepare(`
      INSERT INTO vacancies (
        id, canonical_hash, source_type, source_url, alternate_urls, company_name, title, normalized_title,
        location_text, is_remote, accepts_india, employment_type, salary_min, salary_max, currency,
        raw_description, parsed_requirements, published_at, discovered_at, last_verified_at, status, is_contract_or_freelance,
        is_early_applicant, is_saved, country, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        vacancy.id,
        vacancy.canonicalHash,
        vacancy.sourceType,
        vacancy.sourceUrl,
        JSON.stringify(vacancy.alternateUrls || []),
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
      const created = this.getVacancyById(vacancy.id)!;
      return { inserted: true, isNew: true, id: vacancy.id, vacancy: created };
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        const concurrent = this.getVacancyByCanonicalHash(vacancy.canonicalHash);
        if (concurrent) {
          const mergedUrls = Array.from(new Set([...concurrent.alternateUrls, vacancy.sourceUrl, ...(vacancy.alternateUrls || [])]));
          this.db.prepare(`
            UPDATE vacancies SET
              alternate_urls = ?,
              last_verified_at = ?
            WHERE id = ?
          `).run(JSON.stringify(mergedUrls), new Date().toISOString(), concurrent.id);
          const resolved = this.getVacancyById(concurrent.id)!;
          return { inserted: false, isNew: false, id: concurrent.id, vacancy: resolved };
        }
      }
      throw err;
    }
  }

  /**
   * Safely scans existing vacancy records, merges duplicates, preserves application history,
   * re-points match evaluations and drafts to the canonical record, and eliminates duplicate rows.
   */
  deduplicateExistingVacancies(): { scanned: number; merged: number; duplicatesRemoved: number } {
    const rows = this.db.prepare('SELECT * FROM vacancies ORDER BY discovered_at ASC, id ASC').all() as any[];
    const seenHashes = new Map<string, any>();
    let merged = 0;
    let duplicatesRemoved = 0;

    for (const row of rows) {
      const hash = computeCanonicalHash(row.company_name, row.title, row.source_url) || row.canonical_hash;
      if (!seenHashes.has(hash)) {
        seenHashes.set(hash, row);
      } else {
        const primary = seenHashes.get(hash);
        const duplicateId = row.id;

        // 1. Merge alternate URLs
        const primUrls = JSON.parse(primary.alternate_urls || '[]');
        const dupUrls = JSON.parse(row.alternate_urls || '[]');
        const combinedUrls = Array.from(new Set([...primUrls, row.source_url, ...dupUrls]));
        this.db.prepare('UPDATE vacancies SET alternate_urls = ? WHERE id = ?').run(JSON.stringify(combinedUrls), primary.id);

        // 2. Re-point or delete match evaluations
        const primEval = this.db.prepare('SELECT id FROM match_evaluations WHERE vacancy_id = ?').get(primary.id);
        if (primEval) {
          this.db.prepare('DELETE FROM match_evaluations WHERE vacancy_id = ?').run(duplicateId);
        } else {
          this.db.prepare('UPDATE match_evaluations SET vacancy_id = ? WHERE vacancy_id = ?').run(primary.id, duplicateId);
        }

        // 3. Re-point drafts and submissions
        this.db.prepare('UPDATE application_drafts SET vacancy_id = ? WHERE vacancy_id = ?').run(primary.id, duplicateId);
        this.db.prepare('UPDATE application_submissions SET vacancy_id = ? WHERE vacancy_id = ?').run(primary.id, duplicateId);

        // 4. Delete duplicate vacancy row
        this.db.prepare('DELETE FROM vacancies WHERE id = ?').run(duplicateId);

        merged++;
        duplicatesRemoved++;
      }
    }

    this.cleanupDuplicateEvaluations();
    logger.info(`Deduplication scan completed: scanned ${rows.length}, merged ${merged}, removed ${duplicatesRemoved} duplicates`);
    return { scanned: rows.length, merged, duplicatesRemoved };
  }

  /**
   * Ensures only one canonical evaluation exists per vacancy, eliminating duplicate evaluations
   * that distort dashboard qualified matches counts.
   */
  cleanupDuplicateEvaluations(): number {
    const stmt = this.db.prepare(`
      DELETE FROM match_evaluations
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY vacancy_id ORDER BY evaluated_at DESC, id DESC) as rn
          FROM match_evaluations
        ) WHERE rn = 1
      )
    `);
    const res = stmt.run();
    return Number(res.changes);
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
      SELECT v.*, m.id as m_id, m.overall_score, m.tier, m.category_scores, m.matching_skills, m.missing_skills, m.evidence_explanation, m.evaluated_at, m.qualifies_75, m.mandatory_blockers
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
          qualifies75: r.qualifies_75 === 1,
          mandatoryBlockers: r.mandatory_blockers ? JSON.parse(r.mandatory_blockers) : [],
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

  saveMatchEvaluation(evalData: MatchScoreEvaluation): void {
    const existing = this.getMatchEvaluationByVacancyId(evalData.vacancyId);
    if (existing) {
      const updateStmt = this.db.prepare(`
        UPDATE match_evaluations SET
          overall_score = ?,
          tier = ?,
          category_scores = ?,
          matching_skills = ?,
          missing_skills = ?,
          evidence_explanation = ?,
          evaluated_at = ?,
          qualifies_75 = ?,
          mandatory_blockers = ?
        WHERE id = ?
      `);
      updateStmt.run(
        evalData.overallScore,
        evalData.tier,
        JSON.stringify(evalData.categoryScores),
        JSON.stringify(evalData.matchingSkills),
        JSON.stringify(evalData.missingSkills),
        evalData.evidenceExplanation,
        evalData.evaluatedAt,
        evalData.qualifies75 ? 1 : 0,
        JSON.stringify(evalData.mandatoryBlockers || []),
        existing.id
      );
      return;
    }

    const stmt = this.db.prepare(`
      INSERT INTO match_evaluations (id, vacancy_id, overall_score, tier, category_scores, matching_skills, missing_skills, evidence_explanation, evaluated_at, qualifies_75, mandatory_blockers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      evalData.evaluatedAt,
      evalData.qualifies75 ? 1 : 0,
      JSON.stringify(evalData.mandatoryBlockers || [])
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
      qualifies75: row.qualifies_75 === 1,
      mandatoryBlockers: row.mandatory_blockers ? JSON.parse(row.mandatory_blockers) : [],
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
      submission.status || 'SENT',
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
      INSERT INTO recruiter_interactions (
        id, submission_id, thread_id, message_id, sender_email, subject, snippet,
        detected_intent, action_required, action_details, received_at,
        company_name, job_title, candidate_availability, reply_status, sent_reply_at, reply_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        submission_id = excluded.submission_id,
        thread_id = excluded.thread_id,
        message_id = excluded.message_id,
        sender_email = excluded.sender_email,
        subject = excluded.subject,
        snippet = excluded.snippet,
        detected_intent = excluded.detected_intent,
        action_required = excluded.action_required,
        action_details = excluded.action_details,
        received_at = excluded.received_at,
        company_name = COALESCE(excluded.company_name, recruiter_interactions.company_name),
        job_title = COALESCE(excluded.job_title, recruiter_interactions.job_title),
        candidate_availability = COALESCE(excluded.candidate_availability, recruiter_interactions.candidate_availability),
        reply_status = COALESCE(excluded.reply_status, recruiter_interactions.reply_status),
        sent_reply_at = COALESCE(excluded.sent_reply_at, recruiter_interactions.sent_reply_at),
        reply_message_id = COALESCE(excluded.reply_message_id, recruiter_interactions.reply_message_id)
    `);
    stmt.run(
      interaction.id,
      interaction.submissionId || null,
      interaction.threadId,
      interaction.messageId,
      interaction.senderEmail,
      interaction.subject,
      interaction.snippet,
      interaction.detectedIntent,
      interaction.actionRequired ? 1 : 0,
      interaction.actionDetails ?? null,
      interaction.receivedAt,
      interaction.companyName ?? null,
      interaction.jobTitle ?? null,
      interaction.candidateAvailabilityOptions ? JSON.stringify(interaction.candidateAvailabilityOptions) : null,
      interaction.replyStatus ?? 'NONE',
      interaction.sentReplyAt ?? null,
      interaction.replyMessageId ?? null
    );

    if (interaction.submissionId) {
      if (interaction.detectedIntent === 'INTERVIEW_INVITATION') {
        this.db.prepare("UPDATE application_submissions SET status = 'INTERVIEW_INVITE' WHERE id = ?").run(interaction.submissionId);
      } else if (interaction.detectedIntent === 'REJECTION') {
        this.db.prepare("UPDATE application_submissions SET status = 'REJECTED' WHERE id = ?").run(interaction.submissionId);
      }
    }
  }

  getRecruiterInteractionById(id: string): RecruiterInteraction | null {
    const row = this.db.prepare('SELECT * FROM recruiter_interactions WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapRecruiterInteractionRow(row);
  }

  listRecruiterInteractions(options?: { intent?: string; actionRequired?: boolean; limit?: number }): RecruiterInteraction[] {
    let sql = 'SELECT * FROM recruiter_interactions';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.intent) {
      conditions.push('detected_intent = ?');
      params.push(options.intent);
    }
    if (options?.actionRequired !== undefined) {
      conditions.push('action_required = ?');
      params.push(options.actionRequired ? 1 : 0);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY received_at DESC';
    if (options?.limit) {
      sql += ` LIMIT ${Math.max(1, options.limit)}`;
    }
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.mapRecruiterInteractionRow(r));
  }

  updateRecruiterInteraction(id: string, updates: Partial<RecruiterInteraction>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.replyStatus !== undefined) {
      fields.push('reply_status = ?');
      values.push(updates.replyStatus);
    }
    if (updates.sentReplyAt !== undefined) {
      fields.push('sent_reply_at = ?');
      values.push(updates.sentReplyAt);
    }
    if (updates.replyMessageId !== undefined) {
      fields.push('reply_message_id = ?');
      values.push(updates.replyMessageId);
    }
    if (updates.actionRequired !== undefined) {
      fields.push('action_required = ?');
      values.push(updates.actionRequired ? 1 : 0);
    }
    if (updates.companyName !== undefined) {
      fields.push('company_name = ?');
      values.push(updates.companyName);
    }
    if (updates.jobTitle !== undefined) {
      fields.push('job_title = ?');
      values.push(updates.jobTitle);
    }
    if (fields.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE recruiter_interactions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  private mapRecruiterInteractionRow(r: any): RecruiterInteraction {
    let slots: string[] | undefined = undefined;
    if (r.candidate_availability) {
      try { slots = JSON.parse(r.candidate_availability); } catch {}
    }
    return {
      id: r.id,
      submissionId: r.submission_id || '',
      threadId: r.thread_id,
      messageId: r.message_id,
      senderEmail: r.sender_email,
      subject: r.subject,
      snippet: r.snippet,
      detectedIntent: r.detected_intent,
      actionRequired: Boolean(r.action_required),
      actionDetails: r.action_details ?? undefined,
      receivedAt: r.received_at,
      companyName: r.company_name ?? undefined,
      jobTitle: r.job_title ?? undefined,
      candidateAvailabilityOptions: slots,
      replyStatus: r.reply_status ?? 'NONE',
      sentReplyAt: r.sent_reply_at ?? undefined,
      replyMessageId: r.reply_message_id ?? undefined,
    };
  }

  // Interview Follow-Up Drafts
  saveInterviewFollowUpDraft(draft: InterviewFollowUpDraft): void {
    const stmt = this.db.prepare(`
      INSERT INTO interview_follow_up_drafts (
        id, interaction_id, submission_id, recipient_email, company_name, job_title,
        intent, subject, body, suggested_slots_json, status, approved_at, sent_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        recipient_email = excluded.recipient_email,
        company_name = excluded.company_name,
        job_title = excluded.job_title,
        intent = excluded.intent,
        subject = excluded.subject,
        body = excluded.body,
        suggested_slots_json = excluded.suggested_slots_json,
        status = excluded.status,
        approved_at = COALESCE(excluded.approved_at, interview_follow_up_drafts.approved_at),
        sent_at = COALESCE(excluded.sent_at, interview_follow_up_drafts.sent_at),
        updated_at = excluded.updated_at
    `);
    stmt.run(
      draft.id,
      draft.interactionId,
      draft.submissionId ?? null,
      draft.recipientEmail,
      draft.companyName,
      draft.jobTitle,
      draft.intent,
      draft.subject,
      draft.body,
      JSON.stringify(draft.suggestedSlots || []),
      draft.status,
      draft.approvedAt ?? null,
      draft.sentAt ?? null,
      draft.createdAt,
      draft.updatedAt ?? new Date().toISOString()
    );
  }

  getInterviewFollowUpDraftById(id: string): InterviewFollowUpDraft | null {
    const row = this.db.prepare('SELECT * FROM interview_follow_up_drafts WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapInterviewFollowUpDraftRow(row);
  }

  getInterviewFollowUpDraftByInteractionId(interactionId: string): InterviewFollowUpDraft | null {
    const row = this.db.prepare('SELECT * FROM interview_follow_up_drafts WHERE interaction_id = ? ORDER BY created_at DESC LIMIT 1').get(interactionId) as any;
    if (!row) return null;
    return this.mapInterviewFollowUpDraftRow(row);
  }

  listInterviewFollowUpDrafts(filter?: { status?: string; limit?: number }): InterviewFollowUpDraft[] {
    let sql = 'SELECT * FROM interview_follow_up_drafts';
    const params: any[] = [];
    if (filter?.status) {
      sql += ' WHERE status = ?';
      params.push(filter.status);
    }
    sql += ' ORDER BY created_at DESC';
    if (filter?.limit) {
      sql += ` LIMIT ${Math.max(1, filter.limit)}`;
    }
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.mapInterviewFollowUpDraftRow(r));
  }

  updateInterviewFollowUpDraft(id: string, updates: Partial<InterviewFollowUpDraft>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.subject !== undefined) {
      fields.push('subject = ?');
      values.push(updates.subject);
    }
    if (updates.body !== undefined) {
      fields.push('body = ?');
      values.push(updates.body);
    }
    if (updates.suggestedSlots !== undefined) {
      fields.push('suggested_slots_json = ?');
      values.push(JSON.stringify(updates.suggestedSlots));
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.approvedAt !== undefined) {
      fields.push('approved_at = ?');
      values.push(updates.approvedAt);
    }
    if (updates.sentAt !== undefined) {
      fields.push('sent_at = ?');
      values.push(updates.sentAt);
    }
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);
    this.db.prepare(`UPDATE interview_follow_up_drafts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  private mapInterviewFollowUpDraftRow(r: any): InterviewFollowUpDraft {
    let slots: string[] = [];
    if (r.suggested_slots_json) {
      try { slots = JSON.parse(r.suggested_slots_json); } catch {}
    }
    return {
      id: r.id,
      interactionId: r.interaction_id,
      submissionId: r.submission_id ?? undefined,
      recipientEmail: r.recipient_email,
      companyName: r.company_name,
      jobTitle: r.job_title,
      intent: r.intent,
      subject: r.subject,
      body: r.body,
      suggestedSlots: slots,
      status: r.status,
      approvedAt: r.approved_at ?? undefined,
      sentAt: r.sent_at ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? undefined,
    };
  }

  // Scheduling Preferences
  getSchedulingPreferences(): SchedulingPreferences {
    const row = this.db.prepare('SELECT * FROM candidate_scheduling_preferences LIMIT 1').get() as any;
    if (!row) {
      return {
        timezone: 'Asia/Kolkata',
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        timeWindows: [
          { start: '14:00', end: '17:00' },
          { start: '18:00', end: '21:00' }
        ],
        meetingPlatforms: ['Google Meet', 'Zoom', 'Microsoft Teams'],
        noticeHours: 24,
        meetingDurationMinutes: 45
      };
    }

    let workingDays: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    let timeWindows: { start: string; end: string }[] = [{ start: '14:00', end: '18:00' }];
    let meetingPlatforms: string[] = ['Google Meet', 'Zoom'];

    try { workingDays = JSON.parse(row.working_days_json); } catch {}
    try { timeWindows = JSON.parse(row.time_windows_json); } catch {}
    try { meetingPlatforms = JSON.parse(row.meeting_platforms_json); } catch {}

    return {
      timezone: row.timezone || 'Asia/Kolkata',
      workingDays,
      timeWindows,
      meetingPlatforms,
      noticeHours: row.notice_hours ?? 24,
      meetingDurationMinutes: row.meeting_duration_minutes ?? 45
    };
  }

  saveSchedulingPreferences(prefs: Partial<SchedulingPreferences>): SchedulingPreferences {
    const current = this.getSchedulingPreferences();
    const merged: SchedulingPreferences = {
      timezone: prefs.timezone || current.timezone,
      workingDays: prefs.workingDays || current.workingDays,
      timeWindows: prefs.timeWindows || current.timeWindows,
      meetingPlatforms: prefs.meetingPlatforms || current.meetingPlatforms,
      noticeHours: prefs.noticeHours !== undefined ? prefs.noticeHours : current.noticeHours,
      meetingDurationMinutes: prefs.meetingDurationMinutes !== undefined ? prefs.meetingDurationMinutes : current.meetingDurationMinutes,
    };

    const stmt = this.db.prepare(`
      INSERT INTO candidate_scheduling_preferences (
        id, timezone, working_days_json, time_windows_json, meeting_platforms_json,
        notice_hours, meeting_duration_minutes, updated_at
      ) VALUES ('default_prefs', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        timezone = excluded.timezone,
        working_days_json = excluded.working_days_json,
        time_windows_json = excluded.time_windows_json,
        meeting_platforms_json = excluded.meeting_platforms_json,
        notice_hours = excluded.notice_hours,
        meeting_duration_minutes = excluded.meeting_duration_minutes,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      merged.timezone,
      JSON.stringify(merged.workingDays),
      JSON.stringify(merged.timeWindows),
      JSON.stringify(merged.meetingPlatforms),
      merged.noticeHours,
      merged.meetingDurationMinutes,
      new Date().toISOString()
    );

    return merged;
  }

  // Discovery Runs
  saveDiscoveryRun(run: DiscoveryRun): void {
    const stmt = this.db.prepare(`
      INSERT INTO discovery_runs (
        id, started_at, finished_at, source, vacancies_discovered, vacancies_new,
        vacancies_qualified, errors_count, telemetry_json, trigger_type, status,
        current_step, step_message, total_sources, evaluated_count, min_score_threshold, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        finished_at = excluded.finished_at,
        source = excluded.source,
        vacancies_discovered = excluded.vacancies_discovered,
        vacancies_new = excluded.vacancies_new,
        vacancies_qualified = excluded.vacancies_qualified,
        errors_count = excluded.errors_count,
        telemetry_json = excluded.telemetry_json,
        trigger_type = excluded.trigger_type,
        status = excluded.status,
        current_step = excluded.current_step,
        step_message = excluded.step_message,
        total_sources = excluded.total_sources,
        evaluated_count = excluded.evaluated_count,
        min_score_threshold = excluded.min_score_threshold,
        error_message = excluded.error_message
    `);
    stmt.run(
      run.id,
      run.startedAt,
      run.completedAt || null,
      run.triggerType,
      run.discoveredCount,
      0,
      run.qualifiedCount,
      run.error ? 1 : 0,
      JSON.stringify(run),
      run.triggerType,
      run.status,
      run.currentStep,
      run.stepMessage,
      run.totalSourcesSearched,
      run.evaluatedCount,
      run.minScoreThreshold,
      run.error || null
    );
  }

  getDiscoveryRun(id: string): DiscoveryRun | null {
    const stmt = this.db.prepare('SELECT * FROM discovery_runs WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      triggerType: (row.trigger_type || 'RESUME_UPLOAD') as any,
      status: (row.status || 'RUNNING') as any,
      currentStep: (row.current_step || 'SEARCH_COMPLETED') as any,
      stepMessage: row.step_message || '',
      totalSourcesSearched: row.total_sources || 0,
      discoveredCount: row.vacancies_discovered || 0,
      evaluatedCount: row.evaluated_count || 0,
      qualifiedCount: row.vacancies_qualified || 0,
      minScoreThreshold: row.min_score_threshold !== undefined && row.min_score_threshold !== null ? row.min_score_threshold : 75.0,
      error: row.error_message || undefined,
      startedAt: row.started_at,
      completedAt: row.finished_at || undefined,
    };
  }

  listDiscoveryRuns(limit = 10): DiscoveryRun[] {
    const stmt = this.db.prepare('SELECT * FROM discovery_runs ORDER BY started_at DESC LIMIT ?');
    const rows = stmt.all(limit) as any[];
    return rows.map(row => ({
      id: row.id,
      triggerType: (row.trigger_type || 'RESUME_UPLOAD') as any,
      status: (row.status || 'RUNNING') as any,
      currentStep: (row.current_step || 'SEARCH_COMPLETED') as any,
      stepMessage: row.step_message || '',
      totalSourcesSearched: row.total_sources || 0,
      discoveredCount: row.vacancies_discovered || 0,
      evaluatedCount: row.evaluated_count || 0,
      qualifiedCount: row.vacancies_qualified || 0,
      minScoreThreshold: row.min_score_threshold !== undefined && row.min_score_threshold !== null ? row.min_score_threshold : 75.0,
      error: row.error_message || undefined,
      startedAt: row.started_at,
      completedAt: row.finished_at || undefined,
    }));
  }

  updateDiscoveryRunStep(
    id: string,
    step: DiscoveryStep,
    message: string,
    stats?: Partial<DiscoveryRun>
  ): void {
    const existing = this.getDiscoveryRun(id);
    if (!existing) return;
    const updated: DiscoveryRun = {
      ...existing,
      currentStep: step,
      stepMessage: message,
      status: step === 'SEARCH_COMPLETED' ? 'COMPLETED' : step === 'FAILED' ? 'FAILED' : 'RUNNING',
      totalSourcesSearched: stats?.totalSourcesSearched !== undefined ? stats.totalSourcesSearched : existing.totalSourcesSearched,
      discoveredCount: stats?.discoveredCount !== undefined ? stats.discoveredCount : existing.discoveredCount,
      evaluatedCount: stats?.evaluatedCount !== undefined ? stats.evaluatedCount : existing.evaluatedCount,
      qualifiedCount: stats?.qualifiedCount !== undefined ? stats.qualifiedCount : existing.qualifiedCount,
      minScoreThreshold: stats?.minScoreThreshold !== undefined ? stats.minScoreThreshold : existing.minScoreThreshold,
      completedAt: (step === 'SEARCH_COMPLETED' || step === 'FAILED') ? new Date().toISOString() : existing.completedAt,
      error: stats?.error !== undefined ? stats.error : existing.error,
    };
    this.saveDiscoveryRun(updated);
  }

  saveApplicationSubmission(submission: ApplicationSubmission): void {
    this.saveSubmission(submission);
  }

  // Telemetry & Metrics
  getDashboardMetrics(): Record<string, any> {
    const totalDiscovered = (this.db.prepare("SELECT COUNT(*) as c FROM vacancies WHERE status != 'ARCHIVED' AND status != 'IGNORED'").get() as any).c;
    const totalQualified = (this.db.prepare("SELECT COUNT(DISTINCT v.id) as c FROM vacancies v JOIN match_evaluations m ON v.id = m.vacancy_id WHERE m.overall_score >= 75 AND v.status != 'ARCHIVED' AND v.status != 'IGNORED'").get() as any).c;
    const draftsAwaitingApproval = (this.db.prepare("SELECT COUNT(*) as c FROM application_drafts WHERE status = 'PENDING_REVIEW'").get() as any).c;
    const totalSubmitted = (this.db.prepare("SELECT COUNT(*) as c FROM application_submissions WHERE status != 'FAILED'").get() as any).c;
    const interviewInvites = (this.db.prepare("SELECT (SELECT COUNT(*) FROM recruiter_interactions WHERE detected_intent = 'INTERVIEW_INVITE' OR detected_intent = 'INTERVIEW') + (SELECT COUNT(*) FROM application_submissions WHERE status = 'INTERVIEW_INVITE') as c").get() as any).c;
    const totalContracts = (this.db.prepare("SELECT COUNT(*) as c FROM vacancies WHERE is_contract_or_freelance = 1 AND status != 'ARCHIVED' AND status != 'IGNORED'").get() as any).c;

    return {
      totalDiscovered,
      totalQualified,
      draftsAwaitingApproval,
      awaitingApproval: draftsAwaitingApproval,
      totalSubmitted,
      submittedApplications: totalSubmitted,
      interviewInvites,
      interviewInvitations: interviewInvites,
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

  listAuditEvents(limit: number = 20): Array<{ id: string; action: string; actor: string; entityType: string; entityId: string; details: any; timestamp: string }> {
    const rows = this.db.prepare(`SELECT * FROM audit_events ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[];
    return rows.map(r => ({
      id: r.id,
      action: r.action,
      actor: r.actor,
      entityType: r.entity_type,
      entityId: r.entity_id,
      details: JSON.parse(r.details_json || '{}'),
      timestamp: r.timestamp,
    }));
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
    const stmt = this.db.prepare("SELECT * FROM connected_accounts WHERE is_primary = 1 LIMIT 1");
    const r = stmt.get() as any;
    if (!r) {
      // Fallback to first account
      const fallbackStmt = this.db.prepare("SELECT * FROM connected_accounts LIMIT 1");
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
    const acc = this.getConnectedAccountById(id);
    this.db.prepare("UPDATE connected_accounts SET status = 'DISCONNECTED', access_token = NULL, refresh_token = NULL, is_primary = 0, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    if (acc?.isPrimary) {
      const nextConnected = this.db.prepare("SELECT id FROM connected_accounts WHERE status = 'CONNECTED' AND id != ? LIMIT 1").get(id) as any;
      if (nextConnected) {
        this.setPrimaryConnectedAccount(nextConnected.id);
      }
    }
  }

  deleteConnectedAccount(id: string): boolean {
    const acc = this.getConnectedAccountById(id);
    const res = this.db.prepare('DELETE FROM connected_accounts WHERE id = ?').run(id);
    if (acc?.isPrimary) {
      const nextConnected = this.db.prepare("SELECT id FROM connected_accounts WHERE status = 'CONNECTED' LIMIT 1").get() as any;
      if (nextConnected) {
        this.setPrimaryConnectedAccount(nextConnected.id);
      }
    }
    return res.changes > 0;
  }

  purgeUnauthenticatedFakeAccounts(): number {
    const stmt = this.db.prepare("DELETE FROM connected_accounts WHERE (access_token IS NULL OR access_token = '') AND (refresh_token IS NULL OR refresh_token = '')");
    const res = stmt.run();
    if (res.changes > 0) {
      logger.info(`Purged ${res.changes} unauthenticated fake accounts from database.`);
    }
    return Number(res.changes);
  }

  updateAccountSyncStatus(id: string, status: string, error?: string): void {
    const stmt = this.db.prepare('UPDATE connected_accounts SET status = ?, last_synced_at = ?, sync_error = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), error ?? null, new Date().toISOString(), id);
  }

  // Notification Configurations Management
  saveNotificationConfig(config: { channel: string; credentials: Record<string, any>; minScore?: number; isEnabled?: boolean }): void {
    const id = `notif_${config.channel.toLowerCase()}`;
    const stmt = this.db.prepare(`
      INSERT INTO notification_configurations (id, channel, credentials_json, min_score, is_enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(channel) DO UPDATE SET
        credentials_json = excluded.credentials_json,
        min_score = excluded.min_score,
        is_enabled = excluded.is_enabled,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      id,
      config.channel.toLowerCase(),
      JSON.stringify(config.credentials),
      config.minScore ?? 85,
      config.isEnabled !== false ? 1 : 0,
      new Date().toISOString()
    );
  }

  getNotificationConfig(channel: string): { channel: string; credentials: Record<string, any>; minScore: number; isEnabled: boolean } | null {
    const stmt = this.db.prepare('SELECT * FROM notification_configurations WHERE channel = ?');
    const row = stmt.get(channel.toLowerCase()) as any;
    if (!row) return null;
    return {
      channel: row.channel,
      credentials: JSON.parse(row.credentials_json || '{}'),
      minScore: row.min_score,
      isEnabled: row.is_enabled === 1,
    };
  }

  listNotificationConfigs(): Array<{ channel: string; credentials: Record<string, any>; minScore: number; isEnabled: boolean }> {
    const stmt = this.db.prepare('SELECT * FROM notification_configurations ORDER BY channel ASC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      channel: row.channel,
      credentials: JSON.parse(row.credentials_json || '{}'),
      minScore: row.min_score,
      isEnabled: row.is_enabled === 1,
    }));
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

  // ==========================================
  // Source Registry & Global Discovery Methods
  // ==========================================

  private seedSourceCatalog(): void {
    const insert = this.db.prepare(`
      INSERT INTO source_registry (
        id, name, url, category, countries, regions, job_categories,
        integration_type, api_docs_url, auth_requirements, config_vars,
        usage_restrictions, attribution_required, attribution_text,
        pagination_method, rate_limits, sync_frequency_minutes,
        implementation_status, health_status, verification_status,
        is_enabled, notes, stats, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const now = new Date().toISOString();
      for (const s of INITIAL_SOURCE_CATALOG) {
        insert.run(
          s.id,
          s.name,
          s.url,
          s.category,
          JSON.stringify(s.countries || []),
          JSON.stringify(s.regions || []),
          JSON.stringify(s.jobCategories || []),
          s.integrationType,
          s.apiDocsUrl ?? null,
          s.authRequirements,
          JSON.stringify(s.configVars || []),
          s.usageRestrictions ?? null,
          s.attributionRequired ? 1 : 0,
          s.attributionText ?? null,
          s.paginationMethod,
          JSON.stringify(s.rateLimits || {}),
          s.syncFrequencyMinutes,
          s.implementationStatus,
          s.healthStatus,
          s.verificationStatus,
          s.isEnabled ? 1 : 0,
          s.notes ?? null,
          JSON.stringify(s.stats || {}),
          now
        );
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      logger.error('Failed to seed source catalog', { error: (err as Error).message });
    }
  }

  private mapSourceRow(r: any): JobSourceDefinition {
    return {
      id: r.id,
      name: r.name,
      url: r.url,
      category: r.category as JobSourceCategory,
      countries: JSON.parse(r.countries || '[]'),
      regions: JSON.parse(r.regions || '[]'),
      jobCategories: JSON.parse(r.job_categories || '[]'),
      integrationType: r.integration_type as any,
      apiDocsUrl: r.api_docs_url ?? undefined,
      authRequirements: r.auth_requirements as any,
      configVars: JSON.parse(r.config_vars || '[]'),
      usageRestrictions: r.usage_restrictions ?? undefined,
      attributionRequired: r.attribution_required === 1,
      attributionText: r.attribution_text ?? undefined,
      paginationMethod: r.pagination_method as any,
      rateLimits: JSON.parse(r.rate_limits || '{}'),
      syncFrequencyMinutes: r.sync_frequency_minutes,
      implementationStatus: r.implementation_status as any,
      healthStatus: r.health_status as any,
      verificationStatus: r.verification_status as any,
      isEnabled: r.is_enabled === 1,
      notes: r.notes ?? undefined,
      stats: JSON.parse(r.stats || '{}'),
    };
  }

  listSources(filter?: {
    category?: JobSourceCategory;
    status?: SourceImplementationStatus;
    country?: string;
    isEnabled?: boolean;
    search?: string;
  }): JobSourceDefinition[] {
    let sql = 'SELECT * FROM source_registry WHERE 1=1';
    const params: any[] = [];

    if (filter?.category) {
      sql += ' AND category = ?';
      params.push(filter.category);
    }
    if (filter?.status) {
      sql += ' AND implementation_status = ?';
      params.push(filter.status);
    }
    if (filter?.isEnabled !== undefined) {
      sql += ' AND is_enabled = ?';
      params.push(filter.isEnabled ? 1 : 0);
    }
    if (filter?.search) {
      sql += ' AND (name LIKE ? OR id LIKE ? OR url LIKE ?)';
      const s = `%${filter.search}%`;
      params.push(s, s, s);
    }

    sql += ' ORDER BY category ASC, name ASC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    let sources = rows.map(r => this.mapSourceRow(r));

    if (filter?.country) {
      const c = filter.country.toUpperCase();
      sources = sources.filter(s => 
        s.countries.includes(c) || s.countries.includes('Global') || s.countries.includes('Worldwide')
      );
    }

    return sources;
  }

  getSource(id: string): JobSourceDefinition | null {
    const stmt = this.db.prepare('SELECT * FROM source_registry WHERE id = ?');
    const r = stmt.get(id) as any;
    if (!r) return null;
    return this.mapSourceRow(r);
  }

  saveSource(source: JobSourceDefinition): void {
    const stmt = this.db.prepare(`
      INSERT INTO source_registry (
        id, name, url, category, countries, regions, job_categories,
        integration_type, api_docs_url, auth_requirements, config_vars,
        usage_restrictions, attribution_required, attribution_text,
        pagination_method, rate_limits, sync_frequency_minutes,
        implementation_status, health_status, verification_status,
        is_enabled, notes, stats, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        url = excluded.url,
        category = excluded.category,
        countries = excluded.countries,
        regions = excluded.regions,
        job_categories = excluded.job_categories,
        integration_type = excluded.integration_type,
        api_docs_url = excluded.api_docs_url,
        auth_requirements = excluded.auth_requirements,
        config_vars = excluded.config_vars,
        usage_restrictions = excluded.usage_restrictions,
        attribution_required = excluded.attribution_required,
        attribution_text = excluded.attribution_text,
        pagination_method = excluded.pagination_method,
        rate_limits = excluded.rate_limits,
        sync_frequency_minutes = excluded.sync_frequency_minutes,
        implementation_status = excluded.implementation_status,
        health_status = excluded.health_status,
        verification_status = excluded.verification_status,
        is_enabled = excluded.is_enabled,
        notes = excluded.notes,
        stats = excluded.stats,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      source.id,
      source.name,
      source.url,
      source.category,
      JSON.stringify(source.countries || []),
      JSON.stringify(source.regions || []),
      JSON.stringify(source.jobCategories || []),
      source.integrationType,
      source.apiDocsUrl ?? null,
      source.authRequirements,
      JSON.stringify(source.configVars || []),
      source.usageRestrictions ?? null,
      source.attributionRequired ? 1 : 0,
      source.attributionText ?? null,
      source.paginationMethod,
      JSON.stringify(source.rateLimits || {}),
      source.syncFrequencyMinutes,
      source.implementationStatus,
      source.healthStatus,
      source.verificationStatus,
      source.isEnabled ? 1 : 0,
      source.notes ?? null,
      JSON.stringify(source.stats || {}),
      new Date().toISOString()
    );
  }

  updateSourceStatus(
    id: string,
    status: SourceImplementationStatus,
    health: SourceHealthStatus,
    lastError?: string
  ): void {
    const existing = this.getSource(id);
    if (!existing) return;
    const stats = { ...existing.stats };
    if (lastError) {
      stats.lastError = lastError;
      stats.consecutiveFailures = (stats.consecutiveFailures || 0) + 1;
    } else {
      stats.consecutiveFailures = 0;
    }
    const stmt = this.db.prepare(`
      UPDATE source_registry
      SET implementation_status = ?, health_status = ?, stats = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(status, health, JSON.stringify(stats), new Date().toISOString(), id);
  }

  toggleSourceEnabled(id: string, isEnabled: boolean): boolean {
    const stmt = this.db.prepare(`
      UPDATE source_registry
      SET is_enabled = ?, updated_at = ?
      WHERE id = ?
    `);
    const res = stmt.run(isEnabled ? 1 : 0, new Date().toISOString(), id);
    return res.changes > 0;
  }

  recordSourceSync(
    id: string,
    retrieved: number,
    valid: number,
    duplicates: number,
    success: boolean,
    error?: string
  ): void {
    const existing = this.getSource(id);
    if (!existing) return;
    const now = new Date().toISOString();
    const stats = {
      ...existing.stats,
      lastSyncAt: now,
      jobsRetrieved: (existing.stats.jobsRetrieved || 0) + retrieved,
      validJobsRetrieved: (existing.stats.validJobsRetrieved || 0) + valid,
      duplicatesRemoved: (existing.stats.duplicatesRemoved || 0) + duplicates,
    };
    let health: SourceHealthStatus = existing.healthStatus;
    if (success) {
      stats.lastSuccessAt = now;
      stats.consecutiveFailures = 0;
      stats.lastError = undefined;
      health = 'HEALTHY';
    } else {
      stats.consecutiveFailures = (stats.consecutiveFailures || 0) + 1;
      stats.lastError = error;
      health = stats.consecutiveFailures >= 3 ? 'UNHEALTHY' : 'DEGRADED';
    }
    const stmt = this.db.prepare(`
      UPDATE source_registry
      SET stats = ?, health_status = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(JSON.stringify(stats), health, now, id);
  }

  getSourceRegistrySummary(): SourceRegistrySummary {
    const all = this.listSources();
    const byCategory: Record<JobSourceCategory, number> = {
      INDIAN_PORTALS: 0,
      INTERNATIONAL_BOARDS: 0,
      REMOTE_EMPLOYMENT: 0,
      STARTUP_GROWTH: 0,
      SPECIALIST_TECH: 0,
      FREELANCE_CONTRACT: 0,
      GOVERNMENT_PUBLIC: 0,
      ATS_PLATFORMS: 0,
      COMPANY_CAREERS: 0,
      ADDITIONAL_CHANNELS: 0,
    };

    const byImplementationStatus: Record<SourceImplementationStatus, number> = {
      IMPLEMENTED_AND_TESTED: 0,
      IMPLEMENTED_BUT_NOT_LIVE_VERIFIED: 0,
      REQUIRES_API_CREDENTIALS: 0,
      REQUIRES_PARTNER_ACCESS: 0,
      MANUAL_OR_LINK_ONLY: 0,
      TEMPORARILY_UNAVAILABLE: 0,
      DISABLED_BY_USER: 0,
      UNSUPPORTED: 0,
      RESTRICTED_BY_TERMS: 0,
    };

    const byHealthStatus: Record<SourceHealthStatus, number> = {
      HEALTHY: 0,
      DEGRADED: 0,
      UNHEALTHY: 0,
      UNTESTED: 0,
      REQUIRES_CONFIG: 0,
    };

    let totalJobsRetrieved = 0;
    let totalValidRetained = 0;
    let totalDuplicatesFiltered = 0;
    const countriesSet = new Set<string>();
    const regionsSet = new Set<string>();
    let lastGlobalSyncAt: string | undefined;

    for (const s of all) {
      if (byCategory[s.category] !== undefined) byCategory[s.category]++;
      if (byImplementationStatus[s.implementationStatus] !== undefined) byImplementationStatus[s.implementationStatus]++;
      if (byHealthStatus[s.healthStatus] !== undefined) byHealthStatus[s.healthStatus]++;

      totalJobsRetrieved += s.stats?.jobsRetrieved || 0;
      totalValidRetained += s.stats?.validJobsRetrieved || 0;
      totalDuplicatesFiltered += s.stats?.duplicatesRemoved || 0;

      s.countries.forEach(c => countriesSet.add(c));
      s.regions.forEach(r => regionsSet.add(r));

      if (s.stats?.lastSyncAt) {
        if (!lastGlobalSyncAt || s.stats.lastSyncAt > lastGlobalSyncAt) {
          lastGlobalSyncAt = s.stats.lastSyncAt;
        }
      }
    }

    return {
      totalSources: all.length,
      byCategory,
      byImplementationStatus,
      byHealthStatus,
      totalJobsRetrieved,
      totalValidRetained,
      totalDuplicatesFiltered,
      countriesCovered: Array.from(countriesSet).sort(),
      regionsCovered: Array.from(regionsSet).sort(),
      lastGlobalSyncAt,
    };
  }

  // Source Proposals
  listSourceProposals(status?: SourceProposal['validationStatus']): SourceProposal[] {
    let sql = 'SELECT * FROM source_proposals';
    const params: any[] = [];
    if (status) {
      sql += ' WHERE validation_status = ?';
      params.push(status);
    }
    sql += ' ORDER BY proposed_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      officialDomain: r.official_domain,
      category: r.category as JobSourceCategory,
      countriesCovered: JSON.parse(r.countries_covered || '[]'),
      evidenceDescription: r.evidence_description,
      apiOrFeedDocsUrl: r.api_or_feed_docs_url ?? undefined,
      accessRestrictions: r.access_restrictions ?? undefined,
      authRequirements: r.auth_requirements as any,
      estimatedIntegrationEffort: r.estimated_integration_effort as any,
      recommendedAdapterType: r.recommended_adapter_type as any,
      validationStatus: r.validation_status as any,
      proposedAt: r.proposed_at,
      reviewedAt: r.reviewed_at ?? undefined,
      reviewNotes: r.review_notes ?? undefined,
    }));
  }

  saveSourceProposal(p: SourceProposal): void {
    const stmt = this.db.prepare(`
      INSERT INTO source_proposals (
        id, name, official_domain, category, countries_covered,
        evidence_description, api_or_feed_docs_url, access_restrictions,
        auth_requirements, estimated_integration_effort, recommended_adapter_type,
        validation_status, proposed_at, reviewed_at, review_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        official_domain = excluded.official_domain,
        category = excluded.category,
        countries_covered = excluded.countries_covered,
        evidence_description = excluded.evidence_description,
        api_or_feed_docs_url = excluded.api_or_feed_docs_url,
        access_restrictions = excluded.access_restrictions,
        auth_requirements = excluded.auth_requirements,
        estimated_integration_effort = excluded.estimated_integration_effort,
        recommended_adapter_type = excluded.recommended_adapter_type,
        validation_status = excluded.validation_status,
        reviewed_at = excluded.reviewed_at,
        review_notes = excluded.review_notes
    `);

    stmt.run(
      p.id,
      p.name,
      p.officialDomain,
      p.category,
      JSON.stringify(p.countriesCovered || []),
      p.evidenceDescription,
      p.apiOrFeedDocsUrl ?? null,
      p.accessRestrictions ?? null,
      p.authRequirements,
      p.estimatedIntegrationEffort,
      p.recommendedAdapterType,
      p.validationStatus,
      p.proposedAt,
      p.reviewedAt ?? null,
      p.reviewNotes ?? null
    );
  }

  updateSourceProposal(id: string, status: SourceProposal['validationStatus'], notes?: string): void {
    const stmt = this.db.prepare(`
      UPDATE source_proposals
      SET validation_status = ?, review_notes = ?, reviewed_at = ?
      WHERE id = ?
    `);
    stmt.run(status, notes ?? null, new Date().toISOString(), id);
  }

  // Saved Searches and Preferences
  listSavedSearches(userId: string = 'default_user'): SavedSearch[] {
    const stmt = this.db.prepare(`
      SELECT * FROM saved_searches 
      WHERE user_id = ? 
      ORDER BY is_default DESC, updated_at DESC
    `);
    const rows = stmt.all(userId) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      filters: JSON.parse(r.filters_json || '{}'),
      isDefault: Boolean(r.is_default),
      alertsEnabled: Boolean(r.alerts_enabled),
      scheduledSearchEnabled: Boolean(r.scheduled_search_enabled),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastRunAt: r.last_run_at ?? undefined,
      lastResultsCount: r.last_results_count ?? 0
    }));
  }

  getSavedSearch(id: string, userId: string = 'default_user'): SavedSearch | null {
    const stmt = this.db.prepare(`
      SELECT * FROM saved_searches 
      WHERE id = ? AND user_id = ?
    `);
    const r = stmt.get(id, userId) as any;
    if (!r) return null;
    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      filters: JSON.parse(r.filters_json || '{}'),
      isDefault: Boolean(r.is_default),
      alertsEnabled: Boolean(r.alerts_enabled),
      scheduledSearchEnabled: Boolean(r.scheduled_search_enabled),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastRunAt: r.last_run_at ?? undefined,
      lastResultsCount: r.last_results_count ?? 0
    };
  }

  saveSavedSearch(search: SavedSearch): void {
    if (search.isDefault) {
      // Unset previous default for this user
      this.db.prepare('UPDATE saved_searches SET is_default = 0 WHERE user_id = ?').run(search.userId || 'default_user');
    }

    const stmt = this.db.prepare(`
      INSERT INTO saved_searches (
        id, user_id, name, filters_json, is_default, alerts_enabled, 
        scheduled_search_enabled, created_at, updated_at, last_run_at, last_results_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        filters_json = excluded.filters_json,
        is_default = excluded.is_default,
        alerts_enabled = excluded.alerts_enabled,
        scheduled_search_enabled = excluded.scheduled_search_enabled,
        updated_at = excluded.updated_at,
        last_run_at = COALESCE(excluded.last_run_at, saved_searches.last_run_at),
        last_results_count = COALESCE(excluded.last_results_count, saved_searches.last_results_count)
    `);

    stmt.run(
      search.id,
      search.userId || 'default_user',
      search.name,
      JSON.stringify(search.filters || {}),
      search.isDefault ? 1 : 0,
      search.alertsEnabled ? 1 : 0,
      search.scheduledSearchEnabled ? 1 : 0,
      search.createdAt,
      search.updatedAt,
      search.lastRunAt ?? null,
      search.lastResultsCount ?? 0
    );
  }

  deleteSavedSearch(id: string, userId: string = 'default_user'): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM saved_searches 
      WHERE id = ? AND user_id = ?
    `);
    const res = stmt.run(id, userId);
    return (res.changes ?? 0) > 0;
  }

  setDefaultSavedSearch(id: string, userId: string = 'default_user'): void {
    this.db.prepare('UPDATE saved_searches SET is_default = 0 WHERE user_id = ?').run(userId);
    this.db.prepare('UPDATE saved_searches SET is_default = 1, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(new Date().toISOString(), id, userId);
  }

  duplicateSavedSearch(id: string, newName?: string, userId: string = 'default_user'): SavedSearch | null {
    const original = this.getSavedSearch(id, userId);
    if (!original) return null;

    const copy: SavedSearch = {
      ...original,
      id: randomUUID(),
      name: newName || `${original.name} (Copy)`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRunAt: undefined,
      lastResultsCount: 0
    };

    this.saveSavedSearch(copy);
    return copy;
  }

  recordSavedSearchRun(id: string, resultsCount: number, userId: string = 'default_user'): void {
    this.db.prepare(`
      UPDATE saved_searches
      SET last_run_at = ?, last_results_count = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(new Date().toISOString(), resultsCount, new Date().toISOString(), id, userId);
  }

  close(): void {
    try {
      this.db.close();
    } catch {}
  }
}
