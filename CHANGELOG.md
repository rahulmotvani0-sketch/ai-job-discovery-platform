# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-27

### Security & Hardening
- **Constant-Time Token Comparison**: Implemented fixed-length SHA-256 constant-time secret comparison via `crypto.timingSafeEqual` in `src/core/security.ts`, eliminating timing-attack vulnerabilities.
- **Production API Protection**: Enforced strict Bearer and X-API-Key authentication across all sensitive endpoints in production mode while maintaining single-operator simplicity in local development.
- **Fail-Closed Configuration**: Added typed validation schema refusing boot if `API_AUTH_TOKEN` is shorter than 32 characters or if wildcard CORS is configured in production.
- **Enhanced SSRF Defense**: Hardened `validateSafeUrl` to reject IPv6 mapped addresses, loopbacks, link-local addresses, decimal/hex IPs, internal domains, and cloud metadata endpoints.
- **OAuth CSRF Protection**: Added cryptographically secure single-use state tokens with 10-minute TTL and verification in `GoogleOAuthManager`.
- **Restricted Token Permissions**: Enforced `0o600` permissions on OAuth token files.
- **Deep Redaction**: Added recursive deep sanitization in logger to scrub sensitive credentials, passwords, tokens, and personal resume texts from logs.

### Reliability & Resilience
- **Database Transactions**: Added `transaction<T>()` with `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` support to `DatabaseManager` ensuring atomic multi-record updates.
- **SQLite Concurrency & Timeout**: Configured `PRAGMA busy_timeout = 5000` and `PRAGMA journal_mode = WAL` to prevent `SQLITE_BUSY` crashes.
- **Database Integrity & Migrations**: Added `PRAGMA integrity_check` verification and `schema_migrations` tracking table.
- **Scheduler Mutex**: Implemented mutual exclusion in `JobScheduler.executeSingleRun` to eliminate overlapping discovery scans and duplicate draft generation.
- **Graceful Shutdown**: Added drain timeouts, `closeIdleConnections()`, and clean SIGTERM/SIGINT signal handling.
- **Startup Probe**: Added `/health/startup` probe alongside `/health/live` and `/health/ready`.

### Deployment & Open Source
- **Systemd Hardening**: Updated `deploy/job-platform.service` with least-privilege service account, `ProtectSystem=strict`, `ProtectHome=true`, resource limits, and shutdown timeouts.
- **Preflight Script**: Created `scripts/preflight-check.mjs` verifying Node.js version, directory write permissions, environment configuration, and database integrity.
- **Open Source Governance**: Added Apache-2.0 `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, and issue templates.

## [1.0.0] - Initial Release
- Multi-source ATS discovery connectors (Ashby, Lever, SmartRecruiters, Greenhouse, Workable, Recruitee, RemoteOK, Remotive).
- Resume parsing and AI-powered match scoring with deterministic and LLM-assisted verification.
- Approval gatekeeper ensuring zero automated email submissions without explicit user confirmation.
- Google integrations for Gmail drafts, Google Drive PDF storage, and Google Sheets tracking.
- Web dashboard with real-time pipeline status and dark-mode aesthetics.
